// Topluluk › Direksiyon Ekranları: Dashboard Tasarımcısı'nda yapılan tasarımların paylaşımı.
// Kartlarda tasarım örnek veriyle çizilir (tasarımcının çizicisi: src/dash/Render.tsx). Önizle, puanla, yorum yaz,
// "Tasarımlarıma ekle" ile indir: tasarım ayarlardaki `dashes` listesine girer; Tasarımcı'da ve
// Direksiyon Ekranı › Görünüm listesinde ("Tasarımlarım: …") görünür.

import { localeTag, t } from "@/sdk/i18n";
import { For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js";
import { cloudEnabled, session } from "@/cloud/supabase";
import { profile } from "@/cloud/account";
import { F, optionLocked, proLocked } from "@/sdk/proFeatures";
import { can } from "@/cloud/moderation";
import { communityStats } from "@/cloud/community";
import {
  addDashComment,
  dashComments,
  dashDownloaded,
  dashOf,
  deleteDash,
  deleteDashComment,
  editDashComment,
  findMyDashShare,
  myDashRating,
  myRatedDashIds,
  queryDashes,
  rateDash,
  setDashHidden,
  shareDash,
  updateSharedDash,
  type DashSort,
  type DashSummary,
} from "@/cloud/dashes";
import { MAX_DASHES, cloneDash, dashView, sanitizeDashes, type CustomDash } from "@/dash/model";
import { DashCanvas, FitBox } from "@/dash/Render";
import { demoData, useDemoDash } from "@/dash/data";
import { activeProfile, settings, updateSettings } from "@/sdk/settings";
import { CommentList, ReportDialog } from "../components/Moderation";
import { LoginWall, ProGate, Stars } from "./CommunityPage";
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
  SkeletonGrid,
  Tabs,
  TextFilter,
  compact,
  debounced,
  periodLabel,
  relTime,
  stored,
  type ActiveChip,
} from "./CommunityKit";
import { go } from "../ui";
import * as I from "../icons";

const SAMPLE = demoData(0);

/** Tasarımı kullanmak (overlay'de "Özel tasarım") kullanıcı için kilitli mi: indirme de aynı kurala bağlı */
export const dashUseLocked = () => optionLocked("dashboard", "view", { value: "custom", label: "", pro: true });

/** Tasarımın örnek veriyle çizilmiş önizlemesi (kabına sığar). `animate`: hareketli örnek veri */
export function DashPreview(p: { dash: CustomDash; animate?: boolean; page?: number }) {
  const Live = () => {
    const data = useDemoDash();
    return <DashCanvas dash={p.dash} page={p.page ?? 0} data={data} units={settings().general.units} />;
  };
  return (
    <FitBox w={p.dash.width} h={p.dash.height}>
      <Show when={p.animate} fallback={<DashCanvas dash={p.dash} page={p.page ?? 0} data={() => SAMPLE} units={settings().general.units} />}>
        <Live />
      </Show>
    </FitBox>
  );
}

/**
 * Bu tasarımı Direksiyon Ekranı'nın görünümü yapar: "Overlaylarım" varsayılanında; etkin düzende Direksiyon Ekranı
 * varsa (ve kullanıcı onaylarsa) orada da. Dönen: etkin düzene de uygulandı mı.
 */
export function useDashInOverlay(id: string): boolean {
  const keys = Object.entries(activeProfile()?.overlays ?? {})
    .filter(([, o]) => o.type === "dashboard")
    .map(([k]) => k);
  const also = keys.length > 0 && window.confirm(t("Etkin düzendeki Direksiyon Ekranı da bu tasarımı göstersin mi?"));
  updateSettings((s) => {
    if (s.defaults.dashboard) s.defaults.dashboard.options.view = dashView(id);
    if (also) {
      const p = s.profiles[s.activeProfile];
      for (const k of keys) if (p?.overlays[k]) p.overlays[k].options.view = dashView(id);
    }
  });
  return also;
}

export function DashCard(p: { d: DashSummary; rank?: number; onOpen: () => void; onAuthor?: (name: string) => void }) {
  const d = () => p.d;
  const dash = createMemo(() => dashOf(d()));
  const fresh = () => Date.now() - new Date(d().created_at).getTime() < 3 * 86400_000;
  return (
    <div class="cx-card" role="button" tabIndex={0} onClick={p.onOpen} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), p.onOpen())}>
      <div class="cx-cover dash-cover">
        <div class="dash-cover-in">
          <Show when={dash()} fallback={<span class="muted small">Önizleme yok</span>}>
            <DashPreview dash={dash()!} />
          </Show>
        </div>
        <div class="cx-badges">
          <Show when={p.rank}>
            <i class="cx-rank">{p.rank}</i>
          </Show>
          <Show when={fresh() && !p.rank}>
            <i class="cx-new">YENİ</i>
          </Show>
          <Show when={d().hidden}>
            <i class="cx-new">GİZLİ</i>
          </Show>
          <span class="lt-sp" />
          <i class="cx-res" data-no-i18n>
            {d().width}×{d().height}
          </i>
        </div>
        <span class="cx-open">
          <I.Eye /> Önizle
        </span>
      </div>
      <div class="cx-body">
        <div class="cx-title-row">
          <b class="cx-title" data-no-i18n title={d().title}>
            {d().title}
          </b>
        </div>
        <div class="cx-byline">
          <Author name={d().author_name} iracing={d().author_iracing} onClick={p.onAuthor ? () => p.onAuthor!(d().author_name) : undefined} />
          <small class="cx-date" title={new Date(d().created_at).toLocaleString(localeTag())}>
            {relTime(d().created_at)}
          </small>
        </div>
        <Show when={d().description}>
          <p class="cx-desc" data-no-i18n title={d().description}>
            {d().description}
          </p>
        </Show>
        <div class="cx-tags">
          <span class="cx-tag acc">{t("{0} sayfa", d().page_count)}</span>
          <span class="cx-tag">{t("{0} bileşen", d().widget_count)}</span>
        </div>
        <div class="cx-stats">
          <span class="cx-rating" classList={{ none: !d().rating_count }}>
            <span class="cx-star">★</span>
            <b>{d().rating_count ? Number(d().rating_avg).toFixed(1) : "—"}</b>
            <small>({d().rating_count})</small>
          </span>
          <span title="İndirme">
            <I.Download /> {compact(d().downloads)}
          </span>
          <span title="Yorum">
            <I.MessageCircle /> {compact(d().comment_count ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

type DTab = "all" | "mine" | "rated";

const DASH_SORTS: { id: DashSort; label: string }[] = [
  { id: "new", label: "En yeni" },
  { id: "top", label: "En yüksek puan" },
  { id: "downloads", label: "En çok indirilen" },
  { id: "comments", label: "En çok yorumlanan" },
  { id: "updated", label: "Son güncellenen" },
  { id: "old", label: "En eski" },
  { id: "title", label: "Ada göre (A-Z)" },
];

interface DFilters {
  sort: DashSort;
  days: number;
  author: string;
  minRating: number;
}
const D_DEFAULT: DFilters = { sort: "new", days: 0, author: "", minRating: 0 };

export function CommunityDashes() {
  const [q, setQ] = createSignal("");
  const dq = debounced(q);
  const [f, setF] = stored<DFilters>("pitwall.cx.dash.filters", D_DEFAULT);
  const [panel, setPanel] = stored<boolean>("pitwall.cx.dash.panel", false);
  const set = <K extends keyof DFilters>(k: K, v: DFilters[K]) => setF({ ...f(), [k]: v });
  const [tab, setTab] = createSignal<DTab>("all");
  const [open, setOpen] = createSignal<DashSummary | null>(null);
  const [sharing, setSharing] = createSignal(false);
  const [version, setVersion] = createSignal(0);
  const PAGE = 24;
  const sig = createMemo(() => JSON.stringify([dq(), f(), tab()]));
  const [pageState, setPageState] = createSignal({ sig: "", n: 1 });
  const pages = () => (pageState().sig === sig() ? pageState().n : 1);
  const setPages = (n: number) => setPageState({ sig: sig(), n });

  const [stats] = createResource(() => (session() ? version() + 1 : null), () => communityStats().catch(() => undefined));
  const [ratedIds] = createResource(
    () => (session() && tab() === "rated" ? version() + 1 : null),
    () => myRatedDashIds().catch(() => [] as string[]),
  );
  const [list] = createResource(
    () => {
      if (!session()) return null;
      if (tab() === "rated" && !ratedIds()) return null;
      return { q: dq(), f: f(), tab: tab(), v: version(), p: pages(), ids: tab() === "rated" ? ratedIds() : undefined };
    },
    (k) => queryDashes({ ...k.f, q: k.q, userId: k.tab === "mine" ? session()?.user.id : undefined, ids: k.ids ?? undefined }, 0, PAGE * k.p),
  );
  const items = () => list.latest ?? [];
  const hasMore = () => (list.latest?.length ?? 0) >= PAGE * pages();

  const chips = createMemo(() => {
    const x = f();
    const c: ActiveChip[] = [];
    const clr = (k: keyof DFilters) => () => set(k, D_DEFAULT[k] as never);
    if (x.days) c.push({ label: "Tarih", value: periodLabel(x.days), clear: clr("days") });
    if (x.author) c.push({ label: "Kullanıcı", value: x.author, raw: true, clear: clr("author") });
    if (x.minRating) c.push({ label: "Puan", value: t("{0}+ yıldız", x.minRating), clear: clr("minRating") });
    return c;
  });
  const clearAll = () => {
    setF({ ...D_DEFAULT, sort: f().sort });
    setQ("");
  };

  if (!cloudEnabled) {
    return (
      <div class="page narrow">
        <section class="panel">
          <h3>Topluluk kapalı</h3>
          <p class="muted">Topluluk için bulut bağlantısı gerekir (bkz. Hesap sayfası).</p>
        </section>
      </div>
    );
  }

  const shareBtn = () => (
    <button class="btn primary" onClick={() => setSharing(true)}>
      <I.Share2 /> Tasarımını paylaş
    </button>
  );

  return (
    <Show when={session()} fallback={<LoginWall what="Topluluk direksiyon ekranları" />}>
      <div class="page cx-page">
        <Hero
          icon={<I.Gauge />}
          kicker="Topluluk"
          title="Direksiyon Ekranları (Dashboards)"
          sub="Sürücülerin Dashboard Tasarımcısı'nda yaptığı direksiyon ekranları. Önizle, puanla ve tek tıkla kendi tasarımlarına ekle; Direksiyon Ekranı overlay'inde ya da telefonunda kullan."
          stats={[
            { n: stats()?.dashes, label: "Paylaşım" },
            { n: stats()?.downloads, label: "İndirme" },
            { n: stats()?.members, label: "Üye" },
          ]}
          actions={
            <>
              {shareBtn()}
              <button class="btn" onClick={() => go("tools", "dash")}>
                <I.Pencil /> Tasarımcıyı aç
              </button>
            </>
          }
        />

        <FilterBar
          tabs={
            <Tabs<DTab>
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
          sorts={DASH_SORTS}
          onSort={(v) => set("sort", v as DashSort)}
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
          <FGroup label="En düşük puan">
            <MinStars value={f().minRating} onChange={(v) => set("minRating", v)} />
          </FGroup>
          <FGroup label="Kullanıcı">
            <TextFilter value={f().author} onChange={(v) => set("author", v)} placeholder="Görünen ad ya da iRacing adı" />
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
                  icon={tab() === "all" ? <I.Search /> : <I.Gauge />}
                  title={tab() === "mine" ? "Henüz tasarım paylaşmadın." : tab() === "rated" ? "Henüz puan vermedin." : "Bu filtrelere uyan tasarım yok."}
                  hint={tab() === "all" ? "Filtreleri gevşetmeyi ya da aramayı değiştirmeyi dene." : undefined}
                  action={
                    <Show when={chips().length > 0 || q()} fallback={<Show when={tab() === "mine"}>{shareBtn()}</Show>}>
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
              <For each={items()}>{(d) => <DashCard d={d} onOpen={() => setOpen(d)} onAuthor={(n) => (setTab("all"), set("author", n), setPanel(true))} />}</For>
            </div>
            <LoadMore show={hasMore()} loading={list.loading} onClick={() => setPages(pages() + 1)} />
          </Show>
        </Show>

        <Show when={open()}>
          <DashDetail d={open()!} onClose={() => setOpen(null)} onChanged={() => setVersion(version() + 1)} />
        </Show>
        <Show when={sharing()}>
          <DashShareDialog
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

export function DashDetail(props: { d: DashSummary; onClose: () => void; onChanged: () => void }) {
  const d = () => props.d;
  const mine = () => session()?.user.id === d().user_id;
  const dash = createMemo(() => dashOf(d()));
  const [stars, { refetch: refetchStars }] = createResource(() => d().id, (id) => myDashRating(id).catch(() => 0));
  const [cmts, { refetch }] = createResource(() => d().id, dashComments);
  const [text, setText] = createSignal("");
  const [msg, setMsg] = createSignal("");
  const [added, setAdded] = createSignal("");
  const [avg, setAvg] = createSignal({ v: Number(d().rating_avg), n: d().rating_count });
  const [reporting, setReporting] = createSignal(false);
  const [page, setPage] = createSignal(0);
  const [hidden, setHidden] = createSignal(!!d().hidden);

  const doRate = async (n: number) => {
    if (mine()) return setMsg("Kendi tasarımına puan veremezsin");
    try {
      const had = stars() ?? 0;
      await rateDash(d().id, n);
      const cnt = avg().n + (had ? 0 : 1);
      setAvg({ v: (avg().v * avg().n - had + n) / Math.max(1, cnt), n: cnt });
      refetchStars();
      props.onChanged();
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };

  /** Tasarımlarıma ekle: yeni yerel kimlikle, temizlenmiş kopya */
  const use = () => {
    setMsg("");
    const src = dash();
    if (!src) return setMsg("Tasarım okunamadı.");
    if (settings().dashes.length >= MAX_DASHES) return setMsg("En fazla 20 tasarım saklanabilir. Tasarımcı'dan birini sil.");
    const base = `${d().title} (${d().author_name || t("paylaşım")})`.slice(0, 60);
    const names = new Set(settings().dashes.map((x) => x.name));
    let name = base;
    for (let i = 2; names.has(name); i++) name = `${base.slice(0, 56)} ${i}`;
    const copy = sanitizeDashes([cloneDash(src, name)])[0];
    if (!copy) return setMsg("Tasarım okunamadı.");
    updateSettings((s) => void s.dashes.push(copy));
    dashDownloaded(d().id);
    setAdded(copy.id);
    setMsg(t('"{0}" tasarımlarına eklendi. Tasarımcı\'da düzenleyebilir, Direksiyon Ekranı › Görünüm listesinden seçebilirsin.', name));
    props.onChanged();
  };

  const send = async () => {
    const b = text().trim();
    if (!b) return;
    try {
      await addDashComment(d().id, b);
      setText("");
      refetch();
      props.onChanged();
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };

  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal cm-detail wide cx-detail">
        <header>
          <div class="cx-dhead">
            <span class="cx-kicker">Direksiyon ekranı</span>
            <h3 data-no-i18n>{d().title}</h3>
            <div class="cx-byline">
              <Author name={d().author_name} iracing={d().author_iracing} />
              <small class="cx-date" title={new Date(d().created_at).toLocaleString(localeTag())}>
                {new Date(d().created_at).toLocaleDateString(localeTag())} · {relTime(d().created_at)}
              </small>
            </div>
          </div>
          <button class="btn ghost small cx-close" onClick={props.onClose} title="Kapat">
            <I.X />
          </button>
        </header>

        <div class="cx-dprev dash-dprev">
          <Show when={dash()} fallback={<p class="muted">Tasarım okunamadı.</p>}>
            <DashPreview dash={dash()!} animate page={page()} />
          </Show>
        </div>
        <Show when={(dash()?.pages.length ?? 0) > 1}>
          <div class="seg dash-pages">
            <For each={dash()!.pages}>
              {(p, i) => (
                <button classList={{ on: page() === i() }} onClick={() => setPage(i())} data-no-i18n>
                  {p.name}
                </button>
              )}
            </For>
          </div>
        </Show>

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
            <b>{compact(d().downloads)}</b>
          </div>
          <div>
            <small>Yorum</small>
            <b>{cmts()?.length ?? d().comment_count ?? 0}</b>
          </div>
          <div>
            <small>Tuval</small>
            <b data-no-i18n>
              {d().width}×{d().height}
            </b>
          </div>
          <div>
            <small>Sayfa</small>
            <b>{d().page_count}</b>
          </div>
          <div>
            <small>Bileşen</small>
            <b>{d().widget_count}</b>
          </div>
        </div>
        <Show when={d().description}>
          <p class="cm-desc" data-no-i18n>
            {d().description}
          </p>
        </Show>
        <Show when={hidden()}>
          <p class="muted small">Bu paylaşım gizli: yalnızca sahibi ve moderatörler görür.</p>
        </Show>

        <div class="btns">
          <Show
            when={!dashUseLocked()}
            fallback={
              <button class="btn ghost pro-lock" title="Bu özellik PRO üyelere açık" onClick={() => go("pro")}>
                <I.Lock /> Kullanmak için PRO
              </button>
            }
          >
            <button class="btn primary" onClick={use} disabled={!dash()}>
              <I.Download /> İndir / Tasarımlarıma ekle
            </button>
            <Show when={added()}>
              <button
                class="btn"
                onClick={() => {
                  const also = useDashInOverlay(added());
                  setMsg(also ? "Direksiyon Ekranı'nın varsayılan görünümü ve etkin düzendeki kopyası bu tasarım oldu." : "Direksiyon Ekranı'nın varsayılan görünümü bu tasarım oldu (Overlaylarım).");
                }}
              >
                <I.Gauge /> Direksiyon Ekranı'nda kullan
              </button>
            </Show>
          </Show>
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
          <Show when={can("layouts.delete")}>
            <button
              class="btn ghost"
              onClick={async () => {
                try {
                  await setDashHidden(d().id, !hidden());
                  setHidden(!hidden());
                  props.onChanged();
                } catch (e) {
                  setMsg(String((e as Error).message));
                }
              }}
            >
              {hidden() ? "Göster" : "Gizle"}
            </button>
          </Show>
          <Show when={mine() || can("layouts.delete")}>
            <button
              class="btn ghost danger"
              onClick={async () => {
                if (!confirm(t("Bu paylaşım silinsin mi?"))) return;
                try {
                  await deleteDash(d().id);
                  props.onChanged();
                  props.onClose();
                } catch (e) {
                  setMsg(String((e as Error).message));
                }
              }}
            >
              Sil
            </button>
          </Show>
        </div>
        <Show when={msg()}>
          <p class="success">{msg()}</p>
        </Show>

        <h4>Yorumlar ({cmts()?.length ?? 0})</h4>
        <CommentList
          items={cmts() ?? []}
          reportType="dash_comment"
          canEdit={(c) => session()?.user.id === c.user_id || can("comments.edit")}
          canDelete={(c) => session()?.user.id === c.user_id || mine() || can("comments.delete")}
          onEdit={async (c, b) => {
            await editDashComment(c.id, b);
            refetch();
          }}
          onDelete={async (c) => {
            await deleteDashComment(c.id);
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
          <ReportDialog type="dash" id={d().id} what={d().title} onClose={() => setReporting(false)} />
        </Show>
      </div>
    </div>
  );
}

/** Tasarımı toplulukta paylaş (Tasarımcı'dan `dashId` ile, topluluk sayfasından tasarım seçerek açılır) */
export function DashShareDialog(props: { dashId?: string; onClose: () => void; onShared: () => void }) {
  const dashes = () => settings().dashes;
  const [did, setDid] = createSignal(props.dashId ?? dashes()[0]?.id ?? "");
  const cur = createMemo(() => dashes().find((x) => x.id === did()));
  const [title, setTitle] = createSignal(cur()?.name ?? "");
  const [desc, setDesc] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  // Daha önce paylaşıldıysa: öncekini güncelle (kimlik, puanlar, indirmeler, yorumlar kalır) ya da yeni paylaşım
  const [prev] = createResource(
    () => (session() && cur() ? ([did(), cur()!.sharedId ?? "", cur()!.name] as const) : null),
    ([, sid, name]) => findMyDashShare(sid || undefined, name).catch(() => null),
  );
  const [mode, setMode] = createSignal<"replace" | "new">("replace");
  const replacing = () => !!prev() && mode() === "replace";
  createEffect(() => {
    const x = prev();
    if (!x) return;
    setTitle(x.title);
    setDesc(x.description ?? "");
  });
  // Paylaşmak, tasarımcının kendisiyle aynı kurala bağlı (dashboard.designer)
  const shareLocked = () => proLocked(F.dashDesigner);
  const widgets = () => cur()?.pages.reduce((n, p) => n + p.widgets.length, 0) ?? 0;

  const submit = async () => {
    setErr("");
    const d = cur();
    if (!d) return setErr("Paylaşılacak tasarım yok.");
    if (!title().trim()) return setErr("Bir ad yaz.");
    if (!widgets()) return setErr("Bu tasarımda hiç bileşen yok.");
    setBusy(true);
    try {
      const v = { title: title(), description: desc(), dash: d };
      const row = replacing() ? await updateSharedDash(prev()!.id, v) : await shareDash(v);
      // Hangi paylaşım olduğu yerel tasarımda saklanır: sonraki paylaşımda "öncekini güncelle" sorulur
      const local = d.id;
      if (row?.id)
        updateSettings((s) => {
          const x = s.dashes.find((y) => y.id === local);
          if (x) x.sharedId = row.id;
        });
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
          <h3>Tasarımı toplulukta paylaş</h3>
          <button class="btn ghost small" onClick={props.onClose}>
            Vazgeç
          </button>
        </header>
        <Show when={session()} fallback={<p class="muted">Paylaşmak için giriş yapmalısın.</p>}>
          <Show
            when={dashes().length > 0}
            fallback={
              <>
                <p class="muted">Henüz tasarımın yok. Önce Araçlar › Dashboard Tasarımcısı'nda bir direksiyon ekranı tasarla.</p>
                <button class="btn primary" onClick={() => (props.onClose(), go("tools", "dash"))}>
                  <I.Pencil /> Tasarımcıyı aç
                </button>
              </>
            }
          >
            <div class="row">
              <b>Tasarım</b>
              <select class="input" value={did()} disabled={!!props.dashId} onChange={(e) => (setDid(e.currentTarget.value), setTitle(cur()?.name ?? ""), setDesc(""))}>
                <For each={dashes()}>
                  {(x) => (
                    <option value={x.id} selected={x.id === did()} data-no-i18n>
                      {x.name}
                    </option>
                  )}
                </For>
              </select>
            </div>
            <div class="row">
              <b>Başlık</b>
              <input class="input admin-wide" maxLength={60} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
            </div>
            <textarea class="input cm-textarea" rows={3} maxLength={1000} placeholder="Açıklama (hangi araç / seri için, hangi sayfada ne var…)" value={desc()} onInput={(e) => setDesc(e.currentTarget.value)} />
            <Show when={prev()}>
              <div class="row">
                <div>
                  <b>Bu tasarımı daha önce paylaştın</b>
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
            <Show when={cur()}>
              <div class="cx-dprev dash-dprev small">
                <DashPreview dash={cur()!} />
              </div>
            </Show>
            <p class="muted small">
              {t("{0} sayfa, {1} bileşen paylaşılacak.", cur()?.pages.length ?? 0, widgets())} Görünen adın{profile()?.iracing_name ? " ve iRacing adın" : ""} tasarımla birlikte görünür.
            </p>
            <Show when={err()}>
              <p class="error">{err()}</p>
            </Show>
            <Show when={shareLocked()}>
              <p class="muted">
                <span class="pro-badge small">PRO</span> Tasarım paylaşmak PRO özelliğidir.{" "}
                <button class="link" onClick={() => go("pro")}>
                  PRO'ya geç
                </button>
              </p>
            </Show>
            <button class="btn primary" disabled={busy() || shareLocked() || !cur()} onClick={submit}>
              {busy() ? "Paylaşılıyor…" : replacing() ? "Paylaşımı güncelle" : "Paylaş"}
            </button>
          </Show>
        </Show>
      </div>
    </div>
  );
}
