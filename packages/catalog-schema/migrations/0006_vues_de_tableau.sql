-- ────────────────────────────────────────────────────────────────────────
-- 0006 — Les vues enregistrées d'un tableau de bord : des filtres et un onglet gardés sous un
-- nom (« Bretagne, mois en cours »), retrouvés d'un clic — les signets de Qlik.
--
-- Une vue est à son auteur ; partagée, toute personne qui ouvre le tableau la voit. Une vue
-- par défaut s'applique à l'ouverture, pour son auteur (la sienne passe avant une partagée).
--
-- Appliquée au démarrage, dans sa propre transaction, après toutes les précédentes.
-- Ni transaction explicite, ni CREATE INDEX CONCURRENTLY : elle s'exécute déjà dans une.
-- Une fois publiée, elle ne change plus : la correction va dans la suivante.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dashboard_view (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES dashboard(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Les valeurs des filtres, par identifiant de filtre.
  filter_values jsonb NOT NULL DEFAULT '{}',
  tab text,
  shared boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboard_view_dashboard_idx ON dashboard_view (dashboard_id);
