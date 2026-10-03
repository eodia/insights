---
title: Single sign-on (SSO)
description: Connect an OpenID Connect provider, receive attributes and groups, and turn off password sign-in.
---

eodia insights accepts sign-in with a password and with **OpenID Connect** (Keycloak,
Microsoft Entra ID, Google, Authentik… any provider that publishes a discovery configuration).
A single provider is declared per instance, through
[environment variables](/insights/en/hebergement/variables/#sign-in).

## Declaring the provider

On the provider side, register a web application with this redirect address:

```text
https://bi.example.com/api/auth/oidc/callback
```

It is derived from `EODIA_PUBLIC_URL`: check that this variable does give the instance's public
address. Then, on the eodia insights side:

```bash
EODIA_OIDC_ISSUER=https://sso.example.com/realms/company
EODIA_OIDC_CLIENT_ID=eodia-insights
EODIA_OIDC_CLIENT_SECRET=…
EODIA_OIDC_LABEL="Sign in with the company account"
```

| Variable | Default | Role |
|---|---|---|
| `EODIA_OIDC_ISSUER` | — | the issuer; its configuration is read at `<issuer>/.well-known/openid-configuration` |
| `EODIA_OIDC_CLIENT_ID` | — | the client identifier |
| `EODIA_OIDC_CLIENT_SECRET` | — | the client secret, if the client is confidential |
| `EODIA_OIDC_LABEL` | `Se connecter avec SSO` | the label of the button on the sign-in screen, not translated: set it for your readers, e.g. `Sign in with SSO` |
| `EODIA_OIDC_SCOPES` | `openid email profile` | the requested scopes |

Sign-in follows the *authorization code* flow with **PKCE**. The ID token is verified with the
keys published by the provider (issuer, audience, `nonce`).

## Accounts

The first time a person signs in:

- if their OIDC identity is already linked to an account, they sign in to it;
- otherwise, if an account has the same **e-mail address**, the identity is linked to it;
- otherwise, an account is **created**, with the address and name sent by the provider.

The provider must therefore send an e-mail address (`email`). An account deactivated in
**Administration › People** can no longer sign in, not even through SSO.

An administrator can also create a person **without a password**: they will sign in through
SSO, and their account will be linked by their address.

## Attributes

[Row rules](/insights/en/fonctionnalites/droits/#rows) reference the attributes of the person
reading, such as `{{user.region}}`. They can come from the provider:

```bash
EODIA_OIDC_ATTRIBUTE_CLAIMS=region,departement
```

Each named claim is copied into an attribute of the same name, and **updated at every
sign-in**. A claim that is a list becomes a comma-separated value (`Bretagne,Normandie`), which
row rules read as several values. A claim missing from the token leaves the attribute as it is.

## Groups

```bash
EODIA_OIDC_GROUPS_CLAIM=groups
```

With this variable, the provider's groups are **mirrored** at every sign-in: the person is
removed from their custom groups, then added to those whose **name** appears in the claim. The
groups must exist in eodia insights under the same name; those that do not exist are ignored. A
leading slash is removed (`/Sales` becomes `Sales`, as Keycloak writes them).

:::caution[The Administrators group]
A group name received in the claim that matches the name of the administrators group
(`Administrateurs` on a new instance, unless renamed) makes the person an administrator. This group is never removed by mirroring: remove it by hand. So keep
control of the group names your provider sends.
:::

## SSO only

```bash
EODIA_PASSWORD_LOGIN=0
```

The sign-in screen then offers only the provider's button, and the API refuses any password
sign-in. On a fresh instance, the screen that creates the first administrator is still offered:
give it **the e-mail address of the administrator's account at the provider**, since they will
then sign in through SSO and their account will be found by that address.

**Administration › Settings** shows whether SSO and e-mail sending
are configured.
