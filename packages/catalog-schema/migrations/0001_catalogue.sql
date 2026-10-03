-- eodia insights — catalogue applicatif, version initiale.
-- Une instance = une organisation : aucune colonne tenant_id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ── Identité ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text,
  color text,
  locale text NOT NULL DEFAULT 'fr',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS auth_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  provider text NOT NULL,
  subject text NOT NULL,
  claims jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);

CREATE TABLE IF NOT EXISTS session (
  id text PRIMARY KEY,                 -- sha256 du jeton
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  elevated_until timestamptz,
  user_agent text,
  ip text
);
CREATE INDEX IF NOT EXISTS session_user_idx ON session (user_id);

CREATE TABLE IF NOT EXISTS api_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  surfaces text[] NOT NULL DEFAULT '{rest,mcp}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS user_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'custom' CHECK (kind IN ('admin', 'all', 'custom')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_group_system_idx ON user_group (kind) WHERE kind <> 'custom';

CREATE TABLE IF NOT EXISTS group_member (
  group_id uuid NOT NULL REFERENCES user_group(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_attribute (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'oidc')),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  name text,
  token_hash text NOT NULL UNIQUE,
  groups uuid[] NOT NULL DEFAULT '{}',
  invited_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  emailed_at timestamptz
);

CREATE TABLE IF NOT EXISTS admin_right (
  group_id uuid NOT NULL REFERENCES user_group(id) ON DELETE CASCADE,
  right_name text NOT NULL CHECK (right_name IN ('manage_sources', 'manage_metadata', 'manage_permissions')),
  PRIMARY KEY (group_id, right_name)
);

-- ── Données ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS datasource (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  engine text NOT NULL,
  catalog text NOT NULL UNIQUE,
  description text,
  config jsonb NOT NULL DEFAULT '{}',
  secret bytea,
  secret_keys text[] NOT NULL DEFAULT '{}',
  options jsonb NOT NULL DEFAULT '{}',
  schedule text NOT NULL DEFAULT 'hourly' CHECK (schedule IN ('hourly', 'daily', 'manual')),
  sync_status text NOT NULL DEFAULT 'never',
  sync_error text,
  last_sync_at timestamptz,
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS db_schema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  datasource_id uuid NOT NULL REFERENCES datasource(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  UNIQUE (datasource_id, name)
);

CREATE TABLE IF NOT EXISTS db_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  datasource_id uuid NOT NULL REFERENCES datasource(id) ON DELETE CASCADE,
  schema_name text NOT NULL,
  name text NOT NULL,
  label text NOT NULL,
  description text,
  native_comment text,
  visibility text NOT NULL DEFAULT 'normal' CHECK (visibility IN ('normal', 'hidden', 'technical')),
  entity text,
  color text,
  icon text,
  display_column text,
  row_count bigint,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (datasource_id, schema_name, name)
);

CREATE TABLE IF NOT EXISTS db_column (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES db_table(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL,
  data_type text NOT NULL,
  native_type text,
  label text NOT NULL,
  description text,
  native_comment text,
  visibility text NOT NULL DEFAULT 'normal' CHECK (visibility IN ('normal', 'hidden', 'technical')),
  semantic_type text,
  semantic_source text NOT NULL DEFAULT 'guess' CHECK (semantic_source IN ('guess', 'user', 'copilot')),
  format jsonb NOT NULL DEFAULT '{}',
  unit text,
  is_pk boolean NOT NULL DEFAULT false,
  nullable boolean NOT NULL DEFAULT true,
  fingerprint jsonb,
  has_values boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  type_changed_from text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id, name)
);

CREATE TABLE IF NOT EXISTS db_relation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_column_id uuid NOT NULL REFERENCES db_column(id) ON DELETE CASCADE,
  to_column_id uuid NOT NULL REFERENCES db_column(id) ON DELETE CASCADE,
  origin text NOT NULL DEFAULT 'detected' CHECK (origin IN ('detected', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_column_id)
);

CREATE TABLE IF NOT EXISTS column_value (
  column_id uuid NOT NULL REFERENCES db_column(id) ON DELETE CASCADE,
  value text NOT NULL,
  label text,
  color text,
  icon text,
  image_url text,
  position int NOT NULL DEFAULT 0,
  count bigint,
  PRIMARY KEY (column_id, value)
);

-- ── Contenu ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS folder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES folder(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text,
  icon text,
  personal_owner_id uuid UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES folder(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'question' CHECK (type IN ('question', 'model', 'metric')),
  kind text NOT NULL CHECK (kind IN ('builder', 'sql', 'native')),
  name text NOT NULL,
  description text,
  query jsonb NOT NULL,
  visualization jsonb NOT NULL DEFAULT '{"type":"table"}',
  columns_meta jsonb,
  cache_ttl int,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS question_folder_idx ON question (folder_id);

CREATE TABLE IF NOT EXISTS dashboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES folder(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  tabs jsonb NOT NULL DEFAULT '[]',
  cards jsonb NOT NULL DEFAULT '[]',
  parameters jsonb NOT NULL DEFAULT '[]',
  auto_refresh int,
  cache_ttl int,
  preload boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboard_folder_idx ON dashboard (folder_id);

CREATE TABLE IF NOT EXISTS snippet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  content text NOT NULL,
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookmark (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  item_kind text NOT NULL,
  item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_kind, item_id)
);

CREATE TABLE IF NOT EXISTS recent_view (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  item_kind text NOT NULL,
  item_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_kind, item_id)
);

-- ── Exécution ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS query_execution (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  origin text NOT NULL,
  question_id uuid,
  dashboard_id uuid,
  sql text NOT NULL,
  trino_query_id text,
  duration_ms int NOT NULL DEFAULT 0,
  row_count int,
  error text,
  cached boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS query_execution_user_idx ON query_execution (user_id, at DESC);

CREATE TABLE IF NOT EXISTS result_cache (
  key text PRIMARY KEY,
  payload jsonb NOT NULL,
  bytes int NOT NULL,
  duration_ms int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS result_cache_expiry_idx ON result_cache (expires_at);

-- ── Permissions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_permission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES user_group(id) ON DELETE CASCADE,
  datasource_id uuid NOT NULL REFERENCES datasource(id) ON DELETE CASCADE,
  schema_name text,
  table_id uuid REFERENCES db_table(id) ON DELETE CASCADE,
  access text NOT NULL CHECK (access IN ('none', 'read', 'restricted'))
);
CREATE UNIQUE INDEX IF NOT EXISTS data_permission_scope_idx
  ON data_permission (group_id, datasource_id, coalesce(schema_name, ''), coalesce(table_id, '00000000-0000-0000-0000-000000000000'));

CREATE TABLE IF NOT EXISTS query_permission (
  group_id uuid NOT NULL REFERENCES user_group(id) ON DELETE CASCADE,
  datasource_id uuid NOT NULL REFERENCES datasource(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('none', 'builder', 'sql', 'native')),
  PRIMARY KEY (group_id, datasource_id)
);

CREATE TABLE IF NOT EXISTS column_permission (
  group_id uuid NOT NULL REFERENCES user_group(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES db_column(id) ON DELETE CASCADE,
  access text NOT NULL CHECK (access IN ('hidden', 'masked', 'read')),
  mask text,
  PRIMARY KEY (group_id, column_id)
);

CREATE TABLE IF NOT EXISTS row_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES user_group(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES db_table(id) ON DELETE CASCADE,
  match text NOT NULL DEFAULT 'all' CHECK (match IN ('all', 'any')),
  conditions jsonb NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, table_id)
);

CREATE TABLE IF NOT EXISTS folder_permission (
  group_id uuid NOT NULL REFERENCES user_group(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL REFERENCES folder(id) ON DELETE CASCADE,
  access text NOT NULL CHECK (access IN ('none', 'view', 'edit', 'manage')),
  PRIMARY KEY (group_id, folder_id)
);

CREATE TABLE IF NOT EXISTS item_share (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_kind text NOT NULL CHECK (item_kind IN ('question', 'model', 'metric', 'dashboard', 'folder')),
  item_id uuid NOT NULL,
  principal_kind text NOT NULL CHECK (principal_kind IN ('user', 'group')),
  principal_id uuid NOT NULL,
  access text NOT NULL CHECK (access IN ('view', 'edit')),
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_kind, item_id, principal_kind, principal_id)
);

-- ── Partage ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS share_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_kind text NOT NULL CHECK (item_kind IN ('question', 'dashboard')),
  item_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  audience text NOT NULL DEFAULT 'public' CHECK (audience IN ('public', 'members')),
  groups uuid[] NOT NULL DEFAULT '{}',
  can_embed boolean NOT NULL DEFAULT false,
  locked_parameters jsonb NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS embed_secret (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  secret bytea NOT NULL,
  -- Le groupe dont les visiteurs intégrés prennent les droits (et les règles de ligne).
  group_id uuid NOT NULL REFERENCES user_group(id) ON DELETE CASCADE,
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_kind text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}',
  ip text
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at DESC);

-- ── Copilot ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_conversation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  context_kind text NOT NULL,
  context_id text,
  title text NOT NULL DEFAULT '',
  messages jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_conversation_user_idx ON ai_conversation (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_call (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL,
  model text NOT NULL,
  context_kind text,
  input_tokens int,
  output_tokens int,
  tools text[] NOT NULL DEFAULT '{}',
  duration_ms int,
  error text
);
CREATE INDEX IF NOT EXISTS ai_call_user_idx ON ai_call (user_id, at DESC);

-- ── Jobs et réglages ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  progress jsonb NOT NULL DEFAULT '{"step":"","done":0,"total":0}',
  result jsonb,
  error text,
  dedupe_key text,
  run_after timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz
);
CREATE INDEX IF NOT EXISTS job_queue_idx ON job (status, run_after);
CREATE UNIQUE INDEX IF NOT EXISTS job_dedupe_idx ON job (dedupe_key) WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS instance_setting (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Groupes système.
INSERT INTO user_group (name, kind, description)
VALUES ('Administrateurs', 'admin', 'Tous les droits sur l''instance'),
       ('Tous les utilisateurs', 'all', 'Chaque personne de l''instance en fait partie')
ON CONFLICT DO NOTHING;
