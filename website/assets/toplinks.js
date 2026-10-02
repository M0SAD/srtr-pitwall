// Üst çubuk bağlantıları (app_config.top_links, c61): programın üst çubuğundaki bağlantı düğmelerinin aynısı,
// sitenin alt bilgisinde küçük yuvarlak simgeler olarak gösterilir. Yönetici programdaki
// Yönetim › Üst çubuk bağlantıları bölümünden düzenler (kim görür: giriş yapmayan / üye / PRO).
// Hazır simgeler genel çizimlerdir (marka logosu değil); yönetici kendi simgesini yükleyebilir.
import { $$, T, addDict, currentUser, esc, myProfile, sb } from "./core.js";

addDict({
  toplinks_title: ["Bağlantılar", "Links"],
});

const ICONS = {
  web: ["#2f7dd1", "#fff", '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>'],
  discord: ["#5865f2", "#fff", '<path d="M4 5h16v11H10l-4 3.5V16H4z"/><circle cx="9.5" cy="10.5" r="1" fill="currentColor"/><circle cx="14.5" cy="10.5" r="1" fill="currentColor"/>'],
  whatsapp: ["#25d366", "#fff", '<path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke-width="2.6"/>'],
  youtube: ["#e62117", "#fff", '<path d="M9 6.5v11l9-5.5z" fill="currentColor"/>'],
  twitch: ["#9146ff", "#fff", '<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>'],
  kick: ["#53fc18", "#0b0e14", '<path d="M13 3 5 13.5h6L10 21l9-11h-6z" fill="currentColor" stroke-linejoin="round"/>'],
  instagram: ["#d6297b", "#fff", '<path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13" r="3.2"/>'],
  x: ["#15181d", "#fff", '<path d="M9.5 4 8 20M16 4l-1.5 16M4.5 9h16M3.5 15h16"/>'],
  facebook: ["#1877f2", "#fff", '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="8" r="2.3"/><path d="M16.5 13c2.2.1 3.6 1.5 4 4"/>'],
  telegram: ["#2aabee", "#fff", '<path d="M20.5 4 3.5 11l6 2.2L11.5 19l3-4 4 3z"/><path d="m9.5 13.2 6-5"/>'],
  tiktok: ["#15181d", "#fff", '<path d="M10 17V5l8-1.5V15"/><circle cx="7.5" cy="17" r="2.5"/><circle cx="15.5" cy="15" r="2.5"/>'],
  github: ["#24292f", "#fff", '<path d="m8 8-4.5 4L8 16M16 8l4.5 4-4.5 4M13.5 5.5l-3 13"/>'],
  mail: ["#c0562b", "#fff", '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 7 8 6.5L20 7"/>'],
  link: ["#4a5568", "#fff", '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'],
};

const okUrl = (u) => typeof u === "string" && u.length <= 500 && /^https?:\/\/[^\s"'<>`\\]+$/i.test(u);
const okImg = (u) => typeof u === "string" && u.length <= 600 && /^https:\/\/[^\s"'<>`\\]+$/i.test(u);

function iconHtml(l) {
  if (l.icon === "custom" && okImg(l.image)) return `<span class="tl-ico img"><img src="${esc(l.image)}" alt="" loading="lazy" /></span>`;
  const [bg, fg, svg] = ICONS[l.icon] || ICONS.link;
  return `<span class="tl-ico" style="background:${bg};color:${fg}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></span>`;
}

let cfg = null;
async function load() {
  if (cfg) return cfg;
  // Sütun yoksa (c61 henüz kurulmadıysa) hata döner: bağlantı gösterilmez
  const { data, error } = await sb.from("app_config").select("top_links, promo_pro_until").eq("id", 1).maybeSingle();
  if (error) throw error;
  cfg = data ?? {};
  return cfg;
}

async function draw() {
  const boxes = $$(".foot-tl");
  if (!boxes.length) return;
  let html = "";
  try {
    const c = await load();
    const u = await currentUser();
    const p = u ? await myProfile() : null;
    const admin = !!p?.is_admin;
    const promo = c.promo_pro_until && new Date(c.promo_pro_until).getTime() > Date.now();
    const pro = !!u && (admin || promo || (p?.pro_until && new Date(p.pro_until).getTime() > Date.now()));
    const aud = !u ? "guest" : pro ? "pro" : "member";
    const links = (Array.isArray(c.top_links) ? c.top_links : []).filter(
      (l) => l && typeof l === "object" && l.enabled !== false && okUrl(l.url) && (admin || (l.audiences || {})[aud] !== false),
    );
    html = links
      .slice(0, 12)
      .map((l) => {
        const name = esc(String(l.label || "").slice(0, 40));
        return `<a class="tl-btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" title="${name}" aria-label="${name}" translate="no">${iconHtml(l)}</a>`;
      })
      .join("");
  } catch {}
  boxes.forEach((b) => {
    b.innerHTML = html;
    b.hidden = !html;
    b.setAttribute("aria-label", T("toplinks_title"));
  });
}

export async function initTopLinks() {
  await draw();
  sb.auth.onAuthStateChange(() => setTimeout(draw, 300));
  document.addEventListener("langchange", draw);
}
