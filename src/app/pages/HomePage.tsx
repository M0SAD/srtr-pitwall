// Ana sayfa: uygulama açılınca ilk görünen sayfa. En üstte reklam (ücretli "ana sayfa üst banner" reklamı; yoksa
// yöneticinin ana sayfa reklamları; o da yoksa "Bu alana reklam ver"), altında yöneticinin yazdığı haberler (görsel,
// metin, bağlantılar, sabitlenenler önce). İkinci haberin altında "haberler arası" reklam alanı.
// Yönetici haberleri bu sayfada ekler / düzenler / sabitler / yayından kaldırır / siler.

import { For, Show, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { cloudEnabled } from "@/cloud/supabase";
import { isAdmin, isPro } from "@/cloud/account";
import {
  homeBannerHit,
  homeBanners,
  homePostAdd,
  homePostDelete,
  homePostSave,
  homePosts,
  liveBanners,
  okUrl,
  uploadHomeImage,
  type HomeBanner,
  type HomeLink,
  type HomePost,
  type HomePostInput,
} from "@/cloud/home";
import { AdSlot } from "../components/AdSlot";
import { go, openUrl } from "../ui";
import * as I from "../icons";
import "./home.css";

const fmtDate = (v: string) => new Date(v).toLocaleDateString(localeTag(), { day: "numeric", month: "long", year: "numeric" });

export function HomePage() {
  const [ver, setVer] = createSignal(0);
  const [posts, { refetch }] = createResource(ver, () => (cloudEnabled ? homePosts() : Promise.resolve([] as HomePost[])));
  const [editing, setEditing] = createSignal<HomePost | "new" | null>(null);
  const [err, setErr] = createSignal("");
  const reload = () => setVer(ver() + 1);

  const act = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
      refetch();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    }
  };

  return (
    <div class="page home">
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
function PostCard(p: { post: HomePost; onEdit: () => void; onPin: () => void; onPublish: () => void; onDelete: () => void }) {
  const edited = () => new Date(p.post.updated_at).getTime() - new Date(p.post.created_at).getTime() > 60_000;
  return (
    <article class="home-post" classList={{ pinned: p.post.pinned, draft: !p.post.published }}>
      <Show when={p.post.image}>
        <img class="home-img" src={p.post.image} alt="" loading="lazy" draggable={false} />
      </Show>
      <div class="home-body">
        <div class="home-meta">
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
        <h3 data-no-i18n>{p.post.title}</h3>
        <Show when={p.post.body.trim()}>
          <div class="home-text" data-no-i18n>
            <RichText text={p.post.body} />
          </div>
        </Show>
        <Show when={(p.post.links ?? []).length}>
          <div class="home-links">
            <For each={p.post.links}>
              {(l) => (
                <button class="btn small home-link" onClick={() => openUrl(l.url)} title={l.url} data-no-i18n>
                  <I.ExternalLink /> {l.label || l.url}
                </button>
              )}
            </For>
          </div>
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
      </div>
    </article>
  );
}

/** Düz metin: boş satır paragraf, tek satır sonu satır sonu; içindeki adresler tıklanabilir. HTML yorumlanmaz. */
function RichText(p: { text: string }) {
  const paras = () => p.text.replace(/\r\n/g, "\n").split(/\n{2,}/).filter((x) => x.trim());
  return (
    <For each={paras()}>
      {(para) => (
        <p>
          <For each={para.split("\n")}>
            {(line, k) => (
              <>
                <Show when={k() > 0}>
                  <br />
                </Show>
                <For each={line.split(/(https?:\/\/[^\s<>"]+)/g)}>
                  {(part) =>
                    /^https?:\/\//.test(part) ? (
                      <a
                        href={part}
                        onClick={(e) => {
                          e.preventDefault();
                          openUrl(part.replace(/[.,;:!?)]+$/, ""));
                        }}
                      >
                        {part}
                      </a>
                    ) : (
                      part
                    )
                  }
                </For>
              </>
            )}
          </For>
        </p>
      )}
    </For>
  );
}

// ---------------------------------------------------------------------------
// Haber düzenleyici (yeni / var olan)
// ---------------------------------------------------------------------------
function PostEditor(p: { post?: HomePost; onSave: (v: HomePostInput) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = createSignal(p.post?.title ?? "");
  const [body, setBody] = createSignal(p.post?.body ?? "");
  const [image, setImage] = createSignal(p.post?.image ?? "");
  const [links, setLinks] = createSignal<HomeLink[]>(p.post?.links?.length ? p.post.links.map((l) => ({ ...l })) : []);
  const [pinned, setPinned] = createSignal(p.post?.pinned ?? false);
  const [published, setPublished] = createSignal(p.post?.published ?? true);
  const [busy, setBusy] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [err, setErr] = createSignal("");
  let file: HTMLInputElement | undefined;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr("");
    setUploading(true);
    try {
      setImage(await uploadHomeImage(f, "posts"));
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setUploading(false);
      if (file) file.value = "";
    }
  };
  const setLink = (i: number, k: keyof HomeLink, v: string) => setLinks((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async () => {
    const tl = title().trim();
    if (!tl) return setErr(t("Başlık gerekli."));
    const ls = links()
      .map((l) => ({ label: l.label.trim().slice(0, 60), url: l.url.trim() }))
      .filter((l) => l.url || l.label);
    const bad = ls.find((l) => !okUrl(l.url));
    if (bad) return setErr(t("Bağlantı adresi https:// ile başlamalı: {0}", bad.label || bad.url));
    setErr("");
    setBusy(true);
    try {
      await p.onSave({ title: tl.slice(0, 200), body: body().slice(0, 20000), image: image(), links: ls, pinned: pinned(), published: published() });
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="home-editor panel">
      <div class="f2">
        <div class="f2-cap">{t("Başlık")}</div>
        <input class="input" maxLength={200} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} placeholder={t("ör. Yeni sürüm yayında")} />
      </div>
      <div class="f2">
        <div class="f2-cap">{t("Metin")}</div>
        <textarea class="input home-ta" rows={7} value={body()} onInput={(e) => setBody(e.currentTarget.value)} placeholder={t("Boş satır yeni paragraf açar. İçine yazdığın https:// adresleri tıklanabilir olur.")} />
      </div>
      <div class="f2">
        <div class="f2-cap">{t("Görsel")}</div>
        <div class="home-imgpick">
          <Show when={image()} fallback={<div class="home-imgph">{uploading() ? t("Yükleniyor…") : t("Görsel yok")}</div>}>
            <img src={image()} alt="" />
          </Show>
          <div class="home-imgbtns">
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pick(e.currentTarget.files?.[0])} />
            <button class="btn small" disabled={uploading()} onClick={() => file?.click()}>
              <I.Upload /> {image() ? t("Değiştir") : t("Görsel yükle")}
            </button>
            <Show when={image()}>
              <button class="btn ghost small" onClick={() => setImage("")}>
                {t("Kaldır")}
              </button>
            </Show>
            <small class="muted">{t("PNG, JPEG, WebP ya da GIF. Büyük görseller 1600 px genişliğe küçültülür.")}</small>
          </div>
        </div>
      </div>
      <div class="f2">
        <div class="f2-cap">{t("Bağlantılar (düğme olarak görünür)")}</div>
        <For each={links()}>
          {(l, i) => (
            <div class="home-linkrow">
              <input class="input" placeholder={t("Düğme yazısı")} value={l.label} maxLength={60} onInput={(e) => setLink(i(), "label", e.currentTarget.value)} />
              <input class="input" placeholder="https://" value={l.url} onInput={(e) => setLink(i(), "url", e.currentTarget.value)} />
              <button class="btn ghost small" title={t("Kaldır")} onClick={() => setLinks((x) => x.filter((_, j) => j !== i()))}>
                ✕
              </button>
            </div>
          )}
        </For>
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
      </div>
      <Show when={err()}>
        <p class="error">{err()}</p>
      </Show>
      <div class="home-admin">
        <button class="btn primary small" disabled={busy() || uploading()} onClick={save}>
          {p.post ? t("Kaydet") : t("Yayınla")}
        </button>
        <button class="btn small" onClick={p.onCancel}>
          {t("Vazgeç")}
        </button>
      </div>
    </div>
  );
}
