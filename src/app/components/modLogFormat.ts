// Moderasyon kayıtlarını (mod_log) okunur Türkçe cümleye çevirir ve kaydın ilgili yönetim bölümünü bulur.
// İşlem adları supabase/*.sql içindeki log_mod çağrılarından: içerik silme/düzenleme (audit_content), raporlar,
// yönetici / grup, reklam, mesaj raporu, destek, özel mesajlar, takım, kupon, PRO özellikleri, ses paketleri ve
// gönderileri, PRO tanıtım mesajı, önizleme arka planları, çeviriler (c42). Bilinmeyen işlem ham adıyla gösterilir.

import { LANGS, t } from "@/sdk/i18n";
import { LOG_TARGETS, REPORT_REASONS, TARGET_LABELS, type ModLog } from "@/cloud/moderation";
import { MESSAGE_REPORT_REASONS } from "@/cloud/social";
import { categoryLabel } from "@/cloud/support";
import { proFeatureCatalog } from "@/sdk/proFeatures";
import type { AdminFocus } from "./adminFocus";

export interface LogView {
  /** Okunur cümle */
  text: string;
  /** Tıklanınca açılacak yönetim bölümü ve öğe */
  target?: AdminFocus;
}

const q = (s: unknown, n = 80) => {
  const v = String(s ?? "").replace(/\s+/g, " ").trim();
  return v.length > n ? v.slice(0, n - 1) + "…" : v;
};
const reason = (id: unknown) => REPORT_REASONS.find((r) => r.id === id)?.label ?? String(id ?? "");
const msgReason = (id: unknown) => MESSAGE_REPORT_REASONS.find((r) => r.id === id)?.label ?? String(id ?? "");
const langName = (c: unknown) => LANGS.find((l) => l.code === c)?.name ?? String(c ?? "");
const day = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString("tr-TR") : "");
const kindLabel = (k: string) => (TARGET_LABELS as Record<string, string>)[k] ?? ({ theme: "Paylaşılan tema" } as Record<string, string>)[k] ?? k;

// PRO özellik kataloğu: anahtar → "Overlay › Relative › Lastik sütunu"
let catalog: Map<string, { label: string; def: boolean }> | null = null;
export function proFeatureLabel(key: string): string {
  if (!catalog) {
    catalog = new Map();
    for (const f of proFeatureCatalog()) {
      const head = f.group === "Overlay'ler" ? "Overlay" : f.group;
      const parts = [head, f.sub, f.sub2, f.kind === "overlay" ? "" : f.label].filter(Boolean) as string[];
      if (!catalog.has(f.key)) catalog.set(f.key, { label: parts.join(" › "), def: f.defaultPro });
    }
  }
  return catalog.get(key)?.label ?? key;
}
const proDefault = (key: string) => {
  proFeatureLabel(key);
  return catalog?.get(key)?.def;
};
/** PRO kararını söze çevirir (null = varsayılan) */
function proState(key: string, v: unknown): string {
  if (v === true) return t("PRO");
  if (v === false) return t("herkese açık");
  const d = proDefault(key);
  return d === undefined ? t("varsayılan") : t("varsayılan ({0})", d ? "PRO" : t("herkese açık"));
}

const AD_ACT: Record<string, string> = {
  approve: "onaylandı",
  reject: "reddedildi",
  pause: "durduruldu",
  resume: "yeniden yayına alındı",
  extend: "uzatıldı",
  end: "bitirildi",
  delete: "silindi",
};
const SUB_ST: Record<string, string> = { new: "yeni", reviewing: "inceleniyor", accepted: "kabul edildi", rejected: "reddedildi" };
const BACKDROP_NAMES: Record<string, string> = { track: "Pist (gündüz)", night: "Pist (gece)", cockpit: "Kokpit", plain: "Düz" };

const MORE_TARGETS: Record<string, string> = {
  theme: "Paylaşılan tema",
  dash: "Paylaşılan direksiyon ekranı",
  dash_comment: "Direksiyon ekranı yorumu",
  pro_feature: "PRO özelliği",
  coupon: "Kupon",
  voice_pack: "Ses paketi",
  voice_submission: "Ses paketi gönderisi",
  config: "Ayar",
  i18n: "Çeviri",
};
/** Kaydın hedef türü (rozet) */
export const logTargetLabel = (k: string) => LOG_TARGETS[k] ?? MORE_TARGETS[k] ?? k;

/** Kaydı okunur hale getirir */
export function formatModLog(l: ModLog): LogView {
  const d = (l.details ?? {}) as Record<string, any>;
  const a = l.action;
  const who = l.owner_name ? q(l.owner_name, 40) : "";
  const user = (): AdminFocus | undefined => (who ? { sub: "members", q: who } : undefined);

  // İçerik silme / düzenleme (audit_content): shot, shot_comment, layout, layout_comment, theme
  if (a === "delete" || a === "update") {
    const kind = kindLabel(l.target_type);
    if (a === "update" && d.before && d.after) {
      const b = q(d.before.title ?? d.before.body ?? "", 60);
      const n = q(d.after.title ?? d.after.body ?? "", 60);
      return { text: t("{0} düzenlendi{1}: “{2}” → “{3}”", kind, who ? t(" ({0} adlı üyenin)", who) : "", b, n), target: user() };
    }
    const title = q(d.title ?? d.body ?? d.name ?? "", 80);
    return { text: t("{0} silindi{1}{2}", kind, who ? t(" ({0} adlı üyenin)", who) : "", title ? `: “${title}”` : ""), target: user() };
  }

  if (a.startsWith("report_")) {
    const st = a.slice(7);
    const what = { resolved: "kapatıldı (çözüldü)", dismissed: "reddedildi", open: "yeniden açıldı" }[st] ?? st;
    return {
      text: t("{0} raporu {1} — sebep: {2}{3}", kindLabel(String(d.target_type ?? "")), t(what), t(reason(d.reason)), who ? t(", raporlayan: {0}", who) : ""),
      target: { sub: "moderation" },
    };
  }

  switch (a) {
    // Topluluk › Direksiyon Ekranları: moderatör paylaşımı gizledi / yeniden gösterdi (dash_set_hidden)
    case "dash_hide":
    case "dash_show":
      return {
        text: t(a === "dash_hide" ? "Paylaşılan direksiyon ekranı gizlendi{0}{1}" : "Paylaşılan direksiyon ekranı yeniden gösterildi{0}{1}", who ? t(" ({0} adlı üyenin)", who) : "", d.title ? `: “${q(d.title, 80)}”` : ""),
        target: user(),
      };
    case "admin_grant":
      return { text: t("{0} yönetici yapıldı", who || "?"), target: user() };
    case "admin_revoke":
      return { text: t("{0} adlı üyenin yöneticiliği alındı", who || "?"), target: user() };
    case "group_add":
      return { text: t("{0}, “{1}” grubuna eklendi", who || "?", q(d.group, 40)), target: user() };
    case "group_remove":
      return { text: t("{0}, “{1}” grubundan çıkarıldı", who || "?", q(d.group, 40)), target: user() };
    case "ad_force_delete":
      return {
        text: t("Reklam kalıcı olarak silindi: “{0}”{1} (durum: {2}, rapor: {3})", q(d.title, 60), who ? t(", sahibi {0}", who) : "", String(d.status ?? "?"), String(d.reports ?? 0)),
        target: { sub: "ads" },
      };
    case "messages_view": {
      const parts: string[] = [];
      if (d.user) parts.push(t("üye: {0}", q(d.user, 40)));
      if (d.other) parts.push(t("karşı taraf: {0}", q(d.other, 40)));
      // c80: tür (dm / team / group / crew) ve oda adı
      if (d.kind) parts.push(t("tür: {0}", d.kind === "dm" ? t("Arkadaş") : d.kind === "team" ? t("Takım") : d.kind === "group" ? t("Grup") : d.kind === "crew" ? t("Ekip") : String(d.kind)));
      if (d.room) parts.push(t("oda: {0}", q(d.room, 40)));
      if (d.text) parts.push(t("metin: “{0}”", q(d.text, 40)));
      if (d.from || d.to) parts.push(t("tarih: {0} – {1}", day(d.from) || "…", day(d.to) || "…"));
      return { text: t("Özel mesajlara bakıldı{0}", parts.length ? ` (${parts.join(", ")})` : ""), target: { sub: "messages", q: d.user ? String(d.user) : undefined } };
    }
    case "support_delete":
      return {
        text: t("Destek talebi silindi: “{0}” ({1}, {2} mesaj, {3} görsel){4}", q(d.subject, 60), t(categoryLabel(String(d.category ?? ""))), String(d.messages ?? 0), String(d.images ?? 0), who ? t(", sahibi {0}", who) : ""),
        target: { sub: "support" },
      };
    case "team_delete":
      return { text: t("Takım silindi: {0}{1}{2}", q(d.name, 50), d.tag ? ` [${q(d.tag, 10)}]` : "", who ? t(", kurucusu {0}", who) : ""), target: user() };
    case "coupon_create":
      return { text: t("Kupon oluşturuldu: {0} (%{1} indirim)", q(d.code, 30), String(d.percent ?? "?")), target: { sub: "coupons", q: String(d.code ?? "") } };
    case "coupon_update": {
      const ch: string[] = [];
      if (d.old_code && d.old_code !== d.code) ch.push(t("kod {0} → {1}", q(d.old_code, 30), q(d.code, 30)));
      if (d.old_percent != null && d.old_percent !== d.percent) ch.push(t("indirim %{0} → %{1}", String(d.old_percent), String(d.percent)));
      if (d.valid_until) ch.push(t("bitiş {0}", day(d.valid_until)));
      if (d.active === false) ch.push(t("kapalı"));
      return { text: t("Kupon düzenlendi: {0}{1}", q(d.code, 30), ch.length ? ` (${ch.join(", ")})` : ""), target: { sub: "coupons", q: String(d.code ?? "") } };
    }
    case "coupon_activate":
      return { text: t("Kupon yeniden açıldı: {0}", q(d.code, 30)), target: { sub: "coupons", q: String(d.code ?? "") } };
    case "coupon_deactivate":
      return { text: t("Kupon kapatıldı: {0}", q(d.code, 30)), target: { sub: "coupons", q: String(d.code ?? "") } };
    case "coupon_delete":
      return { text: t("Kupon silindi: {0} (%{1})", q(d.code, 30), String(d.percent ?? "?")), target: { sub: "coupons" } };
    case "pro_feature_set": {
      const key = l.target_id;
      return {
        text: t("PRO özellikleri: '{0}' {1} yapıldı (önce: {2})", proFeatureLabel(key), proState(key, d.after), proState(key, d.before)),
        target: { sub: "profeatures", q: key },
      };
    }
    case "pro_feature_set_many": {
      const items = Object.entries((d.items ?? {}) as Record<string, unknown>);
      const desc = items
        .slice(0, 3)
        .map(([k, v]) => `'${proFeatureLabel(k)}' → ${proState(k, v)}`)
        .join("; ");
      const more = items.length > 3 ? t(" ve {0} özellik daha", items.length - 3) : "";
      const common = items.length > 1 ? commonPrefix(items.map(([k]) => k)) : items[0]?.[0] ?? "";
      return { text: t("PRO özellikleri: {0} özellik birden değiştirildi: {1}{2}", items.length, desc, more), target: { sub: "profeatures", q: common } };
    }
    case "voice_pack_create":
    case "voice_pack_update": {
      const ver = d.old_version != null && d.old_version !== d.version ? t("sürüm {0} → {1}", String(d.old_version), String(d.version)) : t("sürüm {0}", String(d.version ?? "?"));
      const pub = d.old_published != null && d.old_published !== d.published ? (d.published ? t(", yayına alındı") : t(", yayından kaldırıldı")) : d.published ? "" : t(", yayında değil");
      return {
        text: t(a === "voice_pack_create" ? "Ses paketi eklendi: {0} ({1}, {2}{3})" : "Ses paketi güncellendi: {0} ({1}, {2}{3})", q(d.name, 50), q(d.language, 30), ver, pub),
        target: { sub: "voicepacks", q: String(d.name ?? "") },
      };
    }
    case "voice_pack_delete":
      return { text: t("Ses paketi silindi: {0} ({1}, sürüm {2})", q(d.name, 50), q(d.language, 30), String(d.version ?? "?")), target: { sub: "voicepacks" } };
    case "pro_promo_set":
      return {
        text: d.enabled
          ? t("PRO tanıtım mesajı kaydedildi{0}{1}", d.title ? `: “${q(d.title, 60)}”` : "", d.old_enabled ? "" : t(" ve açıldı"))
          : t("PRO tanıtım mesajı kapatıldı"),
        target: { sub: "propromo" },
      };
    case "sim_icons_set":
      return { text: d.on ? t("Sim seçicide oyun ikonları açıldı") : t("Sim seçicide yazılı görünüme dönüldü"), target: { sub: "visibility" } };
    case "backup_run":
      return {
        text: t("Yedek indirildi ({0} tablo, {1} satır, {2} dosya{3})", String(d.tables ?? 0), String(d.rows ?? 0), String(d.files ?? 0), Number(d.errors) > 0 ? t(", {0} hata", String(d.errors)) : ""),
        target: { sub: "backup" },
      };
    case "restore_run":
      return { text: t("Yedekten geri yükleme başlatıldı ({0})", q(d.file, 80)), target: { sub: "backup" } };
    case "restore_done":
      return {
        text: t("Yedekten geri yükleme tamamlandı ({0} tablo, {1} satır, {2} dosya{3})", String(d.tables ?? 0), String(d.rows ?? 0), String(d.files ?? 0), Number(d.errors) > 0 ? t(", {0} hata", String(d.errors)) : ""),
        target: { sub: "backup" },
      };
    case "restore_failed":
      return { text: t("Yedekten geri yükleme tamamlanamadı ({0})", d.cancelled ? t("iptal edildi") : q(d.error, 120)), target: { sub: "backup" } };
    case "top_links_set":
      return {
        text: t("Üst çubuk bağlantıları güncellendi ({0} bağlantı, {1} açık{2})", String(d.count ?? 0), String(d.enabled ?? 0), Array.isArray(d.labels) && d.labels.length ? `: ${q(d.labels.join(", "), 120)}` : ""),
        target: { sub: "toplinks" },
      };
    case "preview_backdrops_set":
      return {
        text: t("Overlay arka planları güncellendi (varsayılan: {0}{1})", t(BACKDROP_NAMES[d.default] ?? String(d.default ?? "?")), d.old_default && d.old_default !== d.default ? t(", önce: {0}", t(BACKDROP_NAMES[d.old_default] ?? String(d.old_default))) : ""),
        target: { sub: "backdrops" },
      };
    case "i18n_set":
    case "i18n_delete": {
      const key = String(d.key ?? "");
      const scope = key.startsWith("site:") ? t("Web sitesi") : t("Program");
      const src = q(key.replace(/^(app|site):/, ""), 60);
      return {
        text:
          a === "i18n_set"
            ? t("Çeviri düzeltildi ({0}, {1}): “{2}” → “{3}”", langName(d.lang), scope, src, q(d.value, 60))
            : t("Çeviri düzeltmesi kaldırıldı ({0}, {1}): “{2}”", langName(d.lang), scope, src),
        target: { sub: "translations", id: `${d.lang}|${key}` },
      };
    }
  }

  if (a.startsWith("ad_")) {
    const act = a.slice(3);
    const extra = [d.amount ? t("{0} gün", String(d.amount)) : "", d.note ? t("not: {0}", q(d.note, 60)) : ""].filter(Boolean).join(", ");
    return {
      text: t("Reklam {0}: “{1}”{2}{3}", t(AD_ACT[act] ?? act), q(d.title, 60), who ? t(", sahibi {0}", who) : "", extra ? ` (${extra})` : ""),
      target: { sub: "ads" },
    };
  }
  if (a.startsWith("message_report_")) {
    const act = a.slice(15);
    const what = { dismiss: "yoksayıldı", resolve: "kapatıldı", reopen: "yeniden açıldı", delete_message: "kapatıldı, mesaj silindi" }[act] ?? act;
    return {
      text: t("Mesaj raporu {0} — sebep: {1}{2}{3}", t(what), t(msgReason(d.reason)), who ? t(", mesajı yazan: {0}", who) : "", d.body ? `: “${q(d.body, 60)}”` : ""),
      target: { sub: "moderation" },
    };
  }
  if (a.startsWith("voice_submission_")) {
    const st = a.slice(17);
    return {
      text: t("Ses paketi gönderisi {0}: {1} ({2}){3}{4}", t(SUB_ST[st] ?? st), q(d.pack_name, 50), q(d.language, 30), who ? t(", gönderen {0}", who) : "", d.note ? t(" — not: {0}", q(d.note, 60)) : ""),
      target: { sub: "voicepacks", q: String(d.pack_name ?? "") },
    };
  }

  // Bilinmeyen işlem: ham ad + kısa ayrıntı
  const raw = Object.entries(d)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${q(v, 40)}`)
    .join(", ");
  return { text: `${a}${l.target_id ? ` · ${q(l.target_id, 40)}` : ""}${raw ? ` (${raw})` : ""}` };
}

/** Anahtarların ortak başı ("overlay.relative.") — toplu değişiklikte aramaya yazılır */
function commonPrefix(keys: string[]): string {
  if (!keys.length) return "";
  let p = keys[0];
  for (const k of keys) while (p && !k.startsWith(p)) p = p.slice(0, -1);
  const i = p.lastIndexOf(".");
  return i > 2 ? p.slice(0, i) : "";
}
