// Ayarlar → VR: VR modu (overlay'leri VR pencere yakalama araçları için ayrı pencerelerde açar; Rust: vr.rs)
// ve adım adım "VR kurulumu" rehberi (aynı içerik: docs/vr_kurulum.md).

import { For, Show, onMount } from "solid-js";
import { settings, updateSettings, type VrSettings } from "@/sdk/settings";
import { loadMonitors, monitors } from "@/sdk/monitors";
import { Switch } from "./SettingsForm";

function Row(p: { title: string; sub?: string; children: any }) {
  return (
    <div class="row">
      <div>
        <b>{p.title}</b>
        <Show when={p.sub}>
          <small>{p.sub}</small>
        </Show>
      </div>
      {p.children}
    </div>
  );
}

function Seg<T extends string>(p: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="seg">
      <For each={p.options}>
        {(o) => (
          <button classList={{ on: p.value === o.v }} onClick={() => p.onChange(o.v)}>
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

export function VrPanel() {
  const vr = () => settings().general.vr;
  const set = (fn: (x: VrSettings) => void) => updateSettings((d) => fn(d.general.vr));
  onMount(() => void loadMonitors());

  return (
    <div class="page narrow">
      <section class="panel">
        <h3>VR modu</h3>
        <p class="muted small">
          VR gözlüğünde masaüstü pencereleri görünmez. VR modu, overlay'leri OpenKneeboard, OVR Toolkit, Desktop+ ve XSOverlay gibi
          araçların yakalayıp gözlüğün içine yerleştirebileceği ayrı pencerelerde açar. Normal overlay'ler olduğu gibi çalışmaya
          devam eder.
        </p>
        <Row title="VR modu" sub={"Açık overlay'ler \"SRTR Pitwall - <Overlay adı>\" başlıklı pencerelerde de gösterilir."}>
          <Switch checked={vr().enabled} onChange={(v) => set((x) => (x.enabled = v))} />
        </Row>
        <Show when={vr().enabled}>
          <Row title="VR pencereleri" sub={"Her overlay ayrı pencere: gözlükte tek tek yerleştirilir. VR panosu: tüm düzen tek pencerede (\"SRTR Pitwall - VR Panosu\"), tek yakalama kaynağı."}>
            <Seg
              value={vr().source}
              options={[
                { v: "windows", label: "Ayrı pencereler" },
                { v: "board", label: "VR panosu" },
                { v: "both", label: "İkisi de" },
              ]}
              onChange={(v) => set((x) => (x.source = v))}
            />
          </Row>
          <Row title="VR arka planı" sub="Saydamlığı alamayan araçlar için opak renk seç; araçta bu rengi saydam yap (chroma key) ya da siyah bırak.">
            <Seg
              value={vr().background}
              options={[
                { v: "transparent", label: "Saydam" },
                { v: "black", label: "Siyah" },
                { v: "green", label: "Yeşil" },
                { v: "custom", label: "Özel renk" },
              ]}
              onChange={(v) => set((x) => (x.background = v))}
            />
          </Row>
          <Show when={vr().background === "custom"}>
            <Row title="Özel renk">
              <input type="color" value={vr().color} onChange={(e) => set((x) => (x.color = e.currentTarget.value))} />
            </Row>
          </Show>
          <Row title="Pencerelerin yeri" sub="Masaüstü dışı: pencereler ekranların sağındaki görünmeyen alana konur, ayna penceresini kapatmaz (deneysel; aracın pencereyi görmediği olursa Monitörde'yi seç).">
            <Seg
              value={vr().place}
              options={[
                { v: "desktop", label: "Monitörde" },
                { v: "offscreen", label: "Masaüstü dışı" },
              ]}
              onChange={(v) => set((x) => (x.place = v))}
            />
          </Row>
          <Show when={vr().place === "desktop" && monitors().length > 1}>
            <Row title="VR pencerelerinin monitörü" sub="Oyunun ayna penceresinin olmadığı monitörü seç.">
              <select
                class="input"
                value={vr().monitor === null ? "" : String(vr().monitor)}
                onChange={(e) => set((x) => (x.monitor = e.currentTarget.value === "" ? null : Number(e.currentTarget.value)))}
              >
                <option value="">Ana monitör</option>
                <For each={monitors()}>
                  {(m) => (
                    <option value={String(m.index)} data-no-i18n>
                      {m.index + 1}: {m.width}×{m.height}
                    </option>
                  )}
                </For>
              </select>
            </Row>
          </Show>
          <Row title="Masaüstü overlay'ini gizle" sub="Ekranı kaplayan normal overlay penceresi gösterilmez (düzenleme modunda yine görünür). Sadece VR'da sürüyorsan aç.">
            <Switch checked={vr().hideDesktop} onChange={(v) => set((x) => (x.hideDesktop = v))} />
          </Row>
        </Show>
        <p class="muted small">
          VR modunu açıp kapattıktan sonra uygulamayı bir kez yeniden başlat: pencerelerin arkada kalınca da çizmeye devam etmesini
          sağlayan ayar açılışta uygulanır. Ayrı pencereler etkin düzendeki açık overlay'ler için açılır.
        </p>
      </section>

      <section class="panel">
        <h3>VR kurulumu</h3>
        <p class="muted small">
          Önce yukarıdan VR modunu aç, uygulamayı yeniden başlat ve göstermek istediğin overlay'leri Overlay'ler sayfasından aç.
          Pencereleri görmek için Demo'yu açabilirsin.
        </p>
        <details open>
          <summary>
            <b>OpenKneeboard (önerilen, ücretsiz)</b>
          </summary>
          <ol class="muted">
            <li>OpenKneeboard'u kur ve aç. iRacing OpenXR ile çalışıyorsa ek ayar gerekmez; SteamVR/OpenVR kullanıyorsan Settings → VR bölümünden SteamVR desteğini aç.</li>
            <li>Settings → Tabs → Add a tab → Window Capture seç.</li>
            <li>Listeden "SRTR Pitwall - VR Panosu" ya da tek bir overlay penceresini (ör. "SRTR Pitwall - Relative") seç.</li>
            <li>Pencere eşleştirmede başlığın tam eşleşmesini (Exact title) seç; SRTR Pitwall her açılışta pencereyi kendiliğinden bulur.</li>
            <li>"Capture client area only" seçeneğini aç, imleç yakalamayı kapat.</li>
            <li>Settings → VR bölümünden panonun konumunu, boyutunu ve opaklığını ayarla. Birden fazla overlay için her birine ayrı View ekle.</li>
          </ol>
        </details>
        <details>
          <summary>
            <b>OVR Toolkit (Steam, ücretli)</b>
          </summary>
          <ol class="muted">
            <li>SteamVR açıkken OVR Toolkit'i başlat.</li>
            <li>Bilek menüsünden yeni bir pencere ekle ve kaynak olarak "SRTR Pitwall - …" penceresini seç (Window capture).</li>
            <li>Pencereyi dünyaya ya da kokpite sabitle (World / Tracking device), boyutunu ve opaklığını ayarla.</li>
            <li>Saydam görünmüyorsa VR arka planını Yeşil yap ve pencere ayarlarından Chroma key'i aç; ya da Siyah bırakıp opaklığı düşür.</li>
          </ol>
        </details>
        <details>
          <summary>
            <b>Desktop+ (Steam, ücretsiz)</b>
          </summary>
          <ol class="muted">
            <li>SteamVR açıkken Desktop+'ı başlat ve kontrol panelinden yeni bir overlay ekle (Add Overlay → Window).</li>
            <li>Yakalama kaynağı olarak Graphics Capture ile "SRTR Pitwall - …" penceresini seç.</li>
            <li>Konumu "Playspace" ya da "Seated" olarak sabitle, genişliği ve eğriliği ayarla.</li>
            <li>Güncelleme hızını (FPS limit) 30'a çek; overlay'ler için fazlası gerekmez.</li>
          </ol>
        </details>
        <details>
          <summary>
            <b>Önerilen boyutlar ve performans</b>
          </summary>
          <ul class="muted">
            <li>Relative ve Sıralama: gözlükte yaklaşık 35–45 cm genişlik, direksiyonun sol ya da sağ üstü. Yakıt, delta ve girdiler: 20–30 cm, gösterge panelinin üstü.</li>
            <li>Yazılar küçük kalıyorsa pencereyi büyütmek yerine Görünüm sayfasından yazı boyutunu artır: yakalanan görüntü daha net olur.</li>
            <li>Tek tek pencereler yerine VR panosu daha az kaynak kullanır (tek yakalama); ama gözlükte tek parça olarak yerleşir.</li>
            <li>Ayarlar → Performans'tan telemetri hızını 30 Hz yap ve "Görsel efektleri azalt"ı aç.</li>
            <li>Yakalama aracında kare hızını 30 FPS ile sınırla; overlay'i gözlüğün tam ortasına değil, bakış alanının kenarına koy.</li>
            <li>Kullanmadığın overlay'leri kapat: her açık overlay ayrı bir pencere ve ayrı bir yakalama demektir.</li>
            <li>Pencereler donuyorsa (oyun tam ekrandayken güncellenmiyorsa) uygulamayı VR modu açıkken yeniden başlattığından emin ol ve pencere yerini Monitörde yap.</li>
          </ul>
        </details>
        <p class="muted small">
          Yerel SteamVR (OpenVR) overlay'i henüz yok: overlay'ler gözlüğe yukarıdaki araçlardan biriyle taşınır. iRacing'i VR'da
          kullanırken sesli mühendis ve spotter herhangi bir ek ayar olmadan çalışır.
        </p>
      </section>
    </div>
  );
}
