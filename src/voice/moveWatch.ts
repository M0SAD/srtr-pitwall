// Beni başka ses odasına taşıdılar (c122): odadayken voice_moves kaydımı Realtime ile dinler; kayıt gelince
// sunucudan doğrulayıp hedef odaya geçer. Kayıt yalnızca bana görünür ve yetkili biri tarafından yazılabilir.

import { createEffect, createRoot, createSignal, on, onCleanup } from "solid-js";
import { session } from "@/cloud/supabase";
import { onVoiceMoved, voiceMyMove } from "@/cloud/voiceRooms";
import { joinRoom, voice } from "./engine";

/** Son taşınma bildirimi (oda görünümünde birkaç saniye görünür) */
export const [movedNotice, setMovedNotice] = createSignal<{ room: string; by: string } | null>(null);
let noticeTimer = 0;
let busy = false;

async function check() {
  if (busy) return;
  busy = true;
  try {
    const m = await voiceMyMove();
    if (m && m.to_room !== voice.room()?.id) {
      setMovedNotice({ room: m.room_name, by: m.by_name ?? "" });
      clearTimeout(noticeTimer);
      noticeTimer = window.setTimeout(() => setMovedNotice(null), 8000);
      await joinRoom(m.to_room, null);
    }
  } catch {
    // sunucu eskiyse ya da kayıt yoksa sessizce geç
  } finally {
    busy = false;
  }
}

createRoot(() => {
  createEffect(
    on(
      () => {
        const uid = session()?.user.id ?? "";
        const inRoom = !!voice.room() && (voice.status() === "connected" || voice.status() === "reconnecting");
        return inRoom ? uid : "";
      },
      (uid) => {
        if (!uid) return;
        let off: (() => void) | null = null;
        let dead = false;
        void onVoiceMoved(uid, () => void check()).then((f) => (dead ? f() : (off = f)));
        onCleanup(() => {
          dead = true;
          off?.();
        });
      },
    ),
  );
});
