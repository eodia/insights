---
title: Premiers pas
description: La démonstration, une première source, une première question et un premier tableau de bord.
---

Ce guide suppose une [pile de développement](/insights/guides/installation/#pour-développer)
lancée : l’interface répond sur [http://localhost:3100](http://localhost:3100).

## La démonstration

En développement, le premier démarrage crée une instance de démonstration : deux sources, un
dossier **Ventes** et un dossier **Service client**, une métrique, un modèle, une dizaine de
questions et un tableau de bord. L’écran de connexion rappelle les deux comptes : un clic sur
l’un d’eux remplit le formulaire.

| Compte | Mot de passe | Ce qu’il voit |
|---|---|---|
| `admin@eodia.local` | `eodia-insights` | tout : c’est un administrateur |
| `analyste@eodia.local` | `eodia-insights` | les clients de sa région et les commandes de son canal, e-mails masqués |

Les deux sources de la démo :

| Source | Moteur | Catalogue Trino | Contenu |
|---|---|---|---|
| Boutique | PostgreSQL | `boutique` | clients, commandes, produits… |
| Support client | MongoDB | `support` | tickets du service client, événements web |

### Voir les droits à l’œuvre

1. Connectez-vous en administrateur et ouvrez le tableau de bord **Ventes de la boutique**,
   dans le dossier **Ventes**. Son onglet **Service client** montre une question
   **inter-bases** : des tickets MongoDB joints aux clients PostgreSQL.
2. Ouvrez **Administration › Personnes** : l’analyste porte les attributs `region = Bretagne` et
   `canal = Web`, et fait partie du groupe **Équipe régionale**.
3. Dans **Administration › Permissions**, ce groupe lit la source Boutique en accès
   **Restreint** : une règle de lignes sur `clients` (`region = {{user.region}}`), une autre sur
   `commandes` (`canal = {{user.canal}}`), et la colonne `email` masquée.
4. Déconnectez-vous, puis connectez-vous en `analyste@eodia.local` : le même tableau de bord ne
   montre plus que la Bretagne et le canal Web. Ouvrez l’**Éditeur SQL** et lancez
   `SELECT * FROM boutique.public.clients` : le résultat est filtré de la même façon, et les
   e-mails sont masqués. C’est Trino qui applique ces règles, pas l’interface.

## Une première source

Il faut le droit **Gérer les sources** (les administrateurs l’ont).

1. Ouvrez **Sources de données**, puis **Ajouter une source**.
2. Choisissez le moteur, puis remplissez la connexion : hôte, port, base, utilisateur, mot de
   passe… Le nom du catalogue Trino se déduit du nom de la source.
3. **Tester la connexion** essaie le pilote natif du moteur.
4. **Ajouter et synchroniser** crée le catalogue dans Trino, enregistre la source et lance la
   synchronisation du schéma, dont la progression s’affiche.

:::tip[localhost en développement]
En développement, Trino tourne dans Docker : un hôte `localhost` est traduit automatiquement en
`host.docker.internal` pour que Trino joigne une base de votre machine.
:::

Une nouvelle source est lisible par le groupe **Tous les utilisateurs**, qui peut aussi y écrire
du SQL. Resserrez ces droits dans **Administration › Permissions** si besoin. Le détail est dans
[Sources de données](/insights/fonctionnalites/sources/).

## Une première question

1. Depuis l’accueil, **Explorer une table**, ou **Nouveau › Question** dans la barre du haut.
2. Dans **Données**, choisissez une table (ou un modèle).
3. **Filtrer** : par exemple `statut` est `livrée`.
4. **Résumer** : une mesure (`Somme` de `montant_total`) et un regroupement (`passee_le` par
   mois). Les colonnes des tables liées par une clé étrangère sont proposées aussi : la jointure
   se fait seule.
5. Choisissez une visualisation dans le panneau de droite, puis **Enregistrer** : nom,
   description et dossier.

Vous préférez le SQL ? **Nouveau › Requête SQL** ouvre l’éditeur SQL, où `Ctrl+Entrée` exécute
la requête (ou la sélection). Voir [Questions](/insights/fonctionnalites/questions/).

## Un premier tableau de bord

1. **Nouveau › Tableau de bord**, puis choisissez son nom et son dossier.
2. En mode édition, **Ajouter une question** pose une carte ; des cartes de titre, de texte
   (Markdown) et de page intégrée s’ajoutent aussi.
3. **Filtre** ajoute un filtre (période, catégorie, texte, nombre ou granularité de date) ; sur
   chaque carte, choisissez la colonne qu’il restreint.
4. **Enregistrer**. Le tableau se partage ensuite depuis **Partager**, avec des personnes, des
   groupes ou par un lien.

Une question ouverte s’ajoute aussi à un tableau existant par **Ajouter à un tableau de bord**.
Voir [Tableaux de bord](/insights/fonctionnalites/tableaux-de-bord/).
