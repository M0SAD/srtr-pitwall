<div align="center">

<img src="../images/logo.png" width="96" alt="SRTR Pitwall -logo" />

# SRTR Pitwall

### Kaikki yhdessä iRacing-kumppani — overlayt, spotteri, strategia, striimaus ja yhteisö yhdessä kevyessä sovelluksessa.

[English](../../README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português (BR)](README.pt-BR.md) · [Português (PT)](README.pt-PT.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Svenska](README.sv.md) · **Suomi** · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[**⬇ Lataa uusin versio**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="SRTR Pitwall -overlayt radalla" width="100%" />

## Miksi SRTR Pitwall?

Useimmat overlay-sovellukset jäävät overlayhin. SRTR Pitwall on täydellinen varikkomuuri simulaattoriisi:

- 🏎️ **27 overlayta, yksi läpinäkyvä ikkuna** — relative, tulostaulu, polttoaine, renkaat, tutka, ratakartta, delta, polkimet, sää, liput ja paljon muuta. Kaikki piirretään yhteen ikkunaan näyttöä kohden, joten meno pysyy nopeana täydelläkin asettelulla.
- 🎙️ **Visuaalinen ja puhuva spotteri** — auto vasemmalla / oikealla, kolme rinnakkain, liput, polttoaine- ja sijoitusilmoitukset turkkilaisella äänipaketilla sekä varoitukset nopeammasta luokasta ja radalle palaamisesta.
- ⛽ **Polttoainestrategia ja reaaliaikainen jakaminen tiimissä** — kulutus per kierros, tankkausmäärät, varikkoikkunat ja tiimikavereidesi polttoaine livenä omassa overlayssasi.
- 👥 **Kaverit ja luotettu live-telemetria** — lisää kavereita, näe kuka on paikalla tai ajamassa ja anna luottamiesi kuljettajien nähdä polttoaineesi ja kierrostietosi livenä. Ei koodeja, ei säätämistä.
- 💬 **Viestit kesken kisan** — kavereiden viestit ponnahtavat ruudulle äänimerkin kera ajon aikana. Älä häiritse -tila pitää ne hiljaa, kunnes olet taas tallissa.
- 📺 **Striimiasettelut OBS:ään** — erilliset asettelut striimaukseen, valmiit näkymät (alkaa pian, palaan pian, lopetus, tallinäkymä) ja Twitch-chatin overlay.
- 🌍 **Yhteisökeskus** — jaa ja lataa kokonaisia asetteluja, striimiasetteluja ja väriteemoja kaikkine asetuksineen. Arvostele, kommentoi ja selaa kuukauden ja kaikkien aikojen suosikkeja.
- 📸 **Kuvakaappaus yhdellä näppäimellä** — Print Screen tallentaa pelin *yhdessä* overlayjesi ja vesileiman kanssa, ja voit jakaa sen yhteisön galleriaan.
- 🎨 **Teemamoottori** — fontit, värit, tiiviys, kulmien pyöristys, läpinäkyvyys ja koko muuttavat kaikkia overlayta kerralla. Kuusi valmista teemaa sekä yhteisön tekemiä teemoja.
- 🧩 **Asettelujen hallinta** — automaattiset asettelut auton ja session mukaan, usean näytön tuki, kohdistusapuviivat ja live-esikatselu oikeiden ratojen taustoja vasten.
- 🔄 **Allekirjoitetut automaattiset päivitykset** — uudet versiot asentuvat yhdellä klikkauksella, ja ne tarkistetaan allekirjoitusavaintamme vasten.
- 🌐 **15 kieltä** — English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.

<img src="../images/panel.jpg" alt="SRTR Pitwall -ohjauspaneeli" width="100%" />

## Rakennettu suorituskykyä varten

Näytönohjaimesi ja prosessorisi kuuluvat simulaattorille. SRTR Pitwall on kirjoitettu **Rust**-kielellä, ja sen käyttöliittymä on tehty **SolidJS**:llä **Tauri 2**:n päälle:

- Kaikki telemetrian luku ja laskenta tapahtuu Rustissa yhdessä taustasäikeessä.
- Jokainen overlay saa vain tarvitsemansa datan omalla tahdillaan. Suljettujen overlayden dataa ei lasketa koskaan.
- Overlay-ikkuna piilotetaan kokonaan, kun iRacing ei ole käynnissä.
- Ohjauspaneelin esikatselut ovat staattisia tilannekuvia, joten ne eivät kuluta prosessoria, kun et käytä niitä.
- Ei sumennustehosteita eikä jatkuvia animaatioita: mikään ei kilpaile pelin kanssa näytönohjaimesta.

## Näin pääset alkuun

1. Lataa asennusohjelma kohdasta [**Releases**](../../../../releases/latest) ja asenna se.
2. Aja iRacingia **reunattomassa / ikkunoidussa koko näytön** tilassa. Windows ei salli overlayta eksklusiivisen koko näytön tilan päällä.
3. Overlayt ilmestyvät automaattisesti, kun iRacing yhdistää. Käytä **Demo**-kytkintä suunnitellaksesi asettelun ilman iRacingia.

| Pikanäppäin | Toiminto |
|---|---|
| `Ctrl` + `Shift` + `E` | Muokkaa asettelua (vedä, muuta kokoa, hiiren oikealla lisävalinnat) |
| `Ctrl` + `Shift` + `D` | Näytä / piilota overlayt |
| `Ctrl` + `Shift` + `Space` | Tuo ohjauspaneeli etualalle |
| `Print Screen` | Kuvakaappaus overlayden kanssa |

Kaikki pikanäppäimet voi vaihtaa kohdassa **Asetukset → Pikanäppäimet**.

## Ilmainen ja PRO

SRTR Pitwall toimii täysin **ilman tiliä**. Ilmainen tili avaa yhteisön, asetusten pilvivarmuuskopion ja kaverilistan. **PRO** tuo mukaan premium-overlayt, äänitallipäällikön, luotetun live-datan jakamisen ja viestien lähettämisen kavereille, yhteisöteemojen jakamisen ja käytön sekä yhteisön asettelujen käytön, arvostelun ja kommentoinnin.

## Yhteisö

Tekijä **Erkin Azcan**, [Sim Race Türkiye](https://www.simracetr.com) -yhteisölle.

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

Löysitkö bugin tai onko sinulla idea? Avaa [issue](../../../../issues).

---

<sub>Kehittäjädokumentaatio (turkiksi): [docs/GELISTIRME.md](../GELISTIRME.md) · Julkaisutiedot: [SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing on iRacing.com Motorsport Simulations, LLC:n tavaramerkki. SRTR Pitwall ei ole iRacingin kanssa sidoksissa eikä iRacingin hyväksymä.</sub>
