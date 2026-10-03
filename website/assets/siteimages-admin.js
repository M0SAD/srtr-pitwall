// Yönetim › Ana sayfa görselleri (sadece yöneticiler): ana sayfadaki ve Özellikler sayfasındaki görsel yuvalarına
// görsel yükle / alt metin yaz / varsayılana dön; ana sayfa galerisine görsel ekle, sırala, kaldır.
// Dosyalar 'site' kovasına home/<yuva>-<zaman>.<uzantı> adıyla yüklenir, eşleme app_config.site_images'ta saklanır
// (RPC: admin_set_site_images — c54_guncelleme.sql). Yuva listesi: siteimages.js › SLOTS.
import { $, $$, esc, sb, toast } from "./core.js";
import { GALLERY_SLOT, SITE_BUCKET, SITE_PUBLIC, SLOTS, cleanImages } from "./siteimages.js";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_GALLERY = 24;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

let map = {};
let busy = false;

const CSS = `
.si-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.si-card{display:flex;flex-direction:column;gap:10px}
.si-card h4{margin:0;font-size:14px}
.si-prev{position:relative;height:170px;border:1px solid var(--line);border-radius:10px;background:var(--bg-2);display:flex;align-items:center;justify-content:center;overflow:hidden}
.si-prev img{max-width:100%;max-height:100%;object-fit:contain;display:block}
.si-prev .si-none{color:var(--muted);font-size:12px;text-align:center;padding:10px}
.si-prev .badge{position:absolute;left:8px;top:8px}
.si-card input[type=text]{width:100%}
.si-gal{display:flex;flex-direction:column;gap:10px}
.si-gal-row{display:grid;grid-template-columns:120px 1fr auto;gap:12px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--bg-2)}
.si-gal-row img{width:120px;height:68px;object-fit:cover;border-radius:6px;display:block}
@media (max-width:620px){.si-gal-row{grid-template-columns:90px 1fr}.si-gal-row img{width:90px;height:52px}.si-gal-row .row{grid-column:1/-1}}
`;

async function load() {
  const { data, error } = await sb.from("app_config").select("site_images").eq("id", 1).maybeSingle();
  if (error) throw new Error(/site_images/.test(error.message) ? "site_images sütunu yok: önce supabase/c54_guncelleme.sql çalıştırılmalı." : error.message);
  map = cleanImages(data?.site_images);
}

async function save(next) {
  const { error } = await sb.rpc("admin_set_site_images", { p_images: next });
  if (error) throw new Error(error.message);
  map = next;
  try {
    localStorage.setItem("pitwall.site.images", JSON.stringify(map));
  } catch {}
}

/** Genel adresten kova içi yol (bizim yüklediğimiz dosya değilse "") */
const pathOf = (url) => (typeof url === "string" && url.startsWith(SITE_PUBLIC + "home/") ? decodeURIComponent(url.slice(SITE_PUBLIC.length).split("?")[0]) : "");

async function removeFile(url) {
  const p = pathOf(url);
  if (!p) return;
  try {
    await sb.storage.from(SITE_BUCKET).remove([p]);
  } catch {}
}

function dims(file) {
  return new Promise((res) => {
    const u = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(u);
      res({ w: im.naturalWidth || 0, h: im.naturalHeight || 0 });
    };
    im.onerror = () => {
      URL.revokeObjectURL(u);
      res(null);
    };
    im.src = u;
  });
}

/** Dosyayı denetler, yükler; {url, w, h} döner */
async function upload(file, slot) {
  const ext = TYPES[file.type];
  if (!ext) throw new Error("Sadece JPEG, PNG, WEBP ya da GIF yüklenebilir.");
  if (file.size > MAX_BYTES) throw new Error("Görsel en fazla 4 MB olabilir.");
  const d = await dims(file);
  if (!d || !d.w || !d.h) throw new Error("Görsel okunamadı (bozuk dosya?).");
  const path = `home/${slot.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from(SITE_BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return { url: SITE_PUBLIC + path, w: d.w, h: d.h };
}

function pick() {
  return new Promise((res) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = Object.keys(TYPES).join(",");
    inp.onchange = () => res(inp.files?.[0] || null);
    inp.click();
  });
}

const gallery = () => (Array.isArray(map[GALLERY_SLOT]) ? map[GALLERY_SLOT] : []);

function slotCard([id, label, page, def, size]) {
  const cur = map[id] && !Array.isArray(map[id]) ? map[id] : null;
  const src = cur?.url || def;
  return `<div class="card si-card" data-slot="${esc(id)}">
    <div><h4>${esc(label)}</h4><span class="muted tiny">${esc(id)} · ${esc(page)} · önerilen ${esc(size)}</span></div>
    <div class="si-prev">
      <span class="badge ${cur ? "ok" : ""}">${cur ? "Yüklenen görsel" : def ? "Varsayılan" : "Varsayılan çizim"}</span>
      ${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<span class="si-none">Görsel yok: sitede hazır çizim gösteriliyor.</span>`}
    </div>
    <div class="field" style="margin:0"><label>Alt metin (isteğe bağlı)</label>
      <input type="text" maxlength="300" data-alt value="${esc(cur?.alt || "")}" placeholder="Görseli anlatan kısa metin" ${cur ? "" : "disabled"}></div>
    <div class="row">
      <button class="btn btn-sm btn-accent" data-act="up">Görsel yükle</button>
      <button class="btn btn-sm" data-act="alt" ${cur ? "" : "disabled"}>Alt metni kaydet</button>
      <button class="btn btn-sm btn-danger" data-act="reset" ${cur ? "" : "disabled"}>Varsayılana dön</button>
    </div>
  </div>`;
}

function galleryHtml() {
  const g = gallery();
  return `<div class="card">
    <div class="row between"><div><h3 style="margin:0">Ana sayfa galerisi</h3>
      <p class="muted small" style="margin:4px 0 0">Ana sayfada özelliklerin altında yatay bir ekran görüntüsü şeridi. Liste boşsa bölüm hiç görünmez. Sıra buradaki sıradır (en fazla ${MAX_GALLERY}).</p></div>
      <button class="btn btn-sm btn-accent" data-gact="add" ${g.length >= MAX_GALLERY ? "disabled" : ""}>Görsel ekle</button></div>
    <div class="si-gal" style="margin-top:12px">${
      g.length
        ? g
            .map(
              (it, i) => `<div class="si-gal-row" data-i="${i}">
        <img src="${esc(it.url)}" alt="" loading="lazy">
        <input type="text" maxlength="300" data-galt value="${esc(it.alt || "")}" placeholder="Alt metin / başlık (isteğe bağlı)">
        <div class="row">
          <button class="btn btn-sm" data-gact="up" title="Yukarı" ${i ? "" : "disabled"}>↑</button>
          <button class="btn btn-sm" data-gact="down" title="Aşağı" ${i < g.length - 1 ? "" : "disabled"}>↓</button>
          <button class="btn btn-sm" data-gact="alt">Kaydet</button>
          <button class="btn btn-sm btn-danger" data-gact="del">Kaldır</button>
        </div></div>`,
            )
            .join("")
        : `<p class="muted small" style="margin:0">Galeride görsel yok.</p>`
    }</div>
  </div>`;
}

function draw(el) {
  const group = (page) => SLOTS.filter((s) => s[2] === page).map(slotCard).join("");
  el.innerHTML = `<style>${CSS}</style>
    <h2 style="margin-top:0">Ana sayfa görselleri</h2>
    <p class="muted small">Sitedeki görsel yuvalarına kendi görselini yükle (JPEG / PNG / WEBP / GIF, en fazla 4 MB). Yükleme hemen yayına girer; eski dosya silinir.
      "Varsayılana dön" siteyle gelen görseli / çizimi geri getirir. Ziyaretçilerde değişiklik sayfa yenilenince görünür.</p>
    <h3>Ana sayfa <a class="muted tiny" href="index.html" target="_blank" rel="noopener">aç ↗</a></h3>
    <div class="si-grid">${group("index.html")}</div>
    <div style="margin:18px 0">${galleryHtml()}</div>
    <h3>Özellikler sayfası <a class="muted tiny" href="features.html" target="_blank" rel="noopener">aç ↗</a></h3>
    <div class="si-grid">${group("features.html")}</div>
    <details style="margin-top:18px"${SLOTS.some((x) => x[2] === "gallery" && map[x[0]]) ? " open" : ""}>
      <summary style="cursor:pointer"><b>Ana sayfa · Overlay Galerisi</b> <span class="muted tiny">her overlay'in önizleme görseli (${SLOTS.filter((x) => x[2] === "gallery").length})</span></summary>
      <p class="muted small">Galeride overlay seçilince sağda görünen görsel. Koyu zeminli, 16:10 oranında (ör. 720×450) görseller en iyi sonucu verir.</p>
      <div class="si-grid">${group("gallery")}</div>
    </details>`;
}

/** İşlemi sırayla çalıştırır, hata olursa bildirir, sonunda yeniden çizer */
async function run(el, fn, okMsg) {
  if (busy) return;
  busy = true;
  $$("button", el).forEach((b) => (b.disabled = true));
  try {
    await load(); // başka sekmede / programda yapılan değişikliği ezmemek için
    await fn();
    if (okMsg) toast(okMsg);
  } catch (e) {
    toast(e.message || String(e), true);
  }
  busy = false;
  draw(el);
}

export async function siteGorselleri(el) {
  await load();
  draw(el);
  if (el.dataset.siBound) return;
  el.dataset.siBound = "1";
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act], button[data-gact]");
    if (!b || b.disabled || busy) return;
    // Yuvalar
    if (b.dataset.act) {
      const card = b.closest("[data-slot]");
      const id = card.dataset.slot;
      const alt = $("[data-alt]", card).value.trim();
      if (b.dataset.act === "up") {
        const file = await pick();
        if (!file) return;
        await run(
          el,
          async () => {
            const old = map[id]?.url;
            const up = await upload(file, id);
            try {
              await save({ ...map, [id]: { ...up, alt } });
            } catch (err) {
              await removeFile(up.url);
              throw err;
            }
            if (old && old !== up.url) await removeFile(old);
          },
          "Görsel yüklendi",
        );
      } else if (b.dataset.act === "alt") {
        await run(
          el,
          async () => {
            if (!map[id]) throw new Error("Önce görsel yükle.");
            await save({ ...map, [id]: { ...map[id], alt } });
          },
          "Alt metin kaydedildi",
        );
      } else if (b.dataset.act === "reset") {
        if (!confirm("Bu yuvadaki görsel kaldırılıp varsayılana dönülsün mü?")) return;
        await run(
          el,
          async () => {
            const old = map[id]?.url;
            const next = { ...map };
            delete next[id];
            await save(next);
            await removeFile(old);
          },
          "Varsayılana dönüldü",
        );
      }
      return;
    }
    // Galeri
    const act = b.dataset.gact;
    const row = b.closest("[data-i]");
    const i = row ? +row.dataset.i : -1;
    const withList = (list) => {
      const next = { ...map };
      if (list.length) next[GALLERY_SLOT] = list;
      else delete next[GALLERY_SLOT];
      return next;
    };
    if (act === "add") {
      const file = await pick();
      if (!file) return;
      await run(
        el,
        async () => {
          if (gallery().length >= MAX_GALLERY) throw new Error(`Galeride en fazla ${MAX_GALLERY} görsel olabilir.`);
          const up = await upload(file, "gallery");
          try {
            await save(withList([...gallery(), { ...up, alt: "" }]));
          } catch (err) {
            await removeFile(up.url);
            throw err;
          }
        },
        "Galeriye eklendi",
      );
    } else if (act === "up" || act === "down") {
      const url = gallery()[i]?.url;
      await run(el, async () => {
        const list = [...gallery()];
        const at = list.findIndex((x) => x.url === url);
        const to = at + (act === "up" ? -1 : 1);
        if (at < 0 || to < 0 || to >= list.length) return;
        [list[at], list[to]] = [list[to], list[at]];
        await save(withList(list));
      });
    } else if (act === "alt") {
      const url = gallery()[i]?.url;
      const alt = $("[data-galt]", row).value.trim();
      await run(el, async () => save(withList(gallery().map((x) => (x.url === url ? { ...x, alt } : x)))), "Kaydedildi");
    } else if (act === "del") {
      const url = gallery()[i]?.url;
      if (!url || !confirm("Bu görsel galeriden kaldırılsın mı?")) return;
      await run(
        el,
        async () => {
          await save(withList(gallery().filter((x) => x.url !== url)));
          await removeFile(url);
        },
        "Galeriden kaldırıldı",
      );
    }
  });
}
