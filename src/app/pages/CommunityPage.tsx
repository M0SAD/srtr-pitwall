// Topluluk: paylaşılan overlay düzenleri. Ara, önizle, profil olarak indir, puan ver, yorum yaz.

import { localeTag, t } from "@/sdk/i18n";
import { For, Show, createEffect, createMemo, createResource, createSignal, onMount } from "solid-js";
import { independentProfile } from "@/sdk/streamLink";
import { findMyShare, updateSharedLayout } from "@/cloud/layouts";
import { invoke } from "@tauri-apps/api/core";
import { cloudEnabled, session } from "@/cloud/supabase";
import { isLocked, isPro, profile } from "@/cloud/account";
import { proLocked } from "@/sdk/proFeatures";
import { manifestById } from "@/sdk/registry";
import { useSnapshot } from "@/sdk/telemetry";
import { SharedLayoutPreview, ThemeSwatches } from "../components/SharedLayoutPreview";
import { newLayout } from "./LayoutsPage";
import { can } from "@/cloud/moderation";
import { CommentList, ReportDialog } from "../components/Moderation";
import * as I from "../icons";
import {
  addComment,
  comments,
  deleteComment,
  deleteLayout,
  editComment,
  getLayoutData,
  layoutBoxes,
  markDownloaded,
  myRating,
  rate,
  layoutCars,
  myRatedLayoutIds,
  queryLayouts,
  shareLayout,
  ASPECT_RES,
  type Aspect,
  type LayoutBox,
  type LayoutSort,
  type LayoutSummary,
  type ResTier,
} from "@/cloud/layouts";
import { communityStats } from "@/cloud/community";
import {
  Author,
  EmptyState,
  FGroup,
  FilterBar,
  Hero,
  LoadMore,
  MinStars,
  PERIODS,
  Pills,
  Range,
  Select,
  SkeletonGrid,
  Tabs,
  TextFilter,
  Toggle,
  compact,
  debounced,
  periodLabel,
  relTime,
  stored,
  type ActiveChip,
} from "./CommunityKit";
import { activeProfile, settings, updateSettings, type Profile } from "@/sdk/settings";
import { inTauri } from "@/sdk/platform";
import { importEditBackdrop, profileBackdropSlot } from "../components/Shots";
import { go } from "../ui";

const RESOLUTIONS = ["1920x1080", "2560x1440", "3440x1440", "3840x2160", "2560x1080", "5120x1440", "5760x1080"];

interface MonitorInfo {
  index: number;
  width: number;
  height: number;
  scale: number;
  primary: boolean;
}

/** Ekranı ve üzerindeki overlay kutularını küçük bir şema olarak çizer */
export function LayoutPreview(props: { boxes: LayoutBox[] | null; w: number; h: number; scale?: number; labels?: boolean }) {
  const vw = () => props.w / (props.scale || 1);
  const vh = () => props.h / (props.scale || 1);
  return (
    <svg class="lp" viewBox={`0 0 ${vw()} ${vh()}`} preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width={vw()} height={vh()} class="lp-screen" />
      <line x1={vw() / 2} y1="0" x2={vw() / 2} y2={vh()} class="lp-center" />
      <line x1="0" y1={vh() / 2} x2={vw()} y2={vh() / 2} class="lp-center" />
      <For each={props.boxes ?? []}>
        {(b) => (
          <g>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="6" class="lp-box" classList={{ locked: isLocked(b.id) }} />
            <Show when={props.labels}>
              <text x={b.x + b.w / 2} y={b.y + b.h / 2} class="lp-label" style={{ "font-size": `${Math.max(16, Math.min(34, b.w / 9))}px` }}>
                {b.name}
              </text>
            </Show>
          </g>
        )}
      </For>
    </svg>
  );
}

export function Stars(props: { value: number; count?: number; onRate?: (n: number) => void; mine?: number; big?: boolean }) {
  const [hover, setHover] = createSignal(0);
  const shown = () => hover() || props.mine || Math.round(props.value);
  return (
    <span class="stars" classList={{ interactive: !!props.onRate, big: !!props.big }} onMouseLeave={() => setHover(0)}>
      <For each={[1, 2, 3, 4, 5]}>
        {(n) => (
          <span
            classList={{ on: n <= shown(), mine: !!props.mine && !hover() }}
            onMouseEnter={() => props.onRate && setHover(n)}
            onClick={() => props.onRate?.(n)}
          >
            ★
          </span>
        )}
      </For>
      <Show when={props.count !== undefined}>
        <small>
          {props.value ? props.value.toFixed(1) : "—"} ({props.count})
        </small>
      </Show>
    </span>
  );
}

export type LayoutKind = "layout" | "stream";

/** Giriş yapmayanlara: topluluk görünmez */
export function LoginWall(props: { what: string }) {
  return (
    <div class="page narrow">
      <section class="panel login-wall">
        <I.Lock />
        <h3>{props.what}</h3>
        <p class="muted">Topluluğu görmek için hesap oluştur ya da giriş yap. Hesap ücretsizdir.</p>
        <button class="btn primary" onClick={() => go("account")}>
          Hesap oluştur ya da giriş yap
        </button>
      </section>
    </div>
  );
}

/** PRO gerektiren işlem düğmesi: PRO değilse kilitli görünür ve PRO sayfasına götürür */
export function ProGate(props: { children: any; label?: string; /** PRO özellikleri anahtarı (yönetici herkese açabilir) */ feature?: string }) {
  return (
    <Show
      when={props.feature ? !proLocked(props.feature) : isPro()}
      fallback={
        <button class="btn ghost pro-lock" title="Bu özellik PRO üyelere açık" onClick={() => go("pro")}>
          <I.Lock /> {props.label ?? "PRO"}
        </button>
      }
    >
      {props.children}
    </Show>
  );
}

/** Çözünürlüğün en-boy sınıfı (kart etiketi için) */
export function aspectOf(w: number, h: number): string {
  const key = `${w}x${h}`;
  for (const [k, list] of Object.entries(ASPECT_RES)) if (list.includes(key)) return k === "triple" ? "Üçlü" : k;
  const r = w / Math.max(1, h);
  if (r > 4.5) return "Üçlü";
  if (r > 3.2) return "32:9";
  if (r > 2.2) return "21:9";
  if (r > 1.7) return "16:9";
  if (r > 1.5) return "16:10";
  return "4:3";
}

/** Topluluk düzeni kartı (liste ve ana sayfa) */
export function LayoutCard(p: { l: LayoutSummary & { comment_count?: number }; rank?: number; onOpen: () => void; onAuthor?: (name: string) => void; onCar?: (car: string) => void }) {
  const l = () => p.l;
  const fresh = () => Date.now() - new Date(l().created_at).getTime() < 3 * 86400_000;
  return (
    <div class="cx-card" role="button" tabIndex={0} onClick={p.onOpen} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), p.onOpen())}>
      <div class="cx-cover lp-cover">
        <LayoutPreview boxes={l().boxes} w={l().screen_w} h={l().screen_h} scale={l().ui_scale} labels />
        <div class="cx-badges">
          <Show when={p.rank}>
            <i class="cx-rank">{p.rank}</i>
          </Show>
          <Show when={fresh() && !p.rank}>
            <i class="cx-new">YENİ</i>
          </Show>
          <span class="lt-sp" />
          <i class="cx-res" data-no-i18n>
            {l().screen_w}×{l().screen_h}
          </i>
        </div>
        <span class="cx-open">
          <I.Eye /> Önizle
        </span>
      </div>
      <div class="cx-body">
        <div class="cx-title-row">
          <b class="cx-title" data-no-i18n title={l().title}>
            {l().title}
          </b>
        </div>
        <div class="cx-byline">
          <Author name={l().author_name} iracing={l().author_iracing} onClick={p.onAuthor ? () => p.onAuthor!(l().author_name) : undefined} />
          <small class="cx-date" title={new Date(l().created_at).toLocaleString(localeTag())}>
            {relTime(l().created_at)}
          </small>
        </div>
        <div class="cx-tags">
          <span class="cx-tag acc">{aspectOf(l().screen_w, l().screen_h)}</span>
          <span class="cx-tag">{t("{0} overlay", l().overlay_count)}</span>
          <For each={l().cars.slice(0, 2)}>
            {(c) => (
              <span
                class="cx-tag car"
                data-no-i18n
                title={c}
                onClick={(e) => {
                  if (!p.onCar) return;
                  e.stopPropagation();
                  p.onCar(c);
                }}
              >
                {c}
              </span>
            )}
          </For>
          <Show when={l().cars.length > 2}>
            <span class="cx-tag" title={l().cars.slice(2).join(", ")} data-no-i18n>
              +{l().cars.length - 2}
            </span>
          </Show>
        </div>
        <div class="cx-stats">
          <span class="cx-rating" classList={{ none: !l().rating_count }}>
            <span class="cx-star">★</span>
            <b>{l().rating_count ? Number(l().rating_avg).toFixed(1) : "—"}</b>
            <small>({l().rating_count})</small>
          </span>
          <span title="İndirme">
            <I.Download /> {compact(l().downloads)}
          </span>
          <span title="Yorum">
            <I.MessageCircle /> {compact(l().comment_count ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

type LTab = "all" | "mine" | "rated";

const LAYOUT_SORTS: { id: LayoutSort; label: string }[] = [
  { id: "new", label: "En yeni" },
  { id: "trend7", label: "Haftanın popülerleri" },
  { id: "trend30", label: "Ayın popülerleri" },
  { id: "downloads", label: "En çok indirilen" },
  { id: "top", label: "En yüksek puan" },
  { id: "votes", label: "En çok oy alan" },
  { id: "comments", label: "En çok yorumlanan" },
  { id: "overlays", label: "En çok overlay" },
  { id: "updated", label: "Son güncellenen" },
  { id: "old", label: "En eski" },
  { id: "title", label: "Ada göre (A-Z)" },
];

interface LFilters {
  sort: LayoutSort;
  days: number;
  author: string;
  res: string;
  aspect: Aspect;
  tier: ResTier;
  car: string;
  carMode: "" | "specific" | "generic";
  ovMin: number;
  ovMax: number;
  minRating: number;
  minDownloads: number;
  hasComments: boolean;
}

const L_DEFAULT: LFilters = {
  sort: "new",
  days: 0,
  author: "",
  res: "",
  aspect: "",
  tier: "",
  car: "",
  carMode: "",
  ovMin: 0,
  ovMax: 0,
  minRating: 0,
  minDownloads: 0,
  hasComments: false,
};

const ASPECTS: { id: Aspect; label: string }[] = [
  { id: "", label: "Hepsi" },
  { id: "16:9", label: "16:9" },
  { id: "16:10", label: "16:10" },
  { id: "21:9", label: "21:9" },
  { id: "32:9", label: "32:9" },
  { id: "triple", label: "Üçlü ekran" },
];
const TIERS: { id: ResTier; label: string }[] = [
  { id: "", label: "Hepsi" },
  { id: "1080", label: "1080p" },
  { id: "1440", label: "1440p" },
  { id: "4k", label: "4K+" },
];

export function CommunityPage(props: { kind: LayoutKind }) {
  const stream = props.kind === "stream";
  const [q, setQ] = createSignal("");
  const dq = debounced(q);
  const [f, setF] = stored<LFilters>(`pitwall.cx.${props.kind}.filters`, L_DEFAULT);
  const [panel, setPanel] = stored<boolean>(`pitwall.cx.${props.kind}.panel`, false);
  const set = <K extends keyof LFilters>(k: K, v: LFilters[K]) => setF({ ...f(), [k]: v });
  const [tab, setTab] = createSignal<LTab>("all");
  const [open, setOpen] = createSignal<LayoutSummary | null>(null);
  const [sharing, setSharing] = createSignal(false);
  const [version, setVersion] = createSignal(0);
  const PAGE = 24;
  // Sayfa sayısı filtre imzasına bağlı: filtre değişince 1'e döner (fazladan istek olmadan)
  const sig = createMemo(() => JSON.stringify([dq(), f(), tab()]));
  const [pageState, setPageState] = createSignal({ sig: "", n: 1 });
  const pages = () => (pageState().sig === sig() ? pageState().n : 1);
  const setPages = (n: number) => setPageState({ sig: sig(), n });

  const [stats] = createResource(() => (session() ? 1 : null), () => communityStats().catch(() => undefined));
  const [cars] = createResource(() => (session() ? props.kind : null), (k) => layoutCars(k).catch(() => []));
  const [ratedIds] = createResource(
    () => (session() && tab() === "rated" ? version() + 1 : null),
    () => myRatedLayoutIds().catch(() => [] as string[]),
  );

  const [list] = createResource(
    () => {
      if (!session()) return null;
      if (tab() === "rated" && !ratedIds()) return null;
      return { q: dq(), f: f(), tab: tab(), v: version(), p: pages(), ids: tab() === "rated" ? ratedIds() : undefined };
    },
    (k) =>
      queryLayouts(
        { ...k.f, kind: props.kind, q: k.q, userId: k.tab === "mine" ? session()?.user.id : undefined, ids: k.ids ?? undefined },
        0,
        PAGE * k.p,
      ),
  );
  const items = () => list.latest ?? [];
  const hasMore = () => (list.latest?.length ?? 0) >= PAGE * pages();

  const chips = createMemo(() => {
    const x = f();
    const c: ActiveChip[] = [];
    const clr = (k: keyof LFilters) => () => set(k, L_DEFAULT[k] as never);
    if (x.days) c.push({ label: "Tarih", value: periodLabel(x.days), clear: clr("days") });
    if (x.author) c.push({ label: "Kullanıcı", value: x.author, raw: true, clear: clr("author") });
    if (x.aspect) c.push({ label: "Oran", value: ASPECTS.find((a) => a.id === x.aspect)!.label, clear: clr("aspect") });
    if (x.tier) c.push({ label: "Çözünürlük sınıfı", value: TIERS.find((a) => a.id === x.tier)!.label, clear: clr("tier") });
    if (x.res) c.push({ label: "Çözünürlük", value: x.res.replace("x", "×"), raw: true, clear: clr("res") });
    if (x.car) c.push({ label: "Araç", value: x.car, raw: true, clear: clr("car") });
    if (x.carMode) c.push({ label: "Araç kuralı", value: x.carMode === "specific" ? "Araca özel" : "Genel", clear: clr("carMode") });
    if (x.ovMin || x.ovMax) c.push({ label: "Overlay", value: `${x.ovMin || 0}–${x.ovMax || "∞"}`, raw: true, clear: () => setF({ ...f(), ovMin: 0, ovMax: 0 }) });
    if (x.minRating) c.push({ label: "Puan", value: t("{0}+ yıldız", x.minRating), clear: clr("minRating") });
    if (x.minDownloads) c.push({ label: "İndirme", value: `≥ ${x.minDownloads}`, raw: true, clear: clr("minDownloads") });
    if (x.hasComments) c.push({ label: "Yorum", value: "Yorumu olanlar", clear: clr("hasComments") });
    return c;
  });
  const clearAll = () => {
    setF({ ...L_DEFAULT, sort: f().sort });
    setQ("");
  };

  if (!cloudEnabled) {
    return (
      <div class="page narrow">
        <section class="panel">
          <h3>Topluluk kapalı</h3>
          <p class="muted">Düzen paylaşımı için bulut bağlantısı gerekir (bkz. Hesap sayfası).</p>
        </section>
      </div>
    );
  }

  return (
    <Show when={session()} fallback={<LoginWall what={stream ? "Topluluk yayın düzenleri" : "Topluluk düzenleri"} />}>
      <div class="page cx-page">
        <Hero
          icon={stream ? <I.Radio /> : <I.LayoutDashboard />}
          kicker="Topluluk"
          title={stream ? "Yayın düzenleri" : "Overlay düzenleri"}
          sub={
            stream
              ? "Yayıncıların OBS sahneleri için hazırladığı yerleşimler. Önizle, puanla ve tek tıkla kendi yayınına ekle."
              : "Sürücülerin paylaştığı overlay yerleşimleri. Ekranına uygun olanı bul, önizle ve tek tıkla profil olarak kullan."
          }
          stats={[
            { n: stream ? stats()?.streams : stats()?.layouts, label: "Paylaşım" },
            { n: stats()?.downloads, label: "İndirme" },
            { n: stats()?.members, label: "Üye" },
          ]}
          actions={
            <button class="btn primary" onClick={() => setSharing(true)}>
              <I.Share2 /> {stream ? "Yayın düzenimi paylaş" : "Düzenimi paylaş"}
            </button>
          }
        />

        <FilterBar
          tabs={
            <Tabs<LTab>
              value={tab()}
              onChange={setTab}
              tabs={[
                { id: "all", label: "Keşfet" },
                { id: "mine", label: "Paylaştıklarım" },
                { id: "rated", label: "Puanladıklarım" },
              ]}
            />
          }
          q={q()}
          onQ={setQ}
          placeholder="Ad, açıklama, kullanıcı ya da iRacing adı ara"
          sort={f().sort}
          sorts={LAYOUT_SORTS}
          onSort={(v) => set("sort", v as LayoutSort)}
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
          <FGroup label={stream ? "Tuval oranı" : "Ekran oranı"}>
            <Pills value={f().aspect} options={ASPECTS} onChange={(v) => set("aspect", v)} />
          </FGroup>
          <FGroup label="Çözünürlük sınıfı">
            <Pills value={f().tier} options={TIERS} onChange={(v) => set("tier", v)} />
          </FGroup>
          <FGroup label="Tam çözünürlük">
            <Select value={f().res} onChange={(v) => set("res", v)} all="Tüm çözünürlükler" options={RESOLUTIONS.map((r) => ({ id: r, label: r.replace("x", "×"), raw: true }))} />
          </FGroup>
          <FGroup label="Araç" hint={cars()?.length ? t("{0} farklı araç", cars()!.length) : undefined}>
            <Select
              value={f().car}
              onChange={(v) => set("car", v)}
              all="Tüm araçlar"
              options={(cars() ?? []).slice(0, 80).map((c) => ({ id: c.name, label: `${c.name} (${c.count})`, raw: true }))}
            />
          </FGroup>
          <FGroup label="Araç kuralı">
            <Pills
              value={f().carMode}
              options={[
                { id: "", label: "Hepsi" },
                { id: "specific", label: "Araca özel" },
                { id: "generic", label: "Genel" },
              ]}
              onChange={(v) => set("carMode", v)}
            />
          </FGroup>
          <FGroup label="Overlay sayısı">
            <Range min={f().ovMin} max={f().ovMax} onMin={(v) => set("ovMin", v)} onMax={(v) => set("ovMax", v)} />
          </FGroup>
          <FGroup label="En düşük puan">
            <MinStars value={f().minRating} onChange={(v) => set("minRating", v)} />
          </FGroup>
          <FGroup label="En az indirme">
            <Pills
              value={f().minDownloads}
              options={[
                { id: 0, label: "Hepsi" },
                { id: 10, label: "10+" },
                { id: 50, label: "50+" },
                { id: 100, label: "100+" },
                { id: 500, label: "500+" },
              ]}
              onChange={(v) => set("minDownloads", v)}
            />
          </FGroup>
          <FGroup label="Kullanıcı">
            <TextFilter value={f().author} onChange={(v) => set("author", v)} placeholder="Görünen ad ya da iRacing adı" />
          </FGroup>
          <FGroup label="Diğer">
            <Toggle checked={f().hasComments} label="Yalnızca yorumu olanlar" onChange={(v) => set("hasComments", v)} />
          </FGroup>
        </FilterBar>

        <Show when={list.error}>
          <p class="error">{String(list.error?.message ?? list.error)}</p>
        </Show>

        <Show when={list.latest || !list.loading} fallback={<SkeletonGrid n={8} />}>
          <Show
            when={items().length > 0}
            fallback={
              <Show when={!list.loading && !list.error}>
                <EmptyState
                  icon={tab() === "all" ? <I.Search /> : stream ? <I.Radio /> : <I.LayoutDashboard />}
                  title={tab() === "mine" ? "Henüz düzen paylaşmadın." : tab() === "rated" ? "Henüz puan vermedin." : "Bu filtrelere uyan düzen yok."}
                  hint={tab() === "all" ? "Filtreleri gevşetmeyi ya da aramayı değiştirmeyi dene." : undefined}
                  action={
                    <Show
                      when={chips().length > 0 || q()}
                      fallback={
                        <Show when={tab() === "mine"}>
                          <button class="btn primary" onClick={() => setSharing(true)}>
                            {stream ? "Yayın düzenimi paylaş" : "Düzenimi paylaş"}
                          </button>
                        </Show>
                      }
                    >
                      <button class="btn" onClick={clearAll}>
                        Filtreleri temizle
                      </button>
                    </Show>
                  }
                />
              </Show>
            }
          >
            <div class="cx-grid" classList={{ busy: list.loading }}>
              <For each={items()}>
                {(l) => (
                  <LayoutCard
                    l={l}
                    onOpen={() => setOpen(l)}
                    onAuthor={(n) => (setTab("all"), set("author", n), setPanel(true))}
                    onCar={(c) => (set("car", c), setPanel(true))}
                  />
                )}
              </For>
            </div>
            <LoadMore show={hasMore()} loading={list.loading} onClick={() => setPages(pages() + 1)} />
          </Show>
        </Show>

        <Show when={open()}>
          <LayoutDetail l={open()!} kind={props.kind} onClose={() => setOpen(null)} onChanged={() => setVersion(version() + 1)} />
        </Show>
        <Show when={sharing()}>
          <ShareDialog
            kind={props.kind}
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

export function LayoutDetail(props: { l: LayoutSummary; kind: LayoutKind; onClose: () => void; onChanged: () => void }) {
  const l = () => props.l;
  const mine = () => session()?.user.id === l().user_id;
  const [data] = createResource(() => l().id, getLayoutData);
  const [stars, { refetch: refetchStars }] = createResource(() => l().id, (id) => myRating(id).catch(() => 0));
  const [cmts, { refetch }] = createResource(() => l().id, comments);
  const [text, setText] = createSignal("");
  const [msg, setMsg] = createSignal("");
  const [avg, setAvg] = createSignal({ v: Number(l().rating_avg), n: l().rating_count });
  const [reporting, setReporting] = createSignal(false);
  const [withTheme, setWithTheme] = createSignal(true);
  /** Demo: önizleme canlı akar, overlay'ler yarıştaymış gibi davranır */
  const [demo, setDemo] = createSignal(false);
  const okBg = () => {
    const b = data()?.backdrop;
    return typeof b === "string" && /^data:image\/(jpeg|webp|png);base64,/.test(b) ? b : undefined;
  };

  // Önizleme sabit görüntü: bir anlık örnek veri, sonra akış durur
  useSnapshot(
    () => {
      const d = data();
      if (!d) return [];
      const types = new Set(Object.values(d.profile.overlays ?? {}).filter((o) => o.enabled).map((o) => o.type));
      return [...types].flatMap((t) => manifestById(t)?.topics ?? []);
    },
    () => data(),
    demo,
  );
  const overlays = createMemo(() =>
    Object.entries(data()?.profile.overlays ?? {})
      .filter(([, o]) => o.enabled)
      .map(([k, o]) => ({ k, name: o.name || manifestById(o.type)?.name || o.type, scale: o.scale, type: o.type })),
  );

  const doRate = async (n: number) => {
    if (mine()) return setMsg("Kendi düzenine puan veremezsin");
    try {
      const had = stars() ?? 0;
      await rate(l().id, n);
      const cnt = avg().n + (had ? 0 : 1);
      setAvg({ v: (avg().v * avg().n - had + n) / Math.max(1, cnt), n: cnt });
      refetchStars();
      props.onChanged();
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };

  const use = async () => {
    setMsg("");
    try {
      const d = data() ?? (await getLayoutData(l().id));
      const src: Profile = structuredClone(d.profile);
      delete src.link;
      delete src.locked;
      delete (src as { isDefault?: boolean }).isDefault;
      delete src.sharedId;
      const name = `${l().title} (${l().author_name || "paylaşım"})`;
      const mode = props.kind === "stream" ? "stream" : src.rules?.mode && src.rules.mode !== "stream" ? src.rules.mode : "driving";
      const id = newLayout(mode, name, src);
      if (props.kind === "stream") updateSettings((x) => (x.profiles[id].canvas = src.canvas ?? { w: l().screen_w, h: l().screen_h }));
      // Paylaşanın yerel arka plan işareti alınmaz: görsel paylaşımdaysa aşağıda bu düzene yazılır
      updateSettings((x) => void delete x.profiles[id].backdrop);
      const slot = profileBackdropSlot(id);
      if (okBg() && slot && inTauri) await importEditBackdrop(await (await fetch(okBg()!)).blob(), slot).catch(() => {});
      if (withTheme() && d.theme) updateSettings((x) => (x.theme = { ...d.theme!, scale: props.kind === "stream" ? x.theme.scale : d.theme!.scale, opacity: x.theme.opacity }));
      markDownloaded(l().id);
      setMsg(
        props.kind === "stream"
          ? `"${name}" yayın düzeni eklendi. Yayın sayfasından OBS adresini alabilirsin.`
          : `"${name}" düzeni eklendi ve seçildi. Düzenler sayfasından değiştirebilirsin.`,
      );
      props.onChanged();
    } catch (e) {
      setMsg("İndirilemedi: " + String((e as Error).message));
    }
  };

  const send = async () => {
    const b = text().trim();
    if (!b) return;
    try {
      await addComment(l().id, b);
      setText("");
      refetch();
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };

  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal cm-detail wide cx-detail">
        <header>
          <div class="cx-dhead">
            <span class="cx-kicker">{props.kind === "stream" ? "Yayın düzeni" : "Overlay düzeni"}</span>
            <h3 data-no-i18n>{l().title}</h3>
            <div class="cx-byline">
              <Author name={l().author_name} iracing={l().author_iracing} />
              <small class="cx-date" title={new Date(l().created_at).toLocaleString(localeTag())}>
                {new Date(l().created_at).toLocaleDateString(localeTag())} · {relTime(l().created_at)}
              </small>
            </div>
          </div>
          <button class="btn ghost small cx-close" onClick={props.onClose} title="Kapat">
            <I.X />
          </button>
        </header>

        <div class="cx-dprev">
          <Show when={data()} fallback={<LayoutPreview boxes={l().boxes} w={l().screen_w} h={l().screen_h} scale={l().ui_scale} labels />}>
            <SharedLayoutPreview profile={data()!.profile} theme={data()!.theme} w={l().screen_w / (l().ui_scale || 1)} h={l().screen_h / (l().ui_scale || 1)} stream={props.kind === "stream"} backdrop={okBg()} live={demo()} />
            <button class="btn small cx-demo" classList={{ primary: demo() }} title="Düzeni örnek yarış verisiyle canlı oynatır: overlay'ler gerçek yarıştaki gibi görünür, gizlenir ve değişir" onClick={() => setDemo(!demo())}>
              <I.FlaskConical /> {demo() ? "Demoyu durdur" : "Demo"}
            </button>
          </Show>
        </div>

        <div class="cx-dstats">
          <div>
            <small>Puan</small>
            <span class="cx-dstars">
              <Stars value={avg().v} />
              <b>{avg().v ? avg().v.toFixed(1) : "—"}</b>
              <small>{t("({0} oy)", avg().n)}</small>
            </span>
          </div>
          <div>
            <small>İndirme</small>
            <b>{compact(l().downloads)}</b>
          </div>
          <div>
            <small>Yorum</small>
            <b>{cmts()?.length ?? (l() as { comment_count?: number }).comment_count ?? 0}</b>
          </div>
          <div>
            <small>{props.kind === "stream" ? "Tuval" : "Ekran"}</small>
            <b data-no-i18n>
              {l().screen_w}×{l().screen_h}
            </b>
          </div>
          <div>
            <small>Oran</small>
            <b>{aspectOf(l().screen_w, l().screen_h)}</b>
          </div>
          <div>
            <small>Overlay</small>
            <b>{l().overlay_count}</b>
          </div>
        </div>
        <Show when={l().description}>
          <p class="cm-desc" data-no-i18n>
            {l().description}
          </p>
        </Show>

        <div class="cm-settings">
          <div>
            <h4>Overlay'ler ve ayarları</h4>
            <div class="cm-ovs">
              <For each={overlays()}>
                {(o) => (
                  <span class="chip2" classList={{ alt: isLocked(o.type) }}>
                    {o.name} · %{Math.round((o.scale || 1) * 100)}
                  </span>
                )}
              </For>
            </div>
          </div>
          <Show when={data()?.theme}>
            <div>
              <h4>Renkler ve yazı tipi</h4>
              <ThemeSwatches theme={data()!.theme} />
            </div>
          </Show>
          <Show when={l().cars.length > 0}>
            <div>
              <h4>Araçlar</h4>
              <div class="cx-tags">
                <For each={l().cars}>
                  {(c) => (
                    <span class="cx-tag car" data-no-i18n>
                      {c}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>

        <div class="btns">
          <ProGate label="Kullanmak için PRO" feature="community.layouts.use">
            <button class="btn primary" onClick={use}>
              <I.Download /> Kullan
            </button>
            <Show when={data()?.theme}>
              <label class="check">
                <input type="checkbox" checked={withTheme()} onChange={(e) => setWithTheme(e.currentTarget.checked)} />
                <span>Renklerini de uygula</span>
              </label>
            </Show>
          </ProGate>
          <span class="lt-sp" />
          <Show when={!mine()}>
            <ProGate label="Puan vermek için PRO" feature="community.layouts.rate">
              <span class="cm-rate">
                Puanın: <Stars value={0} mine={stars() ?? 0} onRate={doRate} big />
              </span>
            </ProGate>
          </Show>
          <Show when={session() && !mine()}>
            <button class="btn ghost" onClick={() => setReporting(true)}>
              <I.Flag /> Raporla
            </button>
          </Show>
          <Show when={mine() || can("layouts.delete")}>
            <button
              class="btn ghost danger"
              onClick={async () => {
                if (!confirm("Bu paylaşım silinsin mi?")) return;
                await deleteLayout(l().id).catch((e) => setMsg(String(e.message)));
                props.onChanged();
                props.onClose();
              }}
            >
              Sil
            </button>
          </Show>
        </div>
        <Show when={msg()}>
          <p class="success">{msg()}</p>
        </Show>
        <p class="muted small">Kilitli (PRO) overlay'ler soluk görünür; indirince PRO değilsen kapalı kalır.</p>

        <h4>Yorumlar ({cmts()?.length ?? 0})</h4>
        <CommentList
          items={cmts() ?? []}
          reportType="layout_comment"
          canEdit={(c) => session()?.user.id === c.user_id || can("comments.edit")}
          canDelete={(c) => session()?.user.id === c.user_id || mine() || can("comments.delete")}
          onEdit={async (c, b) => {
            await editComment(c.id, b);
            refetch();
          }}
          onDelete={async (c) => {
            await deleteComment(c.id);
            refetch();
          }}
          onError={setMsg}
        />
        <ProGate label="Yorum yazmak için PRO" feature="community.layouts.comment">
          <div class="fr-add">
            <input class="input" maxLength={1000} placeholder="Yorum yaz" value={text()} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            <button class="btn" onClick={send}>
              Gönder
            </button>
          </div>
        </ProGate>
        <Show when={reporting()}>
          <ReportDialog type="layout" id={l().id} what={l().title} onClose={() => setReporting(false)} />
        </Show>
      </div>
    </div>
  );
}

/** Sadece hazır sahne (açılış, ara, kapanış, garaj örtüsü) içeren düzen: toplulukta paylaşılamaz */
export function isSceneOnly(p: Profile) {
  const on = Object.values(p.overlays ?? {}).filter((o) => o.enabled);
  return on.length > 0 && on.every((o) => o.type === "scene");
}

/** Düzeni toplulukta paylaş (Düzenler / Yayın sayfalarından ve topluluktan açılır) */
export function ShareDialog(props: { kind: LayoutKind; profileId?: string; onClose: () => void; onShared: () => void }) {
  const profiles = () => Object.values(settings().profiles).filter((p) => (props.kind === "stream" ? p.rules.mode === "stream" : p.rules.mode !== "stream"));
  const [pid, setPid] = createSignal(props.profileId ?? (props.kind === "stream" ? profiles()[0]?.id : activeProfile().id) ?? "");
  // Bağlı yayın düzeni bağımsız bir kopya olarak paylaşılır (kaynak düzen karşı tarafta yok)
  const prof = createMemo(() => {
    const p = settings().profiles[pid()] ?? profiles()[0];
    return p?.link ? independentProfile(p) : p;
  });
  const [title, setTitle] = createSignal(prof()?.name ?? "");
  const [desc, setDesc] = createSignal("");
  const [withTheme, setWithTheme] = createSignal(true);
  const [screen, setScreen] = createSignal({ w: 1920, h: 1080, scale: 1 });
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  // Bu düzen daha önce paylaşıldıysa: öncekini güncelle (kimlik, puanlar, indirmeler, yorumlar kalır) ya da yeni paylaşım
  const [prev] = createResource(
    () => (session() ? ([pid(), settings().profiles[pid()]?.sharedId ?? "", settings().profiles[pid()]?.name ?? ""] as const) : null),
    ([, sid, name]) => findMyShare(props.kind, sid || undefined, name).catch(() => null),
  );
  const [mode, setMode] = createSignal<"replace" | "new">("replace");
  const replacing = () => !!prev() && mode() === "replace";
  // Önceki paylaşım bulununca başlık ve açıklaması forma gelir
  createEffect(() => {
    const x = prev();
    if (!x) return;
    setTitle(x.title);
    setDesc(x.description ?? "");
  });
  const boxes = () => (prof() ? layoutBoxes(prof()!) : []);
  // Arka plan görseli: düzenin kendi görseli, yoksa sayfanın ortak görseli. Paylaşıma küçültülmüş JPEG olarak girer.
  const [withBg, setWithBg] = createSignal(true);
  const bgSlot = () => (prof()?.backdrop?.own ? profileBackdropSlot(pid()) : settings().general.editBackdrops[props.kind === "stream" ? "stream" : "layout"].has ? (props.kind === "stream" ? "stream" : "layout") : undefined);
  const hasBg = () => inTauri && !!bgSlot();
  const backdropData = async (): Promise<string | undefined> => {
    try {
      const buf = await invoke<ArrayBuffer>("edit_backdrop_read", { slot: bgSlot() });
      const bmp = await createImageBitmap(new Blob([buf]));
      const k = Math.min(1, 1280 / bmp.width);
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k);
      c.height = Math.round(bmp.height * k);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", 0.72);
      return url.length < 600_000 ? url : c.toDataURL("image/jpeg", 0.5);
    } catch {
      return undefined;
    }
  };
  // Paylaşmak varsayılan herkese açık; yönetici PRO yapabilir (PRO özellikleri)
  const shareLocked = () => proLocked(props.kind === "stream" ? "community.share.streams" : "community.share.layouts", false);

  onMount(async () => {
    if (props.kind === "stream") {
      const c = prof()?.canvas ?? { w: 1920, h: 1080 };
      setScreen({ w: c.w, h: c.h, scale: 1 });
      return;
    }
    if (!inTauri) return;
    try {
      const ms = await invoke<MonitorInfo[]>("monitors_list");
      const sel = settings().general.monitor;
      const m = ms.find((x) => x.index === sel) ?? ms.find((x) => x.primary) ?? ms[0];
      if (m) setScreen({ w: m.width, h: m.height, scale: m.scale });
    } catch {
      /* varsayılan kalsın */
    }
  });

  const submit = async () => {
    setErr("");
    if (!prof()) return setErr("Paylaşılacak düzen yok.");
    if (!title().trim()) return setErr("Bir ad yaz.");
    if (boxes().length === 0) return setErr("Bu düzende açık overlay yok.");
    if (isSceneOnly(prof()!)) return setErr("Hazır sahneler toplulukta paylaşılamaz.");
    setBusy(true);
    try {
      // Yerel işaretler (kilit, paylaşım kimliği, liste sırası) paylaşıma girmez
      const p: Profile = structuredClone(prof()!);
      delete p.locked;
      delete (p as { isDefault?: boolean }).isDefault;
      delete p.sharedId;
      delete p.order;
      const v = {
        title: title().trim().slice(0, 60),
        description: desc().trim().slice(0, 1000),
        screen_w: screen().w,
        screen_h: screen().h,
        cars: p.rules?.cars ?? [],
        data: {
          profile: p,
          theme: withTheme() ? settings().theme : undefined,
          backdrop: withBg() && hasBg() ? await backdropData() : undefined,
          boxes: boxes(),
          scale: screen().scale,
        },
      };
      const row = replacing() ? await updateSharedLayout(prev()!.id, v) : await shareLayout({ ...v, kind: props.kind });
      // Hangi paylaşım olduğu yerel düzende saklanır: sonraki paylaşımda "öncekini güncelle" sorulur
      const local = pid();
      if (row?.id && settings().profiles[local]) updateSettings((d) => (d.profiles[local].sharedId = row.id));
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
          <h3>{props.kind === "stream" ? "Yayın düzenini toplulukta paylaş" : "Düzeni toplulukta paylaş"}</h3>
          <button class="btn ghost small" onClick={props.onClose}>
            Vazgeç
          </button>
        </header>
        <Show when={session()} fallback={<p class="muted">Paylaşmak için giriş yapmalısın.</p>}>
          <>
            <div class="row">
              <b>Düzen</b>
              <select class="input" value={pid()} onChange={(e) => (setPid(e.currentTarget.value), setTitle(prof()?.name ?? ""))}>
                <For each={profiles()}>{(p) => <option value={p.id}>{p.name}</option>}</For>
              </select>
            </div>
            <div class="row">
              <b>Başlık</b>
              <input class="input admin-wide" maxLength={60} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
            </div>
            <textarea class="input cm-textarea" rows={3} maxLength={1000} placeholder="Açıklama (hangi seri/araç için, neye dikkat ettin…)" value={desc()} onInput={(e) => setDesc(e.currentTarget.value)} />
            <div class="row">
              <div>
                <b>{props.kind === "stream" ? "Tuval" : "Ekran"}</b>
                <small>{props.kind === "stream" ? "Yayın düzeninin tuval boyutu" : "Overlay ekranının monitöründen alındı"}</small>
              </div>
              <div class="mqtt-host">
                <input class="input port" type="number" value={screen().w} onChange={(e) => setScreen({ ...screen(), w: Number(e.currentTarget.value) || 1920 })} />
                <span>×</span>
                <input class="input port" type="number" value={screen().h} onChange={(e) => setScreen({ ...screen(), h: Number(e.currentTarget.value) || 1080 })} />
              </div>
            </div>
            <label class="check">
              <input type="checkbox" checked={withTheme()} onChange={(e) => setWithTheme(e.currentTarget.checked)} />
              <span>Renklerimi ve yazı tipimi de ekle</span>
            </label>
            <Show when={hasBg()}>
              <label class="check" title="Düzenleme tuvalindeki arka plan görselin küçültülerek paylaşıma eklenir; düzene bakanlar ve indirenler aynı arka planı görür">
                <input type="checkbox" checked={withBg()} onChange={(e) => setWithBg(e.currentTarget.checked)} />
                <span>Arka plan görselimi de ekle</span>
              </label>
            </Show>
            <Show when={prev()}>
              <div class="row">
                <div>
                  <b>Bu düzeni daha önce paylaştın</b>
                  <small>
                    <span data-no-i18n>"{prev()!.title}"</span> · {new Date(prev()!.created_at).toLocaleDateString(localeTag())}. Öncekini güncellersen puanları, indirme sayısı ve yorumları korunur.
                  </small>
                </div>
                <div class="seg">
                  <button classList={{ on: mode() === "replace" }} onClick={() => setMode("replace")}>
                    Öncekini güncelle
                  </button>
                  <button classList={{ on: mode() === "new" }} onClick={() => setMode("new")}>
                    Yeni olarak paylaş
                  </button>
                </div>
              </div>
            </Show>
            <LayoutPreview boxes={boxes()} w={screen().w} h={screen().h} scale={screen().scale} labels />
            <p class="muted small">
              {t("{0} açık overlay tüm ayarlarıyla paylaşılacak.", boxes().length)} Görünen adın{profile()?.iracing_name ? " ve iRacing adın" : ""} düzenle birlikte görünür.
            </p>
            <Show when={err()}>
              <p class="error">{err()}</p>
            </Show>
            <Show when={prof() && isSceneOnly(prof()!)}>
              <p class="error">Hazır sahneler toplulukta paylaşılamaz.</p>
            </Show>
            <Show when={shareLocked()}>
              <p class="muted">
                <span class="pro-badge small">PRO</span> {props.kind === "stream" ? "Yayın düzeni paylaşmak PRO özelliğidir." : "Düzen paylaşmak PRO özelliğidir."}{" "}
                <button class="link" onClick={() => go("pro")}>
                  PRO'ya geç
                </button>
              </p>
            </Show>
            <button class="btn primary" disabled={busy() || shareLocked() || (!!prof() && isSceneOnly(prof()!))} onClick={submit}>
              {busy() ? "Paylaşılıyor…" : replacing() ? "Paylaşımı güncelle" : "Paylaş"}
            </button>
          </>
        </Show>
      </div>
    </div>
  );
}
