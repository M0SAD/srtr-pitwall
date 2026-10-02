// OpenVR C API işlev tablolarını (FnTable) resmi openvr_capi.h başlığından üretir.
//
// Kullanım:
//   node scripts/openvr_gen.mjs <openvr_capi.h yolu> <etiket, ör. v2.5.1>
//
// Başlık: https://raw.githubusercontent.com/ValveSoftware/openvr/<etiket>/headers/openvr_capi.h
// Aynı etiketin bin/win64/openvr_api.dll dosyası src-tauri/resources/openvr/ altına konur.
//
// Ürettikleri (elle DÜZENLEME):
//   src-tauri/src/vrnative/openvr_capi_excerpt.h  başlığın kullanılan kısımları (birim testi bunu ayrıca çözümler)
//   src-tauri/src/vrnative/openvr_gen.rs          tablo sıraları (indeksler) ve kullanılan işlevlerin Rust imzaları
//
// Tablo, C'de yalnız işlev işaretçilerinden oluşan bir yapıdır; Rust tarafında işaretçi dizisi olarak okunur
// ve alan sırası = indeks. Sıra hatası çökmeye yol açacağı için elle yazılmaz.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [, , headerPath, tag] = process.argv;
if (!headerPath || !tag) {
  console.error("Kullanım: node scripts/openvr_gen.mjs <openvr_capi.h> <etiket>");
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src-tauri", "src", "vrnative");
const h = readFileSync(headerPath, "utf8").replace(/\r\n/g, "\n");

/** Kullanılan arayüzler ve işlevler (imzası üretilecekler) */
const TABLES = {
  IVRSystem: ["GetDeviceToAbsoluteTrackingPose", "PollNextEvent", "AcknowledgeQuit_Exiting"],
  IVROverlay: [
    "FindOverlay",
    "CreateOverlay",
    "DestroyOverlay",
    "GetOverlayErrorNameFromEnum",
    "SetOverlayColor",
    "SetOverlayAlpha",
    "SetOverlaySortOrder",
    "SetOverlayWidthInMeters",
    "SetOverlayCurvature",
    "SetOverlayTransformAbsolute",
    "ShowOverlay",
    "HideOverlay",
    "SetOverlayRaw",
  ],
};

/** C türü -> Rust türü. Listede olmayan tür hatadır (tahmin yürütülmez). */
const TYPES = {
  void: "()",
  bool: "u8", // C bool: 1 bayt; Rust bool olarak okumak 0/1 dışı değerde tanımsız davranış olurdu
  float: "f32",
  uint32_t: "u32",
  uint64_t: "u64",
  VROverlayHandle_t: "u64",
  EVROverlayError: "i32",
  ETrackingUniverseOrigin: "i32",
  "char *": "*const c_char",
  "void *": "*mut c_void",
  "VROverlayHandle_t *": "*mut u64",
  "struct HmdMatrix34_t *": "*mut HmdMatrix34",
  "struct TrackedDevicePose_t *": "*mut TrackedDevicePose",
  "struct VREvent_t *": "*mut c_void",
};
// typedef'ler başlıkta gerçekten beklenen türler mi (türler değişirse üretim dursun)
for (const [re, what] of [
  [/typedef uint64_t VROverlayHandle_t;/, "VROverlayHandle_t = uint64_t"],
  [/typedef uint32_t TrackedDeviceIndex_t;/, "TrackedDeviceIndex_t = uint32_t"],
]) {
  if (!re.test(h)) throw new Error(`Başlıkta beklenen tanım yok: ${what}`);
}
const rustType = (c) => {
  const k = c.replace(/\s+/g, " ").trim();
  if (!(k in TYPES)) throw new Error(`Bilinmeyen C türü: "${k}"`);
  return TYPES[k];
};

function block(re, name) {
  const m = h.match(re);
  if (!m) throw new Error(`Başlıkta bulunamadı: ${name}`);
  return m[0];
}

const excerpt = [];
const versions = {};
const tables = {};
for (const iface of Object.keys(TABLES)) {
  const v = block(new RegExp(`static const char \\* ${iface}_Version = "(${iface}_\\d+)";`), `${iface}_Version`);
  versions[iface] = v.match(/"(.+)"/)[1];
  excerpt.push(v);
}
for (const e of ["ETrackingUniverseOrigin", "EVRApplicationType"]) {
  excerpt.push(block(new RegExp(`typedef enum ${e}\\n\\{[^}]*\\} ${e};`), e));
}
const enumVal = (name) => Number(block(new RegExp(`\\b${name} = (-?\\d+),`), name).match(/= (-?\d+)/)[1]);
const consts = {
  UNIVERSE_SEATED: enumVal("ETrackingUniverseOrigin_TrackingUniverseSeated"),
  UNIVERSE_STANDING: enumVal("ETrackingUniverseOrigin_TrackingUniverseStanding"),
  APP_OVERLAY: enumVal("EVRApplicationType_VRApplication_Overlay"),
  APP_BACKGROUND: enumVal("EVRApplicationType_VRApplication_Background"),
  EVENT_QUIT: enumVal("EVREventType_VREvent_Quit"),
};
excerpt.push(block(/\tEVREventType_VREvent_Quit = \d+,/, "VREvent_Quit"));
for (const s of ["HmdMatrix34_t", "HmdVector3_t", "TrackedDevicePose_t", "VREvent_Reserved_t"]) {
  excerpt.push(block(new RegExp(`typedef struct ${s}\\n\\{[^}]*\\} ${s};`), s));
}
excerpt.push(block(/struct VREvent_t\n\{[^}]*\};/, "VREvent_t"));

for (const iface of Object.keys(TABLES)) {
  const src = block(new RegExp(`struct VR_${iface}_FnTable\\n\\{[^}]*\\};`), `VR_${iface}_FnTable`);
  excerpt.push(src);
  const fns = [];
  for (const line of src.split("\n").slice(2, -1)) {
    const m = line.match(/^\t(.+?) ?\(OPENVR_FNTABLE_CALLTYPE \*(\w+)\)\((.*)\);$/);
    if (!m) throw new Error(`Çözümlenemeyen tablo satırı (${iface}): ${line}`);
    fns.push({ ret: m[1].trim(), name: m[2], args: m[3].trim(), decl: line.trim() });
  }
  if (new Set(fns.map((f) => f.name)).size !== fns.length) throw new Error(`${iface}: yinelenen işlev adı`);
  tables[iface] = fns;
}
const flat = h.match(/^S_API .*;$/gm) ?? [];
if (flat.length < 5) throw new Error("S_API bildirimleri bulunamadı");
excerpt.push(flat.join("\n"));

const head = `// OpenVR SDK ${tag} — openvr_capi.h dosyasından alıntı (scripts/openvr_gen.mjs üretir, elle düzenleme).
// Kaynak: https://github.com/ValveSoftware/openvr/blob/${tag}/headers/openvr_capi.h
// Copyright (c) 2015, Valve Corporation. BSD-3-Clause (bkz. src-tauri/resources/openvr/LICENSE.txt).
`;
writeFileSync(join(outDir, "openvr_capi_excerpt.h"), head + "\n" + excerpt.join("\n\n") + "\n");

let rs = `// scripts/openvr_gen.mjs üretir — ELLE DÜZENLEME. Kaynak: OpenVR SDK ${tag}, headers/openvr_capi.h
#![allow(non_upper_case_globals, non_camel_case_types, non_snake_case, dead_code)]

use super::{HmdMatrix34, TrackedDevicePose};
use std::ffi::{c_char, c_void};

/// Başlığın ve paketlenen openvr_api.dll dosyasının alındığı OpenVR SDK etiketi
pub const OPENVR_TAG: &str = "${tag}";
`;
for (const [k, v] of Object.entries(consts)) rs += `pub const ${k}: i32 = ${v};\n`;
for (const [iface, fns] of Object.entries(tables)) {
  const up = iface.toUpperCase();
  rs += `\n/// Arayüz sürümü (VR_GetGenericInterface("FnTable:" + sürüm))\npub const ${up}_VERSION: &str = "${versions[iface]}";\n`;
  rs += `/// VR_${iface}_FnTable alanları, başlıktaki sırayla (indeks = tablodaki konum)\npub const ${up}_FNS: [&str; ${fns.length}] = [\n`;
  for (const f of fns) rs += `    "${f.name}",\n`;
  rs += `];\n\n/// Kullanılan ${iface} işlevleri: tablo indeksi, Rust imzası ve başlıktaki C bildirimi\npub mod ${iface.toLowerCase()} {\n    use super::*;\n`;
  for (const name of TABLES[iface]) {
    const i = fns.findIndex((f) => f.name === name);
    if (i < 0) throw new Error(`${iface}.${name} başlıkta yok`);
    const f = fns[i];
    const args = f.args
      ? f.args.split(",").map((a) => {
          const m = a.trim().match(/^(.*?)(\w+)$/);
          return `${m[2]}: ${rustType(m[1])}`;
        })
      : [];
    const ret = rustType(f.ret);
    rs += `\n    // ${f.decl}\n    pub const ${name}: usize = ${i};\n`;
    rs += `    pub type Fn${name} = unsafe extern "system" fn(${args.join(", ")})${ret === "()" ? "" : ` -> ${ret}`};\n`;
  }
  rs += `\n    /// (ad, indeks, C bildirimi): birim testi alıntı başlıkla karşılaştırır\n    pub const USED: [(&str, usize, &str); ${TABLES[iface].length}] = [\n`;
  for (const name of TABLES[iface]) {
    const f = fns.find((x) => x.name === name);
    rs += `        ("${name}", ${name}, "${f.decl}"),\n`;
  }
  rs += `    ];\n}\n`;
}
writeFileSync(join(outDir, "openvr_gen.rs"), rs);
console.log(`OpenVR ${tag}: ` + Object.entries(tables).map(([k, v]) => `${versions[k]} (${v.length} işlev)`).join(", "));
