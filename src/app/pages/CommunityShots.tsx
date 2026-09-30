// Topluluk → Ekran Görüntüleri: paylaşılan görüntüler, puanlar, yorumlar, raporlama.
// Görüntülemek, puanlamak, yorum yazmak ve arka plan yapmak herkese açık; paylaşmak PRO.

import { For, Show, createEffect, createResource, createSignal, on, onCleanup, onMount } from "solid-js";
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
  myShotRating,
  myShots,
  rateShot,
  searchShots,
  shotComments,
  shotThumbUrl,
  shotUrl,
  shotViewed,
  updateShot,
  type SharedShot,
  type ShotSort,
} from "@/cloud/shots";
import { importEditBackdrop } from "../components/Shots";
import { CommentList, ReportDialog } from "../components/Moderation";
import { LoginWall, Stars } from "./CommunityPage";
import { go } from "../ui";
import * as I from "../icons";

export function CommunityShots() {
  const [q, setQ] = createSignal("");
  const [debounced, setDebounced] = createSignal("");
  const [sort, setSort] = createSignal<ShotSort>("new");
  const [tab, setTab] = createSignal<"all" | "mine">("all");
  const [version, setVersion] = createSignal(0);
  const [open, setOpen] = createSignal<SharedShot | null>(null);
  let timer: number | undefined;
  createEffect(
    on(q, (v) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setDebounced(v), 300);
    }),
  );
  const [list] = createResource(
    () => ({ q: debounced(), sort: sort(), tab: tab(), v: version() }),
    (k) => (!session() ? Promise.resolve([] as SharedShot[]) : k.tab === "mine" ? myShots() : searchShots(k.q, k.sort)),
  );

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

  return (
    <Show when={session()} fallback={<LoginWall what="Topluluk ekran görüntüleri" />}>
    <div class="page">
      <section class="panel cm-bar">
        <div class="cm-tabs">
          <button classList={{ on: tab() === "all" }} onClick={() => setTab("all")}>
            Tüm görüntüler
          </button>
          <button classList={{ on: tab() === "mine" }} onClick={() => setTab("mine")} disabled={!session()}>
            Paylaştıklarım
          </button>
        </div>
        <Show when={tab() === "all"}>
          <input class="input cm-search" placeholder="Başlık, kullanıcı, pist ya da araç ara" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
          <select class="input" value={sort()} onChange={(e) => setSort(e.currentTarget.value as ShotSort)}>
            <option value="new">En yeni</option>
            <option value="top">En yüksek puan</option>
            <option value="comments">En çok yorumlanan</option>
          </select>
        </Show>
        <span class="lt-sp" />
        <Show
          when={session()}
          fallback={
            <button class="btn primary" onClick={() => go("account")}>
              Paylaşmak için giriş yap
            </button>
          }
        >
          <Show
            when={isPro()}
            fallback={
              <button class="btn primary" onClick={() => go("pro")} title="Görüntü paylaşmak PRO özelliğidir; görüntülemek, puanlamak ve arka plan yapmak herkese açık">
                <I.Lock /> PRO ile paylaş
              </button>
            }
          >
            <button class="btn primary" onClick={() => go("shots")}>
              Görüntü paylaş
            </button>
          </Show>
        </Show>
      </section>

      <Show when={list.error}>
        <p class="error">{String(list.error?.message ?? list.error)}</p>
      </Show>
      <Show when={!list.loading && (list() ?? []).length === 0 && !list.error}>
        <p class="muted cm-empty">{tab() === "mine" ? "Henüz görüntü paylaşmadın." : "Sonuç yok."}</p>
      </Show>

      <div class="shot-grid">
        <For each={list() ?? []}>
          {(s) => (
            <button class="shot-card" onClick={() => setOpen(s)}>
              <div class="shot-thumb">
                <img src={shotThumbUrl(s)} alt="" loading="lazy" draggable={false} />
              </div>
              <span class="shot-cap">
                <b data-no-i18n>{s.title}</b>
                <small>
                  <span data-no-i18n>{s.author_name || "?"}</span>
                  <Show when={s.track}>
                    {" · "}
                    <span data-no-i18n>{s.track}</span>
                  </Show>
                </small>
                <span class="cm-meta">
                  <Stars value={Number(s.rating_avg)} count={s.rating_count} />
                  <span title="Yorumlar">💬 {s.comment_count}</span>
                </span>
              </span>
            </button>
          )}
        </For>
      </div>

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
