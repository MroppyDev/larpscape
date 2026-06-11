#!/usr/bin/env bash
# Deploy the latest pushed code on the VPS. Run as root (called by deploy.ps1 over ssh).
#   1. checkout latest code from the bare repo
#   2. install deps + build the client
#   3. broadcast an in-game restart warning, wait, restart the service
set -euo pipefail

APP_DIR="/opt/larpscape"
WARN_SECONDS="${WARN_SECONDS:-15}"
MESSAGE="${MESSAGE:-Server update in ${WARN_SECONDS}s — you will be reconnected automatically.}"

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "==> First deploy: cloning from bare repo"
  rm -rf "$APP_DIR"
  git clone /srv/git/larpscape.git "$APP_DIR"
fi
cd "$APP_DIR"

echo "==> Pulling latest code"
git fetch origin
BRANCH="$(git remote show origin | sed -n 's/.*HEAD branch: //p')"
git reset --hard "origin/${BRANCH:-master}"

# Re-exec from the freshly checked-out script. Bash keeps the pre-pull inode
# otherwise, so nginx/systemd sync from the new commit would be skipped.
if [[ "${LARPSCAPE_UPDATE_REEXECED:-}" != "1" ]]; then
  export LARPSCAPE_UPDATE_REEXECED=1
  exec bash "$APP_DIR/deploy/update.sh" "$@"
fi

echo "==> Installing dependencies + building client + admin console + wiki + homepage"
npm ci
npm run build
npm run admin:build
npm run wiki:build
bash deploy/build-wiki-path.sh
if [[ -f homepage/index.html ]]; then
  npm run home:build
else
  echo "    (homepage/index.html not present yet — skipping home:build)"
fi

# Keep systemd units / nginx config in sync with the repo
if ! cmp -s deploy/larpscape.service /etc/systemd/system/larpscape.service; then
  cp deploy/larpscape.service /etc/systemd/system/larpscape.service
  systemctl daemon-reload
fi
if [[ -f deploy/larpscape-admin.service ]] && ! cmp -s deploy/larpscape-admin.service /etc/systemd/system/larpscape-admin.service; then
  cp deploy/larpscape-admin.service /etc/systemd/system/larpscape-admin.service
  systemctl daemon-reload
fi

# Keep nginx vhosts in sync (game on :8080, admin on :8081; apex must have its own TLS block)
if [[ -f deploy/nginx-larpscape.conf ]]; then
  cp deploy/nginx-larpscape.conf /etc/nginx/sites-available/larpscape
  ln -sf /etc/nginx/sites-available/larpscape /etc/nginx/sites-enabled/larpscape
fi
if [[ -f deploy/nginx-larpscape-admin.conf ]]; then
  cp deploy/nginx-larpscape-admin.conf /etc/nginx/sites-available/larpscape-admin
  ln -sf /etc/nginx/sites-available/larpscape-admin /etc/nginx/sites-enabled/larpscape-admin
fi
# play.larpscape.net vhost. HTTPS comes from a one-time manual step post-DNS:
# run bash deploy/bootstrap-play-ssl.sh on the VPS AFTER the play A record is
# added — later deploys then re-enable HTTPS automatically via enable-play-ssl.sh.
if [[ -f deploy/nginx-larpscape-play.conf ]]; then
  mkdir -p /var/www/certbot
  cp deploy/nginx-larpscape-play.conf /etc/nginx/sites-available/larpscape-play
  ln -sf /etc/nginx/sites-available/larpscape-play /etc/nginx/sites-enabled/larpscape-play
  # If HTTPS cert already exists, append the SSL vhost
  if [[ -f /etc/letsencrypt/live/play.larpscape.net/fullchain.pem ]] && [[ -f deploy/nginx-larpscape-play-ssl.conf ]]; then
    bash deploy/enable-play-ssl.sh
  fi
fi
if [[ -f deploy/nginx-larpscape-wiki.conf ]]; then
  mkdir -p /var/www/certbot
  cp deploy/nginx-larpscape-wiki.conf /etc/nginx/sites-available/larpscape-wiki
  ln -sf /etc/nginx/sites-available/larpscape-wiki /etc/nginx/sites-enabled/larpscape-wiki
  # If HTTPS cert already exists, append the SSL vhost
  if [[ -f /etc/letsencrypt/live/wiki.larpscape.net/fullchain.pem ]] && [[ -f deploy/nginx-larpscape-wiki-ssl.conf ]]; then
    bash deploy/enable-wiki-ssl.sh
  fi
fi
rm -f /etc/nginx/sites-enabled/default
echo "==> Syncing nginx vhosts"
if nginx -t; then
  systemctl reload nginx
else
  echo "    nginx config test failed — run certbot if TLS certs are missing, then re-deploy"
  exit 1
fi

chown -R larpscape:larpscape "$APP_DIR"

if systemctl is-active --quiet larpscape; then
  echo "==> Broadcasting restart warning (${WARN_SECONDS}s)"
  source /etc/larpscape/env
  curl -fsS -X POST "http://127.0.0.1:${PORT:-8080}/api/admin/broadcast" \
    -H "x-admin-token: ${ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"${MESSAGE}\"}" || echo "    (broadcast failed — continuing)"
  sleep "$WARN_SECONDS"
fi

echo "==> Restarting services"
systemctl restart larpscape
if [[ -f /etc/systemd/system/larpscape-admin.service ]]; then
  systemctl restart larpscape-admin || true
fi
sleep 2
systemctl --no-pager --lines=5 status larpscape
echo "==> Deploy complete"
