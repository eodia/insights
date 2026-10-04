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
# Les volumes de la veille, notés avant de recréer les conteneurs qui les tiennent.
old=$($compose ps -aq | xargs -r docker inspect -f '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}')
# Conteneurs recréés, volumes anonymes (catalogue, bases d'exemple) remplacés par des neufs.
$compose up -d --force-recreate --renew-anon-volumes --remove-orphans
# Ceux de la veille ne servent plus ; les volumes nommés de Caddy, toujours tenus, restent.
for v in $old; do docker volume rm "$v" >/dev/null 2>&1 || true; done
echo "[$(date -Is)] démo relancée"
