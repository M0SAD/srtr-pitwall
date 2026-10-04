// Yönetim alt menüsü ve görünürlüğü: kabuk (App.tsx) bunu kullanır; Yönetim sayfasının kendisi ilk açılışta yüklenir.

import { isAdmin } from "@/cloud/account";
import { can } from "@/cloud/moderation";

/** Yönetim alt menüsü: kullanıcının yetkisine göre */
export function adminSubs(): { id: string; label: string }[] {
  const all: { id: string; label: string; need: () => boolean }[] = [
    { id: "overview", label: "Özet", need: isAdmin },
    { id: "revenue", label: "Gelir", need: isAdmin },
    { id: "members", label: "Üyeler", need: isAdmin },
    { id: "support", label: "Destek", need: () => isAdmin() || can("reports.view") },
    { id: "subs", label: "Abonelikler", need: isAdmin },
    { id: "devices", label: "Cihazlar", need: isAdmin },
    { id: "plans", label: "Planlar ve fiyatlar", need: isAdmin },
    { id: "promo", label: "Ücretsiz PRO", need: isAdmin },
    { id: "trial", label: "Deneme PRO", need: isAdmin },
    { id: "ads", label: "Reklamlar", need: isAdmin },
    { id: "coupons", label: "Kuponlar", need: isAdmin },
    { id: "profeatures", label: "PRO özellikleri", need: isAdmin },
    { id: "visibility", label: "Görünürlük", need: isAdmin },
    { id: "notices", label: "Bildirimler", need: isAdmin },
    { id: "moderation", label: "Moderasyon", need: () => isAdmin() || can("reports.view") },
    { id: "messages", label: "Mesajlar", need: isAdmin },
    { id: "media", label: "Medya", need: isAdmin },
    { id: "voicepacks", label: "Ses paketleri", need: isAdmin },
    { id: "livechat", label: "Canlı Sohbet ayarları", need: isAdmin },
    { id: "propromo", label: "PRO tanıtım mesajı", need: isAdmin },
    { id: "backdrops", label: "Overlay arka planları", need: isAdmin },
    { id: "toplinks", label: "Üst çubuk bağlantıları", need: isAdmin },
    { id: "translations", label: "Çeviriler", need: isAdmin },
    { id: "backup", label: "Yedekleme", need: isAdmin },
  ];
  return all.filter((x) => x.need()).map(({ id, label }) => ({ id, label }));
}

export const canSeeAdmin = () => isAdmin() || can("reports.view");
