<div align="center">

<img src="../images/logo.png" width="96" alt="Logo SRTR Pitwall" />

# SRTR Pitwall

### Wszystko, czego potrzebujesz w iRacing — overlaye, spotter, strategia, streaming i społeczność w jednej lekkiej aplikacji.

[English](../../README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português (BR)](README.pt-BR.md) · [Português (PT)](README.pt-PT.md) · [Nederlands](README.nl.md) · **Polski** · [Svenska](README.sv.md) · [Suomi](README.fi.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[**⬇ Pobierz najnowszą wersję**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="Overlaye SRTR Pitwall na torze" width="100%" />

## Dlaczego SRTR Pitwall?

Większość aplikacji z overlayami kończy się na overlayach. SRTR Pitwall to kompletny pit wall dla Twojego stanowiska:

- 🏎️ **27 overlayów, jedno przezroczyste okno** — relative, tabela wyników, paliwo, opony, radar, mapa toru, delta, pedały, pogoda, flagi i wiele więcej. Wszystko rysowane jest w jednym oknie na monitor, więc działa błyskawicznie nawet przy pełnym układzie.
- 🎙️ **Spotter wizualny i głosowy** — auto z lewej / z prawej, jazda trzema w rzędzie, flagi, paliwo i pozycja z tureckim pakietem głosowym, do tego ostrzeżenia o szybszej klasie i powrocie na tor.
- ⛽ **Strategia paliwowa z udostępnianiem w zespole na żywo** — spalanie na okrążenie, ilość do zatankowania, okna pit stopów i paliwo Twoich kolegów z zespołu na żywo w Twoim własnym overlayu.
- 👥 **Znajomi z zaufaną telemetrią na żywo** — dodawaj znajomych, sprawdzaj, kto jest online lub właśnie się ściga, i pozwól zaufanym kierowcom widzieć Twoje paliwo i czasy okrążeń na żywo. Bez kodów, bez konfiguracji.
- 💬 **Wiadomości w trakcie wyścigu** — wiadomości od znajomych wyskakują na ekranie z dźwiękiem, gdy jedziesz. Tryb „Nie przeszkadzać” wycisza je, dopóki nie wrócisz do garażu.
- 📺 **Układy streamingowe dla OBS** — osobne układy do streamowania, gotowe sceny (zaraz zaczynamy, zaraz wracam, koniec, zasłona garażu) i overlay czatu Twitch.
- 🌍 **Centrum społeczności** — udostępniaj i pobieraj kompletne układy, układy streamingowe i motywy kolorystyczne ze wszystkimi ustawieniami. Oceniaj, komentuj i przeglądaj najlepsze propozycje miesiąca i wszech czasów.
- 📸 **Zrzuty ekranu jednym klawiszem** — Print Screen łapie grę *razem* z overlayami i znakiem wodnym, a potem możesz wrzucić zrzut do galerii społeczności.
- 🎨 **Silnik motywów** — czcionki, kolory, gęstość, zaokrąglenie narożników, przezroczystość i rozmiar zmieniają wszystkie overlaye naraz. Sześć wbudowanych motywów plus motywy od społeczności.
- 🧩 **Menedżer układów** — automatyczne układy dla każdego auta i sesji, obsługa wielu monitorów, linie przyciągania i podgląd na żywo na prawdziwych tłach torów.
- 🔄 **Podpisane automatyczne aktualizacje** — nowe wersje instalują się jednym kliknięciem, weryfikowane naszym kluczem podpisu.
- 🌐 **15 języków** — English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.

<img src="../images/panel.jpg" alt="Panel sterowania SRTR Pitwall" width="100%" />

## Stworzony z myślą o wydajności

Twoje GPU i CPU należą do symulatora. SRTR Pitwall jest napisany w **Rust** z interfejsem w **SolidJS** na **Tauri 2**:

- Cały odczyt telemetrii i obliczenia działają w Rust na jednym wątku w tle.
- Każdy overlay otrzymuje tylko potrzebne mu dane, we własnym tempie. Dane dla zamkniętych overlayów nigdy nie są liczone.
- Okno overlayów jest całkowicie ukryte, gdy iRacing nie działa.
- Podglądy w panelu sterowania to statyczne migawki, więc nie zużywają CPU, gdy z nich nie korzystasz.
- Żadnych rozmyć ani ciągłych animacji: nic nie konkuruje z grą o GPU.

## Pierwsze kroki

1. Pobierz instalator z [**Releases**](../../../../releases/latest) i zainstaluj go.
2. Uruchom iRacing w trybie **pełnego ekranu bez ramki / w oknie**. Windows nie pozwala wyświetlać żadnych overlayów nad ekskluzywnym pełnym ekranem.
3. Overlaye pojawią się automatycznie po połączeniu z iRacing. Użyj przełącznika **Demo**, aby zaprojektować układ bez iRacing.

| Skrót | Akcja |
|---|---|
| `Ctrl` + `Shift` + `E` | Edycja układu (przeciągaj, zmieniaj rozmiar, prawy przycisk myszy – opcje) |
| `Ctrl` + `Shift` + `D` | Pokaż / ukryj overlaye |
| `Ctrl` + `Shift` + `Space` | Przywołaj panel sterowania na wierzch |
| `Print Screen` | Zrzut ekranu z overlayami |

Wszystkie skróty zmienisz w **Ustawienia → Skróty**.

## Free i PRO

SRTR Pitwall działa w pełni **bez konta**. Darmowe konto odblokowuje społeczność, kopię zapasową ustawień w chmurze i listę znajomych. **PRO** dodaje overlaye premium, głosowego inżyniera, zaufane udostępnianie danych na żywo i wysyłanie wiadomości do znajomych, udostępnianie i używanie motywów społeczności oraz używanie, ocenianie i komentowanie układów społeczności.

## Społeczność

Stworzone przez **Erkin Azcan** dla społeczności [Sim Race Türkiye](https://www.simracetr.com).

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

Znalazłeś błąd lub masz pomysł? Otwórz [zgłoszenie](../../../../issues).

---

<sub>Dokumentacja dla deweloperów (po turecku): [docs/GELISTIRME.md](../GELISTIRME.md) · Informacje o wydaniach: [SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing jest znakiem towarowym iRacing.com Motorsport Simulations, LLC. SRTR Pitwall nie jest powiązany z iRacing ani przez nią wspierany.</sub>
