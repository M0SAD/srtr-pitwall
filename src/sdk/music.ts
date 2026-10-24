// Çalan müzik: Rust tarafındaki okuyucudan (src-tauri/src/music.rs → Windows medya oturumları) gelir.
// Spotify, tarayıcıda YouTube Music / YouTube ve medya tuşlarını destekleyen diğer oynatıcılar; hesap bağlama yok.
import { createSignal, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "./platform";

export interface MusicState {
  supported: boolean;
  active: boolean;
  /** "spotify" | "browser" | "app" */
  kind: string;
  source: string;
  appId: string;
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  /** Konum (ms), konumun geçerli olduğu an (epoch ms), süre (ms; 0: bilinmiyor) */
  posMs: number;
  at: number;
  durMs: number;
  canPrev: boolean;
  canNext: boolean;
  canToggle: boolean;
  /** data: adresi (uygulama) */
  art: string;
  /** OBS: kapak resmi adresi */
  artUrl: string;
  key: string;
  /** [uygulama kimliği, ad, çalıyor mu] */
  sessions: [string, string, boolean][];
  error: string;
  /** Oynatıcının ses düzeyi (%; Windows ses karıştırıcısındaki uygulama sesi), -1: bilinmiyor */
  volume?: number;
  muted?: boolean;
}
export type MusicAction = "toggle" | "play" | "pause" | "next" | "prev" | "volup" | "voldown" | "mute" | `vol:${number}`;

const EMPTY: MusicState = {
  supported: true,
  active: false,
  kind: "",
  source: "",
  appId: "",
  title: "",
  artist: "",
  album: "",
  playing: false,
  posMs: 0,
  at: 0,
  durMs: 0,
  canPrev: false,
  canNext: false,
  canToggle: false,
  art: "",
  artUrl: "",
  key: "",
  sessions: [],
  error: "",
  volume: -1,
  muted: false,
};
const [state, setState] = createSignal<MusicState>(EMPTY);
let users = 0;
let stop: (() => void) | undefined;

const pull = (watch: boolean, pref: string | null) =>
  invoke<MusicState>("music_state", { watch, pref })
    .then((s) => s && setState(s))
    .catch(() => {});

/** Son durum. `watch` doğruyken (ekrandaki overlay) okuyucu çalışır; `pref`: kaynak tercihi ("auto" | "spotify" | "browser" |
 *  uygulama kimliği; yalnızca overlay verir, ayar kutusu vermez) */
export function useMusic(watch: () => boolean = () => true, pref?: () => string) {
  // OBS / tarayıcı kaynağı: yerel web sunucusundan okunur
  if (!inTauri) {
    const get = () =>
      fetch("/api/music", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => s && typeof s === "object" && "active" in s && setState(s as MusicState))
        .catch(() => {});
    void get();
    const iv = window.setInterval(() => void get(), 1500);
    onCleanup(() => clearInterval(iv));
    return state;
  }
  if (users++ === 0) {
    void listen<MusicState>("music", (e) => e.payload && setState(e.payload)).then((u) => (users > 0 ? (stop = u) : u()));
  }
  void pull(watch(), pref ? pref() : null);
  const iv = window.setInterval(() => void pull(watch(), pref ? pref() : null), 5000);
  onCleanup(() => {
    clearInterval(iv);
    if (--users === 0) {
      stop?.();
      stop = undefined;
    }
  });
  return state;
}

export const musicControl = (action: MusicAction) => (inTauri ? invoke<boolean>("music_control", { action }).catch(() => false) : Promise.resolve(false));

/** Şu anki konum (ms): çalıyorsa son bildirilen konum + geçen süre */
export function musicPos(s: MusicState, now: number) {
  let p = s.posMs + (s.playing && s.at ? Math.max(0, now - s.at) : 0);
  if (s.durMs > 0) p = Math.min(p, s.durMs);
  return p;
}

export const fmtTime = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};
