// Yönetim › Kuponlar: indirim kuponu oluştur / düzenle / kapat / yeniden aç / sil (sadece hiç kullanılmamışsa).
// "Aktif kuponlar" ve "Geçmiş / biten kuponlar" (süresi dolmuş, kapatılmış ya da kullanım limiti dolmuş) listeleri,
// kullanım sayısı ve verilen toplam indirim. Süresi dolmuş kupon tarihleri güncellenerek yeniden açılabilir.

import { For, Show, createResource, createSignal } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import {
  adminCouponDelete,
  adminCouponRedemptions,
  adminCouponSave,
  adminCouponSetActive,
  adminCoupons,
  type AdminCoupon,
  type CouponAdModel,
  type CouponDraft,
  type CouponPlan,
  type CouponState,
} from "@/cloud/coupons";
import { fmtMoney } from "./AdminExtras";
import "../ads.css";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

const PLANS: { id: CouponPlan; label: string }[] = [
  { id: "1m", label: "PRO 1 aylık" },
  { id: "3m", label: "PRO 3 aylık" },
  { id: "6m", label: "PRO 6 aylık" },
  { id: "12m", label: "PRO 12 aylık" },
];
const MODELS: { id: CouponAdModel; label: string }[] = [
  { id: "impressions", label: "Reklam · gösterim paketi" },
  { id: "days", label: "Reklam · süre (gün)" },
];
const STATE: Record<CouponState, { label: string; tone: string }> = {
  active: { label: "Aktif", tone: "ok" },
  scheduled: { label: "Henüz başlamadı", tone: "warn" },
  expired: { label: "Süresi doldu", tone: "" },
  inactive: { label: "Kapatıldı", tone: "bad" },
  exhausted: { label: "Limit doldu", tone: "warn" },
};

const fmtTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" }) : "—");

/** ISO → datetime-local girişi (yerel saat) */
function toLocalInput(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** datetime-local girişi → ISO (boşsa null) */
function fromLocalInput(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const empty = (): CouponDraft => ({
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

const expired = (c: AdminCoupon) => !!c.valid_until && new Date(c.valid_until).getTime() <= Date.now();

const packages = (c: AdminCoupon) =>
  [
    ...PLANS.filter((p) => c.pro_plans.includes(p.id)).map((p) => p.id),
    ...(c.pro_gift && c.pro_plans.length ? [t("hediye")] : []),
    ...MODELS.filter((m) => c.ad_models.includes(m.id)).map((m) => (m.id === "impressions" ? t("reklam gösterim") : t("reklam gün"))),
  ].join(", ");

export function AdminCoupons(p: { run: Run }) {
  const [list, { refetch }] = createResource(() => adminCoupons().catch(() => [] as AdminCoupon[]));
  const [edit, setEdit] = createSignal<CouponDraft | null>(null);
  const [openUses, setOpenUses] = createSignal<string | null>(null);
  const [uses] = createResource(openUses, (id) => adminCouponRedemptions(id).catch(() => []));
  const active = () => (list() ?? []).filter((c) => c.state === "active" || c.state === "scheduled");
  const past = () => (list() ?? []).filter((c) => c.state !== "active" && c.state !== "scheduled");

  const startEdit = (c: AdminCoupon, reopen = false) => {
    const d: CouponDraft = {
      id: c.id,
      code: c.code,
      percent: c.percent,
      valid_from: c.valid_from,
      valid_until: c.valid_until,
      pro_plans: [...c.pro_plans],
      pro_gift: c.pro_gift,
      ad_models: [...c.ad_models],
      max_uses: c.max_uses,
      max_uses_per_user: c.max_uses_per_user,
      active: c.active,
      note: c.note,
    };
    // Yeniden aç: kapatılmışsa açılır, süresi dolmuşsa bitiş 7 gün sonraya önerilir (kaydetmeden önce değiştirilebilir)
    if (reopen) {
      d.active = true;
      if (c.valid_until && new Date(c.valid_until).getTime() <= Date.now()) {
        d.valid_until = new Date(Date.now() + 7 * 86400_000).toISOString();
        if (d.valid_from && new Date(d.valid_from).getTime() > Date.now()) d.valid_from = null;
      }
    }
    setEdit(d);
    requestAnimationFrame(() => document.querySelector(".coupon-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const save = () => {
    const d = edit();
    if (!d) return;
    p.run(async () => {
      await adminCouponSave(d);
      setEdit(null);
      await refetch();
    }, d.id ? t("Kupon kaydedildi") : t("Kupon oluşturuldu"));
  };
  const setActive = (c: AdminCoupon, on: boolean) =>
    p.run(async () => {
      await adminCouponSetActive(c.id, on);
      await refetch();
    }, on ? t("Kupon açıldı") : t("Kupon kapatıldı"));
  const del = (c: AdminCoupon) => {
    if (!confirm(t("{0} kuponu silinsin mi?", c.code))) return;
    p.run(async () => {
      await adminCouponDelete(c.id);
      await refetch();
    }, t("Kupon silindi"));
  };

  const Row = (r: { c: AdminCoupon }) => {
    const c = r.c;
    return (
      <div class="ads-row" style={{ "grid-template-columns": "1fr auto" }}>
        <div class="ads-meta">
          <div>
            <span class={`ads-chip ${STATE[c.state]?.tone ?? ""}`}>{STATE[c.state]?.label ?? c.state}</span>{" "}
            <b data-no-i18n style={{ "font-family": "monospace", "font-size": "1.1em" }}>
              {c.code}
            </b>{" "}
            <b>{t("%{0} indirim", c.percent)}</b>
          </div>
          <small class="muted">
            {t("Geçerli: {0}", packages(c) || "—")} · {c.valid_from ? t("Başlangıç {0}", fmtTime(c.valid_from)) + " · " : ""}
            {c.valid_until ? t("Bitiş {0}", fmtTime(c.valid_until)) : t("Süresiz")}
          </small>
          <small>
            {t("{0} kullanım", c.uses)}
            {c.max_uses ? t(" / {0} limit", c.max_uses) : ""} · {t("kişi başı {0}", c.max_uses_per_user ?? "∞")} ·{" "}
            {t("Verilen indirim: {0}", fmtMoney(c.discount))}
            <Show when={c.uses > 0}>
              {" · "}
              <button class="link" onClick={() => setOpenUses(openUses() === c.id ? null : c.id)}>
                {openUses() === c.id ? "Kullanımları gizle" : "Kullanımlar"}
              </button>
            </Show>
          </small>
          <Show when={c.note}>
            <small class="muted" data-no-i18n>
              {c.note}
            </small>
          </Show>
          <Show when={openUses() === c.id}>
            <table class="ads-price" style={{ "margin-top": "6px" }}>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Üye</th>
                  <th>Paket</th>
                  <th>Tutar</th>
                </tr>
              </thead>
              <tbody>
                <For each={uses() ?? []} fallback={<tr><td colSpan={4} class="muted">{uses.loading ? "Yükleniyor…" : "Kayıt yok."}</td></tr>}>
                  {(u) => (
                    <tr>
                      <td>{fmtTime(u.created_at)}</td>
                      <td data-no-i18n>{u.user_name || "—"}</td>
                      <td data-no-i18n>
                        {u.product} {u.plan}
                      </td>
                      <td>
                        <s class="muted">{fmtMoney({ [u.currency]: u.amount_before })}</s> {fmtMoney({ [u.currency]: u.amount_after })}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </div>
        <div class="btns" style={{ "flex-direction": "column", "align-items": "stretch" }}>
          <button class="btn ghost small" onClick={() => startEdit(c)}>
            Düzenle
          </button>
          <Show
            when={c.state === "active" || c.state === "scheduled"}
            fallback={
              <button class="btn primary small" onClick={() => (c.state === "inactive" && !expired(c) ? setActive(c, true) : startEdit(c, true))}>
                Yeniden aç
              </button>
            }
          >
            <button class="btn ghost small" onClick={() => setActive(c, false)}>
              Kapat
            </button>
          </Show>
          <Show when={c.uses === 0}>
            <button class="btn ghost small danger" onClick={() => del(c)}>
              Sil
            </button>
          </Show>
        </div>
      </div>
    );
  };

  return (
    <div class="ads-admin">
    <section class="panel admin-panel">
      <h3>İndirim kuponları</h3>
      <p class="muted small">
        Kullanıcılar PRO, hediye PRO ve reklam satın alırken kupon kodunu girer; indirim ödeme sayfasında ürün adında ve açıklamasında görünür.
        Kupon ödeme anında sunucuda yeniden denetlenir. PRO aboneliğinde indirim ilk ödemede uygulanır (aylık planda kupon geçerli olduğu sürece, bitişi yoksa her ödemede); yenilemeler güncel fiyattan. Kullanılmış
        kupon silinemez, kapatılabilir.
      </p>
      <div class="btns">
        <button class="btn primary" onClick={() => setEdit(empty())}>
          Yeni kupon
        </button>
        <button class="btn ghost" onClick={() => refetch()}>
          Yenile
        </button>
      </div>

      <Show when={edit()}>
        {(d) => {
          const set = (patch: Partial<CouponDraft>) => setEdit({ ...d(), ...patch });
          const togglePlan = (id: CouponPlan, on: boolean) =>
            set({ pro_plans: on ? [...new Set([...d().pro_plans, id])] : d().pro_plans.filter((x) => x !== id) });
          const toggleModel = (id: CouponAdModel, on: boolean) =>
            set({ ad_models: on ? [...new Set([...d().ad_models, id])] : d().ad_models.filter((x) => x !== id) });
          const intOrNull = (v: string) => {
            const n = parseInt(v, 10);
            return n > 0 ? n : null;
          };
          return (
            <div class="coupon-form" style={{ border: "1px solid var(--line, #333)", "border-radius": "8px", padding: "12px", margin: "12px 0" }}>
              <h4 style={{ "margin-top": "0" }}>{d().id ? t("Kuponu düzenle: {0}", d().code) : "Yeni kupon"}</h4>
              <div class="row">
                <div>
                  <b>Kod</b>
                  <small>Harf, rakam, - ve _ (2-32). Büyük/küçük harf fark etmez, ör. ERKIN</small>
                </div>
                <input
                  class="input"
                  maxLength={32}
                  style={{ width: "180px", "text-transform": "uppercase" }}
                  value={d().code}
                  onInput={(e) => set({ code: e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })}
                />
              </div>
              <div class="row">
                <div>
                  <b>İndirim (%)</b>
                  <small>1 ile 90 arası</small>
                </div>
                <input
                  class="input"
                  type="number"
                  min="1"
                  max="90"
                  style={{ width: "90px" }}
                  value={d().percent}
                  onInput={(e) => set({ percent: Math.max(1, Math.min(90, parseInt(e.currentTarget.value, 10) || 1)) })}
                />
              </div>
              <div class="row">
                <div>
                  <b>Başlangıç</b>
                  <small>İsteğe bağlı; boşsa hemen geçerli</small>
                </div>
                <input class="input" type="datetime-local" value={toLocalInput(d().valid_from)} onChange={(e) => set({ valid_from: fromLocalInput(e.currentTarget.value) })} />
              </div>
              <div class="row">
                <div>
                  <b>Bitiş</b>
                  <small>Boşsa süresiz</small>
                </div>
                <input class="input" type="datetime-local" value={toLocalInput(d().valid_until)} onChange={(e) => set({ valid_until: fromLocalInput(e.currentTarget.value) })} />
              </div>
              <div class="row">
                <div>
                  <b>Geçerli paketler</b>
                  <small>Kupon sadece seçili paketlerde kullanılabilir</small>
                </div>
                <div style={{ display: "flex", "flex-wrap": "wrap", gap: "6px 14px" }}>
                  <For each={PLANS}>
                    {(x) => (
                      <label>
                        <input type="checkbox" checked={d().pro_plans.includes(x.id)} onChange={(e) => togglePlan(x.id, e.currentTarget.checked)} /> {x.label}
                      </label>
                    )}
                  </For>
                  <label>
                    <input type="checkbox" checked={d().pro_gift} onChange={(e) => set({ pro_gift: e.currentTarget.checked })} /> Hediye PRO'da da geçerli
                  </label>
                  <For each={MODELS}>
                    {(x) => (
                      <label>
                        <input type="checkbox" checked={d().ad_models.includes(x.id)} onChange={(e) => toggleModel(x.id, e.currentTarget.checked)} /> {x.label}
                      </label>
                    )}
                  </For>
                </div>
              </div>
              <div class="row">
                <div>
                  <b>Toplam kullanım sınırı</b>
                  <small>Boşsa sınırsız</small>
                </div>
                <input class="input" type="number" min="1" style={{ width: "110px" }} value={d().max_uses ?? ""} onInput={(e) => set({ max_uses: intOrNull(e.currentTarget.value) })} />
              </div>
              <div class="row">
                <div>
                  <b>Kişi başı kullanım</b>
                  <small>Varsayılan 1; boşsa sınırsız</small>
                </div>
                <input
                  class="input"
                  type="number"
                  min="1"
                  style={{ width: "110px" }}
                  value={d().max_uses_per_user ?? ""}
                  onInput={(e) => set({ max_uses_per_user: intOrNull(e.currentTarget.value) })}
                />
              </div>
              <div class="row">
                <div>
                  <b>Not</b>
                  <small>Sadece yöneticiler görür</small>
                </div>
                <input class="input admin-wide" maxLength={500} value={d().note} onInput={(e) => set({ note: e.currentTarget.value })} />
              </div>
              <label class="check" classList={{ on: d().active }}>
                <input type="checkbox" checked={d().active} onChange={(e) => set({ active: e.currentTarget.checked })} />
                <span>
                  <b>Etkin</b>
                </span>
              </label>
              <div class="btns">
                <button class="btn primary" disabled={d().code.length < 2} onClick={save}>
                  {d().id ? "Kaydet" : "Oluştur"}
                </button>
                <button class="btn ghost" onClick={() => setEdit(null)}>
                  Vazgeç
                </button>
              </div>
            </div>
          );
        }}
      </Show>

      <h4>{t("Aktif kuponlar ({0})", active().length)}</h4>
      <div class="ads-list">
        <For each={active()} fallback={<p class="muted small">{list.loading ? "Yükleniyor…" : "Aktif kupon yok."}</p>}>
          {(c) => <Row c={c} />}
        </For>
      </div>
      <h4>{t("Geçmiş / biten kuponlar ({0})", past().length)}</h4>
      <div class="ads-list">
        <For each={past()} fallback={<p class="muted small">{list.loading ? "Yükleniyor…" : "Geçmiş kupon yok."}</p>}>
          {(c) => <Row c={c} />}
        </For>
      </div>
    </section>
    </div>
  );
}
