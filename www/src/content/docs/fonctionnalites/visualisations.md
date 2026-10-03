---
title: Visualisations
description: Seize formes de graphiques, des palettes lisibles par tous, la mise en avant, la moyenne, le tri et le top N.
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
| **Comparer** | Barres, Barres horizontales, **Radar** | des catégories entre elles ; le radar compare des profils sur 3 à 30 critères, sur une échelle commune |
| **Évolution** | Lignes, Aires, Combiné | suivre dans le temps — et [prévoir](/insights/fonctionnalites/previsions/) |
| **Répartition** | Camembert, Entonnoir | des parts, des étapes |
| **Relation** | Nuage de points | deux mesures l’une contre l’autre |
| **Détail** | Tableau, Tableau croisé, Carte | des lignes, une mesure croisée, des valeurs par région |

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
| **Ordre des catégories** | celui du résultat, décroissant ou croissant |
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
