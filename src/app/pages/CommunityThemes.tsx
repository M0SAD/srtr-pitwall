// Topluluk temaları: PRO üyeler kendi düzenledikleri temayı paylaşır ve başkalarının temalarını kullanır.
// Kullanılan tema Ayarlar > Görünüm'de hazır temaların yanında görünür.

import { For, Show, createEffect, createResource, createSignal, on } from "solid-js";
import { cloudEnabled, session } from "@/cloud/supabase";
import { isPro } from "@/cloud/account";
import { can } from "@/cloud/moderation";
import { deleteTheme, myThemes, searchThemes, shareTheme, themeDownloaded, type SharedTheme, type ThemeSort } from "@/cloud/community";
import { settings, updateSettings } from "@/sdk/settings";
import { DEFAULT_THEME, normalizeTheme, type Theme } from "@/sdk/theme";
import { ThemeSwatches } from "../components/SharedLayoutPreview";
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

export function ThemeCard(p: { t: SharedTheme; compact?: boolean; onChanged?: () => void }) {
  const [msg, setMsg] = createSignal("");
  const mine = () => session()?.user.id === p.t.user_id;
  const saved = () => settings().savedThemes.some((x) => x.id === p.t.id);
  return (
    <div class="th-card" classList={{ compact: !!p.compact }}>
      <div class="th-prev" style={{ background: p.t.theme.bg }}>
        <ThemeSwatch theme={p.t.theme} />
      </div>
      <div class="th-body">
        <b data-no-i18n>{p.t.name}</b>
        <small class="muted" data-no-i18n>
          {p.t.author_name || "?"} · ⭳ {p.t.downloads}
        </small>
        <Show when={!p.compact && p.t.description}>
          <p class="small" data-no-i18n>
            {p.t.description}
          </p>
        </Show>
        <Show when={!p.compact}>
          <ThemeSwatches theme={p.t.theme} />
        </Show>
        <div class="btns">
          <ProGate label="Kullanmak için PRO">
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
          <Show when={!p.compact && (mine() || can("layouts.delete"))}>
            <button
              class="btn ghost small danger"
              onClick={async () => {
                if (!confirm("Bu tema paylaşımı silinsin mi?")) return;
                await deleteTheme(p.t.id).catch((e) => setMsg(String(e.message)));
                p.onChanged?.();
              }}
            >
              Sil
            </button>
          </Show>
        </div>
        <Show when={msg()}>
          <small class="success">{msg()}</small>
        </Show>
      </div>
    </div>
  );
}

export function CommunityThemes() {
  const [q, setQ] = createSignal("");
  const [debounced, setDebounced] = createSignal("");
  const [sort, setSort] = createSignal<ThemeSort>("downloads");
  const [tab, setTab] = createSignal<"all" | "mine">("all");
  const [version, setVersion] = createSignal(0);
  const [sharing, setSharing] = createSignal(false);
  let timer: number | undefined;
  createEffect(
    on(q, (v) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setDebounced(v), 300);
    }),
  );
  const [list] = createResource(
    () => (session() ? { q: debounced(), s: sort(), tab: tab(), v: version() } : null),
    (k) => (k.tab === "mine" ? myThemes() : searchThemes(k.q, k.s)),
  );

  if (!cloudEnabled) return <LoginWall what="Topluluk temaları" />;

  return (
    <Show when={session()} fallback={<LoginWall what="Topluluk temaları" />}>
      <div class="page">
        <section class="panel cm-bar">
          <div class="cm-tabs">
            <button classList={{ on: tab() === "all" }} onClick={() => setTab("all")}>
              Tüm temalar
            </button>
            <button classList={{ on: tab() === "mine" }} onClick={() => setTab("mine")}>
              Paylaştıklarım
            </button>
          </div>
          <Show when={tab() === "all"}>
            <input class="input cm-search" placeholder="Tema adı ya da kullanıcı ara" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
            <select class="input" value={sort()} onChange={(e) => setSort(e.currentTarget.value as ThemeSort)}>
              <option value="downloads">En çok kullanılan</option>
              <option value="new">En yeni</option>
            </select>
          </Show>
          <span class="lt-sp" />
          <ProGate label="PRO ile paylaş">
            <button class="btn primary" onClick={() => setSharing(true)}>
              Temamı paylaş
            </button>
          </ProGate>
        </section>
        <p class="muted small">Temaları paylaşmak ve kullanmak PRO üyelere açık. Kullandığın temalar Ayarlar › Görünüm'de hazır temaların yanında durur.</p>
        <Show when={list.error}>
          <p class="error">{String(list.error?.message ?? list.error)}</p>
        </Show>
        <Show when={!list.loading && (list() ?? []).length === 0 && !list.error}>
          <p class="muted cm-empty">{tab() === "mine" ? "Henüz tema paylaşmadın." : "Sonuç yok."}</p>
        </Show>
        <div class="th-grid">
          <For each={list() ?? []}>{(t) => <ThemeCard t={t} onChanged={() => setVersion(version() + 1)} />}</For>
        </div>
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
