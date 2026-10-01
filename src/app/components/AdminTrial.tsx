// Yönetim › Deneme PRO: yeni hesaplara verilen deneme PRO ayarları (açık/kapalı, gün) ve tüm talepler.
// Talepler: verildi / reddedildi / şüpheli (aynı bilgisayar, tarayıcı, e-posta, IP, ağ ya da geçici e-posta).
// Eşleşen hesap adına tıklayınca profili açılır. Elle "PRO ver" / "Geri al". Sunucu: supabase/c41_guncelleme.sql.

import { For, Show, createResource, createSignal } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { config, saveConfig } from "@/cloud/account";
import { TRIAL_REASONS, adminTrialClaims, adminTrialSet, type TrialClaimRow, type TrialFilter } from "@/cloud/trial";
import { ProfileDialog } from "./Profile";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString(localeTag(), { dateStyle: "short", timeStyle: "short" }) : "—");

/** IP'nin son kısmını gizle (1.2.3.4 → 1.2.x.x; IPv6'da ilk 3 grup) */
export function maskIp(ip: string | null): string {
  if (!ip) return "—";
  if (ip.includes(".")) {
    const p = ip.split(".");
    return `${p[0]}.${p[1]}.x.x`;
  }
  return ip.split(":").slice(0, 3).join(":") + ":…";
}
const short = (h: string | null) => (h ? h.slice(0, 8) + "…" : "—");
const reasonText = (r: string) =>
  r
    .split(",")
    .map((x) => TRIAL_REASONS[x] ?? x)
    .join(", ");
const ABUSE = ["disposable_email", "same_device", "same_browser", "same_email", "same_ip", "same_network"];
const isAbuse = (r: string) => r.split(",").some((x) => ABUSE.includes(x));

export function AdminTrial(p: { run: Run }) {
  const [filter, setFilter] = createSignal<TrialFilter>("all");
  const [rows, { refetch }] = createResource(filter, (f) => adminTrialClaims(f).catch(() => [] as TrialClaimRow[]));
  const [days, setDays] = createSignal(String(config()?.trial_days ?? 3));
  const [profileOf, setProfileOf] = createSignal<string | null>(null);
  const enabled = () => config()?.trial_enabled !== false;
  const proNow = (r: TrialClaimRow) => !!r.pro_until && new Date(r.pro_until).getTime() > Date.now();

  return (
    <section class="panel admin-panel">
      <h3>Deneme PRO</h3>
      <p class="muted small">
        Yeni hesaplar (7 günden genç, daha önce hiç PRO / abonelik / ödeme almamış) ilk girişte bir kez deneme PRO alır. Aynı bilgisayar, aynı tarayıcı,
        aynı e-posta (Gmail noktaları ve +ekler yok sayılır), son 60 günde aynı IP, son 7 günde aynı ağ + aynı tarayıcı parmak izi ya da geçici e-posta
        servisi görülürse kullanıcıya hiçbir şey söylenmeden reddedilir ve sana bildirim gelir. Bilgisayar ve tarayıcı kimlikleri karma olarak saklanır.
      </p>
      <div class="row">
        <div>
          <b>Deneme PRO açık</b>
          <small>Kapalıyken yeni talepler kaydedilmez ve PRO verilmez</small>
        </div>
        <input
          type="checkbox"
          checked={enabled()}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            p.run(() => saveConfig({ trial_enabled: on }), on ? t("Deneme PRO açıldı") : t("Deneme PRO kapatıldı"));
          }}
        />
      </div>
      <div class="row">
        <div>
          <b>Deneme süresi (gün)</b>
          <small>1–30 gün; yeni talepler için geçerli</small>
        </div>
        <div class="pe-quick">
          <input class="input" type="number" min={1} max={30} style={{ width: "80px" }} value={days()} onInput={(e) => setDays(e.currentTarget.value)} />
          <button
            class="btn small"
            onClick={() => {
              const n = Math.round(Number(days()));
              if (!(n >= 1 && n <= 30)) return p.run(async () => Promise.reject(new Error(t("1 ile 30 arasında bir gün sayısı gir"))), "");
              p.run(() => saveConfig({ trial_days: n }), t("Deneme süresi {0} gün", n));
            }}
          >
            Kaydet
          </button>
        </div>
      </div>

      <div class="cm-tabs">
        <For each={[["all", "Hepsi"], ["granted", "Verilenler"], ["denied", "Reddedilenler"], ["suspicious", "Şüpheliler"]] as const}>
          {([id, label]) => (
            <button classList={{ on: filter() === id }} onClick={() => setFilter(id)}>
              {label}
            </button>
          )}
        </For>
        <span class="lt-sp" />
        <button class="btn ghost small" onClick={() => refetch()}>
          Yenile
        </button>
      </div>
      <Show when={!rows.loading && (rows() ?? []).length === 0}>
        <p class="muted">Kayıt yok.</p>
      </Show>
      <div class="admin-users">
        <For each={rows() ?? []}>
          {(r) => (
            <div class="admin-user" classList={{ flagged: isAbuse(r.reason) }}>
              <div>
                <b data-no-i18n>
                  <a href="#" onClick={(e) => (e.preventDefault(), setProfileOf(r.user_id))}>
                    {r.display_name || r.email || "?"}
                  </a>
                </b>
                <span class="dev-count" classList={{ over: isAbuse(r.reason) }}>
                  {r.granted ? "Verildi" : "Reddedildi"}
                </span>
                <small data-no-i18n>{r.email ?? "(hesap silinmiş)"}</small>
                <small class="muted">
                  {t("Talep: {0}", fmt(r.created_at))} · {t("Hesap: {0}", fmt(r.account_created))} · {r.source === "app" ? "Program" : "Site"}
                </small>
                <small>{t("Neden: {0}", reasonText(r.reason))}</small>
                <Show when={r.matched.length}>
                  <small>
                    {"Eşleşen hesaplar: "}
                    <For each={r.matched}>
                      {(m, i) => (
                        <>
                          {i() > 0 ? ", " : ""}
                          <a href="#" data-no-i18n onClick={(e) => (e.preventDefault(), setProfileOf(m.id))}>
                            {m.name || "?"}
                          </a>
                        </>
                      )}
                    </For>
                  </small>
                </Show>
                <small class="muted" data-no-i18n>
                  IP {maskIp(r.ip)} · PC {short(r.device_hash)} · Web {short(r.web_fp)}
                </small>
                <small class="muted">
                  {proNow(r) ? t("PRO: {0} ({1})", fmt(r.pro_until), r.pro_source ?? "") : "PRO değil"}
                  <Show when={r.admin_action}> · {r.admin_action === "granted" ? t("Yönetici verdi: {0}", fmt(r.admin_at)) : t("Yönetici geri aldı: {0}", fmt(r.admin_at))}</Show>
                </small>
              </div>
              <div class="btns">
                <Show when={!(proNow(r) && r.pro_source === "trial")}>
                  <button
                    class="btn ghost small"
                    onClick={() => {
                      if (!confirm(t("{0} hesabına {1} günlük deneme PRO verilsin mi?", r.display_name || r.email || "?", config()?.trial_days ?? 3))) return;
                      p.run(async () => (await adminTrialSet(r.user_id, true), refetch()), t("Deneme PRO verildi"));
                    }}
                  >
                    PRO ver
                  </button>
                </Show>
                <Show when={proNow(r) && r.pro_source === "trial"}>
                  <button
                    class="btn ghost small danger"
                    onClick={() => {
                      if (!confirm(t("{0} hesabının deneme PRO'su geri alınsın mı?", r.display_name || r.email || "?"))) return;
                      p.run(async () => (await adminTrialSet(r.user_id, false), refetch()), t("Deneme PRO geri alındı"));
                    }}
                  >
                    Geri al
                  </button>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
      <Show when={profileOf()}>{(id) => <ProfileDialog id={id()} onClose={() => setProfileOf(null)} />}</Show>
    </section>
  );
}
