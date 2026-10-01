// Yönetim › Reklamlar (sadece yöneticiler): reklamları aç/kapat, otomatik onay, rapor sınırı, yer başına fiyatlar;
// kampanyalar (önizleme, onayla / reddet / durdur / sürdür / uzat / bitir / sil), gösterim, tıklama, TO, gelir, raporlar.
import { $, $$, appConfig, esc, fmtDate, fmtMoney, sb, toast } from "./core.js";
import { AD_PLACES, adImg } from "./adslot.js";

const PLACE_TR = {
  panel_banner: "Uygulama · geniş banner",
  panel_card: "Uygulama · kare kart",
  site_home: "Site · ana sayfa banner",
  site_account: "Site · hesap sayfası kartı",
};
const STATUS = {
  unpaid: ["warn", "Ödeme bekliyor"],
  pending_review: ["warn", "Onay bekliyor"],
  active: ["ok", "Yayında"],
  paused: ["bad", "Durduruldu"],
  paused_reports: ["bad", "Raporlarla gizlendi"],
  ended: ["", "Bitti"],
  rejected: ["bad", "Reddedildi"],
  refunded: ["", "İade edildi"],
};
const REASONS = { inappropriate: "Uygunsuz", misleading: "Yanıltıcı / dolandırıcılık", spam: "Spam", other: "Diğer" };
const DEF = {
  currency: "USD",
  impressions: [1000, 5000, 10000, 50000],
  days: [1, 3, 7, 14, 30],
  placements: {
    panel_banner: { on: true, cpm: 4, day: 3 },
    panel_card: { on: true, cpm: 3, day: 2 },
    site_home: { on: true, cpm: 5, day: 4 },
    site_account: { on: true, cpm: 3, day: 2 },
  },
};
let filter = "";

async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
const nums = (s) => [...new Set(String(s).split(/[,\s;]+/).map((x) => parseInt(x, 10)).filter((x) => x > 0))].sort((a, b) => a - b);
const ctr = (i, c) => (i ? ((c / i) * 100).toFixed(2) + "%" : "—");
const n = (v) => Number(v || 0).toLocaleString("tr-TR");

export async function reklamlar(el, rerender) {
  const [c, all] = await Promise.all([appConfig(), rpc("admin_ads", { p_status: null })]);
  const pr = { ...DEF, ...(c.ad_pricing || {}), placements: { ...DEF.placements, ...(c.ad_pricing?.placements || {}) } };
  const rows = (all || []).filter((a) => !filter || a.status === filter);
  const rev = {};
  let imp = 0;
  let clk = 0;
  for (const a of all || []) {
    imp += a.impressions;
    clk += a.clicks;
    if (a.paid_at && a.status !== "refunded") rev[a.currency] = (rev[a.currency] || 0) + Number(a.paid_amount ?? a.price);
  }
  const count = (s) => (all || []).filter((a) => a.status === s).length;
  const stat = (t, v, sub = "") => `<div class="stat"><small>${t}</small><b>${v}</b>${sub ? `<i>${sub}</i>` : ""}</div>`;
  const revTxt = Object.entries(rev).map(([k, v]) => fmtMoney(v, k)).join(" + ") || fmtMoney(0, pr.currency);

  el.innerHTML = `<h2>Reklamlar</h2>
    <p class="muted small">Reklam verenler <a href="reklam.html">reklam.html</a> sayfasından yer, gösterim paketi ya da gün seçer, görsel yükler ve Lemon Squeezy ile öder.
      Ödeme gelince reklam otomatik yayına girer (otomatik onay kapalıysa burada onay bekler). PRO üyeler reklam görmez; oyun içi overlay'lerde reklam yoktur.
      Kullanıcılar reklamı sağ tıklayıp raporlar; rapor sınırına ulaşan reklam kendiliğinden gizlenir ve sana bildirim + e-posta gelir.</p>
    <div class="stats">
      ${stat("Yayında", count("active"))}
      ${stat("Onay bekleyen", count("pending_review"))}
      ${stat("Raporlarla gizlenen", count("paused_reports"))}
      ${stat("Gösterim", n(imp))}
      ${stat("Tıklama", n(clk), `TO ${ctr(imp, clk)}`)}
      ${stat("Reklam geliri", esc(revTxt), "iadeler hariç")}
    </div>
    <form class="card stack" id="adset" style="margin-top:16px">
      <div class="grid g3">
        <label class="chk boxed"><input type="checkbox" name="ads_enabled" ${c.ads_enabled ? "checked" : ""}><span><b>Reklamlar açık</b><br><span class="muted small">Kapalıyken reklam gösterilmez ve yeni reklam alınmaz</span></span></label>
        <label class="chk boxed"><input type="checkbox" name="ad_auto_approve" ${c.ad_auto_approve !== false ? "checked" : ""}><span><b>Ödeme sonrası otomatik yayınla</b><br><span class="muted small">Kapalıysa ödenen reklam önce onayını bekler</span></span></label>
        <div class="field" style="margin:0"><label>Rapor sınırı (bu kadar üye raporlayınca gizlenir)</label><input name="ad_report_hide_threshold" type="number" min="1" max="100" value="${esc(c.ad_report_hide_threshold ?? 3)}"></div>
      </div>
      <div class="table-scroll"><table class="list"><thead><tr><th>Yer</th><th>Önerilen görsel</th><th>Satışta</th><th>1.000 gösterim</th><th>Günlük</th></tr></thead><tbody>
        ${Object.keys(AD_PLACES)
          .map((id) => {
            const p = pr.placements[id] || {};
            return `<tr><td>${PLACE_TR[id]}</td><td class="muted">${AD_PLACES[id].w}×${AD_PLACES[id].h}</td>
              <td><input type="checkbox" data-on="${id}" ${p.on !== false ? "checked" : ""} style="width:18px;height:18px"></td>
              <td><input type="number" min="0" step="0.01" data-cpm="${id}" value="${esc(p.cpm ?? 0)}" style="width:110px"></td>
              <td><input type="number" min="0" step="0.01" data-day="${id}" value="${esc(p.day ?? 0)}" style="width:110px"></td></tr>`;
          })
          .join("")}
      </tbody></table></div>
      <div class="grid g3">
        <div class="field" style="margin:0"><label>Para birimi (Lemon mağazanla aynı)</label><input name="currency" maxlength="3" value="${esc(pr.currency)}"></div>
        <div class="field" style="margin:0"><label>Gösterim paketleri (virgülle)</label><input name="impressions" value="${esc(pr.impressions.join(", "))}"></div>
        <div class="field" style="margin:0"><label>Gün seçenekleri (virgülle)</label><input name="days" value="${esc(pr.days.join(", "))}"></div>
      </div>
      <div><button class="btn btn-accent">Kaydet</button></div>
    </form>
    <div class="row between" style="margin:22px 0 10px">
      <h3 style="margin:0">Kampanyalar</h3>
      <select id="adf" style="width:auto">${[["", "Hepsi"], ...Object.entries(STATUS).map(([k, v]) => [k, v[1]])]
        .map(([k, l]) => `<option value="${k}" ${filter === k ? "selected" : ""}>${l}${k ? ` (${count(k)})` : ` (${(all || []).length})`}</option>`)
        .join("")}</select>
    </div>
    <div class="stack" id="adl">${
      rows.length
        ? rows
            .map((a) => {
              const [tone, label] = STATUS[a.status] || ["", a.status];
              const prog =
                a.model === "impressions"
                  ? `${n(a.impressions)} / ${n(a.quantity)} gösterim`
                  : `${a.quantity} gün${a.ends_at ? ` · bitiş ${fmtDate(a.ends_at, true)}` : ""} · ${n(a.impressions)} gösterim`;
              const btn = (act, text, cls = "") => `<button class="btn btn-sm ${cls}" data-act="${act}" data-id="${a.id}">${text}</button>`;
              const acts = [
                a.status === "pending_review" || (a.status === "rejected" && a.paid_at) ? btn("approve", "Onayla", "btn-accent") : "",
                ["pending_review", "active", "paused", "paused_reports", "unpaid"].includes(a.status) ? btn("reject", "Reddet", "btn-danger") : "",
                a.status === "active" ? btn("pause", "Durdur") : "",
                a.status === "paused" || a.status === "paused_reports" ? btn("resume", "Sürdür", "btn-accent") : "",
                ["active", "paused", "paused_reports", "ended", "pending_review"].includes(a.status) ? btn("extend", "Uzat") : "",
                ["active", "paused", "paused_reports", "pending_review"].includes(a.status) ? btn("end", "Bitir", "btn-ghost") : "",
                ["unpaid", "rejected", "ended", "refunded"].includes(a.status) ? btn("delete", "Sil", "btn-ghost") : "",
              ].join("");
              return `<div class="card ad-arow">
                <a href="${esc(adImg(a.image))}" target="_blank" rel="noopener"><img src="${esc(adImg(a.image))}" alt="" loading="lazy"></a>
                <div class="ad-ameta">
                  <div><span class="badge ${tone}">${label}</span> <b>${esc(a.title)}</b></div>
                  ${a.body ? `<div class="muted small">${esc(a.body)}</div>` : ""}
                  <a class="small" href="${esc(a.url)}" target="_blank" rel="noopener nofollow">${esc(a.url)}</a>
                  <div class="small muted">${PLACE_TR[a.placement] || a.placement} · ${prog} · ${a.langs?.length ? a.langs.map((l) => (l === "tr" ? "Türkçe" : "Diğer diller")).join(", ") : "Tüm diller"}</div>
                  <div class="small">${n(a.clicks)} tıklama · TO ${ctr(a.impressions, a.clicks)}${
                    a.reports ? ` · <button class="linkbtn" data-rep="${a.id}" style="color:#ffb3b0">${a.reports} rapor</button>` : ""
                  }</div>
                  <div class="small muted">${esc(a.owner_name || "?")} · ${esc(a.owner_email || "")} · ${
                    a.paid_at ? `ödendi ${fmtMoney(Number(a.paid_amount ?? a.price), a.currency)} · ${fmtDate(a.paid_at, true)}` : `fiyat ${fmtMoney(Number(a.price), a.currency)} · ödenmedi`
                  }</div>
                  ${a.review_note ? `<div class="small muted">Not: ${esc(a.review_note)}</div>` : ""}
                  <div class="ad-reps" id="rep-${a.id}" hidden></div>
                </div>
                <div class="ad-aacts">${acts}</div>
              </div>`;
            })
            .join("")
        : `<p class="muted">Reklam yok.</p>`
    }</div>`;

  $("#adf").addEventListener("change", (e) => {
    filter = e.target.value;
    rerender();
  });
  $("#adset").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const placements = {};
    for (const id of Object.keys(AD_PLACES)) {
      placements[id] = {
        on: $(`[data-on="${id}"]`).checked,
        cpm: Math.max(0, Number($(`[data-cpm="${id}"]`).value) || 0),
        day: Math.max(0, Number($(`[data-day="${id}"]`).value) || 0),
      };
    }
    const impressions = nums(f.get("impressions"));
    const days = nums(f.get("days"));
    if (!impressions.length || !days.length) return toast("Paket listeleri boş olamaz", true);
    const patch = {
      ads_enabled: !!f.get("ads_enabled"),
      ad_auto_approve: !!f.get("ad_auto_approve"),
      ad_report_hide_threshold: Math.max(1, parseInt(String(f.get("ad_report_hide_threshold")), 10) || 3),
      ad_pricing: { currency: String(f.get("currency") || "USD").trim().toUpperCase().slice(0, 3), impressions, days, placements },
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await sb.from("app_config").update(patch).eq("id", 1).select();
    if (error || !data?.length) return toast(error?.message || "Kaydedilemedi", true);
    toast("Kaydedildi");
    rerender();
  });
  $$("[data-rep]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      const box = $(`#rep-${b.dataset.rep}`);
      if (!box.hidden) return (box.hidden = true);
      box.hidden = false;
      box.innerHTML = `<span class="muted small">Yükleniyor…</span>`;
      try {
        const reps = (await rpc("admin_ad_reports", { p_ad: b.dataset.rep })) || [];
        box.innerHTML = reps
          .map(
            (r) =>
              `<div class="small"><b>${REASONS[r.reason] || esc(r.reason)}</b> · ${esc(r.reporter_name || "?")} · <span class="muted">${fmtDate(r.created_at, true)}</span>${
                r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ""
              }</div>`,
          )
          .join("");
      } catch (err) {
        box.innerHTML = `<div class="msg bad">${esc(err.message)}</div>`;
      }
    }),
  );
  $$("[data-act]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      const a = (all || []).find((x) => x.id === b.dataset.id);
      const act = b.dataset.act;
      let note = "";
      let amount = 0;
      if (act === "reject" || act === "pause") {
        const v = prompt(act === "reject" ? "Reddetme sebebi (reklam verene gider):" : "Durdurma notu (reklam verene gider, isteğe bağlı):", "");
        if (v === null) return;
        note = v;
      } else if (act === "extend") {
        const v = prompt(a.model === "days" ? "Kaç gün eklensin?" : "Kaç gösterim eklensin?", a.model === "days" ? "1" : "1000");
        amount = parseInt(v ?? "", 10) || 0;
        if (amount <= 0) return;
      } else if (act === "end" && !confirm("Reklam şimdi bitirilsin mi?")) return;
      else if (act === "delete" && !confirm("Reklam kaydı silinsin mi?")) return;
      b.disabled = true;
      try {
        await rpc("admin_ad_set", { p_ad: a.id, p_action: act, p_note: note, p_amount: amount });
        toast("Tamam");
        rerender();
      } catch (err) {
        toast(err.message, true);
        b.disabled = false;
      }
    }),
  );
}
