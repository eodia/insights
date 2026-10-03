---
title: Tableaux de bord
description: Cartes, filtres associatifs, onglets, prévisions, rafraîchissement automatique et cache des résultats.
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

**Ajouter une question** cherche parmi les questions, modèles et métriques que vous pouvez lire ;
chacune y montre son dossier. Une question peut aussi venir de son propre écran (**Ajouter à un
tableau de bord**) ou d’une proposition du [copilot](/insights/fonctionnalites/copilot/).

Le titre d’une carte ouvre sa question. Son menu permet de la **rafraîchir**, de l’**agrandir**
en plein écran, d’**ouvrir la question**, de la **dupliquer**, de la **retirer** — retirer une
carte ne supprime pas la question —, et de la **déplacer** :

- **Vers l’onglet ›** l’envoie sur un autre onglet du même tableau ;
- **Vers un autre tableau de bord…** la place sur un autre tableau, dans l’onglet choisi. Ses
  liens aux filtres restent derrière elle : les filtres ne sont pas les mêmes d’un tableau à
  l’autre.

L’onglet ouvert fait partie de l’adresse (`?tab=…`) : un lien ouvre le bon onglet, et
**Précédent** / **Suivant** du navigateur vont d’un onglet à l’autre.

### Une question créée dans le tableau

**Nouvelle question**, dans **Ajouter une question** ou dans le menu **…** du tableau, ouvre
l’éditeur ; à l’enregistrement, la carte se place dans l’onglet d’où vous êtes parti et le
tableau se rouvre. Cette question **appartient au tableau** :

- elle n’apparaît dans aucun dossier ni dans la recherche ;
- elle prend les droits du tableau (un partage du tableau la partage aussi) ;
- elle est copiée avec le tableau, supprimée avec lui ; retirer sa carte l’archive, la remettre
  la restaure ;
- **Déplacer…**, dans l’éditeur, la range dans un dossier (elle devient une question comme une
  autre) ou l’envoie vers un autre tableau de bord.

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

**Paramétrer un filtre.** En mode édition, sélectionnez un filtre : un panneau montre son type,
son nom, s’il accepte plusieurs valeurs, sa valeur par défaut (**prendre la valeur actuelle**) et
combien de cartes il pilote.

**Relier un filtre aux cartes.** Chaque carte propose la colonne que le filtre restreint — une
colonne de sa table ou d’une table liée — ou, pour une question SQL, une de ses
[variables](/insights/fonctionnalites/questions/#les-variables). **Relier toutes les cartes**
fait tout d’un coup : il liste les colonnes que les cartes ont en commun, avec le nombre de
cartes qui l’ont, et suggère celle qui porte le nom du filtre. **Délier toutes** défait les
liens. Une carte non reliée ignore le filtre.

### Des filtres associatifs

La liste d’un filtre de catégorie se lit comme dans Qlik :

| Couleur | Ce que c’est |
|---|---|
| **Vert** | les valeurs choisies |
| **Blanc** | les valeurs possibles : les autres filtres leur laissent des lignes |
| **Gris**, en dessous | les valeurs exclues par les autres filtres |

Chaque valeur montre ses lignes dans le périmètre des autres filtres (et son total), avec une
barre proportionnelle ; l’en-tête et la puce du filtre montrent **la part des lignes** que garde
la sélection (« 74 % »). Les valeurs viennent des données, lues sous vos droits ; les couleurs et
les pictos sont ceux définis dans [Structure](/insights/fonctionnalites/sources/).

| Geste | Effet |
|---|---|
| Clic | choisit ou retire la valeur |
| **Maj** + clic | choisit la plage, depuis la dernière valeur cliquée |
| **Ctrl** (⌘) + clic | garde seulement cette valeur |
| ↑ ↓, **Espace** | se déplacer, choisir |
| **Maj** + ↑ ↓ | étendre la sélection |
| **Ctrl** + **A** | toutes les valeurs possibles |
| **Suppr** | aucune valeur |
| **Entrée** | fermer |

Les boutons **Tout**, **Exclues** (les valeurs grisées), **Inverser** et **Effacer** font le
reste. Les choix s’appliquent au fil de l’eau ; l’ordre de la liste reste celui de l’ouverture.
Seuls les filtres posés sur la **même table** restreignent les valeurs possibles.

### Cliquer sur un graphique pour filtrer

Hors édition, un clic sur une barre, une part ou un point applique sa valeur au filtre relié à
cette colonne : un clic sur la barre « Web » filtre tout le tableau sur ce canal.

- **Maj** (ou **Ctrl**, ⌘) + clic **ajoute** la catégorie à la sélection, ou l’en retire ;
- un clic sur la seule catégorie choisie retire le filtre ;
- sur une période, **Maj** + clic étend la période jusqu’à celle cliquée.

Le graphique d’où part la sélection n’est pas restreint par elle : il garde toutes ses
catégories, celles qui ne sont pas choisies estompées, pour qu’on puisse en ajouter. Les autres
cartes sont filtrées.

:::note[Le serveur décide de ce que filtre une carte]
Les filtres qu’une carte reçoit sont lus dans le tableau de bord enregistré, côté serveur : un
appelant envoie des valeurs, jamais la liste des colonnes à filtrer. Un lien partagé ne permet
donc pas de détourner une carte.
:::

## Les graphiques des cartes

Chaque carte se règle comme une question : forme (dont le **radar**), palette, couleurs par
série, mise en avant, moyenne, tri, top N… — voir [Visualisations](/insights/fonctionnalites/visualisations/)
— et peut **prolonger sa tendance** : voir [Prévisions](/insights/fonctionnalites/previsions/).

## Rafraîchissement et affichage

- **Rafraîchissement automatique** : le chronomètre de la barre — jamais, toutes les minutes,
  toutes les 5 ou 15 minutes, ou toutes les heures ; sa jauge se remplit jusqu’au prochain
  rafraîchissement.
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
