import { Show, createMemo } from "solid-js";
import { onScreen, type OverlayProps } from "@/sdk/overlay";
import { demoShow, useTopic } from "@/sdk/telemetry";
import { t } from "@/sdk/i18n";
import { paidLive } from "@/sdk/streamBadge";
import srtrLogo from "@/assets/logo.png";
import srtrBanner from "./banner.webp";
import "./style.css";

// Setup Örtüsü: araç pistte değilken (garaj / pit menüsü) yayında setup ekranının üstünü örter.
// Örtü tam opaktır (yarı saydamlık ayarı bilerek yok: değerler arkadan okunabilirdi).
export default function SetupCover(props: OverlayProps) {
  const status = useTopic("status");
  const o = () => props.options;
  const show = createMemo(() => {
    if (props.editing || !onScreen() || demoShow()) return true;
    const s = status();
    if (!s?.connected || s.preview) return false;
    const when = String(o().when ?? "menu");
    // Garaj / setup ekranı açıkken: sim bildiriyorsa (iRacing) yalnızca o ekran açıkken; bildirmiyorsa pistte değilken
    if (when === "menu" && typeof s.garageVisible === "boolean") return s.garageVisible;
    if (when === "always") return true;
    if (when === "garage") return !!s.inGarage;
    // Tekrar izlerken ya da izleyici / spotter iken örtmeye gerek yok: kendi aracının setup'ı açık değildir
    return !!s.inGarage || (!s.onTrack && !s.replayWatch && !s.spectating);
  });
  // Özelleştirme (kendi görseli / logo tasarımı) yalnızca ücretli PRO'da; diğerlerinde SRTR Pitwall görseli
  const custom = () => paidLive();
  const banner = () => !custom() || String(o().design ?? "banner") !== "logo";
  const img = () => (custom() ? String(o().logo || "") : "");
  const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
  return (
    <div class="sc-wrap" style={{ width: `${num(o().w, 1280)}px`, height: `${num(o().h, 720)}px` }}>
      <div
        class="sc"
        classList={{ on: show(), fade: o().fade !== false, stripes: !banner() && o().stripes !== false, frame: o().frame !== false, banner: banner() }}
        style={{
          "--sc-bg": String(o().bg || "#0d0f14"),
          "--sc-acc": String(o().accent || "#ff8a2a"),
          "--sc-text": String(o().text || "#f2f4f8"),
          "border-radius": `${num(o().radius, 14)}px`,
        }}
      >
        <Show when={banner()}>
          <img class="sc-banner sc-banner-bg" src={img() || srtrBanner} alt="" draggable={false} />
          <img class="sc-banner" src={img() || srtrBanner} alt="" draggable={false} />
        </Show>
        <Show when={!banner() && o().showLogo !== false}>
          <img class="sc-logo" src={img() || srtrLogo} alt="" draggable={false} style={{ "max-width": `${num(o().logoSize, 220)}px`, "max-height": `${num(o().logoSize, 220)}px` }} />
        </Show>
        <Show when={!banner() && o().showText !== false}>
          <div class="sc-title" data-no-i18n>
            {String(o().title || "").trim() || t("Setup gizli")}
          </div>
          <div class="sc-sub" data-no-i18n>
            {String(o().subtitle || "").trim() || t("Ayarlar yapılıyor, birazdan pistteyiz")}
          </div>
        </Show>
      </div>
    </div>
  );
}
