// Sohbette ses odası daveti kartı (c119 voice_invite): "Katıl" panel penceresindeki ses odası motoruna iletilir
// (Arkadaşlar penceresinden de çalışır: olay + panel öne gelir).

import { Show, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { t } from "@/sdk/i18n";
import { inTauri } from "@/sdk/platform";
import type { MsgMeta } from "@/cloud/social";
import * as I from "../icons";
import "../voicerooms.css";

export const VOICE_JOIN_EVENT = "voiceroom-join";

export function VoiceInviteCard(props: { meta: MsgMeta; mine: boolean; who: string }) {
  const [busy, setBusy] = createSignal(false);
  const join = async () => {
    if (!props.meta.room) return;
    setBusy(true);
    const payload = { room: props.meta.room, code: props.meta.code ?? null };
    if (inTauri) {
      await emit(VOICE_JOIN_EVENT, payload).catch(() => {});
      await invoke("panel_front").catch(() => {});
    } else {
      const m = await import("@/voice/engine");
      await m.joinRoom(payload.room, payload.code);
    }
    setTimeout(() => setBusy(false), 1500);
  };
  return (
    <div class="vinv">
      <span class="vinv-ic">
        <I.Headphones />
      </span>
      <div class="vinv-txt">
        <small class="muted">{props.mine ? t("Ses odasına davet gönderdin") : t("{0} seni ses odasına davet etti", props.who)}</small>
        <b data-no-i18n>{props.meta.name ?? "?"}</b>
        <Show when={props.meta.pro_only}>
          <small class="muted">{t("Sadece PRO üyeler girebilir")}</small>
        </Show>
      </div>
      <Show when={!props.mine}>
        <button class="btn primary small" disabled={busy()} onClick={() => void join()}>
          {busy() ? t("Bağlanıyor…") : t("Katıl")}
        </button>
      </Show>
    </div>
  );
}
