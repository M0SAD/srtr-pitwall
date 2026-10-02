// Ayarlar → Görünüm → Uygulama arka planı: yok / hazır degrade / kendi görselin (karartma + bulanıklık),
// istenirse overlay panellerinin arkasında da (soluk).

import { For, Show, createSignal } from "solid-js";
import { updateSettings, type AppBg } from "@/sdk/settings";
import { Slider, Switch } from "./SettingsForm";
import { GRADIENTS } from "../chatLook";
import { appBg, appBgImageUrl, clearAppBg, importAppBg } from "../appBg";

export function AppBgPanel() {
  const b = appBg;
  const set = (fn: (x: AppBg) => void) => updateSettings((d) => fn(d.general.appBg));
  const [err, setErr] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let file: HTMLInputElement | undefined;

  const pick = async (f: File) => {
    setErr("");
    setBusy(true);
    try {
      await importAppBg(f);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="panel">
      <h3>Uygulama arka planı</h3>
      <p class="muted small">Panelin arkasında hazır bir degrade ya da kendi görselin. Paneller yarı saydam olur, yazılar okunur kalır.</p>
      <div class="ap-rows">
        <div class="ap-row">
          <span>Arka plan</span>
          <div class="seg">
            <For
              each={[
                { v: "none", l: "Yok" },
                { v: "gradient", l: "Degrade" },
                { v: "image", l: "Görsel" },
              ] as { v: AppBg["kind"]; l: string }[]}
            >
              {(o) => (
                <button
                  classList={{ on: b().kind === o.v }}
                  onClick={() => {
                    if (o.v === "image" && !b().hasImg) return file?.click();
                    set((x) => (x.kind = o.v));
                  }}
                >
                  {o.l}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
      <Show when={b().kind === "gradient"}>
        <div class="abg-grads">
          <For each={GRADIENTS}>
            {(g) => (
              <button class="abg-grad" classList={{ on: b().gradient === g.id }} style={{ background: g.css }} onClick={() => set((x) => (x.gradient = g.id))}>
                {g.name}
              </button>
            )}
          </For>
        </div>
      </Show>
      <div class="ap-rows">
        <Show when={b().kind === "image" || b().hasImg}>
          <div class="ap-row">
            <span>
              Görsel
              <small class="muted"> · PNG, JPEG ya da WebP; küçültülüp sadece bu bilgisayarda saklanır</small>
            </span>
            <div class="abg-img">
              <Show when={b().hasImg && appBgImageUrl()}>
                <img src={appBgImageUrl()!} alt="" draggable={false} />
              </Show>
              <button class="btn ghost small" disabled={busy()} onClick={() => file?.click()}>
                {b().hasImg ? "Değiştir" : "Dosya seç"}
              </button>
              <Show when={b().hasImg}>
                <button class="btn ghost small danger" disabled={busy()} onClick={() => void clearAppBg()}>
                  Kaldır
                </button>
              </Show>
            </div>
          </div>
        </Show>
        <Show when={b().kind !== "none"}>
          <div class="ap-row">
            <span>Karartma</span>
            <Slider value={b().dim} min={0} max={85} step={5} unit="%" onInput={(v) => set((x) => (x.dim = v))} />
          </div>
        </Show>
        <Show when={b().kind === "image"}>
          <div class="ap-row">
            <span>Bulanıklık</span>
            <Slider value={b().blur} min={0} max={30} step={1} onInput={(v) => set((x) => (x.blur = v))} />
          </div>
          <div class="ap-row">
            <span>
              Overlay'lerde de göster
              <small class="muted"> · Görsel overlay panellerinin arkasında soluk görünür (tema arka plan opaklığına göre)</small>
            </span>
            <Switch checked={b().overlays} onChange={(v) => set((x) => (x.overlays = v))} />
          </div>
          <Show when={b().overlays}>
            <div class="ap-row">
              <span>Overlay'lerdeki görünürlük</span>
              <Slider value={b().overlayOpacity} min={5} max={60} step={5} unit="%" onInput={(v) => set((x) => (x.overlayOpacity = v))} />
            </div>
          </Show>
        </Show>
      </div>
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void pick(f);
          e.currentTarget.value = "";
        }}
      />
      <Show when={busy()}>
        <p class="muted small">Yükleniyor…</p>
      </Show>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
    </section>
  );
}
