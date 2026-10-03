/**
 * Droits sur le contenu, deux mécanismes qui se cumulent :
 * - droits de dossier par groupe (`none`, `view`, `edit`, `manage`), hérités par les sous-dossiers
 *   sauf surcharge ;
 * - partage d'un élément (ou d'un dossier) à une personne ou un groupe, `view` ou `edit`.
 * L'accès effectif est l'union : dossier parent, partages directs, propriété. Un dossier
 * personnel appartient à son propriétaire ; les administrateurs les voient tous.
 */
import type { ContentAccess, ItemKind } from '@eodia/contracts'
import { isAdmin, userOf } from '../access/decide'
import type { Snapshot } from '../access/snapshot'
import type { Core } from '../context'

const ORDER: readonly (ContentAccess | 'none')[] = ['none', 'view', 'edit', 'manage']
const max = (a: ContentAccess | 'none', b: ContentAccess | 'none') => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b)

interface FolderNode {
  readonly id: string
  readonly parent: string | null
  readonly name: string
  readonly personal: string | null
  readonly archived: boolean
}

interface Share {
  readonly item_kind: ItemKind
  readonly item_id: string
  readonly principal_kind: 'user' | 'group'
  readonly principal_id: string
  readonly access: 'view' | 'edit'
}

export class ContentIndex {
  readonly folders: ReadonlyMap<string, FolderNode>
  private readonly perms: ReadonlyMap<string, ReadonlyMap<string, ContentAccess | 'none'>>
  private readonly shares: ReadonlyMap<string, readonly Share[]>
  private readonly memo = new Map<string, ContentAccess | 'none'>()

  constructor(
    readonly snap: Snapshot,
    readonly userId: string,
    folders: readonly FolderNode[],
    perms: readonly { folder_id: string; group_id: string; access: ContentAccess | 'none' }[],
    shares: readonly Share[],
  ) {
    this.folders = new Map(folders.map((f) => [f.id, f]))
    const p = new Map<string, Map<string, ContentAccess | 'none'>>()
    for (const r of perms) {
      const m = p.get(r.folder_id) ?? new Map()
      m.set(r.group_id, r.access)
      p.set(r.folder_id, m)
    }
    this.perms = p
    const s = new Map<string, Share[]>()
    for (const r of shares) {
      const key = `${r.item_kind}:${r.item_id}`
      const list = s.get(key) ?? []
      list.push(r)
      s.set(key, list)
    }
    this.shares = s
  }

  get admin(): boolean {
    return isAdmin(this.snap, this.userId)
  }

  private sharedAccess(kind: ItemKind, id: string): ContentAccess | 'none' {
    const groups = userOf(this.snap, this.userId)?.groups ?? new Set<string>()
    let out: ContentAccess | 'none' = 'none'
    for (const s of this.shares.get(`${kind}:${id}`) ?? []) {
      if ((s.principal_kind === 'user' && s.principal_id === this.userId) || (s.principal_kind === 'group' && groups.has(s.principal_id))) {
        out = max(out, s.access)
      }
    }
    return out
  }

  /** The person's access to a folder: nearest explicit right per group, personal ownership, shares. */
  folder(id: string | null): ContentAccess | 'none' {
    if (id === null) return this.admin ? 'manage' : 'view'
    const cached = this.memo.get(id)
    if (cached !== undefined) return cached
    const f = this.folders.get(id)
    let out: ContentAccess | 'none' = 'none'
    if (f) {
      const root = this.personalRoot(id)
      if (root !== null) {
        out = root === this.userId || this.admin ? 'manage' : 'none'
      } else if (this.admin) {
        out = 'manage'
      } else {
        const groups = userOf(this.snap, this.userId)?.groups ?? new Set<string>()
        for (const g of groups) {
          // The nearest folder, this one or an ancestor, with a right for this group.
          let cursor: string | null = id
          while (cursor !== null) {
            const right = this.perms.get(cursor)?.get(g)
            if (right !== undefined) {
              out = max(out, right)
              break
            }
            cursor = this.folders.get(cursor)?.parent ?? null
          }
        }
      }
      // A folder shared — or one of its ancestors — opens its content.
      let cursor: string | null = id
      while (cursor !== null) {
        out = max(out, this.sharedAccess('folder', cursor))
        cursor = this.folders.get(cursor)?.parent ?? null
      }
    }
    this.memo.set(id, out)
    return out
  }

  personalRoot(id: string): string | null {
    let cursor: string | null = id
    let guard = 0
    while (cursor !== null && guard++ < 64) {
      const f = this.folders.get(cursor)
      if (!f) return null
      if (f.personal) return f.personal
      cursor = f.parent
    }
    return null
  }

  /** An item's access: its folder's, its shares', and `edit` for its author. */
  item(kind: ItemKind, id: string, folder: string | null, createdBy: string | null): ContentAccess | 'none' {
    let out = folder === null ? (this.admin ? 'manage' : 'none') : this.folder(folder)
    out = max(out, this.sharedAccess(kind, id))
    if (createdBy === this.userId && out === 'view') out = 'edit'
    if (createdBy === this.userId && out === 'none' && folder !== null && this.personalRoot(folder) === this.userId) out = 'manage'
    return out
  }

  path(id: string | null): { id: string; name: string }[] {
    const out: { id: string; name: string }[] = []
    let cursor = id
    let guard = 0
    while (cursor !== null && guard++ < 64) {
      const f = this.folders.get(cursor)
      if (!f) break
      out.unshift({ id: f.id, name: f.name })
      cursor = f.parent
    }
    return out
  }
}

export async function contentIndex(core: Core, userId: string): Promise<ContentIndex> {
  const snap = await core.snapshot()
  const [folders, perms, shares] = await Promise.all([
    core.db.many<{ id: string; parent: string | null; name: string; personal: string | null; archived: boolean }>(
      'SELECT id, parent_id AS parent, name, personal_owner_id AS personal, archived FROM folder',
    ),
    core.db.many<{ folder_id: string; group_id: string; access: ContentAccess | 'none' }>('SELECT folder_id, group_id, access FROM folder_permission'),
    core.db.many<Share>('SELECT item_kind, item_id, principal_kind, principal_id, access FROM item_share'),
  ])
  return new ContentIndex(snap, userId, folders, perms, shares)
}

export const atLeastAccess = (a: ContentAccess | 'none', min: ContentAccess) => ORDER.indexOf(a) >= ORDER.indexOf(min)
