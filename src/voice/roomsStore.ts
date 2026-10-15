// Ses odaları listesi (sol menüdeki oda listesi ve Odalar sayfası ortak kullanır).
// Topluluk odaları: yöneticilerin kurduğu kalıcı odalar. Özel odalar: PRO üyelerin kurduğu, boş kalınca 1 saat sonra silinen odalar.

import { createSignal } from "solid-js";
import { session } from "@/cloud/supabase";
import { voiceRooms, type VoiceRoomRow } from "@/cloud/voiceRooms";

const [rooms, setRooms] = createSignal<VoiceRoomRow[]>([]);
const [roomsErr, setRoomsErr] = createSignal("");
export { rooms, roomsErr };

export const communityRooms = () => rooms().filter((r) => !r.auto_delete);
export const privateRooms = () => rooms().filter((r) => !!r.auto_delete);

let busy = false;
export async function refreshRooms() {
  if (busy || !session()) return;
  busy = true;
  try {
    setRooms(await voiceRooms());
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
