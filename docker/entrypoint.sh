#!/bin/sh
# Point d'entrée de l'image eodia insights : un rôle par conteneur, ou tout ensemble.
#
#   api     API REST + endpoint OPA interne (port 4100)
#   web     interface Next.js (port 3100)
#   worker  file de jobs : synchronisations, préchauffage, démo
#   mcp     serveur MCP Streamable HTTP (port 4200)
#   all     api + web + worker dans un seul conteneur (WITH_MCP=1 ajoute mcp)
#
# Les applications tournent depuis leurs sources TypeScript avec tsx, comme en développement :
# `node --import tsx` garde un seul processus, qui reçoit SIGTERM directement.
set -eu

role="${1:-all}"
cd /app

case "$role" in
  api)
    cd apps/api
    exec node --import tsx src/server.ts
    ;;
  worker)
    cd apps/worker
    exec node --import tsx src/worker.ts
    ;;
  mcp)
    cd apps/mcp
    exec node --import tsx src/server.ts
    ;;
  web)
    cd apps/web
    exec node node_modules/next/dist/bin/next start --port "${WEB_PORT:-3100}" --hostname 0.0.0.0
    ;;
  all)
    exec node docker/supervisor.mjs
    ;;
  sh | bash)
    exec /bin/sh
    ;;
  *)
    echo "Rôle inconnu : $role (api, web, worker, mcp ou all)" >&2
    exit 64
    ;;
esac
