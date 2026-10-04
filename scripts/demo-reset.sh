#!/bin/sh
# Remise à zéro de la démo publique (docker-compose.demo.yml) : la dernière image, un
# catalogue neuf, des bases d'exemple régénérées et datées du jour. Les certificats de Caddy
# sont gardés. À lancer chaque nuit, par exemple :
#
#   0 4 * * * sh /opt/eodia-insights/scripts/demo-reset.sh >> /var/log/eodia-demo.log 2>&1
#
# La démo est indisponible deux à trois minutes, le temps que Trino démarre et que la démo
# soit recréée.
set -eu
cd "$(dirname "$0")/.."
compose="docker compose -f docker-compose.demo.yml"

echo "[$(date -Is)] remise à zéro de la démo"
$compose pull --quiet --ignore-pull-failures || echo "image non mise à jour, on garde la locale"
# Conteneurs recréés, volumes anonymes (catalogue, bases d'exemple) remplacés par des neufs.
$compose up -d --force-recreate --renew-anon-volumes --remove-orphans
# Les volumes anonymes de la veille ne servent plus.
docker volume prune -f --filter "label=com.docker.compose.project=eodia-insights-demo" >/dev/null
echo "[$(date -Is)] démo relancée"
