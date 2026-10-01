<div align="center">

<img src="../images/logo.png" width="96" alt="Logo di SRTR Pitwall" />

# SRTR Pitwall

### Il compagno definitivo per iRacing: overlay, spotter, strategia, streaming e community in un'unica app leggera.

[English](../../README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · **Italiano** · [Português (BR)](README.pt-BR.md) · [Português (PT)](README.pt-PT.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Svenska](README.sv.md) · [Suomi](README.fi.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[**⬇ Scarica l'ultima versione**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="Overlay di SRTR Pitwall in pista" width="100%" />

## Perché SRTR Pitwall?

La maggior parte delle app si ferma agli overlay. SRTR Pitwall è un vero muretto box per il tuo simulatore:

- 🏎️ **27 overlay, un'unica finestra trasparente**: relative, classifica, carburante, gomme, radar, mappa del tracciato, delta, input, meteo, bandiere e molto altro. Tutto viene disegnato in una sola finestra per monitor, così resta fluido anche con un layout completo.
- 🎙️ **Spotter visivo e vocale**: auto a sinistra / a destra, tre affiancate, bandiere, carburante e posizione con un pacchetto vocale in turco, più avvisi per le classi più veloci e per il rientro in pista.
- ⛽ **Strategia carburante con condivisione live nel team**: consumo per giro, quantità di rifornimento, finestre di pit stop e il carburante dei tuoi compagni di squadra, in tempo reale nel tuo overlay.
- 👥 **Amici con telemetria live fidata**: aggiungi amici, scopri chi è online o in gara e lascia che i piloti di cui ti fidi vedano in diretta il tuo carburante e i tuoi tempi. Niente codici, niente configurazione.
- 💬 **Messaggi in gara**: i messaggi degli amici compaiono sullo schermo con un suono mentre corri. La modalità Non disturbare li tiene in silenzio finché non torni ai box.
- 📺 **Layout per lo streaming con OBS**: layout dedicati allo streaming, scene pronte all'uso (inizio a breve, torno subito, fine, copertura garage) e un overlay per la chat di Twitch.
- 🌍 **Hub della community**: condividi e scarica layout completi, layout per lo streaming e temi colore con tutte le impostazioni incluse. Vota, commenta e scopri i migliori del mese e di sempre.
- 📸 **Screenshot con un tasto**: Stamp cattura il gioco *insieme* ai tuoi overlay e a un watermark, pronto da condividere nella galleria della community.
- 🎨 **Motore dei temi**: font, colori, densità, arrotondamento degli angoli, opacità e dimensioni cambiano tutti gli overlay in un colpo solo. Sei temi integrati, più quelli della community.
- 🧩 **Gestione dei layout**: layout automatici per auto e sessione, supporto multi-monitor, guide magnetiche e anteprima dal vivo su veri sfondi di pista.
- 🔄 **Aggiornamenti automatici firmati**: le nuove versioni si installano con un clic e vengono verificate con la nostra chiave di firma.
- 🌐 **15 lingue**: English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.

<img src="../images/panel.jpg" alt="Pannello di controllo di SRTR Pitwall" width="100%" />

## Progettato per le prestazioni

GPU e CPU appartengono al simulatore. SRTR Pitwall è scritto in **Rust** con un'interfaccia **SolidJS** su **Tauri 2**:

- Tutta la lettura e l'elaborazione della telemetria avvengono in Rust, su un unico thread in background.
- Ogni overlay riceve solo i dati che gli servono, alla propria frequenza. I dati degli overlay chiusi non vengono mai calcolati.
- La finestra degli overlay è completamente nascosta quando iRacing non è in esecuzione.
- Le anteprime nel pannello di controllo sono istantanee statiche: zero CPU quando non le stai usando.
- Niente effetti blur né animazioni continue: nulla ruba la GPU al gioco.

## Per iniziare

1. Scarica il programma di installazione da [**Releases**](../../../../releases/latest) e installalo.
2. Avvia iRacing in modalità **schermo intero senza bordi / finestra**. Windows non permette alcun overlay sopra lo schermo intero esclusivo.
3. Gli overlay compaiono automaticamente quando iRacing si connette. Usa l'interruttore **Demo** per creare il tuo layout anche senza iRacing.

| Scorciatoia | Azione |
|---|---|
| `Ctrl` + `Shift` + `E` | Modifica il layout (trascina, ridimensiona, clic destro per le opzioni) |
| `Ctrl` + `Shift` + `D` | Mostra / nascondi gli overlay |
| `Ctrl` + `Shift` + `Space` | Porta in primo piano il pannello di controllo |
| `Print Screen` | Screenshot con gli overlay |

Tutte le scorciatoie si possono modificare in **Impostazioni → Scorciatoie**.

## Gratis e PRO

SRTR Pitwall funziona al completo **senza account**. Un account gratuito sblocca la community, il backup nel cloud delle impostazioni e la lista amici. **PRO** aggiunge overlay premium, l'ingegnere vocale, la condivisione live fidata dei dati e l'invio di messaggi agli amici, la condivisione e l'uso dei temi della community, oltre all'uso, al voto e ai commenti sui layout della community.

## Community

Creato da **Erkin Azcan** per la community di [Sim Race Türkiye](https://www.simracetr.com).

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

Hai trovato un bug o hai un'idea? Apri una [segnalazione](../../../../issues).

---

<sub>Documentazione per sviluppatori (in turco): [docs/GELISTIRME.md](../GELISTIRME.md) · Note di rilascio: [SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing è un marchio di iRacing.com Motorsport Simulations, LLC. SRTR Pitwall non è affiliato né approvato da iRacing.</sub>
