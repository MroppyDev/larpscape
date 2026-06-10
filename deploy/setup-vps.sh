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
if ! grep -q '^ADMIN_PASSWORD=' /etc/larpscape/env; then
  ADMIN_PASSWORD="$(head -c 12 /dev/urandom | base64 | tr -d '/+=' | head -c 16)"
  echo "ADMIN_PASSWORD=$ADMIN_PASSWORD" >> /etc/larpscape/env
  echo "    generated ADMIN_PASSWORD: $ADMIN_PASSWORD  (admin console login — also in /etc/larpscape/env)"
fi

echo "==> sudoers rule (admin console may restart the game service)"
cat > /etc/sudoers.d/larpscape-admin <<'EOF'
larpscape ALL=(root) NOPASSWD: /usr/bin/systemctl restart larpscape
EOF
chmod 440 /etc/sudoers.d/larpscape-admin

echo "==> systemd services"
if [[ -f "$APP_DIR/deploy/larpscape.service" ]]; then
  cp "$APP_DIR/deploy/larpscape.service" /etc/systemd/system/larpscape.service
  systemctl daemon-reload
  systemctl enable larpscape
fi
if [[ -f "$APP_DIR/deploy/larpscape-admin.service" ]]; then
  cp "$APP_DIR/deploy/larpscape-admin.service" /etc/systemd/system/larpscape-admin.service
  systemctl daemon-reload
  systemctl enable larpscape-admin
fi

echo "==> nginx sites"
if [[ -f "$APP_DIR/deploy/nginx-larpscape.conf" ]]; then
  cp "$APP_DIR/deploy/nginx-larpscape.conf" /etc/nginx/sites-available/larpscape
  ln -sf /etc/nginx/sites-available/larpscape /etc/nginx/sites-enabled/larpscape
  rm -f /etc/nginx/sites-enabled/default
fi
if [[ -f "$APP_DIR/deploy/nginx-larpscape-admin.conf" ]]; then
  cp "$APP_DIR/deploy/nginx-larpscape-admin.conf" /etc/nginx/sites-available/larpscape-admin
  ln -sf /etc/nginx/sites-available/larpscape-admin /etc/nginx/sites-enabled/larpscape-admin
fi

echo "==> certbot (TLS) — only works after DNS points here"
apt-get install -y certbot python3-certbot-nginx
if ! certbot certificates 2>/dev/null | grep -q "Certificate Name: $DOMAIN"; then
  certbot certonly --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email \
    || echo "    certbot for $DOMAIN failed (DNS probably not pointed yet) — re-run after DNS propagates"
fi
if ! certbot certificates 2>/dev/null | grep -q "Certificate Name: admin.$DOMAIN"; then
  certbot certonly --nginx -d "admin.$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email \
    || echo "    certbot for admin.$DOMAIN failed (DNS probably not pointed yet) — re-run after DNS propagates"
fi
if ! certbot certificates 2>/dev/null | grep -q "Certificate Name: wiki.$DOMAIN"; then
  certbot certonly --nginx -d "wiki.$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email \
    || echo "    certbot for wiki.$DOMAIN failed (DNS probably not pointed yet) — re-run after DNS propagates"
fi
# Re-copy repo nginx configs (source of truth) now that certs exist, then reload.
if [[ -f "$APP_DIR/deploy/nginx-larpscape.conf" ]]; then
  cp "$APP_DIR/deploy/nginx-larpscape.conf" /etc/nginx/sites-available/larpscape
fi
if [[ -f "$APP_DIR/deploy/nginx-larpscape-admin.conf" ]]; then
  cp "$APP_DIR/deploy/nginx-larpscape-admin.conf" /etc/nginx/sites-available/larpscape-admin
fi
if [[ -f "$APP_DIR/deploy/nginx-larpscape-wiki.conf" ]]; then
  cp "$APP_DIR/deploy/nginx-larpscape-wiki.conf" /etc/nginx/sites-available/larpscape-wiki
  ln -sf /etc/nginx/sites-available/larpscape-wiki /etc/nginx/sites-enabled/larpscape-wiki
fi
if nginx -t 2>/dev/null; then
  systemctl reload nginx
else
  echo "    nginx config test failed — check cert paths under /etc/letsencrypt/live/"
fi

echo "==> Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

echo "==> Done. Push code from your machine, then run deploy/update.sh"
