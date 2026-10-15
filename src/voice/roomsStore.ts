// Ses odaları listesi ve kategoriler (sol menüdeki oda listesi ve Odalar sayfası ortak kullanır).
//   - Yöneticinin kategorileri (voice_categories): her biri bir başlık, altında o kategorideki odalar
//   - Topluluk odaları: yöneticilerin kategorisiz kalıcı odaları
//   - Özel odalar: PRO üyelerin kurduğu, boş kalınca 1 saat sonra silinen odalar

import { createSignal } from "solid-js";
import { session } from "@/cloud/supabase";
import { config } from "@/cloud/account";
import { voiceCategories, voiceRooms, voiceRoomsPeople, type VoiceCategory, type VoicePerson, type VoiceRoomRow } from "@/cloud/voiceRooms";
import { noteAvatars } from "@/cloud/profile";

const [rooms, setRooms] = createSignal<VoiceRoomRow[]>([]);
const [categories, setCategories] = createSignal<VoiceCategory[]>([]);
const [roomsErr, setRoomsErr] = createSignal("");
const [people, setPeople] = createSignal<VoicePerson[]>([]);
export { rooms, categories, roomsErr };

/** Odadaki kişiler (sol menüde odanın altında; c121, sunucu eskiyse boş) */
export const peopleIn = (room: string) => people().filter((p) => p.room_id === room);

export interface RoomSection {
  /** kategori kimliği; "_community" | "_private" */
  id: string;
  title: string;
  /** çevrilecek sabit başlık mı */
  fixed: boolean;
  rooms: VoiceRoomRow[];
}

/** Menü / sayfa bölümleri: yöneticinin belirlediği sırayla (app_config.voice_order); sırada olmayanlar sona
 *  (kategoriler kendi sıralarıyla, sonra Topluluk odaları, en sonda Özel odalar) */
export function roomSections(): RoomSection[] {
  const all = rooms();
  const cats = categories();
  const ids = new Set(cats.map((c) => c.id));
  const list: RoomSection[] = cats.map((c) => ({ id: c.id, title: c.name, fixed: false, rooms: all.filter((r) => !r.auto_delete && r.category_id === c.id) }));
  list.push({
    id: "_community",
    title: "Topluluk odaları",
    fixed: true,
    rooms: all.filter((r) => !r.auto_delete && !(r.category_id && ids.has(r.category_id))),
  });
  list.push({ id: "_private", title: "Özel odalar", fixed: true, rooms: all.filter((r) => !!r.auto_delete) });
  const order = config()?.voice_order ?? [];
  const pos = (id: string) => {
    const i = order.indexOf(id);
    return i < 0 ? 1000 + list.findIndex((x) => x.id === id) : i;
  };
  return list.sort((a, b) => pos(a.id) - pos(b.id));
}

let busy = false;
export async function refreshRooms() {
  if (busy || !session()) return;
  busy = true;
  try {
    const [r, c, p] = await Promise.all([voiceRooms(), voiceCategories().catch(() => categories()), voiceRoomsPeople().catch(() => [] as VoicePerson[])]);
    setRooms(r);
    setCategories(c);
    setPeople(p);
    if (p.length) noteAvatars(p.map((x) => ({ id: x.user_id, avatar_path: x.avatar_path })));
    setRoomsErr("");
  } catch (e) {
    setRoomsErr(String((e as Error)?.message ?? e));
  } finally {
    busy = false;
  }
}

// Görünür bir liste varken 15 sn'de bir yenilenir (birden çok yerde açık olabilir)
let users = 0;
let timer = 0;
export function watchRooms(): () => void {
  users++;
  if (users === 1) {
    void refreshRooms();
    timer = window.setInterval(() => void refreshRooms(), 15_000);
  }
  return () => {
    users = Math.max(0, users - 1);
    if (!users && timer) {
      clearInterval(timer);
      timer = 0;
    }
  };
}

/** Ses odalarındaki toplam kişi (sol menüdeki simgenin rozeti) */
export const roomsTotal = () => rooms().reduce((n, r) => n + (r.members || 0), 0);

// Liste açık değilken de rozet güncel kalsın: oturum açıkken 45 sn'de bir (gizli pencerede yenilenmez),
// pencereye dönünce hemen yenilenir. Liste açıkken watchRooms zaten 15 sn'de bir yeniler.
let bg = 0;
export function watchRoomsBackground(): () => void {
  if (bg) return () => {};
  const tick = () => {
    if (!users && !document.hidden) void refreshRooms();
  };
  tick();
  bg = window.setInterval(tick, 45_000);
  const onVis = () => !document.hidden && tick();
  document.addEventListener("visibilitychange", onVis);
  return () => {
    clearInterval(bg);
    bg = 0;
    document.removeEventListener("visibilitychange", onVis);
  };
}

/** "Oda kur" formu açık mı (sol menüdeki + ile de açılır); cat: önceden seçilecek kategori */
export const [createOpen, setCreateOpen] = createSignal<{ cat: string } | null>(null);
