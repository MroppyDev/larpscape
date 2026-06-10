#!/usr/bin/env bash
# Enable HTTPS for wiki.larpscape.net once DNS resolves and certbot has issued a cert.
# Run on the VPS as root after: certbot certonly --webroot -w /var/www/certbot -d wiki.larpscape.net
set -euo pipefail

APP_DIR="/opt/larpscape"
CERT="/etc/letsencrypt/live/wiki.larpscape.net/fullchain.pem"

if [[ ! -f "$CERT" ]]; then
  echo "No cert at $CERT — run certbot first:"
  echo "  mkdir -p /var/www/certbot"
  echo "  certbot certonly --webroot -w /var/www/certbot -d wiki.larpscape.net"
  exit 1
fi

# Add HTTPS redirect to the HTTP vhost
cat > /etc/nginx/sites-available/larpscape-wiki <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name wiki.larpscape.net;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
EOF

cat "$APP_DIR/deploy/nginx-larpscape-wiki-ssl.conf" >> /etc/nginx/sites-available/larpscape-wiki

nginx -t
systemctl reload nginx
echo "Wiki HTTPS enabled at https://wiki.larpscape.net"
