// Yönetim › Reklamlar: reklamları aç/kapat, otomatik onay, rapor sınırı, yer başına fiyatlar;
// kampanya listesi (önizleme, onayla / reddet / durdur / sürdür / uzat / bitir), istatistik ve raporlar.

import { For, Show, createResource, createSignal } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { config, saveConfig } from "@/cloud/account";
import {
  AD_PLACEMENTS,
  AD_REPORT_REASONS,
  AD_STATUS,
  DEFAULT_AD_PRICING,
  adImageUrl,
  adminAdDelete,
  adminAdReports,
  adminAdSet,
  adminAds,
  type AdAction,
  type AdCampaign,
  type AdPlacement,
  type AdPricing,
  type AdStatus,
} from "@/cloud/ads";
import { openUrl } from "../ui";
import { fmtMoney } from "./AdminExtras";
import "../ads.css";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

const fmtTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" }) : "—");
const nf = (n: number) => Number(n || 0).toLocaleString(localeTag());
const PLACES = Object.keys(AD_PLACEMENTS) as AdPlacement[];
const FILTERS: { id: string; label: string }[] = [
  { id: "", label: "Hepsi" },
  { id: "pending_review", label: "Onay bekleyen" },
  { id: "active", label: "Yayında" },
  { id: "paused_reports", label: "Raporlarla gizlenen" },
  { id: "paused", label: "Durdurulan" },
  { id: "paused_owner", label: "Reklam veren durdurdu" },
  { id: "unpaid", label: "Ödeme bekleyen" },
  { id: "ended", label: "Biten" },
  { id: "rejected", label: "Reddedilen" },
  { id: "refunded", label: "İade" },
];

function pricing(): AdPricing {
  const p = config()?.ad_pricing;
  return {
    ...DEFAULT_AD_PRICING,
    ...(p ?? {}),
    placements: { ...DEFAULT_AD_PRICING.placements, ...(p?.placements ?? {}) },
  };
}

/** "4,99" ya da "4.99" → 4.99 */
const toNum = (v: string) => {
  const n = Math.round(parseFloat(String(v).replace(/\s/g, "").replace(",", ".")) * 100) / 100;
  return n > 0 ? n : 0;
};

const numList = (s: string) =>
  [...new Set(s.split(/[,\s;]+/).map((x) => parseInt(x, 10)).filter((x) => x > 0))].sort((a, b) => a - b);

export function AdminAds(p: { run: Run }) {
  return (
    <div class="ads-admin">
      <AdSettings run={p.run} />
      <AdCampaigns run={p.run} />
    </div>
  );
}

function AdSettings(p: { run: Run }) {
  const c = () => config();
  const [pr, setPr] = createSignal<AdPricing>(structuredClone(pricing()));
  const [imp, setImp] = createSignal(pricing().impressions.join(", "));
  const [days, setDays] = createSignal(pricing().days.join(", "));
  const [thr, setThr] = createSignal(String(c()?.ad_report_hide_threshold ?? 3));
  const setPlace = (id: AdPlacement, k: "on" | "cpm" | "day" | "cpm_tr" | "day_tr", v: boolean | number) =>
    setPr((x) => ({ ...x, placements: { ...x.placements, [id]: { ...x.placements[id], [k]: v } } }));
  const savePricing = () => {
    const next: AdPricing = { ...pr(), currency: (pr().currency || "USD").trim().toUpperCase().slice(0, 3), currency_tr: (pr().currency_tr || "TRY").trim().toUpperCase().slice(0, 3), impressions: numList(imp()), days: numList(days()) };
    if (!next.impressions.length || !next.days.length) return p.run(async () => Promise.reject(new Error(t("Paket listeleri boş olamaz"))), "");
    return p.run(() => saveConfig({ ad_pricing: next, ad_report_hide_threshold: Math.max(1, parseInt(thr(), 10) || 3) }), t("Reklam fiyatları kaydedildi"));
  };
  return (
    <section class="panel admin-panel">
      <h3>Reklamlar</h3>
      <p class="muted small">
        Reklam verenler sitedeki <b>Reklam ver</b> sayfasından yer, gösterim paketi ya da gün seçer, görsel yükler ve Lemon Squeezy ile öder. Ödeme gelince reklam
        otomatik yayına girer (otomatik onay kapalıysa burada onay bekler). PRO üyeler reklam görmez; oyun içi overlay'lerde hiç reklam yoktur. Kullanıcılar reklamı sağ
        tıklayıp raporlayabilir; rapor sınırına ulaşan reklam kendiliğinden gizlenir ve sana bildirim gelir.
      </p>
      <div class="ads-settings">
        <label class="check" classList={{ on: !!c()?.ads_enabled }}>
          <input type="checkbox" checked={!!c()?.ads_enabled} onChange={(e) => p.run(() => saveConfig({ ads_enabled: e.currentTarget.checked }), e.currentTarget.checked ? t("Reklamlar açıldı") : t("Reklamlar kapatıldı"))} />
          <span>
            <b>Reklamlar açık</b>
            <br />
            <small class="muted">Kapalıyken reklam gösterilmez ve yeni reklam alınmaz</small>
          </span>
        </label>
        <label class="check" classList={{ on: c()?.ad_auto_approve !== false }}>
          <input type="checkbox" checked={c()?.ad_auto_approve !== false} onChange={(e) => p.run(() => saveConfig({ ad_auto_approve: e.currentTarget.checked }), t("Kaydedildi"))} />
          <span>
            <b>Ödeme sonrası otomatik yayınla</b>
            <br />
            <small class="muted">Kapalıysa ödenen reklam önce senin onayını bekler</small>
          </span>
        </label>
        <div class="check">
          <span>
            <b>Rapor sınırı</b>
            <br />
            <small class="muted">Bu kadar farklı üye raporlayınca reklam gizlenir</small>
          </span>
          <input class="input" type="number" min="1" max="100" style={{ width: "80px" }} value={thr()} onInput={(e) => setThr(e.currentTarget.value)} />
        </div>
      </div>

      <h4>Fiyatlar</h4>
      <table class="ads-price">
        <thead>
          <tr>
            <th>Yer</th>
            <th>Önerilen görsel</th>
            <th>Satışta</th>
            <th>{t("1.000 gösterim ({0})", pr().currency)}</th>
            <th>{t("Günlük ({0})", pr().currency)}</th>
            <th>{t("Türkiye 1.000 gösterim ({0})", pr().currency_tr || "TRY")}</th>
            <th>{t("Türkiye günlük ({0})", pr().currency_tr || "TRY")}</th>
          </tr>
        </thead>
        <tbody>
          <For each={PLACES}>
            {(id) => (
              <tr>
                <td>{AD_PLACEMENTS[id].label}</td>
                <td class="muted">
                  {AD_PLACEMENTS[id].w}×{AD_PLACEMENTS[id].h}
                </td>
                <td>
                  <input type="checkbox" checked={pr().placements[id]?.on !== false} onChange={(e) => setPlace(id, "on", e.currentTarget.checked)} />
                </td>
                <td>
                  <input class="input" type="text" inputmode="decimal" value={pr().placements[id]?.cpm ?? 0} onChange={(e) => setPlace(id, "cpm", toNum(e.currentTarget.value))} />
                </td>
                <td>
                  <input class="input" type="text" inputmode="decimal" value={pr().placements[id]?.day ?? 0} onChange={(e) => setPlace(id, "day", toNum(e.currentTarget.value))} />
                </td>
                <td>
                  <input class="input" type="text" inputmode="decimal" value={pr().placements[id]?.cpm_tr ?? 0} onChange={(e) => setPlace(id, "cpm_tr", toNum(e.currentTarget.value))} />
                </td>
                <td>
                  <input class="input" type="text" inputmode="decimal" value={pr().placements[id]?.day_tr ?? 0} onChange={(e) => setPlace(id, "day_tr", toNum(e.currentTarget.value))} />
                </td>
                <td>
                  <input class="input" type="number" min="0" step="0.01" value={pr().placements[id]?.cpm_tr ?? 0} onInput={(e) => setPlace(id, "cpm_tr", Number(e.currentTarget.value) || 0)} />
                </td>
                <td>
                  <input class="input" type="number" min="0" step="0.01" value={pr().placements[id]?.day_tr ?? 0} onInput={(e) => setPlace(id, "day_tr", Number(e.currentTarget.value) || 0)} />
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <div class="row">
        <div>
          <b>Genel para birimi</b>
          <small>Yurt dışından reklam verenler bu para birimiyle öder (ör. USD)</small>
        </div>
        <input class="input" maxLength={3} style={{ width: "90px" }} value={pr().currency} onInput={(e) => setPr((x) => ({ ...x, currency: e.currentTarget.value }))} />
      </div>
      <div class="row">
        <div>
          <b>Türkiye para birimi</b>
          <small>Türkiye'den reklam verenler, o yer için Türkiye fiyatı girildiyse bu para birimiyle öder (ör. TRY). Türkiye fiyatı 0 ise genel fiyat uygulanır.</small>
        </div>
        <input class="input" maxLength={3} style={{ width: "90px" }} value={pr().currency_tr ?? "TRY"} onInput={(e) => setPr((x) => ({ ...x, currency_tr: e.currentTarget.value }))} />
      </div>
      <div class="row">
        <div>
          <b>Gösterim paketleri</b>
          <small>Virgülle ayır (ör. 1000, 5000, 10000, 50000)</small>
        </div>
        <input class="input admin-wide" value={imp()} onInput={(e) => setImp(e.currentTarget.value)} />
      </div>
      <div class="row">
        <div>
          <b>Gün seçenekleri</b>
          <small>Virgülle ayır (ör. 1, 3, 7, 14, 30)</small>
        </div>
        <input class="input admin-wide" value={days()} onInput={(e) => setDays(e.currentTarget.value)} />
      </div>
      <div class="btns">
        <button class="btn primary" onClick={savePricing}>
          Fiyatları kaydet
        </button>
        <button class="btn ghost" onClick={() => openUrl("https://pitwall.simracetr.com/reklam.html")}>
          Reklam ver sayfasını aç
        </button>
      </div>
    </section>
  );
}

function AdCampaigns(p: { run: Run }) {
  const [filter, setFilter] = createSignal("");
  const [list, { refetch }] = createResource(filter, (f) => adminAds(f).catch(() => [] as AdCampaign[]));
  const [all, { refetch: refetchAll }] = createResource(() => adminAds("").catch(() => [] as AdCampaign[]));
  const [openReports, setOpenReports] = createSignal<string | null>(null);
  const [reports] = createResource(openReports, (id) => adminAdReports(id).catch(() => []));
  // Kalıcı silme onayı (raporlar bölümünde; yayındaki reklam dahil)
  const [askDel, setAskDel] = createSignal<string | null>(null);
  const forceDelete = (a: AdCampaign) =>
    p.run(async () => {
      await adminAdDelete(a.id);
      setAskDel(null);
      setOpenReports(null);
      refetch();
      refetchAll();
    }, t("Reklam kalıcı olarak silindi"));
  const act = (a: AdCampaign, action: AdAction, ok: string, ask?: string) => {
    let note = "";
    let amount = 0;
    if (action === "reject" || action === "pause") {
      const v = prompt(ask ?? t("Reklam verene gidecek not (isteğe bağlı):"), "");
      if (v === null) return;
      note = v;
    } else if (action === "extend") {
      const v = prompt(a.model === "days" ? t("Kaç gün eklensin?") : t("Kaç gösterim eklensin?"), a.model === "days" ? "1" : "1000");
      amount = parseInt(v ?? "", 10) || 0;
      if (amount <= 0) return;
    } else if (ask && !confirm(ask)) return;
    p.run(async () => {
      await adminAdSet(a.id, action, note, amount);
      refetch();
      refetchAll();
    }, ok);
  };
  const stats = () => {
    const rows = all() ?? [];
    const rev: Record<string, number> = {};
    let imp = 0;
    let clk = 0;
    for (const r of rows) {
      imp += r.impressions;
      clk += r.clicks;
      if (r.paid_at && r.status !== "refunded") rev[r.currency] = (rev[r.currency] ?? 0) + Number(r.paid_amount ?? r.price ?? 0);
    }
    return {
      active: rows.filter((r) => r.status === "active").length,
      pending: rows.filter((r) => r.status === "pending_review").length,
      hidden: rows.filter((r) => r.status === "paused_reports").length,
      imp,
      clk,
      rev,
    };
  };
  const ctr = (a: { impressions: number; clicks: number }) => (a.impressions ? ((a.clicks / a.impressions) * 100).toFixed(2) + "%" : "—");
  const progress = (a: AdCampaign) =>
    a.model === "impressions"
      ? t("{0} / {1} gösterim", nf(a.impressions), nf(a.quantity))
      : a.ends_at
        ? t("{0} gün · bitiş {1}", a.quantity, fmtTime(a.ends_at))
        : t("{0} gün", a.quantity);
  return (
    <section class="panel admin-panel">
      <div class="stat-grid">
        <div class="stat on">
          <b>{stats().active}</b>
          <small>Yayında</small>
        </div>
        <div class="stat">
          <b>{stats().pending}</b>
          <small>Onay bekleyen</small>
        </div>
        <div class="stat">
          <b>{stats().hidden}</b>
          <small>Raporlarla gizlenen</small>
        </div>
        <div class="stat">
          <b>{nf(stats().imp)}</b>
          <small>Toplam gösterim</small>
        </div>
        <div class="stat">
          <b>{nf(stats().clk)}</b>
          <small>{t("Tıklama · TO {0}", ctr({ impressions: stats().imp, clicks: stats().clk }))}</small>
        </div>
        <div class="stat pro">
          <b>{fmtMoney(stats().rev)}</b>
          <small>Reklam geliri</small>
        </div>
      </div>
      <div class="cm-tabs rev-tabs">
        <For each={FILTERS}>
          {(f) => (
            <button classList={{ on: filter() === f.id }} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          )}
        </For>
        <span class="lt-sp" />
        <button class="btn ghost small" onClick={() => (refetch(), refetchAll())}>
          Yenile
        </button>
      </div>
      <div class="ads-list">
        <For each={list() ?? []} fallback={<p class="muted small">{list.loading ? "Yükleniyor…" : "Reklam yok."}</p>}>
          {(a) => (
            <div class="ads-row">
              <img src={adImageUrl(a.image)} alt="" loading="lazy" />
              <div class="ads-meta">
                <div>
                  <span class={`ads-chip ${AD_STATUS[a.status as AdStatus]?.tone ?? ""}`}>{AD_STATUS[a.status as AdStatus]?.label ?? a.status}</span>{" "}
                  <b data-no-i18n>{a.title}</b>
                </div>
                <Show when={a.body}>
                  <span class="muted" data-no-i18n>
                    {a.body}
                  </span>
                </Show>
                <a href="#" data-no-i18n onClick={(e) => (e.preventDefault(), openUrl(a.url))}>
                  {a.url}
                </a>
                <small class="muted">
                  {AD_PLACEMENTS[a.placement]?.label ?? a.placement} · {progress(a)} ·{" "}
                  {a.langs?.length ? a.langs.map((l) => (l === "tr" ? t("Türkçe") : t("Diğer diller"))).join(", ") : t("Tüm diller")}
                </small>
                <small>
                  {t("{0} gösterim · {1} tıklama · TO {2}", nf(a.impressions), nf(a.clicks), ctr(a))}
                  <Show when={a.reports > 0}>
                    {" · "}
                    <button class="link danger" onClick={() => setOpenReports(openReports() === a.id ? null : a.id)}>
                      {t("{0} rapor", a.reports)}
                    </button>
                  </Show>
                </small>
                <small class="muted">
                  <span data-no-i18n>{a.owner_name || "?"}</span> · <span data-no-i18n>{a.owner_email ?? ""}</span> ·{" "}
                  {a.paid_at ? t("Ödendi {0} · {1}", fmtMoney({ [a.currency]: Number(a.paid_amount ?? a.price) }), fmtTime(a.paid_at)) : t("Fiyat {0} · ödenmedi", fmtMoney({ [a.currency]: Number(a.price) }))}
                </small>
                <Show when={a.review_note}>
                  <small class="muted">
                    {t("Not: {0}", "")}
                    <span data-no-i18n>{a.review_note}</span>
                  </small>
                </Show>
              </div>
              <div class="ads-acts">
                <Show when={a.status === "pending_review" || (a.status === "rejected" && a.paid_at)}>
                  <button class="btn small primary" onClick={() => act(a, "approve", t("Reklam yayına alındı"))}>
                    Onayla
                  </button>
                </Show>
                <Show when={["pending_review", "active", "paused", "paused_reports", "paused_owner", "unpaid"].includes(a.status)}>
                  <button class="btn small danger" onClick={() => act(a, "reject", t("Reklam reddedildi"), t("Reddetme sebebi (reklam verene gider):"))}>
                    Reddet
                  </button>
                </Show>
                <Show when={a.status === "active" || a.status === "paused_owner"}>
                  <button class="btn small" onClick={() => act(a, "pause", t("Reklam durduruldu"), t("Durdurma notu (reklam verene gider, isteğe bağlı):"))}>
                    Durdur
                  </button>
                </Show>
                <Show when={["paused", "paused_reports", "paused_owner"].includes(a.status)}>
                  <button class="btn small primary" onClick={() => act(a, "resume", t("Reklam yeniden yayında"))}>
                    Sürdür
                  </button>
                </Show>
                <Show when={["active", "paused", "paused_reports", "paused_owner", "ended", "pending_review"].includes(a.status)}>
                  <button class="btn small" onClick={() => act(a, "extend", t("Reklam uzatıldı"))}>
                    Uzat
                  </button>
                </Show>
                <Show when={["active", "paused", "paused_reports", "paused_owner", "pending_review"].includes(a.status)}>
                  <button class="btn small ghost" onClick={() => act(a, "end", t("Reklam bitirildi"), t("Reklam şimdi bitirilsin mi?"))}>
                    Bitir
                  </button>
                </Show>
                <Show when={["unpaid", "rejected", "ended", "refunded"].includes(a.status)}>
                  <button class="btn small ghost" onClick={() => act(a, "delete", t("Reklam silindi"), t("Reklam kaydı silinsin mi?"))}>
                    Sil
                  </button>
                </Show>
              </div>
              <Show when={openReports() === a.id}>
                <div class="ads-reports">
                  <For each={reports() ?? []} fallback={<p class="muted small">{reports.loading ? "Yükleniyor…" : "Rapor yok."}</p>}>
                    {(r) => (
                      <div>
                        <b>{AD_REPORT_REASONS.find((x) => x.id === r.reason)?.label ?? r.reason}</b> · <span data-no-i18n>{r.reporter_name || "?"}</span> ·{" "}
                        <span class="muted">{fmtTime(r.created_at)}</span>
                        <Show when={r.note}>
                          <div class="muted" data-no-i18n>
                            {r.note}
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                  <div class="ads-del">
                    <Show
                      when={askDel() === a.id}
                      fallback={
                        <button class="btn small danger" title="Reklam, raporları ve görseliyle kalıcı silinir (yayındaysa da)" onClick={() => setAskDel(a.id)}>
                          Reklamı sil
                        </button>
                      }
                    >
                      <span>
                        {a.status === "active" || a.paid_at
                          ? t("Reklam yayından kalkar, raporları ve görseliyle kalıcı silinir. Emin misin?")
                          : t("Reklam kalıcı olarak silinsin mi?")}
                      </span>
                      <button class="btn small danger" onClick={() => forceDelete(a)}>
                        Evet, kalıcı sil
                      </button>
                      <button class="btn small ghost" onClick={() => setAskDel(null)}>
                        Vazgeç
                      </button>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
