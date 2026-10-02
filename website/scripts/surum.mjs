#!/usr/bin/env node
// Sürüm yükseltme betiği.
//
// Sürüm biçimi: GGAAYY-NN  (ör. 290926-01)
//   GGAAYY = yükseltmenin yapıldığı gün/ay/yıl
//   NN     = her değişiklikte 1 artan sıra numarası (günle sıfırlanmaz)
//
// Windows kurulum paketleri ve otomatik güncelleme "1.0.NN" biçiminde sayısal bir sürüm
// ister; betik ikisini birlikte tutar. Tek kaynak: version.json
//
// Kullanım:
//   node scripts/surum.mjs          -> bir sonraki sürüme yükselt
//   node scripts/surum.mjs --goster -> mevcut sürümü yazdır

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (f) => resolve(root, f);

const version = JSON.parse(readFileSync(p("version.json"), "utf8"));

if (process.argv.includes("--goster")) {
  console.log(`${version.display} (${version.semver})`);
  process.exit(0);
}

const now = new Date();
const dd = String(now.getDate()).padStart(2, "0");
const mm = String(now.getMonth() + 1).padStart(2, "0");
const yy = String(now.getFullYear()).slice(-2);
const counter = version.counter + 1;

const next = {
  display: `${dd}${mm}${yy}-${String(counter).padStart(2, "0")}`,
  counter,
  semver: `1.0.${counter}`,
  date: `${now.getFullYear()}-${mm}-${dd}`,
};

writeFileSync(p("version.json"), JSON.stringify(next, null, 2) + "\n");

// tauri.conf.json
const tauriConf = JSON.parse(readFileSync(p("src-tauri/tauri.conf.json"), "utf8"));
tauriConf.version = next.semver;
writeFileSync(p("src-tauri/tauri.conf.json"), JSON.stringify(tauriConf, null, 2) + "\n");

// package.json
const pkg = JSON.parse(readFileSync(p("package.json"), "utf8"));
pkg.version = next.semver;
writeFileSync(p("package.json"), JSON.stringify(pkg, null, 2) + "\n");

// Cargo.toml ([package] bölümündeki ilk version satırı)
const cargo = readFileSync(p("src-tauri/Cargo.toml"), "utf8");
writeFileSync(p("src-tauri/Cargo.toml"), cargo.replace(/^version = ".*"$/m, `version = "${next.semver}"`));

console.log(`Sürüm yükseltildi: ${version.display} -> ${next.display}  (paket sürümü ${next.semver})`);
console.log(`SURUM_NOTLARI.md dosyasının en üstüne "## ${next.display}" başlığıyla değişiklikleri yazmayı unutma.`);
console.log(`Yayınlamak için: değişiklikleri GitHub Desktop ile push et; yayın kendiliğinden başlar`);
