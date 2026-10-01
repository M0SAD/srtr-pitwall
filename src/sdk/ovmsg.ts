// "Mesajlar" overlay'i için ortak tanımlar: gelen arkadaş/takım mesajları uygulama genelinde bir olayla
// (overlay-message) tüm overlay pencerelerine yayınlanır. Overlay açıkken o mesaj için oyun içi
// bildirim (alt köşedeki kutu) ayrıca gösterilmez.

import { emit } from "@tauri-apps/api/event";
import { inTauri } from "./platform";
import { settings, updateSettings } from "./settings";

export const OVMSG_EVENT = "overlay-message";
export const OVMSG_TYPE = "messages";

export interface OvMsg {
  id: string;
  kind: "friend" | "team";
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

/** Overlay ayarlarına göre bu mesaj gösterilir mi */
export function ovMsgAccepts(o: Record<string, any>, m: OvMsg): boolean {
  if (m.mine && !o.mine) return false;
  const src = o.source ?? "all";
  if (m.kind === "team") return src === "team" || !!o.includeTeams;
  if (src === "team") return false;
  if (src === "selected") return Array.isArray(o.people) && o.people.includes(m.peer);
  return true;
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
  const src = o.source ?? "all";
  if (src === "all") return true;
  if (src === "team") return false;
  return Array.isArray(o.people) && o.people.includes(friendId);
}

/**
 * Arkadaşı tüm düzenlerdeki Mesajlar overlay'lerinde gösterir / gizler: "Seçili kişiler" listesini düzenler
 * (kaynak "Tüm arkadaşlar" iken gizlenirse diğer arkadaşlar listeye eklenip kaynak "Seçili kişiler" olur).
 */
export function ovMsgTogglePerson(friendId: string, allFriends: string[]) {
  const show = !ovMsgShowsPerson(friendId);
  updateSettings((d) => {
    for (const p of Object.values(d.profiles)) {
      for (const i of Object.values(p.overlays)) {
        if (i.type !== OVMSG_TYPE) continue;
        const src = i.options.source ?? "all";
        let cur: string[] = Array.isArray(i.options.people) ? i.options.people.filter((x: unknown) => typeof x === "string") : [];
        if (src === "all") cur = allFriends.slice();
        cur = show ? (cur.includes(friendId) ? cur : [...cur, friendId]) : cur.filter((x) => x !== friendId);
        i.options.people = cur;
        if (src !== "selected") {
          // Takım mesajları kaynağıyken arkadaş eklenince takım mesajları da gösterilmeye devam etsin
          if (src === "team") i.options.includeTeams = true;
          i.options.source = "selected";
        }
      }
    }
  });
}
