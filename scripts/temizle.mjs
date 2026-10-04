// Eski / yanlış yere kopyalanmış dosyaları siler. Zip klasörün üzerine çıkarıldığında projeden KALDIRILAN dosyalar
// depoda kalır ve derlemeyi bozar (ör. silinen LogosPanel.tsx). Derlemeden önce (npm run build) ve site yayınından
// önce çalışır; listede olmayan hiçbir şeye dokunmaz. Yeni bir dosya projeden kaldırılınca buraya eklenir.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STALE = [
  // 041026-74: Canlı Sohbet › Yayın bilgisi özelliği kaldırıldı
  "src-tauri/src/livechat/streaminfo.rs",
  "src/app/pages/livechat/StreamInfoTab.tsx",
  // 021026-62: Ayarlar › Araç logoları bölümü kaldırıldı
  "src/app/components/LogosPanel.tsx",
  // 021026-50: eski Twitch sohbet overlay'i kaldırıldı
  "src/overlays/twitch",
  // Projenin tamamı yanlışlıkla website/ içine de çıkarılmış (site yayınına karışmasın)
  "website/src",
  "website/src-tauri",
  "website/supabase",
  "website/scripts",
  "website/docs",
  "website/website",
  "website/.github",
  "website/node_modules",
  "website/dist",
  "website/.env.example",
  "website/.gitignore",
  "website/README.md",
  "website/SURUM_NOTLARI.md",
  "website/app-icon.png",
  "website/build.bat",
  "website/dev.bat",
  "website/overlay.html",
  "website/window.html",
  "website/package.json",
  "website/package-lock.json",
  "website/tsconfig.json",
  "website/version.json",
  "website/vite.config.ts",
];

let n = 0;
for (const rel of STALE) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) continue;
  fs.rmSync(p, { recursive: true, force: true });
  console.log("temizle: silindi", rel);
  n++;
}
if (n) console.log(`temizle: ${n} eski öğe silindi. Bu silmeleri depoya da gönder (commit + push).`);
