---
title: Visualisations
description: Vingt-quatre formes de graphiques, des palettes lisibles par tous, la mise en avant, la moyenne, le tri et le top N.
---

Le panneau **Visualisation** d’une question — ou d’une carte de tableau de bord — choisit la
forme du résultat et la règle. Les formats et l’apparence des valeurs définis dans
[Structure](/insights/fonctionnalites/sources/#les-valeurs) s’appliquent d’eux-mêmes.

## Les formes

Le sélecteur range les formes par usage. Une étincelle signale la forme **conseillée** pour le
résultat ; une forme qui ne lui convient pas est atténuée, et son info-bulle dit pourquoi.

| Famille | Formes | Pour |
|---|---|---|
| **Chiffres clés** | Nombre, Tendance, Progression, Jauge | un chiffre, son évolution, sa part d’un objectif |
| **Comparer** | Barres, Barres horizontales, **Radar**, **Barres polaires** | des catégories entre elles ; le radar compare des profils sur 3 à 30 critères, sur une échelle commune |
| **Évolution** | Lignes, Aires, Combiné, **Chandeliers**, **Course de barres**, **Course de courbes**, **Calendrier** | suivre dans le temps — et [prévoir](/insights/fonctionnalites/previsions/) ; les courses rejouent l’histoire période après période |
| **Répartition** | Camembert (sur plusieurs anneaux), **Mosaïque**, Entonnoir, **Flux (Sankey)** | des parts, des parts de parts, des étapes, des parcours |
| **Relation** | Nuage de points, **Bulles** | deux mesures l’une contre l’autre |
| **Détail** | Tableau, Tableau croisé, Carte | des lignes, une mesure croisée, des valeurs par région |

### Des parts sur plusieurs niveaux

Un **camembert à plusieurs dimensions** — par exemple type, motif, sous-motif — devient des
anneaux : le premier niveau au centre, chaque niveau suivant autour, dans les teintes de sa
part parente. Un clic sur une part zoome dessus ; un clic au centre revient. La **mosaïque**
(*treemap*) range les mêmes niveaux en tuiles imbriquées, chacune aussi grande que sa valeur ;
un clic zoome, le fil d’Ariane en haut revient en arrière. Trois niveaux au plus.

### Le calendrier

Une valeur par jour, posée sur le calendrier des trois années les plus récentes : un **point**
d’autant plus grand que la valeur, ou des **cases colorées** avec leur légende. On y voit d’un
coup les jours de la semaine, les saisons et les trous. Un clic sur un jour filtre le tableau de
bord.

### Le temps, les périodes

Sur une courbe ou une aire datée, **Axe du temps continu** espace les dates selon le temps qui
les sépare : un mois manquant laisse un vide au lieu d’être escamoté. **Périodes mises en
avant** colore une ou plusieurs périodes — une promotion, des soldes, une grève — d’une bande
nommée, et, sur une courbe seule, la courbe elle-même prend la couleur de la période.

### Les courses

Une **course de barres** fait défiler les périodes : à chaque date, les barres prennent leur
valeur et se doublent, la période s’écrit en grand dans le coin, et une frise en bas permet de
jouer, de mettre en pause ou d’aller à une date. Une **course de courbes** trace les lignes au
fil du temps, chacune nommée à sa pointe avec sa valeur ; *Rejouer* la relance.

Il leur faut une date (la course avance avec elle), une mesure, et des concurrents : les valeurs
d’une seconde dimension (des pays, des produits) ou plusieurs mesures. Réglages : la vitesse
(lente, normale, rapide), le nombre de barres affichées (5 à 20), **Cumuler les périodes** pour
une course au total plutôt qu’à la valeur du mois, et le départ à l’ouverture.

### Bulles, tendances, entonnoir en colonnes

- **Bulles** : sur deux axes — x et y deux mesures, la taille une troisième, une couleur par
  catégorie —, ou **en grappe** : une bulle par catégorie, aussi grosse que sa valeur, avec sa
  part, sa valeur ou son nom.
- **Tendance** : le chiffre, sa **courbe miniature** (aire, ligne ou barres, verte quand ça monte
  bien, rouge sinon) et sa variation par rapport à la période précédente.
- **Entonnoir en colonnes** : des colonnes reliées par des bandes qui disent la conversion de
  chaque étape.
- **Remplissage des barres** : plein, hachuré ou en dégradé — pour un graphique, ou pour tous
  par le [thème](/insights/fonctionnalites/themes/), avec l’arrondi des barres.

## Flux, chandeliers et mosaïque

- **Flux (Sankey)** : chaque dimension est une **étape** — jusqu’à cinq, par exemple segment →
  canal → statut — et des bandes relient les valeurs d’une étape à la suivante, aussi larges que
  leur valeur. Au survol d’une valeur, ses flux ressortent.
- **Chandeliers** : une date, puis quatre mesures — ouverture, haut, bas, clôture. Elles sont
  reconnues à leur nom (*open*, *ouverture*, *high*, *haut*, *low*, *bas*, *close*, *clôture*),
  sinon prises dans l’ordre. Une période en hausse est verte, une baisse rouge ; au-delà de 60
  périodes, une réglette en bas fait défiler.
- **Mosaïque** : des tuiles arrondies, légèrement dégradées, avec en haut à gauche leur nom, leur
  valeur et leur part du total. Avec plusieurs niveaux, chaque groupe est encadré à sa couleur,
  son nom et son total dans le cadre.

## Les données

La section **Données** des réglages montre les colonnes que dessine le graphique, chacune à sa
**place** — qui dépend de la forme :

| Forme | Places |
|---|---|
| Barres, lignes, aires, combiné | **Axe**, **Séries** |
| Flux (Sankey) | **Étape 1** à **Étape 5** |
| Chandeliers | **Date** ; **Ouverture**, **Haut**, **Bas**, **Clôture** |
| Nuage de points, bulles | **Axe horizontal**, **Axe vertical**, **Taille** |
| Camembert | **Parts**, **Anneau 2**, **Anneau 3** ; **Valeur** |
| Mosaïque | **Niveau 1** à **Niveau 3** ; **Valeur** |

Une colonne se déplace d’une place à l’autre **par glisser-déposer**, ou vient des **Autres
colonnes** — en la glissant, ou d’un clic qui la met où elle va le plus sûrement : un nombre parmi
les mesures, le reste parmi les dimensions.

## Comparer à une autre période

Dans les réglages d’un graphique (questions construites avec l’éditeur visuel), **Comparer**
ajoute à chaque mesure sa valeur :

- **Même période l’an dernier** : la courbe de l’an dernier, en pointillés, à côté de celle de
  cette année ;
- **Période précédente** : la période d’avant, de même durée — il faut un filtre de dates, sur
  la question ou sur le tableau de bord.

Les dates sont décalées pour que les deux périodes se superposent ; un tableau gagne une colonne
« N-1 » par mesure.

## Les couleurs

**Six palettes**, chacune un ordre de teintes : **eodia** (par défaut), **Vive**, **Océan**,
**Terre**, **Douce** et **Dégradé** (du clair au foncé, pour des catégories ordonnées — 5 au
plus). Toutes sont **validées en clair et en sombre** : deux couleurs voisines se distinguent,
y compris pour un daltonien (protanopie, deutéranopie), et chacune reste lisible sur le fond.

**Personnalisée** compose sa propre palette, jusqu’à 8 couleurs dans l’ordre. Elle est vérifiée
pendant qu’on la compose, avec les mêmes seuils : couleurs voisines confondues par un daltonien,
trop proches, trop pâles ou trop grises. En thème sombre, chaque couleur est ajustée pour rester
lisible.

**Couleur de chaque élément** : chaque série, part ou barre peut prendre sa propre couleur —
de la palette, de l’application ou n’importe laquelle —, et revenir à la palette.

L’ordre de priorité : la couleur choisie pour l’élément, puis celle de la valeur dans
[Structure](/insights/fonctionnalites/sources/#les-valeurs) (« livrée » en vert, « annulée » en
rouge, dans tous les graphiques), puis la palette. « Autres » reste gris.

## Faire parler un graphique

| Réglage | Effet |
|---|---|
| **Faire ressortir** | la plus haute, la plus basse ou la dernière valeur ressort ; les autres s’estompent |
| **Ligne de la moyenne**, **de la médiane** | une ligne de référence, avec sa valeur |
| **Objectif** | une ligne à la valeur visée, avec son libellé |
| **Ordre des catégories** | celui du résultat, décroissant, croissant, ou **Libellé** : par leur nom, les nombres dans l’ordre (« 5-9 » avant « 10-14 ») — pour une pyramide des âges, des tailles |
| **Seulement les premières** | les N plus grandes catégories ; le reste en « Autres » (qui ne compte ni dans la moyenne, ni dans la mise en avant) |
| **Prolonger la tendance** | voir [Prévisions](/insights/fonctionnalites/previsions/) |

## La forme et les étiquettes

- **Empilement** : côte à côte, empilé ou à 100 % ; les segments d’une pile sont séparés par un
  fin trait, et seul le bout de la pile est arrondi. **Total au-dessus des piles**.
- **Tracé** des lignes : droit, lissé ou en marches ; **points** selon leur nombre, toujours ou
  jamais ; **aire en dégradé**.
- **Valeurs sur les marques** : toutes quand elles sont peu nombreuses, sinon les extrêmes et la
  dernière seulement.
- Deux à quatre courbes sont **nommées au bout de leur tracé**.
- **Axes** : échelle linéaire ou logarithmique, minimum et maximum, libellés droits, inclinés ou
  verticaux, axes et grille affichés ou non.
- **Camembert** : anneau et son épaisseur, total au centre, demi-cercle, rose, ce qu’affiche
  chaque part (pourcentage, valeur, nom…), à l’intérieur ou à l’extérieur, nombre de parts avant
  « Autres ».

Les choix de quatre options au plus se font d’un clic, sur des boutons illustrés.

## Cliquer sur un graphique

Dans un tableau de bord, un clic sur une barre ou une part filtre le tableau, et **Maj** + clic
ajoute d’autres catégories : voir [Tableaux de bord](/insights/fonctionnalites/tableaux-de-bord/#cliquer-sur-un-graphique-pour-filtrer).
Dans l’éditeur, il propose de filtrer la question sur la valeur, ou de l’exclure.

## Zoomer

Sur un graphique à axes, **Ctrl** + molette (ou un pincement sur un pavé tactile) zoome le long
des catégories ou des dates — sur les deux axes pour un nuage de points —, puis un glisser se
déplace. **Réinitialiser le zoom**, en haut à droite, revient à l’ensemble. La molette seule fait
toujours défiler la page.

## Les textes

Section **Textes** d’un graphique : la **police** (une de celles des thèmes, celle du thème par
défaut), la **taille** — S, M, L ou XL, chaque texte en proportion : axes, étiquettes, légende,
totaux — et la **couleur** des textes, pour un graphique lisible de loin ou aux couleurs d’une
marque.

## Le clic droit dans un tableau

Un clic droit sur une cellule ouvre le menu du tableau, rangé par groupes :

- **Voir la ligne** : toutes ses colonnes, une par ligne, à lire ou à copier ; pour un tableau
  regroupé, **Voir les enregistrements** ouvre en plus les lignes derrière ce groupe ;
- ce que propose l’écran : filtrer le tableau de bord, ou la question, sur cette valeur ;
- **Dans cette table** : n’afficher que cette valeur, la masquer, effacer la recherche et les
  filtres — rien n’est enregistré, la table seule change ;
- **Copier la valeur**, **Copier la ligne** (avec ses en-têtes, à coller dans un tableur) ;
- **Exporter** en **CSV** ou en **Excel** les lignes que gardent la recherche et les filtres.

Sur une carte, la recherche de la table prend place dans l’en-tête, entre le titre et le menu ⋯.

## La mise en forme conditionnelle

Dans les réglages d’une table, **Mise en forme conditionnelle** colore les cellules selon leur
valeur :

- une **règle** : une colonne, un test (inférieur à, au moins, entre… ; pour un texte, **égal
  à**, **différent de**, **contient**), une couleur ; elle colore le texte ou **remplit la
  cellule**, ajoute un **pictogramme** au choix (une icône, un emoji, une image) devant la valeur,
  et peut colorer **toute la ligne** ;
- une **échelle de couleur** : du rouge au vert (ou l’inverse, ou en bleu), de la plus petite
  valeur de la colonne à la plus grande ;
- des **barres** dans les cellules, proportionnelles à la valeur.

Une règle compare la cellule à **une valeur** écrite, à **une colonne** de la même ligne (le
réalisé contre l’objectif), ou à **une variable** de la question (`{{seuil}}`) : sur un tableau de
bord, c’est la valeur du filtre relié à cette variable qui compte — le lecteur déplace le seuil,
les couleurs suivent.

Au survol de l’en-tête d’une colonne, sa **description** (saisie dans Sources de données)
s’affiche ; les colonnes décrites sont soulignées en pointillés.
