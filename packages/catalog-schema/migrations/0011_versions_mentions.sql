-- ────────────────────────────────────────────────────────────────────────
-- 0011 — Les versions des tableaux de bord, et les mentions.
--
-- Chaque enregistrement d'un tableau de bord en garde l'état complet (nom, onglets, cartes,
-- filtres, thème, largeur) : on voit qui a changé quoi, on compare, on restaure — une
-- restauration est elle-même une nouvelle version, rien ne se perd.
-- Un commentaire ou une annotation peut interpeller quelqu'un (« @Marie ») : la personne
-- mentionnée, si elle peut ouvrir ce dont il est question, en est avertie dans l'application
-- (et par e-mail quand un serveur SMTP est configuré).
--
-- Appliquée au démarrage, dans sa propre transaction, après toutes les précédentes.
-- Ni transaction explicite, ni CREATE INDEX CONCURRENTLY : elle s'exécute déjà dans une.
-- Une fois publiée, elle ne change plus : la correction va dans la suivante.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dashboard_version (
  id bigserial PRIMARY KEY,
  dashboard_id uuid NOT NULL REFERENCES dashboard(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboard_version_dashboard_idx ON dashboard_version (dashboard_id, id DESC);

CREATE TABLE IF NOT EXISTS notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  kind text NOT NULL,
  actor_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  dashboard_id uuid REFERENCES dashboard(id) ON DELETE CASCADE,
  question_id uuid REFERENCES question(id) ON DELETE CASCADE,
  card_id text,
  excerpt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS notification_user_idx ON notification (user_id, created_at DESC);
