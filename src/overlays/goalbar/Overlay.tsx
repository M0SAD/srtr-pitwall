import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { onScreen, type OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { t } from "@/sdk/i18n";
import type { ChatMsg } from "@/sdk/livechat";
import "./style.css";

// Hedef Çubuğu: elle sayaç ya da canlı sohbet uyarılarından sayım.
//
// Uyarılar "livechat" konusunun son mesajlarından okunur (Rust: livechat; Streamlabs + platform uyarıları).
// Konu yalnızca son ~100 mesajı taşıdığı için sayım burada biriktirilir ve localStorage'da saklanır: aynı kaynağı
// kullanan uygulama içi kopyalar ortak sayar, OBS tarayıcı kaynağı kendi sayımını tutar (kapalıyken gelen uyarıları
// sonradan ancak son mesajlar arasındaysa yakalar). "Sayımı sıfırla" ayarı (resetSeq) değişince dönem yeniden başlar.

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

/** "₺1.250,50" / "$5.00" / "12" → sayı (tanınmazsa 0) */
export function parseAmount(v: unknown): number {
  const m = String(v ?? "").match(/\d[\d.,\s]*/);
  if (!m) return 0;
  let s = m[0].replace(/\s/g, "").replace(/[.,]+$/, "");
  const dot = s.lastIndexOf(".");
  const comma = s.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) {
    // Sonda olan ondalık ayırıcıdır
    s = dot > comma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (comma >= 0) {
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (dot >= 0 && !/\.\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

interface Counted {
  seq: number;
  n: number;
  sum: number;
  /** Dönemin başladığı an (unix ms): daha eski uyarılar sayılmaz */
  since: number;
  ids: string[];
  last: string;
}

const keyOf = (source: string) => `pitwall.goalbar.${source}`;
function load(source: string): Counted | null {
  try {
    const v = JSON.parse(localStorage.getItem(keyOf(source)) ?? "null");
    return v && typeof v === "object" && Array.isArray(v.ids) ? (v as Counted) : null;
  } catch {
    return null;
  }
}
function save(source: string, c: Counted) {
  try {
    localStorage.setItem(keyOf(source), JSON.stringify(c));
  } catch {
    /* depolama yok: sayım yalnızca bu oturumda tutulur */
  }
}

/** Mesaj bu kaynağa sayılır mı; kaç adet ve ne kadar tutar */
function weigh(m: ChatMsg, source: string): { n: number; sum: number } | null {
  if (m.deleted) return null;
  const type = m.alert?.type ?? "";
  const follower = type === "follower";
  const sub = m.kind === "sub";
  const donation = m.kind === "donation" || m.kind === "superchat";
  const ok = source === "follower" ? follower : source === "sub" ? sub : source === "donation" || source === "donationSum" ? donation : follower || sub || donation;
  if (!ok) return null;
  // Toplu hediye abonelik: adet kadar sayılır
  const n = sub && m.alert?.gifted && (m.alert.count ?? 0) > 1 ? m.alert.count! : 1;
  const sum = donation && type !== "cheer" ? parseAmount(m.amount) : 0;
  return { n, sum };
}

const ICONS: Record<string, string> = {
  // Genel şekiller (marka logosu değil): hedef, kalp, yıldız, madeni para
  manual: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  follower: "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.4 4.5c2.2 0 3.7 1.2 5.6 3.3 1.9-2.1 3.4-3.3 5.6-3.3 3.7 0 5.5 3.9 4 7.3C19.5 16.4 12 21 12 21Z",
  sub: "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9L12 2.5Z",
  donation: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm-1 2.5v8h2V8h-2Z",
};

export default function GoalBar(props: OverlayProps) {
  const chat = useTopic("livechat");
  const status = useTopic("status");
  const o = () => props.options;

  const source = () => String(o().source ?? "manual");
  const seq = () => Math.round(num(o().resetSeq, 0));
  const [counted, setCounted] = createSignal<Counted | null>(null);

  // Uyarıları say (kaynak ya da dönem değişince yeniden kurulur)
  createEffect(() => {
    const src = source();
    const sq = seq();
    if (src === "manual") {
      setCounted(null);
      return;
    }
    const msgs = chat()?.msgs ?? [];
    let st = load(src);
    let dirty = false;
    if (!st || st.seq !== sq) {
      // Yeni dönem: şu andan sonrası sayılır
      st = { seq: sq, n: 0, sum: 0, since: Date.now(), ids: [], last: "" };
      dirty = true;
    }
    for (const m of msgs) {
      if (m.ts < st.since || st.ids.includes(m.id)) continue;
      const w = weigh(m, src);
      if (!w) continue;
      st.n += w.n;
      st.sum += w.sum;
      st.ids.push(m.id);
      if (st.ids.length > 200) st.ids.splice(0, st.ids.length - 200);
      st.last = m.author?.name ? `${m.author.name}${m.amount ? ` · ${m.amount}` : ""}` : st.last;
      dirty = true;
    }
    if (dirty) save(src, st);
    setCounted(st);
  });

  const target = () => Math.max(0, parseAmount(o().target));
  const live = () => {
    const c = counted();
    const auto = !c ? 0 : source() === "donationSum" ? c.sum : c.n;
    return parseAmount(o().base) + auto + num(o().adjust, 0);
  };
  // Örnek: önizleme / düzenleme / Demo modunda uyarı kaynağı henüz hiç saymadıysa dolu bir çubuk göster
  const sample = () => {
    if (source() === "manual" || (counted()?.n ?? 0) > 0) return false;
    if (live() > 0) return false;
    const s = status();
    // Ekrandaki gerçek overlay'de yalnızca gerçek Demo / düzenleme: panel önizleme verisi (demo + preview) örnek göstermez
    return props.editing || !onScreen() || (!!s?.demo && !s?.preview);
  };
  const value = () => (sample() ? Math.round(target() * 0.64) : Math.max(0, live()));
  const frac = () => (target() > 0 ? clamp(value() / target(), 0, 1) : 0);
  const done = () => target() > 0 && value() >= target();
  const last = () => (sample() ? "Deneme_Destekçi" : counted()?.last ?? "");

  const fmt = (v: number) => {
    const s = (Math.round(v * 100) / 100).toLocaleString("tr-TR", { maximumFractionDigits: Number.isInteger(v) ? 0 : 2 });
    const u = String(o().unit ?? "").trim();
    return u ? `${s} ${u}` : s;
  };
  const design = () => (["slim", "pill", "milestone"].includes(o().design) ? (o().design as string) : "slim");
  const icon = () => ICONS[source() === "donationSum" ? "donation" : source() === "all" ? "follower" : source()] ?? ICONS.manual;
  const title = () => String(o().title ?? "").trim();
  const doneText = () => String(o().doneText ?? "").trim() || t("HEDEFE ULAŞILDI!");
  const pct = createMemo(() => `${Math.round(frac() * 100)}%`);
  const color = () => (done() ? (o().doneColor as string) || "var(--ov-green)" : (o().barColor as string) || "var(--ov-accent)");

  return (
    <div
      class={`ov-theme goal goal-d-${design()}`}
      classList={{ "goal-done": done() }}
      style={{
        width: `${clamp(num(o().width, 420), 180, 1200)}px`,
        "font-size": `${clamp(num(o().fontSize, 15), 10, 36)}px`,
        "--goal-c": color(),
        "--goal-f": frac().toFixed(4),
      }}
    >
      <div class="goal-box">
        <Show when={design() !== "slim"}>
          <span class="goal-ic">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={icon()} fill="currentColor" fill-rule="evenodd" />
            </svg>
          </span>
        </Show>
        <div class="goal-body">
          <div class="goal-head">
            <span class="goal-title" data-no-i18n>
              {done() && design() !== "milestone" ? doneText() : title()}
            </span>
            <Show when={o().showNumbers !== false && design() !== "milestone"}>
              <span class="goal-nums ov-mono" data-no-i18n>
                <b>{fmt(value())}</b> / {fmt(target())}
              </span>
            </Show>
            <Show when={o().showPercent !== false && design() !== "milestone"}>
              <span class="goal-pct ov-mono" data-no-i18n>
                {pct()}
              </span>
            </Show>
          </div>
          <Show when={design() === "milestone"}>
            <div class="goal-big" data-no-i18n>
              <Show when={o().showNumbers !== false}>
                <b class="ov-mono">{fmt(value())}</b>
                <span class="ov-mono">/ {fmt(target())}</span>
              </Show>
              <Show when={o().showPercent !== false}>
                <em class="ov-mono">{pct()}</em>
              </Show>
            </div>
          </Show>
          <div class="goal-track">
            <div class="goal-fill" />
            <Show when={design() === "milestone"}>
              <i style={{ left: "25%" }} />
              <i style={{ left: "50%" }} />
              <i style={{ left: "75%" }} />
            </Show>
          </div>
          <Show when={design() === "milestone" && done()}>
            <div class="goal-donetext" data-no-i18n>
              {doneText()}
            </div>
          </Show>
          <Show when={o().showLast !== false && source() !== "manual" && last() && design() !== "pill"}>
            <div class="goal-last">
              <label>Son destekçi</label>
              <span data-no-i18n>{last()}</span>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
