// Ses paketleri (Sesli Mühendis sayfası):
// 1) Sunucudaki ses paketleri listesi (c39 voice_packs) + kurulu paketler: İndir (ilerleme, iptal), Güncelle (sunucudaki
//    sürüm kuruludan büyükse), Kullan (general.voice.pack), Kaldır. Dile göre süzme.
//    Rust: voice_pack_install / voice_pack_cancel / voice_pack_remove, "voicepack-progress" olayı.
// 2) "Kendi dilinde ses paketi yap": şablon (voice_pack_template), kayıt ipuçları, eksik kontrolü (voice_pack_check,
//    voice_test_dir ile deneme, customDir ile oyunda deneme), paket oluşturma (voice_pack_build, WAV → OGG) ve
//    "Paketimi gönder" formu (voice_pack_submit) + gönderilerimin durumu.

import { For, Show, createMemo, createResource, createSignal, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { settings, updateSettings } from "@/sdk/settings";
import { F, proLocked, VOICE_FEATURE } from "@/sdk/proFeatures";
import { ProLockNote, ProLockTag } from "./ProLock";
import { LANGS, localeTag, t } from "@/sdk/i18n";
import { Flag } from "@/sdk/Flag";
import { session } from "@/cloud/supabase";
import {
  fmtBytes,
  languageFlag,
  languageName,
  listVoicePacks,
  mySubmissions,
  submitVoicePack,
  SUBMISSION_STATUS,
  type VoicePackRow,
} from "@/cloud/voicepacks";
import { Switch } from "./SettingsForm";
import { go } from "../ui";
import * as I from "../icons";

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

interface Progress {
  id: string;
  received: number;
  total: number;
  stage: "download" | "verify" | "extract" | "done" | "error";
  error?: string;
}

interface PackMeta {
  id: string;
  name: string;
  language: string;
  author: string;
  version: string;
  format: string;
}

interface CatReport {
  name: string;
  required: number;
  recorded: number;
  optional: number;
  optionalRecorded: number;
  missing: string[];
  extra: string[];
}

interface CheckReport {
  root: string;
  meta: PackMeta | null;
  required: number;
  recorded: number;
  optional: number;
  optionalRecorded: number;
  files: number;
  categories: CatReport[];
  extraCategories: string[];
  invalid: string[];
  warnings: string[];
  recordedKeys: string[];
}

interface BuildResult {
  path: string;
  size: number;
  sha256: string;
  phrases: number;
  files: number;
  inputBytes: number;
  converted: number;
  warnings: string[];
}

interface BuildProgress {
  done: number;
  total: number;
  stage: "scan" | "convert" | "zip" | "done" | "error";
  error?: string;
}

/** Kurulu sürüm ("2", "v2", "1.0") → sayı */
const verNum = (v: string | number | undefined) => {
  const m = /\d+/.exec(String(v ?? ""));
  return m ? Number(m[0]) : 0;
};

/** Dosya yolunun klasörü */
const parentDir = (p: string) => p.replace(/[\\/][^\\/]*$/, "");

const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

export function VoicePacksSection(props: { onChanged?: () => void }) {
  const v = () => settings().general.voice;
  const [remote, { refetch: refetchRemote }] = createResource(() => listVoicePacks().catch(() => [] as VoicePackRow[]));
  const [installed, { refetch: refetchInstalled }] = createResource(() =>
    invoke<InstalledPack[]>("voice_packs_installed").catch(() => [] as InstalledPack[]),
  );
  const [progress, setProgress] = createSignal<Record<string, Progress>>({});
  const [msg, setMsg] = createSignal("");
  const [lang, setLang] = createSignal<string>("");
  const locked = () => proLocked(VOICE_FEATURE);

  const un = listen<Progress>("voicepack-progress", (e) => {
    const p = e.payload;
    setProgress((m) => ({ ...m, [p.id]: p }));
  });
  onCleanup(() => un.then((f) => f()));

  const changed = () => {
    refetchInstalled();
    props.onChanged?.();
  };

  const byId = createMemo(() => new Map((installed() ?? []).map((p) => [p.id, p])));

  /** Sunucudaki + sadece yerelde kurulu paketler */
  const rows = createMemo(() => {
    const r = (remote() ?? []).map((p) => ({ remote: p as VoicePackRow | null, id: p.id, name: p.name, language: p.language, author: p.author }));
    const ids = new Set(r.map((x) => x.id));
    for (const p of installed() ?? []) {
      if (!ids.has(p.id)) r.push({ remote: null, id: p.id, name: p.name || p.id, language: p.language, author: p.author });
    }
    return r;
  });
  const languages = createMemo(() => [...new Set(rows().map((r) => r.language).filter(Boolean))].sort());
  const visible = () => rows().filter((r) => !lang() || r.language === lang());
  const activeId = () => {
    if (v().customDir) return "";
    const list = installed() ?? [];
    if (v().pack && list.some((p) => p.id === v().pack)) return v().pack;
    return list[0]?.id ?? "";
  };

  const busy = (id: string) => {
    const p = progress()[id];
    return !!p && p.stage !== "done" && p.stage !== "error";
  };

  const install = async (p: VoicePackRow) => {
    setMsg("");
    setProgress((m) => ({ ...m, [p.id]: { id: p.id, received: 0, total: p.size_bytes, stage: "download" } }));
    try {
      await invoke("voice_pack_install", {
        url: p.url,
        id: p.id,
        expectedSha256: p.sha256 || null,
        expectedSize: p.size_bytes > 0 ? p.size_bytes : null,
      });
      // İlk paket ya da seçili paket kurulu değilse bunu kullan
      const list = installed() ?? [];
      if (!v().pack || !list.some((x) => x.id === v().pack)) updateSettings((d) => (d.general.voice.pack = p.id));
      changed();
    } catch (e) {
      const s = String(e);
      if (!s.includes("İptal")) setMsg(t("{0}: {1}", p.name, s));
      setProgress((m) => ({ ...m, [p.id]: { id: p.id, received: 0, total: 0, stage: "error", error: s } }));
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(t('"{0}" ses paketi silinsin mi?', name))) return;
    try {
      await invoke("voice_pack_remove", { id });
      if (v().pack === id) updateSettings((d) => (d.general.voice.pack = ""));
      changed();
    } catch (e) {
      setMsg(String(e));
    }
  };

  const use = (id: string) => {
    updateSettings((d) => {
      d.general.voice.pack = id;
      d.general.voice.customDir = "";
    });
    props.onChanged?.();
  };

  const stageText = (p: Progress) =>
    p.stage === "download"
      ? p.total > 0
        ? t("İndiriliyor… {0} / {1}", fmtBytes(p.received), fmtBytes(p.total))
        : t("İndiriliyor… {0}", fmtBytes(p.received))
      : p.stage === "verify"
        ? t("Doğrulanıyor…")
        : t("Kuruluyor…");

  return (
    <div class="vp">
      <div class="voice-panel-head vp-head">
        <h3>Ses paketleri</h3>
        <div class="vp-tools">
          <Show when={languages().length > 1}>
            <select class="f2-select" value={lang()} onChange={(e) => setLang(e.currentTarget.value)}>
              <option value="">Tüm diller</option>
              <For each={languages()}>{(l) => <option value={l}>{languageName(l, localeTag())}</option>}</For>
            </select>
          </Show>
          <button
            class="btn ghost small"
            onClick={() => {
              refetchRemote();
              refetchInstalled();
            }}
          >
            <I.RefreshCw /> Yenile
          </button>
        </div>
      </div>
      <Show when={locked()}>
        <p class="muted small">
          Ses paketlerini indirip sesleri "Dene" bölümünden dinleyebilirsin; yarışta konuşan mühendis PRO üyelere özel.{" "}
          <button class="link" onClick={() => go("pro")}>
            PRO'ya bak
          </button>
        </p>
      </Show>
      <Show when={!remote.loading} fallback={<p class="muted small">Yükleniyor…</p>}>
        <Show when={visible().length} fallback={<p class="muted small">Henüz indirilebilir ses paketi yok.</p>}>
          <div class="vp-list">
            <For each={visible()}>
              {(r) => {
                const inst = () => byId().get(r.id);
                const p = () => progress()[r.id];
                const update = () => !!r.remote && !!inst() && r.remote.version > verNum(inst()!.version);
                const active = () => activeId() === r.id;
                return (
                  <div class="vp-row" classList={{ active: active() }}>
                    <Flag code={languageFlag(r.language)} class="vp-flag" />
                    <div class="vp-main">
                      <div class="vp-title">
                        <b data-no-i18n>{r.name}</b>
                        <Show when={active()}>
                          <span class="vp-chip ok">Kullanılıyor</span>
                        </Show>
                        <Show when={update()}>
                          <span class="vp-chip warn">Güncelleme var</span>
                        </Show>
                        <Show when={r.remote && !r.remote.published}>
                          <span class="vp-chip bad">Yayında değil</span>
                        </Show>
                        <Show when={!r.remote}>
                          <span class="vp-chip">Yerel</span>
                        </Show>
                      </div>
                      <small class="muted">
                        {languageName(r.language || "?", localeTag())}
                        <Show when={r.author}>
                          {" · "}
                          <span data-no-i18n>{r.author}</span>
                        </Show>
                        <Show when={r.remote}>
                          {" · "}v{r.remote!.version} · {fmtBytes(r.remote!.size_bytes)}
                          <Show when={r.remote!.phrases}> · {t("{0} ifade", r.remote!.phrases)}</Show>
                        </Show>
                        <Show when={inst()}>
                          {" · "}
                          {t("Kurulu: v{0}", inst()!.version || "?")}
                        </Show>
                      </small>
                      <Show when={r.remote?.notes}>
                        <small class="muted" data-no-i18n>
                          {r.remote!.notes}
                        </small>
                      </Show>
                      <Show when={p() && busy(r.id)}>
                        <div class="vp-progress">
                          <div class="vp-bar">
                            <i
                              classList={{ indet: p()!.total <= 0 || p()!.stage === "verify" }}
                              style={{ width: `${p()!.total > 0 ? pct(p()!.received, p()!.total) : 100}%` }}
                            />
                          </div>
                          <small class="muted">{stageText(p()!)}</small>
                        </div>
                      </Show>
                    </div>
                    <div class="vp-actions">
                      <Show
                        when={!busy(r.id)}
                        fallback={
                          <button class="btn ghost small" onClick={() => invoke("voice_pack_cancel", { id: r.id })}>
                            <I.X /> İptal
                          </button>
                        }
                      >
                        <Show when={r.remote && !inst()}>
                          <button class="btn small" onClick={() => install(r.remote!)}>
                            <I.Download /> İndir
                          </button>
                        </Show>
                        <Show when={update()}>
                          <button class="btn small" onClick={() => install(r.remote!)}>
                            <I.RefreshCw /> Güncelle
                          </button>
                        </Show>
                        <Show when={inst() && !active()}>
                          <button class="btn ghost small" onClick={() => use(r.id)}>
                            <I.Check /> Kullan
                          </button>
                        </Show>
                        <Show when={inst()}>
                          <button class="icon-btn" title="Klasörü aç" onClick={() => invoke("voice_packs_open_dir", { path: inst()!.path })}>
                            <I.FolderOpen />
                          </button>
                          <button class="icon-btn" title="Kaldır" onClick={() => remove(r.id, r.name)}>
                            <I.Trash />
                          </button>
                        </Show>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
      <Show when={msg()}>
        <p class="error" data-no-i18n>
          {msg()}
        </p>
      </Show>
      <AuthorTools onChanged={props.onChanged} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kendi dilinde ses paketi yap
// ---------------------------------------------------------------------------

async function pickFolder(title: string): Promise<string | null> {
  try {
    const r = await openDialog({ directory: true, multiple: false, title });
    return typeof r === "string" ? r : null;
  } catch {
    return null;
  }
}

function AuthorTools(props: { onChanged?: () => void }) {
  const [open, setOpen] = createSignal(false);
  const [dir, setDir] = createSignal("");
  const [tplLang, setTplLang] = createSignal("");
  const [tplMsg, setTplMsg] = createSignal("");
  const [err, setErr] = createSignal("");

  // ---- 1) şablon
  const makeTemplate = async () => {
    setErr("");
    setTplMsg("");
    const l = tplLang().trim();
    if (!l) return setErr(t("Önce dili seç ya da yaz (ör. de, fr, pt-BR)."));
    const out = await pickFolder(t("Şablonun oluşturulacağı klasörü seç"));
    if (!out) return;
    try {
      const r = await invoke<{ path: string; phrases: number; optional: number }>("voice_pack_template", { outDir: out, language: l });
      setDir(r.path);
      setTplMsg(t("Şablon hazır: {0} ifade klasörü ({1} tanesi isteğe bağlı).", r.phrases, r.optional));
    } catch (e) {
      setErr(String(e));
    }
  };

  // ---- 3) eksik kontrolü
  const [report, setReport] = createSignal<CheckReport | null>(null);
  const [checking, setChecking] = createSignal(false);
  const [openCat, setOpenCat] = createSignal<string | null>(null);
  const [testKey, setTestKey] = createSignal("");
  const [testMsg, setTestMsg] = createSignal("");
  const runCheck = async () => {
    setErr("");
    if (!dir().trim()) return setErr(t("Önce kayıt klasörünü seç."));
    setChecking(true);
    try {
      const r = await invoke<CheckReport>("voice_pack_check", { dir: dir().trim() });
      setReport(r);
      setTestKey(r.recordedKeys[0] ?? "");
      if (r.meta) {
        setMeta((m) => ({
          ...m,
          id: r.meta!.id || m.id,
          name: r.meta!.name || m.name,
          language: r.meta!.language || m.language,
          author: r.meta!.author || m.author,
          version: r.meta!.version || m.version,
        }));
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setChecking(false);
    }
  };
  const missingText = () =>
    (report()?.categories ?? [])
      .flatMap((c) => c.missing)
      .join("\n");
  const copyMissing = () => navigator.clipboard?.writeText(missingText()).catch(() => {});
  const testPlay = async () => {
    setTestMsg("");
    try {
      await invoke("voice_test_dir", { dir: dir().trim(), key: testKey() });
    } catch (e) {
      setTestMsg(String(e));
    }
  };
  const testing = () => !!dir().trim() && settings().general.voice.customDir === dir().trim();
  const setTesting = (on: boolean) => {
    updateSettings((d) => (d.general.voice.customDir = on ? dir().trim() : ""));
    props.onChanged?.();
  };

  // ---- 4) paket oluştur
  const [meta, setMeta] = createSignal({ id: "", name: "", language: "", author: "", version: "1" });
  const [convert, setConvert] = createSignal(true);
  const [building, setBuilding] = createSignal<BuildProgress | null>(null);
  const [built, setBuilt] = createSignal<BuildResult | null>(null);
  const unb = listen<BuildProgress>("voicepack-build-progress", (e) => setBuilding(e.payload.stage === "done" || e.payload.stage === "error" ? null : e.payload));
  onCleanup(() => unb.then((f) => f()));
  const setM = (k: keyof ReturnType<typeof meta>, val: string) => setMeta((m) => ({ ...m, [k]: val }));
  const build = async () => {
    setErr("");
    setBuilt(null);
    const m = meta();
    if (!dir().trim()) return setErr(t("Önce kayıt klasörünü seç."));
    if (!m.id.trim() || !m.name.trim() || !m.language.trim()) return setErr(t("Paket kimliği, adı ve dili gerekli."));
    let out: string | null = null;
    try {
      out = await saveDialog({
        title: t("Ses paketini kaydet"),
        defaultPath: `${m.id.trim()}-v${m.version.trim() || "1"}.zip`,
        filters: [{ name: "Zip", extensions: ["zip"] }],
      });
    } catch {
      out = null;
    }
    if (!out) return;
    if (!/\.zip$/i.test(out)) out += ".zip";
    setBuilding({ done: 0, total: 0, stage: "scan" });
    try {
      const r = await invoke<BuildResult>("voice_pack_build", { srcDir: dir().trim(), outPath: out, meta: m, convert: convert() });
      setBuilt(r);
    } catch (e) {
      if (!String(e).includes("İptal")) setErr(String(e));
    } finally {
      setBuilding(null);
    }
  };

  // ---- 5) gönder
  const [sub, setSub] = createSignal({ language: "", name: "", link: "", message: "" });
  const [sending, setSending] = createSignal(false);
  const [sent, setSent] = createSignal("");
  const [mine, { refetch: refetchMine }] = createResource(
    () => (open() && session() ? session()!.user.id : false),
    () => mySubmissions().catch(() => []),
  );
  const send = async () => {
    setErr("");
    setSent("");
    const s = sub();
    if (!s.language.trim() || !s.name.trim()) return setErr(t("Dili ve paket adını yaz."));
    if (!/^https:\/\/\S+$/i.test(s.link.trim())) return setErr(t("Geçerli bir https:// bağlantısı yaz (WeTransfer, Google Drive…)."));
    setSending(true);
    try {
      await submitVoicePack(s.language, s.name, s.link, s.message);
      setSub({ language: "", name: "", link: "", message: "" });
      setSent(t("Gönderildi, teşekkürler! İnceleme sonucu burada ve bildirimlerde görünecek."));
      refetchMine();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setSending(false);
    }
  };

  const DirPicker = () => (
    <div class="voice-dir">
      <input class="input" placeholder="Kayıt klasörü (ör. D:\Sesler\de-sablon)" value={dir()} onChange={(e) => setDir(e.currentTarget.value.trim())} />
      <button
        class="btn ghost small"
        onClick={async () => {
          const d = await pickFolder(t("Kayıt klasörünü seç"));
          if (d) setDir(d);
        }}
      >
        <I.FolderOpen /> Klasör seç
      </button>
      <Show when={dir()}>
        <button class="btn ghost small" onClick={() => invoke("voice_packs_open_dir", { path: dir() }).catch((e) => setErr(String(e)))}>
          <I.ExternalLink /> Aç
        </button>
      </Show>
    </div>
  );

  return (
    <div class="vp-author">
      <button class="vp-author-toggle" onClick={() => setOpen(!open())}>
        <I.Mic />
        <div>
          <b>Kendi dilinde ses paketi yap</b>
          <small>Şablonu indir, kendi sesinle kaydet, eksiklerini kontrol et, paketi oluştur ve bize gönder.</small>
        </div>
        <span class="vp-caret" classList={{ open: open() }}>
          <I.ChevronDown />
        </span>
      </button>
      <Show when={open()}>
        <div class="vp-steps">
          {/* 1 */}
          <div class="vp-step">
            <div class="vp-num">1</div>
            <div class="vp-step-body">
              <b>Şablonu indir</b>
              <small>
                Mühendisin kullandığı her ifade için bir klasör oluşturulur. Her klasördeki METIN.txt ne söylemen gerektiğini (Türkçe
                ve İngilizce örnekle), ne zaman çaldığını ve kaç kayıt önerildiğini yazar.
              </small>
              <div class="vp-inline">
                <input class="input vp-lang" list="vp-langs" placeholder="Dil kodu (ör. de)" value={tplLang()} onInput={(e) => setTplLang(e.currentTarget.value)} />
                <datalist id="vp-langs">
                  <For each={LANGS}>{(l) => <option value={l.code}>{l.name}</option>}</For>
                </datalist>
                <button class="btn small" onClick={makeTemplate}>
                  <I.Download /> Klasör seç ve şablonu oluştur
                </button>
              </div>
              <Show when={tplMsg()}>
                <small class="vp-ok">{tplMsg()}</small>
                <small class="voice-path" data-no-i18n>
                  {dir()}
                </small>
              </Show>
            </div>
          </div>
          {/* 2 */}
          <div class="vp-step">
            <div class="vp-num">2</div>
            <div class="vp-step-body">
              <b>Kayıtları yap</b>
              <ul class="vp-tips">
                <li>Her ifade klasörüne kayıtlarını 1.wav, 2.wav, 3.wav … adıyla koy (aynı cümlenin farklı tonları).</li>
                <li>WAV, mono, 44.1 kHz ya da 48 kHz, 16 bit. Müzik, efekt ve arka plan gürültüsü olmasın.</li>
                <li>Tüm kayıtlarda ses düzeyi aynı olsun; başta ve sonda uzun sessizlik bırakma.</li>
                <li>numbers klasöründe her klasör tek bir sayıdır. Önce zorunlu sayıları kaydet (numbers/OKUBENI.txt).</li>
                <li>Kaydetmediğin ifadeler söylenmez; eksiklerle de paketi deneyebilirsin.</li>
              </ul>
              <DirPicker />
            </div>
          </div>
          {/* 3 */}
          <div class="vp-step">
            <div class="vp-num">3</div>
            <div class="vp-step-body">
              <b>Eksik kontrolü</b>
              <small>Klasördeki kayıtları mühendisin kullandığı ifadelerle karşılaştırır; eksikleri ve hatalı dosyaları gösterir.</small>
              <div class="vp-inline">
                <button class="btn small" disabled={checking() || !dir()} onClick={runCheck}>
                  <I.Search /> {checking() ? t("Kontrol ediliyor…") : t("Kontrol et")}
                </button>
                <Show when={dir()}>
                  <button class="btn ghost small" onClick={() => setTesting(!testing())}>
                    <I.Play /> {testing() ? t("Oyunda denemeyi bitir") : t("Bu klasörü dene")}
                  </button>
                </Show>
              </div>
              <Show when={testing()}>
                <small class="muted">
                  Mühendis şu an bu klasördeki kayıtları kullanıyor (özel klasör). Bitince "Oyunda denemeyi bitir" ile kurulu pakete dön.
                </small>
              </Show>
              <Show when={report()}>
                {(r) => (
                  <div class="vp-report">
                    <div class="vp-report-head">
                      <b class="vp-big">%{pct(r().recorded, r().required)}</b>
                      <div>
                        <div>{t("{0} / {1} zorunlu ifade kaydedildi", r().recorded, r().required)}</div>
                        <small class="muted">
                          {t("İsteğe bağlı: {0} / {1} · Toplam {2} kayıt", r().optionalRecorded, r().optional, r().files)}
                        </small>
                      </div>
                    </div>
                    <div class="vp-bar">
                      <i style={{ width: `${pct(r().recorded, r().required)}%` }} />
                    </div>
                    <div class="vp-cats">
                      <For each={r().categories}>
                        {(c) => (
                          <div class="vp-cat">
                            <button class="vp-cat-row" onClick={() => setOpenCat(openCat() === c.name ? null : c.name)}>
                              <code>{c.name}</code>
                              <span class="vp-mini">
                                <i style={{ width: `${pct(c.recorded, c.required)}%` }} />
                              </span>
                              <span class="muted small">
                                {c.recorded}/{c.required}
                                <Show when={c.optional}>
                                  {" "}
                                  (+{c.optionalRecorded}/{c.optional})
                                </Show>
                              </span>
                              <Show when={c.missing.length}>
                                <span class="vp-chip warn">{t("{0} eksik", c.missing.length)}</span>
                              </Show>
                              <Show when={c.extra.length}>
                                <span class="vp-chip">{t("{0} bilinmeyen", c.extra.length)}</span>
                              </Show>
                            </button>
                            <Show when={openCat() === c.name && (c.missing.length || c.extra.length)}>
                              <div class="vp-keys" data-no-i18n>
                                <For each={c.missing}>{(k) => <code>{k}</code>}</For>
                                <For each={c.extra}>{(k) => <code class="extra">{k}</code>}</For>
                              </div>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                    <Show when={missingText()}>
                      <button class="btn ghost small" onClick={copyMissing}>
                        <I.Copy /> Eksik listesini kopyala
                      </button>
                    </Show>
                    <Show when={r().extraCategories.length}>
                      <small class="muted">
                        {t("Bilinmeyen kategori klasörleri:")} <span data-no-i18n>{r().extraCategories.join(", ")}</span>
                      </small>
                    </Show>
                    <For each={r().warnings}>{(w) => <small class="vp-warn">{w}</small>}</For>
                    <Show when={r().invalid.length}>
                      <details class="vp-invalid">
                        <summary>{t("{0} hatalı dosya", r().invalid.length)}</summary>
                        <div data-no-i18n>
                          <For each={r().invalid}>{(x) => <div>{x}</div>}</For>
                        </div>
                      </details>
                    </Show>
                    <Show when={r().recordedKeys.length}>
                      <div class="vp-inline">
                        <select class="f2-select" value={testKey()} onChange={(e) => setTestKey(e.currentTarget.value)}>
                          <For each={r().recordedKeys}>{(k) => <option value={k}>{k}</option>}</For>
                        </select>
                        <button class="btn ghost small" onClick={testPlay}>
                          <I.Volume2 /> Dene
                        </button>
                      </div>
                      <Show when={testMsg()}>
                        <small class="error" data-no-i18n>
                          {testMsg()}
                        </small>
                      </Show>
                    </Show>
                  </div>
                )}
              </Show>
            </div>
          </div>
          {/* 4 */}
          <div class="vp-step">
            <div class="vp-num">4</div>
            <div class="vp-step-body">
              <b>Ses paketini oluştur</b>
              <small>Kayıtları tek bir zip dosyasında toplar. OGG dönüşümü açıkken WAV kayıtlar mono OGG'ye çevrilir (yaklaşık 10 kat küçülür).</small>
              <div class="vp-form">
                <label>
                  <span>Paket kimliği</span>
                  <input class="input" placeholder="de-hans" value={meta().id} onInput={(e) => setM("id", e.currentTarget.value)} />
                </label>
                <label>
                  <span>Paket adı</span>
                  <input class="input" placeholder="Hans (Deutsch)" value={meta().name} onInput={(e) => setM("name", e.currentTarget.value)} />
                </label>
                <label>
                  <span>Dil</span>
                  <input class="input" list="vp-langs" placeholder="de" value={meta().language} onInput={(e) => setM("language", e.currentTarget.value)} />
                </label>
                <label>
                  <span>Yazar</span>
                  <input class="input" value={meta().author} onInput={(e) => setM("author", e.currentTarget.value)} />
                </label>
                <label>
                  <span>Sürüm</span>
                  <input class="input" inputMode="numeric" value={meta().version} onInput={(e) => setM("version", e.currentTarget.value.replace(/\D/g, ""))} />
                </label>
              </div>
              <div class="row">
                <div>
                  <b>OGG'ye dönüştür</b>
                  <small>Önerilir: indirme boyutu çok küçülür, ses kalitesi konuşma için yeterlidir.</small>
                </div>
                <Switch checked={convert()} onChange={setConvert} />
              </div>
              <div class="vp-inline">
                <Show
                  when={!building()}
                  fallback={
                    <>
                      <div class="vp-progress grow">
                        <div class="vp-bar">
                          <i classList={{ indet: !building()!.total }} style={{ width: `${building()!.total ? pct(building()!.done, building()!.total) : 100}%` }} />
                        </div>
                        <small class="muted">
                          {building()!.stage === "scan"
                            ? t("Klasör taranıyor…")
                            : building()!.stage === "convert"
                              ? t("Dönüştürülüyor… {0} / {1}", building()!.done, building()!.total)
                              : t("Paketleniyor… {0} / {1}", building()!.done, building()!.total)}
                        </small>
                      </div>
                      <button class="btn ghost small" onClick={() => invoke("voice_pack_cancel", { id: "__build" })}>
                        <I.X /> İptal
                      </button>
                    </>
                  }
                >
                  <button class="btn small" disabled={!dir()} onClick={build}>
                    <I.Box /> Ses paketi oluştur
                  </button>
                </Show>
              </div>
              <Show when={built()}>
                {(b) => (
                  <div class="vp-result">
                    <small class="vp-ok">
                      {t("Paket hazır: {0} ({1} ifade, {2} kayıt). Kayıtların boyutu {3} idi.", fmtBytes(b().size), b().phrases, b().files, fmtBytes(b().inputBytes))}
                    </small>
                    <small class="voice-path" data-no-i18n>
                      {b().path}
                    </small>
                    <For each={b().warnings}>{(w) => <small class="vp-warn">{w}</small>}</For>
                    <div class="vp-inline">
                      <button class="btn ghost small" onClick={() => invoke("voice_packs_open_dir", { path: parentDir(b().path) })}>
                        <I.FolderOpen /> Klasörde göster
                      </button>
                    </div>
                  </div>
                )}
              </Show>
            </div>
          </div>
          {/* 5 */}
          <div class="vp-step">
            <div class="vp-num">5</div>
            <div class="vp-step-body">
              <b>Paketimi gönder</b>
              <small>
                Zip dosyasını WeTransfer, Google Drive, Dropbox ya da benzeri bir yere yükle ve paylaşım bağlantısını buraya yaz. Paket
                incelenir; uygunsa herkesin indirebileceği paketler listesine eklenir.
              </small>
              <Show when={session()} fallback={<small class="muted">Göndermek için giriş yapmalısın.</small>}>
                <div class="vp-form">
                  <label>
                    <span>Dil</span>
                    <input class="input" placeholder="Deutsch" value={sub().language} onInput={(e) => setSub({ ...sub(), language: e.currentTarget.value })} />
                  </label>
                  <label>
                    <span>Paket adı</span>
                    <input class="input" value={sub().name} onInput={(e) => setSub({ ...sub(), name: e.currentTarget.value })} />
                  </label>
                  <label class="wide">
                    <span>Bağlantı</span>
                    <input class="input" placeholder="https://we.tl/…" value={sub().link} onInput={(e) => setSub({ ...sub(), link: e.currentTarget.value })} />
                  </label>
                  <label class="wide">
                    <span>Mesaj</span>
                    <textarea class="input" rows={3} maxLength={2000} value={sub().message} onInput={(e) => setSub({ ...sub(), message: e.currentTarget.value })} />
                  </label>
                </div>
                <div class="vp-inline">
                  <button class="btn small" disabled={sending() || proLocked(F.voicePackSubmit)} onClick={send}>
                    <I.Share2 /> {sending() ? t("Gönderiliyor…") : t("Paketimi gönder")}
                    <ProLockTag feature={F.voicePackSubmit} />
                  </button>
                </div>
                <ProLockNote feature={F.voicePackSubmit} text="Ses paketi göndermek PRO üyelere özel." />
                <Show when={sent()}>
                  <small class="vp-ok">{sent()}</small>
                </Show>
                <Show when={(mine() ?? []).length}>
                  <div class="vp-subs">
                    <small class="muted">Gönderilerim</small>
                    <For each={mine()}>
                      {(s) => (
                        <div class="vp-sub">
                          <span class={`vp-chip ${SUBMISSION_STATUS[s.status]?.tone ?? ""}`}>{SUBMISSION_STATUS[s.status]?.label ?? s.status}</span>
                          <div>
                            <b data-no-i18n>{s.pack_name}</b>{" "}
                            <small class="muted">
                              <span data-no-i18n>{s.language}</span> · {new Date(s.created_at).toLocaleDateString(localeTag())}
                            </small>
                            <Show when={s.admin_note}>
                              <small class="muted" data-no-i18n>
                                {s.admin_note}
                              </small>
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
            </div>
          </div>
          <Show when={err()}>
            <p class="error" data-no-i18n>
              {err()}
            </p>
          </Show>
        </div>
      </Show>
    </div>
  );
}
