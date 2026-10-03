// Yönetim › Yedekleme (c67): bütün içeriği tek .zip olarak indirme ve o .zip'ten geri yükleme.
// Oturum burada (arayüzde) durur; HTTP ve zip işini Rust yapar (src-tauri/src/backup.rs). Erişim anahtarı Rust'a
// yalnızca bellekte tutulmak üzere verilir; oturum yenilendikçe `backup_token` ile güncellenir.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createEffect, createRoot, on } from "solid-js";
import { api, projectRef, session, token } from "./supabase";

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const RESTORE_WORD = "GERİ YÜKLE";
/** Onay sözcüğü yazıldı mı (büyük/küçük harf ve noktalı/noktasız I farkı gözetilmez) */
export const restoreWordOk = (v: string) => {
  const n = (x: string) => x.trim().toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/\s+/g, " ");
  return n(v) === n(RESTORE_WORD);
};

export interface BackupTable {
  name: string;
  rows: number;
  bytes: number;
}
export interface BackupBucket {
  id: string;
  name: string;
  public: boolean;
  objects: number;
  bytes: number;
}
export interface BackupOptions {
  tables: boolean;
  users: boolean;
  storage: boolean;
  buckets: string[];
}
export interface RestoreOptions {
  tables: boolean;
  storage: boolean;
  delete_extra: boolean;
  delete_orphans: boolean;
}
export interface BackupProgress {
  kind: "backup" | "restore";
  step: "" | "scan" | "tables" | "users" | "files" | "delete" | "finish" | "done";
  label: string;
  tables_done: number;
  tables_total: number;
  rows_done: number;
  rows_total: number;
  files_done: number;
  files_total: number;
  bytes_done: number;
  bytes_total: number;
  percent: number;
  elapsed_ms: number;
}
export interface BackupError {
  kind: string;
  name: string;
  error: string;
}
export interface BackupDone {
  kind: "backup" | "restore";
  ok: boolean;
  cancelled: boolean;
  error: string;
  path: string;
  summary: Record<string, any> | null;
  errors: BackupError[];
  elapsed_ms: number;
}
export interface BackupInspect {
  ok: boolean;
  problems: string[];
  warnings: string[];
  manifest: Record<string, any>;
  tables: { name: string; rows: number; ok: boolean; complete: boolean }[];
  rows: number;
  files: number;
  files_bytes: number;
  files_missing: number;
  buckets: string[];
  size: number;
}

/** Geri yüklenmeyen tablolar (c67: backup_protected) */
export const PROTECTED_TABLES = ["backup_restore_stage", "backup_restore_fks", "mod_log"];

export const backupTables = () => api<BackupTable[]>("POST", "rpc/admin_backup_tables", { body: {} }).then((r) => r ?? []);
export const backupBuckets = () => api<BackupBucket[]>("POST", "rpc/admin_backup_buckets", { body: {} }).then((r) => r ?? []);
export type BackupLogAction = "backup_run" | "restore_run" | "restore_done" | "restore_failed";
/** Moderasyon kaydına düş (hata yutulur: kayıt yazılamadı diye iş durmasın) */
export const backupLog = (action: BackupLogAction, info: Record<string, unknown>) =>
  api("POST", "rpc/admin_backup_log", { body: { p_action: action, p_info: info } }).catch(() => null);

export const currentProjectRef = () => projectRef();

/** Varsayılan dosya adı: SRTR-Pitwall-yedek-YYYYAAGG-SSDD.zip */
export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `SRTR-Pitwall-yedek-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`;
}

/** Geri yükleme öncesi güvenlik yedeğinin yolu: seçilen dosyanın yanına …-geri-yukleme-oncesi.zip (varsa -2, -3…) */
export function safetyPath(zipPath: string, d = new Date()): string {
  const base = zipPath.replace(/\.zip$/i, "").replace(/-geri-yukleme-oncesi(-\d{8}-\d{4})?$/i, "");
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `${base}-geri-yukleme-oncesi-${stamp}.zip`;
}

async function auth() {
  const tk = await token();
  if (!URL_ || !KEY || !tk) throw new Error("Bu işlem için giriş yapmalısın");
  return { url: URL_, anon_key: KEY, token: tk, project_ref: projectRef() };
}

interface Handlers {
  onProgress?: (p: BackupProgress) => void;
}

/** Rust işini başlatır ve "backup-done" gelene kadar bekler; bu sürede yenilenen oturum anahtarını iletir */
async function runJob(cmd: "backup_run" | "restore_run", args: Record<string, unknown>, h: Handlers): Promise<BackupDone> {
  const a = await auth();
  const un: UnlistenFn[] = [];
  let dispose = () => {};
  try {
    let finish: (d: BackupDone) => void = () => {};
    const done = new Promise<BackupDone>((resolve) => (finish = resolve));
    un.push(await listen<BackupDone>("backup-done", (e) => finish(e.payload)));
    un.push(await listen<BackupProgress>("backup-progress", (e) => h.onProgress?.(e.payload)));
    // Sunucu "oturum süresi doldu" dediğinde: yenile ve ilet
    un.push(
      await listen("backup-need-token", () => {
        void token().then((tk) => tk && invoke("backup_token", { token: tk }));
      }),
    );
    // Oturum değişince (yenilenince) yeni anahtarı ilet
    createRoot((d) => {
      dispose = d;
      createEffect(
        on(
          () => session()?.access_token,
          (tk) => {
            if (tk) void invoke("backup_token", { token: tk });
          },
          { defer: true },
        ),
      );
    });
    // Oturum bir saat sürer: uzun işlerde süresi dolmadan yenilensin (token() son 60 sn'de yeniler)
    const iv = window.setInterval(() => void token().then((tk) => tk && invoke("backup_token", { token: tk })), 30_000);
    try {
      await invoke(cmd, { ...args, auth: a });
      return await done;
    } finally {
      clearInterval(iv);
    }
  } finally {
    dispose();
    un.forEach((u) => u());
  }
}

export const runBackup = (dest: string, options: BackupOptions, h: Handlers = {}) =>
  runJob("backup_run", { dest, options: { ...options, created_at: new Date().toISOString() } }, h);
export const runRestore = (path: string, options: RestoreOptions, h: Handlers = {}) => runJob("restore_run", { path, options }, h);
export const inspectBackup = (path: string) => invoke<BackupInspect>("backup_inspect", { path });
export const cancelBackup = () => invoke("backup_cancel");
export const backupBusy = () => invoke<boolean>("backup_busy");
export const revealBackup = (path: string) => invoke("backup_reveal", { path });

// --- Yarım kalmış geri yükleme (c68): saklı yabancı anahtarlar ---------------------------------------------------
export interface FkState {
  table: string;
  conname: string;
  orphans?: number | null;
}
export interface RepairResult {
  restored: number;
  notValid: FkState[];
}
/** Geri yükleme için kaldırılıp henüz yeniden kurulmamış yabancı anahtar sayısı (0 = her şey yerinde) */
export const restorePending = () => api<number>("POST", "rpc/admin_restore_pending", { body: {} }).then((n) => Number(n ?? 0));
/** Saklı yabancı anahtarları yeniden kurar ve tek tek doğrular; doğrulanamayanlar (yetim satır) listelenir */
export async function restoreRepair(): Promise<RepairResult> {
  const r = await api<{ fks_restored: number; fks_not_valid: FkState[] }>("POST", "rpc/admin_restore_repair", { body: {} });
  const notValid: FkState[] = [];
  for (const c of r?.fks_not_valid ?? []) {
    try {
      const v = await api<{ valid: boolean; orphans: number }>("POST", "rpc/admin_restore_validate", { body: { p_table: c.table, p_conname: c.conname, p_delete_orphans: false } });
      if (!v?.valid) notValid.push({ ...c, orphans: v?.orphans ?? null });
    } catch {
      notValid.push({ ...c, orphans: null });
    }
  }
  return { restored: Number(r?.fks_restored ?? 0), notValid };
}
