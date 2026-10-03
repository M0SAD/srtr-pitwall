// Sesli komut (bas-konuş, PRO: voice.commands): bir direksiyon düğmesini ya da klavye tuşunu basılı tutup mühendise
// sesle soru sorma ("ne kadar yakıtım var", "kaç olay puanım var"…). Rust: src-tauri/src/voicecmd.rs
// (giriş: ptt_win.rs, tanıma: voicecmd_win.rs, cümleler: voice_commands.json).

import { For, Show, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { settings, updateSettings, type VoiceCommandButton, type VoiceCommandSettings } from "@/sdk/settings";
import { F, proLocked, requiresPro, VOICE_FEATURE } from "@/sdk/proFeatures";
import { SHORTCUT_ACTIONS, SHORTCUT_LABELS, fromEvent, prettyKey, sameKey, shortcut } from "@/sdk/shortcuts";
import { t } from "@/sdk/i18n";
import { Slider, Switch } from "./SettingsForm";
import { go } from "../ui";
import * as I from "../icons";
import "../voice.css";

interface CmdStatus {
  supported: boolean;
  allowed: boolean;
  uiLang: string;
  wantLang: string;
  wantTag: string;
  wantName: string;
  grammarLangs: string[];
  topicLangs: string[];
  recTag: string;
  mode: "list" | "dictation" | "";
  fallback: boolean;
  engine: "auto" | "windows" | "online";
  useEngine: "windows" | "online";
  native: boolean;
  cloudReady: boolean;
  cloudProblem: "" | "cloud_key" | "cloud_url";
  cloudHasKey: boolean;
  cloudHost: string;
  cloudModel: string;
}

interface CmdEvent {
  state: "listening" | "processing" | "heard" | "idle" | "error" | "";
  heard: string;
  intent: string;
  score: number;
  confidence: number;
  ok: boolean;
  error: string;
  recTag: string;
  mode: string;
  fallback: boolean;
}

interface Mic {
  id: string;
  name: string;
  isDefault: boolean;
}

interface Example {
  intent: string;
  phrases: string[];
}

/** Tanıma dilleri (uygulamanın 15 dili; adlar kendi dillerinde) */
const LANGS: { id: string; name: string }[] = [
  { id: "tr", name: "Türkçe" },
  { id: "en", name: "English" },
  { id: "de", name: "Deutsch" },
  { id: "es", name: "Español" },
  { id: "pt-BR", name: "Português (Brasil)" },
  { id: "pt-PT", name: "Português (Portugal)" },
  { id: "fr", name: "Français" },
  { id: "it", name: "Italiano" },
  { id: "nl", name: "Nederlands" },
  { id: "pl", name: "Polski" },
  { id: "sv", name: "Svenska" },
  { id: "fi", name: "Suomi" },
  { id: "ru", name: "Русский" },
  { id: "zh-CN", name: "简体中文" },
  { id: "ja", name: "日本語" },
];

/** Komutların (niyetlerin) görünen adları */
const INTENT_LABELS: Record<string, string> = {
  fuel_level: "Yakıt miktarı",
  fuel_laps: "Yakıt kaç tur yeter",
  fuel_to_end: "Bitişe gereken yakıt",
  fuel_per_lap: "Tur başı tüketim",
  incidents: "Olay puanı (ve sınırı)",
  position: "Sıra (genel ve sınıf)",
  gap_ahead: "Öndekiyle fark",
  gap_behind: "Arkadakiyle fark",
  last_lap: "Son tur zamanı",
  best_lap: "En iyi tur zamanı",
  remaining: "Kalan tur / süre",
  tyre_temps: "Lastik sıcaklıkları",
  tyre_wear: "Lastik aşınması",
  track_temp: "Pist sıcaklığı",
  air_temp: "Hava sıcaklığı",
  weather: "Hava durumu",
  clock: "Saat",
  driver_ahead: "Öndeki sürücü",
  driver_behind: "Arkadaki sürücü",
  damage: "Hasar ve hızlı tamir",
  repeat: "Son mesajı tekrarla",
  quiet: "Sus (mühendis ve spotter kapanır)",
  talk: "Konuş (mühendis ve spotter açılır)",
  radio_check: "Telsiz kontrolü",
};

/** Rust'tan gelen hata kodlarının açıklaması */
const ERRORS: Record<string, string> = {
  privacy: "Windows'ta çevrimiçi konuşma tanıma kapalı: Windows Ayarları › Gizlilik ve güvenlik › Konuşma › “Çevrimiçi konuşma tanıma”yı aç.",
  mic_access: "Mikrofon izni yok: Windows Ayarları › Gizlilik ve güvenlik › Mikrofon › “Masaüstü uygulamalarının mikrofona erişmesine izin ver”i aç.",
  no_mic: "Mikrofon bulunamadı: yukarıdan bir mikrofon seç ya da Windows ses ayarlarında bir kayıt cihazını varsayılan yap.",
  network: "Ağ hatası: Windows konuşma tanıma hizmetine ulaşılamadı.",
  no_recognizer: "Windows'ta kurulu bir konuşma tanıma dili bulunamadı.",
  pro: "Sesli komut PRO üyelere özel.",
  cloud_key: "Çevrimiçi tanıma için API anahtarı girilmedi: aşağıdaki “Çevrimiçi tanıma anahtarı” alanına anahtarını yapıştır.",
  cloud_url: "Çevrimiçi tanıma sunucusunun adresi ya da modeli geçersiz: Canlı Sohbet › Konuşma → yazı sayfasından sağlayıcıyı seç.",
};

/** Sesli komut kilitli mi (PRO değil): ayarlar görünür ama değiştirilemez */
export const voiceCmdLocked = () => proLocked(F.voiceCommands) || proLocked(VOICE_FEATURE);

const cmd = () => settings().general.voice.commands;
const setCmd = (fn: (x: VoiceCommandSettings) => void) => updateSettings((d) => fn(d.general.voice.commands));

/** Bas-konuş klavye tuşu satırı (Sesli Mühendis ve Kısayollar sayfalarında ortak) */
export function PttKeyRow(props: { label?: string; disabled?: boolean }) {
  const [rec, setRec] = createSignal(false);
  // Kaydederken PrintScreen kancası duraklar (bkz. ShortcutsPanel)
  const setRecording = (on: boolean) => {
    setRec(on);
    invoke("shortcuts_pause", { paused: on }).catch(() => {});
  };
  const onKey = (e: KeyboardEvent) => {
    if (!rec()) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") {
      setRecording(false);
      return;
    }
    // Bas-konuşta tek tuş da olabilir (basılı tutulur)
    const k = fromEvent(e, true);
    if (!k) return;
    setRecording(false);
    setCmd((x) => (x.key = k));
  };
  onMount(() => {
    window.addEventListener("keydown", onKey, true);
    onCleanup(() => {
      if (rec()) invoke("shortcuts_pause", { paused: false }).catch(() => {});
      window.removeEventListener("keydown", onKey, true);
    });
  });
  const clash = () => SHORTCUT_ACTIONS.find((a) => cmd().key && sameKey(shortcut(a), cmd().key));
  return (
    <div class="row">
      <div>
        <span>{props.label ?? "Klavye tuşu"}</span>
        <small>
          Basılı tutarken dinler, bırakınca cevaplar. Tek tuş da olabilir (ör. F13 ya da klavyeye atanmış bir direksiyon düğmesi). Tuş
          yutulmaz: oyun ve diğer uygulamalar da görür.
        </small>
        <Show when={clash()}>{(a) => <small class="sc-err">{t("Çakışma: “{0}” ile aynı tuş", t(SHORTCUT_LABELS[a()]))}</small>}</Show>
      </div>
      <div class="sc-keys">
        <button class="sc-key" classList={{ rec: rec() }} disabled={props.disabled} onClick={() => setRecording(!rec())}>
          {rec() ? "Tuşlara bas…" : cmd().key ? prettyKey(cmd().key) : "Tuş ata"}
        </button>
        <button class="btn ghost small" title="Tuşu kaldır" disabled={props.disabled || !cmd().key} onClick={() => setCmd((x) => (x.key = ""))}>
          Kaldır
        </button>
      </div>
    </div>
  );
}

/** Bas-konuş dinleme kipi satırı (Sesli Mühendis ve Kısayollar sayfalarında ortak) */
export function PttModeRow(props: { disabled?: boolean }) {
  return (
    <div class="row">
      <div>
        <b>Nasıl dinlesin</b>
        <small>
          {cmd().mode === "toggle"
            ? "Dokun-başlat: düğmeye bir kez bas, sor; sustuğunda kendiliğinden biter (tekrar basarsan hemen biter)."
            : "Basılı tut: düğme basılıyken dinler, bırakınca cevaplar."}
        </small>
      </div>
      <div class="seg small">
        <button classList={{ on: cmd().mode !== "toggle" }} disabled={props.disabled} onClick={() => setCmd((x) => (x.mode = "hold"))}>
          Basılı tut
        </button>
        <button classList={{ on: cmd().mode === "toggle" }} disabled={props.disabled} onClick={() => setCmd((x) => (x.mode = "toggle"))}>
          Dokun-başlat
        </button>
      </div>
    </div>
  );
}

/** Bas-konuş direksiyon / kumanda düğmesi satırı (Sesli Mühendis ve Kısayollar sayfalarında ortak; aynı ayar) */
export function PttButtonRow(props: { disabled?: boolean }) {
  const [capturing, setCapturing] = createSignal(false);
  const [captureMsg, setCaptureMsg] = createSignal("");
  const bound = () => cmd().button;
  // Atanan düğme / tuş şu an basılı mı (Rust: "voicecmd-ptt"): atamanın gerçekten görüldüğünü doğrulamak için
  const [held, setHeld] = createSignal(false);
  onMount(() => {
    const un = listen<boolean>("voicecmd-ptt", (e) => setHeld(!!e.payload)).catch(() => null);
    onCleanup(() => {
      void un.then((f) => f?.());
    });
  });
  onCleanup(() => {
    if (capturing()) invoke("voicecmd_capture_cancel").catch(() => {});
  });
  const captureButton = async () => {
    if (capturing()) {
      invoke("voicecmd_capture_cancel").catch(() => {});
      return;
    }
    setCapturing(true);
    setCaptureMsg("");
    try {
      const b = await invoke<VoiceCommandButton | null>("voicecmd_capture_button", { seconds: 10 });
      if (b) setCmd((x) => (x.button = b));
      else setCaptureMsg("Düğme algılanmadı. Direksiyon bağlı mı? Tekrar deneyip düğmeye bas.");
    } catch (e) {
      setCaptureMsg(String(e));
    }
    setCapturing(false);
  };
  return (
    <div class="row">
      <div>
        <span>Direksiyon / kumanda düğmesi</span>
        <small>
          “Direksiyon tuşu ata”ya tıkla, sonra direksiyondaki (ya da düğme kutusundaki) düğmeye bas. Oyun öndeyken de çalışır.
        </small>
        <Show when={bound()}>
          {(b) => (
            <small class="voice-cmd-bound" data-no-i18n>
              {b().name} · {t("Düğme {0}", b().button + 1)}
            </small>
          )}
        </Show>
        <Show when={held()}>
          <small class="voice-cmd-held">Basılı: dinliyor</small>
        </Show>
        <Show when={captureMsg()}>
          <small class="sc-err">{captureMsg()}</small>
        </Show>
      </div>
      <div class="sc-keys">
        <button class="sc-key" classList={{ rec: capturing() }} disabled={props.disabled} onClick={captureButton}>
          {capturing() ? "Düğmeye bas…" : "Direksiyon tuşu ata"}
        </button>
        <button class="btn ghost small" title="Düğmeyi kaldır" disabled={props.disabled || !bound()} onClick={() => setCmd((x) => (x.button = null))}>
          Kaldır
        </button>
      </div>
    </div>
  );
}

export function VoiceCommandsSection() {
  const locked = voiceCmdLocked;
  const proOnly = () => requiresPro(F.voiceCommands) || requiresPro(VOICE_FEATURE);
  const [status, { refetch }] = createResource(
    () => [cmd().language, cmd().engine, settings().general.language, settings().general.livechat.stt.cloud.url, settings().general.livechat.stt.cloud.model, locked()] as const,
    // Ayar Rust'a ulaşsın diye kısa bir bekleme
    () => new Promise<CmdStatus | null>((res) => setTimeout(() => invoke<CmdStatus>("voicecmd_status").then(res, () => res(null)), 350)),
  );
  // Çevrimiçi tanıma anahtarı (Canlı Sohbet › Konuşma → yazı ile ortak; şifreli saklanır, geri okunamaz)
  const [apiKey, setApiKey] = createSignal("");
  const [keyMsg, setKeyMsg] = createSignal("");
  const saveKey = async () => {
    const k = apiKey().trim();
    if (!k) return;
    setKeyMsg("");
    try {
      await invoke("livechat_stt_key_set", { key: k });
      setApiKey("");
      setKeyMsg(t("Anahtar kaydedildi."));
      refetch();
    } catch (e) {
      setKeyMsg(String(e));
    }
  };
  const openUrl = (url: string) => invoke("open_url", { url }).catch(() => {});
  const online = () => status()?.useEngine === "online";
  // Çevrimiçi motor gerekiyor ama hazır değil (anahtar yok): ne yapılacağı gösterilir
  const needsCloud = () => {
    const s = status();
    return !!s && !s.cloudReady && (s.engine === "online" || (s.engine === "auto" && !s.native));
  };
  const [showExamples, setShowExamples] = createSignal(false);
  const [examples] = createResource(
    () => (showExamples() ? ([cmd().language, settings().general.language] as const) : null),
    () => invoke<Example[]>("voicecmd_examples", { language: null }).catch(() => [] as Example[]),
  );
  // Kayıt cihazları (Rust: voicecmd_microphones). ★ = Windows'un varsayılan kayıt cihazı
  const [mics, { refetch: refetchMics }] = createResource(() => invoke<Mic[]>("voicecmd_microphones").catch(() => [] as Mic[]));
  const micList = () => (mics.error ? [] : (mics() ?? []));
  const defaultMic = () => micList().find((m) => m.isDefault);
  const micMissing = () => !!cmd().mic && !mics.loading && micList().length > 0 && !micList().some((m) => m.id === cmd().mic);
  const [last, setLast] = createSignal<CmdEvent | null>(null);
  const [text, setText] = createSignal("");
  const [msg, setMsg] = createSignal("");

  onMount(() => {
    const un = listen<CmdEvent>("voicecmd", (e) => setLast(e.payload)).catch(() => null);
    onCleanup(() => {
      void un.then((f) => f?.());
    });
  });

  const listenNow = async () => {
    setMsg("");
    try {
      await invoke("voicecmd_listen");
    } catch (e) {
      setMsg(ERRORS[String(e)] ? t(ERRORS[String(e)]) : String(e));
    }
  };

  const sendText = async () => {
    const v = text().trim();
    if (!v) return;
    setMsg("");
    try {
      setLast(await invoke<CmdEvent>("voicecmd_test_text", { text: v, speak: true }));
    } catch (e) {
      setMsg(String(e));
    }
  };

  const errorText = (code: string) => (ERRORS[code] ? t(ERRORS[code]) : code.startsWith("compile:") || code.startsWith("status:") ? t("Windows konuşma tanıma başlatılamadı ({0}).", code) : code);
  const wantName = () => status()?.wantName || LANGS.find((l) => l.id === (cmd().language || settings().general.language))?.name || "";
  const ready = createMemo(() => cmd().enabled && !locked() && (!!cmd().key || !!cmd().button));

  return (
    <section class="panel voice-cmd">
      <div class="voice-panel-head">
        <h3>
          Sesli komut (bas-konuş)
          <Show when={proOnly()}>
            {" "}
            <span class="pro-badge">PRO</span>
          </Show>
        </h3>
        <div class={`voice-status ${ready() ? "on" : "off"}`}>
          <span class="dot" />
          {locked() ? "PRO gerekli" : !cmd().enabled ? "Kapalı" : ready() ? "Hazır" : "Tuş atanmadı"}
        </div>
      </div>
      <p class="muted small">
        Direksiyondaki bir düğmeyi ya da bir klavye tuşunu basılı tut ve sor: “ne kadar yakıtım var”, “kaç olay puanım var”,
        “öndekiyle fark ne kadar”. Mühendis sesli cevap verir; soru ve cevap Sesli Mühendis altyazısında da görünür. Komutlar
        arayüz dilinde anlaşılır.
      </p>
      <Show when={locked()}>
        <p class="pro-locked-note">
          <span class="pro-badge">PRO</span> Sesli komut PRO üyelere özel: ayarlar açık görünür ama PRO olmadan çalışmaz ve
          değiştirilemez.{" "}
          <button class="link" onClick={() => go("pro")}>
            PRO'ya bak
          </button>
        </p>
      </Show>
      <Show when={status() && !status()!.supported}>
        <p class="error">Sesli komut yalnızca Windows'ta çalışır (Windows konuşma tanıma kullanılır).</p>
      </Show>

      <div classList={{ "pro-locked-body": locked() }} inert={locked()}>

      <div class="row">
        <div>
          <b>Sesli komut açık</b>
          <small>Sesli mühendis kapalıyken de çalışır: “konuşabilirsin” diyerek mühendisi yeniden açabilirsin.</small>
        </div>
        <Switch checked={cmd().enabled} disabled={locked()} onChange={(on) => setCmd((x) => (x.enabled = on))} />
      </div>

      <PttModeRow disabled={locked()} />
      <PttButtonRow disabled={locked()} />

      <PttKeyRow disabled={locked()} />

      <div class="row">
        <div>
          <b>Tanıma dili</b>
          <small>Otomatik: komutlar arayüz dilinde dinlenir. Cevaplar her zaman arayüz dilinde (ya da ses paketinin dilinde) verilir.</small>
        </div>
        <select
          class="f2-select"
          value={cmd().language}
          onChange={(e) => {
            setCmd((x) => (x.language = e.currentTarget.value));
            setTimeout(refetch, 400);
          }}
        >
          <option value="">Otomatik (arayüz dili)</option>
          <For each={LANGS}>
            {(l) => (
              <option value={l.id} data-no-i18n>
                {l.name}
              </option>
            )}
          </For>
        </select>
      </div>
      <div class="row">
        <div>
          <b>Tanıma motoru</b>
          <small>
            Otomatik: seçili dilin Windows konuşma tanıyıcısı kuruluysa o kullanılır (çevrimdışı), kurulu değilse çevrimiçi motora
            geçilir. Windows'ta Türkçe konuşma tanıyıcısı yoktur: Türkçe komutlar çevrimiçi motorla tanınır.
          </small>
        </div>
        <select class="f2-select" value={cmd().engine} onChange={(e) => setCmd((x) => (x.engine = e.currentTarget.value as VoiceCommandSettings["engine"]))}>
          <option value="auto">Otomatik</option>
          <option value="windows">Windows konuşma tanıma</option>
          <option value="online">Çevrimiçi (Whisper)</option>
        </select>
      </div>
      <Show when={status()?.supported}>
        <div class="voice-cmd-rec" classList={{ warn: needsCloud() || (!online() && (!!status()!.fallback || !status()!.recTag)) }}>
          <Show when={online() && status()!.cloudReady}>
            <span>
              {t(
                "Etkin motor: çevrimiçi (Whisper) · {0} · {1}. Tuşu basılı tutarken kaydeder, bırakınca sesi sunucuya gönderir ve komutu eşleştirir; internet gerekir.",
                status()!.cloudHost,
                wantName(),
              )}
            </span>
          </Show>
          <Show when={needsCloud()}>
            <span>
              {status()!.cloudProblem === "cloud_url"
                ? t(ERRORS.cloud_url)
                : status()!.engine === "online"
                  ? t("Çevrimiçi motor seçili ama API anahtarı girilmedi: aşağıya anahtarını yapıştır. Anahtar olmadan komutlar dinlenmez.")
                  : t(
                      "Windows'ta {0} konuşma tanıyıcısı kurulu değil; {0} komutların tanınması için çevrimiçi motor gerekir ama API anahtarı girilmedi. Aşağıya anahtarını yapıştır (Groq anahtarı ücretsiz alınır).",
                      wantName(),
                    )}{" "}
            </span>
          </Show>
          <Show when={!online()}>
            <Show
              when={status()!.recTag}
              fallback={
                <span>
                  {t(
                    "Windows'ta kurulu bir konuşma tanıma dili bulunamadı. Windows Ayarları › Saat ve dil › Dil ve bölge › {0} › Dil seçenekleri › Konuşma tanıma › İndir yolundan dil paketini kur, sonra SRTR Pitwall'u yeniden başlat.",
                    wantName(),
                  )}
                </span>
              }
            >
              <Show
                when={!status()!.fallback}
                fallback={
                  <span>
                    {t(
                      "Windows'ta {0} konuşma tanıma paketi kurulu değil: şimdilik İngilizce komutlar dinleniyor ({1}). Kurmak için Windows Ayarları › Saat ve dil › Dil ve bölge › {0} › Dil seçenekleri › Konuşma tanıma › İndir; sonra SRTR Pitwall'u yeniden başlat.",
                      wantName(),
                      status()!.recTag,
                    )}
                  </span>
                }
              >
                <span>
                  {status()!.mode === "list"
                    ? t("Tanıyıcı: {0} · komut listesi (çevrimdışı çalışır, en isabetlisi)", status()!.recTag)
                    : t("Tanıyıcı: {0} · dikte (Windows'ta “Çevrimiçi konuşma tanıma” açık olmalı; komut listesi bu dilde yok)", status()!.recTag)}
                </span>
              </Show>
            </Show>
          </Show>
        </div>
      </Show>
      <Show when={status()?.supported && (cmd().engine !== "windows" || !status()!.native)}>
        <div class="row">
          <div>
            <b>Çevrimiçi tanıma anahtarı</b>
            <small>
              {t(
                "Çevrimiçi motorun API anahtarı (sunucu: {0}, model: {1}). Canlı Sohbet › Konuşma → yazı ile ortaktır; sağlayıcı ve model oradan değiştirilir. Anahtar bu bilgisayarda şifreli saklanır.",
                status()!.cloudHost,
                status()!.cloudModel,
              )}{" "}
              <button class="link" data-no-i18n onClick={() => openUrl("https://console.groq.com/keys")}>
                console.groq.com/keys
              </button>
            </small>
            <Show when={keyMsg()}>
              <small class="muted">{keyMsg()}</small>
            </Show>
          </div>
          <div class="sc-keys">
            <input
              class="input voice-cmd-key"
              type="password"
              autocomplete="off"
              placeholder={status()!.cloudHasKey ? t("Kayıtlı (değiştirmek için yenisini yapıştır)") : t("API anahtarını yapıştır")}
              value={apiKey()}
              onInput={(e) => setApiKey(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
            />
            <button class="btn ghost small" disabled={!apiKey().trim()} onClick={saveKey}>
              Kaydet
            </button>
          </div>
        </div>
      </Show>

      <div class="row">
        <div>
          <b>Mikrofon</b>
          <small>
            Sesli komutların dinleneceği mikrofon. Mikrofon paylaşımlı açılır: Discord ya da başka bir uygulama aynı mikrofonu
            kullanırken de çalışır. Seçilen cihaz çıkarılırsa Windows'un varsayılan mikrofonuna dönülür.
          </small>
          <Show when={micMissing()}>
            <small class="sc-err">{t("Seçili mikrofon bulunamadı ({0}): Windows varsayılanı kullanılıyor.", cmd().micName || "?")}</small>
          </Show>
          <Show when={mics.error}>
            <small class="sc-err">Mikrofon listesi alınamadı.</small>
          </Show>
        </div>
        <div class="sc-keys">
          <select
            class="f2-select voice-cmd-mic"
            value={micMissing() ? "" : cmd().mic}
            disabled={!status()?.supported}
            onChange={(e) => {
              const id = e.currentTarget.value;
              const m = micList().find((x) => x.id === id);
              setCmd((x) => {
                x.mic = id;
                x.micName = m?.name ?? "";
              });
              setTimeout(refetchMics, 600);
            }}
          >
            <option value="">{defaultMic() ? t("Windows varsayılanı ({0})", defaultMic()!.name) : "Windows varsayılanı"}</option>
            <For each={micList()}>
              {(m) => (
                <option value={m.id} data-no-i18n>
                  {m.name + (m.isDefault ? " ★" : "")}
                </option>
              )}
            </For>
          </select>
          <button class="btn ghost small" title="Mikrofon listesini yenile" disabled={!status()?.supported} onClick={() => refetchMics()}>
            Yenile
          </button>
        </div>
      </div>

      <div class="voice-sliders">
        <div class="f2">
          <div class="f2-cap">Güven eşiği</div>
          <Slider value={cmd().confidence} min={10} max={90} step={5} unit="%" onInput={(n) => setCmd((x) => (x.confidence = n))} />
          <small class="muted">Düşük: daha kolay anlar ama yanlış komut çalışabilir. Yüksek: emin olmadıkça “anlayamadım” der.</small>
        </div>
        <div class="f2 voice-cmd-beeps">
          <div>
            <div class="f2-cap">Bipler</div>
            <small class="muted">Dinlemeye başlarken kısa bip, anlaşılınca çift bip, anlaşılmayınca pes bip.</small>
          </div>
          <Switch checked={cmd().beeps} onChange={(on) => setCmd((x) => (x.beeps = on))} />
        </div>
      </div>

      <div class="voice-cmd-test">
        <div class="voice-panel-head">
          <b>Dene</b>
          <button class="btn ghost small" disabled={locked() || !status()?.supported} onClick={listenNow}>
            <I.Mic /> {last()?.state === "listening" ? "Dinliyor… (bitirmek için tıkla)" : "Mikrofonu dinle"}
          </button>
        </div>
        <div class="voice-dir">
          <input
            class="input"
            placeholder="Ya da komutu yaz: ne kadar yakıtım var"
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && sendText()}
          />
          <button class="btn ghost small" disabled={locked() || !text().trim()} onClick={sendText}>
            <I.Send /> Sor
          </button>
        </div>
        <Show when={msg()}>
          <p class="error">{msg()}</p>
        </Show>
        <Show when={last()}>
          {(ev) => (
            <div class="voice-cmd-result" classList={{ ok: ev().ok, bad: ev().state === "heard" && !ev().ok }}>
              <Show when={ev().state === "listening"}>
                <span>Dinliyor… şimdi konuş.</span>
              </Show>
              <Show when={ev().state === "processing"}>
                <span>Ses gönderildi, çözümleniyor…</span>
              </Show>
              <Show when={ev().state === "idle"}>
                <span>Bir şey duyulmadı.</span>
              </Show>
              <Show when={ev().state === "error"}>
                <span class="sc-err">{errorText(ev().error)}</span>
              </Show>
              <Show when={ev().state === "heard"}>
                <span>
                  Duyulan: <b data-no-i18n>“{ev().heard}”</b>
                </span>
                <span>
                  {ev().intent
                    ? t("Eşleşen komut: {0} (benzerlik %{1})", t(INTENT_LABELS[ev().intent] ?? ev().intent), Math.round(ev().score * 100))
                    : "Eşleşen komut yok"}
                </span>
                <span>{t("Tanıyıcı güveni: %{0}", Math.round(ev().confidence * 100))}</span>
                <Show when={ev().intent && !ev().ok}>
                  <span class="sc-err">Güven eşiğin altında kaldı: komut çalıştırılmadı.</span>
                </Show>
              </Show>
            </div>
          )}
        </Show>
      </div>

      </div>

      <div class="voice-panel-head voice-cmd-ex-head">
        <b>Örnek komutlar</b>
        <button class="btn ghost small" onClick={() => setShowExamples(!showExamples())}>
          {showExamples() ? "Gizle" : "Göster"}
        </button>
      </div>
      <Show when={showExamples()}>
        <p class="muted small">
          {t("Seçili tanıma dilindeki ({0}) cümleler. Aynı komutun birkaç söylenişi var; birebir söylemen gerekmez.", wantName())}
        </p>
        <div class="voice-cmd-examples">
          <For each={examples() ?? []}>
            {(ex) => (
              <div class="voice-cmd-ex">
                <b>{INTENT_LABELS[ex.intent] ?? ex.intent}</b>
                <span data-no-i18n>{ex.phrases.map((p) => `“${p}”`).join(" · ")}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
