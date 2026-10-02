// Üst çubuk bağlantıları (app_config.top_links, c61): yöneticinin Yönetim › Üst çubuk bağlantıları bölümünde
// düzenlediği, üst çubuğun en solunda gösterilen bağlantı düğmeleri (Web sitesi, Discord, WhatsApp…).
// Kim görür: guest = giriş yapmamış, member = PRO olmayan üye, pro = PRO üye. Yöneticiler açık olanların hepsini görür.

import { config, isAdmin, isPro } from "./account";
import { session } from "./supabase";

export const TOP_ICONS = ["web", "discord", "whatsapp", "youtube", "twitch", "kick", "instagram", "x", "facebook", "telegram", "tiktok", "github", "mail", "link", "custom"] as const;
export type TopIcon = (typeof TOP_ICONS)[number];
export type TopAudience = "guest" | "member" | "pro";

export interface TopLink {
  id: string;
  label: string;
  url: string;
  icon: TopIcon;
  /** icon = "custom" iken: 'site' kovasındaki simgenin https adresi */
  image?: string;
  audiences: Record<TopAudience, boolean>;
  enabled: boolean;
}

export const TOP_LINKS_MAX = 12;

const all = () => ({ guest: true, member: true, pro: true });
export const defaultTopLinks = (): TopLink[] => [
  { id: "web", label: "SimRaceTR", url: "https://www.simracetr.com/", icon: "web", audiences: all(), enabled: true },
  { id: "discord", label: "Discord", url: "https://discord.gg/F6Gxn9Jjen", icon: "discord", audiences: all(), enabled: true },
  { id: "whatsapp", label: "WhatsApp", url: "https://chat.whatsapp.com/GDloVXAmyuEEUtHAvlwlw0", icon: "whatsapp", audiences: all(), enabled: true },
];

/** Sadece http(s), boşluksuz ve tırnaksız adresler açılır */
export const okLinkUrl = (u: unknown): u is string => typeof u === "string" && u.length <= 500 && /^https?:\/\/[^\s"'<>`\\]+$/i.test(u);
export const okImageUrl = (u: unknown): u is string => typeof u === "string" && u.length <= 600 && /^https:\/\/[^\s"'<>`\\]+$/i.test(u);

/** Sunucudan gelen değeri güvenli biçime çevirir (bozuk öğeler atılır) */
export function normalizeTopLinks(v: unknown): TopLink[] {
  if (!Array.isArray(v)) return [];
  const out: TopLink[] = [];
  const seen = new Set<string>();
  for (const raw of v as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!id || seen.has(id) || !okLinkUrl(raw.url)) continue;
    seen.add(id);
    const a = (raw.audiences ?? {}) as Record<string, unknown>;
    const icon = (TOP_ICONS as readonly string[]).includes(raw.icon as string) ? (raw.icon as TopIcon) : "link";
    out.push({
      id,
      label: String(raw.label ?? "").slice(0, 40),
      url: raw.url,
      icon,
      image: okImageUrl(raw.image) ? raw.image : "",
      audiences: { guest: a.guest !== false, member: a.member !== false, pro: a.pro !== false },
      enabled: raw.enabled !== false,
    });
    if (out.length >= TOP_LINKS_MAX) break;
  }
  return out;
}

/** Yapılandırmadaki liste. Sütun yoksa (eski sunucu) ya da yapılandırma henüz okunmadıysa boş. */
export const topLinks = (): TopLink[] => normalizeTopLinks((config() as { top_links?: unknown } | null)?.top_links);

export const currentAudience = (): TopAudience => (!session() ? "guest" : isPro() ? "pro" : "member");

/** Bu kullanıcıya gösterilecek bağlantılar */
export const visibleTopLinks = (): TopLink[] => {
  const aud = currentAudience();
  const adm = isAdmin();
  return topLinks().filter((l) => l.enabled && (adm || l.audiences[aud]));
};
