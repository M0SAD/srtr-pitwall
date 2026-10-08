// Yönetim › PRO özellikleri (sadece yöneticiler): her özellik için "PRO" ya da "Herkese açık" kararı.
// Liste sunucudaki katalogdan gelir (program, yönetici Yönetim › PRO özellikleri bölümünü açınca kataloğunu yazar):
// uygulama özellikleri + her overlay'in kendisi, her ayarı ve seçim alanlarının her seçeneği.
// Katalog boşsa elle tanımlı temel özellikler gösterilir.
// Kararlar: pro_features (RPC'ler pro_features_admin_list, pro_feature_set, pro_feature_set_many — c38/c40);
// overlay'in tamamı ("overlay.<id>") app_config.pro_overlays listesinde (program ve Rust tarafı bunu okur).
import { $, $$, esc, fmtDate, sb, toast } from "./core.js";

const GROUP_ORDER = ["Paylaşım", "Topluluk", "Sosyal", "Takımlar", "Telemetri", "Görünüm", "Ses", "Araçlar", "Overlay'ler"];

// Program kataloğu (src/sdk/proFeatures.ts) gelmemişse bile temel özellikler görünsün: [anahtar, ad, grup, varsayılan PRO, sunucu]
const STATIC = [
  ["community.share.shots", "Ekran görüntüsünü toplulukta paylaşmak", "Paylaşım", true, true],
  ["community.share.themes", "Temayı toplulukta paylaşmak", "Paylaşım", true, true],
  ["community.share.layouts", "Düzeni toplulukta paylaşmak", "Paylaşım", false, true],
  ["community.share.streams", "Yayın düzenini toplulukta paylaşmak", "Paylaşım", false, true],
  ["community.layouts.use", "Topluluk düzenini kullanmak (indirmek)", "Topluluk", true, false],
  ["community.layouts.rate", "Düzenlere puan vermek", "Topluluk", true, true],
  ["community.layouts.comment", "Düzenlere yorum yazmak", "Topluluk", true, true],
  ["community.themes.use", "Topluluk temasını kullanmak", "Topluluk", true, false],
  ["social.friend_add", "Arkadaş eklemek (arkadaşlık isteği göndermek)", "Sosyal", false, true],
  ["social.messages", "Özel mesajlaşma (arkadaşa mesaj göndermek)", "Sosyal", false, true],
  ["social.friend_look", "Arkadaş görünümünü özelleştirmek (renk, simge, fotoğraf, etiket)", "Sosyal", true, false],
  ["social.crew_watch", "Ekip: arkadaşın yarışını canlı izlemek (Ekip paneli, pit duvarı, ekip odası)", "Sosyal", true, true],
  ["social.data_share", "Canlı veri paylaşımı (arkadaşı güvenilir işaretleyip verilerini göndermek)", "Sosyal", true, true],
  ["social.chat_bg", "Sohbet arka planı önermek (arkadaşla ortak arka plan)", "Sosyal", false, true],
  ["social.avatar", "Profil fotoğrafı yüklemek", "Sosyal", false, true],
  ["social.profile_public", "Profil tanıtımı ve sosyal bağlantılar", "Sosyal", false, true],
  ["teams.create", "Takım kurmak", "Takımlar", false, true],
  ["teams.join", "Takıma katılmak (istek göndermek, daveti kabul etmek)", "Takımlar", false, true],
  ["teams.chat", "Takım sohbetine yazmak", "Takımlar", false, true],
  ["teams.post", "Takım duyurusu yazmak", "Takımlar", false, true],
  ["telemetry.record", "Telemetri kaydını buluta yüklemek", "Telemetri", true, true],
  ["telemetry.others", "Başkalarının telemetrisini görmek (Yarışçılar, takım arkadaşları)", "Telemetri", true, true],
  ["telemetry.compare", "Tur karşılaştırma (iki turun izleri ve fark)", "Telemetri", false, false],
  ["telemetry.leaderboard", "Pist / araç sıralaması (lider tablosu)", "Telemetri", false, false],
  ["telemetry.community", "Toplulukla kıyaslama (topluluk rekoru ve ortalaması)", "Telemetri", true, false],
  ["telemetry.map", "Pist haritasında hızlı / yavaş noktalar ve farklar", "Telemetri", true, false],
  ["appearance.themes", "Tema düzenlemek (renkler, yazı tipi, kenarlık, gölge)", "Görünüm", false, false],
  ["appearance.app_bg", "Uygulama arka planı (resim / renk)", "Görünüm", false, false],
  ["appearance.chat_look", "Sohbet görünümü (balonlar ve sohbet arka planı)", "Görünüm", false, false],
  ["voice.engineer", "Sesli mühendis ve spotter", "Ses", true, false],
  ["voice.pack_submit", "Ses paketi göndermek (kendi kaydını paylaşmak)", "Ses", false, true],
  ["tools.screenshots", "Ekran görüntüsü almak", "Araçlar", false, false],
  ["tools.streaming", "Yayın düzenleri (OBS) sayfası", "Araçlar", false, false],
  ["tools.league", "Lig kategorileri (League Builder)", "Araçlar", false, false],
  ["tools.pitwall", "Pitwall Paneli penceresi", "Araçlar", false, false],
  ["tools.timing", "Live Timing penceresi", "Araçlar", false, false],
  ["tools.engineer", "Mühendis Ekranı penceresi", "Araçlar", false, false],
  ["tools.events", "Olaylar penceresi", "Araçlar", false, false],
];
const SERVER = new Set(STATIC.filter((x) => x[4]).map((x) => x[0]));

const KIND_TAG = { overlay: "Overlay", setting: "Ayar", option: "Seçenek" };

let q = "";
let filter = "all";
/** Elle açılan alt başlıklar */
const openSubs = new Set();

/** Arama kutusunu doldur (moderasyon kaydından gelince) */
export function setProFeatureQuery(v) {
  q = String(v || "");
}

/** Listeyi yeniden çizer ama kaydırma konumunu korur (bir ayar değişince sayfa en üste atlamasın) */
async function keep(el, rerender) {
  const boxes = [];
  for (let e = el; e; e = e.parentElement) if (e.scrollTop > 0) boxes.push([e, e.scrollTop]);
  const se = document.scrollingElement || document.documentElement;
  if (se && !boxes.some(([e]) => e === se)) boxes.push([se, se.scrollTop]);
  // Yükseklik geçici olarak kısalmasın
  el.style.minHeight = el.offsetHeight + "px";
  try {
    await proOzellikleri(el, rerender);
  } finally {
    el.style.minHeight = "";
    for (const [e, top] of boxes) e.scrollTop = top;
  }
}

async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

const isOverlayKey = (k) => /^overlay\.[^.]+$/.test(k);
const kindOf = (k) => {
  if (!k.startsWith("overlay.")) return "feature";
  const n = k.split(".").length;
  return n === 2 ? "overlay" : n === 3 ? "setting" : "option";
};
const eff = (r) => (r.pro === null || r.pro === undefined ? r.default_pro : r.pro);
const isChanged = (r) => r.pro !== null && r.pro !== undefined;

async function proOverlays() {
  const { data, error } = await sb.from("app_config").select("pro_overlays").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return new Set(data?.pro_overlays || []);
}

/** Kararları kaydet: overlay'in tamamı → app_config.pro_overlays, gerisi → pro_features */
async function save(items) {
  const ovs = Object.entries(items).filter(([k]) => isOverlayKey(k));
  const rest = Object.fromEntries(Object.entries(items).filter(([k]) => !isOverlayKey(k)));
  if (ovs.length) {
    const cur = await proOverlays();
    for (const [k, v] of ovs) v ? cur.add(k.slice(8)) : cur.delete(k.slice(8));
    const { data, error } = await sb
      .from("app_config")
      .update({ pro_overlays: [...cur], updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("id");
    if (error || !data?.length) throw new Error(error?.message || "Kaydedilemedi");
  }
  const n = Object.keys(rest).length;
  if (n === 1) {
    const [k, v] = Object.entries(rest)[0];
    await rpc("pro_feature_set", { p_key: k, p_pro: v });
  } else if (n > 1) {
    await rpc("pro_feature_set_many", { p_items: rest });
  }
}

function countOf(list) {
  const m = new Map(list.map((r) => [r.key, r]));
  const all = [...m.values()];
  const pro = all.filter(eff).length;
  return { total: all.length, pro, changed: all.filter(isChanged).length };
}

function countsHtml(list) {
  const c = countOf(list);
  return `<span class="pf-counts">
    <span class="badge" style="border-color:#c98a1a;color:#e3a63a">${c.pro} PRO</span>
    <span class="badge">${c.total - c.pro} açık</span>
    ${c.changed ? `<span class="badge" style="border-color:var(--accent)">${c.changed} değişti</span>` : ""}
  </span>`;
}

function rowHtml(r, nested) {
  const on = eff(r);
  const changed = isChanged(r);
  const tag = KIND_TAG[r.kind];
  const freeVal = isOverlayKey(r.key) ? "" : "0";
  return `<div class="card" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:9px 14px;${nested ? "margin-left:26px;" : ""}${
    changed ? "box-shadow:inset 3px 0 0 var(--accent)" : ""
  }">
    <div style="flex:1;min-width:220px">
      <div style="${r.kind === "overlay" ? "font-weight:600" : ""}">${esc(r.short)}${tag ? ` <span class="badge">${esc(tag)}</span>` : ""}${
        r.server ? ` <span class="badge" title="Sunucu da bu kurala göre izin verir / reddeder">Sunucu</span>` : ""
      }</div>
      <small class="muted"><code>${esc(r.key)}</code> · Varsayılan: ${r.default_pro ? "PRO" : "Herkese açık"}${
        changed && r.updated_at ? ` · Değiştiren: ${esc(r.updated_by_name || "—")}, ${esc(fmtDate(r.updated_at, true))}` : ""
      }</small>
    </div>
    <div class="row" style="gap:6px;margin:0">
      <button class="btn btn-sm ${on ? "btn-accent" : ""}" data-set="${esc(r.key)}" data-v="1">PRO</button>
      <button class="btn btn-sm ${on ? "" : "btn-accent"}" data-set="${esc(r.key)}" data-v="${freeVal}">Herkese açık</button>
      <button class="btn btn-sm" data-set="${esc(r.key)}" data-v="" ${changed ? "" : "disabled"} title="Kararı kaldır, varsayılan geçerli olsun">Varsayılana dön</button>
    </div>
  </div>`;
}

const bulkHtml = (id, list) =>
  `<span class="row" style="gap:6px;margin:0 0 0 auto">
    <button class="btn btn-sm" data-bulk="${esc(id)}" data-v="1">Hepsi PRO</button>
    <button class="btn btn-sm" data-bulk="${esc(id)}" data-v="0">Hepsi açık</button>
    ${list.some(isChanged) ? `<button class="btn btn-sm" data-bulk="${esc(id)}" data-v="">Varsayılana dön</button>` : ""}
  </span>`;

export async function proOzellikleri(el, rerender) {
  const [list, ovSet] = await Promise.all([rpc("pro_features_admin_list").then((x) => x || []), proOverlays()]);
  const byKey = new Map(list.map((r) => [r.key, r]));
  for (const [key, label, grp, def] of STATIC) {
    if (!byKey.has(key)) byKey.set(key, { key, label, grp, default_pro: def, pro: null });
  }
  // Katalogda olmayan PRO overlay'ler de görünsün
  for (const id of ovSet) {
    const key = `overlay.${id}`;
    if (!byKey.has(key)) byKey.set(key, { key, label: `${id} › Overlay'in kendisi`, grp: "Overlay'ler", default_pro: false, pro: null });
  }
  const all = [...byKey.values()].map((r) => {
    const kind = kindOf(r.key);
    // Etiket: "Overlay › Ayar" ya da "Overlay › Seçim alanı › Seçenek"
    const parts = String(r.label || r.key).split(" › ");
    const sub = parts.length > 1 ? parts[0] : "";
    const short = parts[parts.length - 1];
    const sub2 = kind === "option" && parts.length > 2 ? parts.slice(1, -1).join(" › ") : "";
    const pro = kind === "overlay" ? (ovSet.has(r.key.slice(8)) ? true : null) : r.pro;
    return {
      ...r,
      pro,
      kind,
      grp: r.grp || "Diğer",
      sub,
      sub2,
      short,
      server: SERVER.has(r.key),
      updated_at: kind === "overlay" ? null : r.updated_at,
    };
  });
  // Mesajlar overlay'i Sosyal grubunda da görünsün (aynı ayar)
  const msgOv = all.find((r) => r.key === "overlay.messages");
  if (msgOv) all.push({ ...msgOv, grp: "Sosyal", sub: "", sub2: "", short: "Mesajlar overlay'i (overlay'in tamamı)" });

  const narrowing = !!q.trim() || filter !== "all";
  const words = q.toLocaleLowerCase("tr").split(/\s+/).filter(Boolean);
  const vis = all.filter((r) => {
    if (filter === "changed" && !isChanged(r)) return false;
    if (filter === "pro" && !eff(r)) return false;
    if (filter === "free" && eff(r)) return false;
    const hay = `${r.label} ${r.grp} ${r.key}`.toLocaleLowerCase("tr");
    return words.every((w) => hay.includes(w));
  });
  const groups = new Map();
  for (const r of vis) {
    if (!groups.has(r.grp)) groups.set(r.grp, new Map());
    const subs = groups.get(r.grp);
    if (!subs.has(r.sub)) subs.set(r.sub, []);
    subs.get(r.sub).push(r);
  }
  const rank = (x) => (GROUP_ORDER.indexOf(x) < 0 ? 99 : GROUP_ORDER.indexOf(x));
  const ordered = [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], "tr"));
  const bulkSets = { all };
  let gi = 0;

  const rowsHtml = (rows) => {
    // Seçenekler kendi seçim alanı başlığı altında
    let out = "";
    let i = 0;
    while (i < rows.length) {
      const head = rows[i].sub2;
      const part = [];
      while (i < rows.length && rows[i].sub2 === head) part.push(rows[i++]);
      if (!head) {
        out += part.map((r) => rowHtml(r, false)).join("");
        continue;
      }
      const id = `g${gi++}`;
      bulkSets[id] = part;
      out += `<div class="row" style="margin:10px 0 4px 26px;align-items:center;gap:8px"><small class="muted">Seçim: <b>${esc(head)}</b></small>${countsHtml(part)}${
        part.length > 1 ? bulkHtml(id, part) : ""
      }</div>${part.map((r) => rowHtml(r, true)).join("")}`;
    }
    return `<div class="stack">${out}</div>`;
  };

  const groupHtml = ordered
    .map(([grp, subs]) => {
      const gid = `g${gi++}`;
      const flat = [...subs.values()].flat();
      bulkSets[gid] = flat;
      const inner = [...subs.entries()]
        .map(([sub, rows]) => {
          if (!sub) return rowsHtml(rows);
          const sid = `g${gi++}`;
          bulkSets[sid] = rows;
          const key = `${grp}|${sub}`;
          const open = narrowing || openSubs.has(key);
          return `<div style="margin:8px 0;border:1px solid var(--line, #333);border-radius:8px">
            <div class="row" data-toggle="${esc(key)}" style="margin:0;padding:8px 12px;align-items:center;gap:8px;cursor:pointer">
              <span class="muted" style="width:12px">${open ? "▾" : "▸"}</span><b>${esc(sub)}</b>${countsHtml(rows)}${rows.length > 1 ? bulkHtml(sid, rows) : ""}
            </div>
            ${open ? `<div style="padding:0 10px 10px">${rowsHtml(rows)}</div>` : ""}
          </div>`;
        })
        .join("");
      return `<div style="margin-top:22px"><div class="row" style="align-items:center;margin:0 0 10px;gap:10px"><h3 style="margin:0">${esc(grp)}</h3>${countsHtml(
        flat,
      )}${bulkHtml(gid, flat)}</div>${inner}</div>`;
    })
    .join("");

  const c = countOf(all);
  el.innerHTML = `<h2>PRO özellikleri</h2>
    <p class="muted small">Her özelliğin PRO üyelere mi özel, yoksa herkese mi açık olduğunu seç: uygulama özellikleri, her overlay'in kendisi, her ayarı ve
      seçim alanlarının her seçeneği. Karar verilmeyen özellikler varsayılanda kalır. PRO olmayan kullanıcılar kilitli özellikleri görür ama kullanamaz;
      kilitli overlay ayarları varsayılan değerinde kalır. Değişiklik açık programlara birkaç dakika içinde yansır; sunucu denetimleri hemen geçerlidir.
      Overlay listesi programdan gelir: programda Yönetim › PRO özellikleri bölümü bir kez açılınca burada da görünür.
      "Overlay'in kendisi" satırları programdaki Planlar ve fiyatlar › PRO overlay'ler listesiyle aynıdır.</p>
    <div class="stats">
      <div class="stat"><small>Özellik</small><b>${c.total}</b></div>
      <div class="stat"><small>PRO</small><b>${c.pro}</b></div>
      <div class="stat"><small>Herkese açık</small><b>${c.total - c.pro}</b></div>
      <div class="stat"><small>Değiştirilmiş</small><b>${c.changed}</b></div>
    </div>
    <div class="row" style="margin:16px 0 0;gap:8px;align-items:center">
      <input id="pf-q" type="search" placeholder="Ara (ad, overlay, ayar, anahtar)…" value="${esc(q)}" style="flex:1;min-width:200px">
      <select id="pf-f">
        <option value="all" ${filter === "all" ? "selected" : ""}>Tümü</option>
        <option value="changed" ${filter === "changed" ? "selected" : ""}>Değiştirilmiş</option>
        <option value="pro" ${filter === "pro" ? "selected" : ""}>PRO olanlar</option>
        <option value="free" ${filter === "free" ? "selected" : ""}>Herkese açık olanlar</option>
      </select>
      <button class="btn btn-sm" data-bulk="all" data-v="" ${c.changed ? "" : "disabled"} title="Bütün kararları kaldır">Tümünü varsayılana döndür</button>
    </div>
    ${groupHtml || `<p class="muted" style="margin-top:20px">Eşleşen özellik yok.</p>`}`;

  let timer;
  $("#pf-q", el).addEventListener("input", (e) => {
    q = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await proOzellikleri(el, rerender);
      const inp = $("#pf-q", el);
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }, 250);
  });
  $("#pf-f", el).addEventListener("change", (e) => {
    filter = e.target.value;
    proOzellikleri(el, rerender);
  });
  $$("[data-toggle]", el).forEach((d) =>
    d.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const k = d.dataset.toggle;
      openSubs.has(k) ? openSubs.delete(k) : openSubs.add(k);
      keep(el, rerender);
    }),
  );
  $$("[data-set]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      const v = b.dataset.v === "" ? null : b.dataset.v === "1";
      const key = b.dataset.set;
      const cur = all.find((r) => r.key === key);
      if (cur && v !== null && eff(cur) === v) return;
      try {
        await save({ [key]: v });
        toast(v === null ? (isOverlayKey(key) ? "Herkese açıldı" : "Varsayılana döndü") : v ? "PRO yapıldı" : "Herkese açıldı");
      } catch (e) {
        toast(e.message, true);
      }
      keep(el, rerender);
    }),
  );
  $$("[data-bulk]", el).forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const v = b.dataset.v === "" ? null : b.dataset.v === "1";
      const items = {};
      for (const r of bulkSets[b.dataset.bulk] || []) {
        // Overlay'in tamamında "herkese açık" = listeden çıkar
        const want = isOverlayKey(r.key) && v === false ? null : v;
        if (want === null ? isChanged(r) : r.pro !== want) items[r.key] = want;
      }
      const n = Object.keys(items).length;
      if (!n) return toast("Değişecek özellik yok");
      const what = v === null ? "varsayılana döndürülsün" : v ? "PRO yapılsın" : "herkese açılsın";
      if (!confirm(`${n} özellik ${what} mı?`)) return;
      try {
        await save(items);
        toast(`${n} özellik güncellendi`);
      } catch (e) {
        toast(e.message, true);
      }
      keep(el, rerender);
    }),
  );
}
