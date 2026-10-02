<div align="center">

<img src="../images/logo.png" width="96" alt="SRTR Pitwall-logotyp" />

# SRTR Pitwall

### Den kompletta följeslagaren för iRacing — overlays, spotter, strategi, streaming och community i en lättviktig app.

[English](../../README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português (BR)](README.pt-BR.md) · [Português (PT)](README.pt-PT.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · **Svenska** · [Suomi](README.fi.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[**⬇ Ladda ner senaste versionen**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="SRTR Pitwall-overlays på banan" width="100%" />

## Varför SRTR Pitwall?

De flesta overlay-appar stannar vid overlays. SRTR Pitwall är en komplett depåmur för din simrigg:

- 🏎️ **27 overlays, ett genomskinligt fönster** — relative, resultattavla, bränsle, däck, radar, bankarta, delta, pedaler, väder, flaggor och mycket mer. Allt ritas i ett enda fönster per skärm, så det går snabbt även med en fullspäckad layout.
- 🎙️ **Visuell spotter och röstspotter** — bil till vänster / bil till höger, tre i bredd, flaggor, bränsle- och positionsutrop med ett turkiskt röstpaket, plus varningar för snabbare klass och återinträde på banan.
- ⛽ **Bränslestrategi med live-delning i teamet** — förbrukning per varv, tankningsmängd, depåfönster och dina lagkamraters bränsle live i din egen overlay.
- 👥 **Vänner med betrodd live-telemetri** — lägg till vänner, se vem som är online eller kör, och låt förarna du litar på se ditt bränsle och dina varvdata live. Inga koder, ingen konfiguration.
- 💬 **Meddelanden under racet** — meddelanden från vänner dyker upp på skärmen med ett ljud medan du kör. Stör ej håller dem tysta tills du är tillbaka i garaget.
- 📺 **Streamlayouter för OBS** — separata layouter för streaming, färdiga scener (startar snart, strax tillbaka, avslutning, garageskärm) och en Twitch-chattoverlay.
- 🌍 **Community-hubb** — dela och ladda ner kompletta layouter, streamlayouter och färgteman med alla inställningar inkluderade. Betygsätt, kommentera och bläddra bland månadens och alla tiders toppval.
- 📸 **Skärmdumpar med en knapp** — Print Screen fångar spelet *med* dina overlays och en vattenstämpel, och sedan delar du den i communityns galleri.
- 🎨 **Temamotor** — typsnitt, färger, täthet, hörnradie, opacitet och storlek ändrar alla overlays på en gång. Sex inbyggda teman, plus teman från communityn.
- 🧩 **Layouthanterare** — automatiska layouter per bil och session, stöd för flera skärmar, fästguider och liveförhandsvisning mot riktiga banbakgrunder.
- 🔄 **Signerade automatiska uppdateringar** — nya versioner installeras med ett klick, verifierade mot vår signeringsnyckel.
- 🌐 **15 språk** — English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.

<img src="../images/panel.jpg" alt="SRTR Pitwall kontrollpanel" width="100%" />

## Byggd för prestanda

Ditt grafikkort och din processor tillhör simulatorn. SRTR Pitwall är skriven i **Rust** med ett **SolidJS**-gränssnitt på **Tauri 2**:

- All telemetriläsning och alla beräkningar körs i Rust på en enda bakgrundstråd.
- Varje overlay får bara de data den behöver, i sin egen takt. Data för stängda overlays beräknas aldrig.
- Overlay-fönstret döljs helt när iRacing inte körs.
- Förhandsvisningarna i kontrollpanelen är statiska ögonblicksbilder, så de använder ingen CPU när du inte interagerar med dem.
- Inga oskärpeeffekter eller ständiga animationer: ingenting konkurrerar med spelet om grafikkortet.

## Kom igång

1. Ladda ner installationsprogrammet från [**Releases**](../../../../releases/latest) och installera det.
2. Kör iRacing i läget **kantlös / fönster i helskärm**. Windows tillåter inga overlays ovanpå exklusiv helskärm.
3. Overlays visas automatiskt när iRacing ansluter. Använd **Demo**-reglaget för att designa din layout utan iRacing.

| Kortkommando | Åtgärd |
|---|---|
| `Ctrl` + `Shift` + `E` | Redigera layout (dra, ändra storlek, högerklicka för alternativ) |
| `Ctrl` + `Shift` + `D` | Visa / dölj overlays |
| `Ctrl` + `Shift` + `Space` | Ta fram kontrollpanelen överst |
| `Print Screen` | Skärmdump med overlays |

Alla kortkommandon kan ändras under **Inställningar → Kortkommandon**.

## Gratis och PRO

SRTR Pitwall fungerar fullt ut **utan konto**. Ett gratiskonto låser upp communityn, molnbackup av dina inställningar och vänlistan. **PRO** lägger till premium-overlays, röstingenjören, betrodd live-datadelning och meddelanden till vänner, delning och användning av communityteman samt användning, betygsättning och kommentering av communitylayouter.

## Community

Skapad av **Erkin Azcan** för communityn [Sim Race Türkiye](https://www.simracetr.com).

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

Hittat en bugg eller har en idé? Öppna ett [ärende](../../../../issues).

---

<sub>Utvecklardokumentation (på turkiska): [docs/GELISTIRME.md](../GELISTIRME.md) · Versionsinformation: [SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing är ett varumärke som tillhör iRacing.com Motorsport Simulations, LLC. SRTR Pitwall är inte knutet till eller godkänt av iRacing.</sub>
