// Üst çubuk: ses odasındayken küçük denetim (sayfa değişse de bağlantı sürer). Motor: src/voice/engine.ts
import { Show } from "solid-js";
import { t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { grantUntil, inputMode, leaveRoom, toggleDeafen, toggleMic, transmitting, voice } from "@/voice/engine";
import * as I from "../icons";
import "../voicerooms.css";

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function VoiceDock(props: { onOpen: () => void }) {
  const live = () => !!voice.room() && voice.status() !== "idle" && voice.status() !== "error";
  const left = () => {
    const u = grantUntil(session()?.user.id ?? "");
    return u ? clock(u - voice.now()) : "";
  };
  return (
    <Show when={live()}>
      <div
        class="vr-dock"
        classList={{
          talk: transmitting(),
          recon: voice.status() === "reconnecting",
        }}
      >
        <button class="vr-dock-name" onClick={props.onOpen} title={t("Ses odasını aç")}>
          <I.Headphones />
          <span data-no-i18n>{voice.room()?.name}</span>
          <Show when={left()}>
            <em data-no-i18n>{left()}</em>
          </Show>
        </button>
        <Show when={inputMode() === "open"}>
          <button class="vr-dock-btn" classList={{ off: !voice.micOn() }} onClick={toggleMic} title={t("Mikrofonu aç / kapat")}>
            {voice.micOn() ? <I.Mic /> : <I.MicOff />}
          </button>
        </Show>
        <button class="vr-dock-btn" classList={{ off: voice.deafened() }} onClick={toggleDeafen} title={t("Sesi kapat (kimseyi duyma)")}>
          {voice.deafened() ? <I.HeadphoneOff /> : <I.Headphones />}
        </button>
        <button class="vr-dock-btn leave" onClick={() => void leaveRoom()} title={t("Ayrıl")}>
          <I.PhoneOff />
        </button>
      </div>
    </Show>
  );
}
