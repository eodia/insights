-- ────────────────────────────────────────────────────────────────────────
-- 0008 — Abonnements et alertes.
--
-- Un abonnement envoie un tableau de bord selon un calendrier (« chaque lundi à 8 h »), en PDF,
-- en image ou en résumé écrit, par e-mail à des personnes de l'espace et dans des canaux Teams
-- ou Slack. Une alerte vérifie une question à intervalle et prévient quand elle dit ce qu'on
-- attend (« le CA du jour passe sous 10 k€ », « des lignes reviennent »).
-- Les adresses des canaux (webhooks) sont chiffrées comme les secrets des sources.
-- Chaque envoi laisse une ligne dans delivery ; une image postée dans un canal est servie,
-- un mois, depuis delivery_file par une adresse à jeton.
--
-- Appliquée au démarrage, dans sa propre transaction, après toutes les précédentes.
-- Ni transaction explicite, ni CREATE INDEX CONCURRENTLY : elle s'exécute déjà dans une.
-- Une fois publiée, elle ne change plus : la correction va dans la suivante.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  dashboard_id uuid NOT NULL REFERENCES dashboard(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  schedule jsonb NOT NULL,
  format text NOT NULL,
  options jsonb NOT NULL DEFAULT '{}',
  filter_values jsonb NOT NULL DEFAULT '{}',
  recipients uuid[] NOT NULL DEFAULT '{}',
  message text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_dashboard_idx ON subscription (dashboard_id);
CREATE INDEX IF NOT EXISTS subscription_due_idx ON subscription (next_run_at) WHERE enabled;

CREATE TABLE IF NOT EXISTS alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  condition jsonb NOT NULL,
  schedule jsonb NOT NULL,
  mode text NOT NULL DEFAULT 'change',
  email boolean NOT NULL DEFAULT true,
  message text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  triggered boolean NOT NULL DEFAULT false,
  last_value double precision,
  checked_at timestamptz,
  notified_at timestamptz,
  next_run_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_question_idx ON alert (question_id);
CREATE INDEX IF NOT EXISTS alert_due_idx ON alert (next_run_at) WHERE enabled;

-- Les canaux d'un abonnement ou d'une alerte : l'adresse du webhook, chiffrée.
CREATE TABLE IF NOT EXISTS delivery_channel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES subscription(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES alert(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  url_enc bytea NOT NULL,
  position int NOT NULL DEFAULT 0,
  CHECK ((subscription_id IS NULL) <> (alert_id IS NULL))
);
CREATE INDEX IF NOT EXISTS delivery_channel_subscription_idx ON delivery_channel (subscription_id);
CREATE INDEX IF NOT EXISTS delivery_channel_alert_idx ON delivery_channel (alert_id);

CREATE TABLE IF NOT EXISTS delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES subscription(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES alert(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  error text
);
CREATE INDEX IF NOT EXISTS delivery_subscription_idx ON delivery (subscription_id, at DESC);
CREATE INDEX IF NOT EXISTS delivery_alert_idx ON delivery (alert_id, at DESC);

CREATE TABLE IF NOT EXISTS delivery_file (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  mime text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_file_created_idx ON delivery_file (created_at);
