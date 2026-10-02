import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import "./style.css";

export default function Webview(props: OverlayProps) {
  const [nonce, setNonce] = createSignal(0);
  let timer: number | undefined;

  createEffect(() => {
    clearInterval(timer);
    const s = props.options.reload as number;
    if (s > 0) timer = window.setInterval(() => setNonce((n) => n + 1), s * 1000);
  });
  onCleanup(() => clearInterval(timer));

  const url = () => {
    const u = String(props.options.url ?? "").trim();
    return /^https?:\/\//i.test(u) ? u : "";
  };

  return (
    <div
      class="webv"
      classList={{ solid: !props.options.transparent }}
      style={{ width: `${props.options.width}px`, height: `${props.options.height}px` }}
    >
      <Show
        when={url()}
        fallback={
          <div class="ov-panel ov-empty webv-empty">
            Ayarlardan bir adres gir
            <br />
            <small>(https://…)</small>
          </div>
        }
      >
        {/* nonce değişince iframe yeniden yüklenir */}
        <Show when={nonce() >= 0} keyed>
          <iframe src={url()} title="Webview" loading="lazy" referrerpolicy="no-referrer" />
        </Show>
      </Show>
      {/* Düzenleme modunda iframe fareyi yutmasın diye üstüne şeffaf katman */}
      <Show when={props.editing}>
        <div class="webv-shield" />
      </Show>
    </div>
  );
}
