/*
 * Verwertung-Tool online – kleiner Server ohne Fremdpakete.
 * Node.js ab Version 22.13 (eingebautes SQLite: node:sqlite).
 *
 * Einstellungen über Umgebungsvariablen:
 *   APP_PASSWORT   gemeinsames Passwort für alle (unbedingt setzen!)
 *   PORT           Port, Standard 3000 (Railway setzt ihn selbst)
 *   DATA_DIR       Ordner für Datenbank und Sicherungen, Standard ./daten
 *                  Bei Railway nicht nötig: Ist ein Volume angehängt, wird
 *                  automatisch dessen Pfad genommen (RAILWAY_VOLUME_MOUNT_PATH).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = path.resolve(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'daten'));
const PASSWORT = process.env.APP_PASSWORT || 'verwertung';
const GEHEIM = crypto.createHash('sha256').update('verwertung|' + PASSWORT + '|' + (process.env.SESSION_GEHEIM || '')).digest('hex');
const COOKIE = 'vt_login';
const SAMMLUNGEN = new Set(['pos', 'pal', 'con', 'lg', 'gel', 'kopf']);
const MAX_BODY = 25 * 1024 * 1024;

if (!process.env.APP_PASSWORT) {
  console.warn('WARNUNG: APP_PASSWORT ist nicht gesetzt – Standardpasswort "verwertung" aktiv. Bitte setzen!');
}

fs.mkdirSync(path.join(DATA_DIR, 'sicherungen'), { recursive: true });
const DB_DATEI = path.join(DATA_DIR, 'verwertung.db');
const db = new DatabaseSync(DB_DATEI);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS rec (
    coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
    ver INTEGER NOT NULL DEFAULT 1, del INTEGER NOT NULL DEFAULT 0,
    rev INTEGER NOT NULL, von TEXT, um TEXT, angelegt_von TEXT, angelegt_um TEXT,
    PRIMARY KEY (coll, id)
  );
  CREATE INDEX IF NOT EXISTS rec_rev ON rec(rev);
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
`);

const q = {
  metaGet: db.prepare('SELECT v FROM meta WHERE k = ?'),
  metaSet: db.prepare('INSERT INTO meta(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),
  recGet: db.prepare('SELECT * FROM rec WHERE coll = ? AND id = ?'),
  recInsert: db.prepare('INSERT INTO rec(coll, id, data, ver, del, rev, von, um, angelegt_von, angelegt_um) VALUES(?, ?, ?, 1, 0, ?, ?, ?, ?, ?)'),
  recUpdate: db.prepare('UPDATE rec SET data = ?, ver = ver + 1, del = ?, rev = ?, von = ?, um = ? WHERE coll = ? AND id = ?'),
  seit: db.prepare('SELECT * FROM rec WHERE rev > ? ORDER BY rev'),
  lebendePal: db.prepare("SELECT id, data FROM rec WHERE coll = 'pal' AND del = 0"),
  posAufPal: db.prepare("SELECT COUNT(*) AS n FROM rec WHERE coll = 'pos' AND del = 0 AND json_extract(data, '$.pal') = ? AND json_extract(data, '$.weg') IN ('send', 'vhw')"),
  alleLebenden: db.prepare('SELECT coll, id, data FROM rec WHERE del = 0'),
};

function meta(k, standard) { const r = q.metaGet.get(k); return r ? r.v : standard; }
function naechsteRev() { const r = parseInt(meta('rev', '0'), 10) + 1; q.metaSet.run('rev', String(r)); return r; }
function aktuelleRev() { return parseInt(meta('rev', '0'), 10); }
function jetzt() { return new Date().toISOString(); }

function recAusgabe(r) {
  if (!r) return null;
  return { coll: r.coll, id: r.id, data: JSON.parse(r.data), ver: r.ver, del: !!r.del, rev: r.rev,
           von: r.von || '', um: r.um || '', angelegtVon: r.angelegt_von || '', angelegtUm: r.angelegt_um || '' };
}

/* ---------- Palettennummern ---------- */
function normNr(nr) { return String(nr || '').trim().toLowerCase(); }
function vhwWert(nr) { const m = String(nr || '').trim().match(/^VHW-?(\d+)$/i); return m ? parseInt(m[1], 10) : 0; }
function naechsteVhw() {
  let h = parseInt(meta('vhwGedruckt', '0'), 10);
  for (const r of q.lebendePal.all()) {
    const d = JSON.parse(r.data);
    if (d.ziel === 'vhw') h = Math.max(h, vhwWert(d.nr));
  }
  return 'VHW-' + String(h + 1).padStart(3, '0');
}
function nrVergeben(nr, eigeneId) {
  const n = normNr(nr);
  if (!n) return false;
  for (const r of q.lebendePal.all()) {
    if (r.id === eigeneId) continue;
    if (normNr(JSON.parse(r.data).nr) === n) return true;
  }
  return false;
}

/* ---------- Schreiben: jede Änderung ist ein einzelner Datensatz ---------- */
function schreiben(name, ops) {
  const ergebnisse = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const op of ops) {
      const coll = String(op.coll || ''), id = String(op.id || '');
      if (!SAMMLUNGEN.has(coll) || !id || id.length > 200) { ergebnisse.push({ coll, id, ok: false, grund: 'ungueltig' }); continue; }
      const alt = q.recGet.get(coll, id);
      const konflikt = alt && op.baseVer != null && alt.ver !== op.baseVer && alt.von && alt.von !== name ? alt.von : null;

      if (op.del) {
        if (!alt || alt.del) { ergebnisse.push({ coll, id, ok: true, rec: recAusgabe(alt) }); continue; }
        if (coll === 'pal' && q.posAufPal.get(id).n > 0) {
          ergebnisse.push({ coll, id, ok: false, grund: 'palette_belegt', rec: recAusgabe(alt) }); continue;
        }
        q.recUpdate.run(alt.data, 1, naechsteRev(), name, jetzt(), coll, id);
        ergebnisse.push({ coll, id, ok: true, konflikt, rec: recAusgabe(q.recGet.get(coll, id)) });
        continue;
      }

      const data = op.data && typeof op.data === 'object' ? op.data : null;
      if (!data) { ergebnisse.push({ coll, id, ok: false, grund: 'ungueltig' }); continue; }

      if (coll === 'pal') {
        if (data.ziel === 'vhw' && data.nrAuto && !String(data.nr || '').trim()) {
          data.nr = naechsteVhw();
        } else if (String(data.nr || '').trim() && nrVergeben(data.nr, id)) {
          if (data.ziel === 'vhw' && data.nrAuto) data.nr = naechsteVhw();
          else { ergebnisse.push({ coll, id, ok: false, grund: 'nr_doppelt', nr: data.nr, rec: recAusgabe(alt) }); continue; }
        }
        if (data.ziel === 'vhw' && (data.gedruckt || data.fertig)) {
          const w = vhwWert(data.nr);
          if (w > parseInt(meta('vhwGedruckt', '0'), 10)) q.metaSet.run('vhwGedruckt', String(w));
        }
      }

      const json = JSON.stringify(data);
      if (json.length > 2 * 1024 * 1024) { ergebnisse.push({ coll, id, ok: false, grund: 'zu_gross' }); continue; }
      if (alt) {
        if (!alt.del && alt.data === json) { ergebnisse.push({ coll, id, ok: true, rec: recAusgabe(alt) }); continue; }
        q.recUpdate.run(json, 0, naechsteRev(), name, jetzt(), coll, id);
      } else {
        const t = jetzt();
        q.recInsert.run(coll, id, json, naechsteRev(), name, t, name, t);
      }
      ergebnisse.push({ coll, id, ok: true, konflikt, rec: recAusgabe(q.recGet.get(coll, id)) });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return ergebnisse;
}

/* ---------- Live-Verbindungen (Server-Sent Events) ---------- */
const verbindungen = new Set();
function senden(ereignis, daten) {
  const text = 'event: ' + ereignis + '\ndata: ' + JSON.stringify(daten) + '\n\n';
  for (const v of verbindungen) { try { v.res.write(text); } catch (e) { /* wird beim Schließen entfernt */ } }
}
function anwesend() {
  const namen = new Map();
  for (const v of verbindungen) {
    const n = v.name || 'ohne Namen';
    const e = namen.get(n) || { name: n, geraete: 0, druckplatz: false };
    e.geraete++; if (v.druckplatz) e.druckplatz = true;
    namen.set(n, e);
  }
  return [...namen.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
let anwesendTimer = null;
function anwesendMelden() { clearTimeout(anwesendTimer); anwesendTimer = setTimeout(() => senden('anwesend', anwesend()), 150); }
setInterval(() => { for (const v of verbindungen) { try { v.res.write(': ping\n\n'); } catch (e) {} } }, 25000);

/* ---------- Sicherungen ---------- */
function sicherungAnlegen(anlass) {
  try {
    const d = new Date();
    const stempel = d.toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    const ziel = path.join(DATA_DIR, 'sicherungen', 'verwertung_' + stempel + '_' + anlass + '.db');
    if (fs.existsSync(ziel)) return;
    db.exec("VACUUM INTO '" + ziel.replace(/'/g, "''") + "'");
    const alle = fs.readdirSync(path.join(DATA_DIR, 'sicherungen')).filter(f => f.endsWith('.db')).sort();
    while (alle.length > 14) fs.unlinkSync(path.join(DATA_DIR, 'sicherungen', alle.shift()));
    console.log('Sicherung angelegt:', path.basename(ziel));
  } catch (e) { console.error('Sicherung fehlgeschlagen:', e.message); }
}
sicherungAnlegen('start');
setInterval(() => { if (new Date().getHours() === 2) sicherungAnlegen('nacht'); }, 30 * 60 * 1000);

/* ---------- Anmeldung ---------- */
function tokenFuer() { return crypto.createHmac('sha256', GEHEIM).update('angemeldet').digest('hex'); }
function cookies(req) {
  const c = {};
  String(req.headers.cookie || '').split(';').forEach(t => { const i = t.indexOf('='); if (i > 0) c[t.slice(0, i).trim()] = decodeURIComponent(t.slice(i + 1).trim()); });
  return c;
}
function angemeldet(req) {
  const t = cookies(req)[COOKIE] || '', soll = tokenFuer();
  return t.length === soll.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(soll));
}
const fehlversuche = new Map();
function loginSeite(fehler) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verwertung – Anmelden</title><style>
body{margin:0;font-family:Verdana,Arial,sans-serif;font-size:19px;background:linear-gradient(180deg,#8FD3FF,#E3F4FF);min-height:100vh;display:flex;align-items:center;justify-content:center;color:#1B1F3B}
form{background:#fff;border:3px solid #1B1F3B;border-radius:18px;box-shadow:0 6px 0 #1B1F3B;padding:26px 22px;width:min(92vw,420px)}
h1{margin:0 0 6px;font-family:"Arial Black",Verdana,sans-serif;font-size:26px;color:#D7261E}
p{margin:0 0 16px}
input{width:100%;box-sizing:border-box;font-size:22px;padding:14px;border:3px solid #5A6488;border-radius:12px;margin-bottom:16px}
button{width:100%;font-family:"Arial Black",Verdana,sans-serif;font-weight:800;font-size:20px;padding:14px;border:3px solid #1B1F3B;border-radius:12px;background:#2E9E3A;color:#fff;box-shadow:0 4px 0 #1B1F3B;cursor:pointer}
.f{background:#FFE3E1;border:2px solid #D7261E;color:#D7261E;border-radius:10px;padding:8px 10px;margin-bottom:14px;font-weight:700}
</style></head><body><form method="post" action="/anmelden">
<h1>Verwertung erfassen</h1><p>Bitte das gemeinsame Passwort eingeben.</p>
${fehler ? '<div class="f">' + fehler + '</div>' : ''}
<input type="password" name="passwort" autocomplete="current-password" autofocus required>
<button type="submit">Anmelden</button></form></body></html>`;
}

/* ---------- Seite ausliefern (vorkomprimiert) ---------- */
const SEITE = path.join(__dirname, 'public', 'index.html');
let seiteCache = null;
function seite() {
  const st = fs.statSync(SEITE);
  if (!seiteCache || seiteCache.mtime !== st.mtimeMs) {
    const roh = fs.readFileSync(SEITE);
    seiteCache = { mtime: st.mtimeMs, roh, gz: zlib.gzipSync(roh, { level: 9 }), etag: '"' + crypto.createHash('sha1').update(roh).digest('hex').slice(0, 16) + '"' };
  }
  return seiteCache;
}

/* ---------- HTTP ---------- */
function json(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': body.length });
  res.end(body);
}
function koerper(req) {
  return new Promise((ok, fehler) => {
    const teile = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { fehler(new Error('zu gross')); req.destroy(); } else teile.push(c); });
    req.on('end', () => ok(Buffer.concat(teile).toString('utf8')));
    req.on('error', fehler);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pfad = url.pathname;
  try {
    if (pfad === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }

    if (pfad === '/anmelden' && req.method === 'POST') {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      const f = fehlversuche.get(ip) || { n: 0, bis: 0 };
      if (f.bis > Date.now()) { res.writeHead(429, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(loginSeite('Zu viele Versuche. Bitte 1 Minute warten.')); }
      const p = new URLSearchParams(await koerper(req)).get('passwort') || '';
      if (p === PASSWORT) {
        fehlversuche.delete(ip);
        const sicher = (req.headers['x-forwarded-proto'] || '') === 'https';
        res.writeHead(303, { Location: '/', 'Set-Cookie': COOKIE + '=' + tokenFuer() + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (30 * 24 * 3600) + (sicher ? '; Secure' : '') });
        return res.end();
      }
      f.n++; if (f.n >= 8) { f.bis = Date.now() + 60000; f.n = 0; } fehlversuche.set(ip, f);
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(loginSeite('Passwort falsch.'));
    }
    if (pfad === '/abmelden') {
      res.writeHead(303, { Location: '/', 'Set-Cookie': COOKIE + '=; Path=/; Max-Age=0' });
      return res.end();
    }

    if (!angemeldet(req)) {
      if (pfad.startsWith('/api/')) return json(res, 401, { fehler: 'nicht angemeldet' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(loginSeite(''));
    }

    if (pfad === '/' || pfad === '/index.html') {
      const s = seite();
      if (req.headers['if-none-match'] === s.etag) { res.writeHead(304); return res.end(); }
      const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ETag: s.etag,
                           'Content-Length': gz ? s.gz.length : s.roh.length, ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
      return res.end(gz ? s.gz : s.roh);
    }

    if (pfad === '/api/aenderungen' && req.method === 'GET') {
      const seit = Math.max(0, parseInt(url.searchParams.get('seit') || '0', 10) || 0);
      const daten = q.seit.all(seit).map(recAusgabe);
      return json(res, 200, { rev: aktuelleRev(), records: daten });
    }

    if (pfad === '/api/schreiben' && req.method === 'POST') {
      const b = JSON.parse(await koerper(req) || '{}');
      const name = String(b.name || 'ohne Namen').slice(0, 60);
      const ops = Array.isArray(b.ops) ? b.ops.slice(0, 20000) : [];
      const ergebnisse = schreiben(name, ops);
      const rev = aktuelleRev();
      json(res, 200, { rev, results: ergebnisse });
      if (ergebnisse.some(e => e.ok)) senden('rev', { rev, von: name });
      return;
    }

    if (pfad === '/api/live' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      const v = { res, name: String(url.searchParams.get('name') || '').slice(0, 60), druckplatz: url.searchParams.get('druckplatz') === '1' };
      verbindungen.add(v);
      res.write('event: rev\ndata: ' + JSON.stringify({ rev: aktuelleRev() }) + '\n\n');
      anwesendMelden();
      req.on('close', () => { verbindungen.delete(v); anwesendMelden(); });
      return;
    }

    if (pfad === '/api/sicherung.json' && req.method === 'GET') {
      const alle = q.alleLebenden.all().map(r => ({ coll: r.coll, id: r.id, data: JSON.parse(r.data) }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="Server-Sicherung_' + new Date().toISOString().slice(0, 10) + '.json"' });
      return res.end(JSON.stringify({ art: 'Verwertung-Tool Server-Sicherung', erstellt: jetzt(), records: alle }));
    }

    json(res, 404, { fehler: 'nicht gefunden' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { fehler: 'Serverfehler: ' + e.message });
    else try { res.end(); } catch (x) {}
  }
});

server.listen(PORT, () => {
  console.log('Verwertung-Tool läuft auf Port ' + PORT + ' · Daten in ' + DATA_DIR);
  if (process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_VOLUME_MOUNT_PATH && !process.env.DATA_DIR) {
    console.warn('WARNUNG: Kein Railway-Volume angehängt! Die Daten gehen beim nächsten Neustart verloren.');
  }
});
function beenden() { try { db.close(); } catch (e) {} process.exit(0); }
process.on('SIGTERM', beenden);
process.on('SIGINT', beenden);
