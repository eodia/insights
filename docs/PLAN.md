# vibe-dashboard — Plan

> Application de BI « à la Metabase », construite avec les briques et l'UI de BaseDB (`C:\data\dev\basedb`) et les connecteurs multi-moteurs de dblumi (`C:\data\dev\dblumi`).
> Statut : **validé** — 2026-10-02 (décisions au §11).

---

## 1. Ce qu'on reprend, et d'où

L'exploration des deux projets a montré que BaseDB ne fournit qu'une partie du besoin :

| Besoin | Source | Remarque |
|---|---|---|
| Tableaux de bord : grille, cartes, filtres, onglets, cartes texte, partage | **BaseDB** | `contracts/src/analytics.ts`, `analytics/dashboard-view.tsx`, `lib/analytics/dashboard.ts` — quasi tel quel |
| Questions : SQL + éditeur visuel (notebook), visualisations ECharts | **BaseDB** | `charts.ts`, `echart.tsx`, `visualization.tsx`, `viz-settings.tsx`, `notebook.tsx` — le compilateur, lui, est à réécrire |
| Éditeur SQL : CodeMirror 6, variables `{{x}}` / `[[ … ]]`, formatage | **BaseDB** | `sql-editor.tsx`, `renderSql` — dialecte à changer |
| Grille de résultats virtualisée | **BaseDB** | `grid/data-grid.tsx` (`@tanstack/react-virtual`) à extraire de la logique d'édition |
| Auth : OIDC (jose + PKCE), mot de passe, sessions, CSRF, élévation, jetons d'API | **BaseDB** | `core/src/auth/*` — indépendant du moteur, réutilisable tel quel |
| Utilisateurs / groupes / rôle personnel, invitations, journal d'audit | **BaseDB** | schéma du catalogue repris, scopes à remapper |
| Partage public / membres / groupes, iframe `can_embed` | **BaseDB** | modèle « autorité de l'éditeur » repris |
| Copilot : transport LLM, quotas, journal, « proposer puis appliquer » | **BaseDB** | `ai-transport.ts`, `ai/draft.ts`, `dashboard-copilot.ts` |
| MCP (Streamable HTTP + relais stdio), doc intégrée | **BaseDB** | `apps/mcp`, `api-reference/api-docs.tsx` |
| Apparence des valeurs (couleur + picto), copie JSON des options, formats de nombre | **BaseDB** | `look.ts`, `option-icons.ts`, `OptionBadge`, `lib/options.ts`, `formats.ts` |
| Écran de connexion (split 5fr/7fr, animations, boutons OIDC) | **BaseDB** | `login.tsx`, `auth-layout.tsx` |
| Connexions aux 7 moteurs, chiffrement des secrets, introspection par moteur | **dblumi** (MIT) | `lib/drivers.ts`, `services/schema.service.ts`, `lib/crypto.ts` |
| Diagramme des relations (xyflow) | **dblumi** | `overview/ErdDiagram.tsx` |
| **Synchronisation du schéma, types sémantiques, formats date/heure** | **à construire** | n'existe ni dans BaseDB ni dans dblumi — modèle : admin « Data Model » de Metabase |
| **Modèles et métriques** | **à construire** | aucune couche sémantique dans BaseDB |
| Historique des requêtes, cache des résultats, rafraîchissement auto, jetons d'intégration signés | **à construire** | absents de BaseDB |

**Licence** : vibe-dashboard est sous **AGPL-3.0-or-later**, comme BaseDB, ce qui permet de reprendre son code librement. Le code de dblumi (MIT) est compatible.

---

## 2. Décision structurante : Trino comme moteur principal

### Décision : **toute requête utilisateur passe par Trino.** Les pilotes natifs servent uniquement à l'administration : test de connexion, introspection enrichie.

**Pourquoi c'est plus qu'une idée intéressante.** Le problème le plus dur du projet est d'appliquer les permissions colonne et ligne **au SQL libre** sur sept moteurs différents. BaseDB le résout avec les rôles et la RLS natifs de Postgres, ce qui ne se transpose pas. Trino le résout d'un coup :

- **Un seul dialecte** (Trino SQL) pour le compilateur du query builder, l'éditeur SQL, l'autocomplétion, le formatage et le copilot. Les LLM connaissent bien ce SQL ANSI.
- **Requêtes inter-bases** : `JOIN` entre Postgres et Snowflake, par exemple.
- **Connecteurs officiels** pour les 7 cibles : `postgresql`, `mysql`, `sqlserver`, `oracle`, `snowflake`, `mongodb`, et Trino lui-même.
- **Catalogues dynamiques** (`catalog.management=dynamic`) : `CREATE CATALOG pg_ventes USING postgresql WITH (...)` permet d'ajouter une base à chaud depuis l'UI.
- **Sécurité appliquée par le moteur** grâce au plugin *OPA access control*. Trino interroge des URIs HTTP pour :
  - autoriser l'accès (`opa.policy.uri`, ou sa variante batch) ;
  - obtenir les filtres de lignes (`opa.policy.row-filters-uri`) ;
  - obtenir les masques de colonnes (`opa.policy.column-masking-uri`).

  → **Notre API est elle-même le point de décision** : un endpoint qui imite les réponses d'OPA, servi depuis un instantané des permissions en mémoire (le `decide()` pur de BaseDB). Il n'y a pas de serveur OPA à déployer. Chaque requête part avec `X-Trino-User = <id utilisateur>`, et les permissions sont donc appliquées partout : SQL libre, builder, copilot, API, MCP.

**Coûts et risques, assumés :**

| Risque | Parade |
|---|---|
| Service JVM à opérer, au moins 2–4 Go de RAM | Un seul conteneur coordinateur+worker en standard, cluster optionnel |
| Latence de +50 à 200 ms par requête | Cache de métadonnées Trino, cache de résultats applicatif, modèles persistés (§6) ; *pushdown* des agrégations sur PG/MySQL/SQL Server/Oracle/Snowflake |
| Les utilisateurs écrivent du Trino SQL, pas le dialecte natif | Mode **SQL natif** via les fonctions table `system.query(...)`, réservé aux personnes sans restriction ligne/colonne (même règle que Metabase avec le *sandboxing*) |
| Trino n'expose ni les FK, ni les commentaires, ni les volumétries | Introspection complémentaire par pilote natif (code dblumi) lors de la synchro |
| MongoDB est exposé avec un schéma inféré et des documents imbriqués en `ROW` | Acceptable en v1 ; aplatissement des sous-documents dans l'écran Structure |
| Les secrets vivraient dans le *catalog store* de Trino | `catalog.store=memory` : **l'application est la source de vérité**. Elle stocke les secrets chiffrés (AES-256-GCM) et recrée les catalogues au démarrage de Trino. Trino reste sans état |

**À valider en phase 0 par un spike** : catalogues dynamiques, endpoint OPA « maison » (allow + row filter + column mask), connecteurs Snowflake et MongoDB, latence.

---

## 3. Stack — alignée sur BaseDB

- **Monorepo** pnpm + Turborepo, Biome, TypeScript strict, Node ≥ 22.
- **Web** : Next.js (App Router) + React 19, Tailwind v4, shadcn/ui (Radix), lucide, zustand, CodeMirror 6, ECharts 6, react-grid-layout 2, @tanstack/react-virtual, tiptap pour les cartes texte, @xyflow/react pour le diagramme.
- **API** : Hono sur `@hono/node-server`, avec **zod + `@hono/zod-openapi`** (comme dblumi). L'OpenAPI est générée depuis les routes et alimente à la fois la doc intégrée et le SDK.
- **Catalogue applicatif** : PostgreSQL, `pg` brut, migrations SQL numérotées et scellées par somme de contrôle (pattern BaseDB `pnpm catalog`).
- **Moteur de requêtes** : Trino (`trino-client`).
- **Pilotes natifs** (admin uniquement) : `pg`, `mysql2`, `mssql`, `oracledb`, `snowflake-sdk`, `mongodb`.
- **LLM** : couche fournisseur BaseDB (Anthropic, OpenAI, Mistral, compatible OpenAI) **étendue** avec l'appel d'outils natif et le streaming SSE. BaseDB ne streame pas, ce qui pénaliserait un copilot analytique. Claude Sonnet 5.5 par défaut, modèle configurable.
- **MCP** : SDK officiel TypeScript, transport Streamable HTTP, plus le relais stdio de BaseDB.
- **i18n** : convention BaseDB, `$t('phrase française')` avec extraction.
- **Tests** : Vitest (unitaires + intégration Testcontainers Postgres **et Trino**), Playwright pour l'e2e.
- **Déploiement** : image Docker unique, Caddy en frontal, `docker-compose` avec postgres, trino et l'application.

```
apps/
  web/        Next.js — UI
  api/        Hono — REST /api/v1 + endpoints auth + endpoint OPA interne
  mcp/        serveur MCP
  worker/     jobs : synchro schéma, scan de valeurs, rafraîchissements, cache
packages/
  contracts/  types partagés (repris de basedb/contracts/analytics.ts)
  core/       logique métier : auth, rbac, catalog, query, ai, sync
  catalog-schema/  migrations SQL du catalogue
  engine/     Trino : catalogues dynamiques, exécution, annulation, mapping des types
  drivers/    pilotes natifs : test + introspection enrichie
  compiler/   requête builder → Trino SQL ; règles de ligne → SQL
  sdk/        client TS généré depuis l'OpenAPI
```

---

## 4. Modèle de domaine (catalogue)

**Instance unique** : une seule organisation par instance, sans notion de tenant. Les URLs sont donc `/api/v1/...` et non `/api/v1/:tenant/...`. Les colonnes `tenant_id` de BaseDB disparaissent, et les réglages sont ceux de l'instance.

**Identité et accès**
- `app_user`, `auth_identity`, `session`, `api_token` : repris de BaseDB, sans tenant.
- `group`, `group_member` : groupes système *Administrateurs* et *Tous les utilisateurs*.
- `user_attribute` : clé/valeur, alimentés par les claims OIDC ou saisis à la main ; servent aux règles de ligne (`region = {{user.region}}`).

**Données**
- `datasource` : moteur, nom du catalogue Trino, configuration et secret chiffré, planning de synchro, options (SQL natif autorisé, fuseau).
- `db_schema`, `db_table`, `db_column` : résultat de la synchro **plus** les métadonnées saisies par les utilisateurs (§5).
- `db_relation` : FK détectées ou déclarées à la main, indispensables pour MongoDB et Snowflake.
- `column_value` : valeurs distinctes des colonnes catégorielles, chacune avec son libellé, sa couleur, son picto ou son image.

**Contenu**
- `folder`, appelé **« Dossier »** dans l'UI : arborescence, comme les collections de Metabase. Chaque utilisateur a un **dossier personnel**, privé par défaut. Des dossiers partagés sont créés par les personnes qui en ont le droit.
- `question` : `kind` = `builder` | `sql` | `native`, `query` en jsonb, `visualization` en jsonb, `type` = `question` | `model` | `metric`.
- `dashboard` : `tabs`, `cards`, `parameters` (format BaseDB), plus `auto_refresh` et `cache_ttl`.
- `snippet` : fragments SQL réutilisables.
- `query_execution` : historique (utilisateur, SQL réellement exécuté, durée, lignes, erreur, origine : éditeur, carte, API, MCP ou copilot).
- `result_cache`.

**Permissions** (additives, union des groupes)
- **Données** : `data_permission(group, scope = datasource | schema | table, access = none | read | restricted)` et `query_permission(group, datasource, level = none | builder | sql | native)`.
- **Colonnes** : `column_permission(group, column, access = hidden | masked | read)`, où `masked` renvoie `NULL` ou une valeur partielle.
- **Lignes** : `row_policy(group, table, filter)` avec le DSL de filtres de BaseDB et `{{user.*}}` ; compilées en SQL Trino et renvoyées à Trino par l'endpoint `row-filters`.
- **Contenu**, avec deux mécanismes qui se cumulent :
  - **droits de dossier** : `folder_permission(group, folder, access = none | view | edit | manage)`, hérités par les sous-dossiers sauf surcharge. `manage` permet de gérer les droits du dossier.
  - **partage d'élément** : `item_share(item_kind = question | dashboard | model | metric | folder, item_id, principal = user | group, access = view | edit)`. Cela correspond à l'« audience » de BaseDB, généralisée. On peut ainsi partager une question de son dossier personnel avec un collègue ou un groupe sans la déplacer.
  - L'accès effectif est l'union des droits du dossier parent, des partages directs et de la propriété. Un élément visible dont la source de données n'est pas lisible affiche « accès aux données refusé », jamais les données.
- **Administration** : gérer les sources, gérer les métadonnées, gérer les permissions.

**Partage**
- `share_link` : public ou membres (± groupes), jeton haché, exécution sous l'autorité de l'éditeur, `can_embed`.
- `embed_secret` : intégration signée (JWT HS256) avec paramètres verrouillés et attributs de l'utilisateur intégré, ce qui permet des filtres de ligne par visiteur.
- `invitation` : lien BaseDB **+ envoi d'e-mail** (SMTP).
- `audit_log` + écran de consultation.

---

## 5. Connexion d'une base → synchro → écran « Structure »

**Ajout d'une source.** On choisit le moteur, on remplit le formulaire de connexion, puis on teste via le pilote natif. Si le test passe :
1. `CREATE CATALOG` dans Trino ;
2. enregistrement en catalogue ;
3. lancement de **« Synchroniser le schéma de la base de données »**, un job asynchrone avec progression (SSE).

**La synchro, en trois passes** (comme Metabase) :
1. **Schéma** : `information_schema` Trino pour les schémas, tables et colonnes, plus le pilote natif pour PK, FK, commentaires et volumétrie estimée. Calcul d'un **diff** : nouveautés ajoutées, disparitions marquées « retirée » sans effacer les métadonnées, changements de type signalés. Planifiée (toutes les heures par défaut) et déclenchable à la main.
2. **Empreinte** : sur un échantillon, cardinalité, taux de nulls, min/max, longueur moyenne. Sert à **pré-deviner le type sémantique**.
3. **Valeurs** : valeurs distinctes des colonnes de faible cardinalité (≤ 1 000 par exemple), qui alimentent les listes de filtres et l'apparence des valeurs.

**Écran « Structure »** (mise en page de `schema-editor.tsx` de BaseDB) : arbre source → schéma → table à gauche, liste des colonnes à droite.

- **Table** : libellé, description, couleur et picto (`look.ts`), visibilité (normale, masquée, technique), colonne d'affichage, entité (*Commandes*, *Clients*…).
- **Colonne** :
  - libellé, description, visibilité ;
  - **type sémantique** ;
  - **format** :
    - nombre : entier, décimal, pourcentage, devise, durée, note, compact, préfixe/suffixe, séparateurs ;
    - date/heure : motif d'affichage, granularité par défaut, fuseau, date relative ;
  - cible de FK, unité.
- **Valeurs de liste** : libellé, couleur, picto ou image par valeur (`OptionBadge`, sélecteur d'icônes BaseDB).
- **Copier / coller en JSON** : configuration complète d'une colonne ou d'une table, et liste de valeurs. Cela étend le `JsonPanel` de BaseDB, qui ne copie que les options.
- **« Décrire avec le copilot »** : à partir des noms, des types, de l'empreinte et, avec consentement, d'un échantillon, le copilot propose descriptions, types sémantiques et formats pour toute une table. L'utilisateur accepte ou rejette chaque proposition.
- Onglet **Relations** : diagramme xyflow (dblumi) avec ajout manuel de relations.

**Types sémantiques proposés** :
- *Identité* : clé primaire, clé étrangère, nom d'entité, titre.
- *Catégorie* : catégorie, statut, booléen métier.
- *Texte* : description, commentaire, e-mail, URL, URL d'image, avatar, téléphone, JSON.
- *Géographie* : pays, région, ville, code postal, adresse, latitude, longitude.
- *Temps* : date de création, de mise à jour, d'événement, de naissance, d'annulation.
- *Mesure* : montant, prix, coût, remise, pourcentage, quantité, score, note, durée.

Toutes ces métadonnées alimentent : les visualisations automatiques, les formats d'affichage, les listes de filtres, les jointures implicites du builder (via les FK), et **le contexte du copilot**. BaseDB ne transmet pas les descriptions au copilot ; ici, si.

---

## 6. Requêtes, questions, modèles, métriques

- **Éditeur SQL** (`sql-editor.tsx` de BaseDB) :
  - dialecte Trino ;
  - autocomplétion depuis le catalogue synchronisé, avec un espace de noms `catalogue.schéma.table` filtré par les permissions ;
  - variables `{{x}}` et sections `[[ … ]]` ;
  - snippets, formatage, exécution de la sélection, **annulation** ;
  - onglets multiples ;
  - **historique** ;
  - erreur positionnée dans la gouttière.
- **Questions** :
  - `builder` : notebook BaseDB recompilé vers Trino SQL ; jointures implicites par FK, agrégations, ventilations temporelles, filtres, colonnes personnalisées ;
  - `sql` : SQL Trino ;
  - `native` : *pass-through* ;
  - visualisations BaseDB : table, nombre, tendance, jauge, barres, lignes, aires, combo, camembert, nuage de points, entonnoir, tableau croisé, carte ;
  - drill-through, sauvegarde dans un dossier.
- **Modèles** : une question (builder ou SQL) promue au rang de **table virtuelle curée**, avec métadonnées de colonnes (mêmes champs que l'écran Structure). Utilisable comme source dans le builder et visible du copilot comme une table.
- **Métriques** : agrégation nommée et réutilisable sur une table ou un modèle, avec filtres et dimension temporelle par défaut (exemple : « CA = somme(montant) où statut = payé »). Utilisable dans le builder, les cartes de tableau de bord, le copilot et la MCP.
- **Exécution** :
  - SQL généré, exécuté dans Trino sous l'identité de l'utilisateur ;
  - plafond de lignes (aperçu de 2 000, export plus large en streaming) ;
  - délai maximal ;
  - export CSV / XLSX / JSON.
- **Accélération**, en trois niveaux. Trino open source n'a pas de cache de résultats.
  1. **Réglages Trino par source** : l'application les pose dans le `CREATE CATALOG`, et ils sont modifiables dans un onglet « Avancé » de la source.
     - cache de métadonnées : `metadata.cache-ttl`, plus `metadata.schemas/tables/statistics.cache-ttl` et `metadata.cache-maximum-size`, ce qui accélère la planification ;
     - *pushdown* des agrégations et des jointures ;
     - filtrage dynamique.
     Le cache de fichiers (`fs.cache.*`) ne concerne que Hive, Iceberg et Delta, pas nos 7 sources.
  2. **Cache de résultats applicatif**, le gain principal pour les tableaux de bord :
     - clé = hash(SQL compilé + empreinte des permissions effectives), pour que deux personnes aux droits différents ne partagent jamais une entrée ;
     - TTL réglable au niveau de l'instance, de la source, de la question et du tableau de bord ;
     - option « durée adaptative » : TTL proportionnel au temps d'exécution, comme dans Metabase ;
     - stockage en Postgres, avec un LRU mémoire devant ;
     - **préchauffage** par le worker des tableaux de bord marqués « préchargés » ;
     - invalidation manuelle ;
     - badge « résultat du jj/mm hh:mm » avec bouton « Rafraîchir ».
  3. **Modèles persistés** (phase 6) : le résultat d'un modèle est matérialisé par Trino (`CREATE TABLE … AS SELECT`) dans un **catalogue de cache Postgres**, une base dédiée et non le catalogue applicatif. Il est rafraîchi selon un planning.
     - Idéal pour figer une jointure inter-bases coûteuse.
     - Le calcul se fait sous une identité de service, puis les règles de ligne et de colonne s'appliquent **sur la table persistée** via OPA.
     - Les modèles qui exposent des colonnes restreintes demandent une règle explicite avant d'être persistés.

---

## 7. Tableaux de bord

Repris de BaseDB :
- grille de 24 colonnes (react-grid-layout) ;
- cartes question, titre, texte riche avec `{{variables}}`, embed ;
- onglets ;
- paramètres de type date, catégorie, texte, nombre ou unité temporelle, reliés automatiquement aux colonnes (`autoMap`) ;
- clic sur un point pour filtrer ou explorer ;
- mode édition par brouillon ;
- copilot de tableau de bord.

Ajouts :
- **rafraîchissement automatique** ;
- cache ;
- plein écran ;
- duplication ;
- valeurs des filtres liées entre elles (filtre « ville » restreint par « pays ») ;
- abonnements e-mail ou Slack en **v2**.

---

## 8. Copilot IA

Un seul panneau, avec un contexte qui dépend de l'écran : éditeur SQL, question, tableau de bord ou Structure.

- **Outils**, en appel natif : `search_schema`, `describe_table` (descriptions, types sémantiques, valeurs, relations, métriques), `run_query` (lecture seule, sous les droits de l'utilisateur, avec consentement), `propose_question`, `propose_dashboard_edit`, `propose_metadata`.
- **Principe BaseDB conservé** : le modèle **propose**, l'utilisateur **applique**, et rien n'est écrit sans action humaine.
- Garde-fous :
  - la sécurité réelle est appliquée par Trino/OPA ;
  - pas d'accès aux colonnes masquées ;
  - quota horaire ;
  - journal des appels.
- Conversations persistées par utilisateur et par contexte. BaseDB ne les gardait qu'en mémoire.

---

## 9. API, MCP, documentation intégrée

- **REST** `/api/v1`, authentifiée par jeton de session court ou jeton d'intégration (`vdb_…`), avec rôle, périmètre et surfaces (`rest` / `mcp`), comme dans BaseDB. Endpoints :
  - sources et synchro ;
  - métadonnées ;
  - questions, modèles et métriques ;
  - exécution (question ou SQL) ;
  - tableaux de bord ;
  - dossiers et partages ;
  - permissions ;
  - partage.
- **OpenAPI 3.1** générée depuis zod, avec un SDK TypeScript généré à partir d'elle.
- **MCP**, servie par `apps/mcp` :
  - `list_datasources`, `search_schema`, `describe_table` ;
  - `list_metrics`, `query_metric` ;
  - `list_questions`, `run_question` ;
  - `run_sql`, en lecture seule, Trino, sous les droits du jeton ;
  - `get_dashboard`.
- **Doc intégrée** : visionneuse en trois colonnes de BaseDB (`api-docs.tsx`), alimentée par l'OpenAPI et la liste des outils MCP, filtrée par les droits du lecteur, avec création de jeton depuis la doc.

---

## 10. Phasage

| Phase | Contenu | Livrable vérifiable |
|---|---|---|
| **0. Socle et spike** | Monorepo, docker-compose (postgres + trino), migrations du catalogue, auth (OIDC + mot de passe + login BaseDB), shell de l'UI (sidebar, thème, i18n). **Spike Trino** : catalogue dynamique, endpoint OPA allow + row filter + column mask, connecteurs Snowflake et MongoDB | Connexion via Keycloak ; une requête Trino filtrée par une règle de ligne servie par notre API |
| **1. Sources et Structure** | Formulaires des 7 moteurs, test, chiffrement, synchro en 3 passes + diff + planification, écran Structure complet (types sémantiques, formats, apparence, JSON), diagramme des relations | Brancher une base Postgres et une MongoDB, les décrire, copier/coller une configuration |
| **2. SQL et questions SQL** | Éditeur SQL Trino, grille virtualisée, variables, snippets, historique, annulation, visualisations, sauvegarde dans les dossiers, export | Écrire une requête inter-bases, la visualiser, la sauvegarder |
| **3. Builder** | Notebook → Trino SQL, jointures par FK, drill-through, visualisation automatique depuis les types sémantiques | Une question construite sans SQL sur deux sources |
| **4. Tableaux de bord** | Grille, cartes, paramètres, onglets, texte, rafraîchissement, cache | Un tableau de bord filtré de bout en bout |
| **5. Permissions et partage** | Groupes, attributs, permissions données / colonnes / lignes (UI + OPA), droits de dossier, partage d’élément, lien public, membres, iframe, intégration signée, invitations e-mail, journal d'audit | Deux utilisateurs voient des lignes et colonnes différentes sur le même tableau de bord, y compris en SQL libre |
| **6. Modèles et métriques** | Promotion en modèle, métadonnées de modèle, métriques dans le builder et les cartes | Une métrique « CA » réutilisée dans 3 cartes |
| **7. Copilot** | Panneau, outils, streaming, « décrire le schéma », générer une question ou un tableau de bord | Le copilot décrit une table puis construit un tableau de bord |
| **8. API, MCP, doc** | OpenAPI, jetons d'intégration, SDK, serveur MCP, doc intégrée | Claude Desktop interroge une métrique via MCP |

Le modèle de permissions et l'endpoint OPA existent **dès la phase 0** ; seules l'UI et la finesse arrivent en phase 5. On n'ajoute pas la sécurité après coup.

---

## 11. Décisions (2026-10-02)

1. **Trino** est le moteur unique d'exécution. Les pilotes natifs ne servent qu'au test de connexion et à l'introspection enrichie.
2. **Licence AGPL-3.0-or-later**, et reprise libre du code BaseDB.
3. **Organisation du contenu** : des **Dossiers** (collections à la Metabase) **et** le partage d'élément à des utilisateurs ou des groupes, qui se cumulent (§4).
4. **Pas de multi-organisation** : une instance égale une organisation.

Reste ouvert : le nom définitif du produit (`vibe-dashboard` provisoirement).
