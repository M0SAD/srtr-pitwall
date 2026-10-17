import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { onScreen, previewFrozen } from "@/sdk/overlay";
import { TvLogo, lastNameUpper, numberColors, useTvStandings, useTvVisible, withDefaults } from "@/sdk/tvkit";
import type { Row } from "@/sdk/types";
import manifest from "./manifest";
import "./style.css";

// TV Mücadele: yakın iki araç için "BATTLE FOR P5" bandı, fark, eğilim oku ve küçük grafik.

interface Battle {
  a: Row; // önde
  b: Row; // arkada
  gap: number;
  pos: number;
}

export default function TvBattle(props: OverlayProps) {
  const o = withDefaults(manifest, () => props.options);
  const { rows, sample } = useTvStandings(() => !!props.editing);

  const candidates = createMemo<Battle[]>(() => {
    const th = Math.max(0.2, Number(o().threshold) || 1);
    const maxPos = Math.max(2, Number(o().maxPos) || 20);
    const byClass = o().classFilter === "class";
    const l = rows().filter((r) => !r.onPit && (byClass ? r.classPos : r.pos) <= maxPos);
    const out: Battle[] = [];
    const groups = byClass ? [...new Set(l.map((r) => r.classId))].map((c) => l.filter((r) => r.classId === c).sort((x, y) => x.classPos - y.classPos)) : [l];
    for (const g of groups) {
      for (let i = 1; i < g.length; i++) {
        const b = g[i];
        if (b.lapsDown !== g[i - 1].lapsDown) continue;
        if (b.interval > 0 && b.interval <= th) out.push({ a: g[i - 1], b, gap: b.interval, pos: byClass ? g[i - 1].classPos : g[i - 1].pos });
      }
    }
    return out;
  });
  const pick = (): Battle | undefined => {
    const c = candidates();
    if (!c.length) return sample() ? { a: rows()[3], b: rows()[4], gap: 0.412, pos: 4 } : undefined;
    if (o().prefer === "closest") return [...c].sort((x, y) => x.gap - y.gap)[0];
    if (o().prefer === "mine") return c.find((x) => x.a.isMe || x.b.isMe) ?? c[0];
    return [...c].sort((x, y) => x.pos - y.pos)[0];
  };

  // Ekrandaki mücadele: en az minSecs kalır; yeni çift 3 sn sürerse değişir (titremesin)
  const [cur, setCur] = createSignal<{ a: number; b: number; since: number } | null>(null);
  const [cand, setCand] = createSignal<{ key: string; since: number } | null>(null);
  const tick = window.setInterval(() => {
    if (previewFrozen()) return;
    const p = pick();
    const now = Date.now();
    const minMs = Math.max(3, Number(o().minSecs) || 8) * 1000;
    const c = cur();
    if (!p) {
      if (c && now - c.since > minMs) setCur(null);
      return;
    }
    const key = `${p.a.idx}-${p.b.idx}`;
    if (c && `${c.a}-${c.b}` === key) return;
    if (!c) return setCur({ a: p.a.idx, b: p.b.idx, since: now });
    const cd = cand();
    if (!cd || cd.key !== key) return setCand({ key, since: now });
    if (now - cd.since > 3000 && now - c.since > minMs) setCur({ a: p.a.idx, b: p.b.idx, since: now });
  }, 500);
  onCleanup(() => clearInterval(tick));

  const shown = createMemo<Battle | undefined>(() => {
    const c = cur();
    if (!c) return sample() || props.editing || !onScreen() ? pick() : undefined;
    const a = rows().find((r) => r.idx === c.a);
    const b = rows().find((r) => r.idx === c.b);
    if (!a || !b) return undefined;
    const byClass = o().classFilter === "class";
    return { a, b, gap: b.interval, pos: byClass ? a.classPos : a.pos };
  });

  // Fark geçmişi (son 30 sn) ve eğilim
  const [hist, setHist] = createSignal<number[]>([]);
  let histKey = "";
  createEffect(() => {
    const s = shown();
    if (!s) return;
    const key = `${s.a.idx}-${s.b.idx}`;
    if (key !== histKey) {
      histKey = key;
      setHist(sample() ? [0.9, 0.82, 0.78, 0.7, 0.66, 0.6, 0.55, 0.5, 0.47, 0.412] : []);
    }
  });
  const hv = window.setInterval(() => {
    const s = shown();
    if (!s || previewFrozen() || sample()) return;
    const g = s.b.interval;
    if (!(g > 0)) return;
    setHist((h) => [...h, g].slice(-30));
  }, 1000);
  onCleanup(() => clearInterval(hv));
  const trend = () => {
    const h = hist();
    if (h.length < 4) return 0;
    const d = h[h.length - 1] - h[Math.max(0, h.length - 6)];
    return Math.abs(d) < 0.04 ? 0 : d < 0 ? -1 : 1;
  };
  const graph = () => {
    const h = hist();
    if (h.length < 2) return "";
    const mx = Math.max(...h, 0.1);
    return h.map((v, i) => `${(i / (h.length - 1)) * 100},${28 - (v / mx) * 26}`).join(" ");
  };

  const title = () => {
    const s = shown();
    const t = String(o().title || "").trim() || "BATTLE FOR P{0}";
    return t.replace("{0}", String(s?.pos ?? "")).toUpperCase();
  };
  const scale = () => Math.max(0.5, Math.min(2, (Number(o().scale) || 100) / 100));

  const Driver = (p: { r: Row; side: "l" | "r" }) => {
    const nc = () => numberColors(p.r, "category");
    return (
      <div class={`tvb-drv ${p.side}`}>
        <span class="tv-pos tvb-pos">{o().classFilter === "class" ? p.r.classPos : p.r.pos}</span>
        <TvLogo carName={p.r.carName} class="tvb-logo" />
        <b class="tvb-name">{lastNameUpper(p.r.name, p.r.flair)}</b>
        <span class="tv-num tvb-num" style={{ background: nc().bg, color: nc().fg }}>
          {p.r.number}
        </span>
      </div>
    );
  };

  const visible = useTvVisible({ o, event: () => !!cur(), editing: () => !!props.editing, sample });

  return (
    <Show when={visible() && shown()}>
      {(s) => (
        <div class="tv tvb" style={{ "--tv-red": String(o().accent || "#d4151d"), zoom: String(scale()) }} data-no-i18n>
          <div class="tvb-title">
            <i class="tvb-swords">⚔</i>
            {title()}
          </div>
          <div class="tvb-main">
            <Driver r={s().a} side="l" />
            <div class="tvb-gap" classList={{ closing: trend() < 0, opening: trend() > 0 }}>
              <small>GAP</small>
              <b>{s().gap > 0 ? s().gap.toFixed(3) : "—"}</b>
              <span class="tvb-trend">{trend() < 0 ? "▼ CLOSING" : trend() > 0 ? "▲ OPENING" : "● STEADY"}</span>
            </div>
            <Driver r={s().b} side="r" />
          </div>
          <Show when={o().showGraph !== false && graph()}>
            <svg class="tvb-graph" viewBox="0 0 100 30" preserveAspectRatio="none">
              <polyline points={graph()} />
            </svg>
          </Show>
        </div>
      )}
    </Show>
  );
}
