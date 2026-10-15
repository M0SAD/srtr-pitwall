// Sol alt menü (Ses Odaları bölümü): en üstte Ses ayarları, altında Topluluk odaları (yöneticilerin kalıcı odaları)
// ve Özel odalar (PRO üyelerin odaları; boş kalınca 1 saat sonra silinir). Odaya tıklayınca girilir.

import { For, Show, onCleanup } from "solid-js";
import { t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import type { VoiceRoomRow } from "@/cloud/voiceRooms";
import { joinRoom, voice } from "@/voice/engine";
import { communityRooms, privateRooms, watchRooms } from "@/voice/roomsStore";
import { go, sub } from "../ui";
import * as I from "../icons";
import "../voicerooms.css";

function RoomItem(props: { r: VoiceRoomRow }) {
  const here = () => voice.room()?.id === props.r.id;
  return (
    <button
      class="vrn-room"
      classList={{ active: here() && sub() !== "settings", here: here() }}
      title={props.r.description || props.r.name}
      onClick={() => {
        go("voicerooms", "rooms");
        if (!here()) void joinRoom(props.r.id, null);
      }}
    >
      <span class="vrn-ic">{props.r.kind === "private" ? <I.Lock /> : props.r.kind === "team" ? <I.Users /> : <I.AudioLines />}</span>
      <span class="vrn-name" data-no-i18n>
        {props.r.name}
      </span>
      <Show when={props.r.mode === "moderated"}>
        <span class="vrn-hand" title={t("Söz hakkıyla: konuşmak için söz iste")}>
          <I.Hand />
        </span>
      </Show>
      <Show when={props.r.members > 0}>
        <span class="vrn-count">{props.r.members}</span>
      </Show>
    </button>
  );
}

export function VoiceRoomsNav() {
  onCleanup(watchRooms());
  return (
    <div class="vrn">
      <button class="vrn-top" classList={{ active: sub() === "settings" }} onClick={() => go("voicerooms", "settings")}>
        <I.Settings /> Ses ayarları
      </button>
      <button class="vrn-top" classList={{ active: sub() !== "settings" && !voice.room() }} onClick={() => go("voicerooms", "rooms")}>
        <I.Grid3x3 /> Tüm odalar
      </button>
      <Show when={session()}>
        <div class="vrn-scroll">
          <div class="vrn-head">Topluluk odaları</div>
          <For each={communityRooms()} fallback={<small class="vrn-empty">Henüz oda yok</small>}>
            {(r) => <RoomItem r={r} />}
          </For>
          <div class="vrn-head">Özel odalar</div>
          <For each={privateRooms()} fallback={<small class="vrn-empty">Şu an özel oda yok</small>}>
            {(r) => <RoomItem r={r} />}
          </For>
        </div>
      </Show>
    </div>
  );
}
