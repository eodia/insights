---
title: Authentification unique (SSO)
description: Brancher un fournisseur OpenID Connect, recevoir des attributs et des groupes, et couper la connexion par mot de passe.
---

eodia insights accepte la connexion par mot de passe et par **OpenID Connect** (Keycloak,
Microsoft Entra ID, Google, Authentik… tout fournisseur qui publie une configuration de
découverte). Un seul fournisseur se déclare par instance, par des
[variables d’environnement](/insights/hebergement/variables/#connexion).

## Déclarer le fournisseur

Chez le fournisseur, enregistrez une application web avec cette adresse de retour :

```text
https://bi.exemple.fr/api/auth/oidc/callback
```

Elle se déduit de `PUBLIC_URL` : vérifiez que cette variable donne bien l’adresse publique
de l’instance. Puis, côté eodia insights :

```bash
OIDC_ISSUER=https://sso.exemple.fr/realms/entreprise
OIDC_CLIENT_ID=eodia-insights
OIDC_CLIENT_SECRET=…
OIDC_LABEL="Se connecter avec le compte de l’entreprise"
```

| Variable | Défaut | Rôle |
|---|---|---|
| `OIDC_ISSUER` | — | l’émetteur ; sa configuration est lue à `<émetteur>/.well-known/openid-configuration` |
| `OIDC_CLIENT_ID` | — | l’identifiant du client |
| `OIDC_CLIENT_SECRET` | — | le secret du client, s’il est confidentiel |
| `OIDC_LABEL` | `Se connecter avec SSO` | le libellé du bouton sur l’écran de connexion |
| `OIDC_SCOPES` | `openid email profile` | les portées demandées |

La connexion suit le flux *authorization code* avec **PKCE**. Le jeton d’identité est vérifié
avec les clés publiées par le fournisseur (émetteur, audience, `nonce`).

## Les comptes

À la première connexion d’une personne :

- si son identité OIDC est déjà liée à un compte, elle s’y connecte ;
- sinon, si un compte porte la même **adresse e-mail**, l’identité lui est liée ;
- sinon, un compte est **créé**, avec l’adresse et le nom transmis par le fournisseur.

Le fournisseur doit donc transmettre une adresse e-mail (`email`). Un compte désactivé dans
**Administration › Personnes** ne peut plus se connecter, même par le SSO.

Un administrateur peut aussi créer une personne **sans mot de passe** : elle se connectera par le
SSO, et son compte sera lié par son adresse.

## Les attributs

Les [règles de lignes](/insights/fonctionnalites/droits/#les-lignes) citent les attributs de la
personne qui lit, comme `{{user.region}}`. Ils peuvent venir du fournisseur :

```bash
OIDC_ATTRIBUTE_CLAIMS=region,departement
```

Chaque claim nommé est copié en attribut du même nom, et **mis à jour à chaque connexion**. Un
claim qui est une liste devient une valeur à virgules (`Bretagne,Normandie`), que les règles de
lignes lisent comme plusieurs valeurs. Un claim absent du jeton laisse l’attribut tel quel.

## Les groupes

```bash
OIDC_GROUPS_CLAIM=groups
```

Avec cette variable, les groupes du fournisseur sont **reflétés** à chaque connexion : la
personne est retirée de ses groupes personnalisés, puis ajoutée à ceux dont le **nom** figure
dans le claim. Les groupes doivent exister dans eodia insights sous le même nom ; ceux qui
n’existent pas sont ignorés. Une barre initiale est retirée (`/Ventes` devient `Ventes`, comme
Keycloak les écrit).

:::caution[Le groupe Administrateurs]
Un nom de groupe reçu dans le claim qui correspond à **Administrateurs** fait de la personne un
administrateur. Ce groupe n’est jamais retiré par le reflet : retirez-le à la main. Contrôlez
donc les noms de groupes que votre fournisseur envoie.
:::

## SSO seul

```bash
PASSWORD_LOGIN=0
```

L’écran de connexion n’offre plus que le bouton du fournisseur, et l’API refuse toute connexion
par mot de passe. Sur une instance neuve, l’écran de création du premier administrateur reste
proposé : donnez-lui **l’adresse e-mail de son compte chez le fournisseur**, puisqu’il se
connectera ensuite par le SSO et que son compte sera retrouvé par cette adresse.

**Administration › Réglages** indique si le SSO et l’envoi d’e-mails sont configurés.
