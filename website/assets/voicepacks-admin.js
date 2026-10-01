// Yönetim › Ses paketleri (sadece yöneticiler): indirilebilir ses paketleri listesi (ekle / düzenle / yayınla / sil)
// ve üyelerin "Paketimi gönder" formuyla gönderdiği paketler (durum + yönetici notu).
// Boyut, SHA-256 ve ifade sayısını otomatik doldurmak için uygulamadaki Yönetim › Ses paketleri › "Bağlantıdan doldur"
// kullanılır (tarayıcı GitHub dosyasını indiremez). RPC'ler: voice_pack_* (c39_guncelleme.sql).
import { $, $$, esc, fmtDate, sb, toast } from "./core.js";

const REPO = "https://github.com/M0SAD/srtr-pitwall-sounds";
const STATUS = {
  new: ["warn", "Yeni"],
  reviewing: ["", "İnceleniyor"],
  accepted: ["ok", "Kabul edildi"],
  rejected: ["bad", "Reddedildi"],
};

let editing = null; // düzenlenen paket (null: form kapalı)
let isNew = false;
let subFilter = "";

async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

const fmtBytes = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n || 0} B`;
const safeUrl = (u) => (/^https:\/\//i.test(String(u || "")) ? String(u) : "");

const empty = () => ({
  id: "",
  name: "",
  language: "",
  author: "",
  version: 1,
  url: "",
  size_bytes: 0,
  sha256: "",
  phrases: 0,
  files: 0,
  format: "ogg",
  notes: "",
  published: false,
  sort: 0,
});

function formHtml(d) {
  const f = (name, label, val, extra = "") =>
    `<div class="field" style="margin:0"><label>${label}</label><input name="${name}" value="${esc(val ?? "")}" ${extra}></div>`;
  return `<form class="card stack" id="vpf" style="margin:16px 0">
    <h3 style="margin:0">${isNew ? "Yeni ses paketi" : `Düzenle: ${esc(d.id)}`}</h3>
    <div class="field" style="margin:0"><label>Zip bağlantısı (GitHub Releases)</label><input name="url" required value="${esc(d.url)}" placeholder="${REPO}/releases/download/tr-erkin-v1/tr-erkin.zip"></div>
    <div class="grid g3">
      ${f("id", "Kimlik (klasör adı)", d.id, `required maxlength="64" placeholder="tr-erkin" ${isNew ? "" : "readonly"}`)}
      ${f("name", "Ad", d.name, 'required maxlength="80"')}
      ${f("language", "Dil (tr, en, de, pt-BR…)", d.language, 'required maxlength="20"')}
      ${f("author", "Yazar", d.author, 'maxlength="80"')}
      ${f("version", "Sürüm", d.version, 'type="number" min="1" required')}
      ${f("sort", "Sıra", d.sort, 'type="number"')}
      ${f("size_bytes", "Boyut (bayt)", d.size_bytes, 'type="number" min="0"')}
      ${f("phrases", "İfade", d.phrases, 'type="number" min="0"')}
      ${f("files", "Kayıt", d.files, 'type="number" min="0"')}
      <div class="field" style="margin:0"><label>Biçim</label><select name="format">
        ${["ogg", "wav", "mixed"].map((x) => `<option value="${x}" ${d.format === x ? "selected" : ""}>${x === "mixed" ? "Karışık" : x.toUpperCase()}</option>`).join("")}
      </select></div>
    </div>
    ${f("sha256", "SHA-256 (boşsa uygulama doğrulama yapmaz)", d.sha256, 'maxlength="64" style="font-family:monospace"')}
    ${f("notes", "Not (kullanıcılara görünür)", d.notes, 'maxlength="1000"')}
    <label class="chk"><input type="checkbox" name="published" ${d.published ? "checked" : ""}><span><b>Yayında</b> (herkes görür ve indirebilir)</span></label>
    <p class="small muted" style="margin:0">Boyut, SHA-256 ve ifade/kayıt sayısını otomatik doldurmak için uygulamada Yönetim › Ses paketleri › "Bağlantıdan doldur" düğmesini kullan.</p>
    <div class="row"><button class="btn btn-accent">Kaydet</button><button type="button" class="btn btn-ghost" id="vpf-x">Vazgeç</button></div>
  </form>`;
}

function packHtml(p) {
  const btn = (act, text, cls = "") => `<button class="btn btn-sm ${cls}" data-vact="${act}" data-id="${esc(p.id)}">${text}</button>`;
  return `<div class="card">
    <div class="row between" style="align-items:flex-start;gap:12px">
      <div class="stack" style="gap:4px;min-width:0">
        <div><span class="badge ${p.published ? "ok" : "bad"}">${p.published ? "Yayında" : "Taslak"}</span> <b>${esc(p.name)}</b> <code class="muted">${esc(p.id)}</code></div>
        <div class="small muted">${esc(p.language)} · ${esc(p.author || "—")} · v${esc(p.version)} · ${esc(fmtBytes(p.size_bytes))} · ${esc(p.phrases)} ifade, ${esc(p.files)} kayıt · ${esc(String(p.format).toUpperCase())} · sıra ${esc(p.sort)}${p.sha256 ? "" : " · SHA-256 yok"}</div>
        <div class="small" style="word-break:break-all">${safeUrl(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)}</a>` : esc(p.url)}</div>
        ${p.notes ? `<div class="small muted">Not: ${esc(p.notes)}</div>` : ""}
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">
        ${btn("toggle", p.published ? "Yayından kaldır" : "Yayınla", p.published ? "" : "btn-accent")}
        ${btn("edit", "Düzenle")}
        ${btn("delete", "Sil", "btn-danger")}
      </div>
    </div>
  </div>`;
}

function subHtml(s) {
  const [tone, label] = STATUS[s.status] || ["", s.status];
  return `<div class="card">
    <div class="stack" style="gap:4px">
      <div><span class="badge ${tone}">${label}</span> <b>${esc(s.pack_name)}</b> <span class="muted small">${esc(s.language)}</span></div>
      <div class="small muted">${esc(s.user_name || "—")} · ${fmtDate(s.created_at, true)}${s.handled_by_name ? ` · İşleyen: ${esc(s.handled_by_name)}` : ""}</div>
      <div class="small" style="word-break:break-all">${safeUrl(s.link) ? `<a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">${esc(s.link)}</a>` : esc(s.link)}</div>
      ${s.message ? `<div class="small" style="white-space:pre-line">${esc(s.message)}</div>` : ""}
      <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">
        <select data-sstatus="${esc(s.id)}">${Object.entries(STATUS)
          .map(([k, [, l]]) => `<option value="${k}" ${s.status === k ? "selected" : ""}>${l}</option>`)
          .join("")}</select>
        <input data-snote="${esc(s.id)}" value="${esc(s.admin_note || "")}" placeholder="Yönetici notu (gönderen görür)" maxlength="2000" style="flex:1;min-width:200px">
        <button class="btn btn-sm btn-accent" data-ssave="${esc(s.id)}">Kaydet</button>
      </div>
    </div>
  </div>`;
}

export async function sesPaketleri(el, rerender) {
  const [packsRes, subs] = await Promise.all([
    sb.from("voice_packs").select("*").order("sort", { ascending: true }).order("language").order("name"),
    rpc("voice_pack_submissions_admin", { p_status: subFilter }),
  ]);
  if (packsRes.error) throw new Error(packsRes.error.message);
  const packs = packsRes.data || [];
  const list = subs || [];
  const open = list.filter((s) => s.status === "new" || s.status === "reviewing").length;

  el.innerHTML = `<h2>Ses paketleri</h2>
    <p class="muted small">Sesli mühendisin indirilebilir ses paketleri. Zip dosyaları GitHub'da
      <a href="${REPO}/releases" target="_blank" rel="noopener">M0SAD/srtr-pitwall-sounds → Releases</a> altında durur.</p>
    <details class="card" style="margin:10px 0"><summary><b>Paketi GitHub'a yükleme adımları</b></summary>
      <ol class="small" style="line-height:1.7;margin:8px 0 0">
        <li>Uygulamada Sesli Mühendis → "Kendi dilinde ses paketi yap" → "Ses paketi oluştur" ile zip yap (OGG dönüşümü açık; kökte pack.json olmalı).</li>
        <li><a href="${REPO}/releases/new" target="_blank" rel="noopener">Draft a new release</a> aç; etiket yaz (ör. <code>tr-erkin-v2</code>), başlık: paket adı ve sürüm.</li>
        <li>Zip'i "Attach binaries" alanına sürükle, yükleme bitince "Publish release".</li>
        <li>Zip dosyasının bağlantısını kopyala: <code>${REPO}/releases/download/&lt;etiket&gt;/&lt;dosya&gt;.zip</code></li>
        <li>Uygulamada Yönetim → Ses paketleri → "Yeni paket" / "Düzenle" → bağlantıyı yapıştır → "Bağlantıdan doldur" → sürümü artır → Yayında → Kaydet.
          (Burada da elle girilebilir; SHA-256 boş kalırsa doğrulama yapılmaz.)</li>
      </ol>
    </details>
    <div class="stats">
      <div class="stat"><small>Paket</small><b>${packs.length}</b></div>
      <div class="stat"><small>Yayında</small><b>${packs.filter((p) => p.published).length}</b></div>
      <div class="stat"><small>Bekleyen gönderi</small><b>${subFilter ? "—" : open}</b></div>
    </div>
    <div class="row" style="margin:16px 0 0"><button class="btn btn-accent" id="vp-new">Yeni paket</button></div>
    <div id="vp-form">${editing ? formHtml(editing) : ""}</div>
    <div class="stack" style="margin-top:12px">${packs.length ? packs.map(packHtml).join("") : `<p class="muted">Henüz paket yok.</p>`}</div>
    <h3 style="margin:26px 0 10px">Gönderilen paketler</h3>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">
      ${[["", "Hepsi"], ...Object.entries(STATUS).map(([k, [, l]]) => [k, l])]
        .map(([k, l]) => `<button class="btn btn-sm ${subFilter === k ? "btn-accent" : ""}" data-sfilter="${k}">${l}</button>`)
        .join("")}
    </div>
    <p class="muted small">Kabul ya da red seçilince gönderene uygulama içi bildirim gider (not da gösterilir).</p>
    <div class="stack">${list.length ? list.map(subHtml).join("") : `<p class="muted">Gönderi yok.</p>`}</div>`;

  const openForm = (d, fresh) => {
    editing = d;
    isNew = fresh;
    $("#vp-form").innerHTML = formHtml(d);
    bindForm();
    $("#vpf")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const bindForm = () => {
    const f = $("#vpf");
    if (!f) return;
    $("#vpf-x").addEventListener("click", () => {
      editing = null;
      $("#vp-form").innerHTML = "";
    });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const s = (k) => String(fd.get(k) || "").trim();
      const n = (k) => parseInt(s(k), 10) || 0;
      if (isNew && packs.some((p) => p.id === s("id")) && !confirm(`"${s("id")}" kimlikli paket zaten var; üzerine yazılsın mı?`)) return;
      const btn = f.querySelector("button.btn-accent");
      btn.disabled = true;
      try {
        await rpc("voice_pack_save", {
          p_id: s("id"),
          p_name: s("name"),
          p_language: s("language"),
          p_author: s("author"),
          p_version: Math.max(1, n("version")),
          p_url: s("url"),
          p_size: n("size_bytes"),
          p_sha256: s("sha256").toLowerCase(),
          p_phrases: n("phrases"),
          p_files: n("files"),
          p_format: s("format") || "ogg",
          p_notes: s("notes"),
          p_published: !!fd.get("published"),
          p_sort: n("sort"),
        });
        toast("Ses paketi kaydedildi");
        editing = null;
        rerender();
      } catch (err) {
        toast(err.message || String(err), true);
        btn.disabled = false;
      }
    });
  };
  bindForm();

  $("#vp-new").addEventListener("click", () => openForm(empty(), true));
  $$("[data-vact]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      const p = packs.find((x) => x.id === b.dataset.id);
      if (!p) return;
      const act = b.dataset.vact;
      if (act === "edit") return openForm({ ...p }, false);
      if (act === "delete" && !confirm(`"${p.name}" ses paketi listeden silinsin mi? (GitHub'daki dosya silinmez)`)) return;
      b.disabled = true;
      try {
        if (act === "delete") await rpc("voice_pack_delete", { p_id: p.id });
        else
          await rpc("voice_pack_save", {
            p_id: p.id, p_name: p.name, p_language: p.language, p_author: p.author, p_version: p.version, p_url: p.url,
            p_size: p.size_bytes, p_sha256: p.sha256, p_phrases: p.phrases, p_files: p.files, p_format: p.format,
            p_notes: p.notes, p_published: !p.published, p_sort: p.sort,
          });
        toast(act === "delete" ? "Ses paketi silindi" : p.published ? "Yayından kaldırıldı" : "Yayınlandı");
        rerender();
      } catch (err) {
        toast(err.message || String(err), true);
        b.disabled = false;
      }
    }),
  );
  $$("[data-sfilter]", el).forEach((b) =>
    b.addEventListener("click", () => {
      subFilter = b.dataset.sfilter;
      rerender();
    }),
  );
  $$("[data-ssave]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      const id = b.dataset.ssave;
      const st = $(`[data-sstatus="${id}"]`, el)?.value;
      const note = $(`[data-snote="${id}"]`, el)?.value || "";
      b.disabled = true;
      try {
        await rpc("voice_pack_submission_update", { p_id: id, p_status: st, p_note: note });
        toast("Gönderi güncellendi");
        rerender();
      } catch (err) {
        toast(err.message || String(err), true);
        b.disabled = false;
      }
    }),
  );
}
