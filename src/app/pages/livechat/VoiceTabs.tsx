// Canlı Sohbet › Sesli okuma (TTS, Windows sesleri) ve Konuşma → yazı (STT, Windows konuşma tanıma → altyazı)

import { For, Show, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { t } from "@/sdk/i18n";
import * as LC from "@/sdk/livechat";
import type { LiveChatStt, LiveChatTts } from "@/sdk/settings";
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
  const [voices] = createResource(() => LC.ttsVoices().catch(() => [] as LC.TtsVoice[]));
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

  const voiceList = () => {
    const l = [...(voices() ?? [])];
    // Türkçe sesler önce
    l.sort((a, b) => Number(b.language.startsWith("tr")) - Number(a.language.startsWith("tr")) || a.name.localeCompare(b.name));
    return l;
  };

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
          Gelen mesajlar Windows'un kendi sesleriyle (internetsiz) okunur. Sesli mühendisten ayrı çalışır, spotter'ı bekletmez. Türkçe ses yoksa:
          Windows Ayarları › Saat ve dil › Konuşma › <b>Ses ekle</b> (ör. Microsoft Tolga).
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
      </section>

      <section class="panel">
        <h3>Neler okunsun</h3>
        <div class="row">
          <div>
            <b>Mod</b>
          </div>
          <div class="seg small">
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
          <div class="seg small">
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
        <div class="lcp-grid2">
          <div class="f2">
            <div class="f2-cap">Ses</div>
            <select class="f2-select" value={v().voice} onChange={(e) => setTts((x) => (x.voice = e.currentTarget.value))}>
              <option value="">{t("Windows varsayılanı")}</option>
              <For each={voiceList()}>
                {(vo) => (
                  <option value={vo.id}>
                    {vo.name} ({vo.language})
                  </option>
                )}
              </For>
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
        <Show when={supported() && voices() && !voices()!.length}>
          <div class="lcp-note">Kurulu Windows sesi bulunamadı.</div>
        </Show>
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

export function SttTab() {
  const v = () => lc().stt;
  const [st, setSt] = createSignal<LC.SttStatus | null>(null);
  const [langs] = createResource(() => LC.sttLanguages().catch(() => ({ languages: [], system: null, error: null }) as Awaited<ReturnType<typeof LC.sttLanguages>>));
  const [sample, setSample] = createSignal(t("Merhaba, bu bir altyazı denemesidir."));
  onMount(() => {
    LC.sttStatus().then(setSt).catch(() => {});
    let un: (() => void) | undefined;
    void LC.onStt(setSt).then((u) => (un = u));
    onCleanup(() => un?.());
  });
  const locked = () => proLocked(F.liveStt);
  const supported = () => st()?.supported ?? true;
  const pill = () => {
    const s = st();
    if (!supported()) return { cls: "off" as const, text: t("Sadece Windows") };
    if (!v().enabled) return { cls: "off" as const, text: t("Kapalı") };
    if (s?.listening) return { cls: "on" as const, text: t("Dinliyor") };
    if (s?.error) return { cls: "err" as const, text: t("Dinlemiyor") };
    return { cls: "busy" as const, text: t("Başlatılıyor…") };
  };
  const langName = (tag: string) => langs()?.languages.find((l) => l[0] === tag)?.[1] ?? tag;

  return (
    <ProLockBox feature={F.liveStt} text={t("Konuşmayı yazıya çevirme PRO üyelere özel.")}>
      <section class="panel">
        <div class="lcp-panel-head">
          <h3>Konuşmayı yazıya çevir (altyazı)</h3>
          <StatusPill cls={pill().cls} text={pill().text} />
          <Show when={v().enabled && st()?.error}>
            <span class="lcp-sp" />
            <button class="btn ghost small" onClick={() => LC.sttRestart().then(setSt).catch((e) => toast(errText(e), true))}>
              <I.RotateCcw /> Tekrar dene
            </button>
          </Show>
        </div>
        <p class="muted small">
          Mikrofonundan söylediklerin Windows'un konuşma tanımasıyla yazıya çevrilir ve altyazı olarak Altyazı overlay'inde, Canlı Sohbet
          overlay'inde ve OBS altyazı sayfasında görünür. Ek hesap ya da anahtar gerekmez.
        </p>
        <div class="row">
          <div>
            <b>Konuşma → yazı açık</b>
            <small>Canlı sohbet çalışmasa da altyazı üretir.</small>
          </div>
          <Switch checked={v().enabled && !locked()} disabled={locked() || !supported()} onChange={(on) => setStt((x) => (x.enabled = on))} />
        </div>
        <Show when={v().enabled && st()?.error}>
          <div class="lcp-err" data-no-i18n>
            {st()!.error}
          </div>
        </Show>
        <Show when={st()?.last}>
          <div class="lcp-note">
            {t("Son duyulan:")} <b data-no-i18n>{st()!.last}</b>
          </div>
        </Show>
      </section>

      <section class="panel">
        <h3>Tanıma</h3>
        <div class="row">
          <div>
            <b>Dil</b>
            <small>Listede sadece Windows'ta konuşma paketi kurulu diller görünür.</small>
          </div>
          <select class="f2-select small" value={v().language} onChange={(e) => setStt((x) => (x.language = e.currentTarget.value))}>
            <option value="">{langs()?.system ? t("Windows konuşma dili ({0})", langName(langs()!.system!)) : t("Windows konuşma dili")}</option>
            <For each={langs()?.languages ?? []}>{([tag, name]) => <option value={tag}>{`${name} (${tag})`}</option>}</For>
            <Show when={v().language && !(langs()?.languages ?? []).some((l) => l[0] === v().language)}>
              <option value={v().language}>{v().language}</option>
            </Show>
          </select>
        </div>
        <Show when={langs()?.error}>
          <div class="lcp-note" data-no-i18n>
            {langs()!.error}
          </div>
        </Show>
        <div class="row">
          <div>
            <b>Altyazının önündeki ad</b>
            <small>ör. yayıncı adın; boş bırakılabilir.</small>
          </div>
          <input class="input" style={{ width: "200px" }} maxLength={24} value={v().label} onChange={(e) => setStt((x) => (x.label = e.currentTarget.value.trim()))} />
        </div>
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
            <small>Bu süre içinde gelen cümleler aynı satıra eklenir (en fazla 180 karakter).</small>
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
        <div class="lcp-note">
          <b>Ses kaynağı: sadece mikrofon.</b> Windows konuşma tanıyıcısı masaüstü sesini (Discord, oyun sesi) dinleyemez; Windows'ta varsayılan
          kayıt cihazı kullanılır.
          <br />
          Çalışmazsa: Ayarlar › Gizlilik ve güvenlik › <b>Konuşma</b> › “Çevrimiçi konuşma tanıma” açık olmalı; Gizlilik › <b>Mikrofon</b> ›
          masaüstü uygulamalarının erişimine izin verilmeli; dil için Ayarlar › Saat ve dil › Dil ve bölge › dil › Dil seçenekleri ›{" "}
          <b>Konuşma tanıma</b> paketi kurulu olmalı.
        </div>
      </section>

      <section class="panel">
        <h3>Deneme ve kısayol</h3>
        <div class="lcp-field">
          <label>Örnek altyazı gönder (overlay ve OBS'de nasıl göründüğüne bakmak için)</label>
          <div class="lcp-inline">
            <input class="input" value={sample()} onInput={(e) => setSample(e.currentTarget.value)} />
            <button class="btn small" onClick={() => LC.pushCaption(sample(), "mic", v().label).catch((e) => toast(errText(e), true))}>
              Gönder
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
