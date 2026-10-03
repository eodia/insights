---
title: Modèles et métriques
description: Des tables virtuelles curées et des agrégats nommés, définis une fois et réutilisés partout.
---

Une question peut changer de nature. Depuis le menu **Plus** de l’éditeur de question :

| Nature | Ce que c’est | Où elle sert |
|---|---|---|
| **Question** | une requête et sa visualisation | dossiers, tableaux de bord |
| **Modèle** | une table virtuelle réutilisable | comme source de l’éditeur visuel, et pour le copilot |
| **Métrique** | une agrégation nommée | dans l’éditeur visuel, les cartes, le copilot et le serveur MCP |

Modèles et métriques se rangent dans les dossiers comme les questions, se partagent de la même
façon, et s’exécutent comme elles : dans Trino, sous les droits de qui les lit.

## Les modèles

**Transformer en modèle** fait d’une question — visuelle ou SQL — une **table virtuelle** : dans
l’étape **Données** de l’éditeur visuel, elle apparaît parmi les **Modèles**, à côté des tables.
On s’en sert pour figer une préparation que tout le monde refait : une jointure, un filtre
métier, des colonnes renommées.

Le modèle de la démonstration, **Commandes enrichies**, joint chaque commande à la région, la
ville et le segment de son client :

```sql
SELECT o.id, o.passee_le, o.statut, o.canal, o.montant_total, o.remise,
       c.segment, c.region, c.ville, c.canal_acquisition
FROM boutique.public.commandes o
JOIN boutique.public.clients c ON c.id = o.client_id
```

Une question construite sur ce modèle n’a plus à connaître la jointure. Les règles de ligne et
de colonne des tables d’origine s’appliquent toujours : le modèle est une requête, relue par
Trino à chaque exécution.

Un modèle peut porter ses propres **métadonnées de colonnes** — libellé, description, type
sémantique, format — qui habillent son résultat. Elles se définissent pour l’instant par l’API
(champ `columns_meta` d’une question).

## Les métriques

Une **métrique** est un agrégat défini une fois : « chiffre d’affaires = somme de
`montant_total` des commandes payées, expédiées ou livrées ». Elle se crée depuis une question
de l’**éditeur visuel** qui a **une seule mesure** : **Transformer en métrique**. Sa définition
retient la source, la mesure et les filtres de la question.

On l’utilise ensuite :

- dans l’éditeur visuel, étape **Résumer › Métriques**, comme n’importe quelle mesure, regroupée
  par mois ou par région ; ses propres filtres s’appliquent tels quels ;
- sur les cartes d’un [tableau de bord](/insights/fonctionnalites/tableaux-de-bord/), à travers
  les questions qui la citent ;
- par le [copilot](/insights/fonctionnalites/copilot/), qui liste les métriques avant d’écrire
  un calcul ;
- par le [serveur MCP](/insights/integrations/mcp/) : `list_metrics`, puis `query_metric`,
  avec un regroupement par colonne ou par période et des filtres supplémentaires.

:::note[Une métrique, une source]
Dans l’éditeur visuel, une métrique s’emploie sur la table ou le modèle sur lequel elle est
définie ; les colonnes des tables liées par une clé étrangère restent disponibles pour la
regrouper.
:::

:::tip[Changer la définition une fois]
Modifier une métrique change toutes les questions qui la citent : c’est tout l’intérêt de la
nommer plutôt que de recopier son calcul.
:::
