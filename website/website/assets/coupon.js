// İndirim kuponu (c34): kod girişi + "Uygula" (coupon_check RPC). Uygulanan kupon, fiyatı gösteren yerlerde
// eski fiyat üstü çizili ve yeni fiyatla görünür; ödeme fonksiyonları (pro-checkout, ads-checkout) kuponu
// sunucuda yeniden doğrular. Hesap sayfası (PRO + hediye PRO) ve Reklam ver sayfası kullanır.
// PRO'da indirim yalnızca ilk ödemede uygulanır (aylık planda kupon geçerli olduğu sürece); yenilemeler güncel fiyattan.
import { T, addDict, esc, fmtDate, fmtMoney, region, sb } from "./core.js";

addDict({
  cp_ph: ["İndirim kuponu", "Coupon code"],
  cp_apply: ["Uygula", "Apply"],
  cp_checking: ["Denetleniyor…", "Checking…"],
  cp_off: ["%{0} indirim ({1})", "{0}% off ({1})"],
  cp_remove: ["Kaldır", "Remove"],
  cp_no_gift: ["Hediye PRO'da geçerli değil", "Not valid for gift PRO"],
  cp_not_here: ["Kupon bu pakette geçersiz", "This coupon isn't valid for this package"],
  cp_e_notfound: ["Kupon bulunamadı", "Coupon not found"],
  cp_e_inactive: ["Bu kupon artık geçerli değil", "This coupon is no longer valid"],
  cp_e_expired: ["Kuponun süresi dolmuş", "This coupon has expired"],
  cp_e_notyet: ["Kupon henüz geçerli değil", "This coupon isn't valid yet"],
  cp_e_limit: ["Kuponun kullanım limiti doldu", "This coupon has reached its usage limit"],
  cp_e_user: ["Bu kuponu kullanım hakkın doldu", "You've already used this coupon"],
  cp_e_login: ["Kupon kullanmak için giriş yap", "Sign in to use a coupon"],
  cp_first: [
    "İndirim ilk ödemede uygulanır; yenilemeler güncel fiyattan.",
    "The discount applies to the first payment; renewals are charged at the current price.",
  ],
  cp_m_until: [
    "Aylık planda kupon geçerli olduğu sürece ({0} tarihine kadar) her ödemede.",
    "On the monthly plan, every payment while the coupon is valid (until {0}).",
  ],
  cp_m_all: ["Aylık planda tüm ödemelerde.", "On the monthly plan, on every payment."],
});

// Sunucunun Türkçe hata mesajları → çeviri anahtarı
const ERR = {
  "Kupon bulunamadı": "cp_e_notfound",
  "Bu kupon artık geçerli değil": "cp_e_inactive",
  "Kuponun süresi dolmuş": "cp_e_expired",
  "Kupon henüz geçerli değil": "cp_e_notyet",
  "Kupon bu pakette geçersiz": "cp_not_here",
  "Kuponun kullanım limiti doldu": "cp_e_limit",
  "Bu kuponu kullanım hakkın doldu": "cp_e_user",
  "Giriş yapmalısın": "cp_e_login",
};
export const couponError = (msg) => (ERR[msg] ? T(ERR[msg]) : msg);

/** İndirimli tutar (sunucudaki coupon_apply ile aynı: 2 haneye yuvarlanır) */
export const couponPrice = (price, percent) => Math.round(price * (100 - percent) + 1e-6) / 100;

/** Uygulanan kuponlar (ürün başına: "pro", "ad") */
const applied = { pro: null, ad: null };
export const getCoupon = (product) => applied[product] || null;

/** Eski fiyat üstü çizili + yeni fiyat (HTML) */
export const strikeHtml = (oldText, newText) =>
  `<s class="muted" style="font-weight:400;margin-right:4px">${esc(oldText)}</s><b style="color:var(--good,#3ddc84)">${esc(newText)}</b>`;

/** PRO planı için kuponlu fiyat; kupon bu planda (hediyede: hediye PRO'da) geçerli değilse null */
export function proCouponFor(plan, gift = false) {
  const c = applied.pro;
  if (!c || (gift && !c.pro_gift)) return null;
  const p = c.plans?.[plan];
  return p ? { ...p, code: c.code, percent: c.percent } : null;
}

/** root içindeki PRO plan düğmelerinin ([data-pro] ya da [data-gplan]) fiyatını kupona göre günceller */
export function decoratePlans(root, attr = "pro", gift = false) {
  if (!root) return;
  root.querySelectorAll(`[data-${attr}]`).forEach((b) => {
    const span = b.querySelector(".muted");
    if (!span) return;
    if (span.dataset.orig == null) span.dataset.orig = span.textContent;
    const c = proCouponFor(b.dataset[attr], gift);
    span.innerHTML = c ? strikeHtml(span.dataset.orig, fmtMoney(c.discounted, c.currency)) : esc(span.dataset.orig);
  });
}

/** PRO kuponunun yenilemelerde nasıl uygulandığı (pro-checkout ile aynı kural) */
export function proCouponScope(c) {
  const first = T("cp_first");
  if (!c?.pro_plans?.includes("1m")) return first;
  return `${first} ${c.valid_until ? T("cp_m_until", fmtDate(c.valid_until)) : T("cp_m_all")}`;
}

/** Kupon kutusunu el içine çizer. product: "pro" | "ad". onChange(kupon | null) uygulanınca / kaldırılınca çağrılır. */
export function couponBox(el, { product, onChange } = {}) {
  if (!el) return;
  let err = "";
  let code = "";
  const draw = () => {
    const c = applied[product];
    el.innerHTML = c
      ? `<div class="row" style="gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0">
          <span style="color:var(--good,#3ddc84)">🏷️ <b>${esc(T("cp_off", c.percent, c.code))}</b></span>
          ${product === "pro" && !c.pro_gift ? `<span class="muted small">${esc(T("cp_no_gift"))}</span>` : ""}
          <button type="button" class="btn btn-sm btn-ghost" data-cp-rm>${esc(T("cp_remove"))}</button>
        </div>
        ${product === "pro" ? `<div class="muted small" style="margin:-4px 0 8px">${esc(proCouponScope(c))}</div>` : ""}`
      : `<form class="row" data-cp-form style="gap:8px;align-items:center;margin:8px 0;flex-wrap:nowrap">
          <input name="code" maxlength="32" autocomplete="off" placeholder="${esc(T("cp_ph"))}" value="${esc(code)}" style="max-width:200px;text-transform:uppercase">
          <button class="btn btn-sm">${esc(T("cp_apply"))}</button>
        </form>
        ${err ? `<div class="msg bad" style="margin:0 0 8px">${esc(err)}</div>` : ""}`;
    el.querySelector("[data-cp-rm]")?.addEventListener("click", () => {
      applied[product] = null;
      code = "";
      err = "";
      draw();
      onChange?.(null);
    });
    el.querySelector("[data-cp-form]")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      code = String(new FormData(e.target).get("code") || "").trim();
      if (!code) return;
      const btn = e.target.querySelector("button");
      btn.disabled = true;
      btn.textContent = T("cp_checking");
      const { data, error } = await sb.rpc("coupon_check", {
        p_code: code,
        p_product: product,
        p_plan: null,
        p_region: region === "tr" ? "tr" : "intl",
      });
      if (error || !data) {
        applied[product] = null;
        err = couponError(error?.message || "Kupon bulunamadı");
      } else {
        applied[product] = data;
        err = "";
      }
      draw();
      onChange?.(applied[product]);
    });
  };
  draw();
}
