// Ses odaları listesi ve kategoriler (sol menüdeki oda listesi ve Odalar sayfası ortak kullanır).
//   - Yöneticinin kategorileri (voice_categories): her biri bir başlık, altında o kategorideki odalar
//   - Topluluk odaları: yöneticilerin kategorisiz kalıcı odaları
//   - Özel odalar: PRO üyelerin kurduğu, boş kalınca 1 saat sonra silinen odalar

import { createSignal } from "solid-js";
import { session } from "@/cloud/supabase";
import { voiceCategories, voiceRooms, type VoiceCategory, type VoiceRoomRow } from "@/cloud/voiceRooms";

const [rooms, setRooms] = createSignal<VoiceRoomRow[]>([]);
const [categories, setCategories] = createSignal<VoiceCategory[]>([]);
const [roomsErr, setRoomsErr] = createSignal("");
export { rooms, categories, roomsErr };

export interface RoomSection {
  /** kategori kimliği; "_community" | "_private" */
  id: string;
  title: string;
  /** çevrilecek sabit başlık mı */
  fixed: boolean;
  rooms: VoiceRoomRow[];
}

/** Menü / sayfa bölümleri: kategoriler sırayla, sonra kategorisiz topluluk odaları, en altta özel odalar */
export function roomSections(): RoomSection[] {
  const all = rooms();
  const cats = categories();
  const ids = new Set(cats.map((c) => c.id));
  const out: RoomSection[] = cats.map((c) => ({ id: c.id, title: c.name, fixed: false, rooms: all.filter((r) => !r.auto_delete && r.category_id === c.id) }));
  out.push({
    id: "_community",
    title: "Topluluk odaları",
    fixed: true,
    rooms: all.filter((r) => !r.auto_delete && !(r.category_id && ids.has(r.category_id))),
  });
  out.push({ id: "_private", title: "Özel odalar", fixed: true, rooms: all.filter((r) => !!r.auto_delete) });
  return out;
}

let busy = false;
export async function refreshRooms() {
  if (busy || !session()) return;
  busy = true;
  try {
    const [r, c] = await Promise.all([voiceRooms(), voiceCategories().catch(() => categories())]);
    setRooms(r);
    setCategories(c);
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
