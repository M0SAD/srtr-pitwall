// PRO tanıtım kartı (yönetici: programda Yönetim › PRO tanıtım mesajı; app_config.pro_promo).
// PRO olmayan ziyaretçilere sitenin PRO bölümlerinde (ana sayfa fiyatlar, Hesabım) gösterilir.
// "7 gün gösterme" bu tarayıcıda saklanır; yönetici mesajı değiştirince (rev) yeniden görünür.
import { T, addDict, appConfig, currentUser, esc, lang, myProfile, startProCheckout } from "./core.js";

addDict({
  pp_hide: ["7 gün gösterme", "Hide for 7 days"],
  pp_default_btn: ["PRO ol", "Get PRO"],
});

const KEY = "pitwall.site.proPromoHide";
const WEEK = 7 * 86400_000;

/** Dile göre metin: seçili dil > (Türkçe değilse) İngilizce > Türkçe */
export function promoText(m, l = lang) {
  if (!m || typeof m !== "object") return typeof m === "string" ? m : "";
  return m[l] || (l !== "tr" ? m.en : "") || m.tr || m.en || "";
}

function hidden(rev) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return !!v && v.rev === (rev || 0) && v.until > Date.now();
  } catch {
    return false;
  }
}

/** Kartın HTML'i (yönetim önizlemesi de kullanır) */
export function promoHtml(p, l = lang) {
  const title = promoText(p.title, l);
  const text = promoText(p.text, l);
  const btn = promoText(p.button, l) || T("pp_default_btn");
  return `<div class="card pro-promo-card" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;position:relative;border-color:var(--accent)">
    ${p.image ? `<img src="${esc(p.image)}" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:10px;flex:none">` : ""}
    <div style="flex:1;min-width:200px">
      ${title ? `<h3 style="margin:0 0 4px">${esc(title)}</h3>` : ""}
      ${text ? `<p class="muted" style="margin:0 0 10px;white-space:pre-line">${esc(text)}</p>` : ""}
      <button class="btn btn-accent btn-sm" data-pp-go>${esc(btn)}</button>
    </div>
    <button class="btn btn-ghost btn-sm" data-pp-hide title="" style="position:absolute;top:8px;right:8px;padding:2px 8px">×</button>
  </div>`;
}

async function go(p, user) {
  const action = p.action || "plans";
  if (action === "url" && p.url) return void window.open(p.url, "_blank", "noopener");
  if (action === "checkout" && p.plan) {
    if (!user) return void (location.href = `hesap.html?buy=${encodeURIComponent(p.plan)}`);
    return void startProCheckout(p.plan);
  }
  const target = document.querySelector("#pricing, [data-pro]");
  if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
  else location.href = "index.html#pricing";
}

/** el içine kartı koyar (gerekmiyorsa boş bırakır) */
export async function mountProPromo(el) {
  if (!el) return;
  try {
    const [cfg, user] = await Promise.all([appConfig(), currentUser()]);
    const p = cfg?.pro_promo;
    if (!p || !p.enabled || hidden(p.rev)) return;
    if (user) {
      const prof = await myProfile();
      const pro = prof && (prof.is_admin || (prof.pro_until && new Date(prof.pro_until).getTime() > Date.now()));
      if (pro) return;
    }
    const draw = () => {
      if (hidden(p.rev)) return void (el.innerHTML = "");
      el.innerHTML = promoHtml(p);
      const hideBtn = el.querySelector("[data-pp-hide]");
      hideBtn.title = T("pp_hide");
      hideBtn.addEventListener("click", () => {
        try {
          localStorage.setItem(KEY, JSON.stringify({ rev: p.rev || 0, until: Date.now() + WEEK }));
        } catch {}
        el.innerHTML = "";
      });
      el.querySelector("[data-pp-go]").addEventListener("click", () => go(p, user));
    };
    draw();
    document.addEventListener("langchange", draw);
  } catch {}
}
