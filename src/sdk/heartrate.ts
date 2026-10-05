// Nabız verisi: Rust tarafındaki alıcıdan (src-tauri/src/heartrate.rs) gelir. Belirteç / anahtar ve ölçümler yalnızca
// bu bilgisayarda kalır.
import { createSignal, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "./platform";

export type HeartSource = "pulsoid" | "hyperate" | "local";
export interface HeartState {
  configured: boolean;
  source: string;
  connected: boolean;
  bpm: number | null;
  /** Son ölçüm anı (epoch ms) */
  ts: number;
  /** [epoch ms, bpm], eskiden yeniye */
  hist: [number, number][];
  error: string;
  /** Yerel kaynak: gönderim adresinin anahtarı */
  localKey: string;
}
/** Bu süreden eski ölçüm "yok" sayılır (saat çıkarıldı / bağlantı koptu) */
export const HR_STALE_MS = 20_000;

const EMPTY: HeartState = { configured: false, source: "", connected: false, bpm: null, ts: 0, hist: [], error: "", localKey: "" };
const [state, setState] = createSignal<HeartState>(EMPTY);
let users = 0;
let stop: (() => void) | undefined;

const pull = (watch: boolean) =>
  invoke<HeartState>("heartrate_state", { watch })
    .then((s) => s && setState(s))
    .catch(() => {});

/** Son durum. `watch` doğruyken bağlantı açık tutulur (30 sn'de bir "bakıyorum" denir). */
export function useHeartRate(watch: () => boolean = () => true) {
  // OBS / tarayıcı kaynağı: yerel web sunucusundan okunur (yalnızca bu bilgisayardan erişilir)
  if (!inTauri) {
    const get = () =>
      fetch("/api/heartrate", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => s && typeof s === "object" && "configured" in s && setState(s as HeartState))
        .catch(() => {});
    void get();
    const iv = window.setInterval(() => void get(), 2000);
    onCleanup(() => clearInterval(iv));
    return state;
  }
  if (users++ === 0) {
    void listen<HeartState>("heartrate", (e) => e.payload && setState(e.payload)).then((u) => (users > 0 ? (stop = u) : u()));
  }
  void pull(watch());
  const iv = window.setInterval(() => void pull(watch()), 30_000);
  onCleanup(() => {
    clearInterval(iv);
    if (--users === 0) {
      stop?.();
      stop = undefined;
    }
  });
  return state;
}

export const heartConnect = (cfg: { source: HeartSource; token?: string; id?: string }) => invoke<HeartState>("heartrate_connect", { cfg }).then((s) => (setState(s), s));
export const heartDisconnect = () => invoke("heartrate_disconnect").then(() => setState(EMPTY));
export const heartAlert = (volume: number) => (inTauri ? invoke<boolean>("heartrate_alert", { volume }).catch(() => false) : Promise.resolve(false));
