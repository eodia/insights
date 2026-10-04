-- ────────────────────────────────────────────────────────────────────────
-- 0004 — Espaces : une instance, plusieurs espaces de travail (les équipes, les filiales d'une
-- même entreprise). Les personnes restent celles de l'instance et appartiennent à un ou
-- plusieurs espaces, membre ou administrateur. Chaque espace a ses sources, ses dossiers et
-- leur contenu, ses groupes et leurs droits, ses extraits SQL, ses liens, ses jetons ; une
-- source peut être partagée, en lecture, avec d'autres espaces. Le groupe « Administrateurs »
-- reste celui de l'instance : il voit tous les espaces.
--
-- Tout ce qui existe rejoint l'espace « Principal », créé ici — sur une instance neuve aussi :
-- il y a toujours au moins un espace.
--
-- Appliquée au démarrage, dans sa propre transaction, après toutes les précédentes.
-- Ni transaction explicite, ni CREATE INDEX CONCURRENTLY : elle s'exécute déjà dans une.
-- Une fois publiée, elle ne change plus : la correction va dans la suivante.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text,
  icon text,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_name_idx ON workspace (lower(name));

CREATE TABLE IF NOT EXISTS workspace_member (
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_member_user_idx ON workspace_member (user_id);

-- L'espace où la personne travaillait : celui où la ramène sa prochaine session.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE SET NULL;

-- Les sources : à un espace, et partagées en lecture avec d'autres.
ALTER TABLE datasource ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;
CREATE TABLE IF NOT EXISTS datasource_share (
  datasource_id uuid NOT NULL REFERENCES datasource(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (datasource_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS datasource_share_workspace_idx ON datasource_share (workspace_id);

-- Les groupes : ceux d'un espace ; « Administrateurs » seul reste à l'instance (sans espace).
-- Chaque espace a son groupe « Tous » ; un nom de groupe est unique dans son espace.
ALTER TABLE user_group ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS user_group_system_idx;
CREATE UNIQUE INDEX IF NOT EXISTS user_group_admin_idx ON user_group (kind) WHERE kind = 'admin';
CREATE UNIQUE INDEX IF NOT EXISTS user_group_all_idx ON user_group (workspace_id) WHERE kind = 'all';
ALTER TABLE user_group DROP CONSTRAINT IF EXISTS user_group_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_group_name_idx
  ON user_group (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- Le contenu : dossiers (un dossier personnel par personne et par espace), questions et
-- tableaux de bord, extraits SQL, liens de partage.
ALTER TABLE folder ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;
ALTER TABLE folder DROP CONSTRAINT IF EXISTS folder_personal_owner_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS folder_personal_idx ON folder (workspace_id, personal_owner_id) WHERE personal_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS folder_workspace_idx ON folder (workspace_id);
ALTER TABLE question ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS question_workspace_idx ON question (workspace_id);
ALTER TABLE dashboard ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS dashboard_workspace_idx ON dashboard (workspace_id);
ALTER TABLE snippet ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;
ALTER TABLE snippet DROP CONSTRAINT IF EXISTS snippet_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS snippet_name_idx ON snippet (workspace_id, name);
ALTER TABLE share_link ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;
-- Un thème sans espace sert partout ; ceux créés désormais appartiennent à leur espace.
ALTER TABLE theme ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;

-- Un jeton d'intégration agit dans un espace ; une invitation peut faire entrer dans un espace.
ALTER TABLE api_token ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;
ALTER TABLE invitation ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;
ALTER TABLE invitation ADD COLUMN IF NOT EXISTS workspace_role text NOT NULL DEFAULT 'member' CHECK (workspace_role IN ('admin', 'member'));

-- Conversations de l'assistant, exécutions et journal : dans l'espace où elles ont eu lieu.
ALTER TABLE ai_conversation ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;
ALTER TABLE query_execution ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS workspace_id uuid;

-- ── Reprise : l'espace « Principal » prend tout ce qui existe ────────────────
INSERT INTO workspace (name, description)
SELECT 'Principal', 'L’espace de départ de l’instance.'
WHERE NOT EXISTS (SELECT 1 FROM workspace);

UPDATE datasource SET workspace_id = (SELECT id FROM workspace ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE user_group SET workspace_id = (SELECT id FROM workspace ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL AND kind <> 'admin';
UPDATE folder SET workspace_id = (SELECT id FROM workspace ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE question SET workspace_id = (SELECT id FROM workspace ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE dashboard SET workspace_id = (SELECT id FROM workspace ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE snippet SET workspace_id = (SELECT id FROM workspace ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE share_link SET workspace_id = (SELECT id FROM workspace ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE api_token SET workspace_id = (SELECT id FROM workspace ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE ai_conversation SET workspace_id = (SELECT id FROM workspace ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE query_execution SET workspace_id = (SELECT id FROM workspace ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;

-- Chaque personne en devient membre ; les administrateurs de l'instance, administrateurs.
INSERT INTO workspace_member (workspace_id, user_id, role)
SELECT (SELECT id FROM workspace ORDER BY created_at LIMIT 1), u.id,
  CASE WHEN EXISTS (
    SELECT 1 FROM group_member m JOIN user_group g ON g.id = m.group_id WHERE m.user_id = u.id AND g.kind = 'admin'
  ) THEN 'admin' ELSE 'member' END
FROM app_user u
ON CONFLICT DO NOTHING;
UPDATE app_user SET workspace_id = (SELECT id FROM workspace ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;

-- Ce qui appartient à un espace en a toujours un.
ALTER TABLE datasource ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE folder ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE question ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE dashboard ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE snippet ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE share_link ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE api_token ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE ai_conversation ALTER COLUMN workspace_id SET NOT NULL;
