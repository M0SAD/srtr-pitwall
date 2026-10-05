// Düzenleme arka planı seçici: kendi galerin (SRTR Pitwall + iRacing), topluluğun paylaştıkları
// ya da bilgisayardan bir dosya. Hem kontrol panelinde hem düzenleme ekranında (Ctrl+Shift+E) açılır.

import { For, Show, createEffect, createResource, createSignal, on, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings, type EditBackdropSlot } from "@/sdk/settings";
import { cloudEnabled } from "@/cloud/supabase";
import { searchShots, shotThumbUrl, shotUrl, type SharedShot } from "@/cloud/shots";
import { ShotThumb, clearEditBackdrop, importEditBackdrop, listShots, profileBackdropSlot, setEditBackdropFromShot, type BackdropTarget, type LocalShot } from "./Shots";
import "./backdrop-picker.css";

type Tab = "mine" | "community" | "upload";

/** slot: hangi düzenleme ekranının arka planı seçiliyor (her birinin görseli ayrıdır) */
export function BackdropPicker(props0: { slot: EditBackdropSlot; profileId?: string; onClose: () => void }) {
  // profileId verilirse görsel yalnızca o düzene yazılır ("p-<kimlik>"); "Kaldır" düzenin kendi görselini siler (ortak görsele döner)
  const own = () => (props0.profileId ? profileBackdropSlot(props0.profileId) : undefined);
  const props = {
    get slot(): BackdropTarget {
      return own() ?? props0.slot;
    },
    onClose: () => props0.onClose(),
  };
  const hasImage = () => (own() ? !!settings().profiles[props0.profileId!]?.backdrop?.own : settings().general.editBackdrops[props0.slot].has);
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
      await importEditBackdrop(await r.blob(), props.slot);
    });

  return (
    <div class="bp-back" onClick={(e) => e.target === e.currentTarget && props.onClose()} onContextMenu={(e) => e.preventDefault()}>
      <div class="bp">
        <header>
          <b>Arka plan görseli seç</b>
          <span class="bp-sp" />
          <Show when={hasImage()}>
            <button class="bp-btn danger" disabled={busy()} onClick={() => run(() => clearEditBackdrop(props.slot))}>
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
                  <button class="bp-card" disabled={busy()} onClick={() => run(() => setEditBackdropFromShot(s.path, props.slot))}>
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
                if (f) run(() => importEditBackdrop(f, props.slot));
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
export function useEditBackdrop(slot: () => EditBackdropSlot | undefined, profileId?: () => string | undefined) {
  const [url, setUrl] = createSignal<string | null>(null);
  let cur: string | null = null;
  const release = () => {
    if (cur) URL.revokeObjectURL(cur);
    cur = null;
  };
  createEffect(
    on(
      () => {
        const sl = slot();
        const eb = sl ? settings().general.editBackdrops[sl] : undefined;
        // Düzenin kendi görseli / kendi aç-kapa ayarı varsa o geçerli; yoksa ortak yer
        const pid = profileId?.();
        const pb = pid ? settings().profiles[pid]?.backdrop : undefined;
        const ownSlot = pid && pb?.own ? profileBackdropSlot(pid) : undefined;
        if (sl && pb && (ownSlot || pb.enabled !== undefined))
          return [(pb.enabled ?? !!eb?.enabled) && (!!ownSlot || !!eb?.has), `${pb.rev ?? 0}:${eb?.rev ?? 0}`, ownSlot ?? sl] as const;
        return [!!eb && eb.enabled && eb.has, eb?.rev, sl] as const;
      },
      async ([want, , sl]) => {
        release();
        setUrl(null);
        if (!want) return;
        try {
          const buf = await invoke<ArrayBuffer>("edit_backdrop_read", { slot: sl });
          if (!sl || (!sl.startsWith("p-") && sl !== slot())) return;
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
