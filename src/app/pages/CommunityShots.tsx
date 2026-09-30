// Topluluk → Ekran Görüntüleri: paylaşılan görüntüler, puanlar, yorumlar, raporlama.
// Görüntülemek, puanlamak, yorum yazmak ve arka plan yapmak herkese açık; paylaşmak PRO.

import { For, Show, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { localeTag, t } from "@/sdk/i18n";
import { cloudEnabled, session } from "@/cloud/supabase";
import { isPro } from "@/cloud/account";
import { can } from "@/cloud/moderation";
import {
  addShotComment,
  deleteShot,
  deleteShotComment,
  editShotComment,
  myRatedShotIds,
  myShotRating,
  queryShots,
  rateShot,
  shotFacets,
  shotComments,
  shotThumbUrl,
  shotUrl,
  shotViewed,
  updateShot,
  type SharedShot,
  type ShotSortX,
} from "@/cloud/shots";
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
import { importEditBackdrop } from "../components/Shots";
import { CommentList, ReportDialog } from "../components/Moderation";
import { LoginWall, Stars } from "./CommunityPage";
import { go } from "../ui";
import * as I from "../icons";

/** Ekran görüntüsü kartı (liste ve ana sayfa) */
export function ShotCard(p: { s: SharedShot; rank?: number; onOpen: () => void; onAuthor?: (n: string) => void; onTrack?: (v: string) => void; onCar?: (v: string) => void }) {
  const s = () => p.s;
  const fresh = () => Date.now() - new Date(s().created_at).getTime() < 3 * 86400_000;
  const [loaded, setLoaded] = createSignal(false);
  const pick = (fn: ((v: string) => void) | undefined, v: string) => (e: MouseEvent) => {
    if (!fn) return;
    e.stopPropagation();
    fn(v);
  };
  return (
    <div class="cx-card shot" role="button" tabIndex={0} onClick={p.onOpen} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), p.onOpen())}>
      <div class="cx-cover" classList={{ loaded: loaded() }}>
        <img src={shotThumbUrl(s())} alt="" loading="lazy" draggable={false} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
        <div class="cx-badges">
          <Show when={p.rank}>
            <i class="cx-rank">{p.rank}</i>
          </Show>
          <Show when={fresh() && !p.rank}>
            <i class="cx-new">YENİ</i>
          </Show>
          <span class="lt-sp" />
          <Show when={s().views !== undefined}>
            <i class="cx-res">
              <I.Eye /> {compact(s().views)}
            </i>
          </Show>
        </div>
        <div class="cx-cover-cap">
          <Show when={s().track}>
            <span class="cx-tag glass" data-no-i18n title={s().track} onClick={pick(p.onTrack, s().track)}>
              <I.Map /> <span>{s().track}</span>
            </span>
          </Show>
          <Show when={s().car}>
            <span class="cx-tag glass" data-no-i18n title={s().car} onClick={pick(p.onCar, s().car)}>
              <I.Car /> <span>{s().car}</span>
            </span>
          </Show>
        </div>
      </div>
      <div class="cx-body">
        <b class="cx-title" data-no-i18n title={s().title}>
          {s().title}
        </b>
        <div class="cx-byline">
          <Author name={s().author_name} iracing={s().author_iracing} onClick={p.onAuthor ? () => p.onAuthor!(s().author_name) : undefined} />
          <small class="cx-date" title={new Date(s().created_at).toLocaleString(localeTag())}>
            {relTime(s().created_at)}
          </small>
        </div>
        <div class="cx-stats">
          <span class="cx-rating" classList={{ none: !s().rating_count }}>
            <span class="cx-star">★</span>
            <b>{s().rating_count ? Number(s().rating_avg).toFixed(1) : "—"}</b>
            <small>({s().rating_count})</small>
          </span>
          <span title="Yorum">
            <I.MessageCircle /> {compact(s().comment_count)}
          </span>
        </div>
      </div>
    </div>
  );
}

type STab = "all" | "mine" | "rated";

const SHOT_SORTS: { id: ShotSortX; label: string }[] = [
  { id: "new", label: "En yeni" },
  { id: "trend7", label: "Haftanın popülerleri" },
  { id: "trend30", label: "Ayın popülerleri" },
  { id: "views", label: "En çok görüntülenen" },
  { id: "top", label: "En yüksek puan" },
  { id: "votes", label: "En çok oy alan" },
  { id: "comments", label: "En çok yorumlanan" },
  { id: "old", label: "En eski" },
];

interface SFilters {
  sort: ShotSortX;
  days: number;
  author: string;
  track: string;
  car: string;
  minRating: number;
  minViews: number;
  hasComments: boolean;
  edited: boolean;
}
const S_DEFAULT: SFilters = { sort: "new", days: 0, author: "", track: "", car: "", minRating: 0, minViews: 0, hasComments: false, edited: false };

export function CommunityShots() {
  const [q, setQ] = createSignal("");
  const dq = debounced(q);
  const [f, setF] = stored<SFilters>("pitwall.cx.shots.filters", S_DEFAULT);
  const [panel, setPanel] = stored<boolean>("pitwall.cx.shots.panel", false);
  const set = <K extends keyof SFilters>(k: K, v: SFilters[K]) => setF({ ...f(), [k]: v });
  const [tab, setTab] = createSignal<STab>("all");
  const [version, setVersion] = createSignal(0);
  const [open, setOpen] = createSignal<SharedShot | null>(null);
  const PAGE = 30;
  const sig = createMemo(() => JSON.stringify([dq(), f(), tab()]));
  const [pageState, setPageState] = createSignal({ sig: "", n: 1 });
  const pages = () => (pageState().sig === sig() ? pageState().n : 1);

  const [stats] = createResource(() => (session() ? 1 : null), () => communityStats().catch(() => undefined));
  const [facets] = createResource(() => (session() ? 1 : null), () => shotFacets().catch(() => ({ tracks: [], cars: [] })));
  const [ratedIds] = createResource(
    () => (session() && tab() === "rated" ? version() + 1 : null),
    () => myRatedShotIds().catch(() => [] as string[]),
  );
  const [list] = createResource(
    () => {
      if (!session()) return null;
      if (tab() === "rated" && !ratedIds()) return null;
      return { q: dq(), f: f(), tab: tab(), v: version(), p: pages(), ids: tab() === "rated" ? ratedIds() : undefined };
    },
    (k) => queryShots({ ...k.f, q: k.q, userId: k.tab === "mine" ? session()?.user.id : undefined, ids: k.ids ?? undefined }, 0, PAGE * k.p),
  );
  const items = () => list.latest ?? [];
  const hasMore = () => (list.latest?.length ?? 0) >= PAGE * pages();

  const chips = createMemo(() => {
    const x = f();
    const c: ActiveChip[] = [];
    const clr = (k: keyof SFilters) => () => set(k, S_DEFAULT[k] as never);
    if (x.days) c.push({ label: "Tarih", value: periodLabel(x.days), clear: clr("days") });
    if (x.author) c.push({ label: "Kullanıcı", value: x.author, raw: true, clear: clr("author") });
    if (x.track) c.push({ label: "Pist", value: x.track, raw: true, clear: clr("track") });
    if (x.car) c.push({ label: "Araç", value: x.car, raw: true, clear: clr("car") });
    if (x.minRating) c.push({ label: "Puan", value: t("{0}+ yıldız", x.minRating), clear: clr("minRating") });
    if (x.minViews) c.push({ label: "Görüntülenme", value: `≥ ${x.minViews}`, raw: true, clear: clr("minViews") });
    if (x.hasComments) c.push({ label: "Yorum", value: "Yorumu olanlar", clear: clr("hasComments") });
    if (x.edited) c.push({ label: "Durum", value: "Düzenlenmiş", clear: clr("edited") });
    return c;
  });
  const clearAll = () => {
    setF({ ...S_DEFAULT, sort: f().sort });
    setQ("");
  };

  if (!cloudEnabled) {
    return (
      <div class="page narrow">
        <section class="panel">
          <h3>Topluluk kapalı</h3>
          <p class="muted">Paylaşım için bulut bağlantısı gerekir (bkz. Hesap sayfası).</p>
        </section>
      </div>
    );
  }

  const shareBtn = () => (
    <Show
      when={isPro()}
      fallback={
        <button class="btn primary" onClick={() => go("pro")} title="Görüntü paylaşmak PRO özelliğidir; görüntülemek, puanlamak ve arka plan yapmak herkese açık">
          <I.Lock /> PRO ile paylaş
        </button>
      }
    >
      <button class="btn primary" onClick={() => go("shots")}>
        <I.Camera /> Görüntü paylaş
      </button>
    </Show>
  );

  return (
    <Show when={session()} fallback={<LoginWall what="Topluluk ekran görüntüleri" />}>
      <div class="page cx-page">
        <Hero
          icon={<I.Camera />}
          kicker="Topluluk"
          title="Ekran görüntüleri"
          sub="Pistten en güzel anlar. Puanla, yorum yaz ya da beğendiğin görüntüyü düzenleme arka planı yap."
          stats={[
            { n: stats()?.shots, label: "Görsel" },
            { n: stats()?.views, label: "Görüntülenme" },
            { n: stats()?.comments, label: "Yorum" },
          ]}
          actions={shareBtn()}
        />

        <FilterBar
          tabs={
            <Tabs<STab>
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
          placeholder="Başlık, açıklama, kullanıcı, pist ya da araç ara"
          sort={f().sort}
          sorts={SHOT_SORTS}
          onSort={(v) => set("sort", v as ShotSortX)}
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
          <FGroup label="Pist" hint={facets()?.tracks.length ? t("{0} pist", facets()!.tracks.length) : undefined}>
            <TextFilter value={f().track} onChange={(v) => set("track", v)} placeholder="Pist adı" options={(facets()?.tracks ?? []).slice(0, 100).map((x) => x.name)} />
          </FGroup>
          <FGroup label="Araç" hint={facets()?.cars.length ? t("{0} araç", facets()!.cars.length) : undefined}>
            <TextFilter value={f().car} onChange={(v) => set("car", v)} placeholder="Araç adı" options={(facets()?.cars ?? []).slice(0, 100).map((x) => x.name)} />
          </FGroup>
          <FGroup label="En düşük puan">
            <MinStars value={f().minRating} onChange={(v) => set("minRating", v)} />
          </FGroup>
          <FGroup label="En az görüntülenme">
            <Pills
              value={f().minViews}
              options={[
                { id: 0, label: "Hepsi" },
                { id: 25, label: "25+" },
                { id: 100, label: "100+" },
                { id: 500, label: "500+" },
              ]}
              onChange={(v) => set("minViews", v)}
            />
          </FGroup>
          <FGroup label="Kullanıcı">
            <TextFilter value={f().author} onChange={(v) => set("author", v)} placeholder="Görünen ad ya da iRacing adı" />
          </FGroup>
          <FGroup label="Diğer">
            <Toggle checked={f().hasComments} label="Yalnızca yorumu olanlar" onChange={(v) => set("hasComments", v)} />
            <Toggle checked={f().edited} label="Düzenlenmiş olanlar" onChange={(v) => set("edited", v)} />
          </FGroup>
          <Show when={(facets()?.tracks.length ?? 0) > 0}>
            <FGroup label="Popüler pistler" wide>
              <div class="cx-quick">
                <For each={facets()!.tracks.slice(0, 10)}>
                  {(x) => (
                    <button classList={{ on: f().track === x.name }} onClick={() => set("track", f().track === x.name ? "" : x.name)} data-no-i18n>
                      {x.name} <small>{x.count}</small>
                    </button>
                  )}
                </For>
              </div>
            </FGroup>
          </Show>
        </FilterBar>

        <Show when={list.error}>
          <p class="error">{String(list.error?.message ?? list.error)}</p>
        </Show>

        <Show when={list.latest || !list.loading} fallback={<SkeletonGrid n={9} kind="shot" class="cx-grid shots" />}>
          <Show
            when={items().length > 0}
            fallback={
              <Show when={!list.loading && !list.error}>
                <EmptyState
                  icon={<I.Camera />}
                  title={tab() === "mine" ? "Henüz görüntü paylaşmadın." : tab() === "rated" ? "Henüz puan vermedin." : "Bu filtrelere uyan görüntü yok."}
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
            <div class="cx-grid shots" classList={{ busy: list.loading }}>
              <For each={items()}>
                {(s) => (
                  <ShotCard
                    s={s}
                    onOpen={() => setOpen(s)}
                    onAuthor={(n) => (setTab("all"), set("author", n), setPanel(true))}
                    onTrack={(v) => (set("track", v), setPanel(true))}
                    onCar={(v) => (set("car", v), setPanel(true))}
                  />
                )}
              </For>
            </div>
            <LoadMore show={hasMore()} loading={list.loading} onClick={() => setPageState({ sig: sig(), n: pages() + 1 })} />
          </Show>
        </Show>

        <Show when={open()}>
          <SharedShotDetail s={open()!} onClose={() => setOpen(null)} onChanged={() => setVersion(version() + 1)} />
        </Show>
      </div>
    </Show>
  );
}

export function SharedShotDetail(props: { s: SharedShot; onClose: () => void; onChanged: () => void }) {
  const [s, setS] = createSignal(props.s);
  const mine = () => session()?.user.id === s().user_id;
  const canEditShot = () => mine() || can("shots.edit");
  const canDeleteShot = () => mine() || can("shots.delete");
  const [stars, { refetch: refetchStars }] = createResource(() => s().id, (id) => myShotRating(id).catch(() => 0));
  const [cmts, { refetch }] = createResource(() => s().id, shotComments);
  const [text, setText] = createSignal("");
  const [msg, setMsg] = createSignal<{ text: string; err?: boolean } | null>(null);
  const [avg, setAvg] = createSignal({ v: Number(s().rating_avg), n: s().rating_count });
  const [editing, setEditing] = createSignal(false);
  const [title, setTitle] = createSignal(s().title);
  const [desc, setDesc] = createSignal(s().description);
  const [reporting, setReporting] = createSignal(false);
  const err = (e: unknown) => setMsg({ text: String((e as Error)?.message ?? e), err: true });

  onMount(() => {
    shotViewed(s().id);
    const k = (e: KeyboardEvent) => e.key === "Escape" && !reporting() && props.onClose();
    window.addEventListener("keydown", k);
    onCleanup(() => window.removeEventListener("keydown", k));
  });

  const doRate = async (n: number) => {
    if (!session()) return setMsg({ text: "Puan vermek için giriş yap.", err: true });
    if (mine()) return setMsg({ text: "Kendi görüntüne puan veremezsin.", err: true });
    try {
      const had = stars() ?? 0;
      await rateShot(s().id, n);
      const cnt = avg().n + (had ? 0 : 1);
      setAvg({ v: (avg().v * avg().n - had + n) / Math.max(1, cnt), n: cnt });
      refetchStars();
      setMsg({ text: t("Puanın kaydedildi: {0} yıldız", n) });
      props.onChanged();
    } catch (e) {
      err(e);
    }
  };

  const send = async () => {
    const b = text().trim();
    if (!b) return;
    try {
      await addShotComment(s().id, b);
      setText("");
      refetch();
      props.onChanged();
    } catch (e) {
      err(e);
    }
  };

  const saveEdit = async () => {
    if (!title().trim()) return setMsg({ text: "Bir başlık yaz.", err: true });
    try {
      await updateShot(s().id, { title: title().trim().slice(0, 80), description: desc().trim().slice(0, 1000) });
      setS({ ...s(), title: title().trim(), description: desc().trim(), edited_at: new Date().toISOString() });
      setEditing(false);
      setMsg({ text: "Kaydedildi" });
      props.onChanged();
    } catch (e) {
      err(e);
    }
  };

  const asBackdrop = async () => {
    try {
      const blob = await fetch(shotUrl(s())).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      });
      await importEditBackdrop(blob);
      setMsg({ text: "Düzenleme arka planı olarak ayarlandı" });
    } catch (e) {
      err(e);
    }
  };

  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal shot-viewer">
        <header>
          <div class="shot-viewer-title">
            <Show when={!editing()} fallback={<input class="input shot-title-edit" maxLength={80} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />}>
              <h3 data-no-i18n>{s().title}</h3>
            </Show>
            <small class="muted">
              <span data-no-i18n>
                {s().author_name}
                {s().author_iracing ? ` · iRacing: ${s().author_iracing}` : ""}
              </span>{" "}
              · {new Date(s().created_at).toLocaleDateString(localeTag())}
              <Show when={s().edited_at}> · düzenlendi</Show>
              <Show when={s().views !== undefined}>{` · ${(s().views ?? 0) + 1} görüntülenme`}</Show>
            </small>
          </div>
          <button class="btn ghost small" onClick={props.onClose}>
            Kapat
          </button>
        </header>
        <div class="shot-big">
          <img src={shotUrl(s())} alt="" title="Tam boyut için tıkla" onClick={() => invoke("open_url", { url: shotUrl(s()) })} />
        </div>

        <div class="shot-rate-row">
          <div class="shot-rate-avg">
            <Stars value={avg().v} big />
            <span>
              <b>{avg().v ? avg().v.toFixed(1) : "—"}</b> <small class="muted">{`(${avg().n} oy)`}</small>
            </span>
          </div>
          <Show when={session()} fallback={<span class="muted small">Puan vermek için hesap oluştur ya da giriş yap.</span>}>
            <Show when={!mine()} fallback={<span class="muted small">Kendi görüntüne puan veremezsin.</span>}>
              <div class="shot-rate-mine">
                <span class="muted small">Puanın:</span>
                <Stars value={0} mine={stars() ?? 0} onRate={doRate} big />
              </div>
            </Show>
          </Show>
        </div>

        <div class="cm-detail-meta">
          <Show when={s().track}>
            <span data-no-i18n>{s().track}</span>
          </Show>
          <Show when={s().car}>
            <span data-no-i18n>{s().car}</span>
          </Show>
          <Show when={s().width}>
            <span class="cm-res">
              {s().width}×{s().height}
            </span>
          </Show>
        </div>
        <Show
          when={!editing()}
          fallback={<textarea class="input cm-textarea" rows={3} maxLength={1000} placeholder="Açıklama" value={desc()} onInput={(e) => setDesc(e.currentTarget.value)} />}
        >
          <Show when={s().description}>
            <p class="cm-desc" data-no-i18n>
              {s().description}
            </p>
          </Show>
        </Show>
        <div class="btns">
          <Show when={editing()}>
            <button class="btn primary" onClick={saveEdit}>
              Kaydet
            </button>
            <button class="btn ghost" onClick={() => (setTitle(s().title), setDesc(s().description), setEditing(false))}>
              Vazgeç
            </button>
          </Show>
          <Show when={!editing()}>
            <button class="btn ghost" onClick={asBackdrop} title="Düzenleme modunda overlay'lerin arkasında gösterilir">
              Düzenleme arka planı yap
            </button>
            <button class="btn ghost" onClick={() => invoke("open_url", { url: shotUrl(s()) })}>
              Tam boyut aç
            </button>
            <span class="lt-sp" />
            <Show when={canEditShot()}>
              <button class="btn ghost" onClick={() => setEditing(true)}>
                <I.Pencil /> Düzenle
              </button>
            </Show>
            <Show when={canDeleteShot()}>
              <button
                class="btn ghost danger"
                onClick={async () => {
                  if (!confirm("Bu paylaşım silinsin mi?")) return;
                  try {
                    await deleteShot(s());
                    props.onChanged();
                    props.onClose();
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                <I.Trash /> Sil
              </button>
            </Show>
            <Show when={session() && !mine()}>
              <button class="btn ghost" onClick={() => setReporting(true)}>
                <I.Flag /> Raporla
              </button>
            </Show>
          </Show>
        </div>
        <Show when={msg()}>
          <p classList={{ success: !msg()!.err, error: !!msg()!.err }}>{msg()!.text}</p>
        </Show>

        <h4>Yorumlar ({cmts()?.length ?? 0})</h4>
        <CommentList
          items={cmts() ?? []}
          reportType="shot_comment"
          canEdit={(c) => session()?.user.id === c.user_id || can("comments.edit")}
          canDelete={(c) => session()?.user.id === c.user_id || mine() || can("comments.delete")}
          onEdit={async (c, b) => {
            await editShotComment(c.id, b);
            refetch();
          }}
          onDelete={async (c) => {
            await deleteShotComment(c.id);
            refetch();
            props.onChanged();
          }}
          onError={(m) => setMsg({ text: m, err: true })}
        />
        <Show when={session()} fallback={<p class="muted small">Yorum yazmak için hesap oluştur ya da giriş yap.</p>}>
          <div class="fr-add">
            <input class="input" maxLength={1000} placeholder="Yorum yaz" value={text()} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            <button class="btn" onClick={send}>
              Gönder
            </button>
          </div>
        </Show>
        <Show when={reporting()}>
          <ReportDialog type="shot" id={s().id} what={s().title} onClose={() => setReporting(false)} />
        </Show>
      </div>
    </div>
  );
}
