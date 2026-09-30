<div align="center">

<img src="../images/logo.png" width="96" alt="SRTR Pitwall Logo" />

# SRTR Pitwall

### Dein All-in-one-Begleiter für iRacing — Overlays, Spotter, Strategie, Streaming und Community in einer schlanken App.

[English](../../README.md) · [Türkçe](README.tr.md) · **Deutsch** · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português (BR)](README.pt-BR.md) · [Português (PT)](README.pt-PT.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Svenska](README.sv.md) · [Suomi](README.fi.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[**⬇ Neueste Version herunterladen**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="SRTR Pitwall Overlays auf der Strecke" width="100%" />

## Warum SRTR Pitwall?

Die meisten Overlay-Apps hören bei Overlays auf. SRTR Pitwall ist eine komplette Boxenmauer für dein Sim-Rig:

- 🏎️ **26 Overlays, ein transparentes Fenster** — Relative, Leaderboard, Sprit, Reifen, Radar, Streckenkarte, Delta, Inputs, Wetter, Flaggen und mehr. Alles wird pro Monitor in einem einzigen Fenster gezeichnet — und bleibt selbst mit vollem Layout flott.
- 🎙️ **Visueller & akustischer Spotter** — Auto links / Auto rechts, drei nebeneinander, Flaggen-, Sprit- und Positionsansagen mit türkischem Sprachpaket, dazu Warnungen vor schnelleren Klassen und beim Wiedereinfädeln.
- ⛽ **Spritstrategie mit Live-Teamsharing** — Verbrauch pro Runde, Nachtankmengen, Boxenfenster und der Sprit deiner Teamkollegen live in deinem eigenen Overlay.
- 👥 **Freunde mit vertrauenswürdiger Live-Telemetrie** — Freunde hinzufügen, sehen, wer online ist oder gerade fährt, und Fahrern deines Vertrauens deine Live-Sprit- und Rundendaten zeigen. Keine Codes, kein Setup.
- 💬 **Nachrichten im Rennen** — Nachrichten von Freunden erscheinen mit Ton auf dem Bildschirm, während du fährst. „Nicht stören“ hält sie still, bis du wieder in der Garage bist.
- 📺 **Stream-Layouts für OBS** — eigene Layouts fürs Streaming, fertige Szenen (gleich geht's los, bin gleich zurück, Ende, Garagen-Screen) und ein Twitch-Chat-Overlay.
- 🌍 **Community-Hub** — komplette Layouts, Stream-Layouts und Farbthemes inklusive aller Einstellungen teilen und herunterladen. Bewerten, kommentieren und die Top-Picks des Monats und aller Zeiten entdecken.
- 📸 **Screenshots per Tastendruck** — Print Screen fängt das Spiel *mitsamt* deinen Overlays und einem Wasserzeichen ein; danach ab damit in die Community-Galerie.
- 🎨 **Theme-Engine** — Schriften, Farben, Dichte, Eckenradius, Deckkraft und Größe ändern alle Overlays auf einmal. Sechs eingebaute Themes plus Themes aus der Community.
- 🧩 **Layout-Manager** — automatische Layouts je Auto und Session, Multi-Monitor-Support, Einrasthilfen und eine Live-Vorschau vor echten Strecken-Kulissen.
- 🔄 **Signierte Auto-Updates** — neue Versionen installieren sich mit einem Klick, verifiziert mit unserem Signaturschlüssel.
- 🌐 **15 Sprachen** — English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.

<img src="../images/panel.jpg" alt="SRTR Pitwall Kontrollzentrum" width="100%" />

## Gebaut für Performance

Deine GPU und CPU gehören der Sim. SRTR Pitwall ist in **Rust** geschrieben, mit einer **SolidJS**-Oberfläche auf **Tauri 2**:

- Sämtliches Auslesen und Berechnen der Telemetrie läuft in Rust auf einem einzigen Hintergrund-Thread.
- Jedes Overlay erhält nur die Daten, die es braucht — in seinem eigenen Takt. Daten für geschlossene Overlays werden gar nicht erst berechnet.
- Läuft iRacing nicht, ist das Overlay-Fenster komplett ausgeblendet.
- Vorschauen im Kontrollzentrum sind statische Schnappschüsse und kosten keine CPU, solange du nicht damit interagierst.
- Keine Blur-Effekte, keine Dauer-Animationen: Nichts macht dem Spiel die GPU streitig.

## Los geht's

1. Lade den Installer unter [**Releases**](../../../../releases/latest) herunter und installiere ihn.
2. Starte iRacing im **randlosen / Fenster-Vollbild**-Modus. Windows erlaubt keine Overlays über exklusivem Vollbild.
3. Die Overlays erscheinen automatisch, sobald iRacing verbunden ist. Mit dem **Demo**-Schalter gestaltest du dein Layout auch ohne iRacing.

| Tastenkürzel | Aktion |
|---|---|
| `Ctrl` + `Shift` + `E` | Layout bearbeiten (ziehen, skalieren, Rechtsklick für Optionen) |
| `Ctrl` + `Shift` + `D` | Overlays ein- / ausblenden |
| `Ctrl` + `Shift` + `Space` | Kontrollzentrum in den Vordergrund holen |
| `Print Screen` | Screenshot mit Overlays |

Alle Tastenkürzel lassen sich unter **Einstellungen → Tastenkürzel** ändern.

## Kostenlos und PRO

SRTR Pitwall funktioniert voll und ganz **ohne Konto**. Ein kostenloses Konto schaltet die Community, ein Cloud-Backup deiner Einstellungen und die Freundesliste frei. **PRO** legt Premium-Overlays, den Sprach-Renningenieur, vertrauenswürdiges Live-Datensharing und Nachrichten an Freunde obendrauf — dazu das Teilen und Nutzen von Community-Themes sowie das Nutzen, Bewerten und Kommentieren von Community-Layouts.

## Community

Entwickelt von **Erkin Azcan** für die [Sim Race Türkiye](https://www.simracetr.com)-Community.

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

Einen Bug gefunden oder eine Idee? Eröffne ein [Issue](../../../../issues).

---

<sub>Entwicklerdokumentation (Türkisch): [docs/GELISTIRME.md](../GELISTIRME.md) · Versionshinweise: [SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing ist eine Marke von iRacing.com Motorsport Simulations, LLC. SRTR Pitwall steht in keiner Verbindung zu iRacing und wird nicht von iRacing unterstützt.</sub>
