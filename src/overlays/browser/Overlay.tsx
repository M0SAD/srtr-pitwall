// "Tarayıcı" overlay'i: sayfa ayrı bir tarayıcı penceresinde (Rust: webov.rs) bu çerçevenin tam üstünde açılır.
// Bu bileşen yalnızca yer tutar: çerçevenin ekrandaki yerini ve ayarları pencereye bildirir. Panel önizlemesinde,
// VR ve OBS'de pencere açılmaz, yerine adresin yazdığı kart görünür.
import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { onScreen, type OverlayProps } from "@/sdk/overlay";
import { inTauri, query } from "@/sdk/platform";
import { t } from "@/sdk/i18n";
import "./style.css";

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export default function Browser(props: OverlayProps) {
  let el: HTMLDivElement | undefined;
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const url = () => {
    const u = String(props.options.url ?? "").trim();
    return /^https?:\/\//i.test(u) ? u : "";
  };
  /** Pencere yalnızca ekrandaki gerçek overlay penceresinde açılır */
  const live = () => inTauri && onScreen() && !query.get("vr") && !!url();
  const [rect, setRect] = createSignal({ x: 0, y: 0, w: 0, h: 0 });
  const [err, setErr] = createSignal("");

  const measure = () => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const n = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    const o = rect();
    if (n.x !== o.x || n.y !== o.y || n.w !== o.w || n.h !== o.h) setRect(n);
  };
  onMount(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (el) ro.observe(el);
    // Çerçeve sürüklenince boyutu değişmez: konumu da düzenli denetlenir
    const iv = window.setInterval(measure, 400);
    onCleanup(() => {
      ro.disconnect();
      clearInterval(iv);
    });
  });

  let opened = false;
  createEffect(() => {
    if (!live()) {
      if (opened) {
        opened = false;
        void invoke("browser_close", { key }).catch(() => {});
      }
      return;
    }
    const r = rect();
    if (r.w < 10 || r.h < 10) return;
    const args = {
      key,
      owner: getCurrentWebviewWindow().label,
      url: url(),
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      zoom: Math.max(25, Math.min(300, Number(props.options.zoom) || 100)) / 100,
      muted: props.options.muted === true,
      interact: props.options.interact === true,
      transparent: props.options.transparent === true,
      css: String(props.options.css ?? ""),
      visible: !props.editing,
    };
    opened = true;
    invoke("browser_set", args).then(
      () => setErr(""),
      (e) => setErr(String(e)),
    );
  });
  onCleanup(() => {
    if (opened) void invoke("browser_close", { key }).catch(() => {});
  });

  createEffect(() => {
    const s = Number(props.options.reload) || 0;
    if (!live() || s <= 0) return;
    const iv = window.setInterval(() => void invoke("browser_reload", { key }).catch(() => {}), s * 1000);
    onCleanup(() => clearInterval(iv));
  });

  // Ekranda, düzenleme dışında: pencere bu alanın üstünde, burası boş kalır
  const card = () => !live() || props.editing || !!err();
  return (
    <div
      ref={el}
      class="brw"
      classList={{ "brw-card": card(), "brw-live": !card() }}
      style={{ width: `${Math.max(120, Number(props.options.width) || 480)}px`, height: `${Math.max(80, Number(props.options.height) || 320)}px` }}
      data-no-i18n
    >
      <Show when={card()}>
        <div>
          <Show when={url()} fallback={<b>{t("Ayarlardan bir adres gir")}</b>}>
            <b>{hostOf(url())}</b>
          </Show>
          <Show when={err()}>
            <small class="brw-err">{err()}</small>
          </Show>
          <Show when={!err()}>
            <small>
              {!inTauri
                ? t("Tarayıcı overlay'i OBS'de gösterilmez; OBS'de bu adres için bir Tarayıcı kaynağı ekle.")
                : query.get("vr")
                  ? t("Tarayıcı overlay'i VR'da gösterilmez.")
                  : onScreen()
                    ? t("Sayfa düzenleme bitince bu alanda açılır.")
                    : t("Sayfa ekrandaki overlay'de, ayrı bir tarayıcı penceresinde açılır.")}
            </small>
          </Show>
        </div>
      </Show>
    </div>
  );
}
