# Handleliste 🛒

En felles handleliste for familien med sanntidsoppdatering. Den lærer rekkefølgen dere plukker varer i hver butikk.

Appen settes opp etter instruksen for VPS-en: ny nginx-site, eget underdomene, port **127.0.0.1:3002**, egen Linux-bruker, systemd og ingen Docker. Data ligger i én SQLite-fil i appens egen mappe, så PostgreSQL brukes ikke og hub-databasene røres ikke.

| | |
|---|---|
| Adresse | `https://handleliste.isdahl-engineering.no` |
| Lokal port | `127.0.0.1:3002` |
| Linux-bruker | `handleliste` (systembruker, kan ikke logge inn) |
| Kode | `/opt/handleliste/app` (eies av root, kun lesbar for appen) |
| Data | `/opt/handleliste/data/handleliste.db` |
| Node | egen kopi i `/opt/handleliste/node`, og systemets Node røres ikke |
| Hemmeligheter | `/etc/handleliste.env` (root, 600) |
| Minne | ca. 50 MB, med en grense på 200 MB i systemd |

---

## Installasjon

### 0. DNS (hos one.com)
Legg inn en A-post: `handleliste` → `85.190.105.45`. Sjekk at den er aktiv med `dig +short handleliste.isdahl-engineering.no`.

### 1. Kopier filene til serveren (fra din egen maskin)
```bash
scp handleliste.zip administrator@85.190.105.45:~
ssh administrator@85.190.105.45
```

### 2. Sjekk utgangspunktet
```bash
free -h
sudo ss -tlnp | grep 3002     # skal ikke gi noe – porten må være ledig
uname -m                      # forventer x86_64
```

### 3. Bruker og mapper
```bash
sudo adduser --system --group --home /opt/handleliste handleliste
sudo apt-get install -y unzip
rm -rf /tmp/hl && unzip -q ~/handleliste.zip -d /tmp/hl
sudo mkdir -p /opt/handleliste/app /opt/handleliste/data
sudo cp -r /tmp/hl/handleliste/server.js /tmp/hl/handleliste/public /opt/handleliste/app/
sudo chown -R root:root /opt/handleliste/app
sudo chown handleliste:handleliste /opt/handleliste/data
sudo chmod 750 /opt/handleliste/data
```

### 4. Egen Node 24 (påvirker ikke test/pilot)
```bash
cd /tmp
BASE=https://nodejs.org/dist/latest-v24.x
F=$(curl -fsSL $BASE/SHASUMS256.txt | grep -o 'node-v[0-9.]*-linux-x64.tar.xz' | head -1)
curl -fsSLO $BASE/$F
curl -fsSL $BASE/SHASUMS256.txt | grep " $F\$" | sha256sum -c -     # skal si OK
sudo mkdir -p /opt/handleliste/node
sudo tar -xJf $F -C /opt/handleliste/node --strip-components=1
/opt/handleliste/node/bin/node --version
```

### 5. Passord og hemmelig nøkkel
```bash
sudo tee /etc/handleliste.env > /dev/null <<EOF
FAMILY_PASSWORD=BYTT-MEG
SESSION_SECRET=$(openssl rand -hex 32)
EOF
sudo chmod 600 /etc/handleliste.env
sudo nano /etc/handleliste.env     # sett et langt familiepassord
```

### 6. systemd-tjeneste
```bash
sudo cp /tmp/hl/handleliste/deploy/handleliste.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now handleliste
systemctl status handleliste --no-pager
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/    # forventer 302 (videre til innlogging)
```

### 7. nginx og HTTPS
```bash
sudo cp /tmp/hl/handleliste/deploy/nginx-handleliste /etc/nginx/sites-available/handleliste
sudo ln -s /etc/nginx/sites-available/handleliste /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx      # ALDRI reload uten at nginx -t er OK
sudo certbot --nginx -d handleliste.isdahl-engineering.no
```

### 8. Kontroll (fra instruksen)
```bash
sudo ss -tlnp | grep 3002          # skal vise 127.0.0.1:3002, ikke 0.0.0.0
sudo ufw status                    # fortsatt bare 22, 80, 443
systemctl is-active commercial-hub commercial-hub-pilot nginx handleliste
free -h
```
Åpne også `https://test.isdahl-engineering.no` og `https://pilot.isdahl-engineering.no` og sjekk at de fortsatt virker.

### 9. På iPhone
Åpne adressen i Safari, trykk Del og så **Legg til på Hjem-skjerm**. Åpne appen fra hjemskjermen og logg inn **der**, fordi iPhone holder innloggingen i Safari og i hjemskjerm-appen adskilt.

---

## Vedlikehold

**Oppdatere appen** (etter at du har kopiert ny zip til serveren og pakket den ut i `/tmp/hl`):
```bash
sudo cp -r /tmp/hl/handleliste/server.js /tmp/hl/handleliste/public /opt/handleliste/app/
sudo chown -R root:root /opt/handleliste/app
sudo systemctl restart handleliste
```

**Logg:** `journalctl -u handleliste -f`

**Backup** (stopper appen et par sekunder, så fila er konsistent):
```bash
sudo systemctl stop handleliste
sudo cp /opt/handleliste/data/handleliste.db ~/handleliste-$(date +%F).db
sudo systemctl start handleliste
```

**Fjerne alt igjen:**
```bash
sudo systemctl disable --now handleliste
sudo rm /etc/systemd/system/handleliste.service /etc/handleliste.env
sudo rm /etc/nginx/sites-enabled/handleliste /etc/nginx/sites-available/handleliste
sudo nginx -t && sudo systemctl reload nginx
sudo deluser --system handleliste && sudo rm -rf /opt/handleliste
```

---

## Slik lærer den butikken

- Velg butikk øverst før du handler. Valget huskes per telefon. Rydder du lista hjemme, velg «Ingen butikk».
- Avhukinger i samme butikk med under 2 timers mellomrom regnes som én **handletur**. Angrer du en avhuking, fjernes den fra turen.
- Hver vare får en plassering fra 0 (først) til 1 (sist) på turen. Rekkefølgen er et vektet snitt av de siste 30 turene, og hver tur teller 0,8 ganger så mye som turen etter, så lista tilpasser seg hvis butikken bygges om.
- Varer appen ikke har sett i butikken før, havner nederst merket **«ny her»**.
- Juster `TRIP_GAP` og `DECAY` øverst i `server.js` om du vil.

## Sikkerhet

- Appen lytter bare på 127.0.0.1, og ingen nye porter åpnes i ufw.
- Den kjører som egen systembruker. systemd sperrer `/home` (`ProtectHome`), gjør resten av filsystemet skrivebeskyttet bortsett fra data-mappa, og setter en minnegrense.
- Innlogging skjer med felles familiepassord, og cookien er signert, HttpOnly og Secure bak HTTPS. Etter 10 feil forsøk på 15 minutter fra samme IP blokkeres flere forsøk.
- Basic auth i nginx er bevisst av, fordi det fungerer dårlig i hjemskjerm-apper på iPhone.
