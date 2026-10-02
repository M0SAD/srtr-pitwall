// Yönetim › Ses paketleri: indirilebilir ses paketleri (voice_packs) ve üyelerin gönderdiği paketler (voice_pack_submissions).
// "Bağlantıdan doldur": zip Rust tarafında indirilir (kurulmaz; voice_pack_probe) → boyut, SHA-256, pack.json bilgileri,
// ifade / kayıt sayısı ve biçim forma yazılır. RPC'ler: c39_guncelleme.sql.

import { For, Show, createResource, createSignal, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { localeTag, t } from "@/sdk/i18n";
import { Flag } from "@/sdk/Flag";
import {
  adminDeleteVoicePack,
  adminSaveVoicePack,
  adminSubmissions,
  adminUpdateSubmission,
  fmtBytes,
  languageFlag,
  languageName,
  listVoicePacks,
  SUBMISSION_STATUS,
  type SubmissionStatus,
  type VoicePackRow,
  type VoiceSubmission,
} from "@/cloud/voicepacks";
import { openUrl } from "../ui";
import * as I from "../icons";
import "../voice.css";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

const REPO = "https://github.com/M0SAD/srtr-pitwall-sounds";

const empty = (): VoicePackRow => ({
  id: "",
  name: "",
  language: "",
  author: "",
  version: 1,
  url: "",
  size_bytes: 0,
  sha256: "",
  phrases: 0,
  files: 0,
  format: "ogg",
  notes: "",
  published: false,
  sort: 0,
});

interface Probe {
  size: number;
  sha256: string;
  meta: { id: string; name: string; language: string; author: string; version: string; format: string };
  phrases: number;
  files: number;
  format: "wav" | "ogg" | "mixed";
  skipped: number;
}

const fmtTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" }) : "—");

export function AdminVoicePacks(p: { run: Run }) {
  const [packs, { refetch }] = createResource(() => listVoicePacks().catch(() => [] as VoicePackRow[]));
  const [edit, setEdit] = createSignal<VoicePackRow | null>(null);
  const [isNew, setIsNew] = createSignal(false);
  const [probing, setProbing] = createSignal<{ received: number; total: number } | null>(null);
  const [probeMsg, setProbeMsg] = createSignal("");

  const un = listen<{ id: string; received: number; total: number; stage: string }>("voicepack-progress", (e) => {
    if (e.payload.id !== "__probe") return;
    if (e.payload.stage === "done" || e.payload.stage === "error") setProbing(null);
    else setProbing({ received: e.payload.received, total: e.payload.total });
  });
  onCleanup(() => un.then((f) => f()));

  const set = <K extends keyof VoicePackRow>(k: K, v: VoicePackRow[K]) => setEdit((d) => (d ? { ...d, [k]: v } : d));
  const start = (row: VoicePackRow | null) => {
    setProbeMsg("");
    setIsNew(!row);
    setEdit(row ? { ...row } : empty());
    requestAnimationFrame(() => document.querySelector(".vpa-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const probe = async () => {
    const d = edit();
    if (!d) return;
    setProbeMsg("");
    if (!/^https:\/\//i.test(d.url.trim())) return setProbeMsg(t("Önce https:// ile başlayan zip bağlantısını yaz."));
    setProbing({ received: 0, total: 0 });
    try {
      const r = await invoke<Probe>("voice_pack_probe", { url: d.url.trim() });
      const ver = Number(/\d+/.exec(r.meta.version || "")?.[0] ?? 0);
      setEdit((x) =>
        x
          ? {
              ...x,
              size_bytes: r.size,
              sha256: r.sha256,
              phrases: r.phrases,
              files: r.files,
              format: r.format,
              id: x.id || r.meta.id,
              name: x.name || r.meta.name,
              language: x.language || r.meta.language,
              author: x.author || r.meta.author,
              version: ver > 0 ? ver : x.version,
            }
          : x,
      );
      setProbeMsg(
        t("Zip okundu: {0}, {1} ifade, {2} kayıt ({3}).", fmtBytes(r.size), r.phrases, r.files, r.format.toUpperCase()) +
          (r.skipped ? " " + t("{0} desteklenmeyen dosya kurulumda atlanır.", r.skipped) : ""),
      );
    } catch (e) {
      setProbeMsg(t("Hata: {0}", String(e)));
    } finally {
      setProbing(null);
    }
  };

  const save = () => {
    const d = edit();
    if (!d) return;
    if (!isNew() || !(packs() ?? []).some((x) => x.id === d.id.trim()) || confirm(t('"{0}" kimlikli paket zaten var; üzerine yazılsın mı?', d.id))) {
      p.run(async () => {
        await adminSaveVoicePack(d);
        setEdit(null);
        await refetch();
      }, t("Ses paketi kaydedildi"));
    }
  };
  const togglePublished = (row: VoicePackRow) =>
    p.run(async () => {
      await adminSaveVoicePack({ ...row, published: !row.published });
      await refetch();
    }, row.published ? t("Yayından kaldırıldı") : t("Yayınlandı"));
  const del = (row: VoicePackRow) => {
    if (!confirm(t('"{0}" ses paketi listeden silinsin mi? (GitHub\'daki dosya silinmez)', row.name))) return;
    p.run(async () => {
      await adminDeleteVoicePack(row.id);
      await refetch();
    }, t("Ses paketi silindi"));
  };

  return (
    <div class="vpa">
      <section class="panel admin-panel">
        <div class="voice-panel-head">
          <h3>Ses paketleri</h3>
          <button class="btn small" onClick={() => start(null)}>
            <I.Plus /> Yeni paket
          </button>
        </div>
        <details class="vpa-help">
          <summary>Paketi GitHub'a yükleme adımları</summary>
          <ol>
            <li>
              Paketi uygulamada Sesli Mühendis → "Kendi dilinde ses paketi yap" → "Ses paketi oluştur" ile zip yap (OGG dönüşümü açık).
              Zip'in kökünde pack.json olmalı.
            </li>
            <li>
              <button class="link" onClick={() => openUrl(`${REPO}/releases/new`)}>
                github.com/M0SAD/srtr-pitwall-sounds → Releases → "Draft a new release"
              </button>{" "}
              aç. Etiket (tag) yaz, ör. <code>tr-erkin-v2</code>; başlık: paket adı ve sürüm.
            </li>
            <li>Zip dosyasını "Attach binaries" alanına sürükle, yükleme bitince "Publish release".</li>
            <li>
              Yayınlanan sürümde zip dosyasına sağ tıklayıp bağlantıyı kopyala. Bağlantı şöyle olmalı:{" "}
              <code>{REPO}/releases/download/&lt;etiket&gt;/&lt;dosya&gt;.zip</code>
            </li>
            <li>
              Burada "Yeni paket" (ya da güncellenecek paketi "Düzenle") → bağlantıyı yapıştır → "Bağlantıdan doldur" (boyut, SHA-256, ifade
              sayısı ve pack.json bilgileri dolar) → sürümü bir artır → "Yayında" işaretle → Kaydet.
            </li>
            <li>Uygulamalar listeyi açınca yeni paketi görür; kurulu sürümden büyükse "Güncelle" düğmesi çıkar.</li>
          </ol>
          <small class="muted">GitHub'da her dosya en fazla 2 GB olabilir. Eski sürümün release'ini silmeden önce yenisini yayınla.</small>
        </details>

        <Show when={edit()}>
          {(d) => (
            <div class="vpa-form">
              <h4>{isNew() ? t("Yeni ses paketi") : t("Düzenle: {0}", d().id)}</h4>
              <div class="vp-form">
                <label class="wide">
                  <span>Zip bağlantısı (GitHub Releases)</span>
                  <div class="vp-inline">
                    <input
                      class="input"
                      style={{ flex: 1 }}
                      placeholder={`${REPO}/releases/download/tr-erkin-v1/tr-erkin.zip`}
                      value={d().url}
                      onInput={(e) => set("url", e.currentTarget.value)}
                    />
                    <Show
                      when={!probing()}
                      fallback={
                        <button class="btn ghost small" onClick={() => invoke("voice_pack_cancel", { id: "__probe" })}>
                          <I.X /> İptal
                        </button>
                      }
                    >
                      <button class="btn small" onClick={probe}>
                        <I.Download /> Bağlantıdan doldur
                      </button>
                    </Show>
                  </div>
                </label>
                <Show when={probing()}>
                  <div class="vp-progress wide" style={{ "grid-column": "1 / -1" }}>
                    <div class="vp-bar">
                      <i classList={{ indet: !probing()!.total }} style={{ width: `${probing()!.total ? Math.round((probing()!.received / probing()!.total) * 100) : 100}%` }} />
                    </div>
                    <small class="muted">
                      {probing()!.total ? t("İndiriliyor… {0} / {1}", fmtBytes(probing()!.received), fmtBytes(probing()!.total)) : t("İndiriliyor… {0}", fmtBytes(probing()!.received))}
                    </small>
                  </div>
                </Show>
                <Show when={probeMsg()}>
                  <small class={probeMsg().startsWith(t("Hata")) ? "error" : "vp-ok"} style={{ "grid-column": "1 / -1" }}>
                    {probeMsg()}
                  </small>
                </Show>
                <label>
                  <span>Kimlik (klasör adı)</span>
                  <input class="input" placeholder="tr-erkin" disabled={!isNew()} value={d().id} onInput={(e) => set("id", e.currentTarget.value)} />
                </label>
                <label>
                  <span>Ad</span>
                  <input class="input" value={d().name} onInput={(e) => set("name", e.currentTarget.value)} />
                </label>
                <label>
                  <span>Dil (BCP47: tr, en, de, pt-BR…)</span>
                  <input class="input" value={d().language} onInput={(e) => set("language", e.currentTarget.value)} />
                </label>
                <label>
                  <span>Yazar</span>
                  <input class="input" value={d().author} onInput={(e) => set("author", e.currentTarget.value)} />
                </label>
                <label>
                  <span>Sürüm</span>
                  <input class="input" type="number" min={1} value={d().version} onInput={(e) => set("version", Number(e.currentTarget.value) || 1)} />
                </label>
                <label>
                  <span>Sıra</span>
                  <input class="input" type="number" value={d().sort} onInput={(e) => set("sort", Number(e.currentTarget.value) || 0)} />
                </label>
                <label>
                  <span>Biçim</span>
                  <select class="f2-select" value={d().format} onChange={(e) => set("format", e.currentTarget.value as VoicePackRow["format"])}>
                    <option value="ogg">OGG</option>
                    <option value="wav">WAV</option>
                    <option value="mixed">Karışık</option>
                  </select>
                </label>
                <label>
                  <span>Boyut (bayt)</span>
                  <input class="input" type="number" value={d().size_bytes} onInput={(e) => set("size_bytes", Number(e.currentTarget.value) || 0)} />
                </label>
                <label>
                  <span>İfade</span>
                  <input class="input" type="number" value={d().phrases} onInput={(e) => set("phrases", Number(e.currentTarget.value) || 0)} />
                </label>
                <label>
                  <span>Kayıt</span>
                  <input class="input" type="number" value={d().files} onInput={(e) => set("files", Number(e.currentTarget.value) || 0)} />
                </label>
                <label class="wide">
                  <span>SHA-256 (boşsa doğrulama yapılmaz)</span>
                  <input class="input" style={{ "font-family": "monospace" }} value={d().sha256} onInput={(e) => set("sha256", e.currentTarget.value)} />
                </label>
                <label class="wide">
                  <span>Not (kullanıcılara görünür)</span>
                  <input class="input" value={d().notes} onInput={(e) => set("notes", e.currentTarget.value)} />
                </label>
              </div>
              <label class="vpa-check">
                <input type="checkbox" checked={d().published} onChange={(e) => set("published", e.currentTarget.checked)} /> Yayında (herkes görür ve
                indirebilir)
              </label>
              <div class="vp-inline">
                <button class="btn small" onClick={save}>
                  <I.Check /> Kaydet
                </button>
                <button class="btn ghost small" onClick={() => setEdit(null)}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </Show>

        <Show when={!packs.loading} fallback={<p class="muted">Yükleniyor…</p>}>
          <div class="vp-list">
            <For each={packs()} fallback={<p class="muted" style={{ padding: "10px" }}>Henüz paket yok.</p>}>
              {(row) => (
                <div class="vp-row">
                  <Flag code={languageFlag(row.language)} class="vp-flag" />
                  <div class="vp-main">
                    <div class="vp-title">
                      <b data-no-i18n>{row.name}</b>
                      <code class="muted">{row.id}</code>
                      <span class={`vp-chip ${row.published ? "ok" : "bad"}`}>{row.published ? t("Yayında") : t("Taslak")}</span>
                    </div>
                    <small class="muted">
                      {languageName(row.language, localeTag())} · <span data-no-i18n>{row.author || "—"}</span> · v{row.version} · {fmtBytes(row.size_bytes)} ·{" "}
                      {t("{0} ifade, {1} kayıt", row.phrases, row.files)} · {row.format.toUpperCase()} · {t("sıra {0}", row.sort)}
                      {row.sha256 ? "" : " · " + t("SHA-256 yok")}
                    </small>
                    <small class="muted voice-path" data-no-i18n title={row.url}>
                      {row.url}
                    </small>
                  </div>
                  <div class="vp-actions">
                    <button class="btn ghost small" onClick={() => togglePublished(row)}>
                      {row.published ? t("Yayından kaldır") : t("Yayınla")}
                    </button>
                    <button class="icon-btn" title="Düzenle" onClick={() => start(row)}>
                      <I.Pencil />
                    </button>
                    <button class="icon-btn" title="Sil" onClick={() => del(row)}>
                      <I.Trash />
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>
      <Submissions run={p.run} />
    </div>
  );
}

function Submissions(p: { run: Run }) {
  const [filter, setFilter] = createSignal<"" | SubmissionStatus>("");
  const [list, { refetch }] = createResource(filter, (f) => adminSubmissions(f).catch(() => [] as VoiceSubmission[]));
  const [drafts, setDrafts] = createSignal<Record<string, { status: SubmissionStatus; note: string }>>({});
  const draft = (s: VoiceSubmission) => drafts()[s.id] ?? { status: s.status, note: s.admin_note };
  const setDraft = (s: VoiceSubmission, x: Partial<{ status: SubmissionStatus; note: string }>) =>
    setDrafts((m) => ({ ...m, [s.id]: { ...draft(s), ...x } }));
  const save = (s: VoiceSubmission) => {
    const d = draft(s);
    p.run(async () => {
      await adminUpdateSubmission(s.id, d.status, d.note);
      setDrafts((m) => {
        const n = { ...m };
        delete n[s.id];
        return n;
      });
      await refetch();
    }, t("Gönderi güncellendi"));
  };
  return (
    <section class="panel admin-panel">
      <div class="voice-panel-head">
        <h3>Gönderilen paketler</h3>
        <div class="seg small">
          <button classList={{ on: filter() === "" }} onClick={() => setFilter("")}>
            Hepsi
          </button>
          <For each={Object.keys(SUBMISSION_STATUS) as SubmissionStatus[]}>
            {(k) => (
              <button classList={{ on: filter() === k }} onClick={() => setFilter(k)}>
                {SUBMISSION_STATUS[k].label}
              </button>
            )}
          </For>
        </div>
      </div>
      <p class="muted small">
        Üyelerin "Paketimi gönder" formuyla gönderdiği paketler. Bağlantıyı açıp zip'i indir, uygulamada "Eksik kontrolü" ile incele. Kabul ya da
        red seçilince gönderene uygulama içi bildirim gider (not da gösterilir).
      </p>
      <Show when={!list.loading} fallback={<p class="muted">Yükleniyor…</p>}>
        <div class="vp-list">
          <For each={list()} fallback={<p class="muted" style={{ padding: "10px" }}>Gönderi yok.</p>}>
            {(s) => (
              <div class="vp-row" style={{ "align-items": "flex-start" }}>
                <div class="vp-main">
                  <div class="vp-title">
                    <span class={`vp-chip ${SUBMISSION_STATUS[s.status]?.tone ?? ""}`}>{SUBMISSION_STATUS[s.status]?.label ?? s.status}</span>
                    <b data-no-i18n>{s.pack_name}</b>
                    <small class="muted" data-no-i18n>
                      {s.language}
                    </small>
                  </div>
                  <small class="muted">
                    <span data-no-i18n>{s.user_name || "—"}</span> · {fmtTime(s.created_at)}
                    <Show when={s.handled_by_name}>
                      {" · "}
                      {t("İşleyen: {0}", s.handled_by_name)}
                    </Show>
                  </small>
                  <button class="link voice-path" style={{ "text-align": "left" }} title={s.link} onClick={() => openUrl(s.link)} data-no-i18n>
                    {s.link}
                  </button>
                  <Show when={s.message}>
                    <small data-no-i18n style={{ "white-space": "pre-line" }}>
                      {s.message}
                    </small>
                  </Show>
                  <div class="vp-inline" style={{ "margin-top": "6px" }}>
                    <select class="f2-select" value={draft(s).status} onChange={(e) => setDraft(s, { status: e.currentTarget.value as SubmissionStatus })}>
                      <For each={Object.keys(SUBMISSION_STATUS) as SubmissionStatus[]}>{(k) => <option value={k}>{SUBMISSION_STATUS[k].label}</option>}</For>
                    </select>
                    <input
                      class="input"
                      style={{ flex: 1, "min-width": "200px" }}
                      placeholder="Yönetici notu (gönderen görür)"
                      value={draft(s).note}
                      onInput={(e) => setDraft(s, { note: e.currentTarget.value })}
                    />
                    <button class="btn small" onClick={() => save(s)}>
                      <I.Check /> Kaydet
                    </button>
                    <button class="btn ghost small" onClick={() => openUrl(s.link)}>
                      <I.ExternalLink /> Bağlantıyı aç
                    </button>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
