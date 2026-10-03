// Kısayol bildirimi (OSD): ekranın üst ortasında, basılan kısayolun yaptığı işlemi ve yeni durumu
// gösteren küçük hap. Pencereyi Rust yönetir (src-tauri/src/osd.rs): bildirim gelince "osd-new" olayı
// yollanır, burada metin arayüz dilinde çizilir ve pencere gösterilir; süre dolunca gizlenir.
// Yeni bildirim öncekinin yerini alır (süre baştan başlar).
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "@/sdk/platform";
import { t, translateText } from "@/sdk/i18n";
import "./osd.css";

/** Ekranda kalma süresi (ms) ve kaybolma animasyonu (osd.css ile aynı) */
const LIFE = 1800;
const FADE = 180;

interface OsdPayload {
  seq?: number;
  /** Eylem anahtarı (Rust: lib.rs kısayol işleyicisi) */
  key?: string;
  /** İşlemden sonraki durum (aç / kapat türü kısayollarda) */
  on?: boolean | null;
  /** Hazır metin (Türkçe kaynak; ör. Canlı Sohbet bildirimi) */
  text?: string;
}

type Tone = "on" | "off" | "info" | "warn";
interface View {
  id: number;
  label: string;
  state?: string;
  tone: Tone;
}

const onOff = (label: string, on: boolean | null | undefined, yes = t("Açık"), no = t("Kapalı")): Omit<View, "id"> =>
  on == null ? { label, tone: "info" } : { label, state: on ? yes : no, tone: on ? "on" : "off" };

function describe(p: OsdPayload): Omit<View, "id"> | null {
  if (p.text) {
    const s = translateText(t(p.text));
    // Canlı Sohbet bildirimleri tek cümledir; açma / kapama türündekiler renklendirilir
    const off = /(kapatıldı|durduruldu|bitirildi|susturuldu)$/.test(p.text);
    const on = /(açıldı|başlatıldı|başladı)$/.test(p.text);
    return { label: s, tone: on ? "on" : off ? "off" : /…/.test(p.text) ? "info" : "warn" };
  }
  switch (p.key) {
    case "edit":
      return onOff(t("Düzenleme modu"), p.on);
    case "hide":
      return onOff(t("Overlay'ler"), p.on, t("Görünür"), t("Gizli"));
    case "panel":
      return { label: t("Kontrol paneli açıldı"), tone: "info" };
    case "shot":
      return { label: t("Ekran görüntüsü alındı"), tone: "info" };
    case "shotError":
      return { label: t("Ekran görüntüsü alınamadı"), tone: "warn" };
    case "voice":
      return onOff(t("Sesli mühendis"), p.on);
    case "voiceLocked":
      return { label: t("Sesli mühendis PRO üyelik gerektirir"), tone: "warn" };
    case "crewStop":
      return p.on ? { label: t("Ekip kontrolü durduruldu"), tone: "off" } : { label: t("Ekip kontrolü zaten kapalı"), tone: "info" };
    case "dashPage":
      return { label: t("Direksiyon Ekranı"), state: t("Sonraki sayfa"), tone: "info" };
    case "vrConfig":
      return onOff(t("Yerel VR yapılandırma modu"), p.on);
    case "vrRecenter":
      return { label: t("Yerel VR"), state: t("Ortalandı"), tone: "info" };
    case "vrNext":
      return { label: t("Yerel VR"), state: t("Sonraki overlay seçildi"), tone: "info" };
    case "vrMode":
      return { label: t("Yerel VR"), state: t("Konum / ayar modu değişti"), tone: "info" };
    case "vrSave":
      return { label: t("Yerel VR"), state: t("Yerleşim kaydedildi"), tone: "info" };
    case "vrReset":
      return { label: t("Yerel VR"), state: t("Seçili overlay sıfırlandı"), tone: "info" };
    case "vrFace":
      return { label: t("Yerel VR"), state: t("Bana dön değiştirildi"), tone: "info" };
    case "vrGaze":
      return { label: t("Yerel VR"), state: t("Bakış modu değiştirildi"), tone: "info" };
    default:
      return null;
  }
}

export function Osd() {
  const [view, setView] = createSignal<View | null>(null);
  const [out, setOut] = createSignal(false);
  let n = 0;
  let hideT: ReturnType<typeof setTimeout> | undefined;
  let goneT: ReturnType<typeof setTimeout> | undefined;

  const push = (p: OsdPayload | null) => {
    if (!p) return;
    const d = describe(p);
    if (!d) return;
    clearTimeout(hideT);
    clearTimeout(goneT);
    setOut(false);
    setView({ ...d, id: ++n });
    if (inTauri) invoke("osd_visible", { show: true }).catch(() => {});
    hideT = setTimeout(() => {
      setOut(true);
      goneT = setTimeout(() => {
        setView(null);
        if (inTauri) invoke("osd_visible", { show: false }).catch(() => {});
      }, FADE);
    }, LIFE);
  };

  const take = () => {
    if (inTauri) invoke<OsdPayload | null>("osd_take").then(push).catch(() => {});
  };

  onMount(() => {
    take();
    let un: (() => void) | undefined;
    if (inTauri) listen("osd-new", take).then((u) => (un = u));
    // Tarayıcıda deneme için: window.__osd({ key: "voice", on: false })
    (window as unknown as { __osd: (p: OsdPayload) => void }).__osd = push;
    onCleanup(() => {
      clearTimeout(hideT);
      clearTimeout(goneT);
      un?.();
    });
  });

  return (
    <div class="osd">
      <Show when={view()} keyed>
        {(v) => (
          <div class={`osd-pill t-${v.tone}`} classList={{ out: out() }} data-no-i18n>
            <i class="osd-dot" />
            <span class="osd-label">{v.label}</span>
            <Show when={v.state}>
              <b class="osd-state">{v.state}</b>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
