// Yönetim › Moderasyon kayıtları (sadece site sahibi; mod_log tablosunu sahip okur).
// Her kayıt okunur Türkçe cümleye çevrilir (programdaki src/app/components/modLogFormat.ts ile aynı kurallar) ve
// tıklanınca ilgili yönetim bölümü açılır (PRO özellikleri arama kutusu anahtarla dolu, üye araması adla dolu…).
import { esc, fmtDate, sb } from "./core.js";

const PAGE = 100;
const TARGETS = {
  shot: "Ekran görüntüsü",
  shot_comment: "Ekran görüntüsü yorumu",
  layout: "Paylaşılan düzen",
  layout_comment: "Düzen yorumu",
  theme: "Paylaşılan tema",
  report: "Rapor",
  user: "Kullanıcı",
  message: "Mesaj",
  team: "Takım",
  support: "Destek talebi",
  ad: "Reklam",
  pro_feature: "PRO özelliği",
  coupon: "Kupon",
  voice_pack: "Ses paketi",
  voice_submission: "Ses paketi gönderisi",
  config: "Ayar",
  i18n: "Çeviri",
};
const REASONS = {
  inappropriate: "Uygunsuz içerik",
  spam: "Spam / reklam",
  copyright: "Telif hakkı ihlali",
  harassment: "Hakaret / taciz",
  impersonation: "Başkasının içeriği / kimliği",
  scam: "Dolandırıcılık",
  other: "Diğer",
};
const SUPPORT_CATS = { bug: "Hata bildirimi", overlay: "Overlay / görünüm", payment: "Ödeme / abonelik", account: "Hesap", feature: "Öneri / istek", other: "Diğer" };
const AD_ACT = { approve: "onaylandı", reject: "reddedildi", pause: "durduruldu", resume: "yeniden yayına alındı", extend: "uzatıldı", end: "bitirildi", delete: "silindi" };
const SUB_ST = { new: "yeni", reviewing: "inceleniyor", accepted: "kabul edildi", rejected: "reddedildi" };
const BACKDROPS = { track: "Pist (gündüz)", night: "Pist (gece)", cockpit: "Kokpit", plain: "Düz" };
const LANG_NAMES = { tr: "Türkçe", en: "English", de: "Deutsch", es: "Español", fr: "Français", it: "Italiano", "pt-BR": "Português (BR)", "pt-PT": "Português (PT)", nl: "Nederlands", pl: "Polski", sv: "Svenska", fi: "Suomi", ru: "Русский", "zh-CN": "简体中文", ja: "日本語" };

const q = (s, n = 80) => {
  const v = String(s ?? "").replace(/\s+/g, " ").trim();
  return v.length > n ? v.slice(0, n - 1) + "…" : v;
};
const day = (v) => (v ? new Date(v).toLocaleDateString("tr-TR") : "…");

/** PRO özellik kataloğu (sunucudaki pro_feature_catalog; program yazar): anahtar → {label, def} */
let catalog = null;
async function loadCatalog() {
  if (catalog) return catalog;
  catalog = new Map();
  try {
    const { data } = await sb.rpc("pro_features_admin_list");
    for (const r of data || []) {
      const head = r.grp === "Overlay'ler" ? "Overlay" : r.grp || "";
      const label = String(r.label || r.key).replace(/ › Overlay'in kendisi$/, "");
      catalog.set(r.key, { label: [head, label].filter(Boolean).join(" › "), def: r.default_pro });
    }
  } catch {}
  return catalog;
}
const featLabel = (k) => catalog?.get(k)?.label || k;
function proState(k, v) {
  if (v === true) return "PRO";
  if (v === false) return "herkese açık";
  const d = catalog?.get(k)?.def;
  return d === undefined || d === null ? "varsayılan" : `varsayılan (${d ? "PRO" : "herkese açık"})`;
}
function commonPrefix(keys) {
  if (!keys.length) return "";
  let p = keys[0];
  for (const k of keys) while (p && !k.startsWith(p)) p = p.slice(0, -1);
  const i = p.lastIndexOf(".");
  return i > 2 ? p.slice(0, i) : "";
}

/** Kayıt → { text, go: [bölüm, arama] } */
export function formatLog(l) {
  const d = l.details || {};
  const a = l.action;
  const who = l.owner_name ? q(l.owner_name, 40) : "";
  const user = who ? ["uyeler", who] : null;
  const kind = TARGETS[l.target_type] || l.target_type;
  const sahibi = who ? `, sahibi ${who}` : "";

  if (a === "delete" || a === "update") {
    if (a === "update" && d.before && d.after)
      return { text: `${kind} düzenlendi${who ? ` (${who} adlı üyenin)` : ""}: “${q(d.before.title ?? d.before.body, 60)}” → “${q(d.after.title ?? d.after.body, 60)}”`, go: user };
    const title = q(d.title ?? d.body ?? d.name ?? "", 80);
    return { text: `${kind} silindi${who ? ` (${who} adlı üyenin)` : ""}${title ? `: “${title}”` : ""}`, go: user };
  }
  if (a.startsWith("report_")) {
    const what = { resolved: "kapatıldı (çözüldü)", dismissed: "reddedildi", open: "yeniden açıldı" }[a.slice(7)] || a.slice(7);
    return { text: `${TARGETS[d.target_type] || d.target_type || ""} raporu ${what} — sebep: ${REASONS[d.reason] || d.reason || "?"}${who ? `, raporlayan: ${who}` : ""}`, go: null };
  }
  switch (a) {
    case "admin_grant":
      return { text: `${who || "?"} yönetici yapıldı`, go: user };
    case "admin_revoke":
      return { text: `${who || "?"} adlı üyenin yöneticiliği alındı`, go: user };
    case "group_add":
      return { text: `${who || "?"}, “${q(d.group, 40)}” grubuna eklendi`, go: user };
    case "group_remove":
      return { text: `${who || "?"}, “${q(d.group, 40)}” grubundan çıkarıldı`, go: user };
    case "ad_force_delete":
      return { text: `Reklam kalıcı olarak silindi: “${q(d.title, 60)}”${sahibi} (durum: ${d.status ?? "?"}, rapor: ${d.reports ?? 0})`, go: ["reklamlar", ""] };
    case "messages_view": {
      const p = [];
      if (d.user) p.push(`üye: ${q(d.user, 40)}`);
      if (d.other) p.push(`karşı taraf: ${q(d.other, 40)}`);
      if (d.text) p.push(`metin: “${q(d.text, 40)}”`);
      if (d.from || d.to) p.push(`tarih: ${day(d.from)} – ${day(d.to)}`);
      return { text: `Özel mesajlara bakıldı${p.length ? ` (${p.join(", ")})` : ""}`, go: ["tum-mesajlar", ""] };
    }
    case "support_delete":
      return { text: `Destek talebi silindi: “${q(d.subject, 60)}” (${SUPPORT_CATS[d.category] || d.category || "?"}, ${d.messages ?? 0} mesaj, ${d.images ?? 0} görsel)${sahibi}`, go: ["destek", ""] };
    case "team_delete":
      return { text: `Takım silindi: ${q(d.name, 50)}${d.tag ? ` [${q(d.tag, 10)}]` : ""}${who ? `, kurucusu ${who}` : ""}`, go: user };
    case "coupon_create":
      return { text: `Kupon oluşturuldu: ${q(d.code, 30)} (%${d.percent ?? "?"} indirim)`, go: ["kuponlar", d.code] };
    case "coupon_update": {
      const ch = [];
      if (d.old_code && d.old_code !== d.code) ch.push(`kod ${q(d.old_code, 30)} → ${q(d.code, 30)}`);
      if (d.old_percent != null && d.old_percent !== d.percent) ch.push(`indirim %${d.old_percent} → %${d.percent}`);
      if (d.valid_until) ch.push(`bitiş ${day(d.valid_until)}`);
      if (d.active === false) ch.push("kapalı");
      return { text: `Kupon düzenlendi: ${q(d.code, 30)}${ch.length ? ` (${ch.join(", ")})` : ""}`, go: ["kuponlar", d.code] };
    }
    case "coupon_activate":
      return { text: `Kupon yeniden açıldı: ${q(d.code, 30)}`, go: ["kuponlar", d.code] };
    case "coupon_deactivate":
      return { text: `Kupon kapatıldı: ${q(d.code, 30)}`, go: ["kuponlar", d.code] };
    case "coupon_delete":
      return { text: `Kupon silindi: ${q(d.code, 30)} (%${d.percent ?? "?"})`, go: ["kuponlar", ""] };
    case "pro_feature_set":
      return {
        text: `PRO özellikleri: '${featLabel(l.target_id)}' ${proState(l.target_id, d.after)} yapıldı (önce: ${proState(l.target_id, d.before)})`,
        go: ["pro-ozellikleri", l.target_id],
      };
    case "pro_feature_set_many": {
      const items = Object.entries(d.items || {});
      const desc = items
        .slice(0, 3)
        .map(([k, v]) => `'${featLabel(k)}' → ${proState(k, v)}`)
        .join("; ");
      return {
        text: `PRO özellikleri: ${items.length} özellik birden değiştirildi: ${desc}${items.length > 3 ? ` ve ${items.length - 3} özellik daha` : ""}`,
        go: ["pro-ozellikleri", items.length > 1 ? commonPrefix(items.map(([k]) => k)) : items[0]?.[0] || ""],
      };
    }
    case "voice_pack_create":
    case "voice_pack_update": {
      const ver = d.old_version != null && d.old_version !== d.version ? `sürüm ${d.old_version} → ${d.version}` : `sürüm ${d.version ?? "?"}`;
      const pub = d.old_published != null && d.old_published !== d.published ? (d.published ? ", yayına alındı" : ", yayından kaldırıldı") : d.published ? "" : ", yayında değil";
      return { text: `Ses paketi ${a === "voice_pack_create" ? "eklendi" : "güncellendi"}: ${q(d.name, 50)} (${q(d.language, 30)}, ${ver}${pub})`, go: ["ses-paketleri", d.name] };
    }
    case "voice_pack_delete":
      return { text: `Ses paketi silindi: ${q(d.name, 50)} (${q(d.language, 30)}, sürüm ${d.version ?? "?"})`, go: ["ses-paketleri", ""] };
    case "pro_promo_set":
      return { text: d.enabled ? `PRO tanıtım mesajı kaydedildi${d.title ? `: “${q(d.title, 60)}”` : ""}${d.old_enabled ? "" : " ve açıldı"}` : "PRO tanıtım mesajı kapatıldı", go: null };
    case "preview_backdrops_set":
      return {
        text: `Overlay önizleme arka planları güncellendi (varsayılan: ${BACKDROPS[d.default] || d.default}${d.old_default && d.old_default !== d.default ? `, önce: ${BACKDROPS[d.old_default] || d.old_default}` : ""})`,
        go: null,
      };
    case "i18n_set":
    case "i18n_delete": {
      const key = String(d.key || "");
      const scope = key.startsWith("site:") ? "Web sitesi" : "Program";
      const src = q(key.replace(/^(app|site):/, ""), 60);
      return {
        text: a === "i18n_set" ? `Çeviri düzeltildi (${LANG_NAMES[d.lang] || d.lang}, ${scope}): “${src}” → “${q(d.value, 60)}”` : `Çeviri düzeltmesi kaldırıldı (${LANG_NAMES[d.lang] || d.lang}, ${scope}): “${src}”`,
        go: null,
      };
    }
  }
  if (a.startsWith("ad_")) {
    const extra = [d.amount ? `${d.amount} gün` : "", d.note ? `not: ${q(d.note, 60)}` : ""].filter(Boolean).join(", ");
    return { text: `Reklam ${AD_ACT[a.slice(3)] || a.slice(3)}: “${q(d.title, 60)}”${sahibi}${extra ? ` (${extra})` : ""}`, go: ["reklamlar", d.title] };
  }
  if (a.startsWith("message_report_")) {
    const act = a.slice(15);
    const what = { dismiss: "yoksayıldı", resolve: "kapatıldı", reopen: "yeniden açıldı", delete_message: "kapatıldı, mesaj silindi" }[act] || act;
    return { text: `Mesaj raporu ${what} — sebep: ${REASONS[d.reason] || d.reason || "?"}${who ? `, mesajı yazan: ${who}` : ""}${d.body ? `: “${q(d.body, 60)}”` : ""}`, go: ["mesajlar", ""] };
  }
  if (a.startsWith("voice_submission_")) {
    const st = a.slice(17);
    return { text: `Ses paketi gönderisi ${SUB_ST[st] || st}: ${q(d.pack_name, 50)} (${q(d.language, 30)})${who ? `, gönderen ${who}` : ""}${d.note ? ` — not: ${q(d.note, 60)}` : ""}`, go: ["ses-paketleri", d.pack_name] };
  }
  const raw = Object.entries(d)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${q(v, 40)}`)
    .join(", ");
  return { text: `${a}${l.target_id ? ` · ${q(l.target_id, 40)}` : ""}${raw ? ` (${raw})` : ""}`, go: null };
}

/** Bölüm: nav(bölüm, arama) ilgili yönetim bölümünü açar */
export async function kayitlar(el, nav) {
  let rows = [];
  let done = false;
  await loadCatalog();
  const load = async (reset) => {
    const { data, error } = await sb
      .from("mod_log")
      .select("*")
      .order("created_at", { ascending: false })
      .range(reset ? 0 : rows.length, (reset ? 0 : rows.length) + PAGE - 1);
    if (error) throw new Error(error.message);
    rows = reset ? data || [] : [...rows, ...(data || [])];
    done = (data || []).length < PAGE;
    draw();
  };
  const draw = () => {
    el.innerHTML = `<div class="row between" style="margin-bottom:14px"><h2 style="margin:0">Moderasyon kayıtları</h2><button class="btn btn-sm" id="ml-re">Yenile</button></div>
      <p class="muted small">Başkasının içeriğini silen/düzenleyen, raporu kapatan, yönetici ya da grup değiştiren, kupon / PRO özelliği / ses paketi / çeviri
        değiştiren herkesin işlemi. Bir kayda tıklayınca ilgili bölüm açılır. Sadece site sahibi görür.</p>
      <div class="card table-scroll"><table class="list"><thead><tr><th>Tarih</th><th>Yapan</th><th>Tür</th><th>İşlem</th></tr></thead><tbody>
      ${
        rows.length
          ? rows
              .map((l, i) => {
                const v = formatLog(l);
                return `<tr data-i="${i}" ${v.go ? `style="cursor:pointer" title="İlgili bölümü aç"` : ""}><td class="muted small" style="white-space:nowrap">${esc(fmtDate(l.created_at, true))}</td>
                  <td><b>${esc(l.actor_name || "?")}</b></td><td><span class="badge">${esc(TARGETS[l.target_type] || l.target_type)}</span></td>
                  <td>${esc(v.text)}${v.go ? ` <span class="muted">›</span>` : ""}</td></tr>`;
              })
              .join("")
          : `<tr><td colspan="4" class="muted">Henüz kayıt yok (ya da bu bölümü sadece site sahibi görebilir).</td></tr>`
      }</tbody></table></div>
      ${done ? "" : `<button class="btn btn-sm" id="ml-more" style="margin-top:10px">Daha fazla</button>`}`;
    el.querySelector("#ml-re").addEventListener("click", () => load(true));
    el.querySelector("#ml-more")?.addEventListener("click", () => load(false));
    el.querySelectorAll("tr[data-i]").forEach((tr) =>
      tr.addEventListener("click", () => {
        const v = formatLog(rows[+tr.dataset.i]);
        if (v.go) nav(v.go[0], v.go[1] || "");
      }),
    );
  };
  await load(true);
}
