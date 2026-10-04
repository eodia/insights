import { migrate } from '@eodia/catalog-schema'
import { QueryEngine } from '@eodia/engine'
import { AccessCache, type SnapUser, type Snapshot } from './access/snapshot'
import type { Config } from './config'
import { Db } from './db'

/** Who acts: a person through a session, an integration token, a share link or a signed embed. */
export interface Actor {
  readonly userId: string
  /**
   * The space they act in: what they see, create, and read data in. A session's is the one the
   * interface chose (`x-eodia-workspace`, checked), a token's is its own, a link's its item's.
   */
  readonly workspaceId: string
  readonly via: 'session' | 'token' | 'share' | 'embed' | 'system'
  /** For a token: the surfaces it may use. */
  readonly surfaces?: readonly string[]
  readonly sessionId?: string
  readonly ip?: string
  /** The identity data is read under, when not the person's own: a signed embed's visitor. */
  readonly dataUser?: string
}

/**
 * The identity data is read under: a signed embed's visitor, or the person in their space —
 * what Trino is told, and what every decision of `access/decide.ts` is about.
 */
export const principalOf = (actor: Actor): string => actor.dataUser ?? `${actor.userId}@${actor.workspaceId}`

/** People a signed embed acts as: not in the catalog, known to the decision point for a while. */
interface VirtualUser {
  readonly user: SnapUser
  readonly expires: number
}

export class Core {
  readonly db: Db
  readonly engine: QueryEngine
  readonly access: AccessCache
  private readonly virtual = new Map<string, VirtualUser>()
  /** Running statements by execution key, for cancellation. */
  readonly running = new Map<string, { queryId?: string; controller: AbortController; userId: string }>()

  constructor(readonly config: Config) {
    this.db = new Db(config.databaseUrl, config.databaseSchema)
    this.engine = new QueryEngine({
      url: config.trinoUrl,
      serviceUser: config.trinoServiceUser,
      ...(config.trinoPassword ? { password: config.trinoPassword } : {}),
      ...(config.trinoLocalhostAlias ? { localhostAlias: config.trinoLocalhostAlias } : {}),
    })
    this.access = new AccessCache(this.db)
  }

  async migrate(): Promise<string[]> {
    return migrate(this.db.pool, this.config.databaseSchema)
  }

  /** The permission snapshot, with the embed identities still valid. */
  async snapshot(): Promise<Snapshot> {
    const snap = await this.access.get()
    const now = Date.now()
    const users = snap.users as Map<string, SnapUser>
    for (const [id, v] of this.virtual) {
      if (v.expires < now) {
        this.virtual.delete(id)
        users.delete(id)
      } else if (!users.has(id)) users.set(id, v.user)
    }
    return snap
  }

  registerVirtualUser(user: SnapUser, ttlMs: number): void {
    this.virtual.set(user.id, { user, expires: Date.now() + ttlMs })
  }

  /** After any change of users, groups, sources, structure or permissions. */
  changed(): void {
    this.access.invalidate()
  }

  async close(): Promise<void> {
    await this.db.close()
  }
}
