// Topluluk temaları: PRO üyeler kendi düzenledikleri temayı paylaşır ve başkalarının temalarını kullanır.
// Kullanılan tema Ayarlar > Görünüm'de hazır temaların yanında görünür.

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { cloudEnabled, session } from "@/cloud/supabase";
import { isPro } from "@/cloud/account";
import { can } from "@/cloud/moderation";
import { communityStats, deleteTheme, queryThemes, shareTheme, themeDownloaded, type SharedTheme, type ThemeSortX } from "@/cloud/community";
import { settings, updateSettings } from "@/sdk/settings";
import { DEFAULT_THEME, FONTS, fontStack, normalizeTheme, type Theme } from "@/sdk/theme";
import { ThemeSwatches } from "../components/SharedLayoutPreview";
import { Author, EmptyState, FGroup, FilterBar, Hero, LoadMore, PERIODS, Pills, Select, SkeletonGrid, Tabs, TextFilter, compact, debounced, periodLabel, relTime, stored, type ActiveChip } from "./CommunityKit";
import { LoginWall, ProGate } from "./CommunityPage";
import { go } from "../ui";
import * as I from "../icons";

/** Temayı indirilenlere ekler ve uygular (boyut ve opaklık kullanıcının kendi ayarında kalır) */
export function applySharedTheme(t: { id: string; name: string; author: string; theme: Theme }, count = true) {
  const had = settings().savedThemes.some((x) => x.id === t.id);
  updateSettings((d) => {
    const th = normalizeTheme(t.theme);
    if (!d.savedThemes.some((x) => x.id === t.id)) d.savedThemes.push({ id: t.id, name: t.name, author: t.author, theme: th });
    d.theme = { ...th, scale: d.theme.scale, opacity: d.theme.opacity, combineLicense: d.theme.combineLicense };
  });
  if (count && !had) themeDownloaded(t.id);
}

/** Temanın küçük görünümü (hazır tema kutucuğuyla aynı) */
export function ThemeSwatch(p: { theme: Theme }) {
  const t = () => ({ ...DEFAULT_THEME, ...p.theme });
  return (
    <div class="preset-swatch" style={{ background: t().bg, color: t().text, "border-radius": `${Math.min(t().radius, 10)}px` }}>
      <span style={{ background: t().accent }} />
      <span style={{ background: t().positive }} />
      <span style={{ background: t().negative }} />
      <b>Aa</b>
    </div>
  );
}

const hexA = (hex: string, a: number) => {
  const h = (hex || "#000").replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(f, 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** Temanın küçük bir sıralama overlay'i gibi görünümü */
export function ThemeMock(p: { theme: Theme }) {
  const th = () => ({ ...DEFAULT_THEME, ...p.theme });
  const rows = [
    { pos: 1, name: "M. Verstappen", gap: "Lider", c: "best" },
    { pos: 2, name: "L. Norris", gap: "+1.284", c: "positive" },
    { pos: 3, name: "C. Leclerc", gap: "+3.910", c: "me" },
    { pos: 4, name: "G. Russell", gap: "+7.052", c: "negative" },
  ] as const;
  return (
    <div
      class="cx-tmock"
      style={{
        background: hexA(th().bg, Math.max(0.55, th().bgOpacity / 100)),
        color: th().text,
        "border-radius": `${Math.min(th().radius, 14)}px`,
        border: th().border ? `1px solid ${hexA(th().borderColor, Math.max(0.3, th().borderOpacity / 100))}` : "1px solid transparent",
        "font-family": fontStack(th().font),
        "font-weight": th().weight || (th().bold ? 700 : 500),
        "text-shadow": th().textShadow ? "0 1px 2px rgba(0,0,0,.8)" : "none",
      }}
      data-no-i18n
    >
      <div class="cx-tmock-head" style={{ color: th().dim }}>
        <span>LAP 12/30</span>
        <b style={{ color: th().accent }}>P3</b>
      </div>
      <For each={rows}>
        {(r) => (
          <div
            class="cx-tmock-row"
            style={
              r.c === "me"
                ? { background: hexA(th().highlight, Math.max(0.18, th().highlightOpacity / 100)), "border-radius": `${Math.min(th().radius, 6)}px` }
                : undefined
            }
          >
            <i style={{ background: r.pos === 1 ? th().accent : "transparent", color: r.pos === 1 ? th().bg : th().dim }}>{r.pos}</i>
            <span>{r.name}</span>
            <b style={{ color: r.c === "best" ? th().best : r.c === "positive" ? th().positive : r.c === "negative" ? th().negative : th().text }}>{r.gap}</b>
          </div>
        )}
      </For>
    </div>
  );
}

const fontLabel = (id: string) => FONTS.find((f) => f.value === id)?.label.replace(/ \(.*\)$/, "") ?? id;
const DENSITY: Record<string, string> = { compact: "Sıkı", normal: "Normal", comfortable: "Ferah" };

export function ThemeCard(p: { t: SharedTheme; compact?: boolean; onChanged?: () => void; onAuthor?: (n: string) => void }) {
  const [msg, setMsg] = createSignal("");
  const mine = () => session()?.user.id === p.t.user_id;
  const saved = () => settings().savedThemes.some((x) => x.id === p.t.id);
  const th = () => ({ ...DEFAULT_THEME, ...p.t.theme });
  const dots = () => [th().accent, th().text, th().positive, th().negative, th().best, th().warning, th().info];
  return (
    <div class="cx-card theme" classList={{ compact: !!p.compact, saved: saved() }}>
      <div
        class="cx-cover"
        style={{
          background: `radial-gradient(120% 90% at 20% 0%, ${hexA(th().accent, 0.28)}, transparent 60%), linear-gradient(160deg, #1b2029, #0c0e12)`,
        }}
      >
        <ThemeMock theme={p.t.theme} />
        <Show when={saved()}>
          <div class="cx-badges">
            <span class="lt-sp" />
            <i class="cx-new ok">
              <I.Check /> Kullanılıyor
            </i>
          </div>
        </Show>
      </div>
      <div class="cx-body">
        <b class="cx-title" data-no-i18n title={p.t.name}>
          {p.t.name}
        </b>
        <div class="cx-byline">
          <Author name={p.t.author_name} onClick={p.onAuthor ? () => p.onAuthor!(p.t.author_name) : undefined} />
          <small class="cx-date">{relTime(p.t.created_at)}</small>
        </div>
        <Show when={!p.compact && p.t.description}>
          <p class="cx-desc" data-no-i18n>
            {p.t.description}
          </p>
        </Show>
        <div class="cx-dots" title="Renkler">
          <For each={dots()}>{(c) => <i style={{ background: c }} />}</For>
        </div>
        <Show when={!p.compact}>
          <div class="cx-tags">
            <span class="cx-tag" data-no-i18n>
              {fontLabel(th().font)}
            </span>
            <span class="cx-tag">{DENSITY[th().density] ?? th().density}</span>
            <span class="cx-tag">{th().radius ? "Yuvarlak köşe" : "Keskin köşe"}</span>
            <Show when={th().border}>
              <span class="cx-tag">Kenarlıklı</span>
            </Show>
          </div>
        </Show>
        <div class="cx-actions">
          <span class="cx-dl" title="İndirme">
            <I.Download /> {compact(p.t.downloads)}
          </span>
          <span class="lt-sp" />
          <Show when={!p.compact && (mine() || can("layouts.delete"))}>
            <button
              class="btn ghost small danger"
              title="Sil"
              onClick={async () => {
                if (!confirm("Bu tema paylaşımı silinsin mi?")) return;
                await deleteTheme(p.t.id).catch((e) => setMsg(String(e.message)));
                p.onChanged?.();
              }}
            >
              <I.Trash />
            </button>
          </Show>
          <ProGate label="PRO">
            <button
              class="btn small"
              classList={{ primary: !saved() }}
              onClick={() => {
                applySharedTheme({ id: p.t.id, name: p.t.name, author: p.t.author_name, theme: p.t.theme });
                setMsg("Tema uygulandı ve Görünüm'e eklendi.");
              }}
            >
              <Show when={saved()} fallback={<><I.Download /> Kullan</>}>
                <I.Check /> Uygula
              </Show>
            </button>
          </ProGate>
        </div>
        <Show when={msg()}>
          <small class="success">{msg()}</small>
        </Show>
      </div>
    </div>
  );
}

type TTab = "all" | "mine" | "used";

interface TFilters {
  sort: ThemeSortX;
  days: number;
  author: string;
  font: string;
  density: "" | "compact" | "normal" | "comfortable";
  corners: "" | "sharp" | "round";
  border: "" | "yes" | "no";
  shadow: "" | "yes" | "no";
  minDownloads: number;
}
const T_DEFAULT: TFilters = { sort: "downloads", days: 0, author: "", font: "", density: "", corners: "", border: "", shadow: "", minDownloads: 0 };
const YESNO = [
  { id: "" as const, label: "Hepsi" },
  { id: "yes" as const, label: "Var" },
  { id: "no" as const, label: "Yok" },
];

export function CommunityThemes() {
  const [q, setQ] = createSignal("");
  const dq = debounced(q);
  const [f, setF] = stored<TFilters>("pitwall.cx.themes.filters", T_DEFAULT);
  const [panel, setPanel] = stored<boolean>("pitwall.cx.themes.panel", false);
  const set = <K extends keyof TFilters>(k: K, v: TFilters[K]) => setF({ ...f(), [k]: v });
  const [tab, setTab] = createSignal<TTab>("all");
  const [version, setVersion] = createSignal(0);
  const [sharing, setSharing] = createSignal(false);
  const PAGE = 36;
  const sig = createMemo(() => JSON.stringify([dq(), f(), tab()]));
  const [pageState, setPageState] = createSignal({ sig: "", n: 1 });
  const pages = () => (pageState().sig === sig() ? pageState().n : 1);

  const [stats] = createResource(() => (session() ? 1 : null), () => communityStats().catch(() => undefined));
  const [list] = createResource(
    () => (session() ? { q: dq(), f: f(), tab: tab(), v: version(), p: pages() } : null),
    (k) =>
      queryThemes(
        {
          ...k.f,
          q: k.q,
          userId: k.tab === "mine" ? session()?.user.id : undefined,
          ids: k.tab === "used" ? settings().savedThemes.map((x) => x.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id)) : undefined,
        },
        0,
        PAGE * k.p,
      ),
  );
  const items = () => list.latest ?? [];
  const hasMore = () => (list.latest?.length ?? 0) >= PAGE * pages();

  const chips = createMemo(() => {
    const x = f();
    const c: ActiveChip[] = [];
    const clr = (k: keyof TFilters) => () => set(k, T_DEFAULT[k] as never);
    const yn = (v: string) => (v === "yes" ? "Var" : "Yok");
    if (x.days) c.push({ label: "Tarih", value: periodLabel(x.days), clear: clr("days") });
    if (x.author) c.push({ label: "Kullanıcı", value: x.author, raw: true, clear: clr("author") });
    if (x.font) c.push({ label: "Yazı tipi", value: fontLabel(x.font), raw: true, clear: clr("font") });
    if (x.density) c.push({ label: "Yoğunluk", value: DENSITY[x.density], clear: clr("density") });
    if (x.corners) c.push({ label: "Köşeler", value: x.corners === "sharp" ? "Keskin" : "Yuvarlak", clear: clr("corners") });
    if (x.border) c.push({ label: "Kenarlık", value: yn(x.border), clear: clr("border") });
    if (x.shadow) c.push({ label: "Yazı gölgesi", value: yn(x.shadow), clear: clr("shadow") });
    if (x.minDownloads) c.push({ label: "İndirme", value: `≥ ${x.minDownloads}`, raw: true, clear: clr("minDownloads") });
    return c;
  });
  const clearAll = () => {
    setF({ ...T_DEFAULT, sort: f().sort });
    setQ("");
  };

  if (!cloudEnabled) return <LoginWall what="Topluluk temaları" />;

  return (
    <Show when={session()} fallback={<LoginWall what="Topluluk temaları" />}>
      <div class="page cx-page">
        <Hero
          icon={<I.Palette />}
          kicker="Topluluk"
          title="Temalar"
          sub="Renkler, yazı tipi, köşe ve yoğunluk ayarları. Beğendiğin temayı tek tıkla uygula; Ayarlar › Görünüm'de hazır temaların yanında durur."
          stats={[
            { n: stats()?.themes, label: "Tema" },
            { n: stats()?.members, label: "Üye" },
          ]}
          actions={
            <ProGate label="PRO ile paylaş">
              <button class="btn primary" onClick={() => setSharing(true)}>
                <I.Share2 /> Temamı paylaş
              </button>
            </ProGate>
          }
        />

        <FilterBar
          tabs={
            <Tabs<TTab>
              value={tab()}
              onChange={setTab}
              tabs={[
                { id: "all", label: "Keşfet" },
                { id: "mine", label: "Paylaştıklarım" },
                { id: "used", label: "Kullandıklarım" },
              ]}
            />
          }
          q={q()}
          onQ={setQ}
          placeholder="Tema adı, açıklama ya da kullanıcı ara"
          sort={f().sort}
          sorts={[
            { id: "downloads", label: "En çok kullanılan" },
            { id: "new", label: "En yeni" },
            { id: "old", label: "En eski" },
            { id: "name", label: "Ada göre (A-Z)" },
          ]}
          onSort={(v) => set("sort", v as ThemeSortX)}
          open={panel()}
          onToggle={() => setPanel(!panel())}
          chips={chips()}
          onClear={clearAll}
          count={items().length}
          loading={list.loading}
        >
          <FGroup label="Paylaşım tarihi">
            <Pills value={f().days} options={PERIODS} onChange={(v) => set("days", v)} />
          </FGroup>
          <FGroup label="Yazı tipi">
            <Select value={f().font} onChange={(v) => set("font", v)} all="Tüm yazı tipleri" options={FONTS.map((x) => ({ id: x.value, label: x.label, raw: true }))} />
          </FGroup>
          <FGroup label="Yoğunluk">
            <Pills
              value={f().density}
              options={[
                { id: "", label: "Hepsi" },
                { id: "compact", label: "Sıkı" },
                { id: "normal", label: "Normal" },
                { id: "comfortable", label: "Ferah" },
              ]}
              onChange={(v) => set("density", v)}
            />
          </FGroup>
          <FGroup label="Köşeler">
            <Pills
              value={f().corners}
              options={[
                { id: "", label: "Hepsi" },
                { id: "sharp", label: "Keskin" },
                { id: "round", label: "Yuvarlak" },
              ]}
              onChange={(v) => set("corners", v)}
            />
          </FGroup>
          <FGroup label="Kenarlık">
            <Pills value={f().border} options={YESNO} onChange={(v) => set("border", v)} />
          </FGroup>
          <FGroup label="Yazı gölgesi">
            <Pills value={f().shadow} options={YESNO} onChange={(v) => set("shadow", v)} />
          </FGroup>
          <FGroup label="En az indirme">
            <Pills
              value={f().minDownloads}
              options={[
                { id: 0, label: "Hepsi" },
                { id: 10, label: "10+" },
                { id: 50, label: "50+" },
                { id: 100, label: "100+" },
              ]}
              onChange={(v) => set("minDownloads", v)}
            />
          </FGroup>
          <FGroup label="Kullanıcı">
            <TextFilter value={f().author} onChange={(v) => set("author", v)} placeholder="Görünen ad" />
          </FGroup>
        </FilterBar>

        <Show when={list.error}>
          <p class="error">{String(list.error?.message ?? list.error)}</p>
        </Show>
        <Show when={list.latest || !list.loading} fallback={<SkeletonGrid n={8} kind="theme" class="cx-grid themes" />}>
          <Show
            when={items().length > 0}
            fallback={
              <Show when={!list.loading && !list.error}>
                <EmptyState
                  icon={<I.Palette />}
                  title={tab() === "mine" ? "Henüz tema paylaşmadın." : tab() === "used" ? "Henüz topluluktan tema kullanmadın." : "Bu filtrelere uyan tema yok."}
                  hint={tab() === "all" ? "Filtreleri gevşetmeyi ya da aramayı değiştirmeyi dene." : undefined}
                  action={
                    <Show when={chips().length > 0 || q()}>
                      <button class="btn" onClick={clearAll}>
                        Filtreleri temizle
                      </button>
                    </Show>
                  }
                />
              </Show>
            }
          >
            <div class="cx-grid themes" classList={{ busy: list.loading }}>
              <For each={items()}>
                {(x) => <ThemeCard t={x} onChanged={() => setVersion(version() + 1)} onAuthor={(n) => (setTab("all"), set("author", n), setPanel(true))} />}
              </For>
            </div>
            <LoadMore show={hasMore()} loading={list.loading} onClick={() => setPageState({ sig: sig(), n: pages() + 1 })} />
          </Show>
        </Show>
        <Show when={sharing()}>
          <ShareThemeDialog
            onClose={() => setSharing(false)}
            onShared={() => {
              setSharing(false);
              setTab("mine");
              setVersion(version() + 1);
            }}
          />
        </Show>
      </div>
    </Show>
  );
}

/** Şu anki temayı toplulukta paylaş (PRO) */
export function ShareThemeDialog(props: { onClose: () => void; onShared: () => void }) {
  const [name, setName] = createSignal("");
  const [desc, setDesc] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const submit = async () => {
    setErr("");
    if (!name().trim()) return setErr("Bir ad yaz.");
    setBusy(true);
    try {
      await shareTheme({ name: name().trim().slice(0, 40), description: desc().trim().slice(0, 500), theme: settings().theme });
      props.onShared();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal cm-detail">
        <header>
          <h3>Temamı toplulukta paylaş</h3>
          <button class="btn ghost small" onClick={props.onClose}>
            Vazgeç
          </button>
        </header>
        <Show when={session()} fallback={<p class="muted">Paylaşmak için giriş yapmalısın.</p>}>
          <Show
            when={isPro()}
            fallback={
              <p class="muted">
                Tema paylaşmak PRO özelliğidir.{" "}
                <button class="link" onClick={() => go("pro")}>
                  PRO'ya geç
                </button>
              </p>
            }
          >
            <div class="th-share-prev" style={{ background: settings().theme.bg }}>
              <ThemeSwatch theme={settings().theme} />
            </div>
            <ThemeSwatches theme={settings().theme} />
            <div class="row">
              <b>Ad</b>
              <input class="input admin-wide" maxLength={40} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
            </div>
            <textarea class="input cm-textarea" rows={3} maxLength={500} placeholder="Açıklama (isteğe bağlı)" value={desc()} onInput={(e) => setDesc(e.currentTarget.value)} />
            <p class="muted small">Renkler, yazı tipi, köşe ve yoğunluk ayarların paylaşılır. Boyut ve opaklık kullananın kendi ayarında kalır.</p>
            <Show when={err()}>
              <p class="error">{err()}</p>
            </Show>
            <button class="btn primary" disabled={busy()} onClick={submit}>
              {busy() ? "Paylaşılıyor…" : "Paylaş"}
            </button>
          </Show>
        </Show>
      </div>
    </div>
  );
}
