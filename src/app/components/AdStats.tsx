// Reklam istatistikleri (Reklamlarım › İstatistik): özet kutuları (gösterim, tıklama, tıklama oranı, kalan),
// son 30 günün günlük gösterim ve tıklama grafikleri (aynı tarih ekseninde iki ayrı grafik: ölçekleri farklı) ve
// tablo görünümü. Bir güne gelince iki grafikte de o gün vurgulanır ve sayılar görünür.

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { adStats, type AdCampaign, type AdStatDay } from "@/cloud/ads";

const DAY = 86400_000;
const nf = (n: number) => Number(n || 0).toLocaleString(localeTag());
const pct = (c: number, v: number) => (v > 0 ? `%${((c / v) * 100).toLocaleString(localeTag(), { maximumFractionDigits: 2 })}` : "—");
/** Türkiye takvim günü (sunucu da günleri Türkiye saatiyle tutar) */
const trDay = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
const label = (iso: string, long = false) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString(localeTag(), long ? { weekday: "short", day: "numeric", month: "long" } : { day: "numeric", month: "short" });

export function AdStatsPanel(p: { ad: AdCampaign }) {
  const [rows] = createResource(() => p.ad.id, (id) => adStats(id).catch(() => [] as AdStatDay[]));
  const [hover, setHover] = createSignal<number | null>(null);
  const [table, setTable] = createSignal(false);

  // Son 30 gün (reklam daha yeniyse başladığı günden); boş günler 0
  const days = createMemo(() => {
    const by = new Map((rows() ?? []).map((r) => [r.day, r]));
    const endT = p.ad.ended_at ? new Date(p.ad.ended_at).getTime() : Date.now();
    const startT = new Date(p.ad.starts_at ?? p.ad.paid_at ?? p.ad.created_at).getTime();
    const from = Math.max(startT, endT - 29 * DAY);
    const out: AdStatDay[] = [];
    for (let t0 = from; trDay(new Date(t0)) <= trDay(new Date(endT)) && out.length < 31; t0 += DAY) {
      const d = trDay(new Date(t0));
      if (out.length && out[out.length - 1].day === d) continue;
      out.push(by.get(d) ?? { day: d, impressions: 0, clicks: 0 });
    }
    return out;
  });
  const sumV = () => (rows() ?? []).reduce((a, r) => a + r.impressions, 0);
  /** c130'dan önceki gösterimler gün dağılımına girmedi */
  const untracked = () => Math.max(0, p.ad.impressions - sumV());
  const remaining = () => {
    if (p.ad.status === "ended") return t("Bitti");
    if (p.ad.model === "impressions") return t("{0} gösterim", nf(Math.max(0, p.ad.quantity - p.ad.impressions)));
    if (!p.ad.ends_at) return t("{0} gün", p.ad.quantity);
    const ms = new Date(p.ad.ends_at).getTime() - Date.now();
    if (ms <= 0) return t("Bitti");
    return ms > DAY ? t("{0} gün", Math.ceil(ms / DAY)) : t("{0} saat", Math.ceil(ms / 3600_000));
  };
  const progress = () => {
    if (p.ad.model === "impressions") return Math.min(1, p.ad.impressions / Math.max(1, p.ad.quantity));
    if (!p.ad.starts_at || !p.ad.ends_at) return 0;
    const a = new Date(p.ad.starts_at).getTime();
    const b = new Date(p.ad.ends_at).getTime();
    return Math.min(1, Math.max(0, (Date.now() - a) / Math.max(1, b - a)));
  };
  const hv = () => (hover() != null ? days()[hover()!] : null);

  return (
    <div class="ast">
      <div class="ast-tiles">
        <div>
          <small>{t("Gösterim")}</small>
          <b>{nf(p.ad.impressions)}</b>
        </div>
        <div>
          <small>{t("Tıklama")}</small>
          <b>{nf(p.ad.clicks)}</b>
        </div>
        <div>
          <small>{t("Tıklama oranı")}</small>
          <b>{pct(p.ad.clicks, p.ad.impressions)}</b>
        </div>
        <div>
          <small>{t("Kalan")}</small>
          <b>{remaining()}</b>
          <i class="ast-bar">
            <i style={{ width: `${progress() * 100}%` }} />
          </i>
        </div>
      </div>

      <div class="ast-head">
        <b>{t("Son {0} gün", days().length)}</b>
        <div class="ast-hv" aria-live="polite">
          <Show when={hv()} fallback={<small class="muted">{t("Bir güne gel: o günün sayıları")}</small>}>
            {(d) => (
              <small>
                <b>{label(d().day, true)}</b> · {t("{0} gösterim", nf(d().impressions))} · {t("{0} tıklama", nf(d().clicks))} · {pct(d().clicks, d().impressions)}
              </small>
            )}
          </Show>
        </div>
        <button class="btn ghost small" onClick={() => setTable(!table())}>
          {table() ? t("Grafik") : t("Tablo")}
        </button>
      </div>

      <Show when={!rows.loading} fallback={<p class="muted small">{t("Yükleniyor…")}</p>}>
        <Show
          when={!table()}
          fallback={
            <div class="ast-table">
              <div class="ast-tr head">
                <span>{t("Gün")}</span>
                <span>{t("Gösterim")}</span>
                <span>{t("Tıklama")}</span>
                <span>{t("Oran")}</span>
              </div>
              <For each={[...days()].reverse()}>
                {(d) => (
                  <div class="ast-tr">
                    <span>{label(d.day, true)}</span>
                    <span>{nf(d.impressions)}</span>
                    <span>{nf(d.clicks)}</span>
                    <span>{pct(d.clicks, d.impressions)}</span>
                  </div>
                )}
              </For>
            </div>
          }
        >
          <Bars title={t("Günlük gösterim")} days={days()} pick={(d) => d.impressions} hover={hover()} setHover={setHover} />
          <Bars title={t("Günlük tıklama")} days={days()} pick={(d) => d.clicks} hover={hover()} setHover={setHover} axis />
        </Show>
      </Show>
      <Show when={untracked() > 0}>
        <small class="muted">{t("{0} gösterim, günlük sayım başlamadan önce yapıldı; yalnızca toplamda görünür.", nf(untracked()))}</small>
      </Show>
    </div>
  );
}

/** Tek ölçülü günlük çubuk grafik (SVG). Çubukların üstü yuvarlak, aralarında boşluk; üzerine gelince gün vurgulanır. */
function Bars(p: { title: string; days: AdStatDay[]; pick: (d: AdStatDay) => number; hover: number | null; setHover: (i: number | null) => void; axis?: boolean }) {
  const W = 600;
  const H = 96;
  const max = () => Math.max(1, ...p.days.map(p.pick));
  // Okunur üst sınır: 1, 2, 5 × 10^n
  const top = () => {
    const m = max();
    const e = Math.pow(10, Math.floor(Math.log10(m)));
    return [1, 2, 5, 10].map((k) => k * e).find((v) => v >= m) ?? m;
  };
  const n = () => Math.max(1, p.days.length);
  const slot = () => W / n();
  const gap = () => Math.min(2, slot() * 0.25);
  const bar = (i: number) => {
    const v = p.pick(p.days[i]);
    const h = v > 0 ? Math.max(2, (v / top()) * (H - 4)) : 0;
    const x = i * slot() + gap() / 2;
    const w = Math.max(1, slot() - gap());
    const r = Math.min(4, w / 2, h);
    const y = H - h;
    // Üst köşeler yuvarlak, taban düz
    return h > 0 ? `M${x},${H}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${H}Z` : "";
  };
  const ticks = () => {
    const l = p.days.length;
    return l ? [...new Set([0, Math.floor((l - 1) / 2), l - 1])] : [];
  };
  return (
    <div class="ast-chart">
      <div class="ast-ct">
        <small>{p.title}</small>
        <small class="muted">
          {t("en çok")} {nf(top())}
        </small>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" class="ast-svg" role="img" aria-label={p.title} onPointerLeave={() => p.setHover(null)}>
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} class="ast-grid" />
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} class="ast-base" />
        <For each={p.days}>
          {(_, i) => (
            <>
              <path d={bar(i())} class="ast-b" classList={{ on: p.hover === i(), dim: p.hover != null && p.hover !== i() }} />
              {/* Çubuktan geniş tıklama / üzerine gelme alanı */}
              <rect x={i() * slot()} y="0" width={slot()} height={H} fill="transparent" onPointerEnter={() => p.setHover(i())} />
            </>
          )}
        </For>
      </svg>
      <Show when={p.axis}>
        <div class="ast-x">
          <For each={ticks()}>
            {(k) => (
              <small style={{ left: `${((k + 0.5) / n()) * 100}%` }} classList={{ first: k === 0, last: k === p.days.length - 1 && k !== 0 }}>
                {label(p.days[k].day)}
              </small>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
