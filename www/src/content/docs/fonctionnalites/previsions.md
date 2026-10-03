---
title: Prévisions
description: Prolonger une courbe, une aire ou des barres de quelques périodes, avec la saison et un intervalle de confiance.
---

Une courbe dit ce qui s’est passé. Une **prévision** la prolonge : quelques mois, trimestres ou
jours de plus, dessinés en **pointillés verts**, sur une zone marquée « Prévision », avec la
plage dans laquelle la suite a de bonnes chances de tomber.

## Prolonger une tendance

Dans le panneau **Visualisation**, section **Prévision** : **Prolonger la tendance de** N
périodes — **+3**, **+6** ou **+12** d’un clic, jusqu’à 36.

| Ce qu’il faut | |
|---|---|
| Une forme | Lignes, Aires, Barres ou Combiné |
| Un axe | une date regroupée par **jour**, **semaine**, **mois**, **trimestre** ou **année** |
| Des données | au moins 3 périodes |

Les périodes prévues rejoignent l’axe. L’info-bulle les signale (« prévision ») et un clic sur
l’une d’elles ne filtre rien : elle n’a pas encore de lignes.

## Le dessin

- **Une série** : la prévision prend le **vert d’insights**, en pointillés ; les barres prévues
  ont un contour en pointillés et un fond léger.
- **L’intervalle à 80 %** entoure une prévision seule d’une bande verte qui **s’élargit avec
  l’horizon** : plus on regarde loin, plus la suite est incertaine. Il se masque d’un réglage.
- **Plusieurs séries** : chaque prévision garde la couleur de sa série, en pointillés — sinon on
  ne saurait plus quelle prévision prolonge quelle courbe ; elles ne s’ajoutent pas à la légende.
- Une série toujours positive (des ventes, des visites) n’est jamais prévue sous zéro.

## Les méthodes

| Méthode | Ce qu’elle fait | Quand |
|---|---|---|
| **Automatique** | choisit parmi les trois suivantes | par défaut |
| **Saison** (Holt-Winters additif) | une tendance **et** un motif qui se répète : 12 mois, 4 trimestres, 7 jours | dès que la série couvre **deux saisons** |
| **Lissée** (Holt) | une tendance qui suit les derniers mouvements | à partir de 6 points |
| **Droite** (moindres carrés) | la droite qui passe au plus près des points | sinon |

Les paramètres de lissage sont choisis en minimisant l’erreur de prévision **à un pas** sur la
série elle-même ; l’intervalle vient de cette même erreur. Le calcul se fait dans le navigateur,
sur le résultat affiché : il ne relance aucune requête et ne voit que ce que vous voyez.

:::caution[Une prévision n’est pas une promesse]
Elle prolonge ce que la série a déjà montré. Un changement que les données ne contiennent pas —
une nouvelle offre, une crise, un concurrent — n’y apparaît pas. Lisez l’intervalle autant que
la ligne.
:::

## Partout où sont vos graphiques

Les prévisions se règlent sur une question comme sur une carte de tableau de bord, et le serveur
MCP les dessine aussi dans Claude : voir [MCP](/insights/integrations/mcp/#des-graphiques-dans-la-conversation-mcp-apps).
