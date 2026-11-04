---
title: Abonnements et alertes
description: Recevoir un tableau de bord à heure fixe, par e-mail ou dans Teams et Slack, en PDF, en image ou en résumé ; être prévenu quand une question franchit un seuil.
---

Deux choses partent toutes seules d’eodia insights :

- un **abonnement** envoie un tableau de bord selon un calendrier — « chaque lundi à 8 h » —
  à des personnes de l’espace et dans des canaux Teams ou Slack ;
- une **alerte** vérifie une question à intervalle et prévient quand elle dit ce qu’on
  attend : « le CA du jour passe sous 10 k€ », « des lignes reviennent ».

Les deux se retrouvent dans **Abonnements et alertes**, dans le menu de votre profil.

## Abonnements

Depuis un tableau de bord, menu **⋯ › Abonnements…**, puis **Nouvel abonnement** :

| Réglage | Ce qu’il fait |
|---|---|
| **Quand** | chaque jour (certains jours seulement, si vous voulez), chaque semaine, chaque mois — le 1er, le 15, le dernier jour —, à l’heure de votre fuseau |
| **Sous quelle forme** | **PDF** joint au message, **image** dans le corps du message, ou **résumé** écrit : les chiffres clés et les premières lignes de chaque carte |
| **Avec les filtres actuels** | garde les filtres choisis à l’écran ; sinon, les valeurs par défaut du tableau |
| **Mise en page** | les onglets envoyés, l’orientation, le papier (A4, A3, Letter), la page de garde, la note qu’elle porte, les numéros de page |
| **À qui** | des personnes de l’espace |
| **Canaux Teams et Slack** | l’adresse du webhook entrant du canal (voir plus bas) |
| **Message** | l’objet de l’e-mail et un mot en tête |

Chaque ligne de la liste montre le dernier envoi (vert : parti, orange : en partie, rouge :
échoué, avec la raison au survol) et le prochain. **M’envoyer un essai** l’envoie à vous seul,
tout de suite ; **Envoyer maintenant à tous**, à tous ses destinataires.

:::note[Chacun voit ses propres chiffres]
Un destinataire reçoit le tableau de bord **tel qu’il le verrait** en l’ouvrant : chaque carte
est calculée sous son identité, ses filtres de lignes et ses masques appliqués. Quelqu’un qui ne
peut plus ouvrir le tableau ne reçoit rien. Un canal Teams ou Slack, lui, est lu par des gens
qu’eodia insights ne connaît pas : ce qui y est posté est ce que **vous** voyez.
:::

### Export PDF

Le même jeu de réglages sert à l’export à la main : menu **⋯ › Exporter en PDF…** choisit les
onglets, le papier, la page de garde, le titre et la note, puis ouvre l’aperçu à imprimer ou à
enregistrer en PDF. Les choix sont retenus pour ce tableau de bord, dans votre navigateur.

## Alertes

Depuis une question (menu **⋯ › Alertes…**) ou une carte de tableau de bord qui en montre une :

- **Un seuil est franchi** : une colonne numérique, comparée à une valeur (passe sous, dépasse,
  atteint au moins…), en lisant la première ligne, la dernière, la somme, le minimum ou le
  maximum. « CA par jour, la dernière ligne passe sous 10 000 ».
- **Des lignes reviennent** : la question renvoie au moins une ligne — des commandes bloquées,
  des tickets en retard —, ou au contraire n’en renvoie plus aucune.

Elle se vérifie toutes les 15 minutes, chaque heure, chaque jour ou chaque semaine, et prévient
**une fois**, quand la condition devient vraie (puis plus rien tant qu’elle le reste), ou **à
chaque vérification** où elle l’est. Par e-mail à vous, et dans des canaux Teams ou Slack.
**Vérifier maintenant** l’essaie tout de suite et envoie le message si elle tient.

Une alerte lit la question sous votre identité, comme tout ce que vous ouvrez.

## Teams et Slack

Un canal se branche par son **webhook entrant** :

- **Teams** : dans le canal, **Workflows › Publier sur un canal lorsqu’une requête webhook est
  reçue** ; copiez l’adresse donnée (`https://…logic.azure.com/…` ou `…powerplatform.com/…`).
- **Slack** : une application avec **Incoming Webhooks**, liée au canal ; l’adresse commence
  par `https://hooks.slack.com/`.

L’adresse est chiffrée dans le catalogue et ne revient jamais au navigateur : pour la changer,
collez-en une nouvelle. Un abonnement en image y poste l’image, un abonnement en PDF un bouton
vers le fichier (gardé un mois, derrière une adresse à jeton), un résumé ses chiffres clés.

## Installation

- Les e-mails partent par le serveur SMTP de l’instance (`SMTP_URL`). Sans lui, seuls les
  canaux reçoivent.
- Le PDF et l’image demandent un service de rendu, [Gotenberg](https://gotenberg.dev), qui
  photographie la page d’impression (`RENDER_URL`, `RENDER_PAGE_URL`) : le profil `render` du
  compose de production le lance. Sans lui, le résumé écrit part à la place.

Voir [Variables d’environnement](/insights/hebergement/variables/).
