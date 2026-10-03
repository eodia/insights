---
title: Sharing
description: Organize content in folders, share it with people or groups, through a public link or in an iframe.
---

eodia insights offers two ways to give access to a question or a dashboard, which **add up**:
**folders**, whose permissions are set per group, and **item sharing**, with a specific person
or group. To show content outside the application, there are **share links** and
[signed embedding](/insights/en/integrations/integration-signee/).

:::note[Sharing content, not data]
Sharing a question gives access to its definition, not to its data: everyone sees only the rows
and columns their own permissions let them read. Only share links are an exception — see below.
:::

## Folders

**Folders** (*Dossiers*) shows the content tree: questions, models, metrics and dashboards,
organized like Metabase collections. You can search it, filter by kind, and preview an item.

- **My folder.** Each person has a personal, **private** folder: only they and the
  administrators can see it. It cannot be moved or archived.
- **Shared folders.** An administrator creates the top-level folders; a new root folder is
  first open with **Edit** (*Modification*) to **All users** (*Tous les utilisateurs*), to be
  tightened afterwards. A subfolder can be created in any folder where you have edit
  permission.
- **Permissions** — None, Read, Edit, Manage (*Aucun, Lecture, Modification, Gestion*) — are set
  per group, apply to the content and subfolders, and can be overridden further down. **Manage**
  lets you set the permissions of the folder itself. See
  [Permissions](/insights/en/fonctionnalites/droits/#folders-and-shares).
- A folder can be renamed, moved or **archived**; its archived content disappears from lists.
- **New folder** (*Nouveau dossier*), in the **Folders** section of an open folder, creates a
  subfolder in place.
- **Drag and drop**: a question, dashboard or folder can be dragged onto a subfolder, onto the
  parent folder’s tile, or onto a folder in the sidebar — which shows the whole tree, expanded
  down to the open folder. Only an administrator can place a folder at the root.
- At the top of a folder, its **icon** (an icon, an emoji or an image) and its **color** can be
  chosen; they follow it in the sidebar and in lists.
- Clicking a dashboard in a folder displays it immediately, on the right; a question shows its
  result, with a detail pane you can show or hide.

The author of an item can always edit it as long as they can see it.

**Home** (*Accueil*) gathers what you have viewed recently, your **favorites** and what is new;
the **search** in the top bar covers all the content you can open.

## Sharing an item

**Share › People and groups** (*Partager › Personnes et groupes*) adds a person or a group with
**Read** or **Edit** access. This is how you share a question from your personal folder with a
colleague, without moving it. Sharing a folder opens all of its content, subfolders included.

You must be able to edit an item to share it.

## Share links

For a question or a dashboard, **Share › Links and embedding › Create a share link** (*Partager
› Liens et intégration › Créer un lien de partage*) produces a URL:

| Item | URL |
|---|---|
| Question | `https://bi.exemple.fr/q/<jeton>` |
| Dashboard | `https://bi.exemple.fr/d/<jeton>` |

Each link has an **audience**:

| Audience | Who can open it |
|---|---|
| **Anyone with the link** (*Toute personne disposant du lien*) | anyone, without an account |
| **Signed-in members only** (*Membres connectés uniquement*) | a person signed in to the instance; through the API, it can be limited to certain groups (`groups`) |

:::caution[A link runs with its author’s permissions]
A link’s data is read **under the identity of the person who created it**. A visitor never sees
more than they do, but they see what that person sees: check what the content shows before
making it public. If the author loses access to the item, the link stops working.
:::

A visitor can adjust a shared dashboard’s filters, but cannot choose what they filter: the
mappings between filters and cards are read from the saved dashboard. Through the API, a link can
also carry **locked filters** (`locked_parameters`): their value is enforced on the server side,
and they are not shown to the visitor.

**Disabling** a link cuts it off immediately. Creating, editing and disabling a link is recorded
in the audit log.

## In an iframe

A link marked **Embeddable (iframe)** (*Intégrable (iframe)*) can be displayed in another page.
The share screen gives the code to copy:

```html
<iframe src="https://bi.exemple.fr/d/<jeton>?embed=1" width="100%" height="600" frameborder="0"></iframe>
```

Without this option, the `/q/…` and `/d/…` pages refuse to be displayed in a frame
(`Content-Security-Policy: frame-ancestors 'none'`).

:::tip[Filtering by visitor]
A link shows the same thing to everyone. For a customer portal where each visitor must see only
their own rows, use [signed embedding](/insights/en/integrations/integration-signee/): your
application signs the visitor’s identity and attributes, and row rules apply to them.
:::
