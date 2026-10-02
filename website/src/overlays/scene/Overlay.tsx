import { previewFrozen } from "@/sdk/overlay";
import { Show, createSignal, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import "./style.css";

const TITLES: Record<string, string> = {
  starting: "Yayın birazdan başlıyor",
  brb: "Hemen dönüyorum",
  ending: "İzlediğin için teşekkürler",
  garage: "Garajda · ayarlar yapılıyor",
};

export default function Scene(props: OverlayProps) {
  const status = useTopic("status");
  const [now, setNow] = createSignal(Date.now());
  const start = Date.now();
  const t = setInterval(() => !previewFrozen() && setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(t));

  const style = () => props.options.style as string;
  const left = () => Math.max(0, (props.options.countdown as number) * 60_000 - (now() - start));
  const mmss = () => {
    const s = Math.ceil(left() / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  // Garaj örtüsü: sadece garajdayken (düzenlerken hep görünür)
  const show = () => style() !== "garage" || props.editing || !!status()?.inGarage;

  return (
    <Show when={show()}>
      <div
        class="scene"
        classList={{ transparent: !!props.options.transparent, [`scene-${style()}`]: true }}
        style={{ width: `${props.options.w}px`, height: `${props.options.h}px`, "--acc": props.options.accent as string }}
      >
        <div class="scene-stripes" />
        <div class="scene-box">
          <div class="scene-kicker" data-no-i18n>SRTR PITWALL</div>
          <h1>{(props.options.title as string) || TITLES[style()]}</h1>
          <Show when={props.options.subtitle}>
            <p>{props.options.subtitle as string}</p>
          </Show>
          <Show when={(style() === "starting" || style() === "brb") && (props.options.countdown as number) > 0}>
            <div class="scene-count">{left() > 0 ? mmss() : style() === "starting" ? "Başlıyoruz!" : "Geldim!"}</div>
          </Show>
        </div>
        <div class="scene-bar" />
      </div>
    </Show>
  );
}
