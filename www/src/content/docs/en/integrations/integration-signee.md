---
title: Signed embedding
description: Display a dashboard or a question in your application, filtered for each visitor, with a signed JWT.
---

**Signed embedding** displays an eodia insights dashboard or question in your
own application — a customer portal, an extranet —, with each visitor seeing only **their own**
data. Your server signs a token that says what to display, which filters to enforce and who the
visitor is; eodia insights verifies the signature and applies the permissions of a chosen group, with
row rules computed from the visitor's attributes.

The visitor has no account on the instance, and never sees the secret.

## 1. Create a secret

In **Administration › Settings › Signed embedding** (*Administration › Réglages › Intégration signée*), an administrator creates a **secret**:

- a **name**, which says where it is used ("Customer portal");
- a **group**: visitors will read data with this group's permissions, and its row rules
  will apply to their attributes.

The secret is **displayed only once**: store it in your application's server configuration.
Its identifier, the **kid**, remains visible in the list. **Revoking** (*Révoquer*) a secret
immediately cuts off all embeddings signed with it. Creation and revocation are recorded
in the audit log.

:::tip[A dedicated group]
Create a group specific to the embedding, with **Restricted** access on the relevant tables, and
row rules that reference the visitor's attributes — for example
`client_id est égal à {{user.client_id}}`. See [Permissions](/insights/en/fonctionnalites/droits/#rows).
:::

## 2. Sign a token

The token is an **HS256 JWT**, signed with the secret, whose header carries `kid` = the secret's
identifier. It is signed **server-side**, never in the browser:

```js
import jwt from 'jsonwebtoken'

const token = jwt.sign(
  {
    resource: { dashboard: '<dashboard id>' },
    params: { region: 'Bretagne' },                                 // locked filters
    user: { id: 'client-42', attributes: { region: 'Bretagne' } },  // for row rules
    exp: Math.floor(Date.now() / 1000) + 10 * 60,                   // 10 minutes
  },
  process.env.EODIA_EMBED_SECRET,
  { algorithm: 'HS256', keyid: '<secret kid>' },
)
```

| Claim | Required | Purpose |
|---|---|---|
| `resource` | yes | `{ "dashboard": "<id>" }` or `{ "question": "<id>" }` |
| `exp` | yes | the token's expiration; an expired token is rejected |
| `params` | no | the **locked filters**: by filter ID for a dashboard, by variable name for a SQL question |
| `user.id` | no | an identifier for the visitor, in your application |
| `user.attributes` | no | their attributes, referenced by row rules: `{{user.region}}` |

## 3. Display

```html
<iframe src="https://bi.exemple.fr/embed?token=<token>" width="100%" height="720" frameborder="0"></iframe>
```

The visitor sees the dashboard, its tabs and its filters — except the locked filters,
whose value never leaves the server and which they cannot change. They can use the others
freely.

## What applies

- **The content** is read under the identity of the administrator who created the secret: they must
  be able to see the requested dashboard or question.
- **The data** is read under a virtual identity, a member of the secret's group only, which
  carries the token's attributes. Trino applies this group's permissions — tables, hidden
  or masked columns, row rules — as it does for a person.
- **A missing attribute fails closed**: a visitor whose token does not carry the attribute referenced by a
  rule sees no rows.
- Two visitors with the same attributes may share the same cached results; two
  visitors with different attributes, never.

:::caution[The secret opens the group's data]
Anyone who holds the secret can sign any attributes, and therefore read everything the
group allows. Keep it server-side, give the group the bare minimum, and prefer
short-lived tokens.
:::

For sharing that is the same for everyone, without a signature, an embeddable [share link](/insights/en/fonctionnalites/partage/#share-links)
is enough.
