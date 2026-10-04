---
title: Serveur MCP
description: Brancher Claude ou tout client MCP sur eodia insights, en HTTP ou en stdio, et les dix outils qu’il expose.
---

eodia insights expose un **serveur MCP** (Model Context Protocol) : Claude, un assistant de code
ou votre propre agent y découvrent vos sources, lisent vos métriques et vos questions, et
écrivent du SQL Trino — **en lecture seule**, sous les droits du jeton.

Le serveur ne détient **aucun secret** et ne lit jamais les données lui-même : il relaie le
jeton de chaque appel à l’[API REST](/insights/integrations/api-rest/), donc à Trino et à ses
permissions. Il sert plusieurs personnes à la fois, chacune avec son jeton.

## Créer un jeton

Depuis **Mon profil** ou la page **API et MCP**, créez un jeton avec la surface **MCP** cochée
(voir [les jetons](/insights/integrations/api-rest/#les-jetons)). Il commence par `eoi_` et n’est
affiché qu’une fois. Un jeton limité à MCP ne sert pas sur l’API REST.

## En HTTP

Le serveur parle **Streamable HTTP**, sans session, sur `POST /mcp` :

| Contexte | Adresse |
|---|---|
| Production (derrière Caddy) | `https://bi.exemple.fr/mcp` |
| Développement | `http://localhost:4200/mcp` (`pnpm --filter @eodia/mcp dev`) |

Chaque requête porte l’en-tête `Authorization: Bearer eoi_…`. Pour un client qui accepte une
configuration HTTP (Cursor, VS Code…) :

```json
{
  "mcpServers": {
    "eodia-insights": {
      "type": "http",
      "url": "https://bi.exemple.fr/mcp",
      "headers": { "Authorization": "Bearer eoi_…" }
    }
  }
}
```

Avec **Claude Code** :

```bash
claude mcp add --transport http eodia-insights https://bi.exemple.fr/mcp \
  --header "Authorization: Bearer $EODIA_TOKEN"
```

Avec **Claude Desktop**, par la passerelle `mcp-remote` (`claude_desktop_config.json`) :

```json
{
  "mcpServers": {
    "eodia-insights": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://bi.exemple.fr/mcp", "--header", "Authorization:${EODIA_AUTH}"],
      "env": { "EODIA_AUTH": "Bearer eoi_…" }
    }
  }
}
```

Le serveur accepte les appels de toute origine (le jeton voyage dans un en-tête, jamais dans un
cookie), ce qui permet aux inspecteurs MCP dans le navigateur de le joindre. `GET /health`
répond sans jeton.

## En stdio

Pour un client qui lance le serveur lui-même, depuis un clone du dépôt, avec l’option
`--stdio`. L’adresse de l’application et le jeton passent par l’environnement :

```json
{
  "mcpServers": {
    "eodia-insights": {
      "command": "npx",
      "args": ["tsx", "/chemin/vers/eodia-insights/apps/mcp/src/server.ts", "--stdio"],
      "env": { "EODIA_URL": "https://bi.exemple.fr", "EODIA_TOKEN": "eoi_…" }
    }
  }
}
```

| Variable | Défaut | Rôle |
|---|---|---|
| `EODIA_URL` | `http://localhost:4100` | l’adresse de l’application (l’API est sous `/api`) |
| `EODIA_TOKEN` | — | le jeton ; sans lui, le serveur refuse de démarrer |

## Les dix outils

| Outil | Rôle |
|---|---|
| `list_datasources` | les sources lisibles, leur moteur et leur catalogue Trino |
| `search_schema` | chercher des tables et des colonnes par mots-clés (nom, libellé, description) |
| `describe_table` | une table : nom qualifié, colonnes (type, type sémantique, clés, description) et valeurs des colonnes de catégorie |
| `list_metrics` | les [métriques](/insights/fonctionnalites/modeles-et-metriques/) enregistrées |
| `query_metric` | calculer une métrique, regroupée par une colonne ou par période (jour, semaine, mois, trimestre, année), avec des filtres supplémentaires |
| `list_questions` | chercher les questions, modèles, métriques et tableaux de bord |
| `run_question` | exécuter une question enregistrée ; les variables passent dans `parameters` |
| `run_sql` | exécuter du SQL Trino en lecture seule : `SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `EXPLAIN`, `VALUES` ou `TABLE` |
| `get_dashboard` | résumer un tableau de bord : onglets, filtres, cartes et l’identifiant de leur question |
| `show_chart` | **afficher un graphique dans la conversation** : une question enregistrée (avec sa visualisation) ou du SQL Trino, avec la forme, l’empilement et le titre voulus |

Tous sont annotés en lecture seule. Le serveur conseille à l’agent de préférer une métrique ou
une question existante, puis de repérer les tables avant d’écrire du SQL. Les résultats lui
arrivent en tableaux Markdown de 50 lignes au plus ; `run_sql` lit 200 lignes par défaut, 10 000
au plus.

## Des graphiques dans la conversation (MCP Apps)

`show_chart` déclare une interface, `ui://eodia/chart.html`, selon l’extension **MCP Apps**
(`io.modelcontextprotocol/ui`) : les clients qui la gèrent — Claude, ChatGPT, VS Code… — dessinent
le graphique **dans la conversation**, dans un cadre isolé. Il est construit comme dans
l’application : mêmes formes (radar compris), mêmes palettes, mêmes formats, mêmes couleurs de
valeurs ; il suit le thème clair ou sombre du client, et **Ouvrir ↗** mène à la question dans
eodia insights (`PUBLIC_URL`).

Un client sans MCP Apps reçoit le même résultat en tableau Markdown. La page est un seul fichier
HTML, sans ressource externe : la politique de sécurité par défaut des clients suffit.

```text
Montre-moi les commandes par mois et par statut, en barres empilées.
```

## Ce qu’un agent ne fait pas

- **Il n’écrit rien** : aucun outil ne crée, ne modifie ni ne supprime. Trino, de toute façon,
  n’accepte que des lectures de la part des personnes.
- **Il n’a jamais plus de droits** que le propriétaire de son jeton : règles de ligne, colonnes
  masquées et cachées s’appliquent comme dans l’interface.
- **Il perd l’accès aussitôt** que le jeton est révoqué.

Ses requêtes apparaissent dans l’[historique](/insights/fonctionnalites/questions/#lhistorique-des-requêtes)
du propriétaire du jeton, avec l’origine « API » : le serveur MCP passe par l’API REST.
