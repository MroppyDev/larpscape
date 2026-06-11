#!/usr/bin/env bash
# Enable HTTPS for trade.larpscape.net once DNS resolves and certbot has issued a cert.
# Run on the VPS as root after: certbot certonly --webroot -w /var/www/certbot -d trade.larpscape.net
set -euo pipefail

APP_DIR="/opt/larpscape"
CERT="/etc/letsencrypt/live/trade.larpscape.net/fullchain.pem"

if [[ ! -f "$CERT" ]]; then
  echo "No cert at $CERT — run certbot first:"
  echo "  mkdir -p /var/www/certbot"
  echo "  certbot certonly --webroot -w /var/www/certbot -d trade.larpscape.net"
  exit 1
fi

# Replace the HTTP vhost with an HTTPS redirect (acme path kept for renewals)
cat > /etc/nginx/sites-available/larpscape-trade <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name trade.larpscape.net;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
EOF

cat "$APP_DIR/deploy/nginx-larpscape-trade-ssl.conf" >> /etc/nginx/sites-available/larpscape-trade

nginx -t
systemctl reload nginx
echo "Trade HTTPS enabled at https://trade.larpscape.net"
