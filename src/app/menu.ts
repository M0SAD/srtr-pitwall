// Menü görünürlüğü (c77): yöneticinin Yönetim › Görünürlük › "Menü görünürlüğü"nden gizlediği menü kayıtları.
// Kimlikler kalıcıdır: bölüm için "drivers", alt sayfa için "drivers.league".
//   - Bölümler (sol menü) eskiden beri app_config.hidden_sections'ta durur (c21); aynı liste kullanılır.
//   - Alt sayfalar app_config.hidden_menu'de durur (c77). Sütun yoksa (eski sunucu) ya da ayar henüz
//     yüklenmediyse DEFAULT_HIDDEN_MENU geçerlidir: lig kayıtları varsayılan olarak gizlidir.
// Yöneticiler gizlenenleri de görür ("gizli" rozetiyle); üyelerde menüden kalkar ve doğrudan açılamaz.

import { config, isAdmin } from "@/cloud/account";

export interface MenuSub {
  id: string;
  label: string;
}

/** Alt sayfaları gizlenebilen bölümler (Canlı Sohbet sekmeleri Yönetim › Canlı Sohbet ayarları'ndan, Ayarlar gizlenemez) */
export const MENU_SUBS: Record<"telemetry" | "drivers" | "community", MenuSub[]> = {
  telemetry: [
    { id: "overview", label: "Telemetrim" },
    { id: "racers", label: "Yarışçılar" },
  ],
  drivers: [
    { id: "friends", label: "Arkadaşlar ve etiketler" },
    { id: "teams", label: "Takımlar" },
    { id: "crew", label: "Ekip" },
    { id: "league", label: "Lig Kategorileri" },
  ],
  community: [
    { id: "home", label: "Ana sayfa" },
    { id: "layouts", label: "Düzenler" },
    { id: "stream", label: "Yayın düzenleri" },
    { id: "shots", label: "Ekran Görüntüleri" },
    { id: "themes", label: "Temalar" },
    { id: "dashes", label: "Direksiyon Ekranları" },
  ],
};

/** Gizlenebilen bölümler, menüdeki sırayla (Yönetim, Hesap ve Ayarlar gizlenemez) */
export const MENU_TREE: { id: string; label: string; items: MenuSub[] }[] = [
  { id: "overlays", label: "Overlaylarım", items: [] },
  { id: "layouts", label: "Düzenler", items: [] },
  { id: "streaming", label: "Yayın", items: [] },
  { id: "drivers", label: "Sürücüler", items: MENU_SUBS.drivers },
  { id: "telemetry", label: "Telemetri", items: MENU_SUBS.telemetry },
  { id: "community", label: "Topluluk", items: MENU_SUBS.community },
  { id: "shots", label: "Ekran Görüntüleri", items: [] },
  { id: "tools", label: "Araçlar", items: [] },
  { id: "voice", label: "Sesli Mühendis", items: [] },
  { id: "livechat", label: "Canlı Sohbet", items: [] },
  { id: "support", label: "Destek", items: [] },
  { id: "pro", label: "PRO", items: [] },
];

/** Hiçbir zaman gizlenemeyen bölümler */
export const MENU_LOCKED = ["admin", "account", "settings"];

/** Varsayılan gizliler (c77 sütun varsayılanıyla aynı olmalı): lig kayıtları */
export const DEFAULT_HIDDEN_MENU = ["drivers.league"];

/** Gizli alt sayfa kimlikleri ("bölüm.sayfa"); sütun yoksa varsayılan */
export const hiddenMenu = (): string[] => {
  const v = config()?.hidden_menu;
  return Array.isArray(v) ? v : DEFAULT_HIDDEN_MENU;
};

const allSubsMarked = (sec: string) => {
  const items = (MENU_SUBS as Record<string, MenuSub[] | undefined>)[sec];
  if (!items?.length) return false;
  const h = hiddenMenu();
  return items.every((s) => h.includes(`${sec}.${s.id}`));
};

/** Gizli işaretli mi (yönetici rozeti için). sub boşsa bölümün kendisi. */
export function markedHiddenMenu(sec: string, sub = ""): boolean {
  if (MENU_LOCKED.includes(sec)) return false;
  const h = hiddenMenu();
  const secHidden = (config()?.hidden_sections ?? []).includes(sec) || h.includes(sec);
  if (!sub) return secHidden || allSubsMarked(sec);
  return secHidden || h.includes(`${sec}.${sub}`);
}

/** Bu kullanıcıdan gizli mi (yöneticiler hepsini görür) */
export const isHiddenMenu = (sec: string, sub = "") => !isAdmin() && markedHiddenMenu(sec, sub);

/** Bölümün bu kullanıcıya görünen alt sayfaları */
export const visibleSubs = <T extends { id: string }>(sec: string, subs: T[] | undefined): T[] | undefined =>
  subs?.filter((s) => !isHiddenMenu(sec, s.id));
