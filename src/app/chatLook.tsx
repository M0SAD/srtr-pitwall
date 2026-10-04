// Sohbet görünümü (Ayarlar → Sohbet): balon renkleri, biçim, yazı boyutu, opaklık ve sohbet arka planı.
// Sadece bu kullanıcı görür. Arkadaş sohbeti (FriendsDock, Arkadaşlar penceresi) ve takım sohbeti kullanır.
// Arka plan görseli ayar klasöründe tek dosya (chat-bg.jpg); ayardaki imgRev değişince her pencere yeniden yükler.

import { Show, createEffect, createRoot, createSignal, on, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/sdk/platform";
import { DEFAULT_CHAT_LOOK, settings, updateSettings, type ChatLook } from "@/sdk/settings";
import "./chatlook.css";

/** Panelin vurgu rengi (balon varsayılanı) ve sohbet zemini: yazı rengi bunlara göre seçilir */
const ACCENT = "#ff8a2a";
const FRIEND_DEFAULT = "#22262f";
const BASE = "#121419";

export const BUBBLE_PRESETS = ["#ff8a2a", "#2e7cf6", "#3ddc84", "#e5484d", "#a970ff", "#ffc53d", "#14b8a6", "#f472b6", "#e6e8ec", "#22262f", "#3a4150"];
export const SOLID_PRESETS = ["#121419", "#1b2230", "#0f1f1a", "#24161a", "#1d1830", "#2a2a2a", "#0b0d10"];
export const GRADIENTS: { id: string; name: string; css: string }[] = [
  { id: "dusk", name: "Alacakaranlık", css: "linear-gradient(160deg, #1f2440 0%, #3a2a4f 55%, #5a3240 100%)" },
  { id: "ocean", name: "Okyanus", css: "linear-gradient(160deg, #0b1d33 0%, #0f3a4f 55%, #11505a 100%)" },
  { id: "forest", name: "Orman", css: "linear-gradient(160deg, #0d1a12 0%, #143322 55%, #21452c 100%)" },
  { id: "ember", name: "Kor", css: "linear-gradient(160deg, #1a0f0b 0%, #3b1a10 55%, #5a2412 100%)" },
  { id: "grape", name: "Üzüm", css: "linear-gradient(160deg, #160f26 0%, #2c1846 55%, #43205a 100%)" },
  { id: "carbon", name: "Karbon", css: "repeating-linear-gradient(45deg, #15171b 0 6px, #1b1e23 6px 12px)" },
  { id: "night", name: "Gece pisti", css: "radial-gradient(120% 80% at 50% 0%, #2a3350 0%, #121521 60%, #0a0b10 100%)" },
  { id: "sunset", name: "Gün batımı", css: "linear-gradient(180deg, #2b1630 0%, #57263a 50%, #8a3b2e 100%)" },
];

export function gradientCss(id: string) {
  return (GRADIENTS.find((g) => g.id === id) ?? GRADIENTS[0]).css;
}

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lum([r, g, b]: [number, number, number]) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Balon rengi (opaklıkla koyu zemine karışmış haliyle) için okunur yazı rengi ve soluk saat rengi */
export function contrastFor(hex: string, alpha = 1): { fg: string; sub: string } {
  const c = rgb(hex) ?? rgb(FRIEND_DEFAULT)!;
  const base = rgb(BASE)!;
  const mix = c.map((v, i) => v * alpha + base[i] * (1 - alpha)) as [number, number, number];
  // Beyaz ve koyu yazıdan hangisi daha yüksek karşıtlık veriyorsa o
  const L = lum(mix);
  const light = (L + 0.05) / 0.056 > 1.05 / (L + 0.05);
  return light ? { fg: "#15110c", sub: "rgba(20, 16, 10, 0.62)" } : { fg: "#f4f6fa", sub: "rgba(235, 240, 248, 0.62)" };
}

function rgba(hex: string, a: number) {
  const c = rgb(hex) ?? rgb(FRIEND_DEFAULT)!;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.round(a * 100) / 100})`;
}

const FONT: Record<ChatLook["size"], string> = { s: "12.5px", m: "13.5px", l: "15.5px" };

/** `.fchat` öğesine konan sınıflar */
export function chatLookClass(l: ChatLook = look()) {
  return { cl: true, [`cl-${l.shape}`]: l.shape !== "rounded", "cl-has-bg": l.bg !== "none" };
}

/** `.fchat` öğesine konan CSS değişkenleri */
export function chatLookStyle(l: ChatLook = look()): JSX.CSSProperties {
  const a = Math.max(0.4, Math.min(1, (l.opacity || 100) / 100));
  const st: Record<string, string> = { "--cl-fs": FONT[l.size] ?? FONT.m };
  // Benim balonum: renk seçilmediyse ve opak ise temanın degrade balonu kalır
  if (l.mine || a < 1) {
    const hex = l.mine || ACCENT;
    const c = contrastFor(hex, a);
    st["--cl-mine-bg"] = l.mine ? rgba(hex, a) : `color-mix(in srgb, var(--accent) ${Math.round(a * 100)}%, transparent)`;
    st["--cl-mine-fg"] = c.fg;
    st["--cl-mine-sub"] = c.sub;
  }
  if (l.friend || a < 1) {
    const hex = l.friend || FRIEND_DEFAULT;
    const c = contrastFor(hex, a);
    st["--cl-friend-bg"] = rgba(hex, a);
    st["--cl-friend-fg"] = c.fg;
    st["--cl-friend-sub"] = c.sub;
  }
  if (l.bg !== "none") {
    st["--cl-dim"] = String(Math.max(0, Math.min(80, l.dim)) / 100);
    st["--cl-blur"] = `${l.bg === "image" ? Math.max(0, Math.min(20, l.blur)) : 0}px`;
  }
  return st as JSX.CSSProperties;
}

export function look(): ChatLook {
  return settings().general.chatLook ?? DEFAULT_CHAT_LOOK;
}

// ---- Arka plan görseli (pencere başına bir kez yüklenir, imgRev değişince yenilenir) ----

const [bgUrl, setBgUrl] = createSignal<string | null>(null);
let bgStarted = false;
function ensureBg() {
  if (bgStarted || !inTauri) return;
  bgStarted = true;
  let cur: string | null = null;
  let token = 0;
  createRoot(() =>
    createEffect(
      on(
        () => {
          const l = look();
          return [l.bg === "image" && l.hasImg, l.imgRev] as const;
        },
        async ([want]) => {
          const my = ++token;
          if (!want) {
            if (cur) URL.revokeObjectURL(cur);
            cur = null;
            setBgUrl(null);
            return;
          }
          try {
            const buf = await invoke<ArrayBuffer>("chat_bg_read");
            if (my !== token) return;
            if (cur) URL.revokeObjectURL(cur);
            cur = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
            setBgUrl(cur);
          } catch {
            // Dosya bu bilgisayarda yok (ör. ayarlar başka bilgisayardan geldi): arka plan çizilmez
            if (my === token) setBgUrl(null);
          }
        },
      ),
    ),
  );
}

export function chatBgUrl() {
  ensureBg();
  return bgUrl();
}

/** Mesaj listesinin arkasındaki katman; mesajlar her zaman üstte (z-index).
 *  `img` verilirse (sohbete özel arka plan) genel görsel yerine o kullanılır. */
export function ChatBg(props: { look?: ChatLook; img?: string | null }) {
  const l = () => props.look ?? look();
  const url = () => (props.img !== undefined ? props.img : chatBgUrl());
  return (
    <Show when={l().bg !== "none" && (l().bg !== "image" || url())}>
      <div class="fchat-bg" aria-hidden="true">
        <i
          classList={{ img: l().bg === "image" }}
          style={
            l().bg === "image"
              ? { "background-image": `url("${url()}")` }
              : { background: l().bg === "solid" ? l().bgColor : gradientCss(l().gradient) }
          }
        />
        <b />
      </div>
    </Show>
  );
}

/** Mesaj listesini saran sahne: arka plan katmanı + mesajlar */
export function ChatStage(props: { children: JSX.Element; look?: ChatLook; img?: string | null }) {
  return (
    <div class="fchat-stage">
      {props.children}
    </div>
  );
}

// ---- Görsel seçme ----

function toBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

/** Seçilen dosyayı en fazla 1600 px'e küçültüp ayar klasörüne kaydeder ve arka plan yapar */
export async function importChatBg(file: File) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Sadece PNG, JPEG ya da WebP seçebilirsin.");
  if (file.size > 30 * 1024 * 1024) throw new Error("Dosya çok büyük (en fazla 30 MB).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Görsel açılamadı."));
      i.src = url;
    });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d")!;
    g.fillStyle = BASE;
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Görsel işlenemedi."))), "image/jpeg", 0.88));
    await invoke("chat_bg_import", { data: await toBase64(blob) });
  } finally {
    URL.revokeObjectURL(url);
  }
  updateSettings((d) => {
    const l = d.general.chatLook;
    l.hasImg = true;
    l.bg = "image";
    l.imgRev = (l.imgRev || 0) + 1;
  });
}

export async function clearChatBg() {
  await invoke("chat_bg_clear").catch(() => {});
  updateSettings((d) => {
    const l = d.general.chatLook;
    l.hasImg = false;
    if (l.bg === "image") l.bg = "none";
    l.imgRev = (l.imgRev || 0) + 1;
  });
}
