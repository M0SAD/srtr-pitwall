// Düzenleme arka planı seçici: kendi galerin (SRTR Pitwall + iRacing), topluluğun paylaştıkları
// ya da bilgisayardan bir dosya. Hem kontrol panelinde hem düzenleme ekranında (Ctrl+Shift+E) açılır.

import { For, Show, createEffect, createResource, createSignal, on, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings } from "@/sdk/settings";
import { cloudEnabled } from "@/cloud/supabase";
import { searchShots, shotThumbUrl, shotUrl, type SharedShot } from "@/cloud/shots";
import { ShotThumb, clearEditBackdrop, importEditBackdrop, listShots, setEditBackdropFromShot, type LocalShot } from "./Shots";
import "./backdrop-picker.css";

type Tab = "mine" | "community" | "upload";

export function BackdropPicker(props: { onClose: () => void }) {
  const [tab, setTab] = createSignal<Tab>("mine");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const [mine] = createResource(() => tab() === "mine", (on) => (on ? listShots("all") : Promise.resolve([] as LocalShot[])));
  const [shared] = createResource(
    () => tab() === "community" && cloudEnabled,
    (on) => (on ? searchShots("", "top").catch((e) => (setErr(String(e?.message ?? e)), [] as SharedShot[])) : Promise.resolve([] as SharedShot[])),
  );
  let file: HTMLInputElement | undefined;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      props.onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const fromShared = (s: SharedShot) =>
    run(async () => {
      const r = await fetch(shotUrl(s));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await importEditBackdrop(await r.blob());
    });

  return (
    <div class="bp-back" onClick={(e) => e.target === e.currentTarget && props.onClose()} onContextMenu={(e) => e.preventDefault()}>
      <div class="bp">
        <header>
          <b>Arka plan görseli seç</b>
          <span class="bp-sp" />
          <Show when={settings().general.editBackdrop.has}>
            <button class="bp-btn danger" disabled={busy()} onClick={() => run(clearEditBackdrop)}>
              Kaldır
            </button>
          </Show>
          <button class="bp-btn" onClick={props.onClose}>
            Kapat
          </button>
        </header>
        <div class="bp-tabs">
          <button classList={{ on: tab() === "mine" }} onClick={() => setTab("mine")}>
            Galerim
          </button>
          <Show when={cloudEnabled}>
            <button classList={{ on: tab() === "community" }} onClick={() => setTab("community")}>
              Topluluk
            </button>
          </Show>
          <button classList={{ on: tab() === "upload" }} onClick={() => setTab("upload")}>
            Bilgisayardan yükle
          </button>
        </div>

        <Show when={tab() === "mine"}>
          <Show when={(mine() ?? []).length > 0} fallback={<p class="bp-muted">{mine.loading ? "Aranıyor…" : "Henüz ekran görüntüsü yok."}</p>}>
            <div class="bp-grid">
              <For each={mine()}>
                {(s) => (
                  <button class="bp-card" disabled={busy()} onClick={() => run(() => setEditBackdropFromShot(s.path))}>
                    <ShotThumb shot={s} />
                    <i class={`bp-src ${s.source}`}>{s.source === "iracing" ? "iRacing" : "SRTR"}</i>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>

        <Show when={tab() === "community"}>
          <Show when={(shared() ?? []).length > 0} fallback={<p class="bp-muted">{shared.loading ? "Aranıyor…" : "Sonuç yok."}</p>}>
            <div class="bp-grid">
              <For each={shared()}>
                {(s) => (
                  <button class="bp-card" disabled={busy()} onClick={() => fromShared(s)} title={s.title}>
                    <div class="shot-thumb">
                      <img src={shotThumbUrl(s)} alt="" loading="lazy" draggable={false} />
                    </div>
                    <small data-no-i18n>{s.title}</small>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>

        <Show when={tab() === "upload"}>
          <div class="bp-upload">
            <p class="bp-muted">PNG, JPEG, WebP ya da BMP. En iyisi oyundaki çözünürlüğünde bir kokpit ekran görüntüsü.</p>
            <button class="bp-btn primary" disabled={busy()} onClick={() => file?.click()}>
              Dosya seç
            </button>
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/bmp"
              hidden
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) run(() => importEditBackdrop(f));
                e.currentTarget.value = "";
              }}
            />
          </div>
        </Show>

        <Show when={busy()}>
          <p class="bp-muted">Yükleniyor…</p>
        </Show>
        <Show when={err()}>
          <p class="bp-err">{err()}</p>
        </Show>
      </div>
    </div>
  );
}

/** Düzenleme arka planı görseli (blob adresi); active false iken yüklenmez */
export function useEditBackdrop(active: () => boolean) {
  const [url, setUrl] = createSignal<string | null>(null);
  let cur: string | null = null;
  const release = () => {
    if (cur) URL.revokeObjectURL(cur);
    cur = null;
  };
  createEffect(
    on(
      () => {
        const eb = settings().general.editBackdrop;
        return [active() && eb.enabled && eb.has, eb.rev] as const;
      },
      async ([want]) => {
        release();
        setUrl(null);
        if (!want) return;
        try {
          const buf = await invoke<ArrayBuffer>("edit_backdrop_read");
          cur = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
          setUrl(cur);
        } catch {
          /* görsel yok */
        }
      },
    ),
  );
  onCleanup(release);
  return url;
}
