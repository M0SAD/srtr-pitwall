// Deneme PRO: yeni hesaplara ilk girişte (hesap + bilgisayar başına bir kez) sunucudan deneme PRO istenir.
// Karar sunucuda (supabase/c41_guncelleme.sql trial_claim): yeni hesap mı, aynı bilgisayar / tarayıcı / e-posta / IP
// başka hesapta denendi mi. Reddedilirse istemciye neden dönmez ve hiçbir şey gösterilmez.
// Gizlilik: bilgisayar kimliği Rust'taki device_info karmasıdır (ham MachineGuid değil, tuzlu SHA-256);
// tarayıcı parmak izi de (UA, ekran, saat dilimi, dil) SHA-256 karması olarak gönderilir.

import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { api, cloudEnabled, session } from "./supabase";
import { inTauri } from "@/sdk/platform";

export interface TrialResult {
  granted: boolean;
  until?: string;
  days?: number;
}

/** Kabul edilen deneme (karşılama penceresi bunu gösterir) */
const [trialWelcome, setTrialWelcome] = createSignal<TrialResult | null>(null);
export { trialWelcome, setTrialWelcome };

const FP_KEY = "pitwall.trial.fp";
const DONE_KEY = "pitwall.trial.done";

/** Bu tarayıcıya/programa ait rastgele kimlik (localStorage'da kalıcı) */
function webId(): string | null {
  try {
    let v = localStorage.getItem(FP_KEY);
    if (!v) {
      v = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(FP_KEY, v);
    }
    return v;
  } catch {
    return null;
  }
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hafif tarayıcı parmak izi karması: UA, ekran, renk derinliği, saat dilimi, dil, çekirdek sayısı */
export async function browserFp(): Promise<string | null> {
  try {
    const parts = [
      navigator.userAgent,
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.language,
      String(navigator.hardwareConcurrency ?? ""),
    ];
    return await sha256(parts.join("|"));
  } catch {
    return null;
  }
}

function doneList(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) || "[]");
  } catch {
    return [];
  }
}

let running = false;
/** Girişten sonra bir kez çağrılır; hesap + bu bilgisayar için daha önce sorulduysa hiçbir şey yapmaz. */
export async function maybeClaimTrial(onGranted?: () => void) {
  const s = session();
  if (!cloudEnabled || !s || running) return;
  let device: string | null = null;
  if (inTauri) {
    try {
      device = (await invoke<{ hash: string }>("device_info")).hash;
    } catch {
      device = null;
    }
  }
  const key = `${s.user.id}:${device ?? "web"}`;
  const done = doneList();
  if (done.includes(key)) return;
  running = true;
  try {
    const r = await api<TrialResult>("POST", "rpc/trial_claim", {
      body: { p_device: device, p_web_fp: webId(), p_fp: await browserFp() },
    });
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify([...done, key].slice(-50)));
    } catch {
      /* depolama yok */
    }
    if (r?.granted) {
      setTrialWelcome(r);
      onGranted?.();
    }
  } catch {
    /* ağ hatası / eski sunucu: bir sonraki açılışta yeniden denenir */
  } finally {
    running = false;
  }
}

// ---------------------------------------------------------------------------
// Yönetici
// ---------------------------------------------------------------------------

export interface TrialClaimRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  account_created: string | null;
  created_at: string;
  granted: boolean;
  reason: string;
  matched: { id: string; name: string }[];
  device_hash: string | null;
  web_fp: string | null;
  ip: string | null;
  source: string;
  until: string | null;
  pro_until: string | null;
  pro_source: string | null;
  admin_action: string;
  admin_at: string | null;
}

export type TrialFilter = "all" | "granted" | "denied" | "suspicious";
export const adminTrialClaims = (filter: TrialFilter) =>
  api<TrialClaimRow[]>("POST", "rpc/admin_trial_claims", { body: { p_filter: filter } }).then((r) => r ?? []);
export const adminTrialSet = (user: string, grant: boolean) =>
  api<string | null>("POST", "rpc/admin_trial_set", { body: { p_user: user, p_grant: grant } });

/** Ret nedenlerinin Türkçe karşılıkları (sunucudaki kodlar) */
export const TRIAL_REASONS: Record<string, string> = {
  granted: "Verildi",
  admin: "Yönetici verdi",
  had_pro: "Daha önce PRO almış",
  not_new: "Hesap yeni değil",
  disposable_email: "Geçici e-posta",
  same_device: "Aynı bilgisayar",
  same_browser: "Aynı tarayıcı",
  same_email: "Aynı e-posta",
  same_ip: "Aynı IP",
  same_network: "Aynı ağ ve tarayıcı",
};
