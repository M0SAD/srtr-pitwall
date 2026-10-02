// Ayarlar → VR: VR modu (overlay'leri VR pencere yakalama araçları için ayrı pencerelerde açar; Rust: vr.rs)
// ve adım adım "VR kurulumu" rehberi (aynı içerik: docs/vr_kurulum.md).

import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { activeProfile, instanceName, instancesOf, settings, updateSettings, type VrNativeSettings, type VrPlacement, type VrSettings } from "@/sdk/settings";
import { loadMonitors, monitors } from "@/sdk/monitors";
import { shortcut } from "@/sdk/shortcuts";
import { t } from "@/sdk/i18n";
import { Slider, Switch } from "./SettingsForm";

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

/** Rust: vrnative/mod.rs Status */
interface NativeStatus {
  supported: boolean;
  state: string;
  detail: string;
  overlays: number;
  config: boolean;
  selected: string;
  mode: string;
  auto: boolean;
  openvr: string;
  logFile: string;
  log: string[];
}

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Yerel VR (SteamVR / OpenVR overlay'i, deneysel). Rust: src-tauri/src/vrnative */
function NativeVr() {
  const nv = () => settings().general.vr.native;
  const set = (fn: (x: VrNativeSettings) => void) => updateSettings((d) => fn(d.general.vr.native));
  const [st, setSt] = createSignal<NativeStatus | null>(null);
  const refresh = () => {
    if (!inTauri) return;
    invoke<NativeStatus>("vr_native_status")
      .then(setSt)
      .catch(() => {});
  };
  onMount(() => {
    refresh();
    const timer = window.setInterval(refresh, 1000);
    onCleanup(() => window.clearInterval(timer));
  });
  const active = () => ["starting", "waiting", "running"].includes(st()?.state ?? "");
  const running = () => st()?.state === "running";
  const cmd = (action: string, key?: string) => {
    invoke("vr_native_cmd", { action, key: key ?? null })
      .then(refresh)
      .catch(() => {});
  };
  const start = () => {
    // Pencerelerin arkada kalınca da çizmesi için gereken WebView2 ayarı bir sonraki açılışta uygulanır
    if (!nv().used) set((x) => (x.used = true));
    invoke("vr_native_start")
      .then(refresh)
      .catch(() => {});
  };
  const stop = () => {
    invoke("vr_native_stop")
      .then(refresh)
      .catch(() => {});
  };
  const waitText = (d: string) => (d === "noHmd" ? t("gözlük bağlı değil") : d === "noRuntime" ? t("SteamVR kurulu değil") : d);
  const statusText = () => {
    const s = st();
    if (!s) return t("Durum alınamadı");
    if (!s.supported) return t("Yerel VR sadece Windows'ta çalışır");
    switch (s.state) {
      case "dll":
        return t("openvr_api.dll bulunamadı");
      case "noRuntime":
        return t("SteamVR kurulu değil");
      case "noHmd":
        return t("Gözlük yok (SteamVR bir gözlük bulamadı)");
      case "ready":
        return t("Hazır, başlatılmadı");
      case "starting":
        return t("Başlatılıyor…");
      case "waiting":
        return t("SteamVR bekleniyor ({0})", waitText(s.detail));
      case "running":
        return t("Çalışıyor ({0} overlay)", s.overlays);
      case "error":
        return t("Hata: {0}", s.detail.startsWith("dll: ") ? s.detail.slice(5) : waitText(s.detail));
      default:
        return s.state;
    }
  };
  const key = (a: Parameters<typeof shortcut>[0]) => shortcut(a) || "—";

  /** Etkin düzendeki açık overlay'ler ve (varsa) kayıtlı yerleşimleri */
  /** Yalnız kimlikler: liste öğeleri ayar her değiştiğinde yeniden oluşturulmasın (kaydırıcı sürüklenirken kopmasın) */
  const keys = () =>
    instancesOf(activeProfile())
      .filter(([, inst]) => inst.enabled)
      .map(([k]) => k);
  const item = (k: string) => {
    const inst = activeProfile().overlays[k];
    return { key: k, name: inst ? instanceName(k, inst) : k, get place() { return nv().overlays[k] as VrPlacement | undefined; } };
  };
  const setPlace = (k: string, fn: (p: VrPlacement) => void) =>
    set((x) => {
      const p = x.overlays[k];
      if (p) fn(p);
    });
  const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
  const resetPlace = (k: string) => {
    if (running()) {
      // Varsayılan dizilimi Rust hesaplar (yaydaki sırasına göre)
      invoke("vr_native_cmd", { action: "select", key: k })
        .then(() => invoke("vr_native_cmd", { action: "reset", key: null }))
        .catch(() => {});
    } else {
      // Çalışmıyorken: kayıt silinir, bir sonraki başlatmada varsayılan yerine konur
      set((x) => {
        delete x.overlays[k];
      });
    }
  };

  return (
    <section class="panel">
      <h3>Yerel VR (SteamVR) — deneysel</h3>
      <p class="muted small">
        Overlay'leri pencere yakalama aracı olmadan doğrudan SteamVR'ın içine çizer. SteamVR etkin çalışma zamanıyken çalışır
        (OpenXR oyunları SteamVR üzerinden çalışırken de). Oculus / Windows Mixed Reality'nin kendi çalışma zamanında çalışmaz;
        onlar için yukarıdaki VR modunu ve bir pencere yakalama aracını kullan. Deneyseldir: sorun yaşarsan Durdur'a bas ve VR
        günlüğünü bize gönder.
      </p>
      <Row title="Durum" sub={st()?.openvr ? `OpenVR ${st()!.openvr}` : undefined}>
        <div style={{ display: "flex", gap: "8px", "align-items": "center", "flex-wrap": "wrap", "justify-content": "flex-end" }}>
          <span classList={{ warn: st()?.state === "error" }} data-no-i18n>
            {statusText()}
          </span>
          <Show when={!active()} fallback={<button class="btn small" onClick={stop}>Durdur</button>}>
            <button class="btn small" disabled={!st()?.supported || st()?.state === "dll" || st()?.state === "noRuntime"} onClick={start}>
              Başlat
            </button>
          </Show>
        </div>
      </Row>
      <Row title="Sim bağlanınca otomatik başlat" sub="SteamVR çalışıyorsa oyuna girince kendiliğinden başlar, oyundan çıkınca durur. SteamVR'ı kendisi açmaz; 10 saniyede bir yeniden dener.">
        <Switch checked={nv().autoStart} onChange={(v) => set((x) => (x.autoStart = v))} />
      </Row>
      <Row title="Masaüstünde de göster" sub="Kapalıyken yerel VR çalıştığı sürece ekranı kaplayan normal overlay gizlenir.">
        <Switch checked={nv().showDesktop} onChange={(v) => set((x) => (x.showDesktop = v))} />
      </Row>
      <Row title="Overlay'leri ters çevir" sub="Overlay'ler gözlükte baş aşağı görünüyorsa aç (180° döndürür).">
        <Switch checked={nv().invert} onChange={(v) => set((x) => (x.invert = v))} />
      </Row>
      <Row title="Kare hızı" sub="Her overlay saniyede bu kadar kez yakalanır. Yüksek değer daha çok işlemci kullanır.">
        <Seg
          value={String(nv().fps)}
          options={[
            { v: "10", label: "10" },
            { v: "15", label: "15" },
            { v: "30", label: "30" },
          ]}
          onChange={(v) => set((x) => (x.fps = Number(v) as 10 | 15 | 30))}
        />
      </Row>
      <Row title="Saydamlık yöntemi" sub="Anahtar renk: VR arka plan rengi (varsayılan siyah) tamamen saydam yapılır; overlay'deki aynı renkli pikseller de saydamlaşır. Opak: arka plan olduğu gibi kalır.">
        <Seg
          value={nv().transparency}
          options={[
            { v: "key", label: "Saydam (anahtar renk)" },
            { v: "opaque", label: "Opak" },
          ]}
          onChange={(v) => set((x) => (x.transparency = v))}
        />
      </Row>
      <Row title="İzleme başlangıcı" sub="Oturarak: SteamVR'ın oturma konumu sıfırlamasına göre. Ayakta: oda merkezine göre; ilk başlatmada baktığın yön başlangıç olur.">
        <Seg
          value={nv().origin}
          options={[
            { v: "seated", label: "Oturarak" },
            { v: "standing", label: "Ayakta" },
          ]}
          onChange={(v) => set((x) => (x.origin = v))}
        />
      </Row>

      <Show when={running()}>
        <Row
          title="Yapılandırma modu"
          sub="Açıkken seçili overlay gözlükte renklenir ve masaüstü faresiyle taşınır. DİKKAT: bu modda SRTR Pitwall pencereleri dışındaki fare tıklamaları ve tekerlek diğer programlara gitmez. 3 dakika dokunulmazsa kendiliğinden kapanır."
        >
          <div style={{ display: "flex", gap: "8px", "align-items": "center", "flex-wrap": "wrap", "justify-content": "flex-end" }}>
            <Show when={st()?.config}>
              <span class="muted small">{st()?.mode === "adjust" ? "Ayar modu" : "Konum modu"}</span>
              <button class="btn ghost small" onClick={() => cmd("mode")}>
                Mod değiştir
              </button>
            </Show>
            <button class="btn ghost small" onClick={() => cmd("recenter")}>
              Ortala
            </button>
            <button class="btn small" onClick={() => cmd("config")}>
              {st()?.config ? "Yapılandırmayı kapat" : "Yapılandırmayı aç"}
            </button>
          </div>
        </Row>
      </Show>

      <details open={running()}>
        <summary>
          <b>Overlay yerleşimi</b>
        </summary>
        <p class="muted small">
          Değerler metre ve derece cinsindendir; yerel VR çalışırken değişiklikler gözlükte anında görünür. Yeni bir overlay'in
          varsayılan yeri (yaklaşık 1,2 m önde, yay şeklinde) yerel VR ilk başlatıldığında oluşur.
        </p>
        <Show when={keys().length > 0} fallback={<p class="muted small">Etkin düzende açık overlay yok.</p>}>
          <For each={keys()}>
            {(k) => {
              const it = item(k);
              return (
              <details open={st()?.selected === it.key && !!st()?.config}>
                <summary>
                  <b data-no-i18n>{it.name}</b>
                  <Show when={running() && st()?.selected === it.key}>
                    <span class="muted small"> · seçili</span>
                  </Show>
                </summary>
                <Show when={it.place} fallback={<p class="muted small">Henüz yerleşim yok: yerel VR'ı bir kez başlat.</p>}>
                  {(p) => (
                    <>
                      <Row title="Sağ / sol (x)">
                        <Slider value={num(p().x, 0)} min={-3} max={3} step={0.01} unit="m" onInput={(v) => setPlace(it.key, (q) => (q.x = v))} />
                      </Row>
                      <Row title="Yukarı / aşağı (y)">
                        <Slider value={num(p().y, 0)} min={-2} max={2} step={0.01} unit="m" onInput={(v) => setPlace(it.key, (q) => (q.y = v))} />
                      </Row>
                      <Row title="Uzaklık (z)">
                        <Slider value={num(p().z, 1.2)} min={0.2} max={5} step={0.01} unit="m" onInput={(v) => setPlace(it.key, (q) => (q.z = v))} />
                      </Row>
                      <Row title="Yatay dönüş (yaw)">
                        <Slider value={num(p().yaw, 0)} min={-180} max={180} step={1} unit="°" onInput={(v) => setPlace(it.key, (q) => (q.yaw = v))} />
                      </Row>
                      <Row title="Dikey eğim (pitch)">
                        <Slider value={num(p().pitch, 0)} min={-90} max={90} step={1} unit="°" onInput={(v) => setPlace(it.key, (q) => (q.pitch = v))} />
                      </Row>
                      <Row title="Genişlik">
                        <Slider value={num(p().widthM, 0.4)} min={0.05} max={3} step={0.01} unit="m" onInput={(v) => setPlace(it.key, (q) => (q.widthM = v))} />
                      </Row>
                      <Row title="Eğrilik">
                        <Slider value={num(p().curve, 0)} min={0} max={1} step={0.01} onInput={(v) => setPlace(it.key, (q) => (q.curve = v))} />
                      </Row>
                      <Row title="Opaklık">
                        <Slider value={Math.round(num(p().alpha, 1) * 100)} min={10} max={100} step={1} unit="%" onInput={(v) => setPlace(it.key, (q) => (q.alpha = v / 100))} />
                      </Row>
                      <Row title="Bana dön" sub="Overlay sabit uzaklıkta kalır ve hep sana doğru döner (yaw ve pitch yok sayılır).">
                        <Switch checked={!!p().faceMe} onChange={(v) => setPlace(it.key, (q) => (q.faceMe = v))} />
                      </Row>
                      <Row title="Bakış modu" sub="Overlay sadece ona doğru bakınca belirir.">
                        <Switch checked={!!p().gaze} onChange={(v) => setPlace(it.key, (q) => (q.gaze = v))} />
                      </Row>
                      <Row title="Varsayılan yerleşim">
                        <div style={{ display: "flex", gap: "8px" }}>
                          <Show when={running()}>
                            <button class="btn ghost small" onClick={() => cmd("select", it.key)}>
                              Seç
                            </button>
                          </Show>
                          <button class="btn ghost small" onClick={() => resetPlace(it.key)}>
                            Sıfırla
                          </button>
                        </div>
                      </Row>
                    </>
                  )}
                </Show>
              </details>
              );
            }}
          </For>
        </Show>
      </details>

      <details>
        <summary>
          <b>Kısayollar ve fare (yapılandırma modu)</b>
        </summary>
        <ul class="muted">
          <li>
            <kbd data-no-i18n>{key("vrConfig")}</kbd> yapılandırma modunu aç / kapat · <kbd data-no-i18n>{key("vrRecenter")}</kbd> ortala
            (overlay'leri baktığın yöne al). Bu ikisi yerel VR çalıştığı sürece etkindir.
          </li>
          <li>
            Sadece yapılandırma modunda: <kbd data-no-i18n>{key("vrNext")}</kbd> sonraki overlay · <kbd data-no-i18n>{key("vrMode")}</kbd> konum /
            ayar modu · <kbd data-no-i18n>{key("vrSave")}</kbd> kaydet · <kbd data-no-i18n>{key("vrReset")}</kbd> seçiliyi sıfırla ·{" "}
            <kbd data-no-i18n>{key("vrFace")}</kbd> bana dön · <kbd data-no-i18n>{key("vrGaze")}</kbd> bakış modu.
          </li>
          <li>Konum modu (seçili overlay yeşil): sol tuşla sürükle = sağ/sol ve yukarı/aşağı, sağ tuşla sürükle = uzaklık.</li>
          <li>
            Ayar modu (seçili overlay turuncu): sol tuşla sürükle = boyut, sağ tuşla sürükle = döndür (ilk hareket edilen eksene
            kilitlenir; Shift = yatay, Ctrl = dikey), orta tuşla sürükle = eğrilik, tekerlek = opaklık.
          </li>
          <li>Değişiklikler son hareketten yarım saniye sonra kendiliğinden kaydedilir. Tuşları Ayarlar → Kısayollar'dan değiştirebilirsin.</li>
        </ul>
      </details>

      <details>
        <summary>
          <b>VR günlüğü</b>
        </summary>
        <Row title="Günlüğü dosyaya da yaz" sub={st()?.logFile || undefined}>
          <Switch checked={nv().debug} onChange={(v) => set((x) => (x.debug = v))} />
        </Row>
        <pre class="muted small" style={{ "max-height": "220px", overflow: "auto", "white-space": "pre-wrap", "user-select": "text" }} data-no-i18n>
          {(st()?.log ?? []).join("\n") || "—"}
        </pre>
      </details>
      <p class="muted small">
        İlk kez başlattıktan (ya da otomatik başlatmayı açtıktan) sonra uygulamayı bir kez yeniden başlat: pencerelerin oyunun
        arkasında kalınca da çizmeye devam etmesini sağlayan ayar açılışta uygulanır; yoksa gözlükteki görüntü donabilir.
      </p>
    </section>
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

      <NativeVr />

      <section class="panel">
        <h3>VR kurulumu (pencere yakalama)</h3>
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
            <li>Listeden "SRTR Pitwall - VR Panosu" ya da tek bir overlay penceresini (ör. "SRTR Pitwall - Yakındakiler") seç.</li>
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
            <li>Yakındakiler ve Sıralama: gözlükte yaklaşık 35–45 cm genişlik, direksiyonun sol ya da sağ üstü. Yakıt, delta ve girdiler: 20–30 cm, gösterge panelinin üstü.</li>
            <li>Yazılar küçük kalıyorsa pencereyi büyütmek yerine Görünüm sayfasından yazı boyutunu artır: yakalanan görüntü daha net olur.</li>
            <li>Tek tek pencereler yerine VR panosu daha az kaynak kullanır (tek yakalama); ama gözlükte tek parça olarak yerleşir.</li>
            <li>Ayarlar → Performans'tan telemetri hızını 30 Hz yap ve "Görsel efektleri azalt"ı aç.</li>
            <li>Yakalama aracında kare hızını 30 FPS ile sınırla; overlay'i gözlüğün tam ortasına değil, bakış alanının kenarına koy.</li>
            <li>Kullanmadığın overlay'leri kapat: her açık overlay ayrı bir pencere ve ayrı bir yakalama demektir.</li>
            <li>Pencereler donuyorsa (oyun tam ekrandayken güncellenmiyorsa) uygulamayı VR modu açıkken yeniden başlattığından emin ol ve pencere yerini Monitörde yap.</li>
          </ul>
        </details>
        <p class="muted small">
          SteamVR kullanıyorsan yukarıdaki deneysel "Yerel VR" bölümüyle bu araçlara gerek kalmaz. iRacing'i VR'da kullanırken
          sesli mühendis ve spotter herhangi bir ek ayar olmadan çalışır.
        </p>
      </section>
    </div>
  );
}
