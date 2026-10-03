---
title: Partage
description: Ranger le contenu dans des dossiers, le partager avec des personnes ou des groupes, par un lien public ou dans une iframe.
---

eodia insights offre deux façons de donner accès à une question ou un tableau de bord, qui
**s’additionnent** : les **dossiers**, dont les droits se règlent par groupe, et le **partage
d’élément**, avec une personne ou un groupe précis. Pour montrer un contenu hors de
l’application, il y a les **liens de partage** et l’[intégration signée](/insights/integrations/integration-signee/).

:::note[Partager le contenu, pas les données]
Partager une question donne accès à sa définition, pas à ses données : chacun ne voit que les
lignes et les colonnes que ses propres droits lui laissent lire. Seuls les liens de partage font
exception — voir plus bas.
:::

## Les dossiers

**Dossiers** montre l’arborescence du contenu : questions, modèles, métriques et tableaux de
bord, rangés comme dans les collections de Metabase. On y cherche, on filtre par nature, on
prévisualise un élément.

- **Mon dossier.** Chaque personne a un dossier personnel, **privé** : seuls elle et les
  administrateurs le voient. Il ne se déplace ni ne s’archive.
- **Les dossiers partagés.** Un administrateur crée les dossiers de premier niveau ; un nouveau
  dossier racine est d’abord ouvert en **Modification** à **Tous les utilisateurs**, à resserrer
  ensuite. Un sous-dossier se crée dans tout dossier où l’on a le droit de modifier.
- **Les droits** — Aucun, Lecture, Modification, Gestion — se règlent par groupe, valent pour le
  contenu et les sous-dossiers, et se surchargent plus bas. **Gestion** permet de régler les
  droits du dossier lui-même. Voir [Droits](/insights/fonctionnalites/droits/#les-dossiers-et-les-partages).
- Un dossier se renomme, se déplace ou s’**archive** ; son contenu archivé disparaît des listes.
- **Nouveau dossier**, dans la section **Dossiers** d’un dossier ouvert, crée un sous-dossier sur
  place.
- **Glisser-déposer** : une question, un tableau ou un dossier se glisse sur un sous-dossier, sur
  la tuile du dossier parent, ou sur un dossier de la barre latérale — qui montre toute
  l’arborescence, dépliée jusqu’au dossier ouvert. Seul un administrateur range un dossier à la
  racine.
- En tête d’un dossier, son **picto** (un picto, un emoji ou une image) et sa **couleur** se
  choisissent ; ils le suivent dans la barre latérale et les listes.
- Cliquer sur un tableau de bord dans un dossier l’affiche aussitôt, à droite ; une question
  montre son résultat, avec un volet de détail que l’on affiche ou masque.

L’auteur d’un élément peut toujours le modifier dès qu’il peut le voir.

**Accueil** rassemble ce que vous avez consulté récemment, vos **favoris** et les nouveautés ;
la **recherche** de la barre du haut couvre tout le contenu que vous pouvez ouvrir.

## Partager un élément

**Partager › Personnes et groupes** ajoute une personne ou un groupe avec l’accès **Lecture** ou
**Modification**. On partage ainsi une question de son dossier personnel avec un collègue, sans
la déplacer. Partager un dossier ouvre tout son contenu, sous-dossiers compris.

Il faut pouvoir modifier un élément pour le partager.

## Les liens de partage

Pour une question ou un tableau de bord, **Partager › Liens et intégration › Créer un lien de
partage** produit une adresse :

| Élément | Adresse |
|---|---|
| Question | `https://bi.exemple.fr/q/<jeton>` |
| Tableau de bord | `https://bi.exemple.fr/d/<jeton>` |

Chaque lien a une **audience** :

| Audience | Qui l’ouvre |
|---|---|
| **Toute personne disposant du lien** | n’importe qui, sans compte |
| **Membres connectés uniquement** | une personne connectée à l’instance ; par l’API, on peut la limiter à certains groupes (`groups`) |

:::caution[Un lien s’exécute avec les droits de son auteur]
Les données d’un lien sont lues **sous l’identité de la personne qui l’a créé**. Un visiteur ne
voit jamais plus qu’elle, mais il voit ce qu’elle voit : vérifiez ce que montre le contenu avant
de le rendre public. Si l’auteur perd l’accès à l’élément, le lien cesse de fonctionner.
:::

Un visiteur peut manipuler les filtres d’un tableau de bord partagé, mais il ne choisit pas ce
qu’ils filtrent : les correspondances entre filtres et cartes sont lues dans le tableau
enregistré. Par l’API, un lien peut aussi porter des **filtres verrouillés**
(`locked_parameters`) : leur valeur est imposée côté serveur, et ils n’apparaissent pas au
visiteur.

**Désactiver** un lien le coupe aussitôt. Créer, modifier et désactiver un lien est inscrit au
journal d’audit.

## Dans une iframe

Un lien marqué **Intégrable (iframe)** peut s’afficher dans une autre page. L’écran de partage
donne le code à copier :

```html
<iframe src="https://bi.exemple.fr/d/<jeton>?embed=1" width="100%" height="600" frameborder="0"></iframe>
```

Sans cette option, les pages `/q/…` et `/d/…` interdisent d’être affichées dans un cadre
(`Content-Security-Policy: frame-ancestors 'none'`).

:::tip[Filtrer selon le visiteur]
Un lien montre la même chose à tout le monde. Pour un portail client où chaque visiteur ne doit
voir que ses propres lignes, utilisez l’[intégration signée](/insights/integrations/integration-signee/) :
votre application signe l’identité et les attributs du visiteur, et les règles de lignes
s’appliquent à lui.
:::
