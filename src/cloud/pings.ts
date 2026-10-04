// "Bir şey değişti" haberleri (Realtime BROADCAST, veritabanına yazılmaz, istek sayılmaz):
//   st:<üye>            → üyenin durumu değişti (çevrimiçi / yarışta / uzakta ...): arkadaşları listeyi tazeler
//   rx:<tür>:<sohbet>   → sohbette bir mesaja ifade bırakıldı / kaldırıldı: açık sohbet ifadeleri tazeler
// Yükte veri yoktur; haberi alan gerçek veriyi her zamanki yetkili çağrıyla okur.
import { createEffect, onCleanup } from "solid-js";
import { pingLink, type PingLink } from "./social";

export const statusChannel = (uid: string) => `st:${uid}`;
export const reactChannel = (kind: string, room: string) => `rx:${kind}:${room}`;
/** İzleyen "panele girdim" der: sürücü izleyen var mı diye hemen sorar (beklemeden yayına başlar) */
export const crewKnock = (owner: string) => `cw:${owner}`;
/** Arkadaşın canlı verisine bakan "bakıyorum" der: sürücü yalnızca bakan varken veri gönderir */
export const liveWatch = (owner: string) => `lv:${owner}`;
/** Pit duvarı canlı yayını */
export const wallChannel = (owner: string, key: string) => `wall:${owner}:${key}`;
/** Kısa ömürlü tek haber (kanala katıl, gönder, kapat) */
export function knock(name: string) {
  const l = pingLink(name);
  l.ping();
  setTimeout(() => l.close(), 5000);
}

/** Birebir sohbetin oda anahtarı (iki kimlik sıralı) */
export const dmRoom = (a: string, b: string) => [a, b].sort().join(":");

/** Verilen kanalları dinler (liste değişince eksikleri açar, fazlaları kapatır); haberler `wait` ms içinde birleştirilir */
export function usePings(names: () => string[], cb: () => void, wait = 1200) {
  const links = new Map<string, PingLink>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hit = () => {
    clearTimeout(timer);
    timer = setTimeout(cb, wait);
  };
  createEffect(() => {
    const want = new Set(names().filter(Boolean).slice(0, 80));
    for (const [n, l] of links) {
      if (!want.has(n)) {
        l.close();
        links.delete(n);
      }
    }
    for (const n of want) if (!links.has(n)) links.set(n, pingLink(n, hit));
  });
  onCleanup(() => {
    clearTimeout(timer);
    for (const l of links.values()) l.close();
    links.clear();
  });
}
