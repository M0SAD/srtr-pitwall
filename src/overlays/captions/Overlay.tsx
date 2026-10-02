import { Show, createSignal, onCleanup } from "solid-js";
import { onScreen, type OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { gateMode, type CaptionView } from "@/sdk/livechat";
import { CaptionBox, fontStack } from "../livechat/parts";
import "../livechat/style.css";

// Düzenleme modu örneği: sabit nesne (her yenilemede yeniden üretilmez), satırlar hiç eskimez
const SAMPLE: CaptionView = {
  lines: [
    { src: "remote", label: "Discord", text: "Pite gir, lastikler bitti", ts: Number.MAX_SAFE_INTEGER },
    { src: "mic", label: "", text: "Tamam, bu tur giriyorum", ts: Number.MAX_SAFE_INTEGER },
  ],
  rev: 0,
};

export default function Captions(props: OverlayProps) {
  const o = () => props.options;
  const caps = useTopic("captions");
  const [now, setNow] = createSignal(Date.now());
  const tick = setInterval(() => setNow(Date.now()), 500);
  onCleanup(() => clearInterval(tick));
  const status = useTopic("status");
  const view = () => {
    // Karar uygulamadan gelir (status.chat; OBS sayfası da aynı karara bakar). Giriş yok / OBS PRO'ya özel / karar
    // gelmedi: ekrandaki overlay hiçbir şey çizmez (panel önizlemesinde örnek görünür). Demo modu: örnek altyazı.
    if (onScreen()) {
      const m = gateMode(status()?.chat, false);
      if (m === "login" || m === "pro" || m === "wait") return null;
      if (m === "demo") return SAMPLE;
    }
    const c = caps();
    const live = c && c.lines.some((l) => now() - l.ts < (Number(o().maxAge) || 8) * 1000);
    return live ? c! : props.editing ? SAMPLE : null;
  };
  return (
    <div
      class="lc-captions"
      style={{
        width: `${Number(o().width) || 900}px`,
        "font-family": fontStack(String(o().font ?? "")),
        display: "flex",
        "justify-content": o().align === "left" ? "flex-start" : o().align === "right" ? "flex-end" : "center",
        "text-align": (o().align as "left" | "center" | "right") ?? "center",
        "min-height": "40px",
      }}
    >
      <Show when={view()}>
        <CaptionBox
          captions={view()!}
          now={now()}
          maxAge={Number(o().maxAge) || 8}
          size={Number(o().fontSize) || 36}
          color={o().color}
          remoteColor={o().remoteColor}
          bg={o().bg === false ? "transparent" : undefined}
        />
      </Show>
    </div>
  );
}
