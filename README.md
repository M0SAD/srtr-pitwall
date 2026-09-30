<div align="center">

<img src="docs/images/logo.png" width="96" alt="SRTR Pitwall logo" />

# SRTR Pitwall

### The all-in-one iRacing companion — overlays, spotter, strategy, streaming and community in one lightweight app.

**English** · [Türkçe](docs/readme/README.tr.md) · [Deutsch](docs/readme/README.de.md) · [Español](docs/readme/README.es.md) · [Français](docs/readme/README.fr.md) · [Italiano](docs/readme/README.it.md) · [Português (BR)](docs/readme/README.pt-BR.md) · [Português (PT)](docs/readme/README.pt-PT.md) · [Nederlands](docs/readme/README.nl.md) · [Polski](docs/readme/README.pl.md) · [Svenska](docs/readme/README.sv.md) · [Suomi](docs/readme/README.fi.md) · [Русский](docs/readme/README.ru.md) · [简体中文](docs/readme/README.zh-CN.md) · [日本語](docs/readme/README.ja.md)

[**⬇ Download the latest version**](../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="docs/images/layout.jpg" alt="SRTR Pitwall overlays on track" width="100%" />

## Why SRTR Pitwall?

Most overlay apps stop at overlays. SRTR Pitwall is a complete pit wall for your sim rig:

- 🏎️ **26 overlays, one transparent window** — relative, leaderboard, fuel, tires, radar, track map, delta, inputs, weather, flags and more. Everything draws in a single window per monitor, so it stays fast even with a full layout.
- 🎙️ **Visual & voice spotter** — car-left / car-right, three-wide, flags, fuel and position calls with a Turkish voice pack, plus faster-class and rejoin warnings.
- ⛽ **Fuel strategy with live team sharing** — per-lap consumption, refuel amounts, pit windows, and your teammates' fuel shown live in your own overlay.
- 👥 **Friends with trusted live telemetry** — add friends, see who is online or racing, and let the drivers you trust see your live fuel and lap data. No codes, no setup.
- 💬 **In-race messaging** — messages from friends pop up on screen with a sound while you race. Do-not-disturb keeps them quiet until you're back in the garage.
- 📺 **Stream layouts for OBS** — separate layouts for streaming, ready-made scenes (starting soon, be right back, ending, garage cover) and a Twitch chat overlay.
- 🌍 **Community hub** — share and download complete layouts, stream layouts and colour themes with every setting included. Rate, comment, and browse this month's and all-time top picks.
- 📸 **One-key screenshots** — Print Screen captures the game *with* your overlays and a watermark, then share it to the community gallery.
- 🎨 **Theme engine** — fonts, colours, density, corner radius, opacity and size change every overlay at once. Six built-in themes, plus themes from the community.
- 🧩 **Layout manager** — automatic layouts per car and session, multi-monitor support, snapping guides and a live preview on real track backdrops.
- 🔄 **Signed auto-updates** — new versions install with one click, verified against our signing key.
- 🌐 **15 languages** — English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.

<img src="docs/images/panel.jpg" alt="SRTR Pitwall control panel" width="100%" />

## Built for performance

Your GPU and CPU belong to the sim. SRTR Pitwall is written in **Rust** with a **SolidJS** interface on **Tauri 2**:

- All telemetry reading and calculation runs in Rust on a single background thread.
- Each overlay only receives the data it needs, at its own rate. Data for closed overlays is never computed.
- The overlay window is fully hidden when iRacing is not running.
- Previews in the control panel are static snapshots, so they use no CPU when you're not interacting.
- No blur effects or constant animations: nothing competes with the game for the GPU.

## Getting started

1. Download the installer from [**Releases**](../../releases/latest) and install it.
2. Run iRacing in **borderless / windowed fullscreen** mode. Windows doesn't allow any overlay on top of exclusive fullscreen.
3. Overlays appear automatically when iRacing connects. Use the **Demo** switch to design your layout without iRacing.

| Shortcut | Action |
|---|---|
| `Ctrl` + `Shift` + `E` | Edit layout (drag, resize, right-click for options) |
| `Ctrl` + `Shift` + `D` | Show / hide overlays |
| `Ctrl` + `Shift` + `Space` | Bring the control panel to the front |
| `Print Screen` | Screenshot with overlays |

All shortcuts can be changed in **Settings → Shortcuts**.

## Free and PRO

SRTR Pitwall works fully **without an account**. A free account unlocks the community, cloud backup of your settings and the friends list. **PRO** adds premium overlays, the voice engineer, trusted live data sharing and sending messages to friends, sharing and using community themes, and using, rating and commenting on community layouts.

## Community

Made by **Erkin Azcan** for the [Sim Race Türkiye](https://www.simracetr.com) community.

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

Found a bug or have an idea? Open an [issue](../../issues).

---

<sub>Developer documentation (Turkish): [docs/GELISTIRME.md](docs/GELISTIRME.md) · Release notes: [SURUM_NOTLARI.md](SURUM_NOTLARI.md)<br/>
iRacing is a trademark of iRacing.com Motorsport Simulations, LLC. SRTR Pitwall is not affiliated with or endorsed by iRacing.</sub>
