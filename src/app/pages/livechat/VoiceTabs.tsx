// Canlı Sohbet › Sesli okuma (TTS, Windows sesleri) ve Konuşma → yazı (STT, Windows konuşma tanıma → altyazı)

import { For, Show, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { lang, t } from "@/sdk/i18n";
import * as LC from "@/sdk/livechat";
import { settings, updateSettings, type LiveChatStt, type LiveChatTts } from "@/sdk/settings";
import { F, proLocked } from "@/sdk/proFeatures";
import { prettyKey, shortcut, type ShortcutAction } from "@/sdk/shortcuts";
import { ProLockBox } from "../../components/ProLock";
import { Slider, Switch } from "../../components/SettingsForm";
import { go } from "../../ui";
import * as I from "../../icons";
import { StatusPill, errText, lc, setLc, toast } from "./common";

const setTts = (fn: (x: LiveChatTts) => void) => setLc((x) => fn(x.tts));
const setStt = (fn: (x: LiveChatStt) => void) => setLc((x) => fn(x.stt));

function KeyRow(p: { action: ShortcutAction; title: string; sub?: string }) {
  return (
    <div class="row">
      <div>
        <b>{p.title}</b>
        <Show when={p.sub}>
          <small>{p.sub}</small>
        </Show>
      </div>
      <div class="lcp-inline">
        <span class="lcp-kbd">{prettyKey(shortcut(p.action))}</span>
        <button class="btn ghost small" onClick={() => go("settings", "keybinds")}>
          Değiştir
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sesli okuma
// ---------------------------------------------------------------------------

export function TtsTab() {
  const v = () => lc().tts;
  const [st, setSt] = createSignal<LC.TtsStatus | null>(null);
  const [voices, { refetch: refetchVoices }] = createResource(() => LC.listVoices(true));
  // Ses süzgeci: varsayılan olarak arayüz diline uygun sesler; cinsiyet seçilebilir (yalnızca bu sayfada, kaydedilmez)
  const [langOnly, setLangOnly] = createSignal(true);
  const [gender, setGender] = createSignal<"any" | "female" | "male">("any");
  const [outputs] = createResource(() => LC.audioOutputs().catch(() => [] as string[]));
  const [testText, setTestText] = createSignal(t("Merhaba! Canlı sohbet sesli okuma denemesi."));
  onMount(() => {
    LC.ttsStatus().then(setSt).catch(() => {});
    let un: (() => void) | undefined;
    void LC.onTts(setSt).then((u) => (un = u));
    onCleanup(() => un?.());
  });
  const locked = () => proLocked(F.liveTts);
  const supported = () => st()?.supported ?? true;

  const pill = () => {
    const s = st();
    if (!supported()) return { cls: "off" as const, text: t("Sadece Windows") };
    if (!v().enabled) return { cls: "off" as const, text: t("Kapalı") };
    if (s?.speaking) return { cls: "busy" as const, text: s.queue ? t("Okuyor · sırada {0}", s.queue) : t("Okuyor") };
    return { cls: "on" as const, text: t("Açık · mesaj bekleniyor") };
  };

  const test = async () => {
    try {
      await LC.ttsTest({ text: testText(), voice: v().voice, device: v().device, rate: v().rate, pitch: v().pitch, volume: v().volume });
    } catch (e) {
      toast(errText(e), true);
    }
  };

  const allVoices = () => voices() ?? [];
  /** Arayüz diline uygun kurulu ses var mı (yoksa süzgeç boş liste göstermesin diye tüm sesler gösterilir) */
  const langHas = createMemo(() => allVoices().some((x) => LC.voiceMatchesLang(x, lang())));
  const voiceList = createMemo(() => {
    const l = LC.filterVoices(allVoices(), langOnly() && langHas() ? lang() : "", gender());
    // Seçili ses süzgeç dışında kalsa da listede görünsün
    const cur = allVoices().find((x) => x.id === v().voice);
    if (cur && !l.includes(cur)) l.unshift(cur);
    // Arayüz diline uygun sesler önce, sonra ada göre
    return [...l].sort((a, b) => Number(LC.voiceMatchesLang(b, lang())) - Number(LC.voiceMatchesLang(a, lang())) || a.name.localeCompare(b.name));
  });
  const genderText = () => ({ female: t("Kadın"), male: t("Erkek") });
  const edgeList = () => voiceList().filter((x) => x.engine === "edge");
  const winList = () => voiceList().filter((x) => x.engine !== "edge");
  const edgeSelected = () => v().voice.startsWith(LC.EDGE_VOICE_PREFIX);

  return (
    <ProLockBox feature={F.liveTts} text={t("Sohbeti sesli okuma PRO üyelere özel.")}>
      <section class="panel">
        <div class="lcp-panel-head">
          <h3>Sohbeti sesli okuma</h3>
          <StatusPill cls={pill().cls} text={pill().text} />
          <span class="lcp-sp" />
          <button class="btn ghost small" title={t("Okunanı geç")} onClick={() => LC.ttsSkip()}>
            <I.SkipForward /> Geç
          </button>
          <button class="btn ghost small" title={t("Okunanı kes ve sırayı boşalt")} onClick={() => LC.ttsClear()}>
            <I.VolumeX /> Sustur
          </button>
        </div>
        <p class="muted small">
          Gelen mesajlar Windows'un kendi sesleriyle (internetsiz) okunur. Sesli mühendisten ayrı çalışır, spotter'ı bekletmez. Windows'ta kurulu
          tüm sesler (kadın ve erkek) aşağıdaki <b>Ses</b> bölümünden seçilebilir.
        </p>
        <div class="row">
          <div>
            <b>Sesli okuma açık</b>
            <small>Canlı sohbet çalışırken gelen mesajlar okunur.</small>
          </div>
          <Switch checked={v().enabled && !locked()} disabled={locked() || !supported()} onChange={(on) => setTts((x) => (x.enabled = on))} />
        </div>
        <Show when={st()?.error}>
          <div class="lcp-err" data-no-i18n>
            {st()!.error}
          </div>
        </Show>
        <Show when={!st()?.error && st()?.notice}>
          <div class="lcp-note lcp-warnnote" data-no-i18n>
            {st()!.notice}
          </div>
        </Show>
      </section>

      <section class="panel">
        <h3>Neler okunsun</h3>
        <div class="row">
          <div>
            <b>Mod</b>
          </div>
          <div class="seg small lcp-noshrink">
            <button classList={{ on: v().mode === "all" }} onClick={() => setTts((x) => (x.mode = "all"))}>
              Tüm mesajlar
            </button>
            <button classList={{ on: v().mode === "command" }} onClick={() => setTts((x) => (x.mode = "command"))}>
              Sadece komutla
            </button>
            <button classList={{ on: v().mode === "alerts" }} onClick={() => setTts((x) => (x.mode = "alerts"))}>
              Sadece uyarılar
            </button>
          </div>
        </div>
        <Show when={v().mode === "command"}>
          <div class="row">
            <div>
              <b>Okuma komutu</b>
              <small>Virgülle birden fazla yazılabilir. “!oku merhaba” → “merhaba” okunur.</small>
            </div>
            <input class="input" style={{ width: "200px" }} value={v().command} onChange={(e) => setTts((x) => (x.command = e.currentTarget.value.trim() || "!oku"))} />
          </div>
        </Show>
        <div class="row">
          <div>
            <b>Sadece aboneler / kanal üyeleri</b>
            <small>Aşağıdaki listedeki kişiler de okunur.</small>
          </div>
          <Switch checked={v().subsOnly} onChange={(on) => setTts((x) => (x.subsOnly = on))} />
        </div>
        <div class="lcp-field">
          <label>Sadece bu kullanıcılar (virgülle; boş: herkes)</label>
          <input class="input" style={{ width: "100%" }} placeholder={t("ör. ali, veli")} value={v().onlyUsers} onChange={(e) => setTts((x) => (x.onlyUsers = e.currentTarget.value))} />
        </div>
        <div class="row">
          <div>
            <b>Platformlar</b>
          </div>
          <div class="seg small lcp-noshrink">
            <For each={["youtube", "twitch", "kick"] as const}>
              {(p) => (
                <button classList={{ on: v().platforms[p] }} onClick={() => setTts((x) => (x.platforms[p] = !x.platforms[p]))}>
                  {LC.PLATFORM_NAMES[p]}
                </button>
              )}
            </For>
          </div>
        </div>
        <div class="row">
          <div>
            <b>İsimleri oku</b>
            <small>“Ali diyor ki: …”</small>
          </div>
          <Switch checked={v().readNames} onChange={(on) => setTts((x) => (x.readNames = on))} />
        </div>
        <div class="row">
          <div>
            <b>Bağış / abone / raid uyarılarını her modda oku</b>
          </div>
          <Switch checked={v().readAlerts} onChange={(on) => setTts((x) => (x.readAlerts = on))} />
        </div>
        <div class="row">
          <div>
            <b>Bağlantıları atla</b>
          </div>
          <Switch checked={v().skipLinks} onChange={(on) => setTts((x) => (x.skipLinks = on))} />
        </div>
        <div class="row">
          <div>
            <b>Emote'ları atla</b>
            <small>Kapalıysa emote adı okunur (ör. “Kappa”).</small>
          </div>
          <Switch checked={v().skipEmotes} onChange={(on) => setTts((x) => (x.skipEmotes = on))} />
        </div>
        <div class="lcp-grid2">
          <div class="f2">
            <div class="f2-cap">En fazla karakter</div>
            <Slider value={v().maxChars} min={20} max={500} step={10} onInput={(n) => setTts((x) => (x.maxChars = n))} />
          </div>
          <div class="f2">
            <div class="f2-cap">Sıradaki en fazla mesaj (dolunca en eskisi atılır)</div>
            <Slider value={v().maxQueue} min={1} max={50} onInput={(n) => setTts((x) => (x.maxQueue = n))} />
          </div>
          <div class="f2">
            <div class="f2-cap">Bundan eski mesaj okunmaz</div>
            <Slider value={v().maxDelay} min={2} max={120} unit={t("sn")} onInput={(n) => setTts((x) => (x.maxDelay = n))} />
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>Ses</h3>
        <div class="row">
          <div>
            <b>Arayüz dilime uygun sesler</b>
            <small>Açık: yalnızca programın diline uygun sesler listelenir. Kapalı: Windows'ta kurulu tüm diller.</small>
          </div>
          <Switch checked={langOnly()} onChange={setLangOnly} />
        </div>
        <div class="row">
          <div>
            <b>Ses türü</b>
          </div>
          <div class="lcp-inline lcp-noshrink">
            <div class="seg small lcp-noshrink">
              <button classList={{ on: gender() === "any" }} onClick={() => setGender("any")}>
                Tümü
              </button>
              <button classList={{ on: gender() === "female" }} onClick={() => setGender("female")}>
                Kadın
              </button>
              <button classList={{ on: gender() === "male" }} onClick={() => setGender("male")}>
                Erkek
              </button>
            </div>
            <button class="btn ghost small" title={t("Ses listesini yenile (Windows'a yeni ses ekledikten sonra)")} onClick={() => refetchVoices()}>
              <I.RotateCcw /> Yenile
            </button>
          </div>
        </div>
        <div class="lcp-grid2">
          <div class="f2">
            <div class="f2-cap">{t("Ses ({0} / {1} ses)", voiceList().length, allVoices().length)}</div>
            <select class="f2-select" value={v().voice} onChange={(e) => setTts((x) => (x.voice = e.currentTarget.value))}>
              <option value="">{t("Windows varsayılanı")}</option>
              <Show when={edgeList().length}>
                <optgroup label={t("Edge (çevrimiçi, doğal ses)")}>
                  <For each={edgeList()}>
                    {(vo) => (
                      <option value={vo.id} selected={vo.id === v().voice} data-no-i18n>
                        {LC.voiceLabel(vo, genderText())}
                      </option>
                    )}
                  </For>
                </optgroup>
              </Show>
              <Show when={winList().length}>
                <optgroup label={t("Windows (çevrimdışı)")}>
                  <For each={winList()}>
                    {(vo) => (
                      <option value={vo.id} selected={vo.id === v().voice} data-no-i18n>
                        {LC.voiceLabel(vo, genderText())}
                      </option>
                    )}
                  </For>
                </optgroup>
              </Show>
              <Show when={v().voice && !voices.loading && !allVoices().some((x) => x.id === v().voice)}>
                <option value={v().voice}>{edgeSelected() ? `${v().voice.slice(LC.EDGE_VOICE_PREFIX.length)} · Edge` : t("Seçili ses kurulu değil")}</option>
              </Show>
            </select>
          </div>
          <div class="f2">
            <div class="f2-cap">Çıkış cihazı</div>
            <select class="f2-select" value={v().device} onChange={(e) => setTts((x) => (x.device = e.currentTarget.value))}>
              <option value="">{t("Windows varsayılanı")}</option>
              <For each={outputs() ?? []}>{(d) => <option value={d}>{d}</option>}</For>
            </select>
          </div>
          <div class="f2">
            <div class="f2-cap">Ses düzeyi</div>
            <Slider value={v().volume} min={0} max={100} step={5} unit="%" onInput={(n) => setTts((x) => (x.volume = n))} />
          </div>
          <div class="f2">
            <div class="f2-cap">Hız</div>
            <Slider value={v().rate} min={-10} max={10} onInput={(n) => setTts((x) => (x.rate = n))} />
          </div>
          <div class="f2">
            <div class="f2-cap">Ses tonu</div>
            <Slider value={v().pitch} min={-10} max={10} onInput={(n) => setTts((x) => (x.pitch = n))} />
          </div>
        </div>
        <Show when={supported() && voices() && !allVoices().some((x) => x.engine !== "edge")}>
          <div class="lcp-note">Kurulu Windows sesi bulunamadı: Edge çevrimiçi seslerini kullanabilirsin.</div>
        </Show>
        <div class="lcp-note" classList={{ "lcp-warnnote": edgeSelected() }}>
          <b>Edge (çevrimiçi, doğal ses):</b> Microsoft Edge'in “Sesli Oku” sesleri (Türkçe: Ahmet ve Emel) çok daha doğal konuşur ama{" "}
          <b>internet bağlantısı gerekir</b>. Bağlantı yoksa ya da ses 10 saniyede gelmezse o mesaj kendiliğinden Windows sesiyle okunur;
          sıra beklemez.
        </div>
        <Show when={supported() && langOnly() && allVoices().length > 0 && !langHas()}>
          <div class="lcp-note">Programın diline uygun kurulu ses yok: Windows'ta kurulu tüm sesler gösteriliyor.</div>
        </Show>
        <div class="lcp-note">
          <b>Daha fazla ses eklemek için:</b> Windows Ayarları › Saat ve dil › <b>Konuşma</b> › Sesleri yönet › <b>Ses ekle</b> ile istediğin
          dili seç (Türkçe: Microsoft Tolga ve Emel). Windows 11'de: Ayarlar › Saat ve dil › Dil ve bölge › dil › Dil seçenekleri ›
          “Metin okuma”. Kurulumdan sonra <b>Yenile</b>'ye bas. Klasik (SAPI5) sesler ve başka firmaların Windows sesleri de listede
          “SAPI5” etiketiyle görünür.
        </div>
        <div class="lcp-field">
          <label>Deneme</label>
          <div class="lcp-inline">
            <input class="input" value={testText()} onInput={(e) => setTestText(e.currentTarget.value)} />
            <button class="btn small" disabled={locked() || !supported()} onClick={test}>
              <I.Play /> Dinle
            </button>
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>Kısayollar</h3>
        <KeyRow action="tts" title={t("Sesli okumayı aç / kapat")} sub={t("Canlı Sohbet çalışırken oyunda da çalışır.")} />
        <KeyRow action="ttsHush" title={t("Okunanı kes ve sırayı boşalt")} />
      </section>
    </ProLockBox>
  );
}

// ---------------------------------------------------------------------------
// Konuşma → yazı
// ---------------------------------------------------------------------------

/** Çevrimiçi (Whisper) motoru için hazır sunucular: OpenAI uyumlu `/audio/transcriptions` ucu */
const STT_PROVIDERS: Record<"groq" | "openai", { url: string; model: string; keyUrl: string }> = {
  groq: { url: "https://api.groq.com/openai/v1", model: "whisper-large-v3-turbo", keyUrl: "https://console.groq.com/keys" },
  openai: { url: "https://api.openai.com/v1", model: "gpt-4o-mini-transcribe", keyUrl: "https://platform.openai.com/api-keys" },
};
/** Çevrimiçi motorda seçilebilen diller (ISO-639-1); adlar kendi dillerinde */
const STT_CLOUD_LANGS: [string, string][] = [
  ["tr", "Türkçe"],
  ["en", "English"],
  ["de", "Deutsch"],
  ["es", "Español"],
  ["fr", "Français"],
  ["it", "Italiano"],
  ["pt", "Português"],
  ["nl", "Nederlands"],
  ["pl", "Polski"],
  ["sv", "Svenska"],
  ["fi", "Suomi"],
  ["ru", "Русский"],
  ["ja", "日本語"],
  ["zh", "中文"],
];

interface WinMic {
  id: string;
  name: string;
  isDefault: boolean;
}

/** Ses düzeyi göstergesi (0..100) */
function Level(p: { value: number; on: boolean }) {
  return (
    <span class="lcp-level" classList={{ on: p.on }} title={t("Ses düzeyi")}>
      <i style={{ width: `${Math.max(0, Math.min(100, p.value))}%` }} />
    </span>
  );
}

export function SttTab() {
  const v = () => lc().stt;
  const [st, setSt] = createSignal<LC.SttStatus | null>(null);
  const [langs, { refetch: refetchLangs }] = createResource(() => LC.sttLanguages().catch(() => ({ languages: [], system: null, effective: null, error: null }) as LC.SttLanguages));
  const [devs, { refetch: refetchDevs }] = createResource(() => LC.audioDevices().catch(() => ({ inputs: [], outputs: [], defaultInput: null, defaultOutput: null }) as LC.AudioDevices));
  // Windows motorunun mikrofonu: sürecin kayıt cihazı tercihi, Sesli komut ayarıyla ortaktır (Rust: voicecmd_microphones)
  const [winMics, { refetch: refetchWinMics }] = createResource(() => invoke<WinMic[]>("voicecmd_microphones").catch(() => [] as WinMic[]));
  const [sample, setSample] = createSignal(t("Merhaba, bu bir altyazı denemesidir."));
  const [key, setKey] = createSignal("");
  onMount(() => {
    LC.sttStatus().then(setSt).catch(() => {});
    let un: (() => void) | undefined;
    void LC.onStt(setSt).then((u) => (un = u));
    onCleanup(() => un?.());
  });
  const locked = () => proLocked(F.liveStt);
  const supported = () => st()?.supported ?? true;
  const cloud = () => v().engine === "cloud";
  const wantMic = () => v().source !== "system";
  const wantSystem = () => v().source !== "mic";
  const pill = () => {
    const s = st();
    if (!supported()) return { cls: "off" as const, text: t("Sadece Windows") };
    if (!v().enabled) return { cls: "off" as const, text: t("Kapalı") };
    if (s?.listening && s.error) return { cls: "warn" as const, text: t("Kısmen dinliyor") };
    if (s?.listening) return { cls: "on" as const, text: t("Dinliyor") };
    if (s?.error) return { cls: "err" as const, text: t("Dinlemiyor") };
    return { cls: "busy" as const, text: t("Başlatılıyor…") };
  };
  const langName = (tag: string) => langs()?.languages.find((l) => l[0] === tag)?.[1] ?? tag;
  const cmdMic = () => settings().general.voice.commands;
  const winMicList = () => winMics() ?? [];
  const winMicMissing = () => !!cmdMic().mic && !winMics.loading && winMicList().length > 0 && !winMicList().some((m) => m.id === cmdMic().mic);
  const setWinMic = (id: string) => {
    const m = winMicList().find((x) => x.id === id);
    updateSettings((d) => {
      d.general.voice.commands.mic = id;
      d.general.voice.commands.micName = m?.name ?? "";
    });
    setTimeout(refetchWinMics, 600);
  };
  const setProvider = (p: "groq" | "openai" | "custom") =>
    setStt((x) => {
      x.cloud.provider = p;
      if (p !== "custom") {
        x.cloud.url = STT_PROVIDERS[p].url;
        x.cloud.model = STT_PROVIDERS[p].model;
      }
    });
  const saveKey = async (k: string) => {
    try {
      setSt(await LC.sttSetKey(k));
      setKey("");
      toast(k ? t("Anahtar kaydedildi (şifreli)") : t("Anahtar silindi"));
    } catch (e) {
      toast(errText(e), true);
    }
  };
  const refreshDevices = () => {
    void refetchDevs();
    void refetchWinMics();
    void refetchLangs();
  };
  const isLocal = () => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(v().cloud.url.trim());
  const openUrl = (url: string) => invoke("open_url", { url }).catch(() => {});

  return (
    <ProLockBox feature={F.liveStt} text={t("Konuşmayı yazıya çevirme PRO üyelere özel.")}>
      <section class="panel">
        <div class="lcp-panel-head">
          <h3>Konuşmayı yazıya çevir (altyazı)</h3>
          <StatusPill cls={pill().cls} text={pill().text} />
          <Show when={v().enabled && (st()?.error || st()?.notice)}>
            <span class="lcp-sp" />
            <button class="btn ghost small" onClick={() => LC.sttRestart().then(setSt).catch((e) => toast(errText(e), true))}>
              <I.RotateCcw /> Tekrar dene
            </button>
          </Show>
        </div>
        <p class="muted small">
          Söylediklerin — ve istersen bilgisayarından çalan ses, ör. Discord'da konuşan arkadaşların — yazıya çevrilir ve altyazı olarak Altyazı
          overlay'inde, Canlı Sohbet overlay'inde ve OBS altyazı sayfasında görünür. Her kaynağın kendi etiketi vardır (ör. “Ben” / “Discord”).
        </p>
        <div class="row">
          <div>
            <b>Konuşma → yazı açık</b>
            <small>Canlı sohbet çalışmasa da altyazı üretir.</small>
          </div>
          <Switch checked={v().enabled && !locked()} disabled={locked() || !supported()} onChange={(on) => setStt((x) => (x.enabled = on))} />
        </div>
        <Show when={v().enabled && st()?.error}>
          <div class="lcp-err" data-no-i18n style={{ "white-space": "pre-line" }}>
            {st()!.error}
          </div>
        </Show>
        <Show when={v().enabled && st()?.notice}>
          <div class="lcp-note" data-no-i18n>
            {st()!.notice}
          </div>
        </Show>
        <Show when={v().enabled && st()?.activeLanguage}>
          <div class="lcp-note">
            {t("Tanıma dili:")}{" "}
            <b data-no-i18n>{st()!.activeLanguage === "auto" ? t("Otomatik algıla") : st()!.activeLanguage}</b>
          </div>
        </Show>
        <Show when={st()?.last}>
          <div class="lcp-note">
            {t("Son duyulan:")} <b data-no-i18n>{st()!.last}</b>
          </div>
        </Show>
      </section>

      <section class="panel">
        <h3>Motor</h3>
        <div class="row">
          <div>
            <b>Tanıma motoru</b>
            <small>
              <b>Windows</b>: ücretsiz, hesap gerekmez; yalnızca mikrofonu dinler ve yalnızca Windows'ta konuşma tanıma paketi olan dilleri tanır
              (Türkçe paketi yoktur). <b>Çevrimiçi (Whisper)</b>: Türkçe dahil ~100 dil, mikrofon seçimi ve bilgisayar sesi (Discord); bir API
              anahtarı gerekir.
            </small>
          </div>
          <div class="seg small lcp-noshrink">
            <button classList={{ on: !cloud() }} onClick={() => setStt((x) => ((x.engine = "windows"), (x.source = "mic")))}>
              Windows
            </button>
            <button classList={{ on: cloud() }} onClick={() => setStt((x) => (x.engine = "cloud"))}>
              Çevrimiçi (Whisper)
            </button>
          </div>
        </div>

        <Show when={cloud()}>
          <div class="row">
            <div>
              <b>Sunucu</b>
              <small>
                Groq'ta ücretsiz kota vardır; OpenAI ücretlidir (konuşulan dakika başına). “Özel” ile kendi OpenAI uyumlu sunucunu (ör. yerel
                faster-whisper) kullanabilirsin.
              </small>
            </div>
            <div class="seg small lcp-noshrink">
              <button classList={{ on: v().cloud.provider === "groq" }} onClick={() => setProvider("groq")} data-no-i18n>
                Groq
              </button>
              <button classList={{ on: v().cloud.provider === "openai" }} onClick={() => setProvider("openai")} data-no-i18n>
                OpenAI
              </button>
              <button classList={{ on: v().cloud.provider === "custom" }} onClick={() => setProvider("custom")}>
                Özel
              </button>
            </div>
          </div>
          <div class="lcp-grid2">
            <div class="f2">
              <div class="f2-cap">Sunucu adresi</div>
              <input
                class="input"
                style={{ width: "100%" }}
                disabled={v().cloud.provider !== "custom"}
                placeholder="https://…/v1"
                value={v().cloud.url}
                onChange={(e) => setStt((x) => (x.cloud.url = e.currentTarget.value.trim()))}
              />
            </div>
            <div class="f2">
              <div class="f2-cap">Model</div>
              <input class="input" style={{ width: "100%" }} value={v().cloud.model} onChange={(e) => setStt((x) => (x.cloud.model = e.currentTarget.value.trim()))} />
            </div>
          </div>
          <div class="lcp-field">
            <label>{isLocal() ? t("API anahtarı (yerel sunucu için gerekmez)") : t("API anahtarı")}</label>
            <div class="lcp-inline">
              <input
                class="input"
                type="password"
                autocomplete="off"
                placeholder={st()?.hasKey ? t("Kayıtlı (değiştirmek için yenisini yapıştır)") : t("API anahtarını yapıştır")}
                value={key()}
                onInput={(e) => setKey(e.currentTarget.value)}
              />
              <button class="btn small primary" disabled={!key().trim()} onClick={() => saveKey(key().trim())}>
                Kaydet
              </button>
              <Show when={st()?.hasKey}>
                <button class="btn small ghost" onClick={() => saveKey("")}>
                  Sil
                </button>
              </Show>
            </div>
          </div>
          <div class="lcp-note">
            <Show when={v().cloud.provider !== "custom"}>
              Anahtarı buradan alabilirsin:{" "}
              <button class="link" data-no-i18n onClick={() => openUrl(STT_PROVIDERS[v().cloud.provider as "groq" | "openai"].keyUrl)}>
                {STT_PROVIDERS[v().cloud.provider as "groq" | "openai"].keyUrl.replace("https://", "")}
              </button>
              <br />
            </Show>
            <b>Gizlilik:</b> bu motorda konuşma algılanan ses parçaları yazıya çevrilmek üzere seçtiğin sunucuya gönderilir (sessizlik
            gönderilmez). Anahtar bu bilgisayarda Windows hesabına bağlı olarak şifrelenir; ayar dosyasına ve buluta yazılmaz.
          </div>
          <div class="row">
            <div>
              <b>Dil</b>
              <small>Konuşulan dil. Doğru dil seçilirse tanıma daha isabetli olur.</small>
            </div>
            <select class="f2-select small" value={v().cloudLanguage} onChange={(e) => setStt((x) => (x.cloudLanguage = e.currentTarget.value))}>
              <option value="">{t("Arayüz dili")}</option>
              <option value="auto">{t("Otomatik algıla")}</option>
              <For each={STT_CLOUD_LANGS}>
                {([code, name]) => (
                  <option value={code} data-no-i18n>
                    {name}
                  </option>
                )}
              </For>
              <Show when={v().cloudLanguage && v().cloudLanguage !== "auto" && !STT_CLOUD_LANGS.some((l) => l[0] === v().cloudLanguage)}>
                <option value={v().cloudLanguage}>{v().cloudLanguage}</option>
              </Show>
            </select>
          </div>
          <div class="row">
            <div>
              <b>Konuşma algılama hassasiyeti</b>
              <small>Kısık konuşmalar yazılmıyorsa artır; arka plan gürültüsü yazıya dönüyorsa azalt.</small>
            </div>
            <div style={{ width: "220px" }}>
              <Slider value={v().sensitivity} min={1} max={10} onInput={(n) => setStt((x) => (x.sensitivity = n))} />
            </div>
          </div>
        </Show>

        <Show when={!cloud()}>
          <div class="row">
            <div>
              <b>Dil</b>
              <small>Listede sadece Windows'ta konuşma tanıma paketi kurulu diller görünür. Seçilen dil kurulu değilse kurulu bir dile geçilir.</small>
            </div>
            <select class="f2-select small" value={v().language} onChange={(e) => setStt((x) => (x.language = e.currentTarget.value))}>
              <option value="">
                {langs()?.effective
                  ? t("Windows konuşma dili ({0})", langName(langs()!.effective!))
                  : langs()?.system
                    ? t("Windows konuşma dili ({0})", langName(langs()!.system!))
                    : t("Windows konuşma dili")}
              </option>
              <For each={langs()?.languages ?? []}>{([tag, name]) => <option value={tag} selected={tag === v().language} data-no-i18n>{`${name} (${tag})`}</option>}</For>
              <Show when={v().language && !langs.loading && !(langs()?.languages ?? []).some((l) => l[0] === v().language)}>
                <option value={v().language}>{t("{0} (kurulu değil)", v().language)}</option>
              </Show>
            </select>
          </div>
          <Show when={langs()?.error}>
            <div class="lcp-err" data-no-i18n>
              {langs()!.error}
            </div>
          </Show>
          <div class="lcp-note">
            Çalışmazsa: Ayarlar › Gizlilik ve güvenlik › <b>Konuşma</b> › “Çevrimiçi konuşma tanıma” açık olmalı; Gizlilik › <b>Mikrofon</b> ›
            masaüstü uygulamalarının erişimine izin verilmeli; dil için Ayarlar › Saat ve dil › Dil ve bölge › dil › Dil seçenekleri ›{" "}
            <b>Konuşma tanıma</b> paketi kurulu olmalı. <b>Windows'ta Türkçe konuşma tanıma paketi yoktur:</b> Türkçe altyazı ve Discord'daki
            konuşmalar için “Çevrimiçi (Whisper)” motorunu seç.
          </div>
        </Show>
      </section>

      <section class="panel">
        <div class="lcp-panel-head">
          <h3>Ses kaynağı</h3>
          <span class="lcp-sp" />
          <button class="btn ghost small" title={t("Cihaz listesini yenile")} onClick={refreshDevices}>
            <I.RotateCcw /> Yenile
          </button>
        </div>
        <div class="row">
          <div>
            <b>Kaynak</b>
            <small>
              <b>Bilgisayar sesi</b>: seçtiğin çıkış cihazından (hoparlör / kulaklık) çalan her şey — Discord'da konuşanlar gibi — yazıya çevrilir.
              <Show when={!cloud()}> Yalnızca “Çevrimiçi (Whisper)” motoruyla kullanılabilir.</Show>
            </small>
          </div>
          <div class="seg small lcp-noshrink">
            <button classList={{ on: v().source === "mic" }} onClick={() => setStt((x) => (x.source = "mic"))}>
              Mikrofon
            </button>
            <button classList={{ on: v().source === "system" }} disabled={!cloud()} onClick={() => setStt((x) => (x.source = "system"))}>
              Bilgisayar sesi (Discord vb.)
            </button>
            <button classList={{ on: v().source === "both" }} disabled={!cloud()} onClick={() => setStt((x) => (x.source = "both"))}>
              İkisi
            </button>
          </div>
        </div>

        <Show when={wantMic()}>
          <div class="row">
            <div>
              <b>Mikrofon</b>
              <Show
                when={cloud()}
                fallback={
                  <small>
                    Altyazı için dinlenecek mikrofon. Windows motorunda bu seçim “Sesli komut” mikrofonuyla ortaktır (Windows uygulama başına tek
                    kayıt cihazı kullandırır). Mikrofon paylaşımlı açılır: Discord aynı mikrofonu kullanırken de çalışır.
                  </small>
                }
              >
                <small>Altyazı için dinlenecek mikrofon. Paylaşımlı açılır: Discord aynı mikrofonu kullanırken de çalışır.</small>
              </Show>
              <Show when={!cloud() && winMicMissing()}>
                <small class="sc-err">{t("Seçili mikrofon bulunamadı ({0}): Windows varsayılanı kullanılıyor.", cmdMic().micName || "?")}</small>
              </Show>
              <Show when={cloud() && v().micDevice && !devs.loading && !(devs()?.inputs ?? []).includes(v().micDevice)}>
                <small class="sc-err">{t("Seçili mikrofon bulunamadı ({0}): Windows varsayılanı kullanılıyor.", v().micDevice)}</small>
              </Show>
              <Show when={!devs.loading && !(devs()?.inputs ?? []).length && !winMicList().length}>
                <small class="sc-err">Windows'ta etkin bir mikrofon (kayıt cihazı) bulunamadı.</small>
              </Show>
            </div>
            <div class="lcp-inline lcp-noshrink">
              <Show when={cloud()}>
                <Level value={st()?.mic.level ?? 0} on={!!st()?.mic.listening} />
              </Show>
              <Show
                when={cloud()}
                fallback={
                  <select class="f2-select small" value={winMicMissing() ? "" : cmdMic().mic} disabled={!supported()} onChange={(e) => setWinMic(e.currentTarget.value)}>
                    <option value="">
                      {winMicList().find((m) => m.isDefault) ? t("Windows varsayılanı ({0})", winMicList().find((m) => m.isDefault)!.name) : t("Windows varsayılanı")}
                    </option>
                    <For each={winMicList()}>
                      {(m) => (
                        <option value={m.id} selected={!winMicMissing() && m.id === cmdMic().mic} data-no-i18n>
                          {m.name + (m.isDefault ? " ★" : "")}
                        </option>
                      )}
                    </For>
                  </select>
                }
              >
                <select class="f2-select small" value={v().micDevice} disabled={!supported()} onChange={(e) => setStt((x) => (x.micDevice = e.currentTarget.value))}>
                  <option value="">{devs()?.defaultInput ? t("Windows varsayılanı ({0})", devs()!.defaultInput!) : t("Windows varsayılanı")}</option>
                  <For each={devs()?.inputs ?? []}>
                    {(d) => (
                      <option value={d} selected={d === v().micDevice} data-no-i18n>
                        {d}
                      </option>
                    )}
                  </For>
                  <Show when={v().micDevice && !devs.loading && !(devs()?.inputs ?? []).includes(v().micDevice)}>
                    <option value={v().micDevice} data-no-i18n>
                      {v().micDevice}
                    </option>
                  </Show>
                </select>
              </Show>
            </div>
          </div>
          <div class="row">
            <div>
              <b>Mikrofon etiketi</b>
              <small>Kendi altyazının önündeki ad (ör. “Ben” ya da yayıncı adın); boş bırakılabilir.</small>
            </div>
            <input class="input" style={{ width: "200px" }} maxLength={24} placeholder={t("Ben")} value={v().label} onChange={(e) => setStt((x) => (x.label = e.currentTarget.value.trim()))} />
          </div>
        </Show>

        <Show when={wantSystem() && cloud()}>
          <div class="row">
            <div>
              <b>Bilgisayar sesi cihazı</b>
              <small>
                Bu çıkış cihazından çalan ses yazıya çevrilir. Yalnızca Discord yazılsın istiyorsan Discord › Ses ayarlarında çıkışı ayrı bir cihaza
                (ör. kulaklık ya da sanal kablo) ver ve burada o cihazı seç; aksi halde oyun sesi ve videolardaki konuşmalar da yazılır.
              </small>
              <Show when={v().systemDevice && !devs.loading && !(devs()?.outputs ?? []).includes(v().systemDevice)}>
                <small class="sc-err">{t("Seçili cihaz bulunamadı ({0}): Windows varsayılanı kullanılıyor.", v().systemDevice)}</small>
              </Show>
            </div>
            <div class="lcp-inline lcp-noshrink">
              <Level value={st()?.system.level ?? 0} on={!!st()?.system.listening} />
              <select class="f2-select small" value={v().systemDevice} disabled={!supported()} onChange={(e) => setStt((x) => (x.systemDevice = e.currentTarget.value))}>
                <option value="">{devs()?.defaultOutput ? t("Windows varsayılanı ({0})", devs()!.defaultOutput!) : t("Windows varsayılanı")}</option>
                <For each={devs()?.outputs ?? []}>
                  {(d) => (
                    <option value={d} selected={d === v().systemDevice} data-no-i18n>
                      {d}
                    </option>
                  )}
                </For>
                <Show when={v().systemDevice && !devs.loading && !(devs()?.outputs ?? []).includes(v().systemDevice)}>
                  <option value={v().systemDevice} data-no-i18n>
                    {v().systemDevice}
                  </option>
                </Show>
              </select>
            </div>
          </div>
          <div class="row">
            <div>
              <b>Bilgisayar sesi etiketi</b>
              <small>Bu kaynaktan gelen altyazının önündeki ad; boş bırakılabilir. Sesli mühendis ve sesli okuma konuşurken bu kaynak yazılmaz.</small>
            </div>
            <input
              class="input"
              style={{ width: "200px" }}
              maxLength={24}
              placeholder="Discord"
              value={v().remoteLabel}
              onChange={(e) => setStt((x) => (x.remoteLabel = e.currentTarget.value.trim()))}
            />
          </div>
        </Show>
      </section>

      <section class="panel">
        <h3>Altyazı</h3>
        <div class="row">
          <div>
            <b>Sesli okuma konuşurken yazma</b>
            <small>Hoparlörden gelen okuma sesi altyazıya girmesin.</small>
          </div>
          <Switch checked={v().pauseWhileTts} onChange={(on) => setStt((x) => (x.pauseWhileTts = on))} />
        </div>
        <div class="row">
          <div>
            <b>Cümleleri birleştirme süresi</b>
            <small>Bu süre içinde aynı kaynaktan gelen cümleler aynı satıra eklenir (en fazla 180 karakter).</small>
          </div>
          <div style={{ width: "220px" }}>
            <Slider value={lc().captions.secs} min={2} max={60} unit={t("sn")} onInput={(n) => setLc((x) => (x.captions.secs = n))} />
          </div>
        </div>
        <div class="row">
          <div>
            <b>Küfür filtresi</b>
            <small>Türkçe ve İngilizce küfürler ilk harf kalacak şekilde yıldızlanır (s*****).</small>
          </div>
          <Switch checked={v().profanity} onChange={(on) => setStt((x) => (x.profanity = on))} />
        </div>
        <Show when={v().profanity}>
          <div class="lcp-field">
            <label>Ek kelimeler (virgülle; “kelime*” o kelimeyle başlayanlar)</label>
            <input class="input" style={{ width: "100%" }} value={v().profanityWords} onChange={(e) => setStt((x) => (x.profanityWords = e.currentTarget.value))} />
          </div>
        </Show>
      </section>

      <section class="panel">
        <h3>Deneme ve kısayol</h3>
        <div class="lcp-field">
          <label>Örnek altyazı gönder (overlay ve OBS'de nasıl göründüğüne bakmak için)</label>
          <div class="lcp-inline">
            <input class="input" value={sample()} onInput={(e) => setSample(e.currentTarget.value)} />
            <button class="btn small" onClick={() => LC.pushCaption(sample(), "mic", v().label).catch((e) => toast(errText(e), true))}>
              {t("“{0}” olarak gönder", v().label || t("Ben"))}
            </button>
            <button class="btn small" onClick={() => LC.pushCaption(sample(), "remote", v().remoteLabel).catch((e) => toast(errText(e), true))}>
              {t("“{0}” olarak gönder", v().remoteLabel || "Discord")}
            </button>
            <button class="btn ghost small" onClick={() => LC.clearCaptions().catch(() => {})}>
              Temizle
            </button>
          </div>
        </div>
        <KeyRow action="stt" title={t("Konuşma → yazıyı aç / kapat")} sub={t("Canlı Sohbet çalışırken ya da altyazı açıkken oyunda da çalışır.")} />
      </section>
    </ProLockBox>
  );
}
