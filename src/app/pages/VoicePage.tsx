// Sesli spotter ve yarış mühendisi (yarıştaki mühendis PRO; "Dene" ve ses paketi indirme herkese açık). SRTR Pitwall'un kendi motoru: Crew Chief kurulumu gerekmez.
// Sesler kurulu ses paketinden (<app_data>/voicepacks/<id>) ya da kullanıcının gösterdiği klasörden okunur.
// Canlı bir sim oturumu algılanınca mühendis kendiliğinden konuşmaya başlar.

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings, updateSettings, VOICE_CATEGORIES, type VoiceSettings } from "@/sdk/settings";
import { proLocked, requiresPro, VOICE_FEATURE } from "@/sdk/proFeatures";
import { localeTag, t } from "@/sdk/i18n";
import { Slider, Switch } from "../components/SettingsForm";
import { VoicePacksSection } from "../components/VoicePacks";
import { VoiceCommandsSection } from "../components/VoiceCommands";
import { appState } from "../App";
import { go } from "../ui";
import * as I from "../icons";
import "../voice.css";

interface VoiceInfo {
  found: boolean;
  custom: boolean;
  path: string;
  packId: string;
  name: string;
  language: string;
  author: string;
  version: string;
  phrases: number;
  files: number;
  active: boolean;
  packsDir: string;
  error: string | null;
}

interface InstalledPack {
  id: string;
  name: string;
  language: string;
  author: string;
  version: string;
  path: string;
  phrases: number;
  files: number;
}

interface CatalogEntry {
  key: string;
  files: number;
  used: boolean;
  trigger_tr: string;
  trigger_en: string;
  say_tr: string;
  say_en: string;
}

const TESTS: { key: string; label: string; spotter?: boolean }[] = [
  { key: "radio", label: "Telsiz testi" },
  { key: "car_left", label: "Solda araç", spotter: true },
  { key: "car_right", label: "Sağda araç", spotter: true },
  { key: "three_wide", label: "Ortadasın", spotter: true },
  { key: "clear", label: "Temiz", spotter: true },
  { key: "green", label: "Yeşil bayrak" },
  { key: "position", label: "Sıra (P5)" },
  { key: "laps_left", label: "5 tur kaldı" },
  { key: "last_lap", label: "Son tur" },
  { key: "gap", label: "Ara 1,3 sn" },
  { key: "laptime", label: "Tur 1:23.4" },
  { key: "pb", label: "Kişisel rekor" },
  { key: "fuel", label: "Yakıt tüketimi" },
  { key: "fuel_add", label: "Eklenecek yakıt" },
  { key: "yellow", label: "Sarı bayrak" },
  { key: "blue", label: "Mavi bayrak" },
  { key: "limiter", label: "Pit limiti" },
  { key: "rain", label: "Yağmur" },
  { key: "temps", label: "Pist sıcaklığı" },
  { key: "sof", label: "SoF 2345" },
  { key: "won", label: "Kazandın" },
];

const SESSIONS: { id: keyof VoiceSettings["sessions"]; label: string }[] = [
  { id: "race", label: "Yarış" },
  { id: "qualify", label: "Sıralama" },
  { id: "practice", label: "Antrenman" },
];

const CATALOG_LIMIT = 150;

export function VoicePage() {
  const v = () => settings().general.voice;
  const set = (fn: (x: VoiceSettings) => void) => updateSettings((d) => fn(d.general.voice));
  const [info, { refetch }] = createResource(
    () => [v().pack, v().customDir, v().enabled] as const,
    () => invoke<VoiceInfo>("voice_info").catch((e) => ({ error: String(e) }) as VoiceInfo),
  );
  const [outputs] = createResource(() => invoke<string[]>("livechat_audio_outputs").catch(() => [] as string[]));
  const [packs, { refetch: refetchPacks }] = createResource(() => invoke<InstalledPack[]>("voice_packs_installed").catch(() => [] as InstalledPack[]));
  const [msg, setMsg] = createSignal("");
  const [dir, setDir] = createSignal(v().customDir);
  const locked = () => proLocked(VOICE_FEATURE);
  const proOnly = () => requiresPro(VOICE_FEATURE);

  const refresh = () => {
    refetch();
    refetchPacks();
  };

  const status = createMemo(() => {
    const i = info();
    if (locked()) return { cls: "off", text: "PRO gerekli" };
    if (!v().enabled) return { cls: "off", text: "Kapalı" };
    if (i && !i.found) return { cls: "warn", text: "Ses paketi yok" };
    if (appState().connected) return { cls: "on", text: "Dinliyor ve konuşuyor" };
    return { cls: "wait", text: "Oturum bekleniyor" };
  });

  const test = async (key: string) => {
    setMsg("");
    try {
      await invoke("voice_test", { key });
    } catch (e) {
      setMsg(String(e));
    }
  };

  const openDir = (path?: string) => invoke("voice_packs_open_dir", { path: path ?? null }).catch((e) => setMsg(String(e)));

  const applyDir = (value: string) => {
    setDir(value);
    set((x) => (x.customDir = value.trim()));
  };

  // ---------------------------------------------------------------- ifade kataloğu
  const [showCatalog, setShowCatalog] = createSignal(false);
  const [catalog] = createResource(showCatalog, () => invoke<CatalogEntry[]>("voice_catalog").catch(() => [] as CatalogEntry[]));
  const [query, setQuery] = createSignal("");
  const [filter, setFilter] = createSignal<"used" | "unused" | "all">("used");
  const tr = () => localeTag().toLowerCase().startsWith("tr");
  const catalogStats = createMemo(() => {
    const c = catalog() ?? [];
    return { total: c.length, used: c.filter((x) => x.used).length };
  });
  const rows = createMemo(() => {
    const q = query().trim().toLowerCase();
    const f = filter();
    return (catalog() ?? []).filter(
      (x) =>
        (f === "all" || (f === "used") === x.used) &&
        (!q || x.key.toLowerCase().includes(q) || x.say_tr.toLowerCase().includes(q) || x.say_en.toLowerCase().includes(q)),
    );
  });

  return (
    <div class="page narrow voice-page">
      <section class="panel voice-hero">
        <div class="voice-hero-ic">
          <I.Mic />
        </div>
        <div class="voice-hero-text">
          <h3>
            Sesli mühendis ve spotter
            <Show when={proOnly()}>
              {" "}
              <span class="pro-badge">PRO</span>
            </Show>
          </h3>
          <p class="muted">
            SRTR Pitwall'un kendi yarış mühendisi: yanında araç olduğunda spotter uyarır; mühendis bayrakları, sıranı, kalan
            turu ve süreyi, aralarını, tur zamanlarını, yakıtı, pit penceresini, lastikleri, motoru, hava durumunu ve rakiplerin
            pit stoplarını söyler. Crew Chief kurmana gerek yok.
          </p>
        </div>
        <div class={`voice-status ${status().cls}`}>
          <span class="dot" />
          {status().text}
        </div>
      </section>

      <Show when={locked()}>
        <section class="panel warn-panel">
          <p>
            <span class="pro-badge">PRO</span> Yarışta konuşan sesli mühendis PRO üyelere özel: ayarlar açık görünür ama PRO
            olmadan çalışmaz ve değiştirilemez. Ses paketlerini indirip aşağıdaki "Dene" bölümünden sesleri dinleyebilirsin.{" "}
            <button class="link" onClick={() => go("pro")}>
              PRO'ya bak
            </button>
          </p>
        </section>
      </Show>

      <section class="panel">
        <div class="row">
          <div>
            <b>Sesli mühendis açık</b>
            <small>
              Ayrıca başlatman gerekmez: iRacing, ACC, AC, LMU, rFactor 2 ya da AMS2'de canlı bir oturum algılanınca kendiliğinden
              konuşmaya başlar, oturum bitince susar.
            </small>
          </div>
          <Switch checked={v().enabled} disabled={locked()} onChange={(on) => set((x) => (x.enabled = on))} />
        </div>
        <div classList={{ "pro-locked-body": locked() }} inert={locked()}>
        <div class="voice-sliders">
          <div class="f2">
            <div class="f2-cap">Mühendis ses düzeyi</div>
            <Slider value={v().volume} min={0} max={100} step={5} unit="%" onInput={(n) => set((x) => (x.volume = n))} />
          </div>
          <div class="f2">
            <div class="f2-cap">Spotter ses düzeyi</div>
            <Slider value={v().spotterVolume} min={0} max={100} step={5} unit="%" onInput={(n) => set((x) => (x.spotterVolume = n))} />
          </div>
        </div>
        <div class="row">
          <div>
            <b>Ses çıkış cihazı</b>
            <small>Mühendis ve spotter sesinin çalacağı hoparlör / kulaklık. Bir sonraki konuşmadan itibaren geçerli olur.</small>
          </div>
          <select class="f2-select" style={{ "max-width": "320px" }} value={v().device ?? ""} onChange={(e) => set((x) => (x.device = e.currentTarget.value))}>
            <option value="">{t("Windows varsayılanı")}</option>
            <Show when={v().device && !(outputs() ?? []).includes(v().device)}>
              <option value={v().device} selected data-no-i18n>
                {v().device}
              </option>
            </Show>
            <For each={outputs() ?? []}>
              {(d) => (
                <option value={d} selected={d === v().device} data-no-i18n>
                  {d}
                </option>
              )}
            </For>
          </select>
        </div>
        <div class="row">
          <div>
            <b>Hangi oturumlarda konuşsun</b>
            <small>Spotter ve mühendis sadece seçili oturum türlerinde konuşur.</small>
          </div>
          <div class="seg small">
            <For each={SESSIONS}>
              {(s) => (
                <button classList={{ on: v().sessions[s.id] }} onClick={() => set((x) => (x.sessions[s.id] = !x.sessions[s.id]))}>
                  {s.label}
                </button>
              )}
            </For>
          </div>
        </div>
        <div class="row">
          <div>
            <b>Virajlarda sessiz</b>
            <small>Direksiyon çevriliyken ya da sert frenlerken önemsiz mesajlar bekler; spotter ve acil uyarılar yine söylenir.</small>
          </div>
          <Switch checked={v().quietInCorners} onChange={(on) => set((x) => (x.quietInCorners = on))} />
        </div>
        <div class="row">
          <div>
            <b>Argo ifadeler</b>
            <small>Ses paketindeki argo (sweary) kayıtlar da çalınsın; kazadan sonra söylenmeler de açılır.</small>
          </div>
          <Switch checked={v().sweary} onChange={(on) => set((x) => (x.sweary = on))} />
        </div>
        <div class="row">
          <div>
            <b>Ovallerde iç / dış de</b>
            <small>Sol/sağ yerine "içte araç", "dışta araç".</small>
          </div>
          <Switch checked={v().ovalInsideOutside} onChange={(on) => set((x) => (x.ovalInsideOutside = on))} />
        </div>
        </div>
      </section>

      {/* Sesli komut (bas-konuş): components/VoiceCommands.tsx */}
      <VoiceCommandsSection />

      <section class="panel">
        <div class="voice-panel-head">
          <h3>Ses paketi</h3>
          <button class="btn ghost small" onClick={refresh}>
            <I.RefreshCw /> Yenile
          </button>
        </div>
        <Show
          when={info()?.found}
          fallback={
            <div class="voice-empty">
              <I.Volume2 />
              <div>
                <b>{v().customDir ? "Seçtiğin klasörde ses paketi bulunamadı" : "Henüz kurulu ses paketi yok"}</b>
                <small>
                  Ses paketleri uygulamanın veri klasöründeki "voicepacks" klasörüne kurulur. Kendi sesini kaydettiysen aşağıya o
                  klasörün yolunu yaz.
                </small>
              </div>
            </div>
          }
        >
          <div class="voice-pack-card">
            <div class="voice-pack-main">
              <b>{info()!.name || info()!.packId || "Ses paketi"}</b>
              <small>
                {[info()!.language && info()!.language.toUpperCase(), info()!.author, info()!.version && `v${info()!.version}`].filter(Boolean).join(" · ")}
              </small>
              <small class="voice-path" title={info()!.path}>
                {info()!.path}
              </small>
            </div>
            <div class="voice-pack-stats">
              <span title="İfade: mühendisin söyleyebildiği bir cümle (paketteki bir klasör). Aynı ifadenin birden fazla ses kaydı olabilir.">
                <b>{info()!.phrases}</b> ifade
              </span>
              <span title="Bu paketteki ses dosyalarının toplam sayısı">
                {t("bu pakette toplam {0} ses kaydı (dosya) var", info()!.files)}
              </span>
            </div>
            <button class="btn ghost small" onClick={() => openDir(info()!.path)}>
              <I.FolderOpen /> Aç
            </button>
          </div>
        </Show>

        <Show when={(packs() ?? []).length > 1 && !v().customDir}>
          <div class="row">
            <div>
              <b>Kullanılan paket</b>
              <small>Birden fazla paket kurulu.</small>
            </div>
            <select class="f2-select" value={v().pack} onChange={(e) => set((x) => (x.pack = e.currentTarget.value))}>
              <option value="">İlk kurulu paket</option>
              <For each={packs()}>{(p) => <option value={p.id}>{p.name + (p.language ? ` (${p.language.toUpperCase()})` : "")}</option>}</For>
            </select>
          </div>
        </Show>

        {/* Ses paketleri (indir / güncelle / kullan / kaldır) ve kendi dilinde paket yapma: components/VoicePacks.tsx */}
        <VoicePacksSection onChanged={refresh} />

        <div class="row">
          <div>
            <b>Kendi kaydın / özel klasör</b>
            <small>
              Crew Chief düzeninde kendi sesini kaydettiysen klasörünü göster (içinde spotter, numbers, position… klasörleri olan
              klasör ya da bir üstü). Doluysa kurulu paketlerin yerine bu kullanılır.
            </small>
          </div>
        </div>
        <div class="voice-dir">
          <input
            class="input"
            placeholder="Örn. D:\Sesler\Erkin Azcan"
            value={dir()}
            onInput={(e) => setDir(e.currentTarget.value)}
            onChange={(e) => applyDir(e.currentTarget.value)}
          />
          <Show when={v().customDir}>
            <button class="btn ghost small" onClick={() => applyDir("")}>
              Temizle
            </button>
          </Show>
          <button class="btn ghost small" onClick={() => openDir()}>
            <I.FolderOpen /> Paket klasörü
          </button>
        </div>
        <Show when={info()?.error && !info()?.found}>
          <p class="error">{info()!.error}</p>
        </Show>
      </section>

      <section class="panel">
        <h3>Ne söylesin</h3>
        <div class="voice-groups" classList={{ "pro-locked-body": locked() }} inert={locked()}>
          <For each={VOICE_CATEGORIES}>
            {(c) => (
              <label class="voice-group" classList={{ off: v().categories[c.id] === false }}>
                <div>
                  <b>{c.name}</b>
                  <small>{c.desc}</small>
                </div>
                <Switch checked={v().categories[c.id] !== false} onChange={(on) => set((x) => (x.categories[c.id] = on))} />
              </label>
            )}
          </For>
        </div>
      </section>

      <section class="panel">
        <h3>Dene</h3>
        <p class="muted small">Seçili ses paketinden örnek cümleler çalar (yarışta değilken de). Herkese açık: PRO olmadan da sesleri dinleyebilirsin.</p>
        <div class="voice-tests">
          <For each={TESTS}>
            {(x) => (
              <button class="btn ghost small" classList={{ spot: !!x.spotter }} disabled={!info()?.found} onClick={() => test(x.key)}>
                <I.Volume2 /> {x.label}
              </button>
            )}
          </For>
        </div>
        <Show when={msg()}>
          <p class="error">{msg()}</p>
        </Show>
      </section>

      <section class="panel">
        <div class="voice-panel-head">
          <h3>İfade listesi</h3>
          <button class="btn ghost small" onClick={() => setShowCatalog(!showCatalog())}>
            {showCatalog() ? "Gizle" : "Göster"}
          </button>
        </div>
        <p class="muted small">
          Ses paketindeki her klasörün ne zaman çaldığı ve ne söylenmesi gerektiği. Kendi sesini kaydederken rehber olarak
          kullanabilirsin.
        </p>
        <Show when={showCatalog()}>
          <Show when={catalog()} fallback={<p class="muted">Yükleniyor…</p>}>
            <p class="muted small">{t("{0} ifadenin {1} tanesini mühendis kullanıyor.", catalogStats().total, catalogStats().used)}</p>
            <div class="voice-cat-tools">
              <input class="input" placeholder="Ara: flags/yellow, yakıt…" value={query()} onInput={(e) => setQuery(e.currentTarget.value)} />
              <div class="seg small">
                <button classList={{ on: filter() === "used" }} onClick={() => setFilter("used")}>
                  Kullanılan
                </button>
                <button classList={{ on: filter() === "unused" }} onClick={() => setFilter("unused")}>
                  Kullanılmayan
                </button>
                <button classList={{ on: filter() === "all" }} onClick={() => setFilter("all")}>
                  Hepsi
                </button>
              </div>
            </div>
            <div class="voice-cat">
              <For each={rows().slice(0, CATALOG_LIMIT)}>
                {(x) => (
                  <div class="voice-cat-row" classList={{ unused: !x.used }}>
                    <button class="icon-btn" title="Çal" disabled={!info()?.found} onClick={() => test(x.key)}>
                      <I.Volume2 />
                    </button>
                    <div>
                      <div class="voice-cat-key">
                        <code>{x.key}</code>
                        <span class="muted small">{x.files}</span>
                      </div>
                      <div class="voice-cat-say">"{tr() ? x.say_tr : x.say_en}"</div>
                      <small>{tr() ? x.trigger_tr : x.trigger_en}</small>
                    </div>
                  </div>
                )}
              </For>
            </div>
            <Show when={rows().length > CATALOG_LIMIT}>
              <p class="muted small">{t("İlk {0} sonuç gösteriliyor ({1} sonuç). Aramayı daralt.", CATALOG_LIMIT, rows().length)}</p>
            </Show>
          </Show>
        </Show>
      </section>
    </div>
  );
}
