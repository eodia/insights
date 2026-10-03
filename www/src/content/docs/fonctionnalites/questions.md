---
title: Questions
description: Interroger les données avec l’éditeur visuel, en SQL Trino ou en SQL natif, et choisir une visualisation.
---

Une **question** est une requête enregistrée avec sa visualisation, rangée dans un dossier. Elle
s’écrit de trois façons, qui s’exécutent toutes dans Trino sous l’identité de la personne qui la
lit : ses [droits](/insights/fonctionnalites/droits/) sur les tables, les colonnes et les lignes
s’appliquent toujours.

| Façon | Pour qui | Niveau de requête nécessaire |
|---|---|---|
| **Éditeur visuel** | tout le monde, sans SQL | Éditeur visuel |
| **SQL Trino** | les analystes ; joint plusieurs sources | SQL |
| **SQL natif** | le dialecte de la base, envoyé tel quel | SQL natif, et aucune restriction sur la source |

Lire une question enregistrée demande le droit de lire ses données, pas de niveau de requête,
à deux exceptions près : une question en SQL natif reste réservée à qui peut écrire du SQL natif
sur la source, et une question visuelle qui contient une colonne personnalisée ou une condition
écrite en SQL demande le niveau SQL à son lecteur.

## L’éditeur visuel

**Nouveau › Question** (ou **Explorer une table** depuis l’accueil) ouvre l’éditeur en étapes :

| Étape | Ce qu’on y fait |
|---|---|
| **Données** | la table ou le [modèle](/insights/fonctionnalites/modeles-et-metriques/) de départ |
| **Filtrer** | des conditions sur les colonnes : est, n’est pas, contient, commence par, entre, avant, après, vide… ; pour une date, une période (`Ce mois-ci`, `12 derniers mois`…) |
| **Résumer** | des **mesures** — nombre de lignes, valeurs distinctes, somme, moyenne, médiane, minimum, maximum, écart type, nombre et somme cumulés, ou une métrique — et des **regroupements** |
| **Colonnes** | sans résumé, les colonnes affichées |
| **Colonnes personnalisées** | une colonne calculée par une expression Trino SQL (`prix - cout`) |
| **Trier et limiter** | l’ordre des lignes et leur nombre |

Une date se regroupe par minute, heure, jour, semaine, mois, trimestre ou année, ou par rang :
heure de la journée, jour de la semaine, du mois, semaine de l’année, mois, trimestre. Un nombre
se regroupe par valeurs ou **par tranches**.

**Jointures implicites.** Les colonnes des tables reliées par une clé étrangère — détectée ou
déclarée dans [Structure](/insights/fonctionnalites/sources/#les-relations) — sont proposées
avec celles de la table de départ : en choisir une ajoute la jointure, et la retirer l’enlève.

**Joindre des données.** Dans l’étape **Données**, **Joindre des données** ajoute une jointure
choisie : la table, le type (**à gauche**, **interne**, **à droite**, **complète**) et les deux
colonnes de la condition — la clé entre les deux tables est proposée d’office. La jointure reste
même si aucune étape ne cite ses colonnes ; sans résumé, ses colonnes s’affichent après celles
de la source, et se choisissent, se filtrent et se trient comme elles. Sa pastille la modifie ou
la retire (avec les étapes qui citaient ses colonnes). Quatre jointures au plus.

**Explorer un point.** Un clic sur une barre ou un point d’un graphique propose **Filtrer sur
cette valeur** ou **Exclure cette valeur**.

**Convertir en SQL** transforme la question en question SQL, à partir du SQL que l’éditeur a
produit.

:::note[Colonnes personnalisées et conditions SQL]
Une colonne personnalisée ou une condition écrite en SQL demande le niveau **SQL** sur la
source.
:::

## L’éditeur SQL

**Éditeur SQL** (ou **Nouveau › Requête SQL**) s’écrit en SQL Trino :

- l’**autocomplétion** connaît `catalogue.schéma.table` et les colonnes de chaque table que vous
  pouvez lire, et rien d’autre ;
- `Ctrl+Entrée` exécute la requête, ou la **sélection** quand il y en a une ;
  **Annuler** interrompt l’exécution dans Trino ;
- **Formater** (`Maj+Alt+F`) met le SQL en forme ;
- une erreur de Trino se place sur la ligne et la colonne qu’il désigne ; **Corriger avec le
  copilot** lui demande une correction ;
- plusieurs **onglets**, gardés dans votre navigateur ;
- un panneau latéral : le **schéma** (cliquez pour insérer un nom), les **snippets** et
  l’**historique** de vos requêtes.

Les requêtes de l’éditeur ne passent jamais par le cache de résultats : vous voyez toujours
l’état présent des données. Un aperçu lit au plus 2 000 lignes (`EODIA_MAX_ROWS`).

**Enregistrer comme question** range la requête dans un dossier ; elle devient une question SQL.

### Snippets

Un **snippet** est un fragment SQL réutilisable, partagé par toute l’instance. Enregistrez la
sélection courante sous un nom, puis citez-la n’importe où :

```sql
SELECT * FROM boutique.public.commandes
WHERE {{snippet: commandes_payees}}
```

### Le SQL natif

Le sélecteur **Dialecte** propose, en plus de « Trino SQL (toutes les sources) », un **SQL natif**
pour chaque source qui l’autorise : la requête est envoyée **telle quelle** à la base, dans son
propre dialecte, par la fonction `system.query` de Trino. MongoDB et les connecteurs Trino bruts
n’en ont pas.

:::caution[Réservé aux accès complets]
Les règles de ligne et de colonne ne peuvent pas s’appliquer à un texte que Trino ne lit pas. Le
SQL natif est donc réservé aux personnes qui ont le niveau **SQL natif** sur la source **et** la
lisent entièrement, sans aucune restriction, sur une source où l’option est activée. Trino
lui-même le refuse aux autres.
:::

## Les variables

Une question SQL accepte des **variables** `{{nom}}`. Chacune apparaît sous l’éditeur dès
qu’elle est écrite, avec son type :

| Type | `{{nom}}` devient |
|---|---|
| **Texte** | un littéral texte échappé : `'Bretagne'` |
| **Nombre** | un nombre |
| **Date** | une date : `DATE '2026-01-01'` |
| **Filtre** | une **condition entière** sur une colonne SQL, `TRUE` sans valeur |

Une valeur devient toujours un littéral échappé : ce qu’on saisit ne peut pas changer la forme
de la requête. Une variable **Filtre** porte sur une expression SQL (`c.passee_le`) et son genre
— texte, nombre, date ou horodatage — ; c’est elle qu’un filtre de tableau de bord restreint le
plus naturellement :

```sql
SELECT canal, count(*) AS commandes
FROM boutique.public.commandes c
WHERE {{periode}}
[[ AND canal = {{canal}} ]]
GROUP BY 1
```

Une **section optionnelle** `[[ … ]]` n’est gardée que si toutes ses variables ont une valeur ;
sinon elle disparaît. Une variable hors section, sans valeur, empêche l’exécution.

Une date accepte une date (`2026-03-01`), une période relative (`today`, `yesterday`,
`thismonth`, `lastmonth`, `past30days`, `next2weeks`…) ou un intervalle
`2026-01-01~2026-03-31`, ouvert d’un côté si besoin (`2026-01-01~`).

## Les visualisations

Seize formes, rangées par usage — chiffres clés, comparer (dont le **radar**), évolution,
répartition, relation, détail —, avec des palettes validées pour les daltoniens, la mise en
avant d’une valeur, la moyenne, le tri, le top N… et des **prévisions** qui prolongent une
courbe en pointillés verts. Tout est décrit dans [Visualisations](/insights/fonctionnalites/visualisations/)
et [Prévisions](/insights/fonctionnalites/previsions/).

## Exporter, partager, ranger

- **Exporter** télécharge le résultat en **CSV**, **XLSX** ou **JSON**, jusqu’à 100 000 lignes,
  toujours sous vos droits.
- **Ajouter à un tableau de bord** pose la question sur un tableau existant.
- **Déplacer…** la range dans un autre dossier, ou la confie à un tableau de bord (et à l’un de
  ses onglets) : elle lui appartient alors, comme une question créée dans le tableau.
- **Dupliquer**, **Enregistrer une copie**, **Partager** : voir
  [Partage](/insights/fonctionnalites/partage/).
- **Transformer en modèle** ou **en métrique** : voir
  [Modèles et métriques](/insights/fonctionnalites/modeles-et-metriques/).

## L’historique des requêtes

**Historique** liste chaque requête envoyée à Trino avec le SQL **réellement exécuté**, sa durée,
son nombre de lignes, son erreur éventuelle et son origine : éditeur, question, carte de tableau
de bord, API (le serveur MCP compris), copilot ou lien partagé. Chacun y voit les siennes ; un administrateur peut
afficher celles de toutes les personnes.
