import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { sessionShowKind } from "@/sdk/sessionShow";
import "./style.css";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const rgba = (v: unknown, a: number) => {
  const h = hex(v, "#0c0e13");
  return `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${clamp(a, 0, 100) / 100})`;
};
const DESIGNS = ["card", "pill", "minimal"];

/** iRacing setup adı: "klasör\\ad.sto" → gösterilecek ad */
export function setupLabel(raw: string, folder: boolean, ext: boolean): string {
  let n = raw.trim();
  if (!folder) n = n.split(/[\\/]/).pop() ?? n;
  else n = n.replace(/\\/g, " / ");
  if (!ext) n = n.replace(/\.sto$/i, "");
  return n;
}

const TYPE_LABEL: Record<string, string> = { user: "Kendi setup'ım", iracing: "iRacing", shared: "Paylaşılan", team: "Takım" };

// Setup Adı: garajda yüklü setup dosyası (iRacing DriverInfo.DriverSetupName). "Yarış başladıktan sonra gizle" açıkken
// yarışın yeşil bayrağından (SessionState 4) belirtilen süre sonra gizlenir. Overlay yarış sürerken açıldıysa yeşilin
// ne zaman yandığı bilinmez: yarış başlamış sayılır ve gizli kalır.
export default function SetupName(props: OverlayProps) {
  const ses = useTopic("session");
  const o = () => props.options;
  const design = () => (DESIGNS.includes(String(o().design)) ? String(o().design) : "card");
  const raw = () => String(ses()?.setupName ?? "");
  const name = () => setupLabel(raw(), !!o().showFolder, !!o().showExt);
  const label = () => String(o().label ?? "SETUP").trim();
  const typeLabel = () => {
    const t = String(ses()?.setupType ?? "").toLowerCase();
    return TYPE_LABEL[t] ?? (t ? t : "");
  };

  // Yarış başlangıcı (yeşil bayrağın görüldüğü an); 0: henüz başlamadı, -1: başlangıç görülmedi (zaten sürüyordu)
  const [greenAt, setGreenAt] = createSignal(0);
  const [now, setNow] = createSignal(Date.now());
  let prevState = -1;
  let prevType = "";
  createEffect(() => {
    const s = ses();
    if (!s) return;
    const race = sessionShowKind(s.sessionType) === "race";
    const st = num(s.state, 0);
    if (s.sessionType !== prevType) {
      prevType = s.sessionType;
      prevState = -1;
      setGreenAt(0);
    }
    if (race && st >= 4) {
      if (greenAt() === 0) setGreenAt(prevState >= 0 && prevState < 4 ? Date.now() : -1);
    } else {
      setGreenAt(0);
    }
    prevState = st;
  });
  const tick = window.setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(tick));
  const hidden = () => {
    if (props.editing || !o().hideAfterStart) return false;
    const g = greenAt();
    if (g === 0) return false;
    if (g < 0) return true;
    return now() - g >= clamp(num(o().hideDelay, 30), 0, 600) * 1000;
  };

  const custom = () => !!o().customColors;
  const style = () => {
    const st: Record<string, string> = {
      "font-size": `${clamp(num(o().fontSize, 16), 10, 40)}px`,
      "max-width": `${clamp(num(o().maxWidth, 360), 120, 900)}px`,
      "--sn-accent": custom() ? hex(o().accentColor, "#ff8a2a") : "var(--ov-accent)",
    };
    if (custom()) {
      st["--ov-bg"] = rgba(o().bg, num(o().bgAlpha, 86));
      st["--ov-text"] = hex(o().textColor, "#f2f4f8");
      st["--ov-dim"] = hex(o().labelColor, "#9aa3b2");
    }
    return st;
  };

  // Ad kutuya tam sığsın: genişliği aşarsa yazı küçülür (en az %62), o da yetmezse iki satıra iner. Kesilmez.
  const names = new Set<HTMLSpanElement>();
  const fit = () => {
    for (const el of names) {
      if (!el.isConnected) {
        names.delete(el);
        continue;
      }
      el.style.fontSize = "";
      el.classList.remove("sn-wrap");
      const avail = el.clientWidth;
      const need = el.scrollWidth;
      if (avail <= 0 || need <= avail + 1) continue;
      const k = avail / need;
      el.style.fontSize = `${Math.max(0.62, k * 0.98).toFixed(3)}em`;
      if (k < 0.62) el.classList.add("sn-wrap");
    }
  };
  createEffect(on([name, () => o().fontSize, () => o().maxWidth, design, () => o().showLabel, () => ses()?.setupModified, () => o().showType], () => requestAnimationFrame(fit)));
  const nameEl = () => (
    <span class="sn-name" data-no-i18n title={raw()} ref={(el) => (names.add(el), requestAnimationFrame(fit))}>
      {name() || "—"}
    </span>
  );
  const badges = () => (
    <>
      <Show when={o().showModified !== false && ses()?.setupModified}>
        <span class="sn-mod">değiştirildi</span>
      </Show>
      <Show when={o().showType && typeLabel()}>
        <span class="sn-type">{typeLabel()}</span>
      </Show>
    </>
  );

  return (
    <div class={`ov-theme sn sn-${design()}`} classList={{ "sn-off": hidden(), "sn-empty": !name() }} style={style()}>
      <Show when={design() === "card"}>
        <div class="ov-panel sn-box">
          <Show when={o().showLabel !== false && label()}>
            <div class="sn-cap" data-no-i18n>
              {label()}
            </div>
          </Show>
          <div class="sn-line">
            {nameEl()}
            {badges()}
          </div>
        </div>
      </Show>
      <Show when={design() === "pill"}>
        <div class="ov-panel sn-pill">
          <Show when={o().showLabel !== false && label()}>
            <span class="sn-tag" data-no-i18n>
              {label()}
            </span>
          </Show>
          {nameEl()}
          {badges()}
        </div>
      </Show>
      <Show when={design() === "minimal"}>
        <div class="sn-min">
          <Show when={o().showLabel !== false && label()}>
            <span class="sn-cap" data-no-i18n>
              {label()}
            </span>
          </Show>
          {nameEl()}
          {badges()}
        </div>
      </Show>
    </div>
  );
}
