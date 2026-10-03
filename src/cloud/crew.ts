// Ekip (uzaktan pit ekibi, sunucu c53): sürücü kabul edilmiş arkadaşlarına ekip rolü verir; ekip üyesi sürücünün
// canlı yarış verisini izler ve izin verildiyse pit ayarlarını (yakıt, lastik, hızlı tamir, vizör filmi) uzaktan
// değiştirir. Bütün yazmalar sunucudaki security definer fonksiyonlardan geçer; ekip üyesi uygulama ayarlarına
// ya da hesap bilgisine erişemez — sadece aşağıdaki komut türleri vardır.

import type { RealtimeChannel } from "@supabase/realtime-js";
import { api, session } from "./supabase";
import { realtime, type LiveData } from "./social";
import { t } from "@/sdk/i18n";
import { createSignal } from "solid-js";

/** Sürücüler › Ekip sayfasında açılacak sürücü (Arkadaşlar listesindeki "Ekip" düğmesi) */
export const [crewFocus, setCrewFocus] = createSignal<string | null>(null);

export type CrewKind = "fuel_set" | "fuel_clear" | "tyres_all" | "tyres" | "tyres_clear" | "fast_repair" | "tearoff" | "clear_all" | "message";
export type CrewStatus = "pending" | "applied" | "rejected" | "expired";

/** Pit servisi bitleri (iRacing PitSvFlags) */
export const PIT = { lf: 1, rf: 2, lr: 4, rr: 8, fuel: 0x10, tearoff: 0x20, fastRepair: 0x40, tyres: 0x0f } as const;

/** Canlı veriye eklenen ekip alanı (Rust: engine.rs "crew-live-local" + host/crew.ts) */
export interface CrewLive {
  /** Sim kimliği ("" = iRacing) */
  sim: string;
  /** Oturumda kalan süre (sn, -1: bilinmiyor) ve tur (32767: sınırsız) */
  timeRemain: number;
  lapsRemain: number;
  classPos: number;
  /** Yarışın bitmesine kalan tur (tahmin) */
  raceLaps: number;
  /** Bitişe kadar eklenmesi gereken yakıt (L, emniyet payı hariç) */
  toFinish: number;
  /** Bitişe kadar gereken toplam yakıt (L) */
  needed: number;
  inc: number;
  /** Oturum bayrakları (iRacing SessionFlags) */
  flags: number;
  /** Pit kutusunda */
  stall: boolean;
  /** Şu an ayarlı pit servisi (flags -1: sim vermiyor) */
  pit: { flags: number; fuel: number; compound: number; fr: number };
  /** Lastikler LF, RF, LR, RR: kalan diş % (-1 bilinmiyor) ve sıcaklık °C */
  wear: number[];
  temp: number[];
  compound: number;
  /** Sürücünün uygulaması şu an uzaktan pit komutlarını uygulayabiliyor (ana anahtar açık + iRacing) */
  ctl?: boolean;
}

export interface CrewMember {
  member_id: string;
  display_name: string;
  avatar_path: string | null;
  can_view: boolean;
  can_control: boolean;
  /** Paneli şu an açık (son 45 sn) */
  watching: boolean;
  seen_at: string | null;
}

export interface CrewState {
  /** Ana anahtar: ekibim pit ayarlarımı değiştirebilsin */
  control_on: boolean;
  /** Anahtara hiç dokunulmadı: değer varsayılandır (PRO üyede açık, c58) */
  control_default?: boolean;
  /** Özellik PRO'ya özel ve ben PRO değilim */
  needs_pro: boolean;
  count: number;
  max: number;
  /** Ekibim canlı pitwall'ımı izleyebilsin (c58; varsayılan açık) */
  wall_on?: boolean;
}

/** Ekip Pitwall'ı satırı: sürücünün çevresindeki bir araç (kısa adlar: saniyede bir gönderilir) */
export interface WallRow {
  /** Araç idx */
  i: number;
  /** Genel / sınıf sırası */
  p: number;
  cp: number;
  /** Numara, isim, sınıf rengi */
  n: string;
  nm: string;
  c: string;
  /** Sürücüye fark (sn): + önde, − arkada; bilinmiyorsa null */
  g: number | null;
  /** Son / en iyi tur (sn) */
  l: number;
  b: number;
  pit?: boolean;
  me?: boolean;
  /** Tur farkı: 1 bir tur önde, −1 bir tur geride */
  lr?: number;
  /** Sınıfın ilk üçünden (pistte yakında olmayabilir) */
  top?: boolean;
}

/** Ekip Pitwall'ı verisi (host/crew.ts üretir, crew_wall_push ile yazılır, crew_wall ile okunur) */
export interface CrewWall {
  /** Gönderim anı (ms) */
  ts: number;
  ses: string;
  rows: WallRow[];
  me: { pos: number; cp: number; cars: number; lap: number; last: number; best: number; cur: number; d: number | null };
  /** Oturum bayrakları (FlagName) */
  flags: string[];
  wx: { air: number; track: number; wet: number; rain: number; wind: number } | null;
  /** Spotter: 0 kapalı, 1 temiz, 2 solda, 3 sağda, 4 iki yanda */
  sp: number;
  /** Öndeki / arkadaki araca mesafe (m) */
  ahead: number | null;
  behind: number | null;
  pit: { road: boolean; stall: boolean; lim: boolean };
  inc: number;
  incMax: number;
  fuel: { lvl: number; laps: number; use: number } | null;
  rem: { t: number; l: number };
  /** Sürücünün konuşma altyazısı (c60): son 60 sn'nin tanınan cümleleri. Sunucu, PRO olmayan izleyiciye göndermez. */
  speech?: CrewSpeech[];
}

/** Sürücünün tanınan bir cümlesi. t: söylendiği an (ms), final: cümle bitti (false: hâlâ konuşuyor) */
export interface CrewSpeech {
  t: number;
  text: string;
  final: boolean;
}

export interface CrewWallState {
  /** Sürücü pitwall'ı açık tutuyor */
  on: boolean;
  age_ms: number | null;
  data: CrewWall | null;
  /** c60: konuşma altyazısı PRO'ya özel ve izleyen PRO değil (sunucu `speech` alanını çıkardı) */
  speech_locked?: boolean;
}

/** Hazır spotter mesajları (ekip üyesi tek dokunuşla gönderir; sürücüde bildirim + sesli okuma) */
export const WALL_MSGS = ["Solunda araç", "Sağında araç", "Temiz", "Arkandan hızlı araç geliyor", "Bu tur pit", "Yakıt tasarrufu yap"] as const;

export interface CrewDriver {
  owner_id: string;
  display_name: string;
  avatar_path: string | null;
  online: boolean;
  racing: boolean;
  sim: string;
  track: string;
  car: string;
  session: string;
  can_view: boolean;
  can_control: boolean;
  /** Değiştirme yetkim var ve sürücü şu an komut kabul ediyor */
  control_on: boolean;
  live: boolean;
  /** Verinin yaşı (sn) — sadece crew_driver() */
  age?: number | null;
  data: LiveData | null;
  updated_at: string | null;
}

export interface CrewCommand {
  id: string;
  sender: string;
  sender_name?: string;
  kind: CrewKind;
  args: Record<string, any>;
  status?: CrewStatus;
  result?: string;
  created_at: string;
  applied_at?: string | null;
  /** crew_commands_pending(): yetki hâlâ geçerli mi */
  allowed?: boolean;
}

// ---- Sürücü tarafı ----
export const crewSet = (friend: string, view: boolean, control: boolean) => api("POST", "rpc/crew_set", { body: { p_friend: friend, p_view: view, p_control: control } });
export const crewControlSet = (on: boolean) => api("POST", "rpc/crew_control_set", { body: { p_on: on } });
export const crewState = () => api<CrewState>("POST", "rpc/crew_state", { body: {} });
export const crewList = () => api<CrewMember[]>("POST", "rpc/crew_list", { body: {} }).then((r) => r ?? []);
export const crewHistory = (limit = 20) => api<CrewCommand[]>("POST", "rpc/crew_history", { body: { p_limit: limit } }).then((r) => r ?? []);
export const crewPending = () => api<CrewCommand[]>("POST", "rpc/crew_commands_pending", { body: {} }).then((r) => r ?? []);
export const crewWallSet = (on: boolean) => api("POST", "rpc/crew_wall_set", { body: { p_on: on } });
/** Pitwall verisini yaz (null: yalnızca izleyen var mı diye sor) */
export const crewWallPush = (data: CrewWall | null) => api<{ watchers: number; wall_on: boolean }>("POST", "rpc/crew_wall_push", { body: { p_data: data } });
export const crewDone = (id: string, status: "applied" | "rejected", result: string) =>
  api("POST", "rpc/crew_command_done", { body: { p_id: id, p_status: status, p_result: result } });

// ---- Ekip üyesi tarafı ----
export const crewDrivers = () => api<CrewDriver[]>("POST", "rpc/crew_drivers", { body: {} }).then((r) => r ?? []);
export const crewDriver = (owner: string) => api<CrewDriver>("POST", "rpc/crew_driver", { body: { p_owner: owner } });
export const crewWall = (owner: string) => api<CrewWallState>("POST", "rpc/crew_wall", { body: { p_owner: owner } });
export const crewCommand = (owner: string, kind: CrewKind, args: Record<string, unknown> = {}) =>
  api<string>("POST", "rpc/crew_command", { body: { p_owner: owner, p_kind: kind, p_args: args } });
export const crewCommandGet = (id: string) => api<CrewCommand | null>("POST", "rpc/crew_command_get", { body: { p_id: id } });

/** Komutu gönder ve sonucunu bekle (en fazla ~35 sn; sunucu 30 sn'de 'expired' yapar) */
export async function crewSend(owner: string, kind: CrewKind, args: Record<string, unknown>, onState?: (c: CrewCommand) => void): Promise<CrewCommand> {
  const id = await crewCommand(owner, kind, args);
  let last: CrewCommand = { id, sender: session()?.user.id ?? "", kind, args: args as Record<string, any>, status: "pending", created_at: new Date().toISOString() };
  onState?.(last);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, i < 10 ? 500 : 1000));
    const c = await crewCommandGet(id).catch(() => null);
    if (c) {
      last = c;
      if (c.status !== "pending") break;
    }
  }
  if (last.status === "pending") last = { ...last, status: "expired" };
  onState?.(last);
  return last;
}

/** Bana (sürücüye) gelen yeni komutlar: Realtime (anında) — yoklama ayrıca host/crew.ts'de */
export async function onCrewCommands(cb: () => void): Promise<() => void> {
  const c = await realtime();
  const uid = session()?.user.id;
  if (!c || !uid) return () => {};
  const ch: RealtimeChannel = c
    .channel(`crew-${uid}-${Math.random().toString(36).slice(2, 7)}`)
    .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "crew_commands", filter: `owner=eq.${uid}` }, () => cb())
    .subscribe();
  return () => {
    c.removeChannel(ch);
  };
}

/** Komutun kısa Türkçe / çevrilmiş açıklaması: "yakıt 45 L", "4 lastik", "hızlı tamir kapalı" ... */
export function crewCommandText(kind: string, args: Record<string, any> | null | undefined): string {
  const a = args ?? {};
  switch (kind) {
    case "fuel_set":
      return t("yakıt {0} L", String(Math.ceil(Number(a.liters) || 0)));
    case "fuel_clear":
      return t("yakıt eklenmeyecek");
    case "tyres_all":
      return t("4 lastik değişecek");
    case "tyres": {
      const sel = [a.lf && t("sol ön"), a.rf && t("sağ ön"), a.lr && t("sol arka"), a.rr && t("sağ arka")].filter(Boolean) as string[];
      return sel.length ? t("lastik: {0}", sel.join(", ")) : t("lastik değişmeyecek");
    }
    case "tyres_clear":
      return t("lastik değişmeyecek");
    case "fast_repair":
      return a.on === false ? t("hızlı tamir kapalı") : t("hızlı tamir açık");
    case "tearoff":
      return a.on === false ? t("vizör filmi kapalı") : t("vizör filmi açık");
    case "clear_all":
      return t("pit servisi temizlendi");
    case "message":
      return String(a.text ?? "");
    default:
      return kind;
  }
}

export function crewStatusText(s: CrewStatus | undefined): string {
  return s === "applied" ? t("Uygulandı") : s === "rejected" ? t("Reddedildi") : s === "expired" ? t("Süresi doldu") : t("Bekliyor");
}

/** Sim uzaktan pit komutunu destekliyor mu (şimdilik sadece iRacing) */
export const crewSimOk = (sim: string | undefined | null) => !sim || sim === "iracing";

// ---- Ekip odası (c64): sürücü + ekip üyeleri arasında sohbet ve "odada kimler var" ----
export interface CrewRoomMember {
  id: string;
  name: string;
  avatar_path: string | null;
  /** Pit ayarlarını (yakıt / lastik) değiştirme yetkisi var */
  can_control: boolean;
  /** Paneli şu an açık (son 45 sn) */
  present: boolean;
  me: boolean;
}
export interface CrewChatMsg {
  id: string;
  sender: string;
  name: string;
  /** driver: sürücü, control: pit yetkili ekip üyesi, view: izleyen ekip üyesi, gone: artık ekipte değil */
  role: "driver" | "control" | "view" | "gone";
  body: string;
  at: string;
}
export interface CrewRoom {
  driver: { id: string; name: string; avatar_path: string | null; online: boolean; racing: boolean } | null;
  /** Sürücü şu an pit komutu kabul ediyor */
  control_on: boolean;
  members: CrewRoomMember[];
  /** Eskiden yeniye */
  messages: CrewChatMsg[];
  now: string;
}
export const CREW_CHAT_MAX = 300;
/** Oda durumu; `after` verilirse yalnızca o andan sonraki mesajlar */
export const crewRoom = (owner: string, after?: string | null, limit = 60) =>
  api<CrewRoom>("POST", "rpc/crew_room", { body: { p_owner: owner, p_after: after ?? null, p_limit: limit } });
export const crewChatSend = (owner: string, body: string) => api<string>("POST", "rpc/crew_chat_send", { body: { p_owner: owner, p_body: body } });

/** Bir sürücünün odasına yazılan yeni mesajlar (Realtime; okuma kuralı sunucuda). Yoklama ayrıca çağıranda. */
export async function onCrewChat(owner: string, cb: () => void): Promise<() => void> {
  const c = await realtime();
  if (!c || !owner) return () => {};
  const ch: RealtimeChannel = c
    .channel(`crewchat-${owner}-${Math.random().toString(36).slice(2, 7)}`)
    .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "crew_chat", filter: `owner=eq.${owner}` }, () => cb())
    .subscribe();
  return () => {
    c.removeChannel(ch);
  };
}
