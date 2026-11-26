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

### 1. Logg inn på serveren
```bash
ssh administrator@85.190.105.45
```

### 2. Sjekk utgangspunktet
```bash
free -h
sudo ss -tlnp | grep 3002     # skal ikke gi noe – porten må være ledig
uname -m                      # forventer x86_64
```

### 3. Hent koden fra GitHub (deploy key med bare lesetilgang)
Repoet er privat, så serveren får sin egen nøkkel som **bare** kan lese dette ene repoet. Nøkkelen og kildekoden ligger hos `administrator`. Appbrukeren får bare en kopi av koden og har aldri tilgang til nøkkelen.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/handleliste_deploy -N "" -C "vps handleliste deploy"
cat ~/.ssh/handleliste_deploy.pub
```
Kopier linja som vises. Gå så til **github.com/omisdahl/handleliste**, velg **Settings**, så **Deploy keys** og **Add deploy key**. Lim inn linja, kall nøkkelen `VPS`, og la *Allow write access* stå **av**.

```bash
cat >> ~/.ssh/config <<'EOF'

Host github-handleliste
    HostName github.com
    User git
    IdentityFile ~/.ssh/handleliste_deploy
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
git clone git@github-handleliste:omisdahl/handleliste.git ~/handleliste-src
```
Første gang spør den om du stoler på github.com. Svar `yes`.

### 4. Bruker og mapper
```bash
sudo adduser --system --group --home /opt/handleliste handleliste
sudo mkdir -p /opt/handleliste/app /opt/handleliste/data
sudo chown handleliste:handleliste /opt/handleliste/data
sudo chmod 750 /opt/handleliste/data
```

### 5. Egen Node 24 (påvirker ikke test/pilot)
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

### 6. Passord og hemmelig nøkkel
```bash
sudo tee /etc/handleliste.env > /dev/null <<EOF
FAMILY_PASSWORD=BYTT-MEG
SESSION_SECRET=$(openssl rand -hex 32)
EOF
sudo chmod 600 /etc/handleliste.env
sudo nano /etc/handleliste.env     # sett et langt familiepassord
```

### 7. Kode og systemd-tjeneste
```bash
sudo cp ~/handleliste-src/deploy/handleliste.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable handleliste
~/handleliste-src/deploy/update.sh       # kopierer koden, starter appen og sjekker at den svarer
```

### 8. nginx og HTTPS
```bash
sudo cp ~/handleliste-src/deploy/nginx-handleliste /etc/nginx/sites-available/handleliste
sudo ln -s /etc/nginx/sites-available/handleliste /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx      # ALDRI reload uten at nginx -t er OK
sudo certbot --nginx -d handleliste.isdahl-engineering.no
```

### 9. Kontroll (fra instruksen)
```bash
sudo ss -tlnp | grep 3002          # skal vise 127.0.0.1:3002, ikke 0.0.0.0
sudo ufw status                    # fortsatt bare 22, 80, 443
systemctl is-active commercial-hub commercial-hub-pilot nginx handleliste
free -h
```
Åpne også `https://test.isdahl-engineering.no` og `https://pilot.isdahl-engineering.no` og sjekk at de fortsatt virker.

### 10. På iPhone
Åpne adressen i Safari, trykk Del og så **Legg til på Hjem-skjerm**. Åpne appen fra hjemskjermen og logg inn **der**, fordi iPhone holder innloggingen i Safari og i hjemskjerm-appen adskilt.

---

## Vedlikehold

**Oppdatere appen** etter at nye endringer er lastet opp til GitHub:
```bash
~/handleliste-src/deploy/update.sh
```
Skriptet henter fra GitHub, kopierer koden til `/opt/handleliste/app`, oppdaterer systemd-fila hvis den er endret, starter appen på nytt og sjekker at den svarer. Hvis noe feiler, viser det loggen. nginx røres aldri av skriptet.

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
sudo deluser --system handleliste && sudo rm -rf /opt/handleliste ~/handleliste-src ~/.ssh/handleliste_deploy*
# Fjern også «Host github-handleliste»-blokka i ~/.ssh/config og deploy key-en på GitHub
```

---

## Slik lærer den butikken

- Velg butikk øverst før du handler. Valget huskes per telefon. Rydder du lista hjemme, velg «Ingen butikk».
- Avhukinger i samme butikk med under 2 timers mellomrom regnes som én **handletur**. Angrer du en avhuking, fjernes den fra turen.
- Hver vare får en plassering fra 0 (først) til 1 (sist) på turen. Rekkefølgen er et vektet snitt av de siste 30 turene, og hver tur teller 0,8 ganger så mye som turen etter, så lista tilpasser seg hvis butikken bygges om.
- Varer appen ikke har sett i butikken før, merkes **«ny her»** og plasseres sammen med andre varer i samme kategori. Ny yoghurt havner for eksempel ved melka.
- Juster `TRIP_GAP` og `DECAY` øverst i `server.js` om du vil.

## Forslag og stavemåter

- `public/groceries.js` inneholder en katalog med rundt 300 vanlige dagligvarer, med kategori og alternative stavemåter (for eksempel *mjølk* → Melk og *doruller* → Toalettpapir). Det er lett å utvide den.
- Mens du skriver, foreslår appen varer fra katalogen og fra det familien har kjøpt før. Mest brukte kommer først, og skrivefeil tolereres, så *bannaer* blir Bananer og *agruk* blir Agurk.
- Hver vare får en **nøkkel** der mengde (*2 melk*, *melk x2*, *400 g*), store og små bokstaver og stavemåte er fjernet. Butikkrekkefølge, historikk og duplikatsjekk bruker denne nøkkelen.
- Legger du til noe som allerede står på lista, også med en annen stavemåte, får du beskjed, og varen blinker i stedet for å bli lagt til to ganger.
- Aliasene i katalogen er bare *ekte* synonymer. Lettmelk og helmelk er for eksempel forskjellige varer, så begge kan stå på lista samtidig.

## Kategori og antall

- Hver vare viser kategori under navnet. Trykk på kategorien for å endre den. Valget gjelder alle varer med samme navn og stavemåte, og brukes også når butikkrekkefølgen gjettes.
- Ukjente varer viser **«＋ kategori»**. Skriver du noe som ikke finnes, kan du velge **«＋ Legg til … som ny vare»** i forslagslista og velge kategori med én gang. Du kan også lage helt nye kategorier.
- Familiens egne varer og kategorier lagres i tabellen `custom_items` og overstyrer katalogen.
- **Antall** står i en egen kolonne til høyre og er valgfritt. Trykk for å velge 1–6 eller skrive fritt (*400 g*, *2 pk*). Skriver du *2 melk*, *melk x2* eller *kjøttdeig 400 g*, fylles antallet ut automatisk. Gamle varer med mengde i navnet flyttes over ved oppstart.

## Sikkerhet

- Appen lytter bare på 127.0.0.1, og ingen nye porter åpnes i ufw.
- Den kjører som egen systembruker. systemd sperrer `/home` (`ProtectHome`), gjør resten av filsystemet skrivebeskyttet bortsett fra data-mappa, og setter en minnegrense.
- Innlogging skjer med felles familiepassord, og cookien er signert, HttpOnly og Secure bak HTTPS. Etter 10 feil forsøk på 15 minutter fra samme IP blokkeres flere forsøk.
- Basic auth i nginx er bevisst av, fordi det fungerer dårlig i hjemskjerm-apper på iPhone.
