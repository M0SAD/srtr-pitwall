// İndirim kuponları (c34): kullanıcı kodu doğrular (coupon_check) ve indirimli fiyatı görür;
// pro-checkout / ads-checkout kuponu sunucuda yeniden doğrular. Yönetici kuponları oluşturur, düzenler, kapatır, siler.

import { api } from "./supabase";

export type CouponPlan = "1m" | "3m" | "6m" | "12m";
export type CouponAdModel = "impressions" | "days";

/** coupon_check sonucu (PRO: plans; reklam: price / discounted) */
export interface CouponInfo {
  id: string;
  code: string;
  percent: number;
  pro_plans: CouponPlan[];
  pro_gift: boolean;
  ad_models: CouponAdModel[];
  valid_until: string | null;
  plans?: Partial<Record<CouponPlan, { price: number; discounted: number; currency: string }>>;
  price?: number;
  discounted?: number;
  currency?: string;
}

/** Kodu doğrular; geçersizse Türkçe hata mesajıyla fırlatır (bulunamadı / süresi dolmuş / bu pakette geçersiz / limit doldu) */
export function checkCoupon(code: string, product: "pro" | "gift" | "ad", plan: string | null, region: "tr" | "intl") {
  return api<CouponInfo>("POST", "rpc/coupon_check", {
    body: { p_code: code.trim(), p_product: product, p_plan: plan, p_region: region },
  });
}

/** İndirimli tutar (sunucudaki coupon_apply ile aynı: 2 haneye yuvarlanır) */
export const couponPrice = (price: number, percent: number) => Math.round(price * (100 - percent) + 1e-6) / 100;

// ---------------------------------------------------------------------------
// Yönetici
// ---------------------------------------------------------------------------

export type CouponState = "active" | "scheduled" | "expired" | "inactive" | "exhausted";

export interface AdminCoupon {
  id: string;
  code: string;
  percent: number;
  valid_from: string | null;
  valid_until: string | null;
  pro_plans: CouponPlan[];
  pro_gift: boolean;
  ad_models: CouponAdModel[];
  max_uses: number | null;
  max_uses_per_user: number | null;
  active: boolean;
  note: string;
  uses: number;
  created_at: string;
  creator_name: string;
  state: CouponState;
  /** Verilen toplam indirim, para birimi başına */
  discount: Record<string, number>;
}

export interface CouponDraft {
  id: string | null;
  code: string;
  percent: number;
  valid_from: string | null;
  valid_until: string | null;
  pro_plans: CouponPlan[];
  pro_gift: boolean;
  ad_models: CouponAdModel[];
  max_uses: number | null;
  max_uses_per_user: number | null;
  active: boolean;
  note: string;
}

export interface CouponRedemption {
  id: string;
  user_id: string | null;
  user_name: string;
  ref: string;
  product: string;
  plan: string;
  amount_before: number;
  amount_after: number;
  currency: string;
  created_at: string;
}

export async function adminCoupons(): Promise<AdminCoupon[]> {
  return (await api<AdminCoupon[]>("POST", "rpc/coupon_admin_list", { body: {} })) ?? [];
}

export function adminCouponSave(d: CouponDraft) {
  return api<string>("POST", "rpc/coupon_admin_save", {
    body: {
      p_id: d.id,
      p_code: d.code.trim().toUpperCase(),
      p_percent: d.percent,
      p_valid_from: d.valid_from,
      p_valid_until: d.valid_until,
      p_pro_plans: d.pro_plans,
      p_pro_gift: d.pro_gift,
      p_ad_models: d.ad_models,
      p_max_uses: d.max_uses,
      p_max_per_user: d.max_uses_per_user,
      p_active: d.active,
      p_note: d.note,
    },
  });
}

export function adminCouponSetActive(id: string, active: boolean) {
  return api("POST", "rpc/coupon_admin_set_active", { body: { p_id: id, p_active: active } });
}

export function adminCouponDelete(id: string) {
  return api("POST", "rpc/coupon_admin_delete", { body: { p_id: id } });
}

export async function adminCouponRedemptions(id: string): Promise<CouponRedemption[]> {
  return (await api<CouponRedemption[]>("POST", "rpc/coupon_admin_redemptions", { body: { p_id: id } })) ?? [];
}
