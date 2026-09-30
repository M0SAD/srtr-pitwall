// Topluluk sayfalarının ortak parçaları: üst tanıtım şeridi, filtre çubuğu ve paneli,
// etkin filtre etiketleri, iskelet kartlar, boş durum, göreli tarih.

import "../community.css";
import { For, Show, createEffect, createSignal, on, onCleanup, type JSX } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import CircleX from "lucide-solid/icons/circle-x";
import * as I from "../icons";

/** Değer yazıldıktan kısa süre sonra güncellenen kopya */
export function debounced<T>(src: () => T, ms = 300) {
  const [v, setV] = createSignal<T>(src());
  let timer: number | undefined;
  createEffect(
    on(src, (x) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setV(() => x), ms);
    }, { defer: true }),
  );
  onCleanup(() => clearTimeout(timer));
  return v;
}

/** Tarayıcıda saklanan küçük tercih (panel açık mı vb.) */
export function stored<T>(key: string, init: T) {
  let first = init;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const j = JSON.parse(raw);
      first = (init && typeof init === "object" && !Array.isArray(init) ? { ...init, ...j } : j) as T;
    }
  } catch {
    /* yok */
  }
  const [v, setV] = createSignal<T>(first);
  createEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v()));
    } catch {
      /* yok */
    }
  });
  return [v, setV] as const;
}

export function relTime(iso: string) {
  const d = new Date(iso).getTime();
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return "az önce";
  if (s < 3600) return t("{0} dk önce", Math.floor(s / 60));
  if (s < 86400) return t("{0} sa önce", Math.floor(s / 3600));
  const days = Math.floor(s / 86400);
  if (days < 7) return t("{0} gün önce", days);
  if (days < 30) return t("{0} hafta önce", Math.floor(days / 7));
  return new Date(iso).toLocaleDateString(localeTag(), { day: "numeric", month: "short", year: "numeric" });
}

export function compact(n: number | undefined) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 10_000) return Math.round(v / 1000) + "k";
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(v);
}

/** Yazar rozeti: baş harf + ad */
export function Author(p: { name?: string | null; iracing?: string | null; onClick?: () => void }) {
  const initial = () => (p.name || "?").trim().charAt(0).toUpperCase() || "?";
  const hue = () => [...(p.name || "?")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      class="cx-author"
      classList={{ clickable: !!p.onClick }}
      title={p.onClick ? "Bu kullanıcının paylaşımları" : undefined}
      onClick={(e) => {
        if (!p.onClick) return;
        e.stopPropagation();
        p.onClick();
      }}
    >
      <i style={{ background: `hsl(${hue()} 45% 32%)` }} data-no-i18n>
        {initial()}
      </i>
      <span data-no-i18n>{p.name || "?"}</span>
      <Show when={p.iracing && p.iracing !== p.name}>
        <small data-no-i18n>{p.iracing}</small>
      </Show>
    </span>
  );
}

export interface HeroStat {
  n?: number;
  label: string;
}

export function Hero(p: { icon: JSX.Element; kicker?: string; title: string; sub: string; stats?: HeroStat[]; actions?: JSX.Element }) {
  return (
    <section class="cx-hero">
      <div class="cx-hero-ic">{p.icon}</div>
      <div class="cx-hero-txt">
        <Show when={p.kicker}>
          <span class="cx-kicker">{p.kicker}</span>
        </Show>
        <h2>{p.title}</h2>
        <p>{p.sub}</p>
      </div>
      <Show when={p.stats?.length}>
        <div class="cx-hero-stats">
          <For each={p.stats}>
            {(s) => (
              <div>
                <b data-no-i18n>{s.n === undefined ? "—" : compact(s.n)}</b>
                <small>{s.label}</small>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={p.actions}>
        <div class="cx-hero-act">{p.actions}</div>
      </Show>
    </section>
  );
}

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon?: JSX.Element;
}

export function Tabs<T extends string>(p: { tabs: TabDef<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div class="cx-tabs" role="tablist">
      <For each={p.tabs}>
        {(tb) => (
          <button role="tab" classList={{ on: p.value === tb.id }} onClick={() => p.onChange(tb.id)}>
            {tb.icon}
            {tb.label}
          </button>
        )}
      </For>
    </div>
  );
}

export interface ActiveChip {
  label: string;
  value: string;
  clear: () => void;
  /** Değer kullanıcı içeriği (çevrilmez) */
  raw?: boolean;
}

/** Arama + sıralama + filtre düğmesi; açılır panel ve etkin filtre etiketleri */
export function FilterBar(p: {
  tabs?: JSX.Element;
  q: string;
  onQ: (v: string) => void;
  placeholder: string;
  sort: string;
  sorts: { id: string; label: string }[];
  onSort: (v: string) => void;
  open: boolean;
  onToggle: () => void;
  chips: ActiveChip[];
  onClear: () => void;
  count?: number;
  loading?: boolean;
  children?: JSX.Element;
  hideFilters?: boolean;
}) {
  return (
    <section class="cx-filters" classList={{ open: p.open && !p.hideFilters }}>
      <div class="cx-fbar">
        {p.tabs}
        <label class="cx-search">
          <I.Search />
          <input placeholder={p.placeholder} value={p.q} onInput={(e) => p.onQ(e.currentTarget.value)} />
          <Show when={p.q}>
            <button class="cx-x" title="Temizle" onClick={() => p.onQ("")}>
              <I.X />
            </button>
          </Show>
        </label>
        <label class="cx-sort">
          <span>Sırala</span>
          <select value={p.sort} onChange={(e) => p.onSort(e.currentTarget.value)}>
            <For each={p.sorts}>{(s) => <option value={s.id}>{s.label}</option>}</For>
          </select>
          <I.ChevronDown />
        </label>
        <Show when={!p.hideFilters}>
          <button class="cx-ftoggle" classList={{ on: p.open, has: p.chips.length > 0 }} onClick={p.onToggle}>
            <SlidersHorizontal />
            <span>Filtreler</span>
            <Show when={p.chips.length > 0}>
              <i data-no-i18n>{p.chips.length}</i>
            </Show>
          </button>
        </Show>
      </div>
      <Show when={p.open && !p.hideFilters}>
        <div class="cx-fpanel">{p.children}</div>
      </Show>
      <Show when={p.chips.length > 0 || p.count !== undefined}>
        <div class="cx-active">
          <Show when={p.count !== undefined}>
            <span class="cx-count" classList={{ busy: !!p.loading }}>
              {p.loading ? "Yükleniyor…" : t("{0} sonuç", p.count)}
            </span>
          </Show>
          <For each={p.chips}>
            {(c) => (
              <button class="cx-chip" onClick={c.clear} title="Filtreyi kaldır">
                <span>{c.label}:</span>
                <b data-no-i18n={c.raw ? "" : undefined}>{c.value}</b>
                <CircleX />
              </button>
            )}
          </For>
          <Show when={p.chips.length > 0}>
            <button class="cx-clear" onClick={p.onClear}>
              Tümünü temizle
            </button>
          </Show>
        </div>
      </Show>
    </section>
  );
}

/** Filtre panelinde başlıklı grup */
export function FGroup(p: { label: string; hint?: string; wide?: boolean; children: JSX.Element }) {
  return (
    <div class="cx-fgroup" classList={{ wide: !!p.wide }}>
      <span class="cx-flabel">
        {p.label}
        <Show when={p.hint}>
          <small>{p.hint}</small>
        </Show>
      </span>
      {p.children}
    </div>
  );
}

/** Tek seçimli hap düğmeler */
export function Pills<T extends string | number>(p: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="cx-pills">
      <For each={p.options}>
        {(o) => (
          <button classList={{ on: p.value === o.id }} onClick={() => p.onChange(o.id)}>
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

export function Toggle(p: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label class="cx-toggle">
      <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.currentTarget.checked)} />
      <i />
      <span>{p.label}</span>
    </label>
  );
}

/** Yıldız eşiği seçici (0 = hepsi) */
export function MinStars(p: { value: number; onChange: (v: number) => void }) {
  return (
    <div class="cx-minstars">
      <For each={[1, 2, 3, 4, 5]}>
        {(n) => (
          <button classList={{ on: n <= p.value }} title={t("{0} yıldız ve üzeri", n)} onClick={() => p.onChange(p.value === n ? 0 : n)}>
            ★
          </button>
        )}
      </For>
      <small>{p.value ? t("{0}+ yıldız", p.value) : "Hepsi"}</small>
    </div>
  );
}

export function Range(p: { min?: number; max?: number; onMin: (v: number) => void; onMax: (v: number) => void; unit?: string }) {
  return (
    <div class="cx-range">
      <input type="number" min="0" placeholder="en az" value={p.min || ""} onChange={(e) => p.onMin(Math.max(0, Number(e.currentTarget.value) || 0))} />
      <span>–</span>
      <input type="number" min="0" placeholder="en çok" value={p.max || ""} onChange={(e) => p.onMax(Math.max(0, Number(e.currentTarget.value) || 0))} />
      <Show when={p.unit}>
        <small>{p.unit}</small>
      </Show>
    </div>
  );
}

export function Select(p: { value: string; onChange: (v: string) => void; options: { id: string; label: string; raw?: boolean }[]; all: string }) {
  return (
    <label class="cx-select">
      <select value={p.value} onChange={(e) => p.onChange(e.currentTarget.value)}>
        <option value="">{p.all}</option>
        <For each={p.options}>
          {(o) => (
            <option value={o.id} data-no-i18n={o.raw ? "" : undefined}>
              {o.label}
            </option>
          )}
        </For>
      </select>
      <I.ChevronDown />
    </label>
  );
}

export function TextFilter(p: { value: string; onChange: (v: string) => void; placeholder: string; list?: string; options?: string[] }) {
  const id = p.list ?? `cxl-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <>
      <input class="cx-text" placeholder={p.placeholder} value={p.value} list={p.options ? id : undefined} onChange={(e) => p.onChange(e.currentTarget.value.trim())} />
      <Show when={p.options}>
        <datalist id={id}>
          <For each={p.options}>{(o) => <option value={o} />}</For>
        </datalist>
      </Show>
    </>
  );
}

export function SkeletonGrid(p: { n?: number; kind?: "layout" | "shot" | "theme"; class?: string }) {
  return (
    <div class={p.class ?? "cx-grid"}>
      <For each={Array.from({ length: p.n ?? 8 })}>
        {() => (
          <div class="cx-card cx-skel" classList={{ theme: p.kind === "theme" }}>
            <div class="cx-cover" />
            <div class="cx-body">
              <span class="sk w70" />
              <span class="sk w45" />
              <span class="sk w90" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

export function EmptyState(p: { icon?: JSX.Element; title: string; hint?: string; action?: JSX.Element }) {
  return (
    <div class="cx-empty">
      <div class="cx-empty-ic">{p.icon ?? <I.Search />}</div>
      <b>{p.title}</b>
      <Show when={p.hint}>
        <p>{p.hint}</p>
      </Show>
      {p.action}
    </div>
  );
}

export function LoadMore(p: { show: boolean; loading: boolean; onClick: () => void }) {
  return (
    <Show when={p.show}>
      <div class="cx-more">
        <button class="btn" disabled={p.loading} onClick={p.onClick}>
          {p.loading ? "Yükleniyor…" : "Daha fazla göster"}
        </button>
      </div>
    </Show>
  );
}

export const PERIODS: { id: number; label: string }[] = [
  { id: 0, label: "Tümü" },
  { id: 1, label: "24 saat" },
  { id: 7, label: "Bu hafta" },
  { id: 30, label: "Bu ay" },
  { id: 365, label: "Bu yıl" },
];

export const periodLabel = (d: number) => PERIODS.find((x) => x.id === d)?.label ?? t("{0} gün", d);
