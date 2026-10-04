// Üye profili (sunucu c31), sitenin ortak parçaları: profil fotoğrafı ("avatars" kovası), sosyal bağlantılar
// (kendi çizdiğimiz tek renk simgeler), oyun rozeti, herkese açık profil kartı ve Hesabım sayfasındaki düzenleyici.
// Kullananlar: yarisci.html (drivers.js), takimlar.html (teams.js), hesap.html (account.js), arkadaş listesi.
//
//   avatarUrl(path) · avatarHtml(id, name, path, size) · socialIcon(type) · socialsHtml(list) · simBadge(sim)
//   publicProfile(id) · profileHero(p, extra) · profileDetails(p) · loadAvatars(ids) · mountProfileEditor(el, user)
import { $, $$, T, addDict, esc, fmtDate, lang, sb, SUPABASE_URL, toast } from "./core.js";

addDict({
  pf_title: ["Herkese açık profil", "Public profile"],
  pf_lead: [
    "Fotoğrafın, tanıtımın ve bağlantıların arkadaş listesinde, takım sayfalarında ve Yarışçılar sayfasındaki profilinde görünür. iRacing adın ve simlerdeki adların kendiliğinden eklenir.",
    "Your photo, bio and links appear in friend lists, team pages and your profile on the Drivers page. Your iRacing name and in-sim names are added automatically.",
  ],
  pf_photo: ["Profil fotoğrafı", "Profile photo"],
  pf_photo_note: ["JPEG, PNG ya da WebP. Kare olarak kırpılır ve küçültülür.", "JPEG, PNG or WebP. Cropped to a square and resized."],
  pf_upload: ["Fotoğraf yükle", "Upload photo"],
  pf_change: ["Değiştir", "Change"],
  pf_remove: ["Kaldır", "Remove"],
  pf_uploading: ["Yükleniyor…", "Uploading…"],
  pf_bio: ["Kısa tanıtım", "Short bio"],
  pf_bio_ph: [
    "Kendinden kısaca bahset: hangi seride yarışıyorsun, takımın, yayın saatlerin…",
    "Tell others about yourself: which series you race, your team, your stream schedule…",
  ],
  pf_links: ["Sosyal bağlantılar", "Social links"],
  pf_add_link: ["+ Bağlantı ekle", "+ Add link"],
  pf_links_note: [
    "Sadece https:// ile başlayan adresler. Bağlantı türü adresten kendiliğinden seçilir.",
    "Only addresses starting with https://. The link type is picked automatically from the address.",
  ],
  pf_bad_url: [
    "Bağlantılar https:// ile başlamalı ve en çok 200 karakter olmalı.",
    "Links must start with https:// and be at most 200 characters.",
  ],
  pf_view: ["Profilimi gör", "View my profile"],
  pf_member_since: ["Üyelik: {0}", "Member since {0}"],
  pf_teams: ["Takımlar", "Teams"],
  pf_playing: ["Şu an {0} oynuyor", "Playing {0} now"],
  pf_not_image: ["Bir görsel dosyası seç (JPEG, PNG ya da WebP)", "Choose an image file (JPEG, PNG or WebP)"],
  pf_bad_image: ["Görsel okunamadı", "Couldn't read the image"],
  pf_website: ["İnternet sitesi", "Website"],
  pf_other: ["Diğer", "Other"],
  pf_edit: ["Profili düzenle", "Edit profile"],
  pf_ir_lic: ["iRacing lisansı ve Safety Rating", "iRacing licence and Safety Rating"],
  pf_ir_updated: ["güncellendi: {0}", "updated: {0}"],
  pf_ir_only_me: ["(sadece sen görüyorsun)", "(only you can see this)"],
  pf_ir_public: ["iRacing bilgilerimi profilimde göster", "Show my iRacing stats on my profile"],
  pf_ir_public_d: [
    "iRating, lisans (Safety Rating) ve ülken; SRTR Pitwall ile iRacing'de sürdükçe kendiliğinden güncellenir. Açıkken profilinde ve demo modundaki adının yanında görünür.",
    "Your iRating, licence (Safety Rating) and country; updated automatically whenever you drive in iRacing with SRTR Pitwall. When on, they appear on your profile and next to your name in demo mode.",
  ],
  pf_ir_none: [
    "Henüz bilgi yok: programda hesabınla giriş yapıp iRacing'de bir oturuma gir.",
    "No data yet: sign in to the app and join an iRacing session.",
  ],
});

export const AVATAR_BUCKET = "avatars";
export const avatarUrl = (path) =>
  path ? `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${String(path).split("/").map(encodeURIComponent).join("/")}` : "";

/** Kimlikten sabit renk (programdaki arkadaş avatarıyla aynı) */
export function hashColor(id) {
  let h = 0x811c9dc5;
  const s = String(id || "?");
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return `hsl(${h % 360} 58% 50%)`;
}
const initial = (name) => ([...String(name || "?").trim()][0] || "?").toLocaleUpperCase(lang);

/** Avatar: fotoğraf varsa fotoğraf, yoksa renkli zemin + baş harf */
export function avatarHtml(id, name, path, size = 36, cls = "") {
  injectCss();
  const url = avatarUrl(path);
  return `<span class="pf-av ${cls}" translate="no" style="--sz:${size}px;--fc:${hashColor(id)}">${
    url ? `<img src="${esc(url)}" alt="" loading="lazy">` : esc(initial(name))
  }</span>`;
}

// ---------------------------------------------------------------------------
// Sosyal bağlantılar: marka logosu değil, tanınır basit çizgi simgeler (24x24)
// ---------------------------------------------------------------------------
const GLYPHS = {
  youtube: `<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.2 9.4v5.2l4.5-2.6z" fill="currentColor" stroke="none"/>`,
  twitch: `<path d="M4.5 3.5h15v10l-4 4h-3.5l-3 3v-3h-4.5z"/><path d="M11 8v4M15 8v4"/>`,
  kick: `<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M9 7.5v9M15 7.5l-4.5 4.5 4.5 4.5"/>`,
  instagram: `<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17" cy="7" r="1.1" fill="currentColor" stroke="none"/>`,
  x: `<path d="M4.5 4.5h4l11 15h-4z"/><path d="M19.5 4.5l-6.2 6.8M4.5 19.5l6.2-6.8"/>`,
  tiktok: `<path d="M13.5 3.5v11.2a3.8 3.8 0 1 1-3.8-3.8"/><path d="M13.5 3.5c.4 2.7 2.4 4.6 5.2 4.8"/>`,
  facebook: `<circle cx="12" cy="12" r="9"/><path d="M13 21v-8.2h2.6M13 21v-11c0-1.6.8-2.4 2.4-2.4h1.1M10.3 12.8H13"/>`,
  discord: `<path d="M7.5 6.5c1.4-.7 2.9-1 4.5-1s3.1.3 4.5 1c1.6 2.3 2.5 5 2.5 8.6-1.3 1.1-2.8 1.9-4.3 2.4l-.9-1.6M7.5 6.5C5.9 8.8 5 11.5 5 15.1c1.3 1.1 2.8 1.9 4.3 2.4l.9-1.6"/><path d="M8.8 15.2c2.1 1 4.3 1 6.4 0"/><circle cx="9.6" cy="11.8" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.4" cy="11.8" r="1.2" fill="currentColor" stroke="none"/>`,
  steam: `<circle cx="12" cy="12" r="9"/><circle cx="15" cy="9.5" r="2.6"/><circle cx="9" cy="15" r="1.9"/><path d="M10.4 13.7l2.8-2.6"/>`,
  website: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z"/>`,
  other: `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`,
};
export const SOCIALS = [
  { id: "youtube", label: "YouTube", color: "#ff3b3b", hint: "https://www.youtube.com/@…" },
  { id: "twitch", label: "Twitch", color: "#a970ff", hint: "https://www.twitch.tv/…" },
  { id: "kick", label: "Kick", color: "#53fc19", hint: "https://kick.com/…" },
  { id: "instagram", label: "Instagram", color: "#ff4f8b", hint: "https://www.instagram.com/…" },
  { id: "x", label: "X (Twitter)", color: "#e7e9ea", hint: "https://x.com/…" },
  { id: "tiktok", label: "TikTok", color: "#25f4ee", hint: "https://www.tiktok.com/@…" },
  { id: "facebook", label: "Facebook", color: "#4d8dff", hint: "https://www.facebook.com/…" },
  { id: "discord", label: "Discord", color: "#7d87ff", hint: "https://discord.gg/…" },
  { id: "steam", label: "Steam", color: "#9fb8d0", hint: "https://steamcommunity.com/id/…" },
  { id: "website", label: "pf_website", color: "#ffb070", hint: "https://…" },
  { id: "other", label: "pf_other", color: "#a4adbd", hint: "https://…" },
];
const meta = (t) => SOCIALS.find((x) => x.id === t) || SOCIALS[SOCIALS.length - 1];
const label = (m) => (m.label.startsWith("pf_") ? T(m.label) : m.label);
export const MAX_SOCIALS = 10;
export const MAX_BIO = 300;
export const urlOk = (u) => /^https:\/\/[^/\s?#.][^\s]*$/i.test(String(u).trim()) && String(u).trim().length <= 200;

export function socialIcon(type, size = 18) {
  return `<svg class="soc-ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[meta(type).id]}</svg>`;
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    const s = u.hostname.replace(/^www\./, "") + decodeURIComponent(u.pathname).replace(/\/+$/, "");
    return s.length > 34 ? s.slice(0, 33) + "…" : s;
  } catch {
    return url;
  }
}

/** Bağlantılar (yeni sekmede açılır) */
export function socialsHtml(list, compact = false) {
  injectCss();
  const links = (Array.isArray(list) ? list : []).filter((l) => l && urlOk(l.url || ""));
  if (!links.length) return "";
  return `<div class="soc-links${compact ? " compact" : ""}">${links
    .map((l) => {
      const m = meta(l.type);
      return `<a class="soc-link" style="--brand:${m.color}" href="${esc(l.url)}" target="_blank" rel="noopener nofollow ugc" title="${esc(label(m))} · ${esc(
        l.url,
      )}">${socialIcon(l.type, compact ? 16 : 17)}${compact ? "" : `<span translate="no">${esc(shortUrl(l.url))}</span>`}</a>`;
    })
    .join("")}</div>`;
}

export function guessType(url) {
  let h = "";
  try {
    h = new URL(String(url).trim()).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
  const rules = [
    [/(^|\.)youtube\.com$|^youtu\.be$/, "youtube"],
    [/(^|\.)twitch\.tv$/, "twitch"],
    [/(^|\.)kick\.com$/, "kick"],
    [/(^|\.)instagram\.com$/, "instagram"],
    [/(^|\.)(x|twitter)\.com$/, "x"],
    [/(^|\.)tiktok\.com$/, "tiktok"],
    [/(^|\.)(facebook|fb)\.com$/, "facebook"],
    [/(^|\.)discord\.(gg|com)$/, "discord"],
    [/(^|\.)steam(community|powered)\.com$/, "steam"],
  ];
  return rules.find(([r]) => r.test(h))?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Oyun rozeti (arkadaş listesi: my_friends().sim)
// ---------------------------------------------------------------------------
export const SIM_SHORT = { iracing: "iRacing", acc: "ACC", ac: "AC", lmu: "LMU", rf2: "rF2", ams2: "AMS2" };
const SIM_LONG = { iracing: "iRacing", acc: "Assetto Corsa Competizione", ac: "Assetto Corsa", lmu: "Le Mans Ultimate", rf2: "rFactor 2", ams2: "Automobilista 2" };
export function simBadge(sim) {
  injectCss();
  return SIM_SHORT[sim] ? `<span class="sim-badge s-${sim}" translate="no" title="${esc(T("pf_playing", SIM_LONG[sim]))}">${SIM_SHORT[sim]}</span>` : "";
}

// ---------------------------------------------------------------------------
// Herkese açık profil
// ---------------------------------------------------------------------------
export async function publicProfile(id) {
  const { data, error } = await sb.rpc("public_profile", { p_user: id });
  if (error) throw new Error(error.message);
  return data;
}

/** Fotoğraf yolları: id → avatar_path (takım üyeleri vb.); sunucu c31 yoksa boş */
export async function loadAvatars(ids) {
  injectCss();
  const want = [...new Set(ids)].filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);
  if (!want.length) return {};
  const { data, error } = await sb.from("profiles").select("id,avatar_path").in("id", want);
  if (error) return {};
  return Object.fromEntries((data || []).map((r) => [r.id, r.avatar_path]));
}

const IR_CATS = { road: "Road", sportscar: "Sports Car", formulacar: "Formula", oval: "Oval", dirtroad: "Dirt Road", dirtoval: "Dirt Oval" };

/** iRacing bilgileri (SQL c56): ülke kodu, lisans rozeti (sınıf rengi + SR), iRating, kategori ve güncellenme tarihi */
export function iracingHtml(ir, note = true) {
  if (!ir || !(ir.irating > 0) || !ir.license) return "";
  const col = /^#[0-9a-f]{6}$/i.test(ir.lic_color || "") ? ir.lic_color : "#666666";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(col.slice(i, i + 2), 16));
  const dark = r * 0.299 + g * 0.587 + b * 0.114 > 150;
  return `<div class="pf-irx">
    ${ir.country ? `<span class="pf-cty" translate="no">${esc(ir.country)}</span>` : ""}
    <span class="pf-lic${dark ? " dark" : ""}" style="background:${col}" title="${esc(T("pf_ir_lic"))}" translate="no">${esc(ir.license)}</span>
    <span class="muted small">${esc(T("pf_ir_updated", fmtDate(ir.updated_at)))}</span>
    ${note && ir.public === false ? `<span class="muted small">${esc(T("pf_ir_only_me"))}</span>` : ""}
  </div>`;
}

/** Başlık: büyük avatar, ad, PRO, iRacing adı ve simlerdeki adlar; `extra` sağ tarafa (düğmeler) */
export function profileHero(p, extra = "", title = "") {
  injectCss();
  const sims = (p.sims || []).filter((s) => s.sim !== "iracing" || s.sim_name !== p.iracing_name);
  return `<div class="pf-hero">
    ${avatarHtml(p.id, p.display_name, p.avatar_path, 92)}
    <div class="pf-hero-main">
      <div class="pf-hero-title"><h1 translate="no">${esc(title || p.display_name || "—")}</h1>${p.is_pro ? `<span class="badge pro">PRO</span>` : ""}</div>
      <div class="pf-ids">
        ${p.iracing_name ? `<span class="pill" translate="no"><b>iRacing</b> ${esc(p.iracing_name)}</span>` : ""}
        ${sims.map((s) => `<span class="pill" translate="no"><b>${esc(SIM_SHORT[s.sim] || s.sim)}</b> ${esc(s.sim_name)}</span>`).join("")}
      </div>
      ${iracingHtml(p.iracing)}
      <span class="muted small">${esc(T("pf_member_since", fmtDate(p.created_at)))}</span>
    </div>
    ${extra ? `<div class="pf-hero-acts">${extra}</div>` : ""}
  </div>`;
}

/** Tanıtım, bağlantılar ve takımlar (boşsa "") */
export function profileDetails(p) {
  const teams = p.teams || [];
  const parts = [
    p.bio ? `<p class="pf-bio" translate="no">${esc(p.bio)}</p>` : "",
    socialsHtml(p.socials),
    teams.length
      ? `<div class="pf-teams">${teams
          .map(
            (t) => `<a class="pf-team" href="takimlar.html?id=${esc(t.id)}" style="--tc:${/^#[0-9a-f]{6}$/i.test(t.color) ? t.color : "#4ea1ff"}">${
              t.logo_path
                ? `<img src="${esc(`${SUPABASE_URL}/storage/v1/object/public/teams/${String(t.logo_path).split("/").map(encodeURIComponent).join("/")}`)}" alt="">`
                : `<i class="pf-team-dot"></i>`
            }<b translate="no">${esc(t.tag)}</b><span translate="no">${esc(t.name)}</span></a>`,
          )
          .join("")}</div>`
      : "",
  ].filter(Boolean);
  return parts.length ? `<div class="card pf-card">${parts.join("")}</div>` : "";
}

// ---------------------------------------------------------------------------
// Hesabım: fotoğraf, tanıtım, bağlantılar
// ---------------------------------------------------------------------------
async function squareImage(file, size = 256) {
  if (!/^image\//.test(file.type)) throw new Error(T("pf_not_image"));
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error(T("pf_bad_image"));
  }
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  const s = Math.min(bmp.width, bmp.height);
  g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  bmp.close?.();
  const enc = (type) => new Promise((res) => c.toBlob(res, type, 0.88));
  let blob = await enc("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await enc("image/jpeg");
  if (!blob) throw new Error(T("pf_bad_image"));
  return blob;
}

/** Hesabım sayfasındaki "Herkese açık profil" kartı */
export async function mountProfileEditor(el, user) {
  injectCss();
  let p;
  try {
    p = await publicProfile(user.id);
  } catch (e) {
    el.innerHTML = `<h3>${esc(T("pf_title"))}</h3><div class="msg bad">${esc(e.message || e)}</div>`;
    return;
  }
  if (!p) return;
  let links = (p.socials || []).map((x) => ({ ...x }));

  const linkRow = (l, i) => {
    const m = meta(l.type);
    return `<div class="pf-link${l.url && !urlOk(l.url) ? " bad" : ""}" data-i="${i}" style="--brand:${m.color}">
      <span class="pf-link-ico">${socialIcon(l.type)}</span>
      <select data-k="type">${SOCIALS.map((s) => `<option value="${s.id}"${s.id === l.type ? " selected" : ""}>${esc(label(s))}</option>`).join("")}</select>
      <input data-k="url" type="url" maxlength="200" placeholder="${esc(m.hint)}" value="${esc(l.url)}">
      <button type="button" class="btn btn-sm btn-ghost" data-del title="${esc(T("pf_remove"))}">✕</button>
    </div>`;
  };
  const drawPhoto = () => {
    $("#pf-photo-av", el).outerHTML = avatarHtml(p.id, p.display_name, p.avatar_path, 72, "").replace('class="pf-av ', 'id="pf-photo-av" class="pf-av ');
    $("#pf-up", el).textContent = T(p.avatar_path ? "pf_change" : "pf_upload");
    $("#pf-rm", el).hidden = !p.avatar_path;
  };
  const drawLinks = () => {
    $("#pf-links", el).innerHTML = links.map(linkRow).join("");
    $("#pf-add", el).hidden = links.length >= MAX_SOCIALS;
    $("#pf-lcount", el).textContent = `${links.length}/${MAX_SOCIALS}`;
  };

  el.innerHTML = `<h3>${esc(T("pf_title"))}</h3>
    <p class="muted small">${esc(T("pf_lead"))}</p>
    <div class="pf-photo">
      <span id="pf-photo-av"></span>
      <div>
        <b>${esc(T("pf_photo"))}</b><br><span class="muted small">${esc(T("pf_photo_note"))}</span>
        <div class="row" style="margin-top:8px">
          <input type="file" id="pf-file" accept="image/jpeg,image/png,image/webp" hidden>
          <button type="button" class="btn btn-sm" id="pf-up"></button>
          <button type="button" class="btn btn-sm btn-ghost" id="pf-rm" hidden>${esc(T("pf_remove"))}</button>
        </div>
      </div>
    </div>
    <div class="field"><label class="row between"><span>${esc(T("pf_bio"))}</span><span class="muted small" id="pf-bcount"></span></label>
      <textarea id="pf-bio" rows="3" maxlength="${MAX_BIO}" placeholder="${esc(T("pf_bio_ph"))}">${esc(p.bio || "")}</textarea></div>
    <div class="field"><label class="row between"><span>${esc(T("pf_links"))}</span><span class="muted small" id="pf-lcount"></span></label>
      <div id="pf-links" class="pf-links"></div>
      <button type="button" class="btn btn-sm btn-ghost" id="pf-add" style="margin-top:6px">${esc(T("pf_add_link"))}</button>
      <p class="muted small" style="margin:6px 0 0">${esc(T("pf_links_note"))}</p></div>
    <div class="row between"><a class="btn btn-sm btn-ghost" href="yarisci.html?u=${esc(p.id)}">${esc(T("pf_view"))}</a>
      <button type="button" class="btn btn-accent btn-sm" id="pf-save">${esc(T("save"))}</button></div>`;
  drawPhoto();
  drawLinks();
  const bio = $("#pf-bio", el);
  const bcount = () => ($("#pf-bcount", el).textContent = `${bio.value.length}/${MAX_BIO}`);
  bio.addEventListener("input", bcount);
  bcount();

  $("#pf-add", el).addEventListener("click", () => {
    if (links.length >= MAX_SOCIALS) return;
    links.push({ type: "website", url: "" });
    drawLinks();
    $$(".pf-link input", el).at(-1)?.focus();
  });
  $("#pf-links", el).addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]");
    if (!b) return;
    links.splice(+b.closest(".pf-link").dataset.i, 1);
    drawLinks();
  });
  $("#pf-links", el).addEventListener("change", (e) => {
    const row = e.target.closest(".pf-link");
    if (!row || e.target.dataset.k !== "type") return;
    links[+row.dataset.i].type = e.target.value;
    drawLinks();
  });
  $("#pf-links", el).addEventListener("input", (e) => {
    const row = e.target.closest(".pf-link");
    if (!row || e.target.dataset.k !== "url") return;
    const l = links[+row.dataset.i];
    l.url = e.target.value;
    row.classList.toggle("bad", !!l.url.trim() && !urlOk(l.url));
    const g = guessType(l.url);
    if (g && g !== l.type && (l.type === "website" || l.type === "other")) {
      l.type = g;
      const m = meta(g);
      row.style.setProperty("--brand", m.color);
      row.querySelector(".pf-link-ico").innerHTML = socialIcon(g);
      row.querySelector("select").value = g;
    }
  });

  $("#pf-save", el).addEventListener("click", async (e) => {
    const list = links.map((l) => ({ type: l.type, url: l.url.trim() })).filter((l) => l.url);
    if (list.some((l) => !urlOk(l.url))) return toast(T("pf_bad_url"), true);
    e.target.disabled = true;
    const { data, error } = await sb.rpc("profile_update_public", { p_bio: bio.value.trim(), p_socials: list });
    e.target.disabled = false;
    if (error) return toast(error.message, true);
    links = (data?.socials || list).map((x) => ({ ...x }));
    bio.value = data?.bio ?? bio.value.trim();
    bcount();
    drawLinks();
    toast(T("saved"));
  });

  const file = $("#pf-file", el);
  $("#pf-up", el).addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    file.value = "";
    if (!f) return;
    const up = $("#pf-up", el);
    up.disabled = true;
    up.textContent = T("pf_uploading");
    try {
      const blob = await squareImage(f);
      const path = `${user.id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
      const { error: upErr } = await sb.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
      if (upErr) throw new Error(upErr.message);
      const { data: old, error } = await sb.rpc("profile_set_avatar", { p_path: path });
      if (error) {
        sb.storage.from(AVATAR_BUCKET).remove([path]);
        throw new Error(error.message);
      }
      if (old && String(old).startsWith(`${user.id}/`)) sb.storage.from(AVATAR_BUCKET).remove([old]);
      p.avatar_path = path;
      toast(T("saved"));
    } catch (err) {
      toast(err.message || T("error"), true);
    } finally {
      up.disabled = false;
      drawPhoto();
    }
  });
  $("#pf-rm", el).addEventListener("click", async (e) => {
    e.target.disabled = true;
    const { data: old, error } = await sb.rpc("profile_set_avatar", { p_path: null });
    e.target.disabled = false;
    if (error) return toast(error.message, true);
    if (old && String(old).startsWith(`${user.id}/`)) sb.storage.from(AVATAR_BUCKET).remove([old]);
    p.avatar_path = null;
    drawPhoto();
  });
}

// ---------------------------------------------------------------------------
// Stil (site.css'e dokunmadan; sayfa başına bir kez eklenir)
// ---------------------------------------------------------------------------
let cssDone = false;
function injectCss() {
  if (cssDone || typeof document === "undefined") return;
  cssDone = true;
  const s = document.createElement("style");
  s.id = "pf-css";
  s.textContent = `
.pf-av{--sz:36px;--fc:#6b7385;position:relative;flex:none;width:var(--sz);height:var(--sz);border-radius:30%;display:inline-grid;place-items:center;overflow:hidden;
  background:linear-gradient(145deg,color-mix(in srgb,var(--fc) 100%,#fff 12%),color-mix(in srgb,var(--fc) 78%,#000));color:#fff;font-weight:700;
  font-size:calc(var(--sz)*.42);line-height:1;box-shadow:0 0 0 1px rgba(255,255,255,.06)}
.pf-av img{width:100%;height:100%;object-fit:cover;max-width:none}
.pf-hero{display:flex;align-items:center;gap:18px;margin:6px 0 18px;flex-wrap:wrap}
.pf-hero .pf-av{box-shadow:0 0 0 1px rgba(255,255,255,.08),0 10px 30px rgba(0,0,0,.4)}
.pf-hero-main{flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px}
.pf-hero-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pf-hero-title h1{margin:0;overflow-wrap:anywhere}
.pf-ids{display:flex;flex-wrap:wrap;gap:6px}
.pf-irx{display:flex;flex-wrap:wrap;align-items:center;gap:7px}
.pf-cty{padding:1px 6px;border-radius:5px;border:1px solid var(--line);font-size:11.5px;font-weight:700;color:var(--muted);letter-spacing:.04em}
.pf-lic{padding:2px 8px;border-radius:6px;font-size:12.5px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap}
.pf-lic.dark{color:#111}
.pf-irating{padding:2px 8px;border-radius:6px;border:1px solid var(--line);background:var(--bg-3);font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.pf-irating b{color:var(--muted);margin-right:2px}
.pf-ids .pill b{color:var(--muted);font-weight:600;margin-right:4px}
.pf-hero-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.pf-card{display:flex;flex-direction:column;gap:12px;margin-bottom:18px}
.pf-bio{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}
.soc-links{display:flex;flex-wrap:wrap;gap:8px}
.soc-link{--brand:#a4adbd;display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:6px 12px 6px 9px;border-radius:999px;
  border:1px solid color-mix(in srgb,var(--brand) 35%,var(--line));background:color-mix(in srgb,var(--brand) 9%,var(--bg-2));color:var(--text);
  font-size:13px;text-decoration:none!important;transition:background .15s,border-color .15s}
.soc-link span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.soc-link .soc-ico{flex:none;color:var(--brand)}
.soc-link:hover{border-color:var(--brand);background:color-mix(in srgb,var(--brand) 18%,var(--bg-2))}
.soc-links.compact .soc-link{padding:6px;border-radius:9px}
.pf-teams{display:flex;flex-wrap:wrap;gap:8px}
.pf-team{--tc:#4ea1ff;display:inline-flex;align-items:center;gap:7px;padding:5px 11px 5px 6px;border-radius:9px;border:1px solid color-mix(in srgb,var(--tc) 35%,var(--line));
  background:var(--bg-3);color:var(--text);font-size:13px;text-decoration:none!important}
.pf-team:hover{border-color:var(--tc)}
.pf-team img,.pf-team-dot{width:22px;height:22px;border-radius:6px;object-fit:cover;display:inline-block}
.pf-team-dot{background:var(--tc)}
.pf-team b{color:var(--tc);font-size:12px;letter-spacing:.04em}
.sim-badge{--sc:var(--accent);display:inline-flex;align-items:center;height:17px;padding:0 6px;border-radius:5px;border:1px solid color-mix(in srgb,var(--sc) 55%,transparent);
  background:color-mix(in srgb,var(--sc) 16%,transparent);color:color-mix(in srgb,var(--sc) 70%,#fff);font:700 10px/1 var(--font);letter-spacing:.04em;white-space:nowrap;vertical-align:1px}
.sim-badge.s-iracing{--sc:#3a8fff}.sim-badge.s-acc{--sc:#ff5a4f}.sim-badge.s-ac{--sc:#e8a33a}.sim-badge.s-lmu,.sim-badge.s-rf2{--sc:#33c48d}.sim-badge.s-ams2{--sc:#c06bff}
.pf-photo{display:flex;align-items:center;gap:16px;margin:4px 0 14px}
.pf-links{display:flex;flex-direction:column;gap:6px}
.pf-link{--brand:#a4adbd;display:flex;align-items:center;gap:6px}
.pf-link-ico{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:9px;border:1px solid color-mix(in srgb,var(--brand) 35%,var(--line));
  background:color-mix(in srgb,var(--brand) 10%,var(--bg-2));color:var(--brand)}
.pf-link select{flex:none;width:140px}
.pf-link input{flex:1;min-width:0}
.pf-link.bad input{border-color:var(--red)}
@media (max-width:560px){.pf-link{flex-wrap:wrap}.pf-link select{flex:1}.pf-link input{flex-basis:100%}}
.tm-av img{width:100%;height:100%;object-fit:cover;border-radius:inherit;max-width:none}
.tm-av{overflow:hidden}
`;
  document.head.appendChild(s);
}
