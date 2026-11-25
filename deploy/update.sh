#!/usr/bin/env bash
# Henter nyeste versjon fra GitHub og ruller den ut.
# Kjøres som administrator:  ~/handleliste-src/deploy/update.sh
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/handleliste/app
SERVICE=/etc/systemd/system/handleliste.service

cd "$SRC"
echo "→ Henter fra GitHub"
git pull --ff-only
echo "  Versjon: $(git log -1 --format='%h %s')"

echo "→ Kopierer kode til $APP"
sudo install -d -o root -g root -m 755 "$APP"
sudo rm -rf "$APP/public.new"
sudo cp -r "$SRC/public" "$APP/public.new"
sudo cp "$SRC/server.js" "$APP/server.js.new"
sudo chown -R root:root "$APP/public.new" "$APP/server.js.new"
sudo rm -rf "$APP/public" && sudo mv "$APP/public.new" "$APP/public"
sudo mv "$APP/server.js.new" "$APP/server.js"

# Oppdater systemd-fila bare hvis den er endret i repoet
if ! sudo cmp -s "$SRC/deploy/handleliste.service" "$SERVICE"; then
  echo "→ systemd-fila er endret – oppdaterer"
  sudo cp "$SRC/deploy/handleliste.service" "$SERVICE"
  sudo systemctl daemon-reload
fi

echo "→ Starter appen på nytt"
sudo systemctl restart handleliste
sleep 2

code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/ || true)
if [ "$code" = "302" ]; then
  echo "✓ Handleliste kjører (HTTP $code)"
else
  echo "✗ Uventet svar fra appen (HTTP $code). Siste logglinjer:"
  sudo journalctl -u handleliste -n 30 --no-pager
  exit 1
fi
