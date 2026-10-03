---
title: Sources de données
description: Connecter une base parmi sept moteurs, la synchroniser, puis la décrire dans l’écran Structure.
---

Une **source** est une base de données branchée sur eodia insights. Chaque source devient un
**catalogue Trino** : ses tables se citent en SQL `catalogue.schéma.table`, et une même requête
peut joindre plusieurs sources. Ajouter, modifier ou supprimer une source demande le droit
**Gérer les sources**.

## Les sept moteurs

| Moteur | Connecteur Trino | Connexion | SQL natif |
|---|---|---|---|
| **PostgreSQL** | `postgresql` | hôte, port (5432), base, utilisateur, mot de passe, SSL | oui |
| **MySQL / MariaDB** | `mysql` | hôte, port (3306), base facultative, utilisateur, mot de passe, SSL | oui |
| **SQL Server** | `sqlserver` | hôte, port (1433), base, utilisateur, mot de passe, chiffrement, confiance dans le certificat | oui |
| **Oracle** | `oracle` | hôte, port (1521), nom de service, utilisateur, mot de passe | oui |
| **Snowflake** | `snowflake` | compte, utilisateur, mot de passe, base, entrepôt, rôle facultatif | oui |
| **MongoDB** | `mongodb` | chaîne de connexion `mongodb://…` | non |
| **Connecteur Trino (avancé)** | celui que vous nommez | nom du connecteur et propriétés `clé=valeur` | non |

Sans base précisée, une source MySQL expose comme schémas toutes les bases visibles par
l’utilisateur. Le moteur **Connecteur Trino** ouvre tout connecteur que votre Trino connaît —
`tpch`, `iceberg`, `hive`, `clickhouse`… — avec ses propriétés, une par ligne, comme dans un
fichier de catalogue.

Les champs secrets (mots de passe, chaîne de connexion MongoDB, propriétés d’un connecteur Trino)
sont **chiffrés** en AES-256-GCM avec la clé de l’instance, et jamais renvoyés au navigateur :
laissés vides dans le formulaire de modification, ils gardent leur valeur.

## Ajouter une source

**Sources de données › Ajouter une source**, puis le moteur et le formulaire de connexion.

1. **Tester la connexion** essaie le **pilote natif** du moteur. Les pilotes natifs ne servent
   qu’à cela et à l’introspection : aucune requête de données ne passe par eux.
2. **Ajouter et synchroniser** teste à nouveau, crée le catalogue dans Trino
   (`CREATE CATALOG … USING …`), enregistre la source, puis lance la synchronisation. Une source
   que Trino refuse d’ouvrir n’est pas enregistrée.

Le **nom du catalogue** se déduit du nom de la source (`Ventes Europe` → `ventes_europe`) :
minuscules, chiffres et `_`, en commençant par une lettre. Il ne change plus ensuite, puisque le
SQL le cite.

À sa création, une source est lisible par le groupe **Tous les utilisateurs**, qui peut y écrire
du SQL Trino. Resserrez ces droits dans [Permissions](/insights/fonctionnalites/droits/).

:::note[Deux chemins vers la base]
Le test de connexion part de l’API, les requêtes partent de Trino : en production, les deux
doivent joindre la base. En développement, un hôte `localhost` est traduit en
`host.docker.internal` pour Trino, qui tourne dans Docker
(`EODIA_TRINO_LOCALHOST_ALIAS`).
:::

### Options

| Option | Effet |
|---|---|
| **Synchronisation du schéma** | toutes les heures (par défaut), tous les jours, ou manuelle uniquement |
| **Autoriser le SQL natif** | permet aux personnes autorisées d’écrire dans le dialecte de la base (activé par défaut) |
| **Cache des résultats (secondes)** | la durée de cache des résultats lus dans cette source ; vide : celle de l’instance |
| **Propriétés du catalogue Trino** (Avancé) | ajoutées aux réglages par défaut du connecteur |

Chaque catalogue SQL reçoit d’office un cache de métadonnées de 10 minutes
(`metadata.cache-ttl=10m`) et la correspondance des noms sans tenir compte de la casse. L’onglet
**Avancé** ajoute ou remplace des propriétés : délais, *pushdown*, taille du cache…

Supprimer une source retire son catalogue de Trino, ses métadonnées et ses permissions ; les
questions qui l’utilisent ne fonctionnent plus.

## La synchronisation

**Synchroniser le schéma de la base de données** lance un job de fond en trois passes, dont
l’écran suit la progression en direct :

1. **Schéma** : les schémas, tables et colonnes lus dans l’`information_schema` de Trino,
   complétés par le pilote natif — clés primaires et étrangères, commentaires, volumétrie
   estimée. Le résultat est comparé à la structure connue : les nouveautés s’ajoutent, ce qui a
   disparu est marqué **retiré** sans perdre ses métadonnées, et un changement de type est
   signalé.
2. **Empreinte** : sur un échantillon de 10 000 lignes, le nombre de valeurs distinctes, la part
   de nulls, le minimum, le maximum, la moyenne ou la longueur moyenne. Elle sert à
   **pré-deviner le type sémantique** et le format de chaque colonne.
3. **Valeurs** : les valeurs distinctes des colonnes de catégorie (1 000 au plus), qui alimentent
   les listes des filtres et l’apparence des valeurs.

Les schémas système de chaque moteur sont ignorés. Si le pilote natif échoue, la synchronisation
se contente de Trino : clés et commentaires restent simplement inconnus cette fois.

:::tip[Ce que vous écrivez n’est jamais écrasé]
Le type sémantique deviné n’est qu’une proposition : ce que vous choisissez dans **Structure**
prime, et une synchronisation ne le remplace pas.
:::

## L’écran Structure

**Structure** montre l’arbre source › schéma › table à gauche, les colonnes de la table à
droite. Tout le monde le consulte pour les tables qu’il peut lire ; le modifier demande le droit
**Gérer les métadonnées**.

### La table

| Réglage | Rôle |
|---|---|
| **Libellé** et **description** | ce que contient la table, pour les analystes et le copilot |
| **Entité** | ce qu’une ligne représente : *Commande*, *Client*… |
| **Couleur** et **picto** | l’apparence de la table dans les listes (voir ci-dessous) |
| **Visibilité** | normale, masquée ou technique |
| **Colonne d’affichage** | ce qui nomme une ligne quand une autre table y fait référence |

Une table ou une colonne **masquée** n’est plus proposée par l’autocomplétion du SQL ni aux
recherches du copilot et du serveur MCP ; une colonne masquée disparaît aussi des listes de
l’éditeur visuel. C’est un réglage de confort, pas une
permission : pour interdire une colonne, voir [Droits](/insights/fonctionnalites/droits/).

### La colonne

| Réglage | Rôle |
|---|---|
| **Libellé**, **description**, **visibilité** | comme pour la table |
| **Type sémantique** | ce que la colonne signifie (voir ci-dessous) |
| **Format** | comment ses valeurs s’affichent |
| **Clé étrangère** | la colonne qu’elle désigne dans une autre table |
| **Unité** | `kg`, `km`, `€`, `jours`… |

L’écran montre aussi l’**empreinte** de la colonne (échantillon, valeurs distinctes, nulls,
minimum, maximum, moyenne), son type Trino et son type natif, et signale un changement de type
survenu à la dernière synchronisation.

Les **types sémantiques** :

| Famille | Types |
|---|---|
| Identité | clé primaire, clé étrangère, nom d’entité, titre |
| Catégorie | catégorie, statut, booléen métier |
| Texte | description, commentaire, e-mail, URL, URL d’image, avatar, téléphone, JSON |
| Géographie | pays, région, ville, code postal, adresse, latitude, longitude |
| Temps | date de création, de mise à jour, d’événement, de naissance, d’annulation |
| Mesure | montant, prix, coût, remise, pourcentage, quantité, score, note, durée |

Les **formats** :

- **nombre** : entier, décimal, pourcentage (stocké en ratio ou non), devise, durée (avec
  l’unité stockée), note (avec son maximum), compact ; décimales, préfixe, suffixe, séparateurs
  de milliers ;
- **date** : style par défaut, court, long, relatif ou motif personnalisé
  (`dd/MM/yyyy HH:mm`) ; heures ou secondes ; granularité par défaut ; fuseau horaire.

Ces métadonnées servent partout : visualisations, formats d’affichage, listes de filtres,
jointures implicites de l’éditeur visuel et contexte du copilot.

### Les valeurs

Pour une colonne de catégorie, l’onglet **Valeurs** liste les valeurs relevées par la
synchronisation. Chacune reçoit un **libellé**, une **couleur**, un **picto** ou une **image** :
`expédiée` s’affiche alors « Expédiée », en bleu, avec un camion. Les résultats, les filtres et
**les graphiques** reprennent cette apparence : une valeur colorée garde sa couleur dans toutes
les séries, les parts et les barres (voir [Visualisations](/insights/fonctionnalites/visualisations/#les-couleurs)).

### Les pictos

Partout où un picto se choisit — une table, une valeur, un dossier —, le sélecteur a trois
onglets :

- **Pictos** : près de 300 pictos rangés par thème (statuts, commerce, personnes, lieux, temps,
  données, communication, technique, documents, nature), et une recherche parmi les plus de
  2 000 de [lucide](https://lucide.dev/icons) — les noms sont en anglais : `truck`, `star`… ;
- **Emoji** : par thème, ou collé ;
- **Image** : un logo, une photo, un drapeau, par son adresse `https://`, avec un aperçu.

### Les relations

**Voir les relations** ouvre le diagramme d’une source : ses tables et leurs clés étrangères,
**détectées** par le pilote natif ou **déclarées à la main**. Tirez d’une colonne vers la clé
d’une autre table pour déclarer une relation ; sélectionnez-en une et appuyez sur Suppr pour la
retirer. C’est indispensable pour MongoDB, dont aucune clé n’est détectée : sans relation,
l’éditeur visuel ne peut pas joindre ses collections d’elles-mêmes.

### Copier, coller, décrire

- **Copier la configuration** d’une table ou d’une colonne la place en JSON dans le
  presse-papiers ; **Coller une configuration** l’applique ailleurs. Les colonnes sont
  rapprochées par leur nom, les absentes restent inchangées.
- **Décrire avec le copilot** demande au [copilot](/insights/fonctionnalites/copilot/) un
  libellé, une description et, pour chaque colonne, un libellé, une description et un type
  sémantique. Vous appliquez ou non sa proposition.
