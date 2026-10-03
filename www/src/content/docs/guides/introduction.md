---
title: Introduction
description: Ce qu’est eodia insights, et ce qui le distingue des autres outils de BI.
---

**eodia insights** est un outil de BI open source, dans l’esprit de Metabase : vous branchez
vos bases de données, vous les décrivez, puis vous construisez des questions — à la souris ou en
SQL —, des modèles, des métriques et des tableaux de bord, que vous partagez avec des droits
fins. Une décision commande tout le reste : **toute requête passe par Trino, et c’est Trino qui
applique les permissions**.

## Trino, moteur unique

Chaque source connectée devient un **catalogue Trino**. Une table se cite donc toujours de la
même façon, `catalogue.schéma.table`, quel que soit le moteur qui la porte :

```sql
SELECT c.segment, avg(t.satisfaction) AS satisfaction
FROM support.support.tickets t                  -- une collection MongoDB
JOIN boutique.public.clients c ON c.id = t.client_id  -- une table PostgreSQL
GROUP BY 1
```

L’éditeur visuel, l’éditeur SQL, les cartes des tableaux de bord, le copilot, l’API REST et le
serveur MCP envoient tous leurs requêtes à Trino. Il n’existe qu’un dialecte à apprendre, et les
requêtes **inter-bases** sont naturelles.

## Les permissions appliquées par le moteur

Avant chaque instruction, Trino demande à l’API d’eodia insights ce que la personne peut lire :
l’API imite un serveur **OPA** (Open Policy Agent), sans qu’il faille en déployer un. Elle
répond quelles tables sont visibles, quelles colonnes sont cachées ou masquées, et quel filtre
ajouter à chaque lecture d’une table.

La conséquence est simple : **aucun chemin ne contourne les règles**, pas même le SQL libre.
Une personne qui n’a droit qu’aux clients de sa région ne voit qu’eux, qu’elle passe par un
tableau de bord, une requête écrite à la main ou un assistant branché sur le serveur MCP. Voir
[Droits et groupes](/insights/fonctionnalites/droits/).

## Ce que vous y trouverez

- Des [sources de données](/insights/fonctionnalites/sources/) sur **sept moteurs** :
  PostgreSQL, MySQL / MariaDB, SQL Server, Oracle, Snowflake, MongoDB, et tout connecteur Trino.
- Un écran **Structure** pour décrire les tables : libellés, descriptions, types sémantiques,
  formats, valeurs, relations.
- Des [questions](/insights/fonctionnalites/questions/) construites avec l’éditeur visuel, en
  SQL Trino ou en SQL natif, et quinze visualisations.
- Des [modèles et des métriques](/insights/fonctionnalites/modeles-et-metriques/) : des tables
  virtuelles et des agrégats nommés, définis une fois.
- Des [tableaux de bord](/insights/fonctionnalites/tableaux-de-bord/) avec filtres, onglets,
  rafraîchissement automatique et cache de résultats.
- Des [droits](/insights/fonctionnalites/droits/) par groupe, jusqu’à la colonne et à la ligne.
- Le [partage](/insights/fonctionnalites/partage/) : dossiers, partage d’élément, liens publics,
  iframe, et [intégration signée](/insights/integrations/integration-signee/).
- Un [copilot](/insights/fonctionnalites/copilot/) (Anthropic, OpenAI, Mistral ou compatible
  OpenAI) qui cherche les tables, écrit le SQL et propose des questions et des tableaux de bord.
- Une [API REST](/insights/integrations/api-rest/) décrite en OpenAPI 3.1 et un
  [serveur MCP](/insights/integrations/mcp/) pour Claude et les autres assistants.

## Pour qui ?

- **Les analystes**, qui veulent écrire du SQL sur toutes les bases de l’entreprise sans gérer
  sept dialectes.
- **Les équipes métier**, qui explorent une table à la souris et consultent des tableaux de bord
  filtrés pour elles.
- **Les responsables des données**, qui veulent des règles d’accès appliquées partout, et pas
  seulement dans l’interface.
- **Les agents IA**, qui trouvent un serveur MCP en lecture seule, sous les droits de leur jeton.

## État du projet

eodia insights est un logiciel libre, distribué sous licence
[AGPL-3.0-or-later](https://github.com/eodia/insights/blob/main/LICENSE), et en développement
actif. Son code est sur [GitHub](https://github.com/eodia/insights) ; le document
[`docs/PLAN.md`](https://github.com/eodia/insights/blob/main/docs/PLAN.md) fixe les décisions et
le phasage.

:::note[AGPL]
Si vous modifiez eodia insights et l’offrez comme service en réseau, vous devez en publier les
sources modifiées.
:::

:::tip[Essayer]
Une pile de développement démarre en trois commandes, avec une instance de démonstration. Voir
[l’installation](/insights/guides/installation/).
:::
