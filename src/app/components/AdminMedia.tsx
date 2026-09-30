// Yönetici: ekran görüntüsü filigranı ve görsel barındırma (Supabase Storage) ayarları.

import { For, Show, createResource, createSignal } from "solid-js";
import { t } from "@/sdk/i18n";
import { invoke } from "@tauri-apps/api/core";
import { adminStorageUsage, config, profile, saveConfig } from "@/cloud/account";
import { projectRef, publicUrl, storageUpload } from "@/cloud/supabase";
import { DEFAULT_WATERMARK, WM_POSITIONS, composePreview, normalizeWatermark, type WatermarkCfg, type WmPosition } from "@/sdk/watermark";
import cockpitImg from "@/assets/backdrops/cockpit.jpg";
import dayImg from "@/assets/backdrops/day.jpg";
import { fmtSize } from "./Shots";

/** Supabase ücretsiz planı: 1 GB dosya depolama */
const FREE_STORAGE = 1024 ** 3;

type Run = (fn: () => Promise<unknown>, ok: string) => void;

export function AdminWatermark(props: { run: Run }) {
  const [wm, setWm] = createSignal<WatermarkCfg>(normalizeWatermark(config()?.watermark));
  const [dirty, setDirty] = createSignal(false);
  const [bg, setBg] = createSignal(cockpitImg);
  const [uploading, setUploading] = createSignal(false);
  const set = <K extends keyof WatermarkCfg>(k: K, v: WatermarkCfg[K]) => {
    setWm({ ...wm(), [k]: v });
    setDirty(true);
  };
  const [preview] = createResource(
    () => ({ c: wm(), bg: bg() }),
    (k) => composePreview(k.bg, k.c, profile()?.display_name || "Emre Kaya"),
  );
  let file: HTMLInputElement | undefined;

  const upload = async (f: File) => {
    setUploading(true);
    try {
      const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
      const path = `watermark-logo-${Date.now()}.${ext}`;
      await storageUpload("branding", path, f, f.type || "image/png", true);
      setWm({ ...wm(), logo: "custom", logo_url: publicUrl("branding", path) });
      setDirty(true);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <h4>Ekran görüntüsü filigranı</h4>
      <p class="muted small">
        Kullanıcıların SRTR Pitwall ile çektiği ve toplulukta paylaştığı tüm görüntülere eklenir. Kaydedince tüm uygulamalara
        birkaç dakika içinde (en geç açılışta) ulaşır.
      </p>
      <div class="wm-admin">
        <div class="wm-controls">
          <div class="row">
            <b>Filigran</b>
            <label class="switch">
              <input type="checkbox" checked={wm().enabled} onChange={(e) => set("enabled", e.currentTarget.checked)} />
              <i />
            </label>
          </div>
          <div class="row">
            <div>
              <b>Yazı</b>
              <small>{t("{user} yerine görüntüyü çekenin adı yazılır")}</small>
            </div>
            <input class="input" maxLength={80} value={wm().text} onInput={(e) => set("text", e.currentTarget.value)} />
          </div>
          <div class="row">
            <b>Logo</b>
            <div class="eb-actions">
              <select value={wm().logo} onChange={(e) => set("logo", e.currentTarget.value as WatermarkCfg["logo"])}>
                <option value="none">Yok</option>
                <option value="app">SRTR Pitwall logosu</option>
                <option value="custom">Kendi logom</option>
              </select>
              <Show when={wm().logo === "custom"}>
                <button
                  class="btn ghost small"
                  disabled={uploading()}
                  onClick={() => file?.click()}
                >
                  {uploading() ? "Yükleniyor…" : wm().logo_url ? "Değiştir" : "Logo yükle"}
                </button>
              </Show>
              <input
                ref={file}
                type="file"
                accept="image/png,image/webp,image/jpeg"
                hidden
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f) props.run(() => upload(f), "Logo yüklendi");
                  e.currentTarget.value = "";
                }}
              />
            </div>
          </div>
          <div class="row">
            <b>Konum</b>
            <select value={wm().position} onChange={(e) => set("position", e.currentTarget.value as WmPosition)}>
              <For each={WM_POSITIONS}>{(p) => <option value={p.id}>{p.name}</option>}</For>
            </select>
          </div>
          <div class="row">
            <b>Boyut</b>
            <div class="range-row">
              <input type="range" min="1" max="6" step="0.1" value={wm().size} onInput={(e) => set("size", Number(e.currentTarget.value))} />
              <span>{wm().size.toFixed(1)}%</span>
            </div>
          </div>
          <div class="row">
            <b>Opaklık</b>
            <div class="range-row">
              <input type="range" min="20" max="100" step="5" value={wm().opacity} onInput={(e) => set("opacity", Number(e.currentTarget.value))} />
              <span>{wm().opacity}%</span>
            </div>
          </div>
          <div class="row">
            <b>Renk</b>
            <input type="color" value={wm().color} onInput={(e) => set("color", e.currentTarget.value)} />
          </div>
          <div class="row">
            <b>Gölge</b>
            <label class="switch">
              <input type="checkbox" checked={wm().shadow} onChange={(e) => set("shadow", e.currentTarget.checked)} />
              <i />
            </label>
          </div>
        </div>
        <div class="wm-preview">
          <Show when={preview()} fallback={<div class="wm-preview-empty" />}>
            <img src={preview()!} alt="" />
          </Show>
          <div class="cm-tabs">
            <button classList={{ on: bg() === cockpitImg }} onClick={() => setBg(cockpitImg)}>
              Kokpit
            </button>
            <button classList={{ on: bg() === dayImg }} onClick={() => setBg(dayImg)}>
              Pist
            </button>
          </div>
        </div>
      </div>
      <div class="btns">
        <button
          class="btn primary"
          disabled={!dirty()}
          onClick={() =>
            props.run(async () => {
              await saveConfig({ watermark: wm() });
              setDirty(false);
            }, "Filigran kaydedildi")
          }
        >
          Kaydet
        </button>
        <button
          class="btn ghost"
          onClick={() => {
            setWm({ ...DEFAULT_WATERMARK });
            setDirty(true);
          }}
        >
          Varsayılana dön
        </button>
      </div>
    </>
  );
}

export function AdminHosting(props: { run: Run }) {
  const [usage, { refetch }] = createResource(() => adminStorageUsage().catch(() => null));
  const c = () => config();
  const [draft, setDraft] = createSignal<{ shots_enabled?: boolean; shot_max_width?: number; shot_quality?: number; shot_daily_limit?: number }>({});
  const val = <K extends keyof ReturnType<typeof draft>>(k: K, d: NonNullable<ReturnType<typeof draft>[K]>) =>
    (draft()[k] ?? (c()?.[k] as typeof d | undefined) ?? d) as typeof d;
  const shots = () => usage()?.find((u) => u.bucket === "screenshots");
  const total = () => (usage() ?? []).reduce((a, u) => a + Number(u.bytes), 0);
  const pct = () => Math.min(100, (total() / FREE_STORAGE) * 100);

  return (
    <>
      <h4>Görsel barındırma</h4>
      <div class="host-card">
        <div class="host-head">
          <div>
            <b>Supabase Storage</b>
            <small class="muted">Ücretsiz plan · kova: screenshots</small>
          </div>
          <span class="admin-badge">Ücretsiz</span>
        </div>
        <p class="muted small">
          Ücretsiz planda 1 GB depolama ve ayda 5 GB trafik var. Görseller küçültülüp JPEG olarak yüklenir, listede ayrı küçük
          resimler kullanılır; bir görüntü ortalama 300–600 KB tutar (yaklaşık 2000 görüntü).
        </p>
        <Show when={usage()} fallback={<p class="muted small">{usage.loading ? "Kullanım okunuyor…" : "Kullanım okunamadı."}</p>}>
          <div class="usage-bar">
            <i style={{ width: `${pct()}%` }} classList={{ warn: pct() > 80 }} />
          </div>
          <small class="muted">
            {fmtSize(total())} / 1 GB · {`${Math.round(Number(shots()?.files ?? 0) / 2)} görüntü`}
          </small>
        </Show>
        <div class="btns">
          <button class="btn ghost small" onClick={() => refetch()}>
            Yenile
          </button>
          <button
            class="btn ghost small"
            onClick={() => invoke("open_url", { url: `https://supabase.com/dashboard/project/${projectRef()}/storage/buckets/screenshots` })}
          >
            Supabase'de aç
          </button>
          <button class="btn ghost small" onClick={() => invoke("open_url", { url: `https://supabase.com/dashboard/project/${projectRef()}/settings/billing/usage` })}>
            Kullanım ve kotalar
          </button>
        </div>
      </div>

      <div class="row">
        <div>
          <b>Toplulukta ekran görüntüsü paylaşımı</b>
          <small>Kapalıyken kimse yeni görüntü paylaşamaz (yöneticiler hariç)</small>
        </div>
        <label class="switch">
          <input type="checkbox" checked={val("shots_enabled", true)} onChange={(e) => setDraft({ ...draft(), shots_enabled: e.currentTarget.checked })} />
          <i />
        </label>
      </div>
      <div class="row">
        <div>
          <b>En büyük genişlik</b>
          <small>Yüklenen görüntü bu genişliğe küçültülür</small>
        </div>
        <select value={val("shot_max_width", 1920)} onChange={(e) => setDraft({ ...draft(), shot_max_width: Number(e.currentTarget.value) })}>
          <For each={[1280, 1600, 1920, 2560]}>{(w) => <option value={w}>{w} px</option>}</For>
        </select>
      </div>
      <div class="row">
        <b>JPEG kalitesi</b>
        <div class="range-row">
          <input
            type="range"
            min="60"
            max="95"
            step="1"
            value={val("shot_quality", 85)}
            onInput={(e) => setDraft({ ...draft(), shot_quality: Number(e.currentTarget.value) })}
          />
          <span>{val("shot_quality", 85)}</span>
        </div>
      </div>
      <div class="row">
        <div>
          <b>Günlük paylaşım sınırı</b>
          <small>Kullanıcı başına, 24 saatte</small>
        </div>
        <input
          class="input port"
          type="number"
          min="1"
          max="500"
          value={val("shot_daily_limit", 20)}
          onChange={(e) => setDraft({ ...draft(), shot_daily_limit: Math.max(1, Number(e.currentTarget.value) || 20) })}
        />
      </div>
      <button
        class="btn primary"
        disabled={Object.keys(draft()).length === 0}
        onClick={() =>
          props.run(async () => {
            await saveConfig(draft());
            setDraft({});
          }, "Barındırma ayarları kaydedildi")
        }
      >
        Kaydet
      </button>
    </>
  );
}
