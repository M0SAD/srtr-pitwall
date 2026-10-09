import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { onScreen, type OverlayProps } from "@/sdk/overlay";
import { inTauri } from "@/sdk/platform";
import { localeTag, t } from "@/sdk/i18n";
import "./style.css";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const rgba = (v: unknown, a: number) => {
  const h = hex(v, "#0c0e13");
  return `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${clamp(a, 0, 100) / 100})`;
};

function tone(freq: number, ms: number, volume: number) {
  if (volume <= 0) return;
  if (inTauri) {
    invoke("overlay_beep", { freq, ms, volume }).catch(() => {});
    return;
  }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = volume * 0.4;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
    osc.onended = () => void ctx.close();
  } catch {
    /* ses yok */
  }
}

/** "21:30", "9.05" → gün içindeki saniye; geçersizse null */
function parseTime(v: unknown): number | null {
  const m = /^\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*$/.exec(String(v ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 3600 + mi * 60 : null;
}

interface Alarm {
  at: number;
  label: string;
}
const DAY = 86400;
const DESIGNS = ["digital", "pill", "minimal", "analog"];

export default function Clock(props: OverlayProps) {
  const o = () => props.options;
  const [now, setNow] = createSignal(new Date());
  const timer = window.setInterval(() => setNow(new Date()), 250);
  onCleanup(() => clearInterval(timer));

  const design = () => (DESIGNS.includes(String(o().design)) ? String(o().design) : "digital");
  const sec = createMemo(() => now().getHours() * 3600 + now().getMinutes() * 60 + now().getSeconds());
  /** En uzun çalma süresi (sn). Eski "Uyarı süresi" (ringSec) yerine; susturulmazsa bu kadar çalar. */
  const ringMax = () => clamp(num(o().ringMax, 120), 10, 600);
  /** Tuşla susturma bu kadar saniye çaldıktan sonra mümkün */
  const KEY_AFTER = 10;
  /** Susturulan alarmlar: alarm saati → susturulduğu günün numarası (aynı gün yeniden çalmasın) */
  const [dismissed, setDismissed] = createSignal<Record<number, number>>({});
  const dayNo = () => Math.floor(new Date(now().getFullYear(), now().getMonth(), now().getDate()).getTime() / 86_400_000);
  const alarms = createMemo((): Alarm[] => {
    const out: Alarm[] = [];
    for (const i of [1, 2, 3]) {
      const at = parseTime(o()[`alarm${i}`]);
      if (at != null) out.push({ at, label: String(o()[`label${i}`] ?? "").trim() });
    }
    const rep = clamp(Math.round(num(o().repeatMin, 0)), 0, 240) * 60;
    if (rep > 0) for (let at = 0; at < DAY; at += rep) out.push({ at, label: String(o().repeatLabel ?? "").trim() });
    return out;
  });
  /** Alarma kalan saniye (0..DAY); çalan alarmda negatif değil, "geçen süre" ayrı hesaplanır */
  const until = (a: Alarm) => (a.at - sec() + DAY) % DAY;
  /** Alarm çalmaya başlayalı geçen saniye */
  const elapsed = (a: Alarm) => (sec() - a.at + DAY) % DAY;
  // Gece yarısını aşan alarm (ör. 23:59) ertesi gün susturulmuş sayılmasın diye susturma, çalmanın başladığı güne yazılır
  const ringDay = (a: Alarm) => dayNo() - (sec() < a.at ? 1 : 0);
  const ringing = createMemo(() => alarms().find((a) => elapsed(a) < ringMax() && dismissed()[a.at] !== ringDay(a)) ?? null);
  // Tuşla susturma: 10 sn çaldıktan sonra herhangi bir tuşa basılırsa (yalnızca gerçek overlay'de, Rust tuşları yoklar)
  {
    const poll = window.setInterval(() => {
      const a = ringing();
      if (!a || !real() || !inTauri || o().keyStop === false) return;
      const el = elapsed(a);
      if (el < KEY_AFTER) {
        // Yoklamayı erkenden başlat: 10. saniyede hazır olsun
        invoke<number>("key_idle_ms").catch(() => 0);
        return;
      }
      const ringingFor = el - KEY_AFTER;
      invoke<number>("key_idle_ms")
        .then((ms) => {
          // Tuş, 10. saniyeden sonra basıldıysa sustur
          if (ms < ringingFor * 1000 + 300 && ms < 60_000) setDismissed((d) => ({ ...d, [a.at]: ringDay(a) }));
        })
        .catch(() => {});
    }, 150);
    onCleanup(() => clearInterval(poll));
  }
  const next = createMemo(() => {
    let best: Alarm | null = null;
    for (const a of alarms()) if (until(a) > 0 && (!best || until(a) < until(best))) best = a;
    return best;
  });
  const real = () => onScreen() && !props.editing;
  // Ses: yalnızca gerçek overlay'de (panel önizlemesi çalmaz), saniyede bir
  createEffect(
    on(sec, (s) => {
      if (!real() || !ringing()) return;
      const v = clamp(num(o().volume, 60), 0, 100) / 100;
      const kind = String(o().sound ?? "beep");
      if (kind === "none") return;
      if (kind === "beep") tone(880, 300, v);
      else if (kind === "double") {
        tone(988, 140, v);
        window.setTimeout(() => tone(988, 140, v), 220);
      } else if (kind === "siren") tone(s % 2 ? 660 : 990, 700, v);
      else if (kind === "soft" && s % 3 === 0) tone(440, 500, v * 0.7);
    }),
  );

  const visible = () => {
    if (props.editing || !onScreen()) return true;
    const mode = String(o().show ?? "always");
    if (mode === "always" || ringing()) return true;
    if (mode === "soon") return !!next() && until(next()!) <= clamp(num(o().soonMin, 5), 1, 60) * 60;
    return false;
  };
  const p2 = (n: number) => String(n).padStart(2, "0");
  const hm = () => {
    const d = now();
    const h = o().h12 ? d.getHours() % 12 || 12 : d.getHours();
    return `${o().h12 ? h : p2(h)}:${p2(d.getMinutes())}`;
  };
  const ampm = () => (o().h12 ? (now().getHours() < 12 ? "AM" : "PM") : "");
  const dateText = createMemo(() => new Date(now().getFullYear(), now().getMonth(), now().getDate()).toLocaleDateString(localeTag(), { weekday: "short", day: "numeric", month: "short" }));
  const fmtAt = (a: Alarm) => `${p2(Math.floor(a.at / 3600))}:${p2(Math.floor((a.at % 3600) / 60))}`;
  const left = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}` : `${Math.floor(s / 60)}:${p2(s % 60)}`);
  const custom = () => !!o().customColors;
  const style = () => {
    const st: Record<string, string> = { "--ck-k": String(clamp(num(o().size, 100), 50, 300) / 100), "--ck-flash": hex(o().flashColor, "#ff4d4d") };
    if (custom()) {
      st["--ov-bg"] = rgba(o().bg, num(o().bgAlpha, 86));
      st["--ov-text"] = hex(o().textColor, "#f2f4f8");
      st["--ov-accent"] = hex(o().accentColor, "#ff8a2a");
      st.color = "var(--ov-text)";
    }
    return st;
  };
  const hands = () => {
    const d = now();
    const s = d.getSeconds();
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    return { h: h * 30, m: m * 6, s: s * 6 };
  };
  const Info = () => (
    <>
      <Show when={ringing()}>
        <div class="ck-msg" data-no-i18n>
          {ringing()!.label || t("Alarm")}
        </div>
      </Show>
      <Show when={!ringing() && o().showNext !== false && next()}>
        <div class="ck-next">
          <span data-no-i18n>
            {fmtAt(next()!)}
            {next()!.label ? ` · ${next()!.label}` : ""}
          </span>
          <b>{left(until(next()!))}</b>
        </div>
      </Show>
    </>
  );

  return (
    <Show when={visible()}>
      <div
        class={`ov-theme ck ck-${design()}`}
        classList={{ "ck-ring": !!ringing(), [`ck-f-${String(o().flash ?? "box")}`]: !!ringing(), "ov-panel": design() !== "minimal" }}
        style={style()}
      >
        <Show
          when={design() === "analog"}
          fallback={
            <div class="ck-main">
              <div class="ck-time">
                {hm()}
                <Show when={o().seconds}>
                  <small>{p2(now().getSeconds())}</small>
                </Show>
                <Show when={ampm()}>
                  <em>{ampm()}</em>
                </Show>
              </div>
              <Show when={o().date}>
                <div class="ck-date" data-no-i18n>
                  {dateText()}
                </div>
              </Show>
              <Info />
            </div>
          }
        >
          <svg class="ck-dial" viewBox="0 0 100 100">
            <circle class="ck-face" cx="50" cy="50" r="47" />
            <For each={Array.from({ length: 12 }, (_, i) => i)}>
              {(i) => <line class="ck-tick" classList={{ big: i % 3 === 0 }} x1="50" y1={i % 3 === 0 ? 7 : 8} x2="50" y2={i % 3 === 0 ? 15 : 12} transform={`rotate(${i * 30} 50 50)`} />}
            </For>
            <line class="ck-hand h" x1="50" y1="52" x2="50" y2="26" transform={`rotate(${hands().h} 50 50)`} />
            <line class="ck-hand m" x1="50" y1="53" x2="50" y2="14" transform={`rotate(${hands().m} 50 50)`} />
            <Show when={o().seconds}>
              <line class="ck-hand s" x1="50" y1="58" x2="50" y2="11" transform={`rotate(${hands().s} 50 50)`} />
            </Show>
            <circle class="ck-hub" cx="50" cy="50" r="2.6" />
          </svg>
          <Show when={o().date}>
            <div class="ck-date" data-no-i18n>
              {dateText()}
            </div>
          </Show>
          <Info />
        </Show>
      </div>
    </Show>
  );
}
