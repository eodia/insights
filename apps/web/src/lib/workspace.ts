import { api, rememberWorkspace } from './api'

/**
 * Moves to another space: the server keeps it for the next session, this browser for every
 * call; then the application starts over there — nothing of the space left behind lingers in
 * a cache.
 */
export async function enterWorkspace(id: string, to = '/'): Promise<void> {
  await api.post(`/v1/workspaces/${id}/switch`)
  rememberWorkspace(id)
  window.location.href = to
}
