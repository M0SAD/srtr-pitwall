// Güvenlik taraması: giriş YAPMADAN (yalnızca herkese açık anahtarla) hangi tablolardan satır okunabildiğini listeler.
// Kullanım:  node scripts/guvenlik-tara.mjs
// Adres ve herkese açık anahtar .env dosyasından okunur (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). Hiçbir şey yazmaz / değiştirmez.
// Beklenen: yalnızca ACIK_OLMASI_NORMAL listesindekiler satır döner. Başka bir tablo çıkarsa okuma kuralı fazla açıktır.
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const base = (env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const key = env.VITE_SUPABASE_ANON_KEY || "";
if (!base || !key) {
  console.error(".env içinde VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY bulunamadı");
  process.exit(1);
}

const ACIK_OLMASI_NORMAL = new Set(["app_config", "perm_groups", "pro_features", "teams", "team_members", "voice_packs", "profiles_public", "i18n_overrides"]);

const sql = fs.readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const names = new Set();
for (const m of sql.matchAll(/create (?:unlogged )?table if not exists public\.([a-z_0-9]+)/g)) names.add(m[1]);
for (const m of sql.matchAll(/create (?:or replace )?view public\.([a-z_0-9]+)/g)) names.add(m[1]);

let bad = 0;
for (const t of [...names].sort()) {
  try {
    const r = await fetch(`${base}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: key } });
    const j = await r.json().catch(() => null);
    if (Array.isArray(j) && j.length) {
      const ok = ACIK_OLMASI_NORMAL.has(t);
      if (!ok) bad++;
      console.log(`${ok ? "açık (normal) " : "AÇIK — İNCELE "} ${t}: ${Object.keys(j[0]).join(", ")}`);
    }
  } catch (e) {
    console.log(`hata           ${t}: ${e.message}`);
  }
}
console.log(bad ? `\n${bad} tablo beklenmedik biçimde herkese açık.` : "\nBeklenmedik açık tablo yok.");
process.exit(bad ? 2 : 0);
