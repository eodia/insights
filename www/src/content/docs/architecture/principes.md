---
title: Principes
description: L’architecture d’eodia insights, le trajet d’une requête entre Trino et l’endpoint OPA, le modèle de sécurité et le catalogue.
---

eodia insights repose sur quelques décisions, fixées dans
[`docs/PLAN.md`](https://github.com/eodia/insights/blob/main/docs/PLAN.md). En voici l’esprit.

## Vue d’ensemble

```text
                         ┌──────────────── Caddy (HTTPS) ────────────────┐
  navigateur ───────────►│  /        → web  :3100   (Next.js)            │
  scripts, SDK ─────────►│  /api/*   → api  :4100   (Hono, REST + auth)  │
  Claude, agents MCP ───►│  /mcp     → mcp  :4200   (MCP Streamable HTTP)│
                         └───────────────────────────────────────────────┘
                                          │
          ┌───────────────────────────────┼─────────────────────────────┐
          ▼                               ▼                             ▼
  ┌───────────────┐   requêtes   ┌─────────────────┐  connecteurs  ┌──────────────┐
  │ api / worker  │─────────────►│      Trino      │──────────────►│ vos bases :  │
  │ @eodia/core   │◄─────────────│ (moteur unique) │               │ PG, MySQL,   │
  └───────┬───────┘  OPA : allow,└─────────────────┘               │ SQL Server,  │
          │          filtres de ligne,                             │ Oracle,      │
          │          masques de colonne                            │ Snowflake,   │
          ▼                                                        │ MongoDB…     │
  ┌───────────────┐                                                └──────────────┘
  │  PostgreSQL   │  catalogue : personnes, groupes, permissions, sources (secrets
  │  (catalogue)  │  chiffrés), métadonnées, questions, tableaux de bord, jobs, cache
  └───────────────┘
```

| Composant | Rôle |
|---|---|
| **web** | l’interface Next.js ; ne parle qu’HTTP à l’API, ne touche jamais aux données |
| **api** | le REST `/api/v1`, l’authentification, les pages publiques, et l’endpoint OPA appelé par Trino |
| **worker** | la file de jobs : synchronisations, scan des valeurs, préchauffage ; dans l’API en développement |
| **mcp** | le serveur MCP ; ne détient aucun secret, relaie le jeton de chaque appel à l’API |
| **Trino** | le moteur unique d’exécution, sans état |
| **PostgreSQL** | le catalogue de l’application |

Le code est un monorepo TypeScript. `@eodia/core` porte la logique métier (authentification,
droits, catalogue, requêtes, copilot, synchronisation, jobs) ; `@eodia/compiler` traduit une
question de l’éditeur visuel et une règle de lignes en SQL Trino ; `@eodia/engine` parle à Trino ;
`@eodia/drivers` porte les pilotes natifs ; `@eodia/contracts` les types et schémas partagés, d’où
vient l’OpenAPI. Les applications (`apps/api`, `apps/web`, `apps/worker`, `apps/mcp`) sont des
adaptateurs, et l’interface ne dépend jamais du noyau.

## Trino, moteur unique

Toute requête d’une personne — éditeur visuel, SQL, carte, copilot, API, MCP — est exécutée par
Trino. Les pilotes natifs des sept moteurs ne servent qu’à l’administration : tester une
connexion, lire les clés, commentaires et volumes que Trino ne donne pas.

Chaque source est un **catalogue dynamique** (`CREATE CATALOG … USING …`). Trino tourne avec
`catalog.store=memory` : **l’application est la source de vérité**. Elle garde la configuration
et les secrets des sources, et recrée les catalogues quand Trino redémarre.

## Le trajet d’une requête

1. Une personne lance une question. L’API la compile en **SQL Trino** : l’éditeur visuel par
   `@eodia/compiler`, le SQL tel quel après substitution des variables — chaque valeur devenant un
   littéral échappé.
2. L’API envoie l’instruction à Trino avec `X-Trino-User` = **l’identifiant de la personne**
   (ou, pour une intégration signée, celui d’un visiteur virtuel).
3. Avant d’exécuter, Trino interroge l’endpoint OPA de l’API,
   `/internal/opa/<secret>/…` :

   | Endpoint | Question de Trino | Réponse |
   |---|---|---|
   | `allow` | puis-je accéder à ce catalogue, ce schéma, ces colonnes ? exécuter cette fonction ? | oui ou non |
   | `batch` | lesquels de ces catalogues, schémas, tables, colonnes sont visibles ? | les indices autorisés |
   | `row-filters` | quel filtre ajouter à chaque lecture de cette table ? | une expression SQL |
   | `column-masks` | quelles colonnes masquer, et par quoi ? | une expression par colonne |

4. Trino exécute la requête réécrite — tables interdites invisibles, colonnes cachées absentes,
   filtres de ligne ajoutés, masques posés — et renvoie le résultat.
5. L’API le met en cache sous une clé qui comprend l’empreinte des droits de la personne, et
   l’inscrit dans l’historique.

Il n’y a pas de serveur OPA à déployer : l’API **imite** ses réponses, à partir d’un instantané
des permissions en mémoire. Les décisions viennent toutes d’un module pur et testé,
`packages/core/src/access/decide.ts`, que l’endpoint OPA, le compilateur, le copilot et
l’interface interrogent de la même façon.

## La sécurité

- **L’identité de bout en bout.** Chaque requête de données part vers Trino sous l’identité de
  la personne, ou du propriétaire du jeton. Aucun chemin, pas même le SQL libre, ne contourne
  les règles : c’est le moteur qui les applique.
- **Trino en lecture seule pour les personnes.** L’endpoint OPA n’accorde aux personnes que des
  opérations de lecture ; seule l’identité de service de l’application crée des catalogues.
- **Fermer plutôt qu’ouvrir.** Un attribut manquant, une règle qui ne compile plus, une
  identité inconnue : chaque fois, la réponse est « aucune ligne », jamais « toutes ».
- **Le SQL natif sous condition.** `catalogue.system.query(…)` n’est accordé qu’aux personnes
  sans aucune restriction sur la source, puisque Trino ne peut rien y appliquer.
- **Un cache cloisonné.** La clé d’un résultat comprend une empreinte des groupes et des
  attributs : deux personnes aux droits différents ne partagent jamais une entrée.
- **Des secrets chiffrés.** Les identifiants des sources et les secrets d’intégration sont
  chiffrés en AES-256-GCM avec `SECRET_KEY` ; Trino ne garde rien sur disque.
- **Un endpoint OPA privé.** Son chemin porte un secret (`OPA_SECRET`), et Caddy ne
  l’expose pas : seul Trino l’appelle, sur le réseau Docker.
- **Sessions et jetons.** Cookie `httpOnly` `SameSite=Lax` ; toute écriture par cookie exige
  l’en-tête `X-Eodia-Csrf: 1`. Les jetons `eoi_…` sont gardés hachés, limités à leurs surfaces,
  révocables et éventuellement datés.
- **Un journal d’audit** des actions sensibles.

:::note[L’ordre de démarrage]
Trino demande l’autorisation à l’API pour **toute** instruction, celles de l’application
comprises. L’API ouvre donc le catalogue (`prepare()`), se met à écouter, et seulement ensuite
parle à Trino (`start()`) pour recréer les catalogues.
:::

## Le catalogue et ses migrations

Le catalogue est une base PostgreSQL, dans le schéma `DATABASE_SCHEMA` (`eodia` par
défaut). Il change par **migrations numérotées**, dans
`packages/catalog-schema/migrations/` : `0001_catalogue.sql`, puis les suivantes.

- Au démarrage, l’API — ou le worker, le premier des deux — applique les migrations en attente,
  chacune dans sa transaction, sous un verrou qui écarte les autres processus.
- Chaque migration appliquée est enregistrée avec sa **somme de contrôle**. Si un fichier déjà
  appliqué a changé, l’instance refuse de démarrer (`CATALOG_CHECKSUM_MISMATCH`).
- À la publication d’une version, les migrations sont **scellées** dans `sealed.json` : une
  migration publiée ne se modifie plus jamais, la correction va dans la suivante.

```bash
pnpm catalog new ajout_des_rappels   # crée NNNN_ajout_des_rappels.sql
pnpm catalog status                  # scellée ou non, appliquée ou non
pnpm catalog seal 0.2.0              # à la publication : fige les migrations non scellées
pnpm catalog check [--release]       # échoue si une migration scellée a changé
```

Une migration s’écrit **rejouable** (`IF NOT EXISTS`) : une installation mise à jour doit valoir
une installation neuve.
