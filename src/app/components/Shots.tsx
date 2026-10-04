// Ekran görüntüleri için ortak parçalar: küçük resim yükleyici, görüntü seçici,
// iRacing ekran görüntüsü bilgisi ve düzenleme ekranı arka planı ayarları.

import { For, Show, createEffect, createResource, createSignal, on, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { localeTag } from "@/sdk/i18n";
import { settings, updateSettings, type EditBackdropSlot } from "@/sdk/settings";
import { prettyKey, shortcut } from "@/sdk/shortcuts";

export interface LocalShot {
  path: string;
  name: string;
  modified: number;
  size: number;
  source: "pitwall" | "iracing";
  track: string;
  car: string;
  watermarked: boolean;
}

export interface ShotDirs {
  pitwall: string;
  iracing: string;
  iracingFound: boolean;
}

export function fmtSize(b: number) {
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(2)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

export function fmtWhen(ms: number) {
  return new Date(ms).toLocaleString(localeTag(), { dateStyle: "short", timeStyle: "short" });
}

export function listShots(source: "pitwall" | "iracing" | "all") {
  return invoke<LocalShot[]>("shots_list", { source }).catch(() => [] as LocalShot[]);
}

// ---------------------------------------------------------------------------
// Küçük resimler: aynı anda en fazla 3 tanesi hazırlanır, sonuçlar bellekte tutulur
// ---------------------------------------------------------------------------

const thumbCache = new Map<string, string>();
const queue: (() => Promise<void>)[] = [];
let active = 0;

function pump() {
  while (active < 3 && queue.length) {
    const job = queue.shift()!;
    active++;
    job().finally(() => {
      active--;
      pump();
    });
  }
}

function loadThumb(s: LocalShot): Promise<string> {
  const k = `${s.path}|${s.modified}|${s.size}`;
  const hit = thumbCache.get(k);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    queue.push(async () => {
      try {
        const buf = await invoke<ArrayBuffer>("shot_thumb", { path: s.path });
        const url = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
        thumbCache.set(k, url);
        resolve(url);
      } catch (e) {
        reject(e);
      }
    });
    pump();
  });
}

/** Görününce yüklenen küçük resim */
export function ShotThumb(props: { shot: LocalShot }) {
  const [url, setUrl] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal(false);
  let el: HTMLDivElement | undefined;
  onMount(() => {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        loadThumb(props.shot).then(setUrl, () => setFailed(true));
      },
      { rootMargin: "200px" },
    );
    io.observe(el!);
    onCleanup(() => io.disconnect());
  });
  return (
    <div class="shot-thumb" ref={el}>
      <Show when={url()} fallback={<span class="muted small">{failed() ? "Açılamadı" : ""}</span>}>
        <img src={url()!} alt="" draggable={false} />
      </Show>
    </div>
  );
}

/** Tam boyutlu yerel görüntü (blob adresi, bileşen kapanınca bırakılır) */
export function useFullImage(path: () => string | null) {
  const [url, setUrl] = createSignal<string | null>(null);
  let cur: string | null = null;
  const release = () => {
    if (cur) URL.revokeObjectURL(cur);
    cur = null;
  };
  createEffect(
    on(path, async (p) => {
      release();
      setUrl(null);
      if (!p) return;
      try {
        const buf = await invoke<ArrayBuffer>("shot_read", { path: p });
        const type = /\.png$/i.test(p) ? "image/png" : /\.bmp$/i.test(p) ? "image/bmp" : /\.webp$/i.test(p) ? "image/webp" : "image/jpeg";
        if (path() !== p) return;
        cur = URL.createObjectURL(new Blob([buf], { type }));
        setUrl(cur);
      } catch {
        /* dosya silinmiş olabilir */
      }
    }),
  );
  onCleanup(release);
  return url;
}

// ---------------------------------------------------------------------------
// Görüntü seçici (SRTR Pitwall + iRacing klasörü)
// ---------------------------------------------------------------------------

export function ShotPicker(props: { title?: string; onPick: (s: LocalShot) => Promise<void> | void; onClose: () => void }) {
  const [src, setSrc] = createSignal<"all" | "pitwall" | "iracing">("all");
  const [list] = createResource(src, listShots);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [err, setErr] = createSignal("");
  const pick = async (s: LocalShot) => {
    setBusy(s.path);
    setErr("");
    try {
      await props.onPick(s);
      props.onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal shot-picker">
        <header>
          <h3>{props.title ?? "Ekran görüntüsü seç"}</h3>
          <button class="btn ghost small" onClick={props.onClose}>
            Kapat
          </button>
        </header>
        <div class="cm-tabs">
          <button classList={{ on: src() === "all" }} onClick={() => setSrc("all")}>
            Tümü
          </button>
          <button classList={{ on: src() === "pitwall" }} onClick={() => setSrc("pitwall")}>
            SRTR Pitwall
          </button>
          <button classList={{ on: src() === "iracing" }} onClick={() => setSrc("iracing")}>
            iRacing
          </button>
        </div>
        <Show when={(list() ?? []).length > 0} fallback={<div class="muted small">{list.loading ? "Aranıyor…" : <IracingShotHelp compact />}</div>}>
          <div class="shot-grid small">
            <For each={list()}>
              {(s) => (
                <button class="shot-card" disabled={!!busy()} onClick={() => pick(s)}>
                  <ShotThumb shot={s} />
                  <span class="shot-cap">
                    <i class={`shot-src ${s.source}`}>{s.source === "iracing" ? "iRacing" : "SRTR"}</i>
                    <small>{busy() === s.path ? "Yükleniyor…" : fmtWhen(s.modified)}</small>
                  </span>
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={err()}>
          <p class="error small">{err()}</p>
        </Show>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// iRacing'de ekran görüntüsü nasıl alınır
// ---------------------------------------------------------------------------

export function IracingShotHelp(props: { compact?: boolean }) {
  return (
    <div class="ir-help" classList={{ compact: !!props.compact }}>
      <b>iRacing'de ekran görüntüsü</b>
      <ul>
        <li>
          Varsayılan tuş: <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>
        </li>
        <li>{"Önce iRacing'de Settings → Interface → Camera & Screen Capture bölümünden \"Video and Screen Capture\" seçeneğini aç, sonra simden çıkıp yeniden gir."}</li>
        <li>Görüntüler Belgeler\iRacing\screenshots klasörüne kaydedilir; SRTR Pitwall bu klasörü kendiliğinden gösterir.</li>
        <li>Replay ekranında Boşluk tuşu iRacing arayüzünü gizler.</li>
        <li>
          iRacing'in kendi görüntülerinde overlay'ler yer almaz. Overlay'lerle birlikte çekmek için SRTR Pitwall kısayolunu kullan:{" "}
          <kbd>{prettyKey(shortcut("shot"))}</kbd>
        </li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Düzenleme ekranı arka planı
// ---------------------------------------------------------------------------

// Her yerin (Düzenler tuvali / Yayın düzenleri tuvali / ekranda düzenleme) kendi görseli ve ayarı vardır.
// Yer verilmeyen kısayollar ("Düzenleme arka planı yap") ekranda düzenleme modunu ayarlar.
function bumpBackdrop(slot: EditBackdropSlot, has: boolean) {
  updateSettings((d) => {
    const eb = d.general.editBackdrops[slot];
    eb.has = has;
    if (has) eb.enabled = true;
    eb.rev = (eb.rev || 0) + 1;
  });
}

export async function setEditBackdropFromShot(path: string, slot: EditBackdropSlot = "screen") {
  await invoke("edit_backdrop_set", { path, slot });
  bumpBackdrop(slot, true);
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export async function importEditBackdrop(blob: Blob, slot: EditBackdropSlot = "screen") {
  await invoke("edit_backdrop_import", { data: await toBase64(blob), slot });
  bumpBackdrop(slot, true);
}

export async function clearEditBackdrop(slot: EditBackdropSlot = "screen") {
  await invoke("edit_backdrop_clear", { slot });
  bumpBackdrop(slot, false);
}

/** Ayarlar → Genel → Düzenleme ekranı */
export function EditBackdropSettings() {
  const [slot, setSlot] = createSignal<EditBackdropSlot>("screen");
  const eb = () => settings().general.editBackdrops[slot()];
  const [picking, setPicking] = createSignal(false);
  const [err, setErr] = createSignal("");
  const [preview, setPreview] = createSignal<string | null>(null);
  let cur: string | null = null;
  createEffect(
    on(
      () => [eb().has, eb().rev, slot()] as const,
      async ([has, , sl]) => {
        if (cur) URL.revokeObjectURL(cur);
        cur = null;
        setPreview(null);
        if (!has) return;
        try {
          const buf = await invoke<ArrayBuffer>("edit_backdrop_read", { slot: sl });
          if (sl !== slot()) return;
          cur = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
          setPreview(cur);
        } catch {
          /* dosya yok */
        }
      },
    ),
  );
  onCleanup(() => cur && URL.revokeObjectURL(cur));
  let file: HTMLInputElement | undefined;
  const wrap = (p: Promise<unknown>) => p.then(() => setErr("")).catch((e) => setErr(String((e as Error)?.message ?? e)));

  return (
    <>
      <div class="row">
        <div>
          <b>Arka plan yeri</b>
          <small>Her düzenleme ekranının arka planı ayrıdır; aşağıdaki görsel ve ayarlar sadece seçili yer için geçerlidir.</small>
        </div>
        <select class="f2-select small" value={slot()} onChange={(e) => setSlot(e.currentTarget.value as EditBackdropSlot)}>
          <option value="screen">Ekranda düzenleme</option>
          <option value="layout">Düzenler</option>
          <option value="stream">Yayın düzenleri</option>
        </select>
      </div>
      <div class="row">
        <div>
          <b>Arka plan görseli</b>
          <small>
            Düzenlerken overlay'lerin arkasında bu görsel gösterilir. Örneğin kokpit içinden bir ekran görüntüsü seçersen overlay'leri
            oyundaymış gibi yerleştirebilirsin.
          </small>
        </div>
        <div class="eb-actions">
          <button class="btn ghost small" onClick={() => setPicking(true)}>
            Ekran görüntülerinden seç
          </button>
          <button class="btn ghost small" onClick={() => file?.click()}>
            Dosyadan seç
          </button>
          <Show when={eb().has}>
            <button class="btn ghost small danger" onClick={() => wrap(clearEditBackdrop(slot()))}>
              Kaldır
            </button>
          </Show>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/bmp"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) wrap(importEditBackdrop(f, slot()));
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>
      <Show when={preview()}>
        <div class="eb-preview">
          <img src={preview()!} alt="" style={{ opacity: eb().opacity / 100 }} />
        </div>
        <div class="row">
          <div>
            <b>Düzenlerken göster</b>
          </div>
          <label class="switch">
            <input type="checkbox" checked={eb().enabled} onChange={(e) => updateSettings((d) => (d.general.editBackdrops[slot()].enabled = e.currentTarget.checked))} />
            <i />
          </label>
        </div>
        <div class="row">
          <div>
            <b>Görsel opaklığı</b>
          </div>
          <div class="range-row">
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={eb().opacity}
              onInput={(e) => updateSettings((d) => (d.general.editBackdrops[slot()].opacity = Number(e.currentTarget.value)))}
            />
            <span>{eb().opacity}%</span>
          </div>
        </div>
      </Show>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
      <details class="ir-details">
        <summary>iRacing'de ekran görüntüsü nasıl alınır?</summary>
        <IracingShotHelp />
      </details>
      <Show when={picking()}>
        <ShotPicker title="Düzenleme arka planı seç" onPick={(s) => setEditBackdropFromShot(s.path, slot())} onClose={() => setPicking(false)} />
      </Show>
    </>
  );
}
