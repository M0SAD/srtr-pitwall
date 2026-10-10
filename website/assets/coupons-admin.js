// Yönetim › Kuponlar (sadece yöneticiler): indirim kuponu oluştur / düzenle / kapat / yeniden aç / sil
// (sadece hiç kullanılmamışsa). "Aktif kuponlar" ve "Geçmiş / biten kuponlar" (süresi dolmuş, kapatılmış ya da
// kullanım limiti dolmuş), kullanım sayısı ve verilen toplam indirim. Süresi dolmuş kupon tarihleri güncellenerek
// yeniden açılır. RPC'ler: coupon_admin_* (c34_guncelleme.sql).
import { $, $$, esc, fmtDate, fmtMoney, sb, toast } from "./core.js";

const PLANS = [
  ["1m", "PRO 1 aylık"],
  ["3m", "PRO 3 aylık"],
  ["6m", "PRO 6 aylık"],
  ["12m", "PRO 12 aylık"],
];
const MODELS = [
  ["impressions", "Reklam · gösterim paketi"],
  ["days", "Reklam · süre (gün)"],
];
const STATE = {
  active: ["ok", "Aktif"],
  scheduled: ["warn", "Henüz başlamadı"],
  expired: ["", "Süresi doldu"],
  inactive: ["bad", "Kapatıldı"],
  exhausted: ["warn", "Limit doldu"],
};

let editing = null; // düzenlenen taslak (null: form kapalı)

async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

/** ISO → datetime-local (yerel saat) */
function toLocal(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fromLocal = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const money = (m) =>
  Object.entries(m || {})
    .filter(([, v]) => Number(v) !== 0)
    .map(([k, v]) => fmtMoney(Number(v), k))
    .join(" + ") || "0";
const isExpired = (c) => !!c.valid_until && new Date(c.valid_until).getTime() <= Date.now();
const pkgText = (c) =>
  [
    ...PLANS.filter(([k]) => (c.pro_plans || []).includes(k)).map(([k]) => k),
    ...(c.pro_gift && (c.pro_plans || []).length ? ["hediye"] : []),
    ...MODELS.filter(([k]) => (c.ad_models || []).includes(k)).map(([k]) => (k === "impressions" ? "reklam gösterim" : "reklam gün")),
  ].join(", ") || "—";

const empty = () => ({
  id: null,
  code: "",
  percent: 10,
  valid_from: null,
  valid_until: null,
  pro_plans: ["1m", "3m", "6m", "12m"],
  pro_gift: true,
  ad_models: [],
  max_uses: null,
  max_uses_per_user: 1,
  active: true,
  note: "",
});

function formHtml(d) {
  const cb = (name, val, on, label) =>
    `<label class="chk"><input type="checkbox" name="${name}" value="${val}" ${on ? "checked" : ""}><span>${label}</span></label>`;
  return `<form class="card stack" id="cpf" style="margin:16px 0">
    <h3 style="margin:0">${d.id ? `Kuponu düzenle: ${esc(d.code)}` : "Yeni kupon"}</h3>
    <div class="grid g3">
      <div class="field" style="margin:0"><label>Kod (harf, rakam, - ve _)</label><input name="code" maxlength="32" required value="${esc(d.code)}" style="text-transform:uppercase" placeholder="ERKIN"></div>
      <div class="field" style="margin:0"><label>İndirim (%) — 1 ile 90 arası</label><input name="percent" type="number" min="1" max="90" required value="${esc(d.percent)}"></div>
      <div class="field" style="margin:0"><label>Not (sadece yöneticiler görür)</label><input name="note" maxlength="500" value="${esc(d.note)}"></div>
      <div class="field" style="margin:0"><label>Başlangıç (isteğe bağlı)</label><input name="valid_from" type="datetime-local" value="${esc(toLocal(d.valid_from))}"></div>
      <div class="field" style="margin:0"><label>Bitiş (boşsa süresiz)</label><input name="valid_until" type="datetime-local" value="${esc(toLocal(d.valid_until))}"></div>
      <div></div>
      <div class="field" style="margin:0"><label>Toplam kullanım sınırı (boşsa sınırsız)</label><input name="max_uses" type="number" min="1" value="${esc(d.max_uses ?? "")}"></div>
      <div class="field" style="margin:0"><label>Kişi başı kullanım (boşsa sınırsız)</label><input name="max_uses_per_user" type="number" min="1" value="${esc(d.max_uses_per_user ?? "")}"></div>
    </div>
    <div><b>Geçerli paketler</b>
      <div class="row" style="gap:6px 16px;flex-wrap:wrap;margin-top:6px">
        ${PLANS.map(([k, l]) => cb("plan", k, (d.pro_plans || []).includes(k), l)).join("")}
        ${cb("pro_gift", "1", d.pro_gift, "Hediye PRO'da da geçerli")}
        ${MODELS.map(([k, l]) => cb("model", k, (d.ad_models || []).includes(k), l)).join("")}
      </div>
    </div>
    ${cb("active", "1", d.active, "<b>Etkin</b>")}
    <div class="row"><button class="btn btn-accent">${d.id ? "Kaydet" : "Oluştur"}</button><button type="button" class="btn btn-ghost" id="cpf-x">Vazgeç</button></div>
  </form>`;
}

function rowHtml(c) {
  const [tone, label] = STATE[c.state] || ["", c.state];
  const live = c.state === "active" || c.state === "scheduled";
  const btn = (act, text, cls = "") => `<button class="btn btn-sm ${cls}" data-cact="${act}" data-id="${c.id}">${text}</button>`;
  return `<div class="card">
    <div class="row between" style="align-items:flex-start;gap:12px">
      <div class="stack" style="gap:4px;min-width:0">
        <div><span class="badge ${tone}">${label}</span> <b style="font-family:monospace;font-size:1.15em">${esc(c.code)}</b> <b>%${esc(c.percent)} indirim</b></div>
        <div class="small muted">Geçerli: ${esc(pkgText(c))} · ${c.valid_from ? `başlangıç ${fmtDate(c.valid_from, true)} · ` : ""}${c.valid_until ? `bitiş ${fmtDate(c.valid_until, true)}` : "süresiz"}</div>
        <div class="small">${esc(c.uses)} kullanım${c.max_uses ? ` / ${esc(c.max_uses)} limit` : ""} · kişi başı ${esc(c.max_uses_per_user ?? "∞")} · verilen indirim: <b>${esc(money(c.discount))}</b>${
          c.uses > 0 ? ` · <button class="linkbtn" data-cuses="${c.id}">Kullanımlar</button>` : ""
        }</div>
        ${c.note ? `<div class="small muted">Not: ${esc(c.note)}</div>` : ""}
        <div class="small muted">Oluşturan: ${esc(c.creator_name || "—")} · ${fmtDate(c.created_at, true)}</div>
        <div id="cuses-${c.id}" hidden></div>
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">
        ${btn("edit", "Düzenle")}
        ${live ? btn("off", "Kapat") : btn("reopen", "Yeniden aç", "btn-accent")}
        ${c.uses === 0 ? btn("delete", "Sil", "btn-danger") : ""}
      </div>
    </div>
  </div>`;
}

export async function kuponlar(el, rerender) {
  const list = (await rpc("coupon_admin_list")) || [];
  const active = list.filter((c) => c.state === "active" || c.state === "scheduled");
  const past = list.filter((c) => !(c.state === "active" || c.state === "scheduled"));
  const total = {};
  for (const c of list) for (const [k, v] of Object.entries(c.discount || {})) total[k] = (total[k] || 0) + Number(v);

  el.innerHTML = `<h2>İndirim kuponları</h2>
    <p class="muted small">Kullanıcılar PRO, hediye PRO ve reklam satın alırken kupon kodunu girer; indirim ödeme sayfasında (Paddle) indirim satırı ve ürün açıklamasında görünür.
      Kupon ödeme anında sunucuda yeniden denetlenir. PRO aboneliğinde indirim ilk ödemede uygulanır (aylık planda kupon geçerli olduğu sürece, bitişi yoksa her ödemede); yenilemeler güncel fiyattan.
      Kullanılmış kupon silinemez, kapatılabilir. Süresi dolmuş kuponu "Yeniden aç" ile tarihlerini güncelleyerek açabilirsin.</p>
    <div class="stats">
      <div class="stat"><small>Aktif kupon</small><b>${active.length}</b></div>
      <div class="stat"><small>Toplam kullanım</small><b>${list.reduce((a, c) => a + (c.uses || 0), 0)}</b></div>
      <div class="stat"><small>Verilen toplam indirim</small><b>${esc(money(total))}</b></div>
    </div>
    <div class="row" style="margin:16px 0 0"><button class="btn btn-accent" id="cp-new">Yeni kupon</button></div>
    <div id="cp-form">${editing ? formHtml(editing) : ""}</div>
    <h3 style="margin:22px 0 10px">Aktif kuponlar (${active.length})</h3>
    <div class="stack">${active.length ? active.map(rowHtml).join("") : `<p class="muted">Aktif kupon yok.</p>`}</div>
    <h3 style="margin:22px 0 10px">Geçmiş / biten kuponlar (${past.length})</h3>
    <div class="stack">${past.length ? past.map(rowHtml).join("") : `<p class="muted">Geçmiş kupon yok.</p>`}</div>`;

  const openForm = (d) => {
    editing = d;
    $("#cp-form").innerHTML = formHtml(d);
    bindForm();
    $("#cpf")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const bindForm = () => {
    const f = $("#cpf");
    if (!f) return;
    $("#cpf-x").addEventListener("click", () => {
      editing = null;
      $("#cp-form").innerHTML = "";
    });
    f.code.addEventListener("input", () => (f.code.value = f.code.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "")));
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const int = (k) => {
        const n = parseInt(String(fd.get(k) || ""), 10);
        return n > 0 ? n : null;
      };
      const btn = f.querySelector("button.btn-accent");
      btn.disabled = true;
      try {
        await rpc("coupon_admin_save", {
          p_id: editing?.id ?? null,
          p_code: String(fd.get("code") || "").trim().toUpperCase(),
          p_percent: parseInt(String(fd.get("percent")), 10) || 0,
          p_valid_from: fromLocal(String(fd.get("valid_from") || "")),
          p_valid_until: fromLocal(String(fd.get("valid_until") || "")),
          p_pro_plans: fd.getAll("plan").map(String),
          p_pro_gift: !!fd.get("pro_gift"),
          p_ad_models: fd.getAll("model").map(String),
          p_max_uses: int("max_uses"),
          p_max_per_user: int("max_uses_per_user"),
          p_active: !!fd.get("active"),
          p_note: String(fd.get("note") || "").trim(),
        });
        toast(editing?.id ? "Kupon kaydedildi" : "Kupon oluşturuldu");
        editing = null;
        rerender();
      } catch (err) {
        toast(err.message || String(err), true);
        btn.disabled = false;
      }
    });
  };
  bindForm();

  $("#cp-new").addEventListener("click", () => openForm(empty()));
  $$("[data-cact]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      const c = list.find((x) => x.id === b.dataset.id);
      if (!c) return;
      const act = b.dataset.cact;
      const draft = () => ({ ...c, pro_plans: [...(c.pro_plans || [])], ad_models: [...(c.ad_models || [])] });
      if (act === "edit") return openForm(draft());
      if (act === "reopen" && (isExpired(c) || c.state === "exhausted")) {
        // Süresi dolmuş / limiti dolmuş: tarih ya da limit güncellenerek açılır (bitiş 7 gün sonrası önerilir)
        const d = draft();
        d.active = true;
        if (isExpired(c)) {
          d.valid_until = new Date(Date.now() + 7 * 86400000).toISOString();
          if (d.valid_from && new Date(d.valid_from).getTime() > Date.now()) d.valid_from = null;
        }
        return openForm(d);
      }
      if (act === "delete" && !confirm(`${c.code} kuponu silinsin mi?`)) return;
      b.disabled = true;
      try {
        if (act === "delete") await rpc("coupon_admin_delete", { p_id: c.id });
        else await rpc("coupon_admin_set_active", { p_id: c.id, p_active: act === "reopen" });
        toast(act === "delete" ? "Kupon silindi" : act === "reopen" ? "Kupon açıldı" : "Kupon kapatıldı");
        rerender();
      } catch (err) {
        toast(err.message || String(err), true);
        b.disabled = false;
      }
    }),
  );
  $$("[data-cuses]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      const box = $(`#cuses-${b.dataset.cuses}`);
      if (!box.hidden) return (box.hidden = true);
      box.hidden = false;
      box.innerHTML = `<span class="muted small">Yükleniyor…</span>`;
      try {
        const rows = (await rpc("coupon_admin_redemptions", { p_id: b.dataset.cuses })) || [];
        box.innerHTML = rows.length
          ? `<div class="table-scroll"><table class="list"><thead><tr><th>Tarih</th><th>Üye</th><th>Paket</th><th class="num">Tutar</th></tr></thead><tbody>${rows
              .map(
                (r) => `<tr><td>${fmtDate(r.created_at, true)}</td><td>${esc(r.user_name || "—")}</td><td>${esc(r.product)} ${esc(r.plan)}</td>
                  <td class="num"><s class="muted">${esc(fmtMoney(Number(r.amount_before), r.currency || "USD"))}</s> ${esc(fmtMoney(Number(r.amount_after), r.currency || "USD"))}</td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : `<span class="muted small">Kayıt yok.</span>`;
      } catch (err) {
        box.innerHTML = `<div class="msg bad">${esc(err.message || err)}</div>`;
      }
    }),
  );
}
