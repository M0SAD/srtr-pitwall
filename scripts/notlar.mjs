#!/usr/bin/env node
// SURUM_NOTLARI.md içinden en üstteki (en yeni) sürümün notlarını yazdırır.
// Yayın iş akışı bunu GitHub Release açıklaması ve güncelleme notu olarak kullanır.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(resolve(root, "SURUM_NOTLARI.md"), "utf8");
const parts = text.split(/^## /m);
const latest = parts[1] ?? "";
const [, ...body] = latest.split("\n");
console.log(body.join("\n").trim());
