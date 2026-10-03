---
title: Assistant IA
description: Converser avec ses données dans un écran dédié — réponses rédigées, graphiques interactifs, historique gardé, sources au choix.
---

L’**assistant IA** (menu de gauche, sous *Accueil*) est le moteur du [copilot](/insights/fonctionnalites/copilot/)
dans un écran à lui, pour converser avec ses données sans quitter la page.

## Ce qu’il fait

- Il **cherche** les tables, modèles et métriques qui répondent à la question, lit leur
  description, **écrit le SQL** et l’**exécute sous vos droits** : Trino applique vos
  permissions, colonnes masquées et règles de lignes comprises.
- Il **montre les données en graphiques**, dans la conversation : chaque graphique est
  interactif, change de forme d’un clic (barres, courbes, aires, camembert, tableau), montre son
  SQL et s’**enregistre comme question** pour finir dans un tableau de bord.
- Il **rédige** sa réponse : ce qu’on voit, les points saillants, des tableaux quand c’est utile.
- Chaque étape s’affiche pendant qu’il travaille : recherche dans le schéma, lecture d’une
  table, exécution de la requête, préparation du graphique.

## Filtrer les sources

Le bouton **Toutes les sources**, dans la zone de saisie, limite l’assistant à une ou plusieurs
sources de données : il ne cherche que dans leurs tables. Le choix est gardé d’une visite à
l’autre.

## L’historique

Chaque conversation est enregistrée, **pour vous seul** : la colonne de gauche les range par
date (aujourd’hui, hier, 7 et 30 derniers jours), les cherche, les renomme (double-clic) et les
supprime. Une conversation rouverte retrouve ses graphiques, recalculés sous vos droits du
moment. Son adresse peut se garder en favori.

:::note
L’assistant demande un fournisseur d’IA configuré sur l’instance (voir
[Variables d’environnement](/insights/hebergement/variables/)) ; sans lui, l’entrée n’apparaît
pas dans le menu.
:::
