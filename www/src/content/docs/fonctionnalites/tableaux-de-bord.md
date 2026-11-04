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
| **Titre** | un titre de section : taille, graisse, alignement, police, couleur, majuscules, sous-titre, et une mise en valeur (trait dessous, barre à gauche, bandeau de couleur) — le pinceau à côté du titre, en mode édition |
| **Texte** | du Markdown ; `{{id_du_filtre}}` y affiche la valeur d’un filtre |
| **Volet de filtre** | la liste d’un filtre, posée dans la grille |
| **Boutons** | une rangée de boutons, un par valeur d’un filtre de catégorie (« Web · Mobile · Marketplace ») : un clic la choisit, **Tout** l’efface ; les valeurs exclues par les autres filtres pâlissent |
| **Variable** | un nombre que le lecteur règle, au curseur ou au clavier — un objectif, un taux : la valeur d’un filtre de nombre, que les questions SQL citent en `{{objectif}}` |
| **Lien vers un tableau de bord** | un bouton ou une tuile qui ouvre un autre tableau (et l’un de ses onglets) ; les filtres choisis vont aux filtres du même nom là-bas |
| **Résumé par l’IA** | quelques lignes que l’assistant écrit à partir des cartes choisies, filtres appliqués, selon votre consigne ; récrites quand les filtres changent |
| **Image** | un logo, un schéma, une photo, par son adresse ; un clic peut ouvrir une page |
| **Séparateur** | un trait (plein, tirets, pointillés) ou un simple espace |
| **Page intégrée** | une page d’ailleurs, par son adresse |

En mode édition, l’en-tête prend une teinte et une barre flottante, en bas, ajoute les cartes :
**Question**, **Titre**, **Texte**, **Volet de filtre**, **Boutons**, et **Plus** pour les
autres. Les réglages d’une carte (son filtre, son lien, son image, sa consigne…) sont dans son
menu, **Réglages…**.

**Le résumé par l’IA** lit, pour chaque carte choisie (huit au plus), quelques dizaines de lignes
de son résultat — sous les droits de qui regarde, filtres appliqués — et rien d’autre : de quoi
dire l’essentiel sans dépenser trop. Le même texte est gardé dix minutes pour les mêmes filtres ;
**Réécrire** en demande un nouveau. Il faut un fournisseur d’IA configuré.

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

La liste d’un filtre de catégorie se lit d’un coup d’œil :

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

### Un volet de filtre dans la grille

**Volet de filtre** (en mode édition) pose une carte qui montre un filtre du tableau tel quel : la
liste associative verte, blanche et grise d’un filtre de catégorie, ou le choix d’une période,
d’un nombre, d’un texte. Ce qu’on y choisit est la valeur du filtre : la barre du haut, les
autres cartes et les clics sur les graphiques suivent, et le volet suit en retour.

## Les conditions d’affichage

Une carte — ou un onglet entier — peut ne s’afficher que sous condition : en
mode édition, menu ⋯ de la carte › **Condition d’affichage…**, ou l’œil à côté du nom de
l’onglet. Trois sortes de règles, à combiner (**toutes** ou **au moins une**) :

| Règle | Exemple |
|---|---|
| **Sur un filtre** | *Statut* a exactement une valeur choisie, au moins une, aucune ; vaut, ou ne vaut pas, telle valeur |
| **Requête SQL** | `SELECT count(*) > 5000 FROM boutique.public.commandes WHERE {{statut}}` : oui si la première valeur est vraie |
| **Sur le résultat de la carte** | a au moins une ligne, aucune, au moins ou au plus N lignes |

Quand la condition n’est pas remplie, la carte ou l’onglet **disparaît** ; une carte en dessous
remonte. Une règle sur un filtre se lit sans requête, et une carte qu’elle masque ne lance pas
la sienne. Dans une requête SQL, `{{nom}}` reçoit la valeur d’un filtre, comme une condition sur
la colonne indiquée ; la requête tourne avec les droits de qui regarde, y compris sur un lien
partagé. En mode édition, tout reste visible : un badge **Conditionnelle** ou **Masquée** dit où
en est chaque carte.

## Les graphiques des cartes

Chaque carte se règle comme une question : forme (dont le **radar**), palette, couleurs par
série, mise en avant, moyenne, tri, top N… — voir [Visualisations](/insights/fonctionnalites/visualisations/)
— et peut **prolonger sa tendance** : voir [Prévisions](/insights/fonctionnalites/previsions/).

## Rafraîchissement et affichage

- **Rafraîchissement automatique** : le chronomètre de la barre — jamais, toutes les minutes,
  toutes les 5 ou 15 minutes, ou toutes les heures ; sa jauge se remplit jusqu’au prochain
  rafraîchissement.
- **Rafraîchir** relance les cartes en ignorant le cache. Les cartes restent affichées pendant
  qu’elles se recalculent : leurs marques glissent vers les nouvelles valeurs, comme quand on
  change un filtre.
- **Exporter en PDF** : une mise en pages A4 au [thème](/insights/fonctionnalites/themes/) du
  tableau, avec page de garde, filtres appliqués et pagination.
- **Plein écran**, pour un écran mural.
- **Dupliquer**, **Ajouter aux favoris**, **Partager** (voir
  [Partage](/insights/fonctionnalites/partage/)).

## Les onglets

En mode modification, la **poignée** ⋮⋮ d’un onglet le déplace (ou Alt + ← / →), l’icône de
réglages — ou un double-clic, ou un clic droit — ouvre ses réglages : son nom, un
**pictogramme** et une **couleur** (reprise par son soulignement), une **description**, sa
condition d’affichage. On y **duplique** un onglet, ses cartes avec lui, ou on le supprime.

Au survol d’un onglet, une **infobulle** montre sa description et un aperçu de ce qu’il
contient : une capture de l’onglet tel qu’on l’a vu la dernière fois, ou à défaut le plan de ses
cartes.

En mode modification aussi, une **pilule flottante** en bas de l’écran ajoute des cartes
(question, titre, texte, volet de filtre, boutons…) ; **Annuler** et **Rétablir** (Ctrl + Z,
Ctrl + Maj + Z) défont et refont chaque changement du brouillon. Une carte ajoutée est amenée
à l’écran et brille un instant.

## Vues, sélections et liens

- **Sélection précédente / suivante** : les deux flèches au bout du bandeau des filtres
  parcourent les sélections faites, en arrière comme en avant.
- **Vues enregistrées** : le menu **Vues** garde les filtres choisis et l’onglet ouvert sous un
  nom — « Bretagne, mois en cours » —, pour soi ou pour tous ; l’une peut s’ouvrir par défaut.
- **Un lien qui garde tout** : l’adresse du tableau porte l’onglet et les filtres qui
  diffèrent des valeurs par défaut. **⋯ › Copier le lien de cette vue** la copie ; qui l’ouvre
  voit la même chose (sous ses propres droits).
- **Retour depuis une question** : ouverte depuis le titre ou le menu d’une carte, une question
  affiche un bouton qui ramène au tableau, à son onglet, ses filtres et sa position.

## Commentaires et annotations

Une bulle dans l’en-tête d’une carte ouvre ses **commentaires** : « baisse due à la grève du
12 ». Tous ceux qui ouvrent le tableau les lisent et y répondent ; chacun supprime les siens.

Clic droit sur un point d’une courbe dans le temps › **Annoter ce point…** : un **repère daté**
— ou une période — avec un libellé et une couleur, tracé sur le graphique. Posé sur une question
enregistrée, il la suit partout où elle s’affiche.

## Les cartes de données

Le menu ⋯ d’une carte de question propose, en plus de rafraîchir et agrandir :

- **Exporter les données** en CSV, Excel ou JSON, avec les filtres du tableau (100 000 lignes
  au plus) ;
- **Voir en table** : les chiffres derrière le graphique, le temps d’un coup d’œil ;
- **Copier en image** : la carte dans le presse-papiers, prête à coller dans un message ;
- **Alertes…** : être prévenu quand la question franchit un seuil (voir
  [Abonnements et alertes](/insights/fonctionnalites/abonnements/)).

## Exporter et envoyer

**⋯ › Exporter en PDF…** choisit les onglets, l’orientation, le papier (A4, A3, Letter), la page
de garde, un titre et une note, puis ouvre l’aperçu. Chaque page porte en pied le logo du thème
et son numéro. **⋯ › Abonnements…** envoie le tableau à heure fixe : voir
[Abonnements et alertes](/insights/fonctionnalites/abonnements/).

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
5. à défaut, `CACHE_TTL` (300 secondes).

Les résultats sont gardés dans le catalogue PostgreSQL, partagé par toutes les répliques, avec
un petit cache en mémoire devant. **Vider le cache**, dans **Administration › Réglages**, oblige
les prochaines requêtes à interroger à nouveau les sources.

### Les tableaux préchargés

Un tableau marqué **Préchargé** (dans ses **Réglages**) est tenu au chaud par le worker : toutes
les 15 minutes, il exécute ses cartes avec les valeurs par défaut des filtres, **sous les droits
de son auteur**. Les personnes qui ont les mêmes droits que l’auteur trouvent alors leurs
résultats déjà prêts ; les autres déclenchent leurs propres requêtes, comme d’habitude.

:::tip[Un pictogramme devant le titre]
En modification, le bouton à gauche du titre d’une carte choisit son pictogramme — un picto, un emoji ou une image —, affiché ensuite dans une pastille devant le titre, et dans le PDF.
:::
