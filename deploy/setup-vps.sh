#!/usr/bin/env bash
# One-time VPS provisioning for Larpscape. Run as root on the VPS.
# Idempotent: safe to re-run.
set -euo pipefail

DOMAIN="larpscape.net"
REPO_BARE="/srv/git/larpscape.git"
APP_DIR="/opt/larpscape"

echo "==> Installing packages (Node 22, nginx, git)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git nginx ufw
if ! command -v node >/dev/null || [[ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
# better-sqlite3 ships prebuilt binaries for common platforms, but keep a toolchain
# available in case it needs to compile from source.
apt-get install -y build-essential python3

echo "==> Creating larpscape user"
id -u larpscape &>/dev/null || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin larpscape

echo "==> Setting up bare git repo + app checkout"
mkdir -p "$(dirname "$REPO_BARE")"
[[ -d "$REPO_BARE" ]] || git init --bare "$REPO_BARE"
if [[ ! -d "$APP_DIR/.git" ]]; then
  # Clone may fail until the first push lands; create the dir either way.
  git clone "$REPO_BARE" "$APP_DIR" 2>/dev/null || mkdir -p "$APP_DIR"
fi

echo "==> Admin token + environment file"
mkdir -p /etc/larpscape
if [[ ! -f /etc/larpscape/env ]]; then
  ADMIN_TOKEN="$(head -c 24 /dev/urandom | xxd -p)"
  cat > /etc/larpscape/env <<EOF
PORT=8080
ADMIN_TOKEN=$ADMIN_TOKEN
EOF
  chmod 600 /etc/larpscape/env
  echo "    generated ADMIN_TOKEN (stored in /etc/larpscape/env)"
fi

echo "==> systemd service"
if [[ -f "$APP_DIR/deploy/larpscape.service" ]]; then
  cp "$APP_DIR/deploy/larpscape.service" /etc/systemd/system/larpscape.service
  systemctl daemon-reload
  systemctl enable larpscape
fi

echo "==> nginx site"
if [[ -f "$APP_DIR/deploy/nginx-larpscape.conf" ]]; then
  cp "$APP_DIR/deploy/nginx-larpscape.conf" /etc/nginx/sites-available/larpscape
  ln -sf /etc/nginx/sites-available/larpscape /etc/nginx/sites-enabled/larpscape
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
fi

echo "==> Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

echo "==> certbot (TLS) — only works after $DOMAIN DNS points here"
apt-get install -y certbot python3-certbot-nginx
if certbot certificates 2>/dev/null | grep -q "$DOMAIN"; then
  echo "    certificate already present"
else
  certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect \
    || echo "    certbot failed (DNS probably not pointed yet) — re-run: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

echo "==> Done. Push code from your machine, then run deploy/update.sh"
