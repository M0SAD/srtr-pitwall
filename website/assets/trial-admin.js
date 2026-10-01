// Yönetim › Deneme PRO (sadece yöneticiler): yeni hesaplara verilen deneme PRO ayarları ve tüm talepler.
// Sunucu: supabase/c41_guncelleme.sql (admin_trial_claims, admin_trial_set; ayarlar app_config.trial_enabled / trial_days).
// Eşleşen hesap adları üye profiline (yarisci.html?u=<id>) gider. IP ve kimlikler kısmen gizlenir.
import { $, $$, appConfig, esc, fmtDate, sb, toast } from "./core.js";

const REASONS = {
  granted: "Verildi",
  admin: "Yönetici verdi",
  had_pro: "Daha önce PRO almış",
  not_new: "Hesap yeni değil",
  disposable_email: "Geçici e-posta",
  same_device: "Aynı bilgisayar",
  same_browser: "Aynı tarayıcı",
  same_email: "Aynı e-posta",
  same_ip: "Aynı IP",
  same_network: "Aynı ağ ve tarayıcı",
};
const ABUSE = ["disposable_email", "same_device", "same_browser", "same_email", "same_ip", "same_network"];
const reasonText = (r) =>
  String(r || "")
    .split(",")
    .map((x) => REASONS[x] || x)
    .join(", ");
const isAbuse = (r) => String(r || "").split(",").some((x) => ABUSE.includes(x));
const maskIp = (ip) => (!ip ? "—" : ip.includes(".") ? ip.split(".").slice(0, 2).join(".") + ".x.x" : ip.split(":").slice(0, 3).join(":") + ":…");
const short = (h) => (h ? esc(h.slice(0, 8)) + "…" : "—");

let filter = "all";

async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function denemePro(el, show) {
  const [c, rows] = await Promise.all([appConfig(), rpc("admin_trial_claims", { p_filter: filter })]);
  const on = c.trial_enabled !== false;
  const days = c.trial_days ?? 3;
  const proNow = (r) => r.pro_until && new Date(r.pro_until) > new Date();
  el.innerHTML = `<h2>Deneme PRO</h2>
    <p class="muted small">Yeni hesaplar (7 günden genç, daha önce hiç PRO / abonelik / ödeme almamış) ilk girişte bir kez deneme PRO alır.
      Aynı bilgisayar, aynı tarayıcı, aynı e-posta (Gmail noktaları ve +ekler yok sayılır), son 60 günde aynı IP, son 7 günde aynı ağ + aynı tarayıcı
      parmak izi ya da geçici e-posta servisi görülürse kullanıcıya bir şey söylenmeden reddedilir ve yöneticilere bildirim gider.</p>
    <div class="card stack">
      <label class="row"><input type="checkbox" id="ton" ${on ? "checked" : ""}> <b>Deneme PRO açık</b></label>
      <div class="row"><label>Deneme süresi (gün, 1–30)</label><input type="number" id="tdays" min="1" max="30" value="${esc(days)}" style="width:90px">
        <button class="btn btn-sm" id="tsave">Kaydet</button></div>
    </div>
    <div class="row between" style="margin:14px 0"><h3 style="margin:0">Talepler</h3>
      <div class="seg" id="tf">${[["all", "Hepsi"], ["granted", "Verilenler"], ["denied", "Reddedilenler"], ["suspicious", "Şüpheliler"]]
        .map(([k, l]) => `<button data-f="${k}" class="${k === filter ? "on" : ""}">${l}</button>`)
        .join("")}</div></div>
    <div class="card table-scroll"><table class="list"><thead><tr><th>Üye</th><th>Talep</th><th>Durum / neden</th><th>Eşleşen hesaplar</th><th>IP / kimlik</th><th>PRO</th><th></th></tr></thead><tbody>
    ${
      (rows || [])
        .map(
          (r) => `<tr>
        <td><a href="yarisci.html?u=${esc(r.user_id)}"><b>${esc(r.display_name || "?")}</b></a><br><span class="muted tiny">${esc(r.email || "(hesap silinmiş)")}</span></td>
        <td>${fmtDate(r.created_at, true)}<br><span class="muted tiny">Hesap: ${fmtDate(r.account_created)} · ${r.source === "app" ? "Program" : "Site"}</span></td>
        <td><span class="badge ${r.granted ? "ok" : isAbuse(r.reason) ? "bad" : ""}">${r.granted ? "Verildi" : "Reddedildi"}</span><br><span class="small">${esc(reasonText(r.reason))}</span>
          ${r.admin_action ? `<br><span class="muted tiny">${r.admin_action === "granted" ? "Yönetici verdi" : "Yönetici geri aldı"}: ${fmtDate(r.admin_at, true)}</span>` : ""}</td>
        <td>${(r.matched || []).map((m) => `<a href="yarisci.html?u=${esc(m.id)}">${esc(m.name || "?")}</a>`).join(", ") || "—"}</td>
        <td class="tiny">IP ${esc(maskIp(r.ip))}<br>PC ${short(r.device_hash)} · Web ${short(r.web_fp)}</td>
        <td>${proNow(r) ? `${fmtDate(r.pro_until)}<br><span class="muted tiny">${esc(r.pro_source || "")}</span>` : "—"}</td>
        <td>${
          proNow(r) && r.pro_source === "trial"
            ? `<button class="btn btn-sm btn-danger" data-rv="${esc(r.user_id)}">Geri al</button>`
            : `<button class="btn btn-sm" data-gr="${esc(r.user_id)}">PRO ver</button>`
        }</td></tr>`,
        )
        .join("") || `<tr><td colspan="7" class="muted">Kayıt yok.</td></tr>`
    }</tbody></table></div>`;

  const saveCfg = async (patch, msg) => {
    const { data, error } = await sb
      .from("app_config")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select();
    if (error || !data?.length) return toast(error?.message || "Kaydedilemedi", true);
    toast(msg);
    show();
  };
  $("#ton", el).addEventListener("change", (e) => saveCfg({ trial_enabled: e.target.checked }, e.target.checked ? "Deneme PRO açıldı" : "Deneme PRO kapatıldı"));
  $("#tsave", el).addEventListener("click", () => {
    const n = Math.round(Number($("#tdays", el).value));
    if (!(n >= 1 && n <= 30)) return toast("1 ile 30 arasında bir gün sayısı gir", true);
    saveCfg({ trial_days: n }, `Deneme süresi ${n} gün`);
  });
  $$("#tf button", el).forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.f;
      show();
    }),
  );
  const act = async (id, grant) => {
    try {
      await rpc("admin_trial_set", { p_user: id, p_grant: grant });
      toast(grant ? "Deneme PRO verildi" : "Deneme PRO geri alındı");
      show();
    } catch (e) {
      toast(e.message || String(e), true);
    }
  };
  $$("[data-gr]", el).forEach((b) => b.addEventListener("click", () => confirm(`${days} günlük deneme PRO verilsin mi?`) && act(b.dataset.gr, true)));
  $$("[data-rv]", el).forEach((b) => b.addEventListener("click", () => confirm("Deneme PRO geri alınsın mı?") && act(b.dataset.rv, false)));
}
