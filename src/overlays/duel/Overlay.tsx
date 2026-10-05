import { For, Show, createEffect, createMemo, createSignal, untrack } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useRows, useTopic, demoShow } from "@/sdk/telemetry";
import { Flag } from "@/sdk/Flag";
import { irating } from "@/sdk/format";
import type { Row } from "@/sdk/types";
import { CarLogo } from "@/sdk/logos";
import { formatName } from "@/sdk/HeaderStats";
import { TireBadge } from "@/sdk/TireBadge";
import { LicenseBadge } from "@/sdk/LicenseBadge";
import { DUEL_DEFAULT_FIELDS } from "./manifest";
import "./style.css";

// Yakın Takip: öndeki ve arkadaki araçlar bir makara (slot makinesi tamburu) gibi dizilir.
// Ortada oyuncu; üstünde öndekiler (en yakını hemen üstte), altında arkadakiler. Bir araç eşik farkının içine
// girdikçe satırı büyür, netleşir ve parlar; sıra değişince satırlar yeni yuvalarına dönerek kayar.
// Her şey transform / opacity ile yapılır (GPU dostu); bulanıklık ayardan kapatılabilir.

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

/** Metre tahmini için en düşük hız (m/s): dururken fark 0 m görünmesin */
const MIN_SPEED = 10;

export default function Duel(props: OverlayProps) {
  const data = useTopic("relative");
  const session = useTopic("session");
  const tele = useTopic("telemetry");

  // Satır kimliği araç idx'ine göre sabit: her pakette DOM yeniden kurulmaz, sıra değişince düğüm taşınır
  const stable = useRows(() => data()?.rows);

  const o = () => props.options;
  const nAhead = () => clamp(Math.round(num(o().ahead, 3)), 1, 5);
  const nBehind = () => clamp(Math.round(num(o().behind, 3)), 1, 5);
  const metres = () => o().gapUnit === "m" && tele() != null;
  /** Eşik türü: "s" süre, "m" mesafe, "off" sınırsız. Eski kayıtlarda (ayar yokken) fark birimiyle aynıydı. */
  const mode = () => {
    const m = o().thresholdMode ?? o().gapUnit;
    return m === "off" ? "off" : m === "m" && tele() != null ? "m" : "s";
  };
  const unlimited = () => mode() === "off";
  const speed = () => Math.max(MIN_SPEED, tele()?.speed ?? 0);
  const k = () => clamp(num(o().reel, 60), 0, 100) / 100;
  const rowH = () => clamp(num(o().rowHeight, 36), 22, 64);
  const fields = createMemo(() => new Set<string>(Array.isArray(o().fields) ? (o().fields as string[]) : DUEL_DEFAULT_FIELDS));
  const has = (f: string) => fields().has(f);

  const me = createMemo(() => stable().find((r) => r.isMe));

  /** Gösterilecek satırlar ve yuvaları: −1 hemen öndeki, +1 hemen arkadaki. Sınırın bir dışındaki araç da
   *  (görünmez olarak) tutulur ki sıraya girerken makaranın kenarından dönerek gelsin. */
  const layout = createMemo(() => {
    const all = stable();
    const mi = all.findIndex((r) => r.isMe);
    const slots = new Map<Row, number>();
    if (mi < 0) return { list: [] as Row[], slots };
    const cls = all[mi].classId;
    const ok = (r: Row) => !o().sameClass || r.classId === cls;
    const list: Row[] = [];
    let s = 0;
    for (let i = mi - 1; i >= 0 && s < nAhead() + 1; i--) {
      if (!ok(all[i])) continue;
      s++;
      slots.set(all[i], -s);
      list.unshift(all[i]);
    }
    s = 0;
    for (let i = mi + 1; i < all.length && s < nBehind() + 1; i++) {
      if (!ok(all[i])) continue;
      s++;
      slots.set(all[i], s);
      list.push(all[i]);
    }
    return { list, slots };
  });
  const slotOf = (r: Row) => layout().slots.get(r) ?? 0;

  /** Eşik (ön/arka) — birim ayara göre saniye ya da metre */
  const threshold = (behind: boolean) => {
    const split = !!o().splitThreshold && behind;
    return mode() === "m"
      ? clamp(num(split ? o().thresholdBackM : o().thresholdM, 100), 5, 2000)
      : clamp(num(split ? o().thresholdBack : o().threshold, 2), 0.1, 60);
  };
  /** Farkın büyüklüğü: metre (hızla tahmin) ya da saniye */
  const dist = (r: Row, m: boolean) => Math.abs(r.gap) * (m ? speed() : 1);
  const distance = (r: Row) => dist(r, metres());
  /** Yakınlık 0..1: eşikte 0, tampon tampona 1. Sınırsızda eşik yok: 3 sn'lik ölçekle büyür ama hiçbir satır sönmez. */
  const closeness = (r: Row) =>
    unlimited() ? Math.max(0.45, 1 - clamp(Math.abs(r.gap) / 3, 0, 1)) : 1 - clamp(dist(r, mode() === "m") / threshold(r.gap < 0), 0, 1);
  /** Tur farkı (yarış): +1 / +2 beni turlayanlar, −1 / −2 turladıklarım */
  const lapText = (r: Row) => (r.lapRel ? `${r.lapRel > 0 ? "+" : "−"}${Math.abs(r.lapRel)}` : "");

  const gapText = (r: Row) => {
    const sign = r.gap > 0 ? "−" : "+";
    if (metres()) return `${sign}${Math.round(distance(r))} m`;
    const a = Math.abs(r.gap);
    return sign + a.toFixed(a < 10 ? 2 : 1);
  };

  // --- Yaklaşma hızı: farkın zamana göre değişimi (yumuşatılmış), satır başına −1 yaklaşıyor / +1 uzaklaşıyor ---
  const keyOf = (r: Row) => `${r.idx}#${r.number}`;
  const hist = new Map<string, { gap: number; t: number; rate: number; trend: number }>();
  const [trends, setTrends] = createSignal<Record<string, number>>({});
  createEffect(() => {
    const rows = data()?.rows;
    if (!rows) return;
    const now = performance.now();
    const next: Record<string, number> = {};
    let changed = false;
    const prev = untrack(trends);
    for (const r of rows) {
      if (r.isMe) continue;
      const key = keyOf(r);
      const h = hist.get(key);
      const g = Math.abs(r.gap);
      if (!h) {
        hist.set(key, { gap: g, t: now, rate: 0, trend: 0 });
        next[key] = 0;
      } else {
        const dt = (now - h.t) / 1000;
        if (dt > 2) {
          h.rate = 0;
          h.trend = 0;
        } else if (dt > 0.04) {
          h.rate = h.rate * 0.85 + ((g - h.gap) / dt) * 0.15;
          // Histerezis: ok titremesin
          if (h.rate < -0.04) h.trend = -1;
          else if (h.rate > 0.04) h.trend = 1;
          else if (Math.abs(h.rate) < 0.015) h.trend = 0;
        }
        if (dt > 0.04) {
          h.gap = g;
          h.t = now;
        }
        next[key] = h.trend;
      }
      if (prev[key] !== next[key]) changed = true;
    }
    if (hist.size > 80) for (const key of [...hist.keys()]) if (!(key in next)) hist.delete(key);
    if (changed || Object.keys(prev).length !== Object.keys(next).length) setTrends(next);
  });
  const trendOf = (r: Row) => trends()[keyOf(r)] ?? 0;

  // --- Makara geometrisi ---
  /** Yuvanın (|slot| = j) temel ölçeği: merkezden uzaklaştıkça küçülür */
  const slotScale = (j: number) => (j <= 0 ? 1 : Math.max(0.45, 1 - k() * 0.15 * (j - 0.35)));
  const meH = () => (o().showMe === true ? rowH() * 0.8 : 6);
  const GAP = 3;
  /** |slot| = j için satır merkezinin orta çizgiye uzaklığı (px) */
  const offsets = createMemo(() => {
    const out = [0];
    let pos = meH() / 2 + GAP + 1;
    for (let j = 1; j <= 6; j++) {
      const h = rowH() * slotScale(j);
      out.push(pos + h / 2);
      pos += h + GAP;
    }
    return out;
  });
  const extent = (n: number) => offsets()[n] + (rowH() * slotScale(n)) / 2 + 2;

  const rowStyle = (r: Row) => {
    const s = slotOf(r);
    const j = Math.abs(s);
    const limit = s < 0 ? nAhead() : nBehind();
    const c = closeness(r);
    const inside = j <= limit && !(!unlimited() && o().hideOutside && c <= 0);
    const scale = slotScale(j) * (0.84 + 0.16 * c);
    const tilt = clamp(-s * k() * 13, -64, 64);
    const opacity = inside ? clamp((1 - k() * 0.13 * (j - 1)) * (0.4 + 0.6 * c), 0.14, 1) : 0;
    const blur = o().blur === true ? k() * 0.45 * (j - 1) + (1 - c) * 1.1 : 0;
    return {
      transform: `translate3d(0, ${(Math.sign(s) * offsets()[Math.min(j, 6)]).toFixed(1)}px, 0) perspective(520px) rotateX(${tilt.toFixed(1)}deg) scale(${scale.toFixed(3)})`,
      opacity: opacity.toFixed(2),
      filter: blur > 0.15 && inside ? `blur(${blur.toFixed(1)}px)` : "none",
      "--duel-c": c.toFixed(3),
      "z-index": String(10 - j),
    };
  };

  const rowClass = (r: Row) => {
    let c = slotOf(r) < 0 ? "ahead" : "behind";
    if (r.onPit) c += " pit";
    if (o().lapTint !== false) c += r.lapRel > 0 ? " lap-ahead" : r.lapRel < 0 ? " lap-behind" : "";
    return c;
  };

  const anyoneNear = createMemo(() => layout().list.some((r) => Math.abs(slotOf(r)) <= (slotOf(r) < 0 ? nAhead() : nBehind()) && closeness(r) > 0));
  const isRace = () => {
    const st = session()?.sessionType;
    return st == null || st === "" || /race|yarış/i.test(st);
  };
  const visible = () => props.editing || demoShow() || ((!o().raceOnly || isRace()) && (unlimited() || !o().hideWhenAlone || anyoneNear()));

  const content = (r: Row, self: boolean) => (
    <>
      <Show when={has("class")}>
        <span class="duel-class" style={{ background: r.classColor || "#666" }} />
      </Show>
      <Show when={has("pos")}>
        <span class="duel-pos">{r.classPos > 0 ? r.classPos : "-"}</span>
      </Show>
      <Show when={has("flair")}>
        <span class="duel-flair" data-no-i18n>
          <Flag code={r.flair} />
        </span>
      </Show>
      <Show when={has("num")}>
        <span class="duel-num" data-no-i18n>#{r.number}</span>
      </Show>
      <Show when={has("name")}>
        <span class="duel-name" data-no-i18n>{formatName(r.name, o().nameFormat as string)}</span>
      </Show>
      <Show when={!has("name")}>
        <span class="duel-name" />
      </Show>
      <Show when={has("car")}>
        <CarLogo class="duel-car" cell carName={r.carName || r.car} fallback={r.car} scale={num(o().logoSize, 130) / 100} />
      </Show>
      <Show when={has("license") && r.licLetter}>
        <LicenseBadge class="duel-licb" letter={r.licLetter} sr={r.sr} color={r.licColor} digits={1} />
      </Show>
      <Show when={has("irating") && r.irating > 0}>
        <span class="duel-ir" data-no-i18n>{irating(r.irating)}</span>
      </Show>
      <Show when={has("tire")}>
        <TireBadge kind={r.tireKind} />
      </Show>
      <Show when={has("pit") && r.pitState}>
        <span class={`ov-tag duel-ps duel-ps-${r.pitState.toLowerCase()}`}>{r.pitState}</span>
      </Show>
      <Show when={!self}>
        <Show when={has("trend")}>
          {/* Ok makaranın dönüş yönünü gösterir: yaklaşan araç ortaya doğru (yeşil), uzaklaşan dışa doğru (kırmızı) */}
          <span class="duel-trend" classList={{ closing: trendOf(r) < 0, away: trendOf(r) > 0 }}>
            {trendOf(r) === 0 ? "" : (trendOf(r) < 0) === r.gap > 0 ? "▼" : "▲"}
          </span>
        </Show>
        <Show when={lapText(r)}>
          <span class="duel-lap" classList={{ up: r.lapRel > 0, down: r.lapRel < 0 }} title={r.lapRel > 0 ? "Seni turladı (tur önde)" : "Turladığın araç (tur geride)"} data-no-i18n>
            {lapText(r)}
            <i>T</i>
          </span>
        </Show>
        <Show when={has("gap")}>
          <span class="duel-gap ov-mono">{gapText(r)}</span>
        </Show>
      </Show>
    </>
  );

  return (
    <div
      class="ov-theme duel"
      classList={{ "duel-off": !visible(), "duel-flat": k() < 0.05 }}
      style={{
        width: `${clamp(num(o().width, 560), 220, 700)}px`,
        "font-size": `${clamp(num(o().fontSize, 15), 10, 28)}px`,
        "--duel-h": `${rowH()}px`,
        "--duel-near": (o().nearColor as string) || "var(--ov-accent)",
        "--duel-bga": `${clamp(num(o().bgOpacity, 90), 0, 100)}%`,
      }}
    >
      <Show when={me()} fallback={<div class="ov-panel ov-empty">Veri bekleniyor…</div>}>
        <div class="duel-reel" style={{ height: `${(extent(nAhead()) + extent(nBehind())).toFixed(0)}px` }}>
          <div class="duel-axis" style={{ top: `${extent(nAhead()).toFixed(0)}px` }}>
            <For each={layout().list}>
              {(r) => (
                <div class={`duel-row ${rowClass(r)}`} style={rowStyle(r)}>
                  {content(r, false)}
                </div>
              )}
            </For>
            <Show when={o().showMe === true} fallback={<div class="duel-line" />}>
              <div class="duel-row me" style={{ height: `${meH().toFixed(0)}px`, "margin-top": `${(-meH() / 2).toFixed(0)}px` }}>
                {content(me()!, true)}
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
