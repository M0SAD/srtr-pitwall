<div align="center">

<img src="../images/logo.png" width="96" alt="SRTR Pitwall-logo" />

# SRTR Pitwall

### De alles-in-één iRacing-companion: overlays, spotter, strategie, streaming en community in één lichte app.

[English](../../README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português (BR)](README.pt-BR.md) · [Português (PT)](README.pt-PT.md) · **Nederlands** · [Polski](README.pl.md) · [Svenska](README.sv.md) · [Suomi](README.fi.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[**⬇ Download de nieuwste versie**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="SRTR Pitwall-overlays op het circuit" width="100%" />

## Waarom SRTR Pitwall?

De meeste overlay-apps houden op bij overlays. SRTR Pitwall is een complete pitmuur voor je simrig:

- 🏎️ **27 overlays, één transparant venster**: relative, klassement, brandstof, banden, radar, circuitkaart, delta, inputs, weer, vlaggen en nog veel meer. Alles wordt in één venster per monitor getekend, dus het blijft snel, zelfs met een volle layout.
- 🎙️ **Visuele en gesproken spotter**: auto links / auto rechts, drie naast elkaar, vlaggen, brandstof en positie met een Turks stempakket, plus waarschuwingen voor snellere klassen en bij het terugkeren op de baan.
- ⛽ **Brandstofstrategie met live delen in je team**: verbruik per ronde, tankhoeveelheden, pitvensters en de brandstof van je teamgenoten, live in je eigen overlay.
- 👥 **Vrienden met vertrouwde live telemetrie**: voeg vrienden toe, zie wie online is of aan het racen, en laat coureurs die je vertrouwt live je brandstof en rondedata zien. Geen codes, geen gedoe.
- 💬 **Berichten tijdens de race**: berichten van vrienden verschijnen met een geluidje op je scherm terwijl je racet. Niet storen houdt ze stil tot je terug in de garage bent.
- 📺 **Streamlayouts voor OBS**: aparte layouts voor streaming, kant-en-klare scènes (begint zo, zo terug, einde, garagescherm) en een Twitch-chatoverlay.
- 🌍 **Communityhub**: deel en download complete layouts, streamlayouts en kleurthema's met alle instellingen erbij. Beoordeel, reageer en ontdek de toppers van deze maand en aller tijden.
- 📸 **Screenshots met één toets**: Print Screen legt de game vast *mét* je overlays en een watermerk, klaar om te delen in de communitygalerij.
- 🎨 **Thema-engine**: lettertypen, kleuren, dichtheid, hoekafronding, dekking en grootte passen alle overlays in één keer aan. Zes ingebouwde thema's, plus thema's uit de community.
- 🧩 **Layoutbeheer**: automatische layouts per auto en sessie, ondersteuning voor meerdere monitoren, uitlijnhulplijnen en een live voorbeeld op echte circuitachtergronden.
- 🔄 **Ondertekende automatische updates**: nieuwe versies installeer je met één klik, gecontroleerd met onze ondertekeningssleutel.
- 🌐 **15 talen**: English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.

<img src="../images/panel.jpg" alt="SRTR Pitwall-bedieningspaneel" width="100%" />

## Gebouwd voor prestaties

Je GPU en CPU zijn van de sim. SRTR Pitwall is geschreven in **Rust** met een **SolidJS**-interface op **Tauri 2**:

- Al het uitlezen en rekenwerk van de telemetrie draait in Rust, op één achtergrondthread.
- Elke overlay krijgt alleen de data die hij nodig heeft, in zijn eigen tempo. Data voor gesloten overlays wordt nooit berekend.
- Het overlayvenster is volledig verborgen als iRacing niet draait.
- Voorbeelden in het bedieningspaneel zijn statische momentopnamen, dus ze kosten geen CPU zolang je er niets mee doet.
- Geen blur-effecten of eindeloze animaties: niets concurreert met de game om de GPU.

## Aan de slag

1. Download het installatieprogramma via [**Releases**](../../../../releases/latest) en installeer het.
2. Start iRacing in **randloos / venster-volledig-scherm**. Windows staat geen enkele overlay toe boven exclusief volledig scherm.
3. Overlays verschijnen automatisch zodra iRacing verbinding maakt. Gebruik de **Demo**-schakelaar om je layout te ontwerpen zonder iRacing.

| Sneltoets | Actie |
|---|---|
| `Ctrl` + `Shift` + `E` | Layout bewerken (slepen, formaat wijzigen, rechtsklik voor opties) |
| `Ctrl` + `Shift` + `D` | Overlays tonen / verbergen |
| `Ctrl` + `Shift` + `Space` | Bedieningspaneel naar voren halen |
| `Print Screen` | Screenshot met overlays |

Alle sneltoetsen kun je aanpassen via **Instellingen → Sneltoetsen**.

## Gratis en PRO

SRTR Pitwall werkt volledig **zonder account**. Met een gratis account krijg je toegang tot de community, een cloudback-up van je instellingen en de vriendenlijst. **PRO** voegt premium overlays toe, de gesproken engineer, vertrouwd live data delen en berichten sturen naar vrienden, communitythema's delen en gebruiken, en communitylayouts gebruiken, beoordelen en erop reageren.

## Community

Gemaakt door **Erkin Azcan** voor de [Sim Race Türkiye](https://www.simracetr.com)-community.

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

Een bug gevonden of een idee? Open een [issue](../../../../issues).

---

<sub>Ontwikkelaarsdocumentatie (in het Turks): [docs/GELISTIRME.md](../GELISTIRME.md) · Releasenotes: [SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing is een handelsmerk van iRacing.com Motorsport Simulations, LLC. SRTR Pitwall is niet verbonden aan of goedgekeurd door iRacing.</sub>
