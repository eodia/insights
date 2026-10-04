---
title: Droits et groupes
description: Groupes, accès aux données, niveaux de requête, colonnes cachées ou masquées, règles de ligne, droits de dossier et partages.
---

Les droits s’accordent à des **groupes**, jamais à des personnes une par une, et ils
**s’additionnent** : une personne reçoit l’union des droits de tous ses groupes. Les droits sur
les données sont appliqués **par Trino lui-même**, qui interroge l’API avant chaque instruction :
l’éditeur visuel, le SQL, les tableaux de bord, le copilot, l’API et le serveur MCP passent tous
par là. Voir [Principes](/insights/architecture/principes/).

## Groupes et personnes

Deux groupes existent toujours :

| Groupe | Rôle |
|---|---|
| **Administrateurs** | lisent tout, peuvent tout faire ; leurs droits ne se règlent pas |
| **Tous les utilisateurs** | chaque personne en fait partie ; sa liste ne se modifie pas. Ce qu’on lui accorde, tout le monde l’a |

Les autres groupes se créent dans **Administration › Groupes**. Accordez les accès larges à des
groupes dédiés plutôt qu’à **Tous les utilisateurs**.

Dans **Administration › Personnes**, un administrateur :

- **crée** une personne, avec un mot de passe (10 caractères au moins) ou sans — elle se
  connectera alors par l’[authentification unique](/insights/hebergement/sso/) ;
- l’**invite** : un lien valable 7 jours, envoyé par e-mail si un serveur SMTP est configuré, à
  transmettre à la main sinon ;
- règle ses **groupes** et ses **attributs** ;
- la **désactive** : ses sessions sont aussitôt fermées.

### Les droits d’administration

Sans être administrateur, un groupe peut recevoir trois droits, que seuls les administrateurs
accordent :

| Droit | Permet |
|---|---|
| **Gérer les sources** | connecter des bases, modifier leurs réglages, lancer une synchronisation |
| **Gérer les métadonnées** | libellés, descriptions, types sémantiques, relations et valeurs dans **Structure** |
| **Gérer les permissions** | groupes, membres, droits sur les données |

## L’accès aux données

**Administration › Permissions** règle, pour un groupe, l’accès à une **source** entière, puis
l’affine par **schéma** ou par **table**. Pour un groupe, le réglage le plus précis l’emporte ;
**Hérité** reprend le niveau du dessus.

| Accès | Effet |
|---|---|
| **Aucun accès** | la source, le schéma ou la table n’existent pas pour le groupe |
| **Lecture** | toutes les lignes et toutes les colonnes |
| **Restreint** | lisible, sous les règles de colonnes et de lignes du groupe ; jamais en SQL natif |

« Lecture » l’emporte sur « Restreint » : si un autre groupe de la personne lit la table en
entier, les règles de colonnes et de lignes de ce groupe ne s’appliquent pas.

Une table interdite est invisible partout : l’autocomplétion ne la propose pas, `SHOW TABLES` ne
la liste pas, et une requête qui la cite échoue avec « Accès aux données refusé ».

### Le niveau de requête

À côté de l’accès, chaque groupe reçoit un **niveau de requête** par source : ce qu’il peut
**écrire** contre elle.

| Niveau | Permet |
|---|---|
| **Aucune requête** | lire les questions et tableaux de bord existants, sans en écrire |
| **Éditeur visuel** | construire des questions à la souris |
| **SQL** | écrire du SQL Trino, des colonnes personnalisées et des conditions SQL |
| **SQL natif** | écrire dans le dialecte de la base, si la source l’autorise |

:::caution[Le SQL natif suppose un accès complet]
Une requête native est envoyée telle quelle à la base : Trino ne peut pas y appliquer de règle.
Elle n’est donc permise qu’à qui a le niveau **SQL natif** **et** lit toute la source en
**Lecture**, sans aucun schéma ni table restreint. Un groupe en accès « Restreint » écrit en SQL
Trino.
:::

## Les colonnes

Sur une table en accès **Restreint**, chaque colonne se règle pour le groupe :

| Accès | Effet |
|---|---|
| **Lisible** | la valeur telle quelle (par défaut) |
| **Masquée** | la colonne existe, mais Trino remplace sa valeur |
| **Cachée** | la colonne n’existe plus pour le groupe : absente de `SELECT *`, refusée si on la nomme |

Le masque d’une colonne masquée est une **expression Trino** sur la colonne, par exemple
`substr(email, 1, 3) || '…'`. Sans expression, un texte garde ses deux premiers caractères
suivis de `•••`, et toute autre valeur devient `NULL`.

## Les lignes

Une table en accès **Restreint** peut porter, pour un groupe, une **règle de lignes** : des
conditions sur ses colonnes, combinées par **toutes les conditions** (et) ou **au moins une
condition** (ou). Opérateurs : est égal à, est différent de, est parmi, n’est pas parmi,
supérieur, inférieur, contient, est vide, n’est pas vide.

Une valeur peut citer un **attribut de la personne qui lit** :

```text
region   est égal à   {{user.region}}
canal    est parmi    {{user.canaux}}
vendeur  est égal à   {{user.email}}
```

La règle est traduite en un **filtre de ligne** que Trino ajoute à chaque lecture de la table,
d’où qu’elle vienne.

- **Les attributs** se saisissent sur la personne (**Administration › Personnes**), ou viennent
  des claims de votre fournisseur [OIDC](/insights/hebergement/sso/). Trois sont intégrés et ne se
  saisissent pas : `{{user.id}}`, `{{user.email}}` et `{{user.name}}`.
- **Plusieurs valeurs.** Un attribut qui contient des virgules (`Bretagne,Normandie`) vaut
  plusieurs valeurs : `est égal à {{user.region}}` laisse alors passer les deux régions.
- **Un attribut absent ferme.** Une personne sans l’attribut cité ne voit **aucune** ligne : un
  attribut manquant n’ouvre jamais l’accès.
- **Plusieurs groupes.** Une personne voit les lignes que laisse passer l’une de ses règles. Un
  groupe en accès Restreint **sans règle** sur la table en lit toutes les lignes.
- **Une règle cassée ferme.** Si une colonne citée disparaît, la règle ne laisse plus rien
  passer, plutôt que tout.

:::tip[Vérifier une règle]
Connectez-vous avec un compte de test du groupe, ou regardez la démonstration : l’analyste
`analyste@eodia.local` lit `clients` sous `region = {{user.region}}`. Voir
[Premiers pas](/insights/guides/premiers-pas/#voir-les-droits-à-lœuvre).
:::

## Les dossiers et les partages

Le contenu — questions, modèles, métriques, tableaux de bord — se range dans des **dossiers**,
dont les droits se règlent aussi par groupe, dans l’onglet **Dossiers** de
**Administration › Permissions** :

| Droit | Permet |
|---|---|
| **Aucun** | le dossier est invisible |
| **Lecture** | ouvrir son contenu |
| **Modification** | y créer, modifier, déplacer et supprimer du contenu |
| **Gestion** | et régler les droits du dossier |

Les droits d’un dossier valent pour son contenu et ses sous-dossiers, sauf réglage plus fin. Les
dossiers personnels restent privés. Un élément peut en plus être **partagé** avec une personne
ou un groupe, en lecture ou en modification. Les deux mécanismes s’additionnent : voir
[Partage](/insights/fonctionnalites/partage/).

:::note[Le contenu n’ouvre pas les données]
Voir une question ne donne aucun droit sur ses données. Une personne qui ouvre un tableau de bord
partagé n’y voit que ce que ses propres droits lui laissent lire, et une carte dont la source lui
est interdite affiche « Accès aux données refusé ».
:::

## Sessions et jetons

- La session est un cookie `httpOnly`, `SameSite=Lax`, valable 14 jours par défaut
  (`SESSION_DAYS`) ; il devient `Secure` quand l’adresse publique est en `https://`.
- Toute écriture faite avec ce cookie exige l’en-tête `X-Eodia-Csrf: 1`, qu’un autre site ne peut
  pas poser.
- Un [jeton d’intégration](/insights/integrations/api-rest/#les-jetons) `eoi_…` porte les droits
  de son propriétaire, ni plus ni moins.

## Le journal d’audit

**Administration › Journal d’audit** garde une trace de chaque action sensible : échecs de
connexion, changements de mot de passe, personnes, groupes et membres, permissions, sources et
métadonnées, dossiers, partages et liens, jetons, invitations, secrets d’intégration et
réglages. On le filtre par type d’action ou par personne.
