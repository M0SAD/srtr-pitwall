// "Mesajlar" overlay'i için ortak tanımlar: gelen arkadaş/takım mesajları uygulama genelinde bir olayla
// (overlay-message) tüm overlay pencerelerine yayınlanır. Overlay açıkken o mesaj için oyun içi
// bildirim (alt köşedeki kutu) ayrıca gösterilmez.

import { emit } from "@tauri-apps/api/event";
import { inTauri } from "./platform";
import { settings, updateSettings } from "./settings";

export const OVMSG_EVENT = "overlay-message";
export const OVMSG_TYPE = "messages";
/** Çıkış yapıldı / hesap değişti: Mesajlar overlay'i ekrandaki mesajları temizler */
export const OVMSG_CLEAR_EVENT = "overlay-message-clear";

export interface OvMsg {
  id: string;
  /** friend: arkadaş mesajı, team: takım ya da grup sohbeti (grup: id "g-" ile başlar), crew: ekip odası (c64) */
  kind: "friend" | "team" | "crew";
  /** Yazanın hesap kimliği */
  from: string;
  /** Sohbet: arkadaş mesajında karşıdaki arkadaş, takım mesajında takım kimliği */
  peer: string;
  name: string;
  color: string;
  photo?: string;
  /** Takım mesajında "[TAG]" */
  team?: string;
  body: string;
  /** Benim yazdığım mesaj */
  mine: boolean;
  ts: number;
}

export function broadcastOvMsg(m: OvMsg) {
  if (!inTauri) return;
  void emit(OVMSG_EVENT, m).catch(() => {});
}

/** Arkadaşlar bölümünde kurulan grup sohbetinin mesajı (host/social.ts: id "g-<mesaj>", peer = grup kimliği) */
export const ovMsgIsGroup = (m: OvMsg) => m.kind === "team" && m.id.startsWith("g-");

/**
 * Kopyanın "Yalnızca şu kişiler" listesi (boş: herkes). Eski kayıt (`source` alanı duruyorsa, bkz. settings.ts
 * msgSrcMigrate) yalnızca "Seçili kişiler" kaynağında listeyi kullanırdı.
 */
export function ovMsgPeople(o: Record<string, any>): string[] {
  if (o.source !== undefined && o.source !== "selected") return [];
  return Array.isArray(o.people) ? o.people.filter((x: unknown): x is string => typeof x === "string" && !!x) : [];
}
/** Kopya arkadaş mesajlarını gösteriyor mu */
export function ovMsgFriendsOn(o: Record<string, any>): boolean {
  if (o.source !== undefined && (o.source === "team" || o.source === "none")) return false;
  return o.friends !== false;
}

/** Overlay ayarlarına göre bu mesaj gösterilir mi (her kopya kendi ayarıyla bağımsız süzer) */
export function ovMsgAccepts(o: Record<string, any>, m: OvMsg): boolean {
  if (m.mine && !o.mine) return false;
  if (m.kind === "crew") {
    if (o.crew === false) return false;
    const p = ovMsgPeople(o);
    return m.mine || !p.length || p.includes(m.from);
  }
  if (ovMsgIsGroup(m)) {
    const g = o.groups ?? "all";
    if (g === "none") return false;
    if (g === "selected") return Array.isArray(o.groupList) && o.groupList.includes(m.peer);
    return true;
  }
  if (m.kind === "team") return o.source === "team" || o.includeTeams !== false;
  if (!ovMsgFriendsOn(o)) return false;
  const p = ovMsgPeople(o);
  return !p.length || p.includes(m.peer);
}

/**
 * Bu mesaj sesli okunsun mu: ekip odası mesajı "Ekip mesajlarını sesli oku", diğerleri (arkadaş; gösteriliyorsa
 * takım / grup) "Arkadaş mesajlarını sesli oku" ayarına bakar. Kendi mesajım okunmaz.
 */
export function ovMsgSpeaks(o: Record<string, any>, m: OvMsg): boolean {
  if (m.mine) return false;
  return m.kind === "crew" ? !!o.crewTts : !!o.tts;
}

// Bu pencerede ekranda olan Mesajlar overlay'lerinin süzgeçleri (oyun içi bildirimle çift gösterilmesin)
const filters = new Set<(m: OvMsg) => boolean>();
export function registerOvMsgFilter(fn: (m: OvMsg) => boolean) {
  filters.add(fn);
  return () => filters.delete(fn);
}
export function ovMsgShown(m: OvMsg) {
  for (const f of filters) if (f(m)) return true;
  return false;
}

function firstInstance() {
  const s = settings();
  const prof = s.profiles[s.activeProfile] ?? Object.values(s.profiles)[0];
  return prof ? Object.values(prof.overlays).find((i) => i.type === OVMSG_TYPE) : undefined;
}

/** Arkadaşın mesajları Mesajlar overlay'inde gösteriliyor mu (etkin düzendeki ilk kopyaya göre) */
export function ovMsgShowsPerson(friendId: string): boolean {
  const o = firstInstance()?.options ?? {};
  if (!ovMsgFriendsOn(o)) return false;
  const p = ovMsgPeople(o);
  return !p.length || p.includes(friendId);
}

/**
 * Arkadaşı tüm düzenlerdeki Mesajlar overlay'lerinde gösterir / gizler: "Yalnızca şu kişiler" listesini düzenler
 * (liste boşken, yani herkes gösterilirken gizlenirse diğer arkadaşlar listeye eklenir; listede kimse kalmazsa
 * arkadaş mesajları kapatılır, çünkü boş liste "herkes" demektir).
 */
export function ovMsgTogglePerson(friendId: string, allFriends: string[]) {
  const show = !ovMsgShowsPerson(friendId);
  updateSettings((d) => {
    for (const p of Object.values(d.profiles)) {
      for (const i of Object.values(p.overlays)) {
        if (i.type !== OVMSG_TYPE) continue;
        const on = ovMsgFriendsOn(i.options);
        let cur = on ? ovMsgPeople(i.options) : [];
        delete i.options.source;
        if (show) {
          // Arkadaş mesajları kapalıydı: yalnızca bu kişi; liste boş (herkes) ise zaten gösteriliyor
          if (!on || cur.length) cur = cur.includes(friendId) ? cur : [...cur, friendId];
          i.options.friends = true;
          i.options.people = cur;
        } else if (on) {
          if (!cur.length) cur = allFriends.slice();
          cur = cur.filter((x) => x !== friendId);
          i.options.people = cur;
          i.options.friends = cur.length > 0;
        }
      }
    }
  });
}
