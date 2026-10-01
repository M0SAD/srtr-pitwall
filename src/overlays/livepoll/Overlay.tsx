import { Show } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { PollBox, SAMPLE_POLL, fontStack } from "../livechat/parts";
import "../livechat/style.css";

export default function LivePoll(props: OverlayProps) {
  const o = () => props.options;
  const poll = useTopic("livepoll");
  const view = () => {
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
