// Yönetim: sadece yöneticilere (ve moderatörlere) görünen ayrı bölüm.
// Alt sayfalar: Özet, Gelir, Üyeler, Destek, Abonelikler, Cihazlar, Planlar ve fiyatlar, Ücretsiz PRO,
// Reklamlar, Görünürlük, Bildirimler, Moderasyon, Mesajlar, Medya, Ses paketleri.
// Moderatörler (reports.view izni): Destek (silme hariç) ve Moderasyon.

import { For, Match, Show, Switch, createEffect, createResource, createSignal, on, onCleanup, onMount } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import {
  adminDevices,
  adminRemoveDevice,
  adminResolveFlag,
  adminSetPro,
  adminStats,
  adminSubscriptions,
  adminUsers,
  config,
  isAdmin,
  isOwner,
  saveConfig,
  type AdminDeviceRow,
  type AdminSub,
  type AdminUser,
  type DeviceFilter,
  type UserFilter,
  PLAN_LIST,
  type AppConfig,
  type PlanDef,
  type ProPricing,
} from "@/cloud/account";
import { can, listGroups, ownerSetAdmin, setUserGroup, type PermGroup } from "@/cloud/moderation";
import { manifests } from "@/sdk/registry";
import { MessageReportsPanel, ModLogPanel, ModerationPanel, OwnerGroups } from "../components/AdminModeration";
import { AdminHosting, AdminWatermark } from "../components/AdminMedia";
import { AdminNotices } from "../components/AdminNotices";
import { AdminPromo, AdminRevenue, AdminSupport, AdminVisibility, ProEditor } from "../components/AdminExtras";
import { AdminAds } from "../components/AdminAds";
import { AdminCoupons } from "../components/AdminCoupons";
import { AdminProFeatures } from "../components/AdminProFeatures";
import { AdminMessages } from "../components/AdminMessages";
import { AdminVoicePacks } from "../components/AdminVoicePacks";
import { AdminTopLinks } from "../components/AdminTopLinks";
import { AdminBackdrops, AdminProPromo, AdminSimIcons, AdminTranslations } from "../components/AdminContent";
import { takeAdminFocus } from "../components/adminFocus";
import { AdminTrial } from "../components/AdminTrial";
import { AdminLiveChat } from "../components/AdminLiveChat";
import { sub } from "../ui";
import { adminBadgeSeen, refreshAdminBadges, refreshAdminBadgesSoon } from "@/cloud/adminBadges";

const fmtDate = (v: string | number | null | undefined) => (v ? new Date(v).toLocaleDateString(localeTag()) : "—");
const fmtTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString(localeTag()) : "—");
const isOnline = (v: string | null | undefined) => !!v && new Date(v).getTime() > Date.now() - 4 * 60_000;

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

/** Yönetim alt menüsü: kullanıcının yetkisine göre */
export function adminSubs(): { id: string; label: string }[] {
  const all: { id: string; label: string; need: () => boolean }[] = [
    { id: "overview", label: "Özet", need: isAdmin },
    { id: "revenue", label: "Gelir", need: isAdmin },
    { id: "members", label: "Üyeler", need: isAdmin },
    { id: "support", label: "Destek", need: () => isAdmin() || can("reports.view") },
    { id: "subs", label: "Abonelikler", need: isAdmin },
    { id: "devices", label: "Cihazlar", need: isAdmin },
    { id: "plans", label: "Planlar ve fiyatlar", need: isAdmin },
    { id: "promo", label: "Ücretsiz PRO", need: isAdmin },
    { id: "trial", label: "Deneme PRO", need: isAdmin },
    { id: "ads", label: "Reklamlar", need: isAdmin },
    { id: "coupons", label: "Kuponlar", need: isAdmin },
    { id: "profeatures", label: "PRO özellikleri", need: isAdmin },
    { id: "visibility", label: "Görünürlük", need: isAdmin },
    { id: "notices", label: "Bildirimler", need: isAdmin },
    { id: "moderation", label: "Moderasyon", need: () => isAdmin() || can("reports.view") },
    { id: "messages", label: "Mesajlar", need: isAdmin },
    { id: "media", label: "Medya", need: isAdmin },
    { id: "voicepacks", label: "Ses paketleri", need: isAdmin },
    { id: "livechat", label: "Canlı Sohbet ayarları", need: isAdmin },
    { id: "propromo", label: "PRO tanıtım mesajı", need: isAdmin },
    { id: "backdrops", label: "Overlay arka planları", need: isAdmin },
    { id: "toplinks", label: "Üst çubuk bağlantıları", need: isAdmin },
    { id: "translations", label: "Çeviriler", need: isAdmin },
  ];
  return all.filter((x) => x.need()).map(({ id, label }) => ({ id, label }));
}

export const canSeeAdmin = () => isAdmin() || can("reports.view");

export function AdminPage() {
  const [msg, setMsg] = createSignal("");
  let hide: number | undefined;
  const run: Run = async (fn, ok) => {
    try {
      await fn();
      setMsg(ok);
      clearTimeout(hide);
      if (ok) hide = window.setTimeout(() => setMsg(""), 3000);
    } catch (e) {
      setMsg("Hata: " + String((e as Error).message));
    }
    // Bir işlemden sonra bekleyen iş sayaçları yenilenir
    refreshAdminBadgesSoon();
  };
  onCleanup(() => clearTimeout(hide));
  const page = () => {
    const ids = adminSubs().map((s) => s.id);
    return ids.includes(sub()) ? sub() : (ids[0] ?? "");
  };
  // Yönetim açılınca ve alt sayfa değişince sayaçlar yenilenir; Deneme PRO açılınca şüpheli sayacı "görüldü" olur
  createEffect(
    on(page, (p, prev) => {
      void refreshAdminBadges().then(() => {
        if (p === "trial") void adminBadgeSeen("trial");
      });
      // Destek / Moderasyon gibi kendi işlemini yapan sayfalardan çıkınca da güncel olsun
      if (prev) refreshAdminBadgesSoon(2500);
    }),
  );
  // Açık kalan sayfada yapılan işlemler (ör. destek talebini yanıtlama) için kısa aralıklı yenileme
  const iv = window.setInterval(() => void refreshAdminBadges(), 20_000);
  onCleanup(() => clearInterval(iv));
  return (
    <div class="page">
      <Show when={msg()}>
        <div class="toast" classList={{ err: msg().startsWith("Hata") }} onClick={() => setMsg("")}>
          {msg()}
        </div>
      </Show>
      <Switch>
        <Match when={page() === "overview"}>
          <Overview />
        </Match>
        <Match when={page() === "revenue"}>
          <AdminRevenue />
        </Match>
        <Match when={page() === "ads"}>
          <AdminAds run={run} />
        </Match>
        <Match when={page() === "coupons"}>
          <AdminCoupons run={run} />
        </Match>
        <Match when={page() === "voicepacks"}>
          <AdminVoicePacks run={run} />
        </Match>
        <Match when={page() === "propromo"}>
          <AdminProPromo run={run} />
        </Match>
        <Match when={page() === "backdrops"}>
          <AdminBackdrops run={run} />
        </Match>
        <Match when={page() === "toplinks"}>
          <AdminTopLinks run={run} />
        </Match>
        <Match when={page() === "translations"}>
          <AdminTranslations run={run} />
        </Match>
        <Match when={page() === "profeatures"}>
          <AdminProFeatures run={run} />
        </Match>
        <Match when={page() === "members"}>
          <Members run={run} />
        </Match>
        <Match when={page() === "support"}>
          <AdminSupport />
        </Match>
        <Match when={page() === "trial"}>
          <AdminTrial run={run} />
        </Match>
        <Match when={page() === "livechat"}>
          <AdminLiveChat run={run} />
        </Match>
        <Match when={page() === "promo"}>
          <AdminPromo run={run} />
        </Match>
        <Match when={page() === "visibility"}>
          <AdminVisibility run={run} />
          <AdminSimIcons run={run} />
        </Match>
        <Match when={page() === "subs"}>
          <Subscriptions />
        </Match>
        <Match when={page() === "devices"}>
          <Devices run={run} />
        </Match>
        <Match when={page() === "plans"}>
          <Plans run={run} />
        </Match>
        <Match when={page() === "notices"}>
          <section class="panel admin-panel">
            <AdminNotices run={run} />
          </section>
        </Match>
        <Match when={page() === "moderation"}>
          <Show when={can("reports.view")}>
            <ModerationPanel />
          </Show>
          <Show when={isAdmin()}>
            <MessageReportsPanel />
          </Show>
          <Show when={isOwner()}>
            <section class="panel admin-panel">
              <OwnerGroups run={run} />
              <ModLogPanel />
            </section>
          </Show>
        </Match>
        <Match when={page() === "messages"}>
          <AdminMessages />
        </Match>
        <Match when={page() === "media"}>
          <section class="panel admin-panel">
            <AdminWatermark run={run} />
            <AdminHosting run={run} />
          </section>
        </Match>
      </Switch>
    </div>
  );
}

function Stat(p: { n: number | string; label: string; cls?: string }) {
  return (
    <div class={`stat ${p.cls ?? ""}`}>
      <b>{p.n}</b>
      <small>{p.label}</small>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Özet
// ---------------------------------------------------------------------------
function Overview() {
  const [stats, { refetch }] = createResource(() => adminStats().catch(() => null));
  const [flagged] = createResource(() => adminDevices("flagged").catch(() => [] as AdminDeviceRow[]));
  const [subs] = createResource(() => adminSubscriptions().catch(() => [] as AdminSub[]));
  const active = () => (subs() ?? []).filter((s) => s.status === "active" || s.status === "on_trial").length;
  const problem = () => (subs() ?? []).filter((s) => s.status === "past_due" || s.status === "unpaid").length;
  return (
    <section class="panel admin-panel">
      <h3>Özet</h3>
      <Show when={(flagged() ?? []).length > 0}>
        <div class="admin-alert">
          <b>{t("{0} hesap cihaz sınırını aştı", (flagged() ?? []).length)}</b>
          <small>Yönetim › Cihazlar bölümünden inceleyebilirsin.</small>
        </div>
      </Show>
      <Show when={stats()} fallback={<p class="muted small">{stats.loading ? "Yükleniyor…" : "İstatistikler okunamadı."}</p>}>
        <div class="stat-grid">
          <Stat n={stats()!.online} label="Şu an çevrimiçi" cls="on" />
          <Stat n={stats()!.racing} label="Şu an yarışta" cls="race" />
          <Stat n={stats()!.active_24h} label="Son 24 saatte kullanan" />
          <Stat n={stats()!.active_30d} label="Son 30 günde kullanan" />
          <Stat n={stats()!.installs} label="Toplam kurulum" />
          <Stat n={stats()!.users} label={t("Kayıtlı üye (+{0} bu hafta)", stats()!.users_7d)} />
          <Stat n={stats()!.pro} label="PRO üye" cls="pro" />
          <Stat n={active()} label="Yenilenen abonelik" cls="pro" />
          <Stat n={problem()} label="Ödeme sorunu olan abonelik" />
          <Stat n={stats()!.admins} label="Yönetici" />
        </div>
        <small class="muted">Kurulum sayısı giriş yapmayanları da içerir; uygulama açıkken 2 dakikada bir sayılır.</small>
      </Show>
      <div class="btns">
        <button class="btn ghost small" onClick={() => refetch()}>
          Yenile
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Üyeler
// ---------------------------------------------------------------------------
function Members(props: { run: Run }) {
  const [groups] = createResource(() => listGroups().catch(() => [] as PermGroup[]));
  // Moderasyon kaydından gelindiyse arama dolu açılır
  const [q, setQ] = createSignal(takeAdminFocus("members")?.q ?? "");
  const [users, setUsers] = createSignal<AdminUser[]>([]);
  const [filter, setFilter] = createSignal<UserFilter>("all");
  const [more, setMore] = createSignal(false);
  const search = (append = false) =>
    props.run(async () => {
      const rows = (await adminUsers(q().trim(), filter(), append ? users().length : 0)) ?? [];
      setUsers(append ? [...users(), ...rows] : rows);
      setMore(rows.length === 50);
    }, "");
  onMount(() => search());
  const [editing, setEditing] = createSignal<AdminUser | null>(null);
  return (
    <section class="panel admin-panel">
      <h3>Üyeler</h3>
      <div class="cm-tabs">
        <For each={[["all", "Tüm kayıtlılar"], ["pro", "PRO üyeler"], ["online", "Çevrimiçi"], ["admin", "Yöneticiler"]] as const}>
          {([id, label]) => (
            <button classList={{ on: filter() === id }} onClick={() => (setFilter(id), search())}>
              {label}
            </button>
          )}
        </For>
      </div>
      <div class="fr-add">
        <input class="input" placeholder="Ad, e-posta ya da iRacing adı" value={q()} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
        <button class="btn" onClick={() => search()}>
          Ara
        </button>
      </div>
      <div class="admin-users">
        <For each={users()}>
          {(u) => {
            const pro = () => !!u.pro_until && new Date(u.pro_until).getTime() > Date.now();
            return (
              <div class="admin-user">
                <div>
                  <b data-no-i18n>{u.display_name || "(adsız)"}</b>
                  <Show when={u.is_owner}>
                    <span class="admin-badge owner">sahip</span>
                  </Show>
                  <Show when={u.is_admin && !u.is_owner}>
                    <span class="admin-badge">yönetici</span>
                  </Show>
                  <For each={(groups() ?? []).filter((g) => (u.groups ?? []).includes(g.id))}>
                    {(g) => (
                      <span class="admin-badge grp" style={{ "--gc": g.color }} data-no-i18n>
                        {g.name}
                      </span>
                    )}
                  </For>
                  <small data-no-i18n>
                    {u.email}
                    {u.iracing_name ? ` · iRacing: ${u.iracing_name}` : ""}
                  </small>
                  <small>{pro() ? t("PRO: {0} ({1})", fmtDate(u.pro_until), u.pro_source ?? "?") : "PRO değil"}</small>
                  <small class="muted">
                    {u.created_at ? t("Kayıt: {0}", fmtDate(u.created_at)) : ""}
                    {u.last_seen ? ` · ${isOnline(u.last_seen) ? t("çevrimiçi") : t("son görülme: {0}", fmtDate(u.last_seen))}` : ""}
                    {u.version ? ` · ${u.version}` : ""}
                  </small>
                </div>
                <div class="btns">
                  <button class="btn small" title="Gün ekle / çıkar, tarih ayarla, süresiz ya da kaldır; istersen kullanıcıya bildir" onClick={() => setEditing(u)}>
                    PRO süresini düzenle
                  </button>
                </div>
                <Show when={isOwner() && !u.is_owner}>
                  <div class="btns owner-row">
                    <button
                      class="btn ghost small"
                      classList={{ danger: u.is_admin }}
                      onClick={() =>
                        props.run(async () => {
                          await ownerSetAdmin(u.id, !u.is_admin);
                          await search();
                        }, u.is_admin ? "Yöneticilik alındı" : "Yönetici yapıldı")
                      }
                    >
                      {u.is_admin ? "Yöneticiliği al" : "Yönetici yap"}
                    </button>
                    <For each={groups() ?? []}>
                      {(g) => {
                        const inG = () => (u.groups ?? []).includes(g.id);
                        return (
                          <button
                            class="btn ghost small grp-toggle"
                            classList={{ on: inG() }}
                            style={{ "--gc": g.color }}
                            onClick={() =>
                              props.run(async () => {
                                await setUserGroup(u.id, g.id, !inG());
                                await search();
                              }, inG() ? "Gruptan çıkarıldı" : "Gruba eklendi")
                            }
                          >
                            <span data-no-i18n>{g.name}</span> {inG() ? "✓" : "+"}
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
      <Show when={more()}>
        <button class="btn ghost small" onClick={() => search(true)}>
          Daha fazla
        </button>
      </Show>
      <Show when={editing()}>
        <ProEditor user={editing()!} run={props.run} onClose={() => setEditing(null)} onDone={() => adminUsers(q().trim(), filter(), 0).then((rows) => rows && setUsers(rows)).catch(() => {})} />
      </Show>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Abonelikler (Lemon Squeezy)
// ---------------------------------------------------------------------------
const STATUS: Record<string, string> = {
  active: "Aktif",
  on_trial: "Deneme",
  past_due: "Ödeme alınamadı",
  unpaid: "Ödenmedi",
  cancelled: "İptal edildi",
  expired: "Süresi doldu",
  paused: "Duraklatıldı",
};

function Subscriptions() {
  const [list, { refetch }] = createResource(() => adminSubscriptions().catch(() => [] as AdminSub[]));
  const [filter, setFilter] = createSignal<"all" | "active" | "issue" | "ended">("all");
  const shown = () =>
    (list() ?? []).filter((s) => {
      if (filter() === "active") return s.status === "active" || s.status === "on_trial";
      if (filter() === "issue") return s.status === "past_due" || s.status === "unpaid" || s.status === "paused";
      if (filter() === "ended") return s.status === "cancelled" || s.status === "expired";
      return true;
    });
  return (
    <section class="panel admin-panel">
      <h3>Abonelikler</h3>
      <p class="muted small">Lemon Squeezy'den gelen abonelikler. Durum değişiklikleri kendiliğinden buraya düşer; PRO süresi de otomatik ayarlanır.</p>
      <div class="cm-tabs">
        <For each={[["all", "Tümü"], ["active", "Yenilenenler"], ["issue", "Sorunlu"], ["ended", "İptal / bitmiş"]] as const}>
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
      <Show when={!list.loading && shown().length === 0}>
        <p class="muted">Abonelik yok.</p>
      </Show>
      <div class="admin-users">
        <For each={shown()}>
          {(s) => (
            <div class="admin-user">
              <div>
                <b data-no-i18n>{s.display_name || s.email || "?"}</b>
                <span class={`sub-badge ${s.status}`}>{STATUS[s.status] ?? s.status}</span>
                <small data-no-i18n>
                  {s.email} · {s.plan}
                </small>
                <small class="muted">
                  <Show when={s.renews_at && (s.status === "active" || s.status === "on_trial")}>{t("Sonraki yenileme: {0}", fmtDate(s.renews_at))} · </Show>
                  <Show when={s.ends_at && s.status !== "active"}>{t("Bitiş: {0}", fmtDate(s.ends_at))} · </Show>
                  {t("PRO bitişi: {0}", fmtDate(s.pro_until))}
                  <Show when={!s.user_id}> · Hesap eşleşmedi (kayıt olunca PRO açılır)</Show>
                </small>
              </div>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cihazlar ve şüpheli durumlar
// ---------------------------------------------------------------------------
function Devices(props: { run: Run }) {
  const [filter, setFilter] = createSignal<DeviceFilter>("flagged");
  const [rows, { refetch }] = createResource(filter, (f) => adminDevices(f).catch(() => [] as AdminDeviceRow[]));
  const limit = () => config()?.device_limit ?? 2;
  return (
    <section class="panel admin-panel">
      <h3>Cihazlar</h3>
      <p class="muted small">
        {t("Bir hesap {0} bilgisayardan fazlasında kullanılırsa sana bildirim ve e-posta gelir. Sadece son 30 günde açılan bilgisayarlar sayılır. Bilgisayar kimliği karma olarak saklanır.", limit())}
      </p>
      <div class="cm-tabs">
        <For each={[["flagged", "Şüpheliler"], ["multi", "Birden çok bilgisayar"], ["all", "Hepsi"]] as const}>
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
        <p class="muted">{filter() === "flagged" ? "Şüpheli hesap yok." : "Kayıt yok."}</p>
      </Show>
      <div class="admin-users">
        <For each={rows() ?? []}>
          {(r) => {
            const pro = () => !!r.pro_until && new Date(r.pro_until).getTime() > Date.now();
            return (
              <div class="admin-user" classList={{ flagged: !!r.flag_id }}>
                <div>
                  <b data-no-i18n>{r.display_name || "(adsız)"}</b>
                  <span class="dev-count" classList={{ over: r.device_count > limit() }}>
                    {t("{0} bilgisayar", r.device_count)}
                  </span>
                  <small data-no-i18n>{r.email}</small>
                  <small>{pro() ? t("PRO: {0}", fmtDate(r.pro_until)) : "PRO değil"}</small>
                </div>
                <div class="dev-list">
                  <For each={r.devices}>
                    {(d) => (
                      <div class="dev-row" classList={{ old: new Date(d.last_seen).getTime() < Date.now() - 30 * 86400_000 }}>
                        <div>
                          <b data-no-i18n>{d.label || "?"}</b>
                          <small class="muted" data-no-i18n>
                            {d.hash.slice(0, 8)} · {d.version}
                          </small>
                          <small class="muted">
                            {t("İlk: {0}", fmtDate(d.first_seen))} · {t("Son: {0}", fmtTime(d.last_seen))}
                          </small>
                        </div>
                        <button
                          class="btn ghost small danger"
                          title="Bu bilgisayarı hesaptan çıkar (kullanıcı tekrar giriş yapınca yeniden eklenir)"
                          onClick={() => props.run(async () => (await adminRemoveDevice(r.user_id, d.hash), refetch()), "Cihaz kaldırıldı")}
                        >
                          Kaldır
                        </button>
                      </div>
                    )}
                  </For>
                </div>
                <div class="btns">
                  <Show when={r.flag_id}>
                    <button class="btn ghost small" onClick={() => props.run(async () => (await adminResolveFlag(r.flag_id!), refetch()), "Uyarı kapatıldı")}>
                      Uyarıyı kapat
                    </button>
                  </Show>
                  <Show when={pro()}>
                    <button
                      class="btn ghost small danger"
                      onClick={() => {
                        if (!confirm(t("{0} hesabının PRO üyeliği kaldırılsın mı?", r.display_name))) return;
                        props.run(async () => (await adminSetPro(r.user_id, null), refetch()), "PRO kaldırıldı");
                      }}
                    >
                      PRO'yu kaldır
                    </button>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Planlar ve fiyatlar
// ---------------------------------------------------------------------------
type PlanKey = Extract<keyof AppConfig, string>;

function Plans(props: { run: Run }) {
  const [draft, setDraft] = createSignal<Record<string, string>>({});
  const c = () => config();
  const val = (k: PlanKey) => draft()[k] ?? (c()?.[k] as string | undefined) ?? "";
  const set = (k: string, v: string) => setDraft({ ...draft(), [k]: v });
  // Otomatik fiyatlar (app_config.pro_pricing): taslakta "pp:<plan>:price" / "pp:<plan>:price_tr" / "pp:currency" / "pp:currency_tr"
  const pp = () => c()?.pro_pricing ?? {};
  const ppNum = (id: PlanDef["id"], f: "price" | "price_tr") => {
    const d = draft()[`pp:${id}:${f}`];
    if (d !== undefined) return d;
    const n = Number(pp().plans?.[id]?.[f]);
    return n > 0 ? String(n) : "";
  };
  const ppCur = (f: "currency" | "currency_tr") => draft()[`pp:${f}`] ?? pp()[f] ?? (f === "currency" ? "USD" : "TRY");
  const toggle = (id: string, on: boolean) => {
    const cur = new Set(c()?.pro_overlays ?? []);
    on ? cur.add(id) : cur.delete(id);
    props.run(() => saveConfig({ pro_overlays: [...cur] }), "PRO overlay listesi kaydedildi");
  };
  return (
    <section class="panel admin-panel">
      <h3>Planlar ve fiyatlar</h3>
      <p class="muted small">
        Lemon Squeezy'de tek bir abonelik ürünü (SRTR Pitwall PRO) ve 4 varyantı (her 1 / 3 / 6 / 12 ayda bir yenilenen, fiyatı önemsiz) açılır; varyant
        numaraları Supabase'de gizli değer olarak girilir. Tutarlar buradan alınır: ödeme sayfası bu tutarla açılır ve yenilemeler de aynı tutarla olur
        (fiyat değişikliği yalnızca yeni aboneliklere uygulanır).
      </p>
      <p class="muted small">
        Türkiye'den kullananlar (saat dilimi Türkiye) Türkiye fiyatını (TL) görür ve öder; diğer herkes genel fiyatı (USD). Türkiye fiyatı boşsa herkes genel fiyatı
        görür.
      </p>
      <div class="plan-edit plan-price">
        <b>Para birimi</b>
        <label class="plan-field">
          <small>Genel para birimi</small>
          <input class="input" maxLength={3} value={ppCur("currency")} onInput={(e) => set("pp:currency", e.currentTarget.value)} />
        </label>
        <label class="plan-field">
          <small>Türkiye para birimi</small>
          <input class="input" maxLength={3} value={ppCur("currency_tr")} onInput={(e) => set("pp:currency_tr", e.currentTarget.value)} />
        </label>
      </div>
      <For each={PLAN_LIST}>
        {(p) => (
          <div class="plan-group">
            <div class="plan-edit plan-price">
              <b>{p.label}</b>
              <label class="plan-field">
                <small>Fiyat (yurt dışı, USD)</small>
                <input class="input" type="text" inputmode="decimal" placeholder="ör. 4.99" value={ppNum(p.id, "price")} onInput={(e) => set(`pp:${p.id}:price`, e.currentTarget.value)} />
              </label>
              <label class="plan-field">
                <small>Türkiye fiyatı (TL)</small>
                <input class="input" type="text" inputmode="decimal" placeholder="ör. 149" value={ppNum(p.id, "price_tr")} onInput={(e) => set(`pp:${p.id}:price_tr`, e.currentTarget.value)} />
              </label>
            </div>
          </div>
        )}
      </For>
      <details class="notes">
        <summary>Elle bağlantı (isteğe bağlı, otomatik fiyat girilmemişse kullanılır)</summary>
        <p class="muted small">{t("Fiyat metni kullanıcıya gösterilir. Ödeme bağlantısı, Lemon Squeezy'de ilgili ürünün Share bölümündeki bağlantıdır; uygulama kullanıcının hesabını otomatik ekler.")}</p>
        <div class="plan-edit plan-edit-head">
          <span />
          <small>Fiyat metni</small>
          <small>Ödeme bağlantısı</small>
        </div>
        <For each={PLAN_LIST}>
          {(p) => (
            <div class="plan-group">
              <div class="plan-edit">
                <b>{p.label}</b>
                <input class="input" placeholder="ör. $4.99 / €4,99" value={val(p.price)} onInput={(e) => set(p.price, e.currentTarget.value)} />
                <input class="input" placeholder="https://….lemonsqueezy.com/checkout/buy/…" value={val(p.checkout)} onInput={(e) => set(p.checkout, e.currentTarget.value)} />
              </div>
              <div class="plan-edit">
                <small class="muted">Türkiye (TL)</small>
                <input class="input" placeholder="ör. 149₺" value={val(p.trPrice)} onInput={(e) => set(p.trPrice, e.currentTarget.value)} />
                <input class="input" placeholder="TL varyantının bağlantısı" value={val(p.trCheckout)} onInput={(e) => set(p.trCheckout, e.currentTarget.value)} />
              </div>
            </div>
          )}
        </For>
      </details>
      <div class="row">
        <div>
          <b>PRO açıklaması</b>
        </div>
        <input class="input admin-wide" placeholder="PRO ile gelenler…" value={val("pro_note")} onInput={(e) => set("pro_note", e.currentTarget.value)} />
      </div>
      <div class="row">
        <div>
          <b>Cihaz sınırı</b>
          <small>Bir hesabın kullanabileceği bilgisayar sayısı; aşılınca sana uyarı gelir</small>
        </div>
        <input
          class="input port"
          type="number"
          min="1"
          max="20"
          value={draft().device_limit ?? String(c()?.device_limit ?? 2)}
          onInput={(e) => set("device_limit", e.currentTarget.value)}
        />
      </div>
      <details class="notes">
        <summary>Eski bağlantılar (Patreon / Ko-fi)</summary>
        <For
          each={
            [
              ["patreon_url", "Patreon bağlantısı"],
              ["kofi_url", "Ko-fi bağlantısı"],
            ] as const
          }
        >
          {([k, label]) => (
            <div class="row">
              <div>
                <b>{label}</b>
              </div>
              <input class="input admin-wide" value={val(k)} onInput={(e) => set(k, e.currentTarget.value)} />
            </div>
          )}
        </For>
      </details>
      <button
        class="btn primary"
        disabled={Object.keys(draft()).length === 0}
        onClick={() =>
          props.run(async () => {
            const d: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(draft())) if (!k.startsWith("pp:")) d[k] = v;
            if (Object.keys(draft()).some((k) => k.startsWith("pp:"))) {
              const money = (v: string) => {
                const n = Math.round(parseFloat(v.replace(",", ".")) * 100) / 100;
                return n > 0 ? n : 0;
              };
              const cur = (v: string, def: string) => v.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || def;
              const plans: NonNullable<ProPricing["plans"]> = {};
              for (const p of PLAN_LIST) plans[p.id] = { price: money(ppNum(p.id, "price")), price_tr: money(ppNum(p.id, "price_tr")) };
              d.pro_pricing = { ...pp(), currency: cur(ppCur("currency"), "USD"), currency_tr: cur(ppCur("currency_tr"), "TRY"), plans } satisfies ProPricing;
            }
            if (d.device_limit !== undefined) d.device_limit = Math.max(1, Math.min(20, Math.round(Number(d.device_limit) || 2)));
            await saveConfig(d);
            setDraft({});
          }, "Kaydedildi")
        }
      >
        Kaydet
      </button>

      <h4>PRO overlay'ler</h4>
      <p class="muted small">İşaretlenen overlay'ler PRO olmayan kullanıcılarda kilitli olur (panelde açılamaz, ekranda görünmez).</p>
      <p class="muted small">Sesli mühendis buradan değil, PRO özellikleri listesinden (Ses › Sesli mühendis ve spotter) yönetilir.</p>
      <div class="admin-ovs">
        <For each={manifests}>
          {(m) => (
            <label class="check">
              <input type="checkbox" checked={(c()?.pro_overlays ?? []).includes(m.id)} onChange={(e) => toggle(m.id, e.currentTarget.checked)} />
              <span>{m.name}</span>
            </label>
          )}
        </For>
      </div>
    </section>
  );
}


