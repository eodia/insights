---
title: API REST
description: L’API /api/v1, ses jetons d’intégration eoi_…, sa spécification OpenAPI 3.1 et ce qu’elle couvre.
---

Tout ce que fait l’interface passe par l’**API REST** : l’interface n’a pas de route privée. Un
script, un outil de reporting ou votre propre application l’appellent de la même façon, sous les
droits du jeton qu’ils présentent.

| Adresse | Rôle |
|---|---|
| `https://bi.exemple.fr/api/v1/…` | l’API, servie derrière Caddy (en développement : `http://localhost:4100`, ou `http://localhost:3100`, qui relaie `/api/*`) |
| `/api/v1/openapi.json` | la spécification **OpenAPI 3.1**, générée depuis les schémas des routes |
| `/api/health` | l’état de l’API et de Trino, sans authentification |

La page **API et MCP** de l’application présente la même référence, filtrable, avec un exemple
`curl` et `fetch` pour chaque endpoint et un bouton pour télécharger la spécification.

## Les jetons

Un **jeton d’intégration** commence par `eoi_` et se passe dans l’en-tête `Authorization` :

```bash
curl https://bi.exemple.fr/api/v1/me \
  -H "Authorization: Bearer $EODIA_TOKEN"
```

Il se crée depuis **Mon profil** ou la page **API et MCP**, avec :

- un **nom**, qui dit où il sert (« Script de reporting », « Claude Desktop ») ;
- ses **surfaces** : **API REST**, **MCP**, ou les deux. Un jeton n’est accepté que sur les
  surfaces qu’il déclare : un jeton MCP seul est refusé par l’API REST ;
- une **expiration** : 30 jours, 90 jours, 1 an, ou jamais.

Le jeton n’est **affiché qu’une fois** : seule son empreinte est gardée. La liste de vos jetons
montre leur dernière utilisation, et **Révoquer** les coupe aussitôt. Un jeton ne peut pas créer
d’autre jeton, et il cesse de fonctionner si son propriétaire est désactivé. Créations et
révocations sont inscrites au journal d’audit.

:::caution[Un jeton porte vos droits]
Un jeton agit avec les droits de son propriétaire, ni plus ni moins : ses permissions de
données, de colonnes et de lignes s’appliquent à tout ce qu’il lit. Rangez-le comme un mot de
passe.
:::

### Depuis le navigateur

L’interface s’authentifie par un cookie de session. Avec ce cookie, toute requête qui écrit
(`POST`, `PUT`, `PATCH`, `DELETE`) doit porter l’en-tête `X-Eodia-Csrf: 1`, sans quoi elle est
refusée (`CSRF`). Un jeton `Bearer` n’en a pas besoin.

## Interroger les données

`POST /api/v1/query` exécute une requête — SQL Trino, éditeur visuel ou SQL natif — dans Trino,
sous l’identité de l’appelant :

```bash
curl -X POST https://bi.exemple.fr/api/v1/query \
  -H "Authorization: Bearer $EODIA_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "query": {
      "kind": "sql",
      "sql": "SELECT region, count(*) AS clients FROM boutique.public.clients GROUP BY 1"
    }
  }'
```

La réponse donne les colonnes (`name`, `label`, `type`…), les lignes, un indicateur `truncated`,
la durée et le SQL exécuté. `limit` fixe le nombre de lignes lues (100 000 au plus), `parameters`
donne les valeurs des [variables](/insights/fonctionnalites/questions/#les-variables), et
`fresh: true` ignore le cache.

| Endpoint | Rôle |
|---|---|
| `POST /api/v1/query` | exécuter une requête |
| `POST /api/v1/query/cancel` | annuler une exécution, par son `execution_id` |
| `POST /api/v1/query/export` | télécharger un résultat en CSV, JSON ou XLSX |
| `POST /api/v1/questions/{id}/run` | exécuter une question enregistrée, avec ses variables |
| `POST /api/v1/questions/{id}/export` | exporter le résultat d’une question |
| `POST /api/v1/dashboards/{id}/cards/{card}/run` | exécuter une carte avec les valeurs des filtres |

Le niveau de requête compte : sans le niveau **SQL** sur aucune source, `POST /api/v1/query`
refuse une requête SQL. Voir [Droits](/insights/fonctionnalites/droits/#le-niveau-de-requête).

## Ce que couvre l’API

| Groupe | Exemples |
|---|---|
| **Profil** | `GET /api/v1/me`, vos jetons (`/api/v1/me/tokens`) |
| **Sources** | moteurs disponibles, sources, test de connexion, synchronisation, état d’un job (aussi en SSE) |
| **Structure** | tables, colonnes, métadonnées, valeurs, relations, copier-coller de configuration |
| **Exécution** | requêtes, annulation, export, historique, snippets |
| **Questions** | questions, modèles (`/api/v1/models`), métriques (`/api/v1/metrics`), duplication |
| **Tableaux de bord** | lecture, création, modification, duplication, exécution d’une carte |
| **Dossiers** | dossiers et leur contenu, recherche, favoris, accueil, partages d’éléments |
| **Partage** | liens de partage (`/api/v1/share-links`) |
| **Copilot** | conversation en SSE (`POST /api/v1/copilot`), conversations enregistrées |
| **Administration** | personnes, invitations, groupes, permissions, journal d’audit, cache, secrets d’intégration |

Les routes d’administration demandent les droits correspondants (**Gérer les sources**, **Gérer
les métadonnées**, **Gérer les permissions**) ou d’être administrateur. Quelques routes publiques,
sans jeton, servent la connexion (`/api/auth/…`) et les contenus partagés (`/api/public/…`).

## Les erreurs

Une erreur renvoie un statut HTTP et un corps de la forme :

```json
{ "error": { "code": "DATA_ACCESS_DENIED", "message": "Accès aux données refusé : …" } }
```

Le `code` est stable et lisible par une machine ; le `message` est en français, prêt à afficher.

| Code | Statut | Sens |
|---|---|---|
| `UNAUTHENTICATED` | 401 | jeton absent, invalide, expiré, ou non autorisé sur cette surface |
| `FORBIDDEN`, `CSRF` | 403 | droit manquant ; écriture par cookie sans `X-Eodia-Csrf` |
| `DATA_ACCESS_DENIED` | 403 | Trino a refusé l’accès à une table ou une colonne |
| `NOT_FOUND` | 404 | introuvable — ou invisible pour vous |
| `INVALID_INPUT` | 400 | corps ou paramètres invalides |
| `CONFLICT` | 409 | conflit : adresse ou catalogue déjà pris |
| `QUERY_FAILED` | 400 | Trino a rejeté la requête ; `details.location` situe l’erreur |
| `QUERY_TIMEOUT` | 408 | délai dépassé (`EODIA_QUERY_TIMEOUT_MS`) |
| `QUERY_CANCELLED` | 499 | requête annulée |
| `CONNECTION_FAILED` | 400 | test de connexion d’une source en échec |
| `ENGINE_UNAVAILABLE` | 503 | Trino ou le fournisseur d’identité injoignable |
| `AI_DISABLED`, `AI_QUOTA` | 400, 429 | copilot non configuré ; quota atteint |
| `INTERNAL` | 500 | erreur interne |
