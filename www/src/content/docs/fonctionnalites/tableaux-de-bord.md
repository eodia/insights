---
title: Tableaux de bord
description: Cartes, filtres, onglets, rafraîchissement automatique et cache des résultats.
---

Un **tableau de bord** assemble des cartes sur une grille de **24 colonnes**, réparties au
besoin en onglets, et filtrées ensemble. Chaque carte s’exécute dans Trino sous les droits de
la personne qui regarde : deux personnes aux droits différents voient, sur le même tableau, des
chiffres différents.

## Modifier un tableau

**Modifier** ouvre un **brouillon** : rien n’est visible des autres avant **Enregistrer**, et
**Annuler** abandonne les changements. On y déplace et redimensionne les cartes à la souris, on
ajoute des onglets, des cartes et des filtres.

| Limite | Valeur |
|---|---|
| Cartes | 60 |
| Onglets | 12 |
| Filtres | 16 |

## Les cartes

| Carte | Contenu |
|---|---|
| **Question** | une question, un modèle ou une métrique enregistrés, avec sa visualisation — ou une autre, propre à la carte |
| **Titre** | un titre de section |
| **Texte** | du Markdown ; `{{id_du_filtre}}` y affiche la valeur d’un filtre |
| **Page intégrée** | une page d’ailleurs, par son adresse |

**Ajouter une question** cherche parmi les questions, modèles et métriques que vous pouvez lire.
Une question peut aussi venir de son propre écran (**Ajouter à un tableau de bord**) ou d’une
proposition du [copilot](/insights/fonctionnalites/copilot/).

Le menu d’une carte permet de la **rafraîchir**, de l’**agrandir** en plein écran, d’**ouvrir la
question**, de la **dupliquer** ou de la **retirer**. Retirer une carte ne supprime pas la question.

## Les filtres

**Filtre** ajoute un filtre au tableau. Cinq types :

| Type | Valeur | Se relie à |
|---|---|---|
| **Période** | une période prédéfinie (`Ce mois-ci`, `12 derniers mois`…) ou précise | une colonne de date |
| **Catégorie** | une ou plusieurs valeurs, choisies dans la liste des valeurs de la colonne | une colonne texte, nombre ou booléen |
| **Texte** | un texte, cherché dans la colonne | une colonne texte |
| **Nombre** | égal, entre, au moins, au plus | une colonne numérique |
| **Granularité de date** | jour, semaine, mois… parmi celles proposées | une colonne de date regroupée |

Chaque filtre a un libellé, un identifiant (`{{periode}}`) et une **valeur par défaut**
(**Valeur actuelle par défaut** reprend celle qui est affichée). Une catégorie accepte ou non
plusieurs valeurs.

**Relier un filtre aux cartes.** En mode édition, sélectionnez un filtre : chaque carte propose
la colonne qu’il restreint — une colonne de sa table ou d’une table liée — ou, pour une question
SQL, une de ses [variables](/insights/fonctionnalites/questions/#les-variables). Une carte non
reliée ignore le filtre.

**Filtres liés.** La liste des valeurs d’une catégorie tient compte des autres catégories déjà
choisies : une fois le pays choisi, le filtre « ville » ne propose que ses villes.

**Cliquer pour filtrer.** Hors édition, un clic sur un point d’un graphique applique sa valeur au
filtre relié à cette colonne : un clic sur la barre « Web » filtre tout le tableau sur ce canal.

:::note[Le serveur décide de ce que filtre une carte]
Les filtres qu’une carte reçoit sont lus dans le tableau de bord enregistré, côté serveur : un
appelant envoie des valeurs, jamais la liste des colonnes à filtrer. Un lien partagé ne permet
donc pas de détourner une carte.
:::

## Rafraîchissement et affichage

- **Rafraîchissement automatique** : jamais, toutes les minutes, toutes les 5 ou 15 minutes, ou
  toutes les heures.
- **Rafraîchir** relance les cartes en ignorant le cache.
- **Plein écran**, pour un écran mural.
- **Dupliquer**, **Ajouter aux favoris**, **Partager** (voir
  [Partage](/insights/fonctionnalites/partage/)).

## Le cache des résultats

Trino ne garde pas de résultats : eodia insights le fait pour lui. Un résultat de carte ou de
question est gardé un certain temps, et la carte affiche alors « résultat du … ».

La **clé** du cache est faite du SQL compilé **et d’une empreinte des droits** de la personne
(ses groupes et ses attributs) : deux personnes aux droits différents ne partagent jamais une
entrée. Les requêtes de l’éditeur SQL ne sont jamais mises en cache, et tout changement de
permission vide le cache.

La durée de conservation se décide, du plus précis au plus général :

1. celle de la **question** (réglable par l’API, champ `cache_ttl`) ;
2. celle du **tableau de bord** (**Réglages › Cache** : pas de cache, 5 minutes, 1 heure,
   24 heures, ou celle de l’instance) ;
3. celle des **sources** lues (la plus courte, si plusieurs en fixent une) ;
4. celle de l’**instance**, dans **Administration › Réglages** : une durée fixe, ou une **durée
   adaptative**, proportionnelle au temps que la requête a coûté (une requête de 10 secondes
   reste environ 17 minutes, entre 1 minute et 24 heures) ;
5. à défaut, `EODIA_CACHE_TTL` (300 secondes).

Les résultats sont gardés dans le catalogue PostgreSQL, partagé par toutes les répliques, avec
un petit cache en mémoire devant. **Vider le cache**, dans **Administration › Réglages**, oblige
les prochaines requêtes à interroger à nouveau les sources.

### Les tableaux préchargés

Un tableau marqué **Préchargé** (dans ses **Réglages**) est tenu au chaud par le worker : toutes
les 15 minutes, il exécute ses cartes avec les valeurs par défaut des filtres, **sous les droits
de son auteur**. Les personnes qui ont les mêmes droits que l’auteur trouvent alors leurs
résultats déjà prêts ; les autres déclenchent leurs propres requêtes, comme d’habitude.
