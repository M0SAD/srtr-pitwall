import { For, Show, createMemo, onMount } from "solid-js";
import { BRANDS, ensureLogos, logoFiles, normKey, notifyLogosChanged, openLogosFolder } from "@/sdk/logos";
import { inTauri } from "@/sdk/platform";

/** Görünüm sayfasında: kullanıcının koyduğu marka logoları */
export function LogosPanel() {
  onMount(ensureLogos);
  const have = createMemo(() => new Map(logoFiles().map((f) => [normKey(f.name), f.dataUrl])));
  const src = (id: string, name: string) => have().get(normKey(id)) ?? have().get(normKey(name));
  const count = () => BRANDS.filter((b) => src(b.id, b.name)).length;
  const unknown = createMemo(() => {
    const known = new Set(BRANDS.flatMap((b) => [normKey(b.id), normKey(b.name)]));
    return logoFiles().filter((f) => !known.has(normKey(f.name)));
  });

  return (
    <section class="panel">
      <h3>Araç markası logoları</h3>
      <p class="muted">
        Marka logoları tescilli olduğu için uygulamayla gelmez. Logo dosyalarını (PNG, SVG veya WEBP, en fazla 512 KB)
        logo klasörüne marka adıyla koy: <code>porsche.png</code>, <code>aston-martin.svg</code> gibi. Leaderboard,
        Relative ve Live Timing araç adından markayı bulup logoyu gösterir; logo yoksa marka adı yazılır. Şeffaf
        arka planlı, açık renkli logolar en iyi görünür.
      </p>
      <div class="btns">
        <Show when={inTauri}>
          <button class="btn" onClick={() => openLogosFolder()}>
            Logo klasörünü aç
          </button>
        </Show>
        <button class="btn ghost" onClick={() => notifyLogosChanged()}>
          Yeniden yükle
        </button>
        <span class="muted">
          {count()} / {BRANDS.length} marka
        </span>
      </div>
      <div class="logo-grid">
        <For each={BRANDS}>
          {(b) => (
            <div class="logo-cell" classList={{ on: !!src(b.id, b.name) }} title={`Dosya adı: ${b.id}.png`}>
              <Show when={src(b.id, b.name)} fallback={<span class="logo-miss">—</span>}>
                <img src={src(b.id, b.name)} alt={b.name} />
              </Show>
              <span>{b.name}</span>
              <code>{b.id}</code>
            </div>
          )}
        </For>
      </div>
      <Show when={unknown().length > 0}>
        <p class="muted">
          Eşleşmeyen dosyalar: {unknown().map((f) => f.file).join(", ")}. Dosya adını yukarıdaki adlardan biri yap.
        </p>
      </Show>
    </section>
  );
}
