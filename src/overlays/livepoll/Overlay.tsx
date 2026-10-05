import { Show } from "solid-js";
import { onScreen, type OverlayProps } from "@/sdk/overlay";
import { gateMode } from "@/sdk/livechat";
import { useTopic } from "@/sdk/telemetry";
import { PollBox, PollDictBox, SAMPLE_POLL, fontStack } from "../livechat/parts";
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
      // Demo modu açıkken (sohbet bağlı olsa da, giriş / PRO koşulu sağlanmasa da) gerçek bir anket yoksa örnek anket görünür
      // Yalnızca kullanıcının açtığı Demo modu (status.demo panel önizlemesinde de doğrudur: uygulama açılınca örnek anket ekranda kalıyordu)
      const demo = m === "demo" || !!status()?.chat?.demo;
      const live = poll();
      if (m === "real" && live && live.state !== "idle") return live;
      if (demo) return SAMPLE_POLL;
      if (m === "login" || m === "pro" || m === "wait") return null;
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
      <Show when={!view() && poll()?.dictation != null}>
        <PollDictBox text={poll()!.dictation ?? ""} />
      </Show>
      <Show when={view()}>
        <PollBox poll={view()!} showQuestion={o().showQuestion !== false} showAnswers={o().showAnswers !== false} barColor={o().barColor} winColor={o().winColor} />
      </Show>
    </div>
  );
}
