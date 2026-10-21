// Ana sayfa: uygulama açılınca ilk görünen sayfa. En üstte reklam (ücretli "ana sayfa üst banner" reklamı; yoksa
// yöneticinin ana sayfa reklamları; o da yoksa "Bu alana reklam ver"), altında yöneticinin yazdığı haberler.
// İkinci haberin altında "haberler arası" reklam alanı.
//
// Haber (c133): kategori, özet, vurgu rengi, görünüm (standart / büyük kapak / yan görsel), kapak görselinin nasıl
// sığacağı (tamamı / 16:9 / ince banner), biçimli metin (kalın, italik, başlık, liste, alıntı, bağlantı), galeri,
// YouTube videosu, bağlantı düğmeleri. Altında beğeni ve yorumlar (giriş yapan herkes yazar; yönetici siler).
// Yönetici haberleri bu sayfada ekler / düzenler (canlı önizlemeyle) / sabitler / yayından kaldırır / siler.

import { For, Index, Show, createMemo, createResource, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { localeTag, t } from "@/sdk/i18n";
import { cloudEnabled, session } from "@/cloud/supabase";
import { isAdmin, isPro } from "@/cloud/account";
import { avatarUrl } from "@/cloud/profile";
import {
  homeBannerHit,
  homeBanners,
  homeCommentAdd,
  homeCommentDelete,
  homeCommentEdit,
  homeComments,
  homeLike,
  homePostAdd,
  homePostDelete,
  homePostSave,
  homePosts,
  homeStats,
  liveBanners,
  okUrl,
  uploadHomeImage,
  youtubeId,
  type HomeBanner,
  type HomeComment,
  type HomeImageFit,
  type HomeLayout,
  type HomeLink,
  type HomePost,
  type HomePostInput,
  type HomeStat,
} from "@/cloud/home";
import { AdSlot } from "../components/AdSlot";
import { MsgText, openProfile } from "../components/FriendsDock";
import { go, openUrl } from "../ui";
import * as I from "../icons";
import "./home.css";

const fmtDate = (v: string) => new Date(v).toLocaleDateString(localeTag(), { day: "numeric", month: "long", year: "numeric" });

/** "3 dk önce", "2 sa önce", "5 gün önce", sonra tarih */
function ago(v: string) {
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return t("az önce");
  if (s < 3600) return t("{0} dk önce", Math.floor(s / 60));
  if (s < 86400) return t("{0} sa önce", Math.floor(s / 3600));
  if (s < 7 * 86400) return t("{0} gün önce", Math.floor(s / 86400));
  return new Date(v).toLocaleDateString(localeTag(), { day: "numeric", month: "short", year: "numeric" });
}

/** Sunucuda c133 yoksa anlaşılır hata */
const errText = (e: unknown) => {
  const m = String((e as Error)?.message ?? e);
  return /schema cache|column|home_comment|home_like|home_post_stats/i.test(m) ? `${m} — ${t("Supabase'de c133_guncelleme.sql çalıştırılmalı.")}` : m;
};

/** Hazır kategoriler (serbest de yazılabilir) */
const CATEGORIES = ["Duyuru", "Güncelleme", "Etkinlik", "Yarış", "Rehber", "Kampanya", "Topluluk"];
/** Hazır vurgu renkleri */
const ACCENTS = ["", "#ff8a2a", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#eab308", "#14b8a6", "#ec4899"];

export function HomePage() {
  const [ver, setVer] = createSignal(0);
  const [posts, { refetch }] = createResource(ver, () => (cloudEnabled ? homePosts() : Promise.resolve([] as HomePost[])));
  const [stats, { mutate: setStats, refetch: refetchStats }] = createResource(
    () => [ver(), session()?.user.id ?? ""] as const,
    () => (cloudEnabled ? homeStats() : Promise.resolve(new Map<string, HomeStat>())),
  );
  const [editing, setEditing] = createSignal<HomePost | "new" | null>(null);
  const [err, setErr] = createSignal("");
  const reload = () => setVer(ver() + 1);

  const act = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
      refetch();
    } catch (e) {
      setErr(errText(e));
    }
  };
  const stat = (id: string): HomeStat => stats()?.get(id) ?? { post_id: id, likes: 0, comments: 0, liked: false };
  const patchStat = (id: string, p: Partial<HomeStat>) =>
    setStats((m) => {
      const n = new Map(m ?? []);
      n.set(id, { ...stat(id), ...p });
      return n;
    });

  return (
    <div class="page home" classList={{ editing: !!editing() }}>
      <HomeTopAd />

      <div class="home-head">
        <h2>
          <I.Newspaper /> {t("Haberler")}
        </h2>
        <Show when={isAdmin()}>
          <button class="btn primary small" onClick={() => setEditing("new")}>
            <I.Plus /> {t("Haber ekle")}
          </button>
        </Show>
      </div>
      <Show when={err()}>
        <p class="error">{err()}</p>
      </Show>

      <Show when={editing() === "new"}>
        <PostEditor
          onCancel={() => setEditing(null)}
          onSave={async (p) => {
            await homePostAdd(p);
            setEditing(null);
            reload();
          }}
        />
      </Show>

      <Show when={!cloudEnabled}>
        <p class="muted">{t("Haberler için bulut bağlantısı gerekli.")}</p>
      </Show>
      <Show when={posts.error}>
        <p class="muted">{t("Haberler yüklenemedi. İnternet bağlantını kontrol et.")}</p>
      </Show>

      <div class="home-feed">
        <For
          each={posts() ?? []}
          fallback={
            <Show when={!posts.loading && cloudEnabled && !posts.error}>
              <div class="home-empty">
                <I.Newspaper />
                <p>{t("Henüz haber yok.")}</p>
                <Show when={isAdmin()}>
                  <small class="muted">{t("İlk haberi \"Haber ekle\" ile yazabilirsin.")}</small>
                </Show>
              </div>
            </Show>
          }
        >
          {(p, i) => (
            <>
              <Show
                when={editing() !== p && (editing() as HomePost | null)?.id !== p.id}
                fallback={
                  <PostEditor
                    post={p}
                    onCancel={() => setEditing(null)}
                    onSave={async (v) => {
                      await homePostSave(p.id, v);
                      setEditing(null);
                      reload();
                    }}
                  />
                }
              >
                <PostCard
                  post={p}
                  stat={stat(p.id)}
                  onStat={(x) => patchStat(p.id, x)}
                  onCommentsChanged={() => void refetchStats()}
                  onEdit={() => setEditing(p)}
                  onPin={() => act(() => homePostSave(p.id, { pinned: !p.pinned }))}
                  onPublish={() => act(() => homePostSave(p.id, { published: !p.published }))}
                  onDelete={() => confirm(t('"{0}" haberi silinsin mi?', p.title)) && act(() => homePostDelete(p.id))}
                />
              </Show>
              <Show when={i() === Math.min(1, (posts() ?? []).length - 1)}>
                <AdSlot placement="home_feed" class="home-feed-ad" />
              </Show>
            </>
          )}
        </For>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// En üstteki reklam: yöneticinin ana sayfa reklamları (birden çoksa 8 sn'de bir döner); yoksa ücretli reklam alanı
// ---------------------------------------------------------------------------
function HomeTopAd() {
  const [list] = createResource(() => (cloudEnabled ? homeBanners().catch(() => [] as HomeBanner[]) : Promise.resolve([] as HomeBanner[])));
  const live = createMemo(() => liveBanners(list() ?? [], isPro()));
  const [i, setI] = createSignal(0);
  const seen = new Set<string>();
  onMount(() => {
    const tm = window.setInterval(() => live().length > 1 && setI((x) => (x + 1) % live().length), 8000);
    onCleanup(() => clearInterval(tm));
  });
  const cur = () => {
    const l = live();
    return l.length ? l[i() % l.length] : null;
  };
  // Gösterim: her reklam bu açılışta bir kez sayılır
  const shown = (b: HomeBanner) => {
    if (seen.has(b.id) || isAdmin()) return;
    seen.add(b.id);
    void homeBannerHit(b.id);
  };
  const click = (b: HomeBanner) => {
    if (!b.url) return;
    if (!isAdmin()) void homeBannerHit(b.id, true);
    openUrl(b.url);
  };
  const house = () => (
    <Show when={cur()}>
      {(b) => (
        <div class="home-ad home-banner" classList={{ link: !!b().url }} title={b().title || b().url} onClick={() => click(b())}>
          <img src={b().image} alt={b().title} draggable={false} onLoad={() => shown(b())} />
          <button
            class="ad-tag"
            onClick={(e) => {
              e.stopPropagation();
              go("advertise", "home_top");
            }}
          >
            {t("Reklam")} · <b>{t("Reklam vermek için tıklayın")}</b>
          </button>
          <Show when={live().length > 1}>
            <div class="home-dots">
              <For each={live()}>{(x, k) => <i classList={{ on: k() === i() % live().length }} onClick={(e) => (e.stopPropagation(), setI(k()))} title={x.title} />}</For>
            </div>
          </Show>
          <Show when={isAdmin()}>
            <button
              class="home-ad-edit"
              title={t("Ana sayfa reklamlarını yönet")}
              onClick={(e) => {
                e.stopPropagation();
                go("admin", "ads");
              }}
            >
              <I.Settings />
            </button>
          </Show>
        </div>
      )}
    </Show>
  );
  // Ücretli reklam önce; yoksa yöneticinin reklamları; o da yoksa "Bu alana reklam ver"
  return (
    <Show when={!list.loading}>
      <AdSlot placement="home_top" class="home-ad" fallback={live().length ? house() : undefined} />
    </Show>
  );
}

// ---------------------------------------------------------------------------
// Haber kartı
// ---------------------------------------------------------------------------
/** Bu uzunluğun üstündeki metin "Devamını oku" ile açılır */
const LONG = 900;

function PostCard(p: {
  post: HomePost;
  stat?: HomeStat;
  preview?: boolean;
  onStat?: (x: Partial<HomeStat>) => void;
  onCommentsChanged?: () => void;
  onEdit?: () => void;
  onPin?: () => void;
  onPublish?: () => void;
  onDelete?: () => void;
}) {
  const edited = () => new Date(p.post.updated_at).getTime() - new Date(p.post.created_at).getTime() > 60_000;
  const layout = (): HomeLayout => (p.post.image ? (p.post.layout ?? "standard") : "standard");
  const fit = (): HomeImageFit => p.post.image_fit ?? "full";
  const gallery = () => (p.post.gallery ?? []).filter(Boolean);
  const allImages = () => [p.post.image, ...gallery()].filter(Boolean);
  const [lightbox, setLightbox] = createSignal<number | null>(null);
  const [open, setOpen] = createSignal(false);
  const [showComments, setShowComments] = createSignal(false);
  const long = () => p.post.body.length > LONG && !p.preview;
  const accent = () => (p.post.accent && /^#[0-9a-f]{6}$/i.test(p.post.accent) ? p.post.accent : "");

  const cover = () => (
    <button class={`home-cover fit-${fit()}`} onClick={() => setLightbox(0)} title={t("Büyüt")}>
      <Show when={fit() === "full"}>
        {/* Görselin tamamı görünür; kenarlarda aynı görselin bulanık hali boşluğu doldurur */}
        <img class="home-cover-bg" src={p.post.image} alt="" aria-hidden="true" draggable={false} />
      </Show>
      <img class="home-img" src={p.post.image} alt="" loading="lazy" draggable={false} />
    </button>
  );

  const meta = () => (
    <div class="home-meta">
      <Show when={p.post.category}>
        <span class="home-cat" data-no-i18n>
          {p.post.category}
        </span>
      </Show>
      <Show when={p.post.pinned}>
        <span class="home-tag pin">
          <I.Pin /> {t("Sabit")}
        </span>
      </Show>
      <Show when={!p.post.published}>
        <span class="home-tag draft">{t("Yayında değil")}</span>
      </Show>
      <span class="muted">
        {fmtDate(p.post.created_at)}
        <Show when={edited()}> · {t("düzenlendi")}</Show>
      </span>
    </div>
  );

  return (
    <article
      class={`home-post lay-${layout()}`}
      classList={{ pinned: p.post.pinned, draft: !p.post.published, accented: !!accent() }}
      style={accent() ? { "--hp-accent": accent() } : undefined}
    >
      <Show when={layout() === "hero"}>
        <div class="home-hero" onClick={() => setLightbox(0)}>
          <img src={p.post.image} alt="" loading="lazy" draggable={false} />
          <div class="home-hero-text">
            {meta()}
            <h3 data-no-i18n>{p.post.title}</h3>
          </div>
        </div>
      </Show>
      <Show when={layout() === "standard" && p.post.image}>{cover()}</Show>
      <div class="home-main">
        <Show when={layout() === "side"}>
          <div class="home-side-img">{cover()}</div>
        </Show>
        <div class="home-body">
          <Show when={layout() !== "hero"}>
            {meta()}
            <h3 data-no-i18n>{p.post.title}</h3>
          </Show>
          <Show when={p.post.summary?.trim()}>
            <p class="home-summary" data-no-i18n>
              {p.post.summary}
            </p>
          </Show>
          <Show when={p.post.body.trim()}>
            <div class="home-text" classList={{ clipped: long() && !open() }} data-no-i18n>
              <RichText text={p.post.body} />
            </div>
            <Show when={long()}>
              <button class="link home-more" onClick={() => setOpen(!open())}>
                {open() ? t("Daha az göster") : t("Devamını oku")}
              </button>
            </Show>
          </Show>
          <Show when={youtubeId(p.post.video ?? "")}>{(id) => <Video id={id()} url={p.post.video!} />}</Show>
          <Show when={gallery().length}>
            <div class="home-gallery" classList={{ few: gallery().length < 3 }}>
              <For each={gallery()}>
                {(src, k) => (
                  <button onClick={() => setLightbox(k() + (p.post.image ? 1 : 0))}>
                    <img src={src} alt="" loading="lazy" draggable={false} />
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={(p.post.links ?? []).length}>
            <div class="home-links">
              <For each={p.post.links}>
                {(l) => (
                  <button class="btn small home-link" onClick={() => !p.preview && openUrl(l.url)} title={l.url} data-no-i18n>
                    <I.ExternalLink /> {l.label || l.url}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      <Show when={!p.preview}>
        <PostFooter
          post={p.post}
          stat={p.stat ?? { post_id: p.post.id, likes: 0, comments: 0, liked: false }}
          onStat={(x) => p.onStat?.(x)}
          comments={showComments()}
          toggleComments={() => setShowComments(!showComments())}
        />
        <Show when={showComments()}>
          <Comments post={p.post} onChanged={(n) => (p.onStat?.({ comments: n }), p.onCommentsChanged?.())} />
        </Show>
        <Show when={isAdmin()}>
          <div class="home-admin">
            <button class="btn ghost small" onClick={p.onEdit}>
              <I.Pencil /> {t("Düzenle")}
            </button>
            <button class="btn ghost small" onClick={p.onPin}>
              <I.Pin /> {p.post.pinned ? t("Sabitlemeyi kaldır") : t("Sabitle")}
            </button>
            <button class="btn ghost small" onClick={p.onPublish}>
              {p.post.published ? <I.EyeOff /> : <I.Eye />} {p.post.published ? t("Yayından kaldır") : t("Yayınla")}
            </button>
            <span class="lt-sp" />
            <button class="btn ghost small danger" onClick={p.onDelete}>
              <I.Trash /> {t("Sil")}
            </button>
          </div>
        </Show>
      </Show>

      <Show when={lightbox() != null}>
        <Lightbox images={allImages()} start={lightbox()!} onClose={() => setLightbox(null)} />
      </Show>
    </article>
  );
}

/** YouTube videosu: önce kapak resmi (hafif); tıklayınca oynatıcı açılır */
function Video(p: { id: string; url: string }) {
  const [play, setPlay] = createSignal(false);
  return (
    <div class="home-video">
      <Show
        when={play()}
        fallback={
          <button class="home-video-thumb" onClick={() => setPlay(true)} title={t("Videoyu oynat")}>
            <img src={`https://i.ytimg.com/vi/${p.id}/hqdefault.jpg`} alt="" loading="lazy" draggable={false} />
            <span class="home-video-play">
              <I.Play />
            </span>
          </button>
        }
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${p.id}?autoplay=1&rel=0`}
          title="YouTube"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowfullscreen
        />
      </Show>
      <button class="link home-video-ext" onClick={() => openUrl(p.url)}>
        <I.ExternalLink /> {t("YouTube'da aç")}
      </button>
    </div>
  );
}

/** Tam ekran görsel (oklar / Esc; görsele tıklayınca sonraki) */
function Lightbox(p: { images: string[]; start: number; onClose: () => void }) {
  const [i, setI] = createSignal(Math.max(0, Math.min(p.start, p.images.length - 1)));
  const n = () => p.images.length;
  const step = (d: number) => setI((x) => (x + d + n()) % n());
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") p.onClose();
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
  };
  onMount(() => window.addEventListener("keydown", key));
  onCleanup(() => window.removeEventListener("keydown", key));
  return (
    <Portal>
      <div class="home-lb" onClick={p.onClose}>
        <img src={p.images[i()]} alt="" draggable={false} onClick={(e) => (e.stopPropagation(), n() > 1 && step(1))} />
        <button class="home-lb-x" title={t("Kapat")} onClick={p.onClose}>
          <I.X />
        </button>
        <Show when={n() > 1}>
          <button class="home-lb-nav prev" onClick={(e) => (e.stopPropagation(), step(-1))}>
            <I.ChevronLeft />
          </button>
          <button class="home-lb-nav next" onClick={(e) => (e.stopPropagation(), step(1))}>
            <I.ChevronRight />
          </button>
          <span class="home-lb-count">
            {i() + 1} / {n()}
          </span>
        </Show>
      </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Beğeni ve yorumlar
// ---------------------------------------------------------------------------
function PostFooter(p: { post: HomePost; stat: HomeStat; onStat: (x: Partial<HomeStat>) => void; comments: boolean; toggleComments: () => void }) {
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const like = async () => {
    if (!session()) return go("account");
    if (busy()) return;
    const on = !p.stat.liked;
    setBusy(true);
    setErr("");
    // Hemen göster, sunucu yanıtıyla düzelt
    p.onStat({ liked: on, likes: Math.max(0, p.stat.likes + (on ? 1 : -1)) });
    try {
      const n = await homeLike(p.post.id, on);
      p.onStat({ liked: on, likes: Number(n) || 0 });
    } catch (e) {
      p.onStat({ liked: !on, likes: Math.max(0, p.stat.likes + (on ? -1 : 1)) });
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="home-foot">
      <button class="home-act" classList={{ on: p.stat.liked }} onClick={like} title={p.stat.liked ? t("Beğenmekten vazgeç") : t("Beğen")}>
        <I.Heart /> <span>{p.stat.likes > 0 ? p.stat.likes : t("Beğen")}</span>
      </button>
      <button class="home-act" classList={{ open: p.comments }} onClick={p.toggleComments}>
        <I.MessageCircle />{" "}
        <span>{p.stat.comments > 0 ? t("{0} yorum", p.stat.comments) : p.post.allow_comments === false ? t("Yorumlar") : t("Yorum yaz")}</span>
      </button>
      <Show when={err()}>
        <small class="f2-hint f2-err">{err()}</small>
      </Show>
    </div>
  );
}

function Comments(p: { post: HomePost; onChanged: (count: number) => void }) {
  const [list, { refetch, mutate }] = createResource(() => p.post.id, (id) => homeComments(id));
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const [editing, setEditing] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal("");
  const me = () => session()?.user.id ?? "";
  const closed = () => p.post.allow_comments === false;

  const reload = async () => {
    const r = await refetch();
    p.onChanged((r ?? []).length);
  };
  const send = async () => {
    const b = text().trim();
    if (!b || busy()) return;
    setBusy(true);
    setErr("");
    try {
      await homeCommentAdd(p.post.id, b);
      setText("");
      await reload();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const saveEdit = async (c: HomeComment) => {
    const b = draft().trim();
    if (!b) return;
    try {
      await homeCommentEdit(c.id, b);
      mutate((l) => (l ?? []).map((x) => (x.id === c.id ? { ...x, body: b, edited_at: new Date().toISOString() } : x)));
      setEditing(null);
    } catch (e) {
      setErr(errText(e));
    }
  };
  const remove = async (c: HomeComment) => {
    if (!confirm(t("Bu yorum silinsin mi?"))) return;
    try {
      await homeCommentDelete(c.id);
      await reload();
    } catch (e) {
      setErr(errText(e));
    }
  };

  return (
    <div class="home-comments">
      <Show when={list.loading && !list()}>
        <small class="muted">{t("Yükleniyor…")}</small>
      </Show>
      <Show when={list.error}>
        <small class="f2-hint f2-err">{errText(list.error)}</small>
      </Show>
      <For each={list() ?? []}>
        {(c) => (
          <div class="hc">
            <CommentAvatar c={c} />
            <div class="hc-main">
              <div class="hc-head">
                <button class="hc-name" onClick={() => openProfile(c.user_id)} data-no-i18n>
                  {c.author_name}
                </button>
                <Show when={c.author_admin}>
                  <span class="hc-badge admin">{t("Yönetici")}</span>
                </Show>
                <Show when={!c.author_admin && c.author_pro}>
                  <span class="hc-badge pro">PRO</span>
                </Show>
                <small class="muted" title={new Date(c.created_at).toLocaleString(localeTag())}>
                  {ago(c.created_at)}
                  <Show when={c.edited_at}> · {t("düzenlendi")}</Show>
                </small>
                <span class="lt-sp" />
                <Show when={c.user_id === me() && editing() !== c.id}>
                  <button class="link" onClick={() => (setDraft(c.body), setEditing(c.id))}>
                    {t("Düzenle")}
                  </button>
                </Show>
                <Show when={c.user_id === me() || isAdmin()}>
                  <button class="link danger" onClick={() => remove(c)}>
                    {t("Sil")}
                  </button>
                </Show>
              </div>
              <Show
                when={editing() === c.id}
                fallback={
                  <div class="hc-body" data-no-i18n>
                    <MsgText text={c.body} />
                  </div>
                }
              >
                <div class="hc-edit">
                  <textarea
                    class="input"
                    rows={2}
                    maxLength={1000}
                    value={draft()}
                    onInput={(e) => setDraft(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void saveEdit(c);
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                  <div>
                    <button class="btn small primary" onClick={() => saveEdit(c)}>
                      {t("Kaydet")}
                    </button>
                    <button class="btn ghost small" onClick={() => setEditing(null)}>
                      {t("Vazgeç")}
                    </button>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        )}
      </For>
      <Show when={!list.loading && !list.error && !(list() ?? []).length && !closed()}>
        <small class="muted">{t("Henüz yorum yok. İlk yorumu sen yaz.")}</small>
      </Show>
      <Show
        when={!closed()}
        fallback={
          <small class="muted">
            <I.Lock /> {t("Bu habere yorum yazılamaz.")}
          </small>
        }
      >
        <Show
          when={session()}
          fallback={
            <button class="btn small" onClick={() => go("account")}>
              {t("Yorum yazmak için giriş yap")}
            </button>
          }
        >
          <div class="hc-new">
            <textarea
              class="input"
              rows={2}
              maxLength={1000}
              placeholder={t("Yorum yaz… (Ctrl+Enter ile gönder)")}
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && void send()}
            />
            <div class="hc-new-row">
              <small class="muted">{text().length}/1000</small>
              <button class="btn primary small" disabled={busy() || !text().trim()} onClick={send}>
                <I.Send /> {t("Gönder")}
              </button>
            </div>
          </div>
        </Show>
      </Show>
      <Show when={err()}>
        <small class="f2-hint f2-err">{err()}</small>
      </Show>
    </div>
  );
}

function CommentAvatar(p: { c: HomeComment }) {
  const url = () => avatarUrl(p.c.avatar_path);
  const [bad, setBad] = createSignal(false);
  // Baş harfin rengi kimlikten (her üyede aynı)
  const hue = () => [...p.c.user_id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7);
  return (
    <span class="hc-av" style={{ "--hc-h": String(hue()) }} onClick={() => openProfile(p.c.user_id)}>
      <Show when={url() && !bad()} fallback={<span data-no-i18n>{(p.c.author_name || "?").trim().charAt(0).toLocaleUpperCase("tr")}</span>}>
        <img src={url()} alt="" onError={() => setBad(true)} />
      </Show>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Biçimli metin (HTML yorumlanmaz)
//   # / ## / ### başlık · - ya da * madde · 1. numaralı liste · > alıntı · --- ayırıcı
//   **kalın** · *italik* · ~~üstü çizili~~ · [yazı](https://adres) · düz https:// adresleri tıklanabilir
// Boş satır yeni paragraf, tek satır sonu satır sonu.
// ---------------------------------------------------------------------------
type Block =
  | { k: "p"; lines: string[] }
  | { k: "h"; level: number; text: string }
  | { k: "ul" | "ol"; items: string[] }
  | { k: "quote"; lines: string[] }
  | { k: "hr" };

export function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^\s*(#{1,3})\s+(.+)$/))) {
      out.push({ k: "h", level: m[1].length, text: m[2] });
      i++;
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) {
      out.push({ k: "hr" });
      i++;
    } else if (/^\s*[-*•]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ""));
      out.push({ k: "ul", items });
    } else if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      out.push({ k: "ol", items });
    } else if (/^\s*>/.test(l)) {
      const ls: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) ls.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push({ k: "quote", lines: ls });
    } else {
      const ls: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^\s*(#{1,3}\s|[-*•]\s|\d+[.)]\s|>)/.test(lines[i]) &&
        !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
      )
        ls.push(lines[i++]);
      out.push({ k: "p", lines: ls });
    }
  }
  return out;
}

const INLINE = /(\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\s][^*\n]*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>"]+)/g;

function Inline(p: { text: string }): JSX.Element {
  return (
    <For each={p.text.split(INLINE).filter((x) => x !== "")}>
      {(part) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <strong>{<Inline text={part.slice(2, -2)} />}</strong>;
        if (/^~~[^~]+~~$/.test(part)) return <s>{part.slice(2, -2)}</s>;
        if (/^\*[^*\s][^*]*\*$/.test(part)) return <em>{part.slice(1, -1)}</em>;
        const md = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (md) return <Link url={md[2]} text={md[1]} />;
        if (/^https?:\/\//.test(part)) {
          const url = part.replace(/[.,;:!?)]+$/, "");
          return (
            <>
              <Link url={url} text={url} />
              {part.slice(url.length)}
            </>
          );
        }
        return part;
      }}
    </For>
  );
}

const Link = (p: { url: string; text: string }) => (
  <a
    href={p.url}
    title={p.url}
    onClick={(e) => {
      e.preventDefault();
      openUrl(p.url);
    }}
  >
    {p.text}
  </a>
);

const Lines = (p: { lines: string[] }) => (
  <For each={p.lines}>
    {(line, k) => (
      <>
        <Show when={k() > 0}>
          <br />
        </Show>
        <Inline text={line} />
      </>
    )}
  </For>
);

function RichText(p: { text: string }) {
  const blocks = createMemo(() => parseBlocks(p.text));
  return (
    <For each={blocks()}>
      {(b) => {
        switch (b.k) {
          case "h":
            return b.level === 1 ? (
              <h4>
                <Inline text={b.text} />
              </h4>
            ) : (
              <h5 classList={{ small: b.level === 3 }}>
                <Inline text={b.text} />
              </h5>
            );
          case "ul":
            return (
              <ul>
                <For each={b.items}>
                  {(x) => (
                    <li>
                      <Inline text={x} />
                    </li>
                  )}
                </For>
              </ul>
            );
          case "ol":
            return (
              <ol>
                <For each={b.items}>
                  {(x) => (
                    <li>
                      <Inline text={x} />
                    </li>
                  )}
                </For>
              </ol>
            );
          case "quote":
            return (
              <blockquote>
                <Lines lines={b.lines} />
              </blockquote>
            );
          case "hr":
            return <hr />;
          default:
            return (
              <p>
                <Lines lines={b.lines} />
              </p>
            );
        }
      }}
    </For>
  );
}

// ---------------------------------------------------------------------------
// Haber düzenleyici (yeni / var olan) — sağda / altta canlı önizleme
// ---------------------------------------------------------------------------
function PostEditor(p: { post?: HomePost; onSave: (v: HomePostInput) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = createSignal(p.post?.title ?? "");
  const [summary, setSummary] = createSignal(p.post?.summary ?? "");
  const [category, setCategory] = createSignal(p.post?.category ?? "");
  const [accent, setAccent] = createSignal(p.post?.accent ?? "");
  const [layout, setLayout] = createSignal<HomeLayout>(p.post?.layout ?? "standard");
  const [fit, setFit] = createSignal<HomeImageFit>(p.post?.image_fit ?? "full");
  const [body, setBody] = createSignal(p.post?.body ?? "");
  const [image, setImage] = createSignal(p.post?.image ?? "");
  const [gallery, setGallery] = createSignal<string[]>([...(p.post?.gallery ?? [])]);
  const [video, setVideo] = createSignal(p.post?.video ?? "");
  const [links, setLinks] = createSignal<HomeLink[]>(p.post?.links?.length ? p.post.links.map((l) => ({ ...l })) : []);
  const [pinned, setPinned] = createSignal(p.post?.pinned ?? false);
  const [published, setPublished] = createSignal(p.post?.published ?? true);
  const [comments, setComments] = createSignal(p.post?.allow_comments ?? true);
  const [preview, setPreview] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [uploading, setUploading] = createSignal("");
  const [err, setErr] = createSignal("");
  let file: HTMLInputElement | undefined;
  let gfile: HTMLInputElement | undefined;
  let ta: HTMLTextAreaElement | undefined;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr("");
    setUploading(t("Kapak görseli yükleniyor…"));
    try {
      setImage(await uploadHomeImage(f, "posts"));
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setUploading("");
      if (file) file.value = "";
    }
  };
  const pickGallery = async (files: FileList | null | undefined) => {
    const list = [...(files ?? [])].slice(0, Math.max(0, 12 - gallery().length));
    if (!list.length) return;
    setErr("");
    try {
      for (const [k, f] of list.entries()) {
        setUploading(t("Galeri yükleniyor… {0}/{1}", k + 1, list.length));
        const url = await uploadHomeImage(f, "posts");
        setGallery((g) => [...g, url]);
      }
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setUploading("");
      if (gfile) gfile.value = "";
    }
  };
  const moveGallery = (i: number, d: number) =>
    setGallery((g) => {
      const j = i + d;
      if (j < 0 || j >= g.length) return g;
      const n = [...g];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  /** Metin kutusundaki seçimi biçimle (seçim yoksa örnek yazı eklenir ve seçili gelir) */
  const wrap = (before: string, after = before, sample = t("yazı")) => {
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const sel = value.slice(a, b) || sample;
    const next = value.slice(0, a) + before + sel + after + value.slice(b);
    setBody(next);
    queueMicrotask(() => {
      ta!.focus();
      ta!.setSelectionRange(a + before.length, a + before.length + sel.length);
    });
  };
  /** Seçili satırların başına ekle (başlık, liste, alıntı) */
  const prefix = (pre: (i: number) => string) => {
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const ls = value.lastIndexOf("\n", a - 1) + 1;
    const leRaw = value.indexOf("\n", b);
    const le = leRaw < 0 ? value.length : leRaw;
    const block = value.slice(ls, le).split("\n").map((l, i) => pre(i) + l.replace(/^(#{1,3}\s|[-*•]\s|\d+[.)]\s|>\s?)/, "")).join("\n");
    setBody(value.slice(0, ls) + block + value.slice(le));
    queueMicrotask(() => {
      ta!.focus();
      ta!.setSelectionRange(ls, ls + block.length);
    });
  };
  const insertLink = () => {
    const url = prompt(t("Bağlantı adresi (https://…)"), "https://");
    if (!url || !okUrl(url)) return;
    wrap("[", `](${url.trim()})`, t("bağlantı yazısı"));
  };
  const insertLine = (s: string) => {
    if (!ta) return;
    const a = ta.selectionStart;
    const v = ta.value;
    const pre = a > 0 && v[a - 1] !== "\n" ? "\n" : "";
    setBody(v.slice(0, a) + pre + s + "\n" + v.slice(a));
    queueMicrotask(() => ta!.focus());
  };

  const setLink = (i: number, k: keyof HomeLink, v: string) => setLinks((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const cleanLinks = () =>
    links()
      .map((l) => ({ label: l.label.trim().slice(0, 60), url: l.url.trim() }))
      .filter((l) => l.url || l.label);

  const value = (): HomePostInput => ({
    title: title().trim().slice(0, 200),
    summary: summary().trim().slice(0, 400),
    category: category().trim().slice(0, 40),
    accent: /^#[0-9a-f]{6}$/i.test(accent()) ? accent() : "",
    layout: layout(),
    image_fit: fit(),
    body: body().slice(0, 20000),
    image: image(),
    gallery: gallery(),
    video: video().trim(),
    links: cleanLinks(),
    pinned: pinned(),
    published: published(),
    allow_comments: comments(),
  });

  const draftPost = createMemo<HomePost>(() => {
    const now = new Date().toISOString();
    return { ...value(), title: value().title || t("Başlık"), id: p.post?.id ?? "preview", created_at: p.post?.created_at ?? now, updated_at: p.post?.updated_at ?? now };
  });

  const save = async () => {
    const v = value();
    if (!v.title) return setErr(t("Başlık gerekli."));
    const bad = v.links.find((l) => !okUrl(l.url));
    if (bad) return setErr(t("Bağlantı adresi https:// ile başlamalı: {0}", bad.label || bad.url));
    if (v.video && !(v.video.startsWith("https://") && youtubeId(v.video))) return setErr(t("Video bir YouTube adresi olmalı (https://www.youtube.com/watch?v=… ya da https://youtu.be/…)."));
    setErr("");
    setBusy(true);
    try {
      await p.onSave(v);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const Tool = (q: { title: string; onClick: () => void; children: JSX.Element }) => (
    <button type="button" class="hed-tool" title={q.title} onMouseDown={(e) => e.preventDefault()} onClick={q.onClick}>
      {q.children}
    </button>
  );

  return (
    <div class="home-editor panel" classList={{ "with-preview": preview() }}>
      <div class="hed-top">
        <b>{p.post ? t("Haberi düzenle") : t("Yeni haber")}</b>
        <span class="lt-sp" />
        <label class="hed-switch">
          <input type="checkbox" checked={preview()} onChange={(e) => setPreview(e.currentTarget.checked)} /> {t("Canlı önizleme")}
        </label>
      </div>
      <div class="hed-cols">
        <div class="hed-form">
          <div class="f2">
            <div class="f2-cap">{t("Başlık")}</div>
            <input class="input hed-title" maxLength={200} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} placeholder={t("ör. Yeni sürüm yayında")} />
          </div>
          <div class="hed-row2">
            <div class="f2">
              <div class="f2-cap">{t("Kategori")}</div>
              <input class="input" list="home-cats" maxLength={40} value={category()} onInput={(e) => setCategory(e.currentTarget.value)} placeholder={t("ör. Duyuru")} />
              <datalist id="home-cats">
                <For each={CATEGORIES}>{(c) => <option value={t(c)} />}</For>
              </datalist>
            </div>
            <div class="f2">
              <div class="f2-cap">{t("Vurgu rengi")}</div>
              <div class="hed-colors">
                <For each={ACCENTS}>
                  {(c) => (
                    <button
                      type="button"
                      class="hed-color"
                      classList={{ on: accent() === c, none: !c }}
                      style={c ? { background: c } : undefined}
                      title={c || t("Yok")}
                      onClick={() => setAccent(c)}
                    />
                  )}
                </For>
                <input type="color" class="hed-color-pick" value={accent() || "#ff8a2a"} onInput={(e) => setAccent(e.currentTarget.value)} title={t("Kendi rengin")} />
              </div>
            </div>
          </div>
          <div class="f2">
            <div class="f2-cap">{t("Özet (isteğe bağlı)")}</div>
            <textarea class="input" rows={2} maxLength={400} value={summary()} onInput={(e) => setSummary(e.currentTarget.value)} placeholder={t("Başlığın altında büyük yazıyla görünen kısa giriş")} />
          </div>

          <div class="f2">
            <div class="f2-cap">{t("Kapak görseli")}</div>
            <div class="home-imgpick">
              <Show when={image()} fallback={<div class="home-imgph">{uploading() || t("Görsel yok")}</div>}>
                <img src={image()} alt="" />
              </Show>
              <div class="home-imgbtns">
                <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pick(e.currentTarget.files?.[0])} />
                <div class="hed-inline">
                  <button class="btn small" disabled={!!uploading()} onClick={() => file?.click()}>
                    <I.Upload /> {image() ? t("Değiştir") : t("Görsel yükle")}
                  </button>
                  <Show when={image()}>
                    <button class="btn ghost small" onClick={() => setImage("")}>
                      {t("Kaldır")}
                    </button>
                  </Show>
                </div>
                <small class="muted">{t("PNG, JPEG, WebP ya da GIF. Büyük görseller 1600 px genişliğe küçültülür.")}</small>
              </div>
            </div>
          </div>
          <Show when={image()}>
            <div class="hed-row2">
              <div class="f2">
                <div class="f2-cap">{t("Görünüm")}</div>
                <div class="seg">
                  <button classList={{ on: layout() === "standard" }} onClick={() => setLayout("standard")} title={t("Görsel üstte, metin altta")}>
                    {t("Standart")}
                  </button>
                  <button classList={{ on: layout() === "hero" }} onClick={() => setLayout("hero")} title={t("Büyük kapak görseli, başlık görselin üstünde")}>
                    {t("Büyük kapak")}
                  </button>
                  <button classList={{ on: layout() === "side" }} onClick={() => setLayout("side")} title={t("Görsel solda, metin sağda")}>
                    {t("Yan görsel")}
                  </button>
                </div>
              </div>
              <Show when={layout() !== "hero"}>
                <div class="f2">
                  <div class="f2-cap">{t("Görsel nasıl sığsın")}</div>
                  <div class="seg">
                    <button classList={{ on: fit() === "full" }} onClick={() => setFit("full")} title={t("Görselin tamamı görünür, kırpılmaz")}>
                      {t("Tamamı")}
                    </button>
                    <button classList={{ on: fit() === "wide" }} onClick={() => setFit("wide")} title={t("16:9 alana sığdırılır, taşan kenarlar kırpılır")}>
                      16:9
                    </button>
                    <button classList={{ on: fit() === "banner" }} onClick={() => setFit("banner")} title={t("İnce şerit; üst ve alt kırpılır")}>
                      {t("İnce banner")}
                    </button>
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          <div class="f2">
            <div class="f2-cap">{t("Metin")}</div>
            <div class="hed-toolbar">
              <Tool title={t("Kalın (Ctrl+B)")} onClick={() => wrap("**")}>
                <I.Bold />
              </Tool>
              <Tool title={t("İtalik (Ctrl+I)")} onClick={() => wrap("*")}>
                <I.Italic />
              </Tool>
              <Tool title={t("Üstü çizili")} onClick={() => wrap("~~")}>
                <I.Strikethrough />
              </Tool>
              <i class="hed-sep" />
              <Tool title={t("Ara başlık")} onClick={() => prefix(() => "## ")}>
                <I.Heading2 />
              </Tool>
              <Tool title={t("Madde listesi")} onClick={() => prefix(() => "- ")}>
                <I.List />
              </Tool>
              <Tool title={t("Numaralı liste")} onClick={() => prefix((i) => `${i + 1}. `)}>
                <I.ListOrdered />
              </Tool>
              <Tool title={t("Alıntı")} onClick={() => prefix(() => "> ")}>
                <I.Quote />
              </Tool>
              <Tool title={t("Ayırıcı çizgi")} onClick={() => insertLine("---")}>
                <I.Minus />
              </Tool>
              <i class="hed-sep" />
              <Tool title={t("Bağlantı")} onClick={insertLink}>
                <I.Link2 />
              </Tool>
            </div>
            <textarea
              ref={ta}
              class="input home-ta"
              rows={9}
              value={body()}
              onInput={(e) => setBody(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (!(e.ctrlKey || e.metaKey)) return;
                const k = e.key.toLowerCase();
                if (k === "b") (e.preventDefault(), wrap("**"));
                else if (k === "i") (e.preventDefault(), wrap("*"));
                else if (k === "k") (e.preventDefault(), insertLink());
              }}
              placeholder={t("Boş satır yeni paragraf açar. **kalın**, *italik*, ## başlık, - liste, > alıntı. https:// adresleri tıklanabilir olur.")}
            />
            <small class="muted">{t("{0} karakter", body().length)}</small>
          </div>

          <div class="f2">
            <div class="f2-cap">
              {t("Galeri")} ({gallery().length}/12)
            </div>
            <div class="hed-gallery">
              <For each={gallery()}>
                {(src, i) => (
                  <div class="hed-gimg">
                    <img src={src} alt="" />
                    <div class="hed-gimg-acts">
                      <button title={t("Sola al")} disabled={i() === 0} onClick={() => moveGallery(i(), -1)}>
                        <I.ChevronLeft />
                      </button>
                      <button title={t("Kaldır")} onClick={() => setGallery((g) => g.filter((_, j) => j !== i()))}>
                        <I.X />
                      </button>
                      <button title={t("Sağa al")} disabled={i() === gallery().length - 1} onClick={() => moveGallery(i(), 1)}>
                        <I.ChevronRight />
                      </button>
                    </div>
                  </div>
                )}
              </For>
              <Show when={gallery().length < 12}>
                <button class="hed-gadd" disabled={!!uploading()} onClick={() => gfile?.click()}>
                  <I.ImagePlus />
                  <small>{uploading() || t("Görsel ekle")}</small>
                </button>
              </Show>
              <input ref={gfile} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pickGallery(e.currentTarget.files)} />
            </div>
          </div>

          <div class="f2">
            <div class="f2-cap">{t("YouTube videosu (isteğe bağlı)")}</div>
            <input class="input" value={video()} onInput={(e) => setVideo(e.currentTarget.value)} placeholder="https://www.youtube.com/watch?v=…" />
          </div>

          <div class="f2">
            <div class="f2-cap">{t("Bağlantılar (düğme olarak görünür)")}</div>
            <Index each={links()}>
              {(l, i) => (
                <div class="home-linkrow">
                  <input class="input" placeholder={t("Düğme yazısı")} value={l().label} maxLength={60} onInput={(e) => setLink(i, "label", e.currentTarget.value)} />
                  <input class="input" placeholder="https://" value={l().url} onInput={(e) => setLink(i, "url", e.currentTarget.value)} />
                  <button class="btn ghost small" title={t("Kaldır")} onClick={() => setLinks((x) => x.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              )}
            </Index>
            <button class="btn ghost small" onClick={() => setLinks((x) => [...x, { label: "", url: "" }])} disabled={links().length >= 6}>
              <I.Plus /> {t("Bağlantı ekle")}
            </button>
          </div>
          <div class="home-checks">
            <label>
              <input type="checkbox" checked={pinned()} onChange={(e) => setPinned(e.currentTarget.checked)} /> {t("En üste sabitle")}
            </label>
            <label>
              <input type="checkbox" checked={published()} onChange={(e) => setPublished(e.currentTarget.checked)} /> {t("Yayında (kapalıysa yalnızca yöneticiler görür)")}
            </label>
            <label>
              <input type="checkbox" checked={comments()} onChange={(e) => setComments(e.currentTarget.checked)} /> {t("Yorumlara açık")}
            </label>
          </div>
          <Show when={err()}>
            <p class="error">{err()}</p>
          </Show>
          <div class="home-admin">
            <button class="btn primary small" disabled={busy() || !!uploading()} onClick={save}>
              {p.post ? t("Kaydet") : published() ? t("Yayınla") : t("Taslak olarak kaydet")}
            </button>
            <button class="btn small" onClick={p.onCancel}>
              {t("Vazgeç")}
            </button>
          </div>
        </div>
        <Show when={preview()}>
          <div class="hed-preview">
            <div class="f2-cap">{t("Önizleme")}</div>
            <PostCard post={draftPost()} preview />
          </div>
        </Show>
      </div>
    </div>
  );
}
