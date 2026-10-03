// Yönetim › Yedekleme (c67): bütün içeriği (tablolar, üye listesi, yüklenen dosyalar) tek bir .zip olarak
// bilgisayara indirir ve aynı .zip'ten geri yükler. Yalnızca masaüstü uygulamasında ve yalnızca yönetici için.
// İş Rust'ta yürür (src-tauri/src/backup.rs); sunucu tarafı supabase/c67_guncelleme.sql.

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { localeTag, t } from "@/sdk/i18n";
import { inTauri } from "@/sdk/platform";
import { isAdmin } from "@/cloud/account";
import {
  PROTECTED_TABLES,
  RESTORE_WORD,
  backupBuckets,
  backupFileName,
  backupLog,
  backupTables,
  cancelBackup,
  currentProjectRef,
  inspectBackup,
  restorePending,
  restoreRepair,
  restoreWordOk,
  revealBackup,
  runBackup,
  runRestore,
  safetyPath,
  type BackupDone,
  type BackupInspect,
  type BackupProgress,
  type RepairResult,
} from "@/cloud/backup";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

const fmtBytes = (n: number) => {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : n / 1024 ** i >= 100 ? 0 : 1)} ${u[i]}`;
};
const fmtNum = (n: number) => Number(n || 0).toLocaleString(localeTag());
const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`;
};
const fmtDate = (v: unknown) => {
  const d = v ? new Date(String(v)) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleString(localeTag(), { dateStyle: "long", timeStyle: "short" }) : "—";
};

const stepLabel = (p: BackupProgress) => {
  switch (p.step) {
    case "scan":
      return t("Hazırlanıyor…");
    case "tables":
      return p.kind === "restore" ? t("Tablolar geri yükleniyor") : t("Tablolar indiriliyor");
    case "users":
      return t("Üye listesi indiriliyor");
    case "files":
      return p.kind === "restore" ? t("Dosyalar yükleniyor") : t("Dosyalar indiriliyor");
    case "delete":
      return t("Yedekte olmayan dosyalar siliniyor");
    case "finish":
      return p.kind === "restore" ? t("Son düzeltmeler yapılıyor") : t("Dosya tamamlanıyor");
    case "done":
      return t("Tamamlandı");
    default:
      return t("Başlatılıyor…");
  }
};

function ProgressBox(props: { p: BackupProgress | null; title: string; onCancel: () => void; cancelling: boolean }) {
  return (
    <div class="bk-progress">
      <div class="bk-progress-head">
        <b>{props.title}</b>
        <span class="muted">{props.p ? stepLabel(props.p) : t("Başlatılıyor…")}</span>
        <span class="bk-pct">{Math.round(props.p?.percent ?? 0)}%</span>
      </div>
      <div class="bk-bar">
        <i style={{ width: `${Math.max(1, props.p?.percent ?? 0)}%` }} />
      </div>
      <Show when={props.p}>
        {(p) => (
          <div class="bk-stats">
            <Show when={p().tables_total > 0}>
              <span>{t("Tablo: {0} / {1}", fmtNum(p().tables_done), fmtNum(p().tables_total))}</span>
              <span>{t("Satır: {0} / {1}", fmtNum(p().rows_done), fmtNum(p().rows_total))}</span>
            </Show>
            <Show when={p().files_total > 0}>
              <span>{t("Dosya: {0} / {1}", fmtNum(p().files_done), fmtNum(p().files_total))}</span>
              <span>
                {fmtBytes(p().bytes_done)} / {fmtBytes(p().bytes_total)}
              </span>
            </Show>
            <span>{t("Süre: {0}", fmtTime(p().elapsed_ms))}</span>
            <Show when={p().label}>
              <span class="bk-label muted">{p().label}</span>
            </Show>
          </div>
        )}
      </Show>
      <div class="btns">
        <button class="btn ghost small danger" disabled={props.cancelling} onClick={props.onCancel}>
          {props.cancelling ? t("İptal ediliyor…") : t("İptal")}
        </button>
      </div>
    </div>
  );
}

function ErrorList(props: { done: BackupDone }) {
  return (
    <Show when={props.done.errors.length > 0}>
      <details class="bk-errors">
        <summary>{t("{0} hata (ayrıntı için tıkla)", fmtNum(props.done.errors.length))}</summary>
        <ul>
          <For each={props.done.errors.slice(0, 200)}>
            {(e) => (
              <li>
                <b>{e.name}</b> <span class="muted">{e.error}</span>
              </li>
            )}
          </For>
        </ul>
        <Show when={props.done.errors.length > 200}>
          <p class="muted">{t("…ve {0} hata daha", fmtNum(props.done.errors.length - 200))}</p>
        </Show>
      </details>
    </Show>
  );
}

export function AdminBackup(props: { run: Run }) {
  // --- ortak durum ---------------------------------------------------------
  const [phase, setPhase] = createSignal<"" | "backup" | "safety" | "restore">("");
  const [prog, setProg] = createSignal<BackupProgress | null>(null);
  const [cancelling, setCancelling] = createSignal(false);
  const busy = () => phase() !== "";
  const usable = () => inTauri && isAdmin();

  const cancel = () => {
    setCancelling(true);
    void cancelBackup();
  };

  // --- yarım kalmış geri yükleme (kaldırılmış yabancı anahtarlar) ----------
  const [pending, { refetch: recheckPending }] = createResource(
    () => usable(),
    (ok) => (ok ? restorePending().catch(() => 0) : 0),
  );
  const [repairing, setRepairing] = createSignal(false);
  const [repaired, setRepaired] = createSignal<RepairResult | null>(null);
  const repair = async () => {
    setRepairing(true);
    setRepaired(null);
    await props.run(async () => {
      setRepaired(await restoreRepair());
    }, t("Onarıldı"));
    setRepairing(false);
    void recheckPending();
  };

  // --- yedek ---------------------------------------------------------------
  const [scan, { refetch: rescan }] = createResource(
    () => usable(),
    async (ok) => {
      if (!ok) return null;
      const [tables, buckets] = await Promise.all([backupTables(), backupBuckets()]);
      return { tables, buckets };
    },
  );
  const [optTables, setOptTables] = createSignal(true);
  const [optUsers, setOptUsers] = createSignal(true);
  const [optStorage, setOptStorage] = createSignal(true);
  const [offBuckets, setOffBuckets] = createSignal<string[]>([]);
  const [backupDone, setBackupDone] = createSignal<BackupDone | null>(null);

  const tableTotals = createMemo(() => {
    const l = scan()?.tables ?? [];
    return { count: l.length, rows: l.reduce((a, x) => a + Number(x.rows || 0), 0), bytes: l.reduce((a, x) => a + Number(x.bytes || 0), 0) };
  });
  const chosenBuckets = () => (scan()?.buckets ?? []).filter((b) => !offBuckets().includes(b.id));
  const fileTotals = createMemo(() => ({
    count: chosenBuckets().reduce((a, b) => a + Number(b.objects || 0), 0),
    bytes: chosenBuckets().reduce((a, b) => a + Number(b.bytes || 0), 0),
  }));
  const nothing = () => !optTables() && !optUsers() && !(optStorage() && chosenBuckets().length > 0);

  const startBackup = async () => {
    if (busy() || nothing()) return;
    const dest = await saveDialog({ defaultPath: backupFileName(), filters: [{ name: "Zip", extensions: ["zip"] }] });
    if (!dest) return;
    setBackupDone(null);
    setProg(null);
    setCancelling(false);
    setPhase("backup");
    try {
      const buckets = optStorage() ? chosenBuckets().map((b) => b.id) : [];
      const options = { tables: optTables(), users: optUsers(), storage: optStorage() && buckets.length > 0, buckets };
      const done = await runBackup(dest, options, { onProgress: setProg });
      setBackupDone(done);
      if (done.ok) {
        void backupLog("backup_run", {
          file: dest.split(/[\\/]/).pop(),
          tables: done.summary?.tables ?? 0,
          rows: done.summary?.rows ?? 0,
          files: done.summary?.files ?? 0,
          bytes: done.summary?.size ?? 0,
          errors: done.errors.length,
          options,
        });
      }
    } catch (e) {
      await props.run(() => Promise.reject(e), "");
    } finally {
      setPhase("");
      setCancelling(false);
    }
  };

  // --- geri yükleme --------------------------------------------------------
  const [zip, setZip] = createSignal("");
  const [info, setInfo] = createSignal<BackupInspect | null>(null);
  const [inspecting, setInspecting] = createSignal(false);
  const [inspectErr, setInspectErr] = createSignal("");
  const [nowTables, setNowTables] = createSignal<string[]>([]);
  const [rTables, setRTables] = createSignal(true);
  const [rStorage, setRStorage] = createSignal(true);
  const [rDelete, setRDelete] = createSignal(false);
  const [rOrphans, setROrphans] = createSignal(false);
  const [rSafety, setRSafety] = createSignal(true);
  const [rForeign, setRForeign] = createSignal(false);
  const [word, setWord] = createSignal("");
  const [restoreDone, setRestoreDone] = createSignal<BackupDone | null>(null);
  const [safetyFile, setSafetyFile] = createSignal("");
  const [restoreErr, setRestoreErr] = createSignal("");

  const foreign = () => {
    const ref = String(info()?.manifest?.project_ref ?? "");
    return !!info() && ref !== currentProjectRef();
  };
  const diff = createMemo(() => {
    const i = info();
    if (!i) return { gone: [] as string[], extra: [] as string[], incomplete: [] as string[] };
    const now = new Set(nowTables());
    const inBackup = new Set(i.tables.map((x) => x.name));
    return {
      gone: i.tables.filter((x) => !now.has(x.name) && !PROTECTED_TABLES.includes(x.name)).map((x) => x.name),
      extra: nowTables().filter((n) => !inBackup.has(n) && !PROTECTED_TABLES.includes(n)),
      incomplete: i.tables.filter((x) => !x.complete).map((x) => x.name),
    };
  });
  const hasTables = () => (info()?.tables.length ?? 0) > 0;
  const hasFiles = () => (info()?.files ?? 0) > 0;
  const canRestore = () =>
    !!info() &&
    info()!.ok &&
    !busy() &&
    restoreWordOk(word()) &&
    ((rTables() && hasTables()) || (rStorage() && hasFiles())) &&
    (!foreign() || rForeign());

  const pickZip = async () => {
    if (busy()) return;
    const p = await openDialog({ multiple: false, filters: [{ name: "Zip", extensions: ["zip"] }] });
    if (!p || Array.isArray(p)) return;
    setZip(p);
    setInfo(null);
    setInspectErr("");
    setRestoreDone(null);
    setRestoreErr("");
    // Sunucu tarafı (c68: tablo bağlarını geçici kaldırıp yeniden kuran işlevler) yoksa geri yükleme güvenli değildir
    try {
      await restorePending();
    } catch {
      setRestoreErr(t("Geri yükleme için sunucu güncellemesi (c68) henüz uygulanmamış. Uygulanmadan geri yükleme yapılamaz."));
      return;
    }
    setSafetyFile("");
    setWord("");
    setRForeign(false);
    setRDelete(false);
    setROrphans(false);
    setRSafety(true);
    setInspecting(true);
    try {
      const [i, now] = await Promise.all([inspectBackup(p), backupTables()]);
      setNowTables(now.map((x) => x.name));
      setInfo(i);
      setRTables(i.tables.length > 0);
      setRStorage(i.files > 0);
    } catch (e) {
      setInspectErr(String((e as Error)?.message ?? e));
    } finally {
      setInspecting(false);
    }
  };

  const startRestore = async () => {
    if (!canRestore()) return;
    const path = zip();
    const i = info()!;
    const options = { tables: rTables() && hasTables(), storage: rStorage() && hasFiles(), delete_extra: rStorage() && rDelete(), delete_orphans: rTables() && rOrphans() };
    const file = path.split(/[\\/]/).pop();
    setRestoreDone(null);
    setRestoreErr("");
    setSafetyFile("");
    setProg(null);
    setCancelling(false);
    try {
      void backupLog("restore_run", { file, backup_date: i.manifest?.created_at ?? "", backup_project: i.manifest?.project_ref ?? "", options, safety: rSafety() });
      // 1) Hiçbir şeye dokunmadan önce o anki durumun güvenlik yedeği
      if (rSafety()) {
        setPhase("safety");
        const dest = safetyPath(path);
        const s = await runBackup(dest, { tables: true, users: true, storage: options.storage, buckets: [] }, { onProgress: setProg });
        if (!s.ok) {
          setRestoreErr(s.cancelled ? t("İptal edildi. Hiçbir şeye dokunulmadı.") : t("Güvenlik yedeği alınamadı, geri yükleme başlatılmadı: {0}", s.error));
          void backupLog("restore_failed", { file, stage: "safety", error: s.error });
          return;
        }
        setSafetyFile(dest);
      }
      // 2) Geri yükleme
      setProg(null);
      setPhase("restore");
      const done = await runRestore(path, options, { onProgress: setProg });
      setRestoreDone(done);
      setWord("");
      if (done.ok) {
        void backupLog("restore_done", {
          file,
          tables: done.summary?.tables ?? 0,
          rows: done.summary?.rows ?? 0,
          files: done.summary?.files_uploaded ?? 0,
          deleted: done.summary?.files_deleted ?? 0,
          errors: done.errors.length,
        });
      } else {
        void backupLog("restore_failed", { file, stage: "restore", cancelled: done.cancelled, error: done.error, errors: done.errors.length });
      }
      void rescan();
    } catch (e) {
      setRestoreErr(String((e as Error)?.message ?? e));
      void backupLog("restore_failed", { file, stage: "start", error: String((e as Error)?.message ?? e) });
    } finally {
      setPhase("");
      setCancelling(false);
      void recheckPending();
    }
  };

  return (
    <div class="bk">
      <section class="panel admin-panel">
        <h3>Yedekleme</h3>
        <p class="hint">
          Bütün içeriği (veritabanı tabloları, üye listesi, yüklenen görseller ve dosyalar) tek bir .zip dosyası olarak kendi bilgisayarına indirirsin. Aynı dosyayı aşağıdan geri göndererek
          sistemi o yedeğe döndürebilirsin.
        </p>
        <Show
          when={usable()}
          fallback={
            <p class="warn-panel">
              <Show when={!inTauri} fallback={<>Bu bölümü yalnızca yöneticiler kullanabilir.</>}>
                Yedekleme yalnızca masaüstü uygulamasında çalışır
              </Show>
            </p>
          }
        >
          <p class="warn-panel">
            Yedek dosyası üyelerin kişisel verilerini (e-posta adresleri, mesajlar, profil bilgileri) içerir. Güvenli bir yerde sakla, kimseyle paylaşma. Şifreler yedeğe girmez.
          </p>

          <div class="bk-opts">
            <label class="check">
              <input type="checkbox" checked={optTables()} disabled={busy()} onChange={(e) => setOptTables(e.currentTarget.checked)} />
              <span>
                Veritabanı tabloları
                <Show when={scan()}>
                  <small class="muted"> {t("{0} tablo · {1} satır · {2}", fmtNum(tableTotals().count), fmtNum(tableTotals().rows), fmtBytes(tableTotals().bytes))}</small>
                </Show>
              </span>
            </label>
            <label class="check">
              <input type="checkbox" checked={optUsers()} disabled={busy()} onChange={(e) => setOptUsers(e.currentTarget.checked)} />
              <span>
                Üye listesi (e-posta dahil)
                <small class="muted"> şifreler hariç; bilgi amaçlıdır, geri yüklenmez</small>
              </span>
            </label>
            <label class="check">
              <input type="checkbox" checked={optStorage()} disabled={busy()} onChange={(e) => setOptStorage(e.currentTarget.checked)} />
              <span>
                Yüklenen dosyalar / görseller
                <Show when={scan()}>
                  <small class="muted"> {t("{0} dosya · {1}", fmtNum(fileTotals().count), fmtBytes(fileTotals().bytes))}</small>
                </Show>
              </span>
            </label>
            <Show when={optStorage()}>
              <div class="bk-buckets">
                <Show when={!scan.loading} fallback={<span class="muted">Taranıyor…</span>}>
                  <For each={scan()?.buckets ?? []} fallback={<span class="muted">Depolama kovası bulunamadı.</span>}>
                    {(b) => (
                      <label class="check">
                        <input
                          type="checkbox"
                          checked={!offBuckets().includes(b.id)}
                          disabled={busy()}
                          onChange={(e) => setOffBuckets(e.currentTarget.checked ? offBuckets().filter((x) => x !== b.id) : [...offBuckets(), b.id])}
                        />
                        <span>
                          {b.id}
                          <small class="muted"> {t("{0} dosya · {1}", fmtNum(b.objects), fmtBytes(b.bytes))}</small>
                        </span>
                      </label>
                    )}
                  </For>
                </Show>
              </div>
            </Show>
            <Show when={scan.error}>
              <p class="warn">{t("Tarama yapılamadı: {0}", String((scan.error as Error)?.message ?? scan.error))}</p>
            </Show>
          </div>

          <Show when={phase() === "backup"}>
            <ProgressBox p={prog()} title={t("Yedek alınıyor")} onCancel={cancel} cancelling={cancelling()} />
          </Show>

          <Show when={backupDone()}>
            {(d) => (
              <div class="bk-result" classList={{ err: !d().ok }}>
                <Show
                  when={d().ok}
                  fallback={<b>{d().cancelled ? t("Yedekleme iptal edildi; yarım dosya bırakılmadı.") : t("Yedek alınamadı: {0}", d().error)}</b>}
                >
                  <b>{d().errors.length ? t("Yedek alındı (bazı öğeler alınamadı)") : t("Yedek alındı")}</b>
                  <span>
                    {t(
                      "{0} tablo · {1} satır · {2} dosya · zip boyutu {3} · süre {4}",
                      fmtNum(d().summary?.tables ?? 0),
                      fmtNum(d().summary?.rows ?? 0),
                      fmtNum(d().summary?.files ?? 0),
                      fmtBytes(d().summary?.size ?? 0),
                      fmtTime(d().elapsed_ms),
                    )}
                  </span>
                  <span class="bk-path muted">{d().path}</span>
                  <div class="btns">
                    <button class="btn ghost small" onClick={() => void props.run(() => revealBackup(d().path), "")}>
                      Klasörde göster
                    </button>
                  </div>
                </Show>
                <ErrorList done={d()} />
              </div>
            )}
          </Show>

          <div class="btns">
            <button class="btn ghost" disabled={busy() || scan.loading} onClick={() => void rescan()}>
              Yeniden tara
            </button>
            <button class="btn primary" disabled={busy() || nothing()} onClick={() => void startBackup()}>
              Yedeği indir
            </button>
          </div>
        </Show>
      </section>

      <Show when={usable()}>
        <section class="panel admin-panel">
          <h3>Yedekten geri yükle</h3>
          <Show when={!busy() && Number(pending() ?? 0) > 0}>
            <div class="bk-alert">
              <b>Yarım kalmış bir geri yükleme var.</b>
              <span>
                {t("Geri yükleme için geçici olarak kaldırılan {0} tablo bağı (yabancı anahtar) henüz yeniden kurulmadı. Yeni bir işleme başlamadan önce onar.", fmtNum(Number(pending() ?? 0)))}
              </span>
              <div class="btns">
                <button class="btn primary small" disabled={repairing()} onClick={() => void repair()}>
                  {repairing() ? t("Onarılıyor…") : t("Onar")}
                </button>
              </div>
            </div>
          </Show>
          <Show when={repaired()}>
            {(r) => (
              <p class="bk-diff">
                <b>{t("{0} tablo bağı yeniden kuruldu.", fmtNum(r().restored))}</b>{" "}
                <Show when={r().notValid.length > 0}>
                  {t("Doğrulanamayanlar (üstü olmayan satırlar var; yeni kayıtlar için yine geçerli): {0}", r().notValid.map((x) => `${x.table}.${x.conname}${x.orphans ? ` (${x.orphans})` : ""}`).join(", "))}
                </Show>
              </p>
            )}
          </Show>
          <p class="hint">
            Daha önce buradan indirdiğin .zip dosyasını seç. Tablolar yedekteki haline döner; dosyalar aynı adlarla yeniden yüklenir. Başlamadan önce o anki durumun güvenlik yedeği
            otomatik alınır.
          </p>
          <ul class="bk-notes">
            <li>Üye hesapları (giriş bilgileri ve şifreler) geri yüklenmez. Yedekten sonra kayıt olan üyelerin hesabı ve profili korunur; yedekteki profiller üzerine yazılır.</li>
            <li>Moderasyon kaydı geri yüklenmez; şimdiki kayıt aynen kalır.</li>
            <li>Yedekte olmayan tablolara dokunulmaz. Sen her durumda yönetici kalırsın.</li>
            <li>İşlem sürerken tablolar arası bağlar geçici olarak kaldırılır ve bitince (iptalde de) yeniden kurulur. Bu sırada üyelerin uygulamayı kullanmaması en iyisidir.</li>
          </ul>

          <div class="btns">
            <button class="btn ghost" disabled={busy() || inspecting()} onClick={() => void pickZip()}>
              {inspecting() ? t("Yedek doğrulanıyor…") : t("Yedek dosyası seç (.zip)")}
            </button>
            <Show when={zip()}>
              <span class="bk-path muted">{zip()}</span>
            </Show>
          </div>
          <Show when={inspectErr()}>
            <p class="warn">{inspectErr()}</p>
          </Show>

          <Show when={info()}>
            {(i) => (
              <>
                <div class="bk-summary">
                  <div>
                    <small class="muted">Yedek tarihi</small>
                    <b>{fmtDate(i().manifest?.created_at)}</b>
                  </div>
                  <div>
                    <small class="muted">Tablolar</small>
                    <b>{t("{0} tablo · {1} satır", fmtNum(i().tables.length), fmtNum(i().rows))}</b>
                  </div>
                  <div>
                    <small class="muted">Dosyalar</small>
                    <b>{t("{0} dosya · {1}", fmtNum(i().files), fmtBytes(i().files_bytes))}</b>
                  </div>
                  <div>
                    <small class="muted">Sürüm / boyut</small>
                    <b>
                      v{String(i().manifest?.app_version ?? "?")} · {fmtBytes(i().size)}
                    </b>
                  </div>
                </div>

                <Show when={foreign()}>
                  <div class="bk-alert">
                    <b>DİKKAT: Bu yedek BAŞKA bir projeden alınmış!</b>
                    <span>{t("Yedeğin projesi: {0} — şu anki proje: {1}. Geri yüklersen bu projenin verileri başka bir projenin verileriyle değiştirilir.", String(i().manifest?.project_ref || "?"), currentProjectRef())}</span>
                    <label class="check">
                      <input type="checkbox" checked={rForeign()} disabled={busy()} onChange={(e) => setRForeign(e.currentTarget.checked)} />
                      <span>Farklı projeden olduğunu biliyorum, yine de geri yükle</span>
                    </label>
                  </div>
                </Show>
                <Show when={!i().ok}>
                  <div class="bk-alert">
                    <b>Yedek dosyası doğrulanamadı; geri yüklenemez.</b>
                    <ul>
                      <For each={i().problems}>{(p) => <li>{p}</li>}</For>
                    </ul>
                  </div>
                </Show>
                <Show when={i().warnings.length > 0}>
                  <ul class="bk-warnings">
                    <For each={i().warnings}>{(w) => <li>{w}</li>}</For>
                  </ul>
                </Show>
                <Show when={diff().gone.length > 0}>
                  <p class="bk-diff">
                    <b>Yedekte olup artık var olmayan tablolar (atlanır):</b> {diff().gone.join(", ")}
                  </p>
                </Show>
                <Show when={diff().extra.length > 0}>
                  <p class="bk-diff">
                    <b>Yedekte bulunmayan tablolar (dokunulmaz):</b> {diff().extra.join(", ")}
                  </p>
                </Show>

                <Show when={i().ok}>
                  <div class="bk-opts">
                    <label class="check">
                      <input type="checkbox" checked={rTables()} disabled={busy() || !hasTables()} onChange={(e) => setRTables(e.currentTarget.checked)} />
                      <span>
                        Veritabanı tablolarını geri yükle
                        <small class="muted"> yedekten sonra eklenen satırlar silinir</small>
                      </span>
                    </label>
                    <Show when={rTables() && hasTables()}>
                      <div class="bk-buckets">
                        <label class="check">
                          <input type="checkbox" checked={rOrphans()} disabled={busy()} onChange={(e) => setROrphans(e.currentTarget.checked)} />
                          <span>
                            Sahibi kalmamış satırları sil
                            <small class="muted"> hesabı artık olmayan üyelere ait kayıtlar; kapalıyken yalnızca raporlanır</small>
                          </span>
                        </label>
                      </div>
                    </Show>
                    <label class="check">
                      <input type="checkbox" checked={rStorage()} disabled={busy() || !hasFiles()} onChange={(e) => setRStorage(e.currentTarget.checked)} />
                      <span>
                        Dosyaları / görselleri geri yükle
                        <small class="muted"> aynı adla üzerine yazılır; değişmemiş dosyalar atlanır</small>
                      </span>
                    </label>
                    <Show when={rStorage() && hasFiles()}>
                      <div class="bk-buckets">
                        <label class="check">
                          <input type="checkbox" checked={rDelete()} disabled={busy()} onChange={(e) => setRDelete(e.currentTarget.checked)} />
                          <span>
                            Yedekte olmayan dosyaları sil
                            <small class="muted"> {t("yalnızca yedeğin kapsadığı kovalarda: {0}", i().buckets.join(", ") || "—")}</small>
                          </span>
                        </label>
                      </div>
                    </Show>
                    <label class="check">
                      <input type="checkbox" checked={rSafety()} disabled={busy()} onChange={(e) => setRSafety(e.currentTarget.checked)} />
                      <span>
                        Başlamadan önce güvenlik yedeği al
                        <small class="muted"> seçtiğin dosyanın yanına “…-geri-yukleme-oncesi-….zip”</small>
                      </span>
                    </label>
                    <Show when={!rSafety()}>
                      <p class="bk-alert">
                        <b>Güvenlik yedeği kapalı.</b> Geri yükleme yarıda kalırsa ya da yanlış dosyayı seçtiysen şimdiki duruma dönemezsin. Emin değilsen bu kutuyu işaretli bırak.
                      </p>
                    </Show>
                  </div>

                  <p class="hint">
                    Geri yüklemeyi iptal edersen veritabanı YARIM geri yüklenmiş kalır (bazı tablolar yedekteki, bazıları şimdiki halinde); tablo bağları yine de yeniden kurulur. Böyle bir
                    durumda güvenlik yedeğini ya da aynı yedeği yeniden geri yükle.
                  </p>
                  <label class="field bk-word">
                    <span class="field-label">{t("Onaylamak için {0} yaz", RESTORE_WORD)}</span>
                    <input type="text" value={word()} disabled={busy()} placeholder={RESTORE_WORD} onInput={(e) => setWord(e.currentTarget.value)} autocomplete="off" spellcheck={false} />
                  </label>
                  <div class="btns">
                    <button class="btn danger" disabled={!canRestore()} onClick={() => void startRestore()}>
                      Geri yüklemeyi başlat
                    </button>
                  </div>
                </Show>
              </>
            )}
          </Show>

          <Show when={phase() === "safety"}>
            <ProgressBox p={prog()} title={t("Güvenlik yedeği alınıyor (henüz hiçbir şeye dokunulmadı)")} onCancel={cancel} cancelling={cancelling()} />
          </Show>
          <Show when={phase() === "restore"}>
            <ProgressBox p={prog()} title={t("Geri yükleniyor — uygulamayı kapatma")} onCancel={cancel} cancelling={cancelling()} />
          </Show>

          <Show when={restoreErr()}>
            <p class="bk-alert">{restoreErr()}</p>
          </Show>
          <Show when={safetyFile()}>
            <p class="bk-diff">
              <b>Güvenlik yedeği:</b> <span class="bk-path">{safetyFile()}</span>{" "}
              <button class="btn ghost small" onClick={() => void props.run(() => revealBackup(safetyFile()), "")}>
                Klasörde göster
              </button>
            </p>
          </Show>
          <Show when={restoreDone()}>
            {(d) => (
              <div class="bk-result" classList={{ err: !d().ok }}>
                <Show
                  when={d().ok}
                  fallback={
                    <>
                      <b>{d().cancelled ? t("Geri yükleme iptal edildi.") : t("Geri yükleme tamamlanamadı: {0}", d().error)}</b>
                      <span>Veritabanı yarım geri yüklenmiş olabilir. Güvenlik yedeğini (ya da aynı yedeği) yeniden geri yükleyerek tutarlı duruma dön.</span>
                    </>
                  }
                >
                  <b>{d().errors.length ? t("Geri yükleme bitti (bazı öğeler yüklenemedi)") : t("Geri yükleme tamamlandı")}</b>
                  <span>
                    {t(
                      "{0} / {1} tablo · {2} satır · {3} dosya yüklendi · {4} dosya aynıydı · {5} dosya silindi · süre {6}",
                      fmtNum(d().summary?.tables ?? 0),
                      fmtNum(d().summary?.tables_total ?? 0),
                      fmtNum(d().summary?.rows ?? 0),
                      fmtNum(d().summary?.files_uploaded ?? 0),
                      fmtNum(d().summary?.files_same ?? 0),
                      fmtNum(d().summary?.files_deleted ?? 0),
                      fmtTime(d().elapsed_ms),
                    )}
                  </span>
                  <Show when={(d().summary?.missing_buckets ?? []).length > 0}>
                    <span class="warn">{t("Artık var olmayan kovalar (dosyaları yüklenmedi): {0}", (d().summary?.missing_buckets ?? []).join(", "))}</span>
                  </Show>
                  <Show when={(d().summary?.report?.orphans ?? []).length > 0}>
                    <div class="bk-orphans">
                      <b>{d().summary?.report?.orphans_deleted ? t("Sahibi kalmamış satırlar silindi:") : t("Sahibi kalmamış satırlar (silinmedi, yalnızca bilgi):")}</b>
                      <ul>
                        <For each={(d().summary?.report?.orphans ?? []) as { table: string; column: string; rows: number }[]}>
                          {(o) => (
                            <li>
                              {o.table}.{o.column}: {fmtNum(o.rows)}
                            </li>
                          )}
                        </For>
                      </ul>
                    </div>
                  </Show>
                  <Show when={(d().summary?.report?.fks_not_valid ?? []).length > 0}>
                    <span class="warn">
                      {t(
                        "Doğrulanamayan tablo bağları (üstü olmayan satırlar var; yeni kayıtlar için yine geçerli): {0}",
                        ((d().summary?.report?.fks_not_valid ?? []) as { table: string; conname: string }[]).map((x) => `${x.table}.${x.conname}`).join(", "),
                      )}
                    </span>
                  </Show>
                  <Show when={Number(d().summary?.report?.users_without_profile ?? 0) > 0}>
                    <span class="muted">{t("Profili olmayan üye hesabı: {0}", fmtNum(d().summary?.report?.users_without_profile ?? 0))}</span>
                  </Show>
                  <span class="muted">Değişikliklerin her yerde görünmesi için uygulamayı yeniden başlat.</span>
                </Show>
                <ErrorList done={d()} />
              </div>
            )}
          </Show>
        </section>
      </Show>
    </div>
  );
}
