#!/usr/bin/env bash
# One-time manual step AFTER the owner adds the forum A record:
# wait for forum.larpscape.net DNS, issue cert, enable HTTPS.
set -euo pipefail

mkdir -p /var/www/certbot

echo "Waiting for forum.larpscape.net DNS (up to 10 min)..."
resolved=0
for i in $(seq 1 60); do
  ip=$(dig +short forum.larpscape.net @8.8.8.8 A 2>/dev/null | head -1)
  if [[ -n "$ip" ]]; then
    echo "DNS resolved on attempt $i -> $ip"
    resolved=1
    break
  fi
  echo "  attempt $i/60: not yet..."
  sleep 10
done

if [[ "$resolved" -ne 1 ]]; then
  echo "ERROR: forum.larpscape.net still has no A record."
  echo "Add at GoDaddy: Type A, Name forum, Value 150.40.117.235"
  dig forum.larpscape.net @ns45.domaincontrol.com +noall +answer || true
  exit 1
fi

echo "==> Requesting TLS cert"
certbot certonly --webroot -w /var/www/certbot -d forum.larpscape.net \
  --non-interactive --agree-tos --register-unsafely-without-email

echo "==> Enabling HTTPS"
bash /opt/larpscape/deploy/enable-forum-ssl.sh

echo "==> Verify HTTPS"
curl -sI https://forum.larpscape.net/ | head -8
echo "==> Done: https://forum.larpscape.net"
