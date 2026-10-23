// Korna: atanan tuşa / direksiyon düğmesine basınca (Rust: voicecmd.rs "horn-press") aynı iRacing sunucusunda uygulamayı
// kullanan herkes kornayı duyar. Çalmak PRO (F.horn), duymak herkese açık (Ayarlar › Korna'dan kapatılabilir).
//
// Sinyal Realtime BROADCAST ile gider (veritabanına yazılmaz): sunucudaki herkes "horn:<SubSessionID>" kanalını dinler.
// Yükte gönderenin araç numarası ve iRacing adı vardır; Rust (horn.rs horn_play) o araçtaki sürücünün adıyla
// karşılaştırır (aynı sunucuda olmayan biri korna çaldıramaz) ve "yakındakiler" kipinde sesi mesafeye göre kısar.
// Korna sesi yükteki anahtarla kornalar listesinden bulunur (yükteki adrese güvenilmez).
//
// Ana overlay penceresinde bir kez çalışır (Host.tsx).
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import type { Accessor } from "solid-js";
import { session } from "@/cloud/supabase";
import { isAdmin } from "@/cloud/account";
import { castLink, type CastLink } from "@/cloud/social";
import { hornList, type Horn } from "@/cloud/horns";
import { settings } from "@/sdk/settings";
import { F, proLocked } from "@/sdk/proFeatures";
import type { Status } from "@/sdk/types";

/** Relative / Radar: korna çalan aracın yanında kısa simge ({ idx }) */
export const HORN_HONK = "horn-honk";
const EVENT = "honk";
/** Gönderen en sık bu aralıkla çalabilir; alıcı da aynı kişiden bundan sık gelenleri yok sayar */
const SEND_GAP = 2500;
const RECV_GAP = 2000;

interface Ctx {
  active: boolean;
  sub: number;
  meIdx: number;
  meName: string;
}
interface Honk {
  uid: string;
  idx: number;
  name: string;
  key: string;
  ts: number;
}

let started = false;

/** Son korna çalanlar (Ayarlar › Korna'da susturmak için; pencereler arası localStorage) */
export const HORN_RECENT_KEY = "pitwall.hornRecent";
export interface HornRecent {
  uid: string;
  name: string;
  ts: number;
}
export function hornRecent(): HornRecent[] {
  try {
    const v = JSON.parse(localStorage.getItem(HORN_RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.uid === "string") : [];
  } catch {
    return [];
  }
}
function rememberHonker(uid: string, name: string) {
  try {
    const list = [{ uid, name, ts: Date.now() }, ...hornRecent().filter((x) => x.uid !== uid)].slice(0, 30);
    localStorage.setItem(HORN_RECENT_KEY, JSON.stringify(list));
  } catch {
    /* yer yok */
  }
}

export function startHorn(status: Accessor<Status | undefined>) {
  if (started) return;
  started = true;

  // Korna listesi (en çok 2 dk eski; bilinmeyen anahtar gelirse yenilenir)
  let horns: Horn[] = [];
  let hornsAt = 0;
  const loadHorns = async (force = false) => {
    if (force || !horns.length || Date.now() - hornsAt > 120_000) {
      try {
        horns = await hornList();
        hornsAt = Date.now();
      } catch {
        /* son liste kalır */
      }
    }
    return horns;
  };
  const findHorn = async (key: string) => (await loadHorns()).find((h) => h.key === key) ?? (await loadHorns(true)).find((h) => h.key === key);
  const gen = () => settings().general;
  const vol = () => Math.max(0, gen().hornVolume ?? 80) / 100;

  let ctx: Ctx = { active: false, sub: 0, meIdx: -1, meName: "" };
  let link: CastLink | null = null;
  let linkFor = "";

  // ---- Al ----
  const lastFrom = new Map<string, number>();
  const onHonk = async (p: Partial<Honk> | undefined) => {
    const g = gen();
    if (!p || g.hornHear === "off") return;
    const uid = String(p.uid ?? "");
    const me = session()?.user.id ?? "";
    if (!uid || uid === me || (g.hornMuted ?? []).includes(uid)) return;
    if (typeof p.ts !== "number" || Math.abs(Date.now() - p.ts) > 10_000) return;
    const prev = lastFrom.get(uid) ?? 0;
    if (Date.now() - prev < RECV_GAP) return;
    lastFrom.set(uid, Date.now());
    const h = await findHorn(String(p.key ?? ""));
    if (!h) return;
    const idx = Number(p.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx > 63) return;
    const played = await invoke<boolean>("horn_play", {
      key: h.key,
      url: h.url ?? null,
      fromIdx: idx,
      fromName: String(p.name ?? ""),
      volume: vol(),
      nearM: g.hornHear === "near" ? g.hornNear : null,
    }).catch(() => false);
    if (played) {
      void emit(HORN_HONK, { idx });
      rememberHonker(uid, String(p.name ?? ""));
    }
  };

  const ensureLink = async () => {
    const st = status();
    try {
      ctx = st?.demo ? { active: false, sub: 0, meIdx: -1, meName: "" } : await invoke<Ctx>("horn_context");
    } catch {
      ctx = { active: false, sub: 0, meIdx: -1, meName: "" };
    }
    // Duyma kapalı ve PRO değilse kanala hiç katılmaya gerek yok
    const want = ctx.active && ctx.sub > 0 && !!session() && (gen().hornHear !== "off" || !proLocked(F.horn)) ? `horn:${ctx.sub}` : "";
    if (want === linkFor) return;
    link?.close();
    link = null;
    linkFor = want;
    if (want) link = castLink(want, EVENT, (p) => void onHonk(p));
  };
  void ensureLink();
  setInterval(() => void ensureLink(), 3000);

  // ---- Gönder ----
  let lastSend = 0;
  void listen("horn-press", async () => {
    const g = gen();
    const h = await findHorn(g.hornSound || "b:short");
    // Demo / oyun dışı: yalnızca kendin duy (denemek için)
    const playLocal = () => h && void invoke("horn_play", { key: h.key, url: h.url ?? null, fromIdx: -1, fromName: null, volume: vol(), nearM: null }).catch(() => {});
    if (proLocked(F.horn)) {
      void invoke("osd_push", { key: "hornPro" }).catch(() => {});
      return;
    }
    if (!h || (h.access === "admin" && !isAdmin())) {
      void invoke("osd_push", { key: "hornNone" }).catch(() => {});
      return;
    }
    if (Date.now() - lastSend < SEND_GAP) return;
    lastSend = Date.now();
    playLocal();
    const me = session()?.user.id;
    if (!me) {
      void invoke("osd_push", { key: "hornLogin" }).catch(() => {});
      return;
    }
    await ensureLink();
    if (!link || !ctx.active) return;
    link.send({ uid: me, idx: ctx.meIdx, name: ctx.meName, key: h.key, ts: Date.now() } satisfies Honk);
    void emit(HORN_HONK, { idx: ctx.meIdx });
  });
}
