// İndirim kuponu girişi (PRO / hediye PRO satın alma): "Uygula" kodu sunucuda doğrular (coupon_check),
// uygulanan kupon tüm plan kartlarında eski fiyatın üstü çizili, yeni fiyatla görünür.
// İndirim yalnızca ilk ödemede uygulanır (aylık planda kupon geçerli olduğu sürece); yenilemeler güncel fiyattan.

import { Show, createSignal } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { fmtPrice as fmt, inTurkey } from "@/cloud/account";
import { checkCoupon, type CouponInfo, type CouponPlan } from "@/cloud/coupons";

/** PRO satın alma bölümünde uygulanan kupon (hesap sayfasındaki satın alma ve hediye kartları ortak kullanır) */
const [proCoupon, setProCoupon] = createSignal<CouponInfo | null>(null);
export { proCoupon };

/** Plan için kuponlu fiyat; kupon bu planda (hediyede: hediye PRO'da) geçerli değilse null */
export function couponFor(plan: string, gift = false) {
  const c = proCoupon();
  if (!c || (gift && !c.pro_gift)) return null;
  const p = c.plans?.[plan as CouponPlan];
  return p ? { ...p, code: c.code, percent: c.percent } : null;
}

/** Kuponun yenilemelerde nasıl uygulandığı (pro-checkout ile aynı kural) */
export function couponScope(c: CouponInfo) {
  const first = t("İndirim ilk ödemede uygulanır; yenilemeler güncel fiyattan.");
  if (!c.pro_plans?.includes("1m")) return first;
  const monthly = c.valid_until
    ? t("Aylık planda kupon geçerli olduğu sürece ({0} tarihine kadar) her ödemede.", new Date(c.valid_until).toLocaleDateString(localeTag()))
    : t("Aylık planda tüm ödemelerde.");
  return `${first} ${monthly}`;
}

/** Plan kartındaki fiyat: kupon geçerliyse eski fiyat üstü çizili + yeni fiyat */
export function CouponPrice(p: { plan: string; price: string; gift?: boolean }) {
  const c = () => couponFor(p.plan, p.gift);
  return (
    <Show when={c()} fallback={<b>{p.price || "—"}</b>}>
      <b>
        <s class="muted" style={{ "font-weight": "400", "margin-right": "6px" }}>
          {p.price || fmt(c()!.price, c()!.currency)}
        </s>
        <span style={{ color: "#3ddc84" }}>{fmt(c()!.discounted, c()!.currency)}</span>
      </b>
    </Show>
  );
}

export function CouponBox() {
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const apply = async () => {
    const v = code().trim();
    if (!v) return;
    setBusy(true);
    setErr("");
    try {
      setProCoupon(await checkCoupon(v, "pro", null, inTurkey() ? "tr" : "intl"));
    } catch (e) {
      setProCoupon(null);
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="coupon-box" style={{ margin: "8px 0" }}>
      <Show
        when={proCoupon()}
        fallback={
          <div class="fr-add" style={{ display: "flex", gap: "8px", "align-items": "center" }}>
            <input
              class="input"
              placeholder="İndirim kuponu"
              maxLength={32}
              style={{ "max-width": "200px", "text-transform": "uppercase" }}
              value={code()}
              onInput={(e) => setCode(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
            <button class="btn ghost small" disabled={busy() || !code().trim()} onClick={apply}>
              {busy() ? "Denetleniyor…" : "Uygula"}
            </button>
          </div>
        }
      >
        <p class="small" style={{ margin: "0", display: "flex", gap: "10px", "align-items": "center", "flex-wrap": "wrap" }}>
          <span style={{ color: "#3ddc84" }}>
            🏷️ <b>{t("%{0} indirim ({1})", proCoupon()!.percent, proCoupon()!.code)}</b>
          </span>
          <Show when={!proCoupon()!.pro_gift}>
            <span class="muted">Hediye PRO'da geçerli değil</span>
          </Show>
          <button
            class="btn ghost small"
            onClick={() => {
              setProCoupon(null);
              setCode("");
            }}
          >
            Kaldır
          </button>
        </p>
        <p class="small muted" style={{ margin: "4px 0 0" }}>
          {couponScope(proCoupon()!)}
        </p>
      </Show>
      <Show when={err()}>
        <p class="error" style={{ margin: "6px 0 0" }}>
          {err()}
        </p>
      </Show>
    </div>
  );
}
