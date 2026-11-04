-- ────────────────────────────────────────────────────────────────────────
-- 0007 — Commentaires et annotations.
--
-- Un commentaire porte sur une carte d'un tableau de bord (« baisse due à la grève du 12 ») ;
-- tous ceux qui ouvrent le tableau le lisent et y répondent.
-- Une annotation marque une date — ou une période — d'une courbe : elle s'attache à une
-- question enregistrée (visible partout où elle s'affiche) ou à une carte qui garde sa requête.
--
-- Appliquée au démarrage, dans sa propre transaction, après toutes les précédentes.
-- Ni transaction explicite, ni CREATE INDEX CONCURRENTLY : elle s'exécute déjà dans une.
-- Une fois publiée, elle ne change plus : la correction va dans la suivante.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS card_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES dashboard(id) ON DELETE CASCADE,
  card_id text NOT NULL,
  user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
CREATE INDEX IF NOT EXISTS card_comment_dashboard_idx ON card_comment (dashboard_id, card_id, created_at);

CREATE TABLE IF NOT EXISTS annotation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  question_id uuid REFERENCES question(id) ON DELETE CASCADE,
  dashboard_id uuid REFERENCES dashboard(id) ON DELETE CASCADE,
  card_id text,
  at date NOT NULL,
  end_at date,
  label text NOT NULL,
  color text,
  user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (question_id IS NOT NULL OR (dashboard_id IS NOT NULL AND card_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS annotation_question_idx ON annotation (question_id);
CREATE INDEX IF NOT EXISTS annotation_dashboard_idx ON annotation (dashboard_id);
