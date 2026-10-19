import type { Workspace } from '@eodia/contracts'

/** The space every instance starts with (migration 0004), named and drawn by no one yet. */
const FIRST_SPACE = 'Principal'

/**
 * Whether a space has a face of its own — a pictogram, or a name other than the first space's:
 * it then names the project, in the sidebar and the browser tab, before eodia insights.
 */
export function ownIdentity(workspace: Pick<Workspace, 'name' | 'icon'> | null | undefined): boolean {
  return !!workspace && (!!workspace.icon || workspace.name.trim() !== FIRST_SPACE)
}

/** The name the browser tab ends with: the project's, or the product's. */
export function projectName(workspace: Pick<Workspace, 'name' | 'icon'> | null | undefined): string {
  return workspace && ownIdentity(workspace) ? workspace.name : 'eodia insights'
}
