// Yönetici üst çubuk özeti ve canlı üye listesi (c49: admin_overview, admin_members_live).
// Sunucu sadece yöneticiye veri döndürür; yönetici olmayan / giriş yapmamış kullanıcıda hiç istek atılmaz.

import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { api, cloudEnabled, session } from "./supabase";
import { isAdmin } from "./account";

export interface AdminOverview {
  members: number;
  pro: number;
  /** PRO'lardan deneme kaynaklı olanlar (pro sayısına dahil) */
  trial: number;
  online: number;
  offline: number;
  racing: number;
  support_open: number;
}

export type MemberFilter = "all" | "online" | "racing" | "pro" | "offline";

export interface LiveMember {
  id: string;
  display_name: string;
  avatar_path: string | null;
  email: string;
  is_pro: boolean;
  pro_until: string | null;
  pro_source: string;
  is_admin: boolean;
  created_at: string | null;
  online: boolean;
  racing: boolean;
  sim: string;
  track: string;
  car: string;
  session: string;
  last_seen: string | null;
}

const [overview, setOverview] = createSignal<AdminOverview | null>(null);
export { overview as adminOverview };

const allowed = () => cloudEnabled && !!session() && isAdmin();

let busy = false;
export async function refreshAdminOverview() {
  if (!allowed()) {
    if (overview()) setOverview(null);
    return;
  }
  if (busy) return;
  busy = true;
  try {
    const r = await api<Partial<AdminOverview>>("POST", "rpc/admin_overview", { body: {} });
    // Boş nesne: sunucuya göre yönetici değil
    setOverview(
      r && typeof r === "object" && typeof r.members === "number"
        ? ({ ...r, trial: r.trial ?? 0, support_open: r.support_open ?? (r as { support?: number }).support ?? 0 } as AdminOverview)
        : null,
    );
  } catch {
    /* eski sunucu (c49 yok) ya da ağ hatası: özet gösterilmez / son değer kalır */
  } finally {
    busy = false;
  }
}

export const MEMBERS_PAGE = 200;

export function adminMembersLive(filter: MemberFilter, search: string, offset = 0) {
  return api<LiveMember[]>("POST", "rpc/admin_members_live", {
    body: { p_filter: filter, p_search: search, p_limit: MEMBERS_PAGE, p_offset: offset },
  });
}

/** Ana pencerede bir kez: yönetici olunca, 60 sn'de bir ve pencere öne gelince yeniler. Yönetici değilse istek atmaz. */
export function useAdminOverview() {
  createEffect(on([() => session()?.user.id, isAdmin], () => void refreshAdminOverview()));
  const iv = window.setInterval(() => allowed() && !document.hidden && void refreshAdminOverview(), 60_000);
  const onFocus = () => allowed() && void refreshAdminOverview();
  window.addEventListener("focus", onFocus);
  onCleanup(() => {
    clearInterval(iv);
    window.removeEventListener("focus", onFocus);
  });
}
