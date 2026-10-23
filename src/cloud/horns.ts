// Korna sesleri (c136): programdaki hazır kornalar + yöneticinin eklediği kornalar (horns tablosu, 'horns' kovası).
// access: "pro" (PRO üyeler), "admin" (yalnızca yöneticiler). Kornayı çalmak PRO özelliği (F.horn); duymak herkese açık.
// Yönetici ses dosyasını (MP3, OGG, WAV, M4A…) yüklerken tarayıcıda çözülür, en çok 4 sn'ye kısaltılır, sesi
// dengelenir ve mono 22 kHz WAV olarak yüklenir (Rust tarafı WAV / OGG çalar).

import { api, cloudEnabled, publicUrl, storageRemove, storageUpload } from "./supabase";

export type HornAccess = "pro" | "admin";
export interface Horn {
  /** "b:short" (hazır) ya da "db:<uuid>" */
  key: string;
  id?: string;
  name: string;
  /** İndirme adresi (hazır kornalarda yok) */
  url?: string;
  file?: string;
  access: HornAccess;
  sort: number;
  active: boolean;
  builtin?: boolean;
  duration_ms?: number;
}

export const BUILTIN_HORNS: Horn[] = [
  { key: "b:short", name: "Kısa korna", access: "pro", sort: -50, active: true, builtin: true },
  { key: "b:double", name: "Çift korna", access: "pro", sort: -40, active: true, builtin: true },
  { key: "b:long", name: "Uzun korna", access: "pro", sort: -30, active: true, builtin: true },
  { key: "b:truck", name: "Kamyon kornası", access: "pro", sort: -20, active: true, builtin: true },
  { key: "b:bike", name: "Bisiklet zili", access: "pro", sort: -10, active: true, builtin: true },
];

const BUCKET = "horns";
interface Row {
  id: string;
  name: string;
  file: string;
  duration_ms: number;
  access: HornAccess;
  sort: number;
  active: boolean;
}
const toHorn = (r: Row): Horn => ({ key: `db:${r.id}`, id: r.id, name: r.name, file: r.file, url: publicUrl(BUCKET, r.file), access: r.access, sort: r.sort, active: r.active, duration_ms: r.duration_ms });

/** Hazır + sunucudaki kornalar (yönetici kapalıları da görür) */
export async function hornList(): Promise<Horn[]> {
  let rows: Row[] = [];
  if (cloudEnabled) {
    rows = (await api<Row[]>("GET", "horns?select=*&order=sort.asc,created_at.asc", { auth: "optional" }).catch(() => [] as Row[])) ?? [];
  }
  return [...BUILTIN_HORNS, ...rows.map(toHorn)];
}

export const hornSave = (id: string, p: Partial<Pick<Row, "name" | "access" | "sort" | "active">>) =>
  api("PATCH", `horns?id=eq.${encodeURIComponent(id)}`, { body: p, prefer: "return=minimal" });

export async function hornDelete(h: Horn) {
  if (!h.id) return;
  await api("DELETE", `horns?id=eq.${encodeURIComponent(h.id)}`);
  if (h.file) await storageRemove(BUCKET, [h.file]).catch(() => {});
}

/** Ses dosyasını WAV'a çevirip yükler ve korna olarak ekler */
export async function hornAdd(f: File, name: string, access: HornAccess, sort: number) {
  const { wav, ms } = await toWav(f);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
  await storageUpload(BUCKET, path, wav, "audio/wav", false);
  try {
    await api("POST", "horns", { body: { name: name.trim().slice(0, 40), file: path, duration_ms: ms, access, sort }, prefer: "return=minimal" });
  } catch (e) {
    await storageRemove(BUCKET, [path]).catch(() => {});
    throw e;
  }
}

const MAX_SEC = 4;
const RATE = 22050;

/** Herhangi bir ses dosyasını mono 22 kHz 16 bit WAV'a çevirir: baştaki sessizlik atılır, en çok 4 sn, ses dengelenir */
export async function toWav(f: File): Promise<{ wav: Blob; ms: number }> {
  if (f.size > 15 * 1024 * 1024) throw new Error("Ses dosyası en fazla 15 MB olabilir");
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(await f.arrayBuffer());
  } catch {
    throw new Error("Ses dosyası açılamadı (MP3, OGG, WAV ya da M4A olmalı)");
  } finally {
    void ctx.close();
  }
  // Mono ve 22 kHz'e indir
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * RATE)), RATE);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  const out = (await off.startRendering()).getChannelData(0);
  // Baştaki / sondaki sessizlik
  const th = 0.01;
  let a = 0;
  while (a < out.length && Math.abs(out[a]) < th) a++;
  let b = out.length;
  while (b > a && Math.abs(out[b - 1]) < th) b--;
  if (b - a < RATE * 0.05) throw new Error("Ses dosyası boş ya da çok kısa");
  b = Math.min(b, a + RATE * MAX_SEC);
  const pcm = out.slice(a, b);
  // Dengele (tepe 0.89) ve uçlara kısa yumuşatma
  let peak = 0;
  for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.89 / peak : 1;
  const fade = Math.min(Math.floor(RATE * 0.01), Math.floor(pcm.length / 4));
  const n = pcm.length;
  const data = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  data.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, RATE, true);
  data.setUint32(28, RATE * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  str(36, "data");
  data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    let v = pcm[i] * k;
    if (i < fade) v *= i / fade;
    if (i >= n - fade) v *= (n - 1 - i) / fade;
    data.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(v * 32767))), true);
  }
  return { wav: new Blob([data.buffer], { type: "audio/wav" }), ms: Math.round((n / RATE) * 1000) };
}
