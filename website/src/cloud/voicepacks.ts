// Ses paketleri (c39): yayındaki paket listesi (giriş gerekmez), "Paketimi gönder" formu ve yönetici işlemleri.
// Paket zip'leri GitHub Releases'te durur; uygulama Rust tarafında indirip kurar (voice_pack_install).

import { api } from "./supabase";
import { F, assertFeature } from "@/sdk/proFeatures";

export interface VoicePackRow {
  id: string;
  name: string;
  language: string;
  author: string;
  version: number;
  url: string;
  size_bytes: number;
  sha256: string;
  phrases: number;
  files: number;
  format: "wav" | "ogg" | "mixed";
  notes: string;
  published: boolean;
  sort: number;
  created_at?: string;
  updated_at?: string;
}

export type SubmissionStatus = "new" | "reviewing" | "accepted" | "rejected";

export interface VoiceSubmission {
  id: string;
  user_id?: string | null;
  user_name?: string;
  language: string;
  pack_name: string;
  link: string;
  message: string;
  status: SubmissionStatus;
  admin_note: string;
  created_at: string;
  updated_at: string;
  handled_by_name?: string;
}

/** Yayındaki paketler (yönetici yayında olmayanları da görür) */
export async function listVoicePacks(): Promise<VoicePackRow[]> {
  return (await api<VoicePackRow[]>("GET", "voice_packs?select=*&order=sort.asc,language.asc,name.asc", { auth: "optional" })) ?? [];
}

export function submitVoicePack(language: string, packName: string, link: string, message: string) {
  assertFeature(F.voicePackSubmit, "Ses paketi göndermek");
  return api<string>("POST", "rpc/voice_pack_submit", {
    body: { p_language: language.trim(), p_pack_name: packName.trim(), p_link: link.trim(), p_message: message.trim() },
  });
}

export async function mySubmissions(): Promise<VoiceSubmission[]> {
  return (await api<VoiceSubmission[]>("POST", "rpc/voice_pack_my_submissions", { body: {} })) ?? [];
}

// ---------------------------------------------------------------------------
// Yönetici
// ---------------------------------------------------------------------------

export function adminSaveVoicePack(p: VoicePackRow) {
  return api<string>("POST", "rpc/voice_pack_save", {
    body: {
      p_id: p.id.trim(),
      p_name: p.name.trim(),
      p_language: p.language.trim(),
      p_author: p.author.trim(),
      p_version: Math.max(1, Math.round(Number(p.version) || 1)),
      p_url: p.url.trim(),
      p_size: Math.max(0, Math.round(Number(p.size_bytes) || 0)),
      p_sha256: p.sha256.trim().toLowerCase(),
      p_phrases: Math.max(0, Math.round(Number(p.phrases) || 0)),
      p_files: Math.max(0, Math.round(Number(p.files) || 0)),
      p_format: p.format,
      p_notes: p.notes,
      p_published: p.published,
      p_sort: Math.round(Number(p.sort) || 0),
    },
  });
}

export function adminDeleteVoicePack(id: string) {
  return api("POST", "rpc/voice_pack_delete", { body: { p_id: id } });
}

export async function adminSubmissions(status = ""): Promise<VoiceSubmission[]> {
  return (await api<VoiceSubmission[]>("POST", "rpc/voice_pack_submissions_admin", { body: { p_status: status } })) ?? [];
}

export function adminUpdateSubmission(id: string, status: SubmissionStatus, note: string) {
  return api("POST", "rpc/voice_pack_submission_update", { body: { p_id: id, p_status: status, p_note: note } });
}

export const SUBMISSION_STATUS: Record<SubmissionStatus, { label: string; tone: string }> = {
  new: { label: "Yeni", tone: "warn" },
  reviewing: { label: "İnceleniyor", tone: "" },
  accepted: { label: "Kabul edildi", tone: "ok" },
  rejected: { label: "Reddedildi", tone: "bad" },
};

/** Dil kodunun adı (Intl; bilinmiyorsa kodun kendisi) */
export function languageName(code: string, locale: string): string {
  try {
    const n = new Intl.DisplayNames([locale], { type: "language" }).of(code);
    return n && n !== code ? n : code;
  } catch {
    return code;
  }
}

/** Dil kodundan bayrak kodu (tr → tr, en → gb, pt-BR → br, de → de…) */
export function languageFlag(code: string): string {
  const c = code.trim();
  const parts = c.split("-");
  if (parts[1] && /^[A-Za-z]{2}$/.test(parts[1])) return parts[1].toLowerCase();
  const MAP: Record<string, string> = {
    en: "gb", ja: "jp", zh: "cn", sv: "se", da: "dk", cs: "cz", el: "gr", uk: "ua", ko: "kr", he: "il", ar: "sa",
    fa: "ir", hi: "in", nb: "no", nn: "no", sl: "si", et: "ee", ca: "es-ct", eu: "es-pv", gl: "es-ga", sr: "rs", vi: "vn",
  };
  const l = parts[0].toLowerCase();
  return MAP[l] ?? l;
}

export const fmtBytes = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`;
