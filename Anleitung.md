# Verwertung-Tool online – Anleitung

Version 32. Alle Mitarbeiter arbeiten auf einer gemeinsamen Webseite mit demselben Datenstand.
Was einer erfasst, sehen die anderen nach wenigen Sekunden.

---

## Was in diesem Ordner liegt

| Datei | Wofür |
|---|---|
| `server.js` | Der kleine Server. Braucht keine Zusatzprogramme, nur Node.js. |
| `public/index.html` | Das Tool selbst (V31-Oberfläche plus Mehrbenutzer). |
| `package.json`, `package-lock.json`, `.nvmrc` | Sagen dem Anbieter, wie der Server gestartet wird. |
| `start.bat` | Notlösung: startet das Tool auf einem Windows-PC im Firmennetz. |
| `.gitignore` | Sorgt dafür, dass keine Datenbank aus Versehen auf GitHub landet. |

---

## Schritt 1: Auf GitHub hochladen

1. Auf **github.com** anmelden.
2. Oben rechts auf **+** und dann **New repository**.
3. Name: `verwertung-online`.
4. **Private** auswählen. Wichtig: Im Tool stecken die Artikeldaten der Firma, die sollen nicht öffentlich sein.
5. **Create repository**.
6. Auf der neuen, leeren Seite auf den Link **uploading an existing file**.
7. Die ZIP vorher auf dem PC **entpacken**. Dann den **Inhalt** des Ordners `verwertung-online` (nicht den Ordner selbst) ins Browserfenster ziehen. Der Unterordner `public` muss mit hinein.
   - Hinweis: Dateien, die mit einem Punkt beginnen (`.gitignore`, `.nvmrc`), zeigt Windows manchmal nicht an. Die sind nicht zwingend nötig.
8. Unten **Commit changes**.

Kontrolle: Auf GitHub siehst du jetzt `server.js`, `package.json`, `start.bat`, `Anleitung.md` und den Ordner `public` mit `index.html`.

---

## Schritt 2: Bei Railway online stellen

Kosten: Hobby-Tarif 5 US-Dollar im Monat, darin sind 5 Dollar Nutzung enthalten. Für dieses kleine Tool reicht das normalerweise. Dazu kommt der Speicher (Volume): 0,15 Dollar je GB und Monat. Die Datenbank braucht deutlich weniger als 1 GB.

1. Auf **railway.com** gehen, **Login** und dann **mit GitHub anmelden**.
2. Den **Hobby-Tarif** auswählen (Bezahldaten hinterlegen). Ohne ihn läuft das Tool nicht dauerhaft.
3. **New Project** und dann **Deploy from GitHub repo**. `verwertung-online` auswählen.
   Falls Railway fragt, ob es auf das Repository zugreifen darf: erlauben.
4. Railway baut und startet den Dienst. Das dauert 1 bis 3 Minuten.
5. **Speicher anlegen (Volume). Ganz wichtig, sonst sind die Daten nach jedem Neustart weg!**
   - Auf der Projektfläche mit der **rechten Maustaste** klicken (oder `Strg + K`) und dann **Volume** bzw. **Create Volume**.
   - Als Dienst `verwertung-online` auswählen.
   - Mount-Pfad: `/data`
   - Der Server findet das Volume selbst, du musst dafür nichts weiter eintragen.
6. **Passwort setzen:**
   - Auf den Dienst klicken und dann den Reiter **Variables**.
   - **New Variable**: Name `APP_PASSWORT`, Wert = euer gemeinsames Passwort.
     Nimm etwas, das man auf dem Handy gut tippen kann, aber nicht leicht errät, zum Beispiel `Schrott-Wiesloch-2026`.
7. **Adresse erzeugen:**
   - Reiter **Settings** und dann **Networking** und dann **Generate Domain**.
   - Du bekommst eine Adresse wie `verwertung-online-production.up.railway.app`.
8. Optional unter **Settings** und dann **Region**: eine Region in Europa wählen (z. B. Amsterdam). Dann reagiert es schneller.
9. Unter **Deployments** und dann **View Logs** muss stehen: `Verwertung-Tool läuft auf Port …`.
   Steht dort `WARNUNG: Kein Railway-Volume angehängt`, fehlt Schritt 5.

**Kostenbremse:** Unter **Workspace Settings** und dann **Usage** kannst du ein Limit setzen (z. B. 10 Dollar im Monat). Dann kann es nie teurer werden.

---

## Schritt 3: Mitarbeiter einrichten

1. Die Adresse aus Schritt 2.7 und das Passwort an die Kollegen geben.
2. Jeder öffnet die Adresse im Browser (Handy: Chrome oder Safari), gibt das Passwort ein und dann seinen **Vornamen**.
   - Tipp Handy: Im Browser-Menü **Zum Startbildschirm hinzufügen**. Dann ist das Tool wie eine App da.
3. **Druckplatz einrichten** (nur am Büro-PC mit Drucker):
   Reiter **Druck-Eingang** und dann **Dieses Gerät als Druckplatz festlegen**.
   Dieser Browser-Tab soll im Büro den ganzen Tag offen bleiben, damit Meldung und Ton kommen.

### Alte Daten aus V30/V31 übernehmen (einmalig)

1. Auf dem PC, auf dem bisher mit V31 gearbeitet wurde, die **alte Datei V31** öffnen.
   Dann **Bilanz & Export** und dann **Sicherung speichern**. Es entsteht eine `.json`-Datei.
2. Im neuen Online-Tool: **Bilanz & Export** und dann **Sicherung hinzufügen (z. B. aus V31)** und die Datei wählen.
3. Hast du von mehreren Kollegen alte Stände: einfach nacheinander hinzufügen. Doppelte Einträge werden übersprungen.

---

## So wird gearbeitet

**Im Lager mit dem Handy**
- Erfassen wie gewohnt: Sachnummer suchen, Menge, Gewicht, Behälter.
- VHW-Paletten bekommen ihre Nummer automatisch vom Server (VHW-001, VHW-002 …). Es kann keine Nummer doppelt geben.
- Ist eine Palette fertig: **Fertig – ans Büro zum Drucken senden**. Vorher siehst du den Schein in der Vorschau.
  Oder oben **Alle meine fertigen ans Büro senden**.
- Danach steht an der Palette „wartet auf Druck“. Sobald das Büro gedruckt hat, steht unter **Abgefertigt** „gedruckt von …“.
- Ein Auftrag kann mit **Zurückholen** zurückgenommen werden, solange er noch nicht gedruckt ist.

**Im Büro am Druckplatz**
- Neue Aufträge erscheinen mit Meldung und Ton. Die Zahl steht rot am Reiter **Druck-Eingang**.
- Auswählen (oder **Alle auswählen**), dann **… ausgewählte drucken**. Es öffnet sich eine Sammel-Vorschau, jeder Schein auf eigener Seite, dann **Jetzt drucken**.
- Rot markiert: **„Nach dem Senden geändert“**. Jemand hat nach dem Senden noch etwas geändert, bitte in der Vorschau prüfen.
- **Sammeldruck:** Unten im Druck-Eingang stehen alle fertigen Paletten, die noch keiner gesendet hat. Die kannst du auch direkt drucken, gefiltert nach Mitarbeiter.

**Die Leiste ganz oben**
- Grün **Verbunden**: Alles ist beim Server. Daneben steht, wer gerade online ist.
- Gelb **Wird übertragen …**: Deine letzten Eingaben sind unterwegs.
- Rot **Keine Verbindung**: Eingaben bleiben im Gerät gespeichert und gehen automatisch raus, sobald wieder Netz da ist. Nichts geht verloren.
  Senden ans Büro geht erst wieder mit Verbindung.

**Wenn zwei dieselbe Position gleichzeitig ändern:** Die letzte Änderung gilt. Der andere bekommt einen Hinweis „wurde von … geändert – aktualisiert“.

**„Liste leeren“** löscht jetzt für **alle** Mitarbeiter. Deshalb muss man zur Sicherheit `LEEREN` eintippen.

---

## Datensicherung

- Der Server legt bei jedem Start und jede Nacht um ca. 2 Uhr eine Sicherung an. Die letzten 14 bleiben im Volume erhalten.
- Zusätzlich jederzeit: **Bilanz & Export** und dann **Sicherung speichern**. Das lädt den kompletten gemeinsamen Stand als Datei herunter.
  Empfehlung: einmal pro Woche machen und im Firmenordner ablegen.

---

## Notlösung ohne Internet: Firmen-PC

Wenn Railway einmal nicht geht:
1. Auf einem Windows-PC **Node.js** installieren (nodejs.org, Version „LTS“).
2. Ordner `verwertung-online` auf den PC kopieren und `start.bat` doppelklicken. Das Fenster muss offen bleiben.
3. Am PC selbst: `http://localhost:3000`. Kollegen im selben Firmennetz: `http://<PC-Name>:3000`. Der PC-Name steht im Fenster.
   Passwort ist dann `verwertung`, außer man setzt vorher die Umgebungsvariable `APP_PASSWORT`.
4. Die Daten liegen dann im Unterordner `daten` neben `server.js`.

Und die alte **V31-Datei** funktioniert weiterhin ganz allein, ohne Server.

---

## Wenn etwas hakt

| Problem | Lösung |
|---|---|
| Seite fragt immer wieder nach dem Passwort | Cookies im Browser erlauben. Wurde das Passwort bei Railway geändert, müssen sich alle neu anmelden. |
| Leiste bleibt rot | Netz am Handy prüfen. Bei Railway unter **Deployments** nachsehen, ob der Dienst läuft. |
| Daten nach einem Update weg | Volume fehlt (Schritt 2.5). Sicherung über „Sicherung hinzufügen“ zurückspielen. |
| Druckplatz bekommt keinen Ton | Einmal irgendwo in die Seite klicken (Browser erlauben Töne erst nach einem Klick). Im Druck-Eingang prüfen, dass nicht „Ton aus“ eingestellt ist. |
| Neue Version des Tools einspielen | Die geänderte Datei auf GitHub hochladen (gleicher Name, gleicher Ordner). Railway startet dann automatisch neu, die Daten bleiben. |
