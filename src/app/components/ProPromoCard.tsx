// PRO tanıtım kartı: yöneticinin Yönetim › PRO tanıtım mesajı bölümünde hazırladığı kart (app_config.pro_promo).
// PRO olmayanlara PRO bölümünün üstünde görünür; "7 gün gösterme" bu bilgisayarda saklanır (yönetici mesajı
// değiştirince — rev — yeniden görünür). Metinler dile göre: seçili dil > (Türkçe değilse) İngilizce > Türkçe.

import { Show, createSignal } from "solid-js";
import { lang, t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { PLAN_LIST, checkoutUrl, config, isPro, isProCheckout, planFor, startProCheckout, type PlanDef } from "@/cloud/account";
import { go, openUrl } from "../ui";
import { couponFor } from "./CouponBox";
import "./proPromo.css";

export type PromoAction = "plans" | "checkout" | "url";
export interface ProPromo {
  enabled?: boolean;
  /** Görsel / GIF adresi ('site' kovası) */
  image?: string;
  /** Dile göre metinler {tr, en, …} */
  title?: Record<string, string>;
  text?: Record<string, string>;
  button?: Record<string, string>;
  action?: PromoAction;
  plan?: PlanDef["id"];
  url?: string;
  /** Her kayıtta artar: gizleyenler yeni mesajı yine görür */
  rev?: number;
}

export const proPromo = (): ProPromo => ((config() as { pro_promo?: ProPromo } | null)?.pro_promo ?? {}) || {};

/** Dile göre metin */
export function promoText(m: Record<string, string> | undefined, l = lang()): string {
  if (!m) return "";
  return m[l] || (l !== "tr" ? m.en : "") || m.tr || m.en || "";
}

const HIDE_KEY = "pitwall.proPromoHide";
const WEEK = 7 * 86400_000;
function readHide(): { rev: number; until: number } | null {
  try {
    return JSON.parse(localStorage.getItem(HIDE_KEY) || "null");
  } catch {
    return null;
  }
}
const [hide, setHide] = createSignal(readHide());
const hiddenFor = (rev: number | undefined) => {
  const h = hide();
  return !!h && h.rev === (rev ?? 0) && h.until > Date.now();
};

/** Düğmenin işi: plan listesine git, doğrudan ödeme aç ya da bağlantı */
export async function runPromoAction(p: ProPromo) {
  if (p.action === "url" && p.url) return openUrl(p.url);
  const plan = PLAN_LIST.find((x) => x.id === p.plan);
  if (p.action === "checkout" && plan) {
    if (!session()) return go("account");
    const link = planFor(config(), plan).checkout;
    if (link && isProCheckout(link)) return startProCheckout(plan.id, undefined, couponFor(plan.id)?.code).catch(() => go("pro"));
    if (link) return openUrl(checkoutUrl(link));
  }
  go("pro");
  // PRO sayfası çizilince plan listesine kaydır
  let n = 0;
  const tick = () => {
    const el = document.querySelector(".pro-plans, .pro-buy");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    else if (n++ < 20) setTimeout(tick, 100);
  };
  setTimeout(tick, 50);
}

/** Kartın kendisi (yönetim önizlemesi de kullanır) */
export function PromoView(props: { p: ProPromo; lang?: string; onHide?: () => void; onGo?: () => void }) {
  const l = () => props.lang ?? lang();
  return (
    <div class="pro-promo-card" data-no-i18n>
      <Show when={props.p.image}>
        <img class="ppc-img" src={props.p.image} alt="" />
      </Show>
      <div class="ppc-body">
        <Show when={promoText(props.p.title, l())}>
          <b class="ppc-title">{promoText(props.p.title, l())}</b>
        </Show>
        <Show when={promoText(props.p.text, l())}>
          <p class="ppc-text">{promoText(props.p.text, l())}</p>
        </Show>
        <button class="btn primary small" onClick={() => props.onGo?.()}>
          {promoText(props.p.button, l()) || t("PRO ol")}
        </button>
      </div>
      <Show when={props.onHide}>
        <button class="ppc-x" title={t("7 gün gösterme")} onClick={() => props.onHide?.()}>
          ×
        </button>
      </Show>
    </div>
  );
}

/** PRO bölümündeki kart: sadece PRO olmayanlara, açıksa ve gizlenmediyse */
export function ProPromoCard() {
  const p = proPromo;
  const show = () => !!p().enabled && !isPro() && !hiddenFor(p().rev) && !!(promoText(p().title) || promoText(p().text) || p().image);
  return (
    <Show when={show()}>
      <PromoView
        p={p()}
        onGo={() => void runPromoAction(p())}
        onHide={() => {
          const v = { rev: p().rev ?? 0, until: Date.now() + WEEK };
          try {
            localStorage.setItem(HIDE_KEY, JSON.stringify(v));
          } catch {
            /* depolama yok */
          }
          setHide(v);
        }}
      />
    </Show>
  );
}
