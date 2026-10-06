// Çerçevesiz pencereler (Arkadaşlar, sohbet) için: sağ üstte küçült / kapat düğmeleri ve verilen çubuklardan
// (seçiciler) tutup pencereyi taşıma. Tıklama bozulmaz: taşıma ancak imleç 4 px oynayınca başlar.
// Çubuğa çift tık pencereyi büyütür / eski boyutuna döndürür.
import { onCleanup, onMount } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "@/sdk/platform";
import { t } from "@/sdk/i18n";

const INTERACTIVE = ["button", "input", "textarea", "select", "a", "label", "[contenteditable]", "[role=button]", "[tabindex]", ".fst-av", ".fst-search", ".cwin-x"].join(",");

/** `inline`: düğmeler sabit köşe yerine bulunduğu satırın içinde çizilir (ana pencerenin üst çubuğu). `max`: büyüt / eski boyut düğmesi. */
export function WinChrome(props: { drag: string; inline?: boolean; max?: boolean }) {
  onMount(() => {
    if (!inTauri) return;
    const win = getCurrentWindow();
    const onBar = (e: Event) => {
      const el = e.target as HTMLElement | null;
      return !!el && !!el.closest(props.drag) && !el.closest(INTERACTIVE);
    };
    // Çubuktan tutup taşırken yazı alanının odağı kaybolmasın (taşıdıktan sonra yeniden tıklamak gerekmesin):
    // çubuğa basmak odağı değiştirmez (mousedown engellenir), taşıma bitince de odak eski yazı alanına geri verilir.
    let typing: HTMLElement | null = null;
    const isField = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName));
    const refocus = () => {
      const el = typing;
      if (!el || !el.isConnected || document.activeElement === el) return;
      // Kullanıcı bu arada başka bir alana geçtiyse dokunma
      if (isField(document.activeElement)) return;
      el.focus({ preventScroll: true });
    };
    const keep = (e: MouseEvent) => {
      if (e.button !== 0 || !onBar(e)) return;
      if (isField(document.activeElement)) {
        typing = document.activeElement;
        e.preventDefault();
      }
    };
    let moveTimer = 0;
    let unMoved: (() => void) | undefined;
    void win
      .onMoved(() => {
        clearTimeout(moveTimer);
        moveTimer = window.setTimeout(refocus, 120);
      })
      .then((u) => (unMoved = u))
      .catch(() => {});
    const onFocus = () => setTimeout(refocus, 0);
    window.addEventListener("focus", onFocus);
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !onBar(e)) return;
      if (isField(document.activeElement)) typing = document.activeElement;
      const x0 = e.clientX;
      const y0 = e.clientY;
      const move = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
        end();
        void win.startDragging().catch(() => {});
      };
      const end = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        setTimeout(refocus, 0);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    };
    const dbl = (e: MouseEvent) => onBar(e) && !(e.target as HTMLElement).closest(".cwin-tab") && void win.toggleMaximize().catch(() => {});
    document.addEventListener("pointerdown", down);
    document.addEventListener("mousedown", keep);
    document.addEventListener("dblclick", dbl);
    onCleanup(() => {
      document.removeEventListener("mousedown", keep);
      window.removeEventListener("focus", onFocus);
      clearTimeout(moveTimer);
      unMoved?.();
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("dblclick", dbl);
    });
  });
  return (
    <div class="winbtns" classList={{ inline: !!props.inline }}>
      <button title={t("Küçült")} onClick={() => void getCurrentWindow().minimize().catch(() => {})}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6.5h8" />
        </svg>
      </button>
      {props.max && (
        <button title={t("Büyüt / eski boyut")} onClick={() => void getCurrentWindow().toggleMaximize().catch(() => {})}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2.5" y="2.5" width="7" height="7" rx="0.8" />
          </svg>
        </button>
      )}
      <button class="x" title={t("Kapat")} onClick={() => void getCurrentWindow().close().catch(() => {})}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
    </div>
  );
}
