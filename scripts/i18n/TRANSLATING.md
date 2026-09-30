# Translating SRTR Pitwall

SRTR Pitwall is an iRacing overlay app (sim racing HUD: leaderboard, relative, fuel calculator,
spotter, track map, OBS streaming, team fuel sharing, voice engineer). The source language is
Turkish. The UI catalog is `src/locales/_source.json`: each KEY is a Turkish UI string, the VALUE
is only the list of source files where it appears (context, do not translate it).

Write `src/locales/<code>.json` as a flat JSON object `{ "<Turkish key>": "<translation>" }`
containing EVERY key of `_source.json`, in the same order.

Rules
- Keep placeholders exactly: `{0}`, `{1}` … (you may move them to where the grammar needs them).
  Keep `{{ .Token }}`-style text untouched if it ever appears.
- Keep these as-is (product/feature/brand names): SRTR Pitwall, Pitwall (when it is the "Pitwall"
  tool/panel name), iRacing, CrewChief, Leaderboard, Relative, Live Timing, Battle Box, Data Frame,
  DigiFlags, Webview, OBS, MQTT, Twitch, SimHub, Home Assistant, Patreon, Ko-fi, Supabase, League
  Builder, PRO, SOF, iRating, SR, ABS, TC, BB, Hz, FPS, GPU, HTTP, IP, JSON, LED, HUD, car brand
  names (Porsche, Ferrari, …), font names (Inter, Rajdhani, Segoe UI, JetBrains Mono, …),
  keyboard keys (Ctrl, Shift, Alt, Tab, Enter, Space, Home, End, PageUp, PageDown, Insert, Delete,
  Up, Down, Left, Right, Num), driver/user sample names (Emre Kaya, Luca Rossi, ModErkin, SRTRFan…).
- Sim-racing terms: use the words drivers in that language actually use (e.g. "pit lane", "stint",
  "delta", "overlay", "spotter", "kerb" are commonly kept in English in many languages; follow the
  community convention of the target language).
- Tone: friendly, informal second person (Turkish uses "sen"): de → du, fr → tu, es → tú,
  it → tu, pt-BR → você, pt-PT → tu, nl → je, pl → ty, sv/fi → informal, ru → ты,
  ja → polite but concise (です/ます is fine for sentences, plain nouns for labels), zh → 你.
- Keep length close to the source: these are buttons, labels and small overlay captions.
  Short labels must stay short. ALL-CAPS keys stay ALL-CAPS (they are overlay banners).
- Keys starting or ending with punctuation/spaces (e.g. "· Tur", "— yeni …") are fragments shown
  next to other text: keep the same leading/trailing punctuation.
- Some keys are sentence fragments that sit around a bold word or a value in the UI
  (e.g. "Aboneliği SRTR Pitwall hesabınla" + "aynı e-posta" + "ile yap; …"). Translate each
  fragment so the parts still read naturally when concatenated in order.
- Email strings (keys containing "kodun", "e-posta", "şifre" in full sentences) are sent in emails:
  natural, warm, short.
- Output must be valid JSON (escape quotes and backslashes). Do not add comments or extra keys.
