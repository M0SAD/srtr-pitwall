// Yöneticinin değiştirebildiği site görselleri (ana sayfa + Özellikler sayfası).
//
// Eşleme: app_config.site_images (jsonb, herkes okur; yazma: admin_set_site_images — c54_guncelleme.sql)
//   { "<yuva>": { url, alt, w, h }, "home.gallery": [ { url, alt, w, h }, … ] }
// Sayfada iki tür yuva var:
//   <img data-slot="home.hero" src="assets/img/layout.jpg" …>   → siteyle gelen varsayılan görsel; eşleme varsa src değişir,
//                                                                 yüklenemezse varsayılana döner.
//   <div class="slot-box" data-slot="feat.livechat">çizim</div>  → varsayılanı CSS çizimi; eşleme varsa üstüne görsel konur,
//                                                                 yüklenemezse çizim kalır.
// Son eşleme localStorage'da saklanır (sonraki açılışta görsel hemen değişir, sunucu yanıtı beklenmez).
// Dosyalar: 'site' depolama kovası, home/<yuva>-<zaman>.<uzantı> (sadece yöneticiler yükler; bkz. siteimages-admin.js).
import { SUPABASE_URL, sb } from "./core.js";
import { NAMES, OVERLAY_LIST, overlayImage, overlaySlot } from "./overlays.js";

export const GALLERY_SLOT = "home.gallery";
export const SITE_BUCKET = "site";
export const SITE_PUBLIC = `${SUPABASE_URL}/storage/v1/object/public/${SITE_BUCKET}/`;

/** Bütün yuvalar: [kimlik, yönetim panelindeki ad, sayfa, varsayılan görsel ("" = çizim), önerilen boyut] */
export const SLOTS = [
  ["home.hero", "Ana sayfa · üst (hero) görseli", "index.html", "assets/img/layout.jpg", "1100×566"],
  ["home.panel", "Ana sayfa · Kontrol paneli", "index.html", "assets/img/panel.jpg", "1400×803"],
  ["home.friends", "Ana sayfa · Arkadaşlar (dar, dikey)", "index.html", "assets/img/friend.jpg", "360×836"],
  ["feat.hero", "Özellikler · üst (hero) görseli", "features.html", "assets/img/layout.jpg", "1100×566"],
  ["feat.overlays", "Özellikler · Overlay'ler", "features.html", "assets/img/panel.jpg", "1400×803"],
  ["feat.livechat", "Özellikler · Canlı Sohbet", "features.html", "", "1200×750"],
  ["feat.voice", "Özellikler · Sesli Mühendis", "features.html", "", "1200×750"],
  ["feat.community", "Özellikler · Topluluk", "features.html", "", "1200×750"],
  ["feat.social", "Özellikler · Arkadaşlar ve takımlar", "features.html", "", "1200×750"],
  ["feat.telemetry", "Özellikler · Telemetri", "features.html", "", "1200×750"],
  ["feat.shots", "Özellikler · Ekran görüntüleri", "features.html", "", "1200×750"],
  ["feat.layouts", "Özellikler · Düzenler ve profiller", "features.html", "", "1200×750"],
  ["feat.stream", "Özellikler · Yayın düzenleri", "features.html", "", "1200×750"],
  ["feat.vr", "Özellikler · VR", "features.html", "", "1200×750"],
  // Ana sayfa › Overlay Galerisi: her overlay'in önizleme görseli (yuva "ov.<kimlik>", varsayılan assets/img/ov/<kimlik>.webp).
  // Galeri bu yuvaları data-slot ile değil overrideFor() ile okur (tek <img>, seçime göre değişir).
  ...OVERLAY_LIST.map((o) => [overlaySlot(o.id), `Overlay Galerisi · ${NAMES[o.id]?.[0] ?? o.id}`, "gallery", overlayImage(o.id), "720×450"]),
];

const CACHE = "pitwall.site.images";

const okUrl = (u) => typeof u === "string" && /^https:\/\//i.test(u);
const okItem = (v) => v && typeof v === "object" && !Array.isArray(v) && okUrl(v.url);

/** Sunucudan / önbellekten gelen veriyi temizler (bozuk kayıtlar atılır) */
export function cleanImages(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) {
      const list = v.filter(okItem);
      if (list.length) out[k] = list;
    } else if (okItem(v)) out[k] = v;
  }
  return out;
}

function cached() {
  try {
    return cleanImages(JSON.parse(localStorage.getItem(CACHE) || "null"));
  } catch {
    return {};
  }
}

function setImg(img, it) {
  if (!img.dataset.def) {
    img.dataset.def = img.getAttribute("src") || "";
    img.dataset.defAlt = img.getAttribute("alt") || "";
    img.dataset.defW = img.getAttribute("width") || "";
    img.dataset.defH = img.getAttribute("height") || "";
  }
  const back = () => {
    img.onerror = null;
    img.src = img.dataset.def;
    img.alt = img.dataset.defAlt;
    if (img.dataset.defW) img.setAttribute("width", img.dataset.defW);
    if (img.dataset.defH) img.setAttribute("height", img.dataset.defH);
  };
  if (!it) {
    if (img.getAttribute("src") !== img.dataset.def) back();
    return;
  }
  if (img.getAttribute("src") === it.url) return;
  img.onerror = back;
  if (it.w > 0 && it.h > 0) {
    img.setAttribute("width", String(it.w));
    img.setAttribute("height", String(it.h));
  }
  img.alt = it.alt || img.dataset.defAlt;
  img.src = it.url;
}

function setBox(box, it) {
  let img = box.querySelector(":scope > img.slot-img");
  if (!it) {
    img?.remove();
    box.classList.remove("has-img");
    return;
  }
  if (img && img.getAttribute("src") === it.url) return;
  img?.remove();
  img = new Image();
  img.className = "slot-img";
  img.alt = it.alt || "";
  img.loading = "lazy";
  img.decoding = "async";
  img.onload = () => box.classList.add("has-img");
  img.onerror = () => {
    img.remove();
    box.classList.remove("has-img");
  };
  img.src = it.url;
  box.appendChild(img);
}

function setGallery(el, list) {
  const items = Array.isArray(list) ? list : [];
  const host = el.closest("[data-gallery-host]") || el;
  host.hidden = !items.length;
  const sig = JSON.stringify(items);
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  el.textContent = "";
  for (const it of items) {
    const a = document.createElement("a");
    a.href = it.url;
    a.target = "_blank";
    a.rel = "noopener";
    const img = new Image();
    img.alt = it.alt || "";
    img.loading = "lazy";
    img.decoding = "async";
    if (it.w > 0 && it.h > 0) {
      img.width = it.w;
      img.height = it.h;
    }
    img.onerror = () => {
      a.remove();
      if (!el.children.length) host.hidden = true;
    };
    img.src = it.url;
    a.appendChild(img);
    if (it.alt) {
      const cap = document.createElement("span");
      cap.textContent = it.alt;
      a.appendChild(cap);
    }
    el.appendChild(a);
  }
}

let current = {};
/** Yuvaya yüklenmiş görsel ({url, alt, w, h}) ya da null; tek öğesi seçime göre değişen bileşenler (Overlay Galerisi) kullanır */
export function overrideFor(slot) {
  const v = current[slot];
  return okItem(v) ? v : null;
}

/** Eşlemeyi sayfaya uygular */
export function applyImages(map, root = document) {
  current = map || {};
  document.dispatchEvent(new CustomEvent("siteimages"));
  root.querySelectorAll("[data-slot]").forEach((el) => {
    const v = map[el.dataset.slot];
    if (el.dataset.slot === GALLERY_SLOT || el.hasAttribute("data-gallery")) setGallery(el, v);
    else if (el.tagName === "IMG") setImg(el, okItem(v) ? v : null);
    else setBox(el, okItem(v) ? v : null);
  });
}

/** Önbellekteki (son görülen) eşlemeyi uygular; ağ beklemez */
export function applyCachedImages() {
  try {
    applyImages(cached());
  } catch {}
}

/**
 * Sayfa açılışında çağrılır: önce önbellekteki eşleme, sonra sunucudaki.
 * cfg verilirse (app_config satırı zaten okunduysa) ayrıca istek atılmaz.
 * Ağ / sütun yoksa sessizce varsayılan görseller kalır.
 */
export async function initSiteImages(cfg = null) {
  applyCachedImages();
  try {
    let raw = cfg && typeof cfg === "object" ? cfg.site_images : undefined;
    if (raw === undefined) {
      const { data, error } = await sb.from("app_config").select("site_images").eq("id", 1).maybeSingle();
      if (error) return;
      raw = data?.site_images;
    }
    const map = cleanImages(raw);
    try {
      localStorage.setItem(CACHE, JSON.stringify(map));
    } catch {}
    applyImages(map);
  } catch {}
}
