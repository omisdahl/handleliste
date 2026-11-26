// Handleliste – familieapp. Ingen eksterne avhengigheter (bruker innebygd node:sqlite).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const G = require('./public/groceries.js'); // varekatalog + normalisering av stavemåter

const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || '127.0.0.1'; // kun lokalt – nginx står foran
const PASSWORD = process.env.FAMILY_PASSWORD;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!PASSWORD) {
  console.error('FAMILY_PASSWORD må være satt.');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'handleliste.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL,
    added_by   TEXT    NOT NULL DEFAULT '',
    checked    INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    checked_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS stores (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  -- En handletur = sammenhengende avhukinger i én butikk (pause < TRIP_GAP)
  CREATE TABLE IF NOT EXISTS trips (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    last_at    INTEGER NOT NULL
  );
  -- Hver avhuking i butikk: hvilken vare, og som nummer hva på turen
  CREATE TABLE IF NOT EXISTS picks (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id  INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    item_key TEXT    NOT NULL,
    seq      INTEGER NOT NULL,
    at       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS picks_trip ON picks(trip_id);
  CREATE TABLE IF NOT EXISTS history (
    key  TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    n    INTEGER NOT NULL DEFAULT 1
  );
`);

const q = {
  all: db.prepare('SELECT * FROM items ORDER BY checked ASC, created_at DESC'),
  add: db.prepare('INSERT INTO items (text, added_by, created_at) VALUES (?, ?, ?)'),
  toggle: db.prepare('UPDATE items SET checked = 1 - checked, checked_at = ? WHERE id = ?'),
  remove: db.prepare('DELETE FROM items WHERE id = ?'),
  clearChecked: db.prepare('DELETE FROM items WHERE checked = 1'),
  // Hent tidligere varer som forslag (mest brukte først)
  remember: db.prepare(`INSERT INTO history (key, text) VALUES (?, ?)
                        ON CONFLICT(key) DO UPDATE SET n = n + 1, text = excluded.text`),
  suggest: db.prepare('SELECT key, text, n FROM history ORDER BY n DESC LIMIT 300'),
  get: db.prepare('SELECT * FROM items WHERE id = ?'),

  stores: db.prepare('SELECT id, name FROM stores ORDER BY name'),
  addStore: db.prepare('INSERT INTO stores (name) VALUES (?) ON CONFLICT(name) DO NOTHING'),
  delStore: db.prepare('DELETE FROM stores WHERE id = ?'),
  storeExists: db.prepare('SELECT 1 FROM stores WHERE id = ?'),

  lastTrip: db.prepare('SELECT * FROM trips WHERE store_id = ? ORDER BY last_at DESC LIMIT 1'),
  newTrip: db.prepare('INSERT INTO trips (store_id, started_at, last_at) VALUES (?, ?, ?)'),
  touchTrip: db.prepare('UPDATE trips SET last_at = ? WHERE id = ?'),
  maxSeq: db.prepare('SELECT COALESCE(MAX(seq), -1) AS m FROM picks WHERE trip_id = ?'),
  pickedInTrip: db.prepare('SELECT 1 FROM picks WHERE trip_id = ? AND item_key = ?'),
  addPick: db.prepare('INSERT INTO picks (trip_id, item_key, seq, at) VALUES (?, ?, ?, ?)'),
  undoPick: db.prepare('DELETE FROM picks WHERE trip_id = ? AND item_key = ?'),
  // Siste N turer med minst 2 plukk, nyeste først
  recentPicks: db.prepare(`
    SELECT p.trip_id, p.item_key, p.seq, t.last_at
    FROM picks p JOIN trips t ON t.id = p.trip_id
    WHERE t.store_id = ? AND p.trip_id IN (
      SELECT trip_id FROM picks p2 JOIN trips t2 ON t2.id = p2.trip_id
      WHERE t2.store_id = ? GROUP BY trip_id HAVING COUNT(*) >= 2
      ORDER BY MAX(t2.last_at) DESC LIMIT 30)
    ORDER BY t.last_at DESC, p.seq ASC`),
};

// ---------- Læring av rekkefølge per butikk ----------
const TRIP_GAP = 2 * 60 * 60e3; // 2 timer pause = ny handletur
const DECAY = 0.8;              // hvor mye eldre turer teller (1 = like mye, lavere = glemmer raskere)
const keyOf = G.keyOf; // "2 mjølk" og "Melk" -> "melk"

// Legg til nøkkel og kategori på varene før de sendes til klientene
const listItems = () => q.all.all().map((i) => {
  const key = keyOf(i.text);
  return { ...i, key, cat: G.categoryOf(key) };
});
// Pen visningstekst for historikk: katalognavnet hvis kjent, ellers teksten uten mengde, med stor forbokstav
const cap = (s) => s.charAt(0).toLocaleUpperCase('nb') + s.slice(1);
const displayName = (t) => G.lookup(t)?.name ?? cap(G.stripQty(t));

// Engangs-migrering: gamle nøkler (før stavemåte-normalisering) -> kanoniske nøkler
db.exec('BEGIN');
for (const { item_key } of db.prepare('SELECT DISTINCT item_key FROM picks').all()) {
  const k = keyOf(item_key);
  if (k !== item_key) db.prepare('UPDATE picks SET item_key = ? WHERE item_key = ?').run(k, item_key);
}
for (const h of db.prepare('SELECT key, text, n FROM history').all()) {
  const k = keyOf(h.text);
  if (k !== h.key) {
    db.prepare('DELETE FROM history WHERE key = ?').run(h.key);
    db.prepare(`INSERT INTO history (key, text, n) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET n = n + excluded.n`).run(k, displayName(h.text), h.n);
  }
}
db.exec('COMMIT');

// Finn (eller start) pågående tur i butikken
function currentTrip(storeId, now) {
  const t = q.lastTrip.get(storeId);
  if (t && now - t.last_at < TRIP_GAP) return t.id;
  return Number(q.newTrip.run(storeId, now, now).lastInsertRowid);
}

function recordPick(storeId, itemKey, checkedNow, now) {
  if (!storeId || !q.storeExists.get(storeId)) return;
  const t = q.lastTrip.get(storeId);
  if (!checkedNow) {
    // Angret avhuking: fjern plukket fra pågående tur
    if (t && now - t.last_at < TRIP_GAP) q.undoPick.run(t.id, itemKey);
    return;
  }
  const tripId = currentTrip(storeId, now);
  if (q.pickedInTrip.get(tripId, itemKey)) return;
  q.addPick.run(tripId, itemKey, q.maxSeq.get(tripId).m + 1, now);
  q.touchTrip.run(now, tripId);
}

// Hver vare får en score 0..1 (0 = tidlig i butikken, 1 = sent).
// Per tur: normalisert plassering seq/(antall-1). Snitt over turer, vektet så nyere turer teller mer.
function storeOrder(storeId) {
  const rows = q.recentPicks.all(storeId, storeId);
  const trips = new Map();
  for (const r of rows) {
    if (!trips.has(r.trip_id)) trips.set(r.trip_id, []);
    trips.get(r.trip_id).push(r.item_key);
  }
  const acc = {};
  let age = 0;
  for (const keys of trips.values()) {           // nyeste tur først
    const w = DECAY ** age++;
    keys.forEach((k, i) => {
      const pos = i / (keys.length - 1);
      (acc[k] ||= { sum: 0, w: 0, n: 0 });
      acc[k].sum += pos * w; acc[k].w += w; acc[k].n++;
    });
  }
  const items = {};
  for (const [k, a] of Object.entries(acc)) items[k] = { score: a.sum / a.w, seen: a.n };
  // Kategorisnitt: brukes til å plassere varer som aldri er kjøpt i denne butikken
  const cs = {};
  for (const [k, v] of Object.entries(items)) {
    const c = G.categoryOf(k);
    if (c) (cs[c] ||= []).push(v.score);
  }
  const categories = {};
  for (const [c, arr] of Object.entries(cs)) categories[c] = arr.reduce((x, y) => x + y, 0) / arr.length;
  return { items, categories };
}

// ---------- Innlogging: signert cookie ----------
const COOKIE = 'hl_session';
const MAX_AGE = 60 * 60 * 24 * 365; // ett år
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const makeToken = () => { const v = `ok.${Date.now()}`; return `${v}.${sign(v)}`; };
function validToken(t) {
  if (!t) return false;
  const i = t.lastIndexOf('.');
  const v = t.slice(0, i), s = t.slice(i + 1);
  const exp = sign(v);
  return s.length === exp.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp));
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean)
    .map((c) => { const [k, ...r] = c.trim().split('='); return [k, decodeURIComponent(r.join('='))]; }));
}
const authed = (req) => validToken(cookies(req)[COOKIE]);

// Enkel brute-force-brems på innlogging
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now(), a = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60e3);
  attempts.set(ip, a);
  return a.length >= 10;
}

// ---------- Sanntid via Server-Sent Events ----------
const clients = new Set();
function broadcast() {
  const msg = `data: ${JSON.stringify(listItems())}\n\n`;
  for (const res of clients) res.write(msg);
}
function broadcastStores() {
  const msg = `event: stores\ndata: ${JSON.stringify(q.stores.all())}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25e3);

// ---------- Hjelpere ----------
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
function serveStatic(res, file) {
  const p = path.join(PUBLIC_DIR, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (!p.startsWith(PUBLIC_DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); return res.end('Ikke funnet');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream',
    'Cache-Control': file.endsWith('.html') || file === '/sw.js' ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(p).pipe(res);
}

// ---------- Ruter ----------
const PUBLIC_FILES = new Set(['/login.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png',
  '/apple-touch-icon.png', '/sw.js']);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const ip = req.headers['x-forwarded-for']?.split(',').pop().trim() || req.socket.remoteAddress;

  try {
    if (p === '/api/login' && req.method === 'POST') {
      if (tooMany(ip)) return json(res, 429, { error: 'For mange forsøk, vent litt.' });
      const { password } = await readBody(req);
      const ok = typeof password === 'string' && password.length === PASSWORD.length &&
        crypto.timingSafeEqual(Buffer.from(password), Buffer.from(PASSWORD));
      if (!ok) { attempts.get(ip).push(Date.now()); return json(res, 401, { error: 'Feil passord' }); }
      res.setHeader('Set-Cookie', `${COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}` +
        (req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''));
      return json(res, 200, { ok: true });
    }

    if (PUBLIC_FILES.has(p)) return serveStatic(res, p);

    if (!authed(req)) {
      if (p.startsWith('/api/')) return json(res, 401, { error: 'Ikke innlogget' });
      res.writeHead(302, { Location: '/login.html' }); return res.end();
    }

    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
        Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`data: ${JSON.stringify(listItems())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/api/items' && req.method === 'GET') return json(res, 200, listItems());
    if (p === '/api/items' && req.method === 'POST') {
      const { text, addedBy } = await readBody(req);
      const t = String(text || '').trim().slice(0, 200);
      if (!t) return json(res, 400, { error: 'Tom vare' });
      const key = keyOf(t);
      // Står varen (eller en annen stavemåte av den) allerede på lista?
      const dup = listItems().find((i) => !i.checked && i.key === key);
      if (dup) return json(res, 200, { duplicate: dup.id, text: dup.text });
      q.add.run(cap(t), String(addedBy || '').trim().slice(0, 40), Date.now());
      q.remember.run(key, displayName(t));
      broadcast(); return json(res, 201, { ok: true });
    }
    const m = p.match(/^\/api\/items\/(\d+)(\/toggle)?$/);
    if (m && m[2] && req.method === 'POST') {
      const { storeId } = await readBody(req);
      const now = Date.now(), id = Number(m[1]);
      q.toggle.run(now, id);
      const item = q.get.get(id);
      if (item) recordPick(Number(storeId) || null, keyOf(item.text), !!item.checked, now);
      broadcast(); return json(res, 200, { ok: true });
    }
    if (p === '/api/stores' && req.method === 'GET') return json(res, 200, q.stores.all());
    if (p === '/api/stores' && req.method === 'POST') {
      const name = String((await readBody(req)).name || '').trim().slice(0, 60);
      if (!name) return json(res, 400, { error: 'Mangler navn' });
      q.addStore.run(name); broadcastStores(); return json(res, 201, q.stores.all());
    }
    const sm = p.match(/^\/api\/stores\/(\d+)(\/order)?$/);
    if (sm && sm[2] && req.method === 'GET') return json(res, 200, storeOrder(Number(sm[1])));
    if (sm && !sm[2] && req.method === 'DELETE') { q.delStore.run(Number(sm[1])); broadcastStores(); return json(res, 200, { ok: true }); }
    if (m && !m[2] && req.method === 'DELETE') { q.remove.run(Number(m[1])); broadcast(); return json(res, 200, { ok: true }); }
    if (p === '/api/clear-checked' && req.method === 'POST') { q.clearChecked.run(); broadcast(); return json(res, 200, { ok: true }); }
    if (p === '/api/suggestions') return json(res, 200, q.suggest.all());
    if (p === '/api/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0`); return json(res, 200, { ok: true });
    }

    if (p === '/' || p === '/index.html') return serveStatic(res, '/index.html');
    return serveStatic(res, p);
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'Serverfeil' });
  }
});

server.listen(PORT, HOST, () => console.log(`Handleliste kjører på http://${HOST}:${PORT}`));
