import { Show } from "solid-js";
import { onScreen, type OverlayProps } from "@/sdk/overlay";
import { gateMode } from "@/sdk/livechat";
import { useTopic } from "@/sdk/telemetry";
import { PollBox, SAMPLE_POLL, fontStack } from "../livechat/parts";
import "../livechat/style.css";

export default function LivePoll(props: OverlayProps) {
  const o = () => props.options;
  const poll = useTopic("livepoll");
  const status = useTopic("status");
  const view = () => {
    // Karar uygulamadan gelir (status.chat; OBS sayfası da aynı karara bakar). Giriş yok / OBS PRO'ya özel / karar
    // gelmedi: ekrandaki overlay hiçbir şey çizmez (panel önizlemesinde örnek görünür). Demo modu: örnek anket.
    if (onScreen()) {
      const m = gateMode(status()?.chat, false);
      if (m === "login" || m === "pro" || m === "wait") return null;
      if (m === "demo") return SAMPLE_POLL;
    }
    const p = poll();
    if (p && p.state !== "idle") return p;
    return props.editing ? SAMPLE_POLL : null;
  };
  return (
    <div
      class="lc lc-poll-wrap"
      style={{ width: `${Number(o().width) || 360}px`, "font-size": `${Number(o().fontSize) || 16}px`, "font-family": fontStack(String(o().font ?? "")) }}
    >
      <Show when={view()}>
        <PollBox poll={view()!} showQuestion={o().showQuestion !== false} showAnswers={o().showAnswers !== false} barColor={o().barColor} winColor={o().winColor} />
      </Show>
    </div>
  );
}
