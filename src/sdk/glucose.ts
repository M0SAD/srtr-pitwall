// Kan şekeri (CGM) verisi: Rust tarafındaki okuyucudan (src-tauri/src/glucose.rs) gelir.
// Giriş bilgileri ve ölçümler yalnızca bu bilgisayarda kalır; ayarlara, buluta ve OBS sayfasına gitmez.
import { createSignal, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "./platform";

export type GlucoseSource = "libre" | "dexcom" | "nightscout";
export interface GlucoseState {
  loggedIn: boolean;
  source: string;
  /** Maskelenmiş hesap adı */
  account: string;
  /** mg/dL */
  value: number | null;
  arrow: string;
  /** Ölçüm anı (epoch ms) */
  ts: number;
  /** [epoch ms, mg/dL], eskiden yeniye */
  hist: [number, number][];
  error: string;
  /** Hatanın teknik özeti (aşama · HTTP kodu · yol) */
  detail?: string;
  checkedAt: number;
}
export interface GlucoseLogin {
  source: GlucoseSource;
  user?: string;
  password?: string;
  region?: string;
  ns_url?: string;
  ns_token?: string;
}

export const MGDL_PER_MMOL = 18.0182;
/** Bu süreden eski ölçüm "eski" sayılır: gri görünür, uyarı vermez */
export const STALE_MS = 15 * 60_000;

const EMPTY: GlucoseState = { loggedIn: false, source: "", account: "", value: null, arrow: "", ts: 0, hist: [], error: "", checkedAt: 0 };
const [state, setState] = createSignal<GlucoseState>(EMPTY);
let users = 0;
let stop: (() => void) | undefined;
let timer: number | undefined;

const pull = (watch: boolean) =>
  invoke<GlucoseState>("glucose_state", { watch })
    .then((s) => s && setState(s))
    .catch(() => {});

/**
 * Son durum. `watch` doğruyken (ekrandaki overlay) okuyucu çalışır: 30 sn'de bir "bakıyorum" denir.
 * Ayar panelindeki giriş kutusu `watch` olmadan yalnızca durumu izler.
 */
export function useGlucose(watch: () => boolean = () => true) {
  if (!inTauri) return state;
  if (users++ === 0) {
    void listen<GlucoseState>("glucose", (e) => e.payload && setState(e.payload)).then((u) => (users > 0 ? (stop = u) : u()));
  }
  void pull(watch());
  const iv = window.setInterval(() => void pull(watch()), 30_000);
  onCleanup(() => {
    clearInterval(iv);
    if (--users === 0) {
      stop?.();
      stop = undefined;
      clearTimeout(timer);
    }
  });
  return state;
}

export const glucoseLogin = (cfg: GlucoseLogin) => invoke<GlucoseState>("glucose_login", { cfg }).then((s) => (setState(s), s));
export const glucoseLogout = () => invoke("glucose_logout").then(() => setState(EMPTY));
export const glucoseRefresh = () => invoke("glucose_refresh").catch(() => {});
export const glucoseAlert = (level: "ul" | "l" | "h" | "uh" | "ok", volume: number) => invoke<boolean>("glucose_alert", { level, volume }).catch(() => false);
