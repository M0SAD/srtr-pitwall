// Yönetim › içerik bölümleri (c42):
//  - PRO tanıtım mesajı: PRO olmayanlara programdaki ve sitedeki PRO bölümünde gösterilen kart (app_config.pro_promo)
//  - Overlay arka planları: hazır arka planların görselleri ve varsayılanı (app_config.preview_backdrops)
//  - Sim seçici: üst çubukta oyun ikonları ya da yazı (app_config.sim_icons, c51; Yönetim › Görünürlük'te gösterilir)
//  - Çeviriler: programın ve web sitesinin metinlerine dil bazında düzeltme (i18n_overrides)
// Görseller herkese açık 'site' kovasına yüklenir (promo/…, backdrops/…).

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { LANGS, lang, localeTag, refreshOverrides, t } from "@/sdk/i18n";
import { api, publicUrl, storageUpload } from "@/cloud/supabase";
import { PLAN_LIST, loadConfig, simIconsOn } from "@/cloud/account";
import { PromoView, proPromo, type ProPromo, type PromoAction } from "./ProPromoCard";
import { BACKDROPS, BUNDLED_BACKDROPS, previewBackdrops, type PreviewBackdrops } from "./Backdrop";
import { takeAdminFocus } from "./adminFocus";
import "./proPromo.css";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

const BUCKET = "site";
const extOf = (type: string) => (type === "image/gif" ? "gif" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg");

// ---------------------------------------------------------------------------
// PRO tanıtım mesajı
// ---------------------------------------------------------------------------
const PROMO_LANGS = LANGS.map((l) => l.code);
const MAX_PROMO_IMG = 2 * 1024 * 1024;

export function AdminProPromo(props: { run: Run }) {
  const clone = (p: ProPromo): ProPromo => JSON.parse(JSON.stringify(p ?? {}));
  const [d, setD] = createSignal<ProPromo>({ action: "plans", ...clone(proPromo()) });
  const [dirty, setDirty] = createSignal(false);
  const [ed, setEd] = createSignal("tr");
  const [bump, setBump] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const patch = (p: Partial<ProPromo>) => {
    setD({ ...d(), ...p });
    setDirty(true);
  };
  const setText = (f: "title" | "text" | "button", v: string) => {
    const m = { ...(d()[f] ?? {}) };
    if (v.trim()) m[ed()] = v;
    else delete m[ed()];
    patch({ [f]: m });
  };
  const has = (code: string) => !!(d().title?.[code] || d().text?.[code] || d().button?.[code]);
  let file: HTMLInputElement | undefined;

  // "Diğer dillere çevir": Türkçe (yoksa seçili dil) metinleri makine çevirisiyle diğer dillere doldurur.
  // Kaydetmez: yönetici dilleri gözden geçirip düzeltir, sonra Kaydet'e basar.
  const FIELDS = ["title", "text", "button"] as const;
  const FIELD_MAX = { title: 120, text: 600, button: 40 };
  const [overwrite, setOverwrite] = createSignal(false);
  const [tr, setTr] = createSignal<{ done: number; total: number; lang: string } | null>(null);
  const [trErrors, setTrErrors] = createSignal<{ lang: string; msg: string }[]>([]);
  const [trInfo, setTrInfo] = createSignal("");
  let trStop = false;
  const langName = (c: string) => LANGS.find((l) => l.code === c)?.name ?? c;
  const srcLang = () => (FIELDS.some((f) => d()[f]?.tr?.trim()) ? "tr" : ed());
  const translateAll = async () => {
    const from = srcLang();
    const src = { title: d().title?.[from]?.trim() ?? "", text: d().text?.[from]?.trim() ?? "", button: d().button?.[from]?.trim() ?? "" };
    setTrErrors([]);
    setTrInfo("");
    if (!FIELDS.some((f) => src[f])) {
      setTrInfo(t("Önce Türkçe (ya da seçili dildeki) başlık, metin ya da düğme yazısını doldur."));
      return;
    }
    const ow = overwrite();
    if (ow && !confirm(t("Dolu olan dillerdeki metinlerin üzerine yazılsın mı?"))) return;
    const targets = PROMO_LANGS.filter((c) => c !== from);
    trStop = false;
    let filled = 0;
    const errors: { lang: string; msg: string }[] = [];
    for (let i = 0; i < targets.length; i++) {
      if (trStop) break;
      const to = targets[i];
      setTr({ done: i, total: targets.length, lang: to });
      for (const f of FIELDS) {
        if (!src[f] || (!ow && d()[f]?.[to]?.trim())) continue;
        try {
          const out = (await invoke<string>("translate_text", { text: src[f], from, to })).trim().slice(0, FIELD_MAX[f]);
          if (!out) continue;
          // Güncel taslağın üzerine yazılır (çeviri sürerken yönetici başka alanı düzenlemiş olabilir)
          patch({ [f]: { ...(d()[f] ?? {}), [to]: out } });
          filled++;
        } catch (e) {
          const msg = typeof e === "string" ? e : String((e as Error)?.message ?? e);
          errors.push({ lang: to, msg: /^[A-ZÇĞİÖŞÜ]/.test(msg) && !/^(TypeError|Error)/.test(msg) ? msg : "Çeviri yapılamadı" });
          setTrErrors([...errors]);
          break;
        }
      }
    }
    setTr(null);
    setTrInfo(
      trStop
        ? t("Çeviri durduruldu. {0} alan dolduruldu.", filled)
        : filled
          ? t("{0} alan çevrildi. Dilleri gözden geçir, gerekirse düzelt ve Kaydet'e bas.", filled)
          : errors.length
            ? ""
            : t("Çevrilecek boş alan yok. Üzerine yazmak için \"Dolu olanların üzerine yaz\" seçeneğini işaretle."),
    );
  };

  const upload = (f: File) =>
    props.run(async () => {
      if (!/^image\/(gif|png|webp|jpeg)$/.test(f.type)) throw new Error("Sadece GIF, PNG, WebP ya da JPEG yüklenebilir");
      if (f.size > MAX_PROMO_IMG) throw new Error("Görsel en fazla 2 MB olabilir");
      setBusy(true);
      try {
        const path = `promo/promo-${Date.now()}.${extOf(f.type)}`;
        await storageUpload(BUCKET, path, f, f.type, true);
        patch({ image: publicUrl(BUCKET, path) });
      } finally {
        setBusy(false);
      }
    }, "Görsel yüklendi (kaydetmeyi unutma)");

  const save = () =>
    props.run(async () => {
      const p = clone(d());
      const old = proPromo().rev ?? 0;
      p.rev = bump() ? old + 1 : old;
      if (p.action !== "checkout") delete p.plan;
      if (p.action !== "url") delete p.url;
      if (p.action === "url" && !/^https?:\/\//i.test(p.url ?? "")) throw new Error("Bağlantı https:// ile başlamalı");
      await api("POST", "rpc/admin_set_pro_promo", { body: { p_promo: p } });
      await loadConfig();
      setD({ action: "plans", ...clone(proPromo()) });
      setDirty(false);
    }, "PRO tanıtım mesajı kaydedildi");

  return (
    <section class="panel admin-panel">
      <h3>PRO tanıtım mesajı</h3>
      <p class="muted small">
        PRO olmayan kullanıcılara programdaki PRO bölümünün ve web sitesindeki PRO alanlarının (ana sayfa fiyatlar, Hesabım) üstünde gösterilir. Kullanıcı
        kartı 7 gün gizleyebilir. Metinleri dil dil yazabilirsin: bir dilde boş bırakılan alan için İngilizce, o da yoksa Türkçe gösterilir.
      </p>
      <div class="acx-grid">
        <div>
          <div class="row">
            <b>Göster</b>
            <label class="switch">
              <input type="checkbox" checked={!!d().enabled} onChange={(e) => patch({ enabled: e.currentTarget.checked })} />
              <i />
            </label>
          </div>
          <div class="acx-field">
            <small>Görsel / GIF (en fazla 2 MB; GIF, PNG, WebP, JPEG)</small>
            <div class="btns">
              <button class="btn ghost small" disabled={busy()} onClick={() => file?.click()}>
                {busy() ? "Yükleniyor…" : d().image ? "Görseli değiştir" : "Görsel yükle"}
              </button>
              <Show when={d().image}>
                <button class="btn ghost small danger" onClick={() => patch({ image: "" })}>
                  Görseli kaldır
                </button>
              </Show>
              <input
                ref={file}
                type="file"
                accept="image/gif,image/png,image/webp,image/jpeg"
                hidden
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (f) void upload(f);
                }}
              />
            </div>
          </div>
          <small class="muted">Dil (• işaretliler dolu)</small>
          <div class="acx-langs">
            <For each={PROMO_LANGS}>
              {(c) => (
                <button classList={{ on: ed() === c, has: has(c) }} onClick={() => setEd(c)} data-no-i18n>
                  {LANGS.find((l) => l.code === c)?.name ?? c}
                </button>
              )}
            </For>
          </div>
          <label class="acx-field">
            <small>Başlık</small>
            <input class="input" maxLength={120} value={d().title?.[ed()] ?? ""} placeholder="ör. Bir kahve?" onInput={(e) => setText("title", e.currentTarget.value)} />
          </label>
          <label class="acx-field">
            <small>Metin</small>
            <textarea
              class="input"
              maxLength={600}
              value={d().text?.[ed()] ?? ""}
              placeholder="ör. Bana ayda 1 kahve ısmarlayarak PRO olmak istemez misin? :)"
              onInput={(e) => setText("text", e.currentTarget.value)}
            />
          </label>
          <label class="acx-field">
            <small>Düğme yazısı</small>
            <input class="input" maxLength={40} value={d().button?.[ed()] ?? ""} placeholder="ör. PRO ol" onInput={(e) => setText("button", e.currentTarget.value)} />
          </label>
          <div class="acx-field acx-tr">
            <div class="btns">
              <button class="btn ghost small" disabled={!!tr()} title="Makine çevirisi (MyMemory). Kaydetmez; dilleri gözden geçirip Kaydet'e bas." onClick={() => void translateAll()}>
                {tr() ? t("Çevriliyor… {0}/{1} ({2})", tr()!.done + 1, tr()!.total, langName(tr()!.lang)) : "Diğer dillere çevir"}
              </button>
              <Show when={tr()}>
                <button class="btn ghost small" onClick={() => (trStop = true)}>
                  Durdur
                </button>
              </Show>
            </div>
            <label class="check">
              <input type="checkbox" checked={overwrite()} disabled={!!tr()} onChange={(e) => setOverwrite(e.currentTarget.checked)} />
              <span>Dolu olanların üzerine yaz</span>
            </label>
            <small class="muted">
              {t("Kaynak: {0}. \"SRTR Pitwall\" ve \"PRO\" çevrilmez. Çeviriler otomatik kaydedilmez.", langName(srcLang()))}
            </small>
            <Show when={tr()}>
              <progress max={tr()!.total} value={tr()!.done} style={{ width: "100%" }} />
            </Show>
            <Show when={trInfo()}>
              <small class="success">{trInfo()}</small>
            </Show>
            <For each={trErrors()}>
              {(e) => (
                <small class="error">
                  <span data-no-i18n>{langName(e.lang)}</span>: {t(e.msg)}
                </small>
              )}
            </For>
          </div>
          <label class="acx-field">
            <small>Düğmeye basınca</small>
            <select class="input" value={d().action ?? "plans"} onChange={(e) => patch({ action: e.currentTarget.value as PromoAction })}>
              <option value="plans">PRO satın alma bölümünü aç</option>
              <option value="checkout">Bir planın ödemesini doğrudan aç</option>
              <option value="url">Bağlantı aç</option>
            </select>
          </label>
          <Show when={d().action === "checkout"}>
            <label class="acx-field">
              <small>Plan</small>
              <select class="input" value={d().plan ?? "1m"} onChange={(e) => patch({ plan: e.currentTarget.value as ProPromo["plan"] })}>
                <For each={PLAN_LIST}>{(p) => <option value={p.id}>{p.label}</option>}</For>
              </select>
            </label>
          </Show>
          <Show when={d().action === "url"}>
            <label class="acx-field">
              <small>Bağlantı</small>
              <input class="input" placeholder="https://…" value={d().url ?? ""} onInput={(e) => patch({ url: e.currentTarget.value.trim() })} />
            </label>
          </Show>
          <label class="check">
            <input type="checkbox" checked={bump()} onChange={(e) => setBump(e.currentTarget.checked)} />
            <span>Kartı gizlemiş olanlara da yeniden göster</span>
          </label>
          <div class="btns">
            <button class="btn primary" disabled={!dirty()} onClick={() => void save()}>
              Kaydet
            </button>
            <Show when={dirty()}>
              <button class="btn ghost" onClick={() => (setD({ action: "plans", ...clone(proPromo()) }), setDirty(false))}>
                Vazgeç
              </button>
            </Show>
          </div>
        </div>
        <div>
          <small class="muted">Canlı önizleme ({LANGS.find((l) => l.code === ed())?.name})</small>
          <Show
            when={d().image || Object.values(d().title ?? {}).some(Boolean) || Object.values(d().text ?? {}).some(Boolean)}
            fallback={<p class="muted small">Başlık, metin ya da görsel ekleyince burada görünür.</p>}
          >
            <PromoView p={d()} lang={ed()} onHide={() => {}} onGo={() => {}} />
          </Show>
          <Show when={!d().enabled}>
            <p class="muted small">Kapalı: kullanıcılar görmez.</p>
          </Show>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Overlay arka planları
// ---------------------------------------------------------------------------
type BuiltIn = "track" | "night" | "cockpit";
const IMG_IDS: BuiltIn[] = ["track", "night", "cockpit"];
const MAX_BD_W = 1920;

/** Görseli en fazla 1920 px genişliğe küçültüp JPEG yapar */
async function shrink(f: File): Promise<Blob> {
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Görsel açılamadı"));
      img.src = url;
    });
    const w = Math.min(MAX_BD_W, img.width);
    const h = Math.round((img.height / img.width) * w);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Görsel dönüştürülemedi"))), "image/jpeg", 0.86));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// Üst çubuk: sim seçicide oyun ikonları / yazı (app_config.sim_icons, c51)
// ---------------------------------------------------------------------------
export function AdminSimIcons(props: { run: Run }) {
  const set = (on: boolean) =>
    props.run(async () => {
      await api("POST", "rpc/admin_set_sim_icons", { body: { p_on: on } });
      await loadConfig();
    }, on ? "Sim seçicide oyun ikonları açıldı" : "Sim seçicide yazılı görünüme dönüldü");
  return (
    <section class="panel admin-panel">
      <h3>Üst çubuk: sim seçici</h3>
      <div class="row">
        <div>
          <b>Oyun ikonlarını göster</b>
          <small>
            Açıkken üst çubuktaki sim seçicide oyunların ikonları görünür. Kapatınca herkes eski yazılı görünümü (iRacing, ACC, AC, LMU, AMS2) görür.
            Değişiklik programlara birkaç dakika içinde (en geç açılışta) ulaşır.
          </small>
        </div>
        <label class="switch">
          <input type="checkbox" checked={simIconsOn()} onChange={(e) => set(e.currentTarget.checked)} />
          <i />
        </label>
      </div>
    </section>
  );
}

export function AdminBackdrops(props: { run: Run }) {
  const cfg = () => previewBackdrops();
  const def = () => cfg().default ?? "track";
  const [busy, setBusy] = createSignal("");
  const save = (next: PreviewBackdrops, ok: string) =>
    props.run(async () => {
      await api("POST", "rpc/admin_set_preview_backdrops", { body: { p_cfg: next } });
      await loadConfig();
    }, ok);
  const upload = (id: BuiltIn, f: File) =>
    props.run(async () => {
      if (!f.type.startsWith("image/")) throw new Error("Sadece görsel yüklenebilir");
      setBusy(id);
      try {
        const blob = await shrink(f);
        const path = `backdrops/${id}-${Date.now()}.jpg`;
        await storageUpload(BUCKET, path, blob, "image/jpeg", true);
        const next: PreviewBackdrops = { default: def(), images: { ...(cfg().images ?? {}), [id]: publicUrl(BUCKET, path) } };
        await api("POST", "rpc/admin_set_preview_backdrops", { body: { p_cfg: next } });
        await loadConfig();
      } finally {
        setBusy("");
      }
    }, "Arka plan güncellendi");
  const reset = (id: BuiltIn) => {
    const images = { ...(cfg().images ?? {}) };
    delete images[id];
    void save({ default: def(), images }, "Programla gelen görsele dönüldü");
  };
  return (
    <section class="panel admin-panel">
      <h3>Overlay arka planları</h3>
      <p class="muted small">
        Overlay'ler sayfasındaki önizlemenin hazır arka planları. Görseli değiştirince tüm programlara birkaç dakika içinde (en geç açılışta) ulaşır ve
        kullanıcının bilgisayarında saklanır; indirilemezse programla gelen görsel kullanılır. Varsayılan, kendi arka planını seçmemiş kullanıcılarda
        görünür. Görseller en fazla 1920 px genişliğe küçültülür.
      </p>
      <div class="acx-bd">
        <For each={BACKDROPS.filter((b) => b.id !== "custom")}>
          {(b) => {
            const id = b.id as BuiltIn | "plain";
            const remote = () => (id === "plain" ? "" : (cfg().images?.[id] ?? ""));
            let file: HTMLInputElement | undefined;
            return (
              <div class="acx-bd-item" classList={{ def: def() === id }}>
                <Show when={id !== "plain"} fallback={<div class="acx-plain" />}>
                  <img src={remote() || BUNDLED_BACKDROPS[id]} alt="" />
                </Show>
                <b>{b.name}</b>
                <small class="muted">{id === "plain" ? "Görselsiz düz arka plan" : remote() ? "Yöneticinin görseli" : "Programla gelen görsel"}</small>
                <label class="check">
                  <input type="radio" name="bd-default" checked={def() === id} onChange={() => void save({ ...cfg(), default: id }, "Varsayılan arka plan kaydedildi")} />
                  <span>Varsayılan</span>
                </label>
                <Show when={id !== "plain"}>
                  <div class="btns">
                    <button class="btn ghost small" disabled={!!busy()} onClick={() => file?.click()}>
                      {busy() === id ? "Yükleniyor…" : "Görseli değiştir"}
                    </button>
                    <Show when={remote()}>
                      <button class="btn ghost small" onClick={() => reset(id as BuiltIn)}>
                        Programdakine dön
                      </button>
                    </Show>
                    <input
                      ref={file}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const f = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        if (f && IMG_IDS.includes(id as BuiltIn)) void upload(id as BuiltIn, f);
                      }}
                    />
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Çeviriler
// ---------------------------------------------------------------------------
type Scope = "app" | "site";
interface Entry {
  key: string;
  /** Türkçe kaynak */
  src: string;
  /** Paketteki çeviri (seçili dilde) */
  cur: string;
}
interface OvRow {
  key: string;
  value: string;
  updated_at: string;
  updated_by_name: string;
}

const appLocales = import.meta.glob<{ default: Record<string, string> }>(["../../locales/*.json", "!../../locales/_*.json"]);
const appSource = import.meta.glob<{ default: Record<string, string> }>("../../locales/_source.json");
const siteJs = import.meta.glob<string>("../../../website/assets/*.js", { query: "?raw", import: "default" });
const siteLocales = import.meta.glob<{ default: Record<string, string> }>("../../../website/assets/lang/*.json");

function unquote(s: string): string {
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  return s.slice(1, -1).replace(/\\(['`\\])/g, "$1");
}

/** Web sitesi metinleri: assets/*.js içindeki addDict({ anahtar: ["Türkçe", "English"] }) blokları */
let siteDictCache: Map<string, { tr: string; en: string }> | null = null;
async function siteDict() {
  if (siteDictCache) return siteDictCache;
  const out = new Map<string, { tr: string; en: string }>();
  const STR = `"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\``;
  const entry = new RegExp(`([A-Za-z0-9_]+)\\s*:\\s*\\[\\s*(${STR})\\s*,\\s*(${STR})\\s*,?\\s*\\]`, "g");
  for (const load of Object.values(siteJs)) {
    const src = await load();
    for (const m of src.matchAll(/addDict\(\{([\s\S]*?)\n\}\);/g)) {
      for (const e of m[1].matchAll(entry)) out.set(e[1], { tr: unquote(e[2]), en: unquote(e[3]) });
    }
  }
  siteDictCache = out;
  return out;
}

async function loadEntries(scope: Scope, code: string): Promise<Entry[]> {
  if (scope === "app") {
    const srcLoad = Object.values(appSource)[0];
    const keys = srcLoad ? Object.keys((await srcLoad()).default) : [];
    const loc = code === "tr" ? null : appLocales[`../../locales/${code}.json`];
    const tr = loc ? (await loc()).default : {};
    return keys.map((k) => ({ key: k, src: k, cur: code === "tr" ? k : (tr[k] ?? "") }));
  }
  const dict = await siteDict();
  const loc = code === "tr" || code === "en" ? null : siteLocales[`../../../website/assets/lang/${code}.json`];
  const tr = loc ? (await loc()).default : {};
  return [...dict.entries()].map(([k, v]) => ({ key: k, src: v.tr, cur: code === "tr" ? v.tr : code === "en" ? v.en : (tr[k] ?? "") }));
}

const PAGE = 60;

export function AdminTranslations(props: { run: Run }) {
  const focus = takeAdminFocus("translations");
  const [fLang, fKey] = focus?.id ? [focus.id.slice(0, focus.id.indexOf("|")), focus.id.slice(focus.id.indexOf("|") + 1)] : ["", ""];
  const [scope, setScope] = createSignal<Scope>(fKey.startsWith("site:") ? "site" : "app");
  const [code, setCode] = createSignal(LANGS.some((l) => l.code === fLang) ? fLang : lang() === "tr" ? "en" : lang());
  const [q, setQ] = createSignal(fKey ? fKey.replace(/^(app|site):/, "") : "");
  const [only, setOnly] = createSignal<"all" | "ov" | "missing">("all");
  const [limit, setLimit] = createSignal(PAGE);
  const [entries] = createResource(() => [scope(), code()] as const, ([s, c]) => loadEntries(s, c).catch(() => [] as Entry[]));
  const [ovs, { refetch }] = createResource(code, (c) =>
    api<OvRow[]>("POST", "rpc/i18n_overrides_admin", { body: { p_lang: c } })
      .then((r) => r ?? [])
      .catch(() => [] as OvRow[]),
  );
  const prefix = () => (scope() === "app" ? "app:" : "site:");
  const ovMap = createMemo(() => new Map((ovs() ?? []).filter((r) => r.key.startsWith(prefix())).map((r) => [r.key.slice(prefix().length), r])));
  /** Satır başına taslak */
  const [draft, setDraft] = createSignal<Record<string, string>>({});

  const shown = createMemo(() => {
    const words = q().toLocaleLowerCase("tr").split(/\s+/).filter(Boolean);
    const m = ovMap();
    const f = only();
    return (entries() ?? []).filter((e) => {
      const ov = m.get(e.key);
      if (f === "ov" && !ov) return false;
      if (f === "missing" && (e.cur || ov)) return false;
      if (!words.length) return true;
      const hay = `${e.key} ${e.src} ${e.cur} ${ov?.value ?? ""}`.toLocaleLowerCase("tr");
      return words.every((w) => hay.includes(w));
    });
  });

  const saveOne = (e: Entry, value: string) =>
    props.run(async () => {
      await api("POST", "rpc/i18n_override_set", { body: { p_lang: code(), p_key: prefix() + e.key, p_value: value } });
      await refetch();
      const d = { ...draft() };
      delete d[e.key];
      setDraft(d);
      if (scope() === "app" && code() === lang()) await refreshOverrides(true);
    }, value.trim() ? "Çeviri kaydedildi" : "Düzeltme kaldırıldı");

  const fmtTime = (v: string) => new Date(v).toLocaleString(localeTag(), { dateStyle: "short", timeStyle: "short" });

  return (
    <section class="panel admin-panel">
      <h3>Çeviriler</h3>
      <p class="muted small">
        Programın ve web sitesinin metinlerini dil dil düzeltebilirsin. Düzeltme paketteki çevirinin üstüne yazılır ve programlara / siteye bir sonraki
        açılışta (sayfa yenilenince) ulaşır; kendi programında hemen uygulanır. Türkçe seçilirse Türkçe metnin kendisi değişir. {"{0}"} gibi yer tutucuları
        çeviride de aynen bırak. Düzeltmeyi kaldırmak için kutuyu boşaltıp kaydet.
      </p>
      <div class="cm-tabs">
        <button classList={{ on: scope() === "app" }} onClick={() => (setScope("app"), setLimit(PAGE))}>
          Program
        </button>
        <button classList={{ on: scope() === "site" }} onClick={() => (setScope("site"), setLimit(PAGE))}>
          Web sitesi
        </button>
      </div>
      <div class="acx-tools">
        <select class="input" value={code()} onChange={(e) => (setCode(e.currentTarget.value), setLimit(PAGE))}>
          <For each={LANGS}>{(l) => <option value={l.code}>{l.name}</option>}</For>
        </select>
        <input class="input" type="search" placeholder="Ara (Türkçe metin, çeviri, anahtar)…" value={q()} onInput={(e) => (setQ(e.currentTarget.value), setLimit(PAGE))} />
        <select class="input" value={only()} onChange={(e) => (setOnly(e.currentTarget.value as "all" | "ov" | "missing"), setLimit(PAGE))}>
          <option value="all">Tümü</option>
          <option value="ov">Düzeltilenler</option>
          <option value="missing">Çevirisi olmayanlar</option>
        </select>
      </div>
      <p class="muted small">
        <Show when={!entries.loading} fallback="Yükleniyor…">
          {shown().length} metin · {ovMap().size} düzeltme
        </Show>
      </p>
      <div class="acx-tr-list">
        <For each={shown().slice(0, limit())}>
          {(e) => {
            const ov = () => ovMap().get(e.key);
            const val = () => draft()[e.key] ?? ov()?.value ?? "";
            const changed = () => draft()[e.key] !== undefined && draft()[e.key] !== (ov()?.value ?? "");
            return (
              <div class="acx-tr-row" classList={{ ov: !!ov() }}>
                <div class="acx-src" data-no-i18n>
                  <Show when={scope() === "site"}>
                    <code>{e.key}</code> ·{" "}
                  </Show>
                  {e.src}
                </div>
                <Show when={code() !== "tr"}>
                  <div class="acx-cur" data-no-i18n>
                    Paketteki çeviri: {e.cur || "—"}
                  </div>
                </Show>
                <textarea
                  class="input"
                  rows={1}
                  placeholder={code() === "tr" ? "Türkçe metnin yerine geçecek metin" : "Düzeltilmiş çeviri"}
                  value={val()}
                  onInput={(x) => setDraft({ ...draft(), [e.key]: x.currentTarget.value })}
                />
                <div class="btns">
                  <button class="btn primary small" disabled={!changed()} onClick={() => void saveOne(e, val())}>
                    Kaydet
                  </button>
                  <Show when={!ov() && !draft()[e.key]}>
                    <button class="btn ghost small" onClick={() => setDraft({ ...draft(), [e.key]: e.cur || e.src })}>
                      Paketteki metinden başla
                    </button>
                  </Show>
                  <Show when={ov()}>
                    <button class="btn ghost small danger" onClick={() => void saveOne(e, "")}>
                      Düzeltmeyi kaldır
                    </button>
                    <small class="muted" data-no-i18n>
                      {ov()!.updated_by_name || "—"}, {fmtTime(ov()!.updated_at)}
                    </small>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
      <Show when={shown().length > limit()}>
        <button class="btn ghost small" onClick={() => setLimit(limit() + PAGE * 2)}>
          Daha fazla ({shown().length - limit()})
        </button>
      </Show>
    </section>
  );
}
