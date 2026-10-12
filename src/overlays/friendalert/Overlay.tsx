import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import type { OverlayProps } from "@/sdk/overlay";
import { inTauri } from "@/sdk/platform";
import { messageBeep } from "@/cloud/social";
import { FRIEND_ALERT_SHOW, type FriendAlertShow } from "@/host/friendAlert";
import "./style.css";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const DESIGNS = ["triangle", "circle", "banner"];

// Arkadaş Uyarısı: aynı yarıştaki bir arkadaş uyarı tuşuna basınca (src/host/friendAlert.ts "friend-alert-show")
// ekranda yanıp sönen ünlem + "DİKKAT" + gönderenin adı. Düzenlerken örnek görünür.
export default function FriendAlert(props: OverlayProps) {
  const o = () => props.options;
  const [alert, setAlert] = createSignal<FriendAlertShow | null>(null);
  let hideT: ReturnType<typeof setTimeout> | undefined;
  onMount(() => {
    if (!inTauri) return;
    const un = listen<FriendAlertShow>(FRIEND_ALERT_SHOW, (e) => {
      setAlert(e.payload ?? { name: "" });
      clearTimeout(hideT);
      hideT = setTimeout(() => setAlert(null), clamp(num(o().duration, 5), 1, 30) * 1000);
      if (o().sound !== false) messageBeep(0.3, true);
    }).catch(() => null);
    onCleanup(() => {
      clearTimeout(hideT);
      void un.then((f) => f?.());
    });
  });
  const view = () => alert() ?? (props.editing ? { name: "Erkin Azcan" } : null);
  const design = () => (DESIGNS.includes(String(o().design)) ? String(o().design) : "triangle");
  const text = () => String(o().text ?? "").trim() || "DİKKAT";
  return (
    <div
      class={`fa fa-${design()}`}
      style={{
        "--fa-k": String(clamp(num(o().size, 100), 40, 300) / 100),
        "--fa-c": hex(o().color, "#ffcc00"),
        "--fa-t": hex(o().textColor, "#ffffff"),
        "--fa-blink": `${(1 / clamp(num(o().speed, 3), 1, 8)).toFixed(3)}s`,
      }}
    >
      <Show when={view()}>
        {(v) => (
          <div class="fa-box" classList={{ blink: !!alert() }}>
            <div class="fa-icon">
              <Show when={design() === "triangle"} fallback={<span class="fa-shape" />}>
                <svg viewBox="0 0 100 88" class="fa-tri">
                  <path d="M50 4 L96 84 L4 84 Z" />
                </svg>
              </Show>
              <b class="fa-bang">!</b>
            </div>
            <div class="fa-txt">
              <b data-no-i18n>{text()}</b>
              <Show when={o().showName !== false && v().name}>
                <span data-no-i18n>{v().name}</span>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
