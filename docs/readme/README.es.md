<div align="center">

<img src="../images/logo.png" width="96" alt="Logo de SRTR Pitwall" />

# SRTR Pitwall

### Tu compañero todo en uno para iRacing — overlays, spotter, estrategia, streaming y comunidad en una sola app ligera.

[English](../../README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · **Español** · [Français](README.fr.md) · [Italiano](README.it.md) · [Português (BR)](README.pt-BR.md) · [Português (PT)](README.pt-PT.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Svenska](README.sv.md) · [Suomi](README.fi.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[**⬇ Descarga la última versión**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="Overlays de SRTR Pitwall en pista" width="100%" />

## ¿Por qué SRTR Pitwall?

La mayoría de las apps de overlays se quedan en los overlays. SRTR Pitwall es un muro de boxes completo para tu simulador:

- 🏎️ **27 overlays, una sola ventana transparente** — relative, leaderboard, combustible, neumáticos, radar, mapa del circuito, delta, inputs, meteorología, banderas y mucho más. Todo se dibuja en una única ventana por monitor, así que va fluido incluso con un layout lleno.
- 🎙️ **Spotter visual y por voz** — coche a la izquierda / a la derecha, tres en paralelo, avisos de banderas, combustible y posición con un pack de voz en turco, además de alertas de clases más rápidas y de reincorporación a pista.
- ⛽ **Estrategia de combustible compartida en directo con tu equipo** — consumo por vuelta, cantidades a repostar, ventanas de parada y el combustible de tus compañeros en vivo en tu propio overlay.
- 👥 **Amigos con telemetría en directo de confianza** — añade amigos, mira quién está conectado o corriendo y deja que los pilotos en los que confías vean tu combustible y tus vueltas en vivo. Sin códigos, sin configuración.
- 💬 **Mensajes en carrera** — los mensajes de tus amigos aparecen en pantalla con un sonido mientras corres. El modo No molestar los silencia hasta que vuelvas al garaje.
- 📺 **Layouts de stream para OBS** — layouts separados para retransmitir, escenas listas para usar (empezamos pronto, vuelvo enseguida, cierre, pantalla de garaje) y un overlay del chat de Twitch.
- 🌍 **Hub de la comunidad** — comparte y descarga layouts completos, layouts de stream y temas de color con todos sus ajustes incluidos. Valora, comenta y explora lo mejor del mes y de todos los tiempos.
- 📸 **Capturas con una sola tecla** — Imprimir Pantalla captura el juego *con* tus overlays y una marca de agua, y luego lo compartes en la galería de la comunidad.
- 🎨 **Motor de temas** — fuentes, colores, densidad, radio de las esquinas, opacidad y tamaño cambian todos los overlays a la vez. Seis temas integrados, más los temas de la comunidad.
- 🧩 **Gestor de layouts** — layouts automáticos por coche y sesión, soporte multimonitor, guías de ajuste y vista previa en vivo sobre fondos reales de circuitos.
- 🔄 **Actualizaciones automáticas firmadas** — las nuevas versiones se instalan con un clic, verificadas con nuestra clave de firma.
- 🌐 **15 idiomas** — English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.

<img src="../images/panel.jpg" alt="Panel de control de SRTR Pitwall" width="100%" />

## Pensado para el rendimiento

Tu GPU y tu CPU son del simulador. SRTR Pitwall está escrito en **Rust** con una interfaz en **SolidJS** sobre **Tauri 2**:

- Toda la lectura y el cálculo de la telemetría se ejecutan en Rust en un único hilo en segundo plano.
- Cada overlay recibe solo los datos que necesita, a su propio ritmo. Los datos de los overlays cerrados nunca se calculan.
- La ventana de overlays se oculta por completo cuando iRacing no está en marcha.
- Las vistas previas del panel de control son instantáneas estáticas, así que no consumen CPU mientras no interactúas.
- Sin efectos de desenfoque ni animaciones constantes: nada le disputa la GPU al juego.

## Primeros pasos

1. Descarga el instalador desde [**Releases**](../../../../releases/latest) e instálalo.
2. Ejecuta iRacing en modo **sin bordes / pantalla completa en ventana**. Windows no permite ningún overlay sobre la pantalla completa exclusiva.
3. Los overlays aparecen automáticamente cuando iRacing se conecta. Usa el interruptor **Demo** para diseñar tu layout sin iRacing.

| Atajo | Acción |
|---|---|
| `Ctrl` + `Shift` + `E` | Editar layout (arrastra, redimensiona, clic derecho para opciones) |
| `Ctrl` + `Shift` + `D` | Mostrar / ocultar overlays |
| `Ctrl` + `Shift` + `Space` | Traer el panel de control al frente |
| `Print Screen` | Captura de pantalla con overlays |

Todos los atajos se pueden cambiar en **Ajustes → Atajos**.

## Gratis y PRO

SRTR Pitwall funciona por completo **sin cuenta**. Una cuenta gratuita desbloquea la comunidad, la copia de seguridad en la nube de tus ajustes y la lista de amigos. **PRO** añade overlays premium, el ingeniero por voz, el intercambio de datos en directo de confianza y el envío de mensajes a amigos, compartir y usar temas de la comunidad, y usar, valorar y comentar layouts de la comunidad.

## Comunidad

Creado por **Erkin Azcan** para la comunidad [Sim Race Türkiye](https://www.simracetr.com).

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

¿Has encontrado un bug o tienes una idea? Abre un [issue](../../../../issues).

---

<sub>Documentación para desarrolladores (en turco): [docs/GELISTIRME.md](../GELISTIRME.md) · Notas de la versión: [SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing es una marca comercial de iRacing.com Motorsport Simulations, LLC. SRTR Pitwall no está afiliado a iRacing ni cuenta con su respaldo.</sub>
