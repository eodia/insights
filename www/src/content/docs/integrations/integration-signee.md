---
title: Intégration signée
description: Afficher un tableau de bord ou une question dans votre application, filtrés pour chaque visiteur, grâce à un jeton JWT signé.
---

L’**intégration signée** affiche un tableau de bord ou une question d’eodia insights dans votre
propre application — un portail client, un extranet —, chaque visiteur ne voyant que **ses**
données. Votre serveur signe un jeton qui dit quoi afficher, quels filtres imposer et qui est le
visiteur ; eodia insights vérifie la signature et applique les droits d’un groupe choisi, avec
les règles de lignes calculées sur les attributs du visiteur.

Le visiteur n’a pas de compte sur l’instance, et ne voit jamais le secret.

## 1. Créer un secret

Dans **Administration › Réglages › Intégration signée**, un administrateur crée un **secret** :

- un **nom**, qui dit où il sert (« Portail clients ») ;
- un **groupe** : les visiteurs liront les données avec les droits de ce groupe, et ses règles
  de lignes s’appliqueront à leurs attributs.

Le secret n’est **affiché qu’une fois** : rangez-le dans la configuration serveur de votre
application. Son identifiant, le **kid**, reste visible dans la liste. **Révoquer** un secret
coupe aussitôt toutes les intégrations signées avec lui. Création et révocation sont inscrites
au journal d’audit.

:::tip[Un groupe dédié]
Créez un groupe propre à l’intégration, en accès **Restreint** sur les tables utiles, avec des
règles de lignes qui citent les attributs du visiteur — par exemple
`client_id est égal à {{user.client_id}}`. Voir [Droits](/insights/fonctionnalites/droits/#les-lignes).
:::

## 2. Signer un jeton

Le jeton est un **JWT HS256**, signé avec le secret, dont l’en-tête porte `kid` = l’identifiant
du secret. Il se signe **côté serveur**, jamais dans le navigateur :

```js
import jwt from 'jsonwebtoken'

const token = jwt.sign(
  {
    resource: { dashboard: '<id du tableau de bord>' },
    params: { region: 'Bretagne' },                                 // filtres verrouillés
    user: { id: 'client-42', attributes: { region: 'Bretagne' } },  // pour les règles de lignes
    exp: Math.floor(Date.now() / 1000) + 10 * 60,                   // 10 minutes
  },
  process.env.EODIA_EMBED_SECRET,
  { algorithm: 'HS256', keyid: '<kid du secret>' },
)
```

| Claim | Obligatoire | Rôle |
|---|---|---|
| `resource` | oui | `{ "dashboard": "<id>" }` ou `{ "question": "<id>" }` |
| `exp` | oui | l’expiration du jeton ; un jeton expiré est refusé |
| `params` | non | les **filtres verrouillés** : par identifiant de filtre pour un tableau de bord, par nom de variable pour une question SQL |
| `user.id` | non | un identifiant du visiteur, dans votre application |
| `user.attributes` | non | ses attributs, cités par les règles de lignes : `{{user.region}}` |

## 3. Afficher

```html
<iframe src="https://bi.exemple.fr/embed?token=<jeton>" width="100%" height="720" frameborder="0"></iframe>
```

Le visiteur voit le tableau de bord, ses onglets et ses filtres — sauf les filtres verrouillés,
dont la valeur ne quitte jamais le serveur et qu’il ne peut pas changer. Il manipule les autres
librement.

## Ce qui s’applique

- **Le contenu** est lu sous l’identité de l’administrateur qui a créé le secret : il doit
  pouvoir voir le tableau de bord ou la question demandés.
- **Les données** sont lues sous une identité virtuelle, membre du seul groupe du secret, qui
  porte les attributs du jeton. Trino applique les permissions de ce groupe — tables, colonnes
  cachées ou masquées, règles de lignes — comme pour une personne.
- **Un attribut absent ferme** : un visiteur dont le jeton ne porte pas l’attribut cité par une
  règle ne voit aucune ligne.
- Deux visiteurs aux mêmes attributs peuvent partager les mêmes résultats en cache ; deux
  visiteurs aux attributs différents, jamais.

:::caution[Le secret ouvre les données du groupe]
Quiconque détient le secret peut signer n’importe quels attributs, donc lire tout ce que le
groupe permet. Gardez-le côté serveur, donnez au groupe le strict nécessaire, et préférez des
jetons de courte durée.
:::

Pour un partage identique pour tous, sans signature, un [lien de partage](/insights/fonctionnalites/partage/#les-liens-de-partage)
intégrable suffit.
