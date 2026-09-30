import { localeTag, t } from "@/sdk/i18n";
import { ModLogPanel, ModerationPanel, OwnerGroups } from "../components/AdminModeration";
import { can, listGroups, ownerSetAdmin, setUserGroup, type PermGroup } from "@/cloud/moderation";
import { AdminHosting, AdminWatermark } from "../components/AdminMedia";
import { AdminNotices } from "../components/AdminNotices";
import { For, Match, Show, Switch, createResource, createSignal, onMount } from "solid-js";
import {
  cloudEnabled,
  conflict,
  lastSync,
  resetPassword,
  verifyCode,
  resendSignupCode,
  updatePassword,
  afterLogin,
  resolveConflict,
  session,
  signIn,
  signOut,
  signUp,
  syncError,
  syncNow,
  syncState,
} from "@/cloud/supabase";
import {
  adminStats,
  adminUsers,
  type UserFilter,
  adminSetPro,
  config,
  entitlement,
  isAdmin,
  isOwner,
  isPro,
  loadConfig,
  profile,
  refreshEntitlement,
  saveConfig,
  updateProfile,
  type AdminUser,
} from "@/cloud/account";
import { useTopic } from "@/sdk/telemetry";
import { manifests } from "@/sdk/registry";
import { openUrl } from "../ui";

const fmtDate = (v: string | number | null | undefined) => (v ? new Date(v).toLocaleDateString(localeTag()) : "—");

export function AccountPage() {
  onMount(() => {
    if (cloudEnabled) refreshEntitlement();
  });
  return (
    <div class="page narrow">
      <Switch>
        <Match when={!cloudEnabled}>
          <section class="panel">
            <h3>Hesap sistemi kapalı</h3>
            <p class="muted">
              Bu derleme bir bulut sunucusuna bağlı değil. Uygulama üyeliksiz tam olarak çalışır; tüm ayarların bu
              bilgisayarda saklanır. Hesap, düzen paylaşımı ve PRO üyelik için Supabase bağlantısı gerekir:{" "}
              <code>docs/SUPABASE.md</code> dosyasındaki adımları uygula ve uygulamayı yeniden derle.
            </p>
          </section>
        </Match>
        <Match when={!session()}>
          <AuthForm />
          <ProPanel />
        </Match>
        <Match when={session()}>
          <Signed />
        </Match>
      </Switch>
    </div>
  );
}

type AuthMode = "in" | "up" | "verify" | "reset" | "resetCode";

/** Supabase hata iletilerini Türkçeleştirir */
function authError(t: string): string {
  if (t === "Invalid login credentials") return "E-posta ya da şifre hatalı.";
  if (/email not confirmed/i.test(t)) return "E-posta henüz onaylanmadı. E-postana gelen kodu gir.";
  if (/token has expired|invalid/i.test(t) && /token|otp/i.test(t)) return "Kod hatalı ya da süresi dolmuş. Yeni kod iste.";
  if (/already registered/i.test(t)) return "Bu e-postayla zaten bir hesap var. Giriş yap ya da şifreni sıfırla.";
  if (/rate limit|too many/i.test(t) || /security purposes/i.test(t)) return "Çok sık denendi. Bir dakika sonra tekrar dene.";
  if (/password should be/i.test(t)) return "Şifre en az 6 karakter olmalı.";
  if (/same.*password/i.test(t)) return "Yeni şifre eskisiyle aynı olamaz.";
  return t;
}

function AuthForm() {
  const [mode, setMode] = createSignal<AuthMode>("in");
  const [email, setEmail] = createSignal("");
  const [name, setName] = createSignal("");
  const [pw, setPw] = createSignal("");
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [msg, setMsg] = createSignal<{ kind: "err" | "ok"; text: string } | null>(null);

  const go = (m: AuthMode, text?: string) => {
    setMode(m);
    setCode("");
    setMsg(text ? { kind: "ok", text } : null);
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      switch (mode()) {
        case "in":
          await signIn(email(), pw());
          await refreshEntitlement();
          break;
        case "up": {
          const needsConfirm = await signUp(email(), pw(), name());
          if (needsConfirm) go("verify", `${email()} adresine 6 haneli bir onay kodu gönderdik.`);
          else await refreshEntitlement();
          break;
        }
        case "verify":
          await verifyCode(email(), code(), "signup");
          await afterLogin();
          await refreshEntitlement();
          break;
        case "reset":
          await resetPassword(email());
          go("resetCode", `${email()} adresine 6 haneli bir kod gönderdik. Kodu ve yeni şifreni gir.`);
          break;
        case "resetCode":
          await verifyCode(email(), code(), "recovery");
          await updatePassword(pw());
          await afterLogin();
          await refreshEntitlement();
          break;
      }
    } catch (err) {
      const t = String((err as Error).message ?? err);
      if (mode() === "in" && /email not confirmed/i.test(t)) {
        await resendSignupCode(email()).catch(() => {});
        go("verify", "Hesabın henüz onaylanmamış. E-postana yeni bir onay kodu gönderdik.");
      } else setMsg({ kind: "err", text: authError(t) });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      if (mode() === "verify") await resendSignupCode(email());
      else await resetPassword(email());
      setMsg({ kind: "ok", text: "Yeni kod gönderildi." });
    } catch (err) {
      setMsg({ kind: "err", text: authError(String((err as Error).message ?? err)) });
    } finally {
      setBusy(false);
    }
  };

  const title = () =>
    ({ in: "Giriş yap", up: "Hesap oluştur", verify: "E-postanı onayla", reset: "Şifremi unuttum", resetCode: "Yeni şifre belirle" })[mode()];
  const button = () =>
    ({ in: "Giriş yap", up: "Kayıt ol", verify: "Onayla ve giriş yap", reset: "Kod gönder", resetCode: "Şifreyi değiştir ve giriş yap" })[mode()];
  const needsPw = () => mode() === "in" || mode() === "up" || mode() === "resetCode";
  const needsCode = () => mode() === "verify" || mode() === "resetCode";

  return (
    <section class="panel">
      <h3>{title()}</h3>
      <Show when={mode() === "in" || mode() === "up"}>
        <p class="muted">
          Giriş yapmak zorunlu değil. Hesapla yerleşimlerin, profillerin ve arkadaş listen buluta kaydedilir; düzenlerini
          paylaşabilir, başkalarınınkini indirebilir ve PRO üyeliği kullanabilirsin.
        </p>
      </Show>
      <form class="auth" onSubmit={submit}>
        <Show when={mode() === "up"}>
          <input class="input" placeholder="Görünen ad (paylaşımlarda görünür)" maxLength={40} required value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </Show>
        <input
          class="input"
          type="email"
          placeholder="E-posta"
          required
          readOnly={needsCode()}
          value={email()}
          onInput={(e) => setEmail(e.currentTarget.value)}
        />
        <Show when={needsCode()}>
          <input
            class="input auth-code"
            inputMode="numeric"
            autocomplete="one-time-code"
            placeholder="6 haneli kod"
            maxLength={10}
            required
            value={code()}
            onInput={(e) => setCode(e.currentTarget.value.replace(/[^0-9]/g, ""))}
          />
        </Show>
        <Show when={needsPw()}>
          <input
            class="input"
            type="password"
            placeholder={mode() === "resetCode" ? "Yeni şifre (en az 6 karakter)" : "Şifre (en az 6 karakter)"}
            minLength={6}
            required
            value={pw()}
            onInput={(e) => setPw(e.currentTarget.value)}
          />
        </Show>
        <button class="btn primary" type="submit" disabled={busy()}>
          {busy() ? "Bekleyin…" : button()}
        </button>
        <Show when={msg()}>
          <p class={msg()!.kind === "err" ? "error" : "success"}>{msg()!.text}</p>
        </Show>
        <div class="auth-links">
          <Show when={needsCode()}>
            <button type="button" class="link" disabled={busy()} onClick={resend}>
              Kod gelmedi mi? Yeniden gönder
            </button>
          </Show>
          <Show
            when={mode() === "in" || mode() === "up"}
            fallback={
              <button type="button" class="link" onClick={() => go("in")}>
                Girişe dön
              </button>
            }
          >
            <button type="button" class="link" onClick={() => go(mode() === "in" ? "up" : "in")}>
              {mode() === "in" ? "Hesabın yok mu? Kayıt ol" : "Zaten hesabın var mı? Giriş yap"}
            </button>
          </Show>
          <Show when={mode() === "in"}>
            <button type="button" class="link" onClick={() => go("reset")}>
              Şifremi unuttum
            </button>
          </Show>
        </div>
      </form>
    </section>
  );
}

function Signed() {
  const stateText = () =>
    ({ idle: "Bekliyor", syncing: "Eşitleniyor…", ok: "Güncel", error: "Hata", conflict: "Karar bekleniyor" })[syncState()];

  return (
    <>
      <ProfilePanel />
      <IracingPanel />
      <ProPanel />
      <section class="panel">
        <h3>Bulut yedeği</h3>
        <div class="row">
          <div>
            <b>{session()!.user.email}</b>
            <small>
              Durum: {stateText()}
              {lastSync() ? ` · Son eşitleme ${new Date(lastSync()).toLocaleString(localeTag())}` : ""}
            </small>
          </div>
          <div class="btns">
            <button class="btn ghost" onClick={() => syncNow()} disabled={syncState() === "syncing"}>
              Şimdi eşitle
            </button>
            <button
              class="btn ghost danger"
              onClick={async () => {
                await signOut();
                await refreshEntitlement();
              }}
            >
              Çıkış yap
            </button>
          </div>
        </div>
        <Show when={syncState() === "error"}>
          <p class="error">{syncError()}</p>
        </Show>
        <p class="muted">Ayarlar değiştikten birkaç saniye sonra otomatik olarak buluta gönderilir.</p>
      </section>
      <Show when={conflict()}>
        <section class="panel warn-panel">
          <h3>Hangi ayarlar kullanılsın?</h3>
          <p class="muted">
            Son eşitlemeden sonra hem bu bilgisayarda hem bulutta değişiklik yapılmış (bulut:{" "}
            {new Date(conflict()!.remoteAt).toLocaleString(localeTag())}).
          </p>
          <div class="btns">
            <button class="btn primary" onClick={() => resolveConflict("local")}>
              Bu bilgisayardakini kullan
            </button>
            <button class="btn ghost" onClick={() => resolveConflict("remote")}>
              Buluttakini kullan
            </button>
          </div>
        </section>
      </Show>
      <Show when={can("reports.view")}>
        <ModerationPanel />
      </Show>
      <Show when={isAdmin()}>
        <AdminPanel />
      </Show>
    </>
  );
}

function ProfilePanel() {
  const [err, setErr] = createSignal("");
  const save = (patch: Parameters<typeof updateProfile>[0]) => updateProfile(patch).then(() => setErr("")).catch((e) => setErr(String(e.message)));
  return (
    <section class="panel">
      <h3>
        Profil
        <Show when={isPro()}>
          <span class="pro-badge">PRO</span>
        </Show>
        <Show when={isAdmin()}>
          <span class="admin-badge">Yönetici</span>
        </Show>
      </h3>
      <Show when={profile()} fallback={<p class="muted">Profil yükleniyor…</p>}>
        <div class="row">
          <div>
            <b>Görünen ad</b>
            <small>Paylaştığın düzenlerde ve yorumlarda görünür</small>
          </div>
          <input class="input" maxLength={40} value={profile()!.display_name} onChange={(e) => save({ display_name: e.currentTarget.value.trim() })} />
        </div>
        <Show when={err()}>
          <p class="error">{err()}</p>
        </Show>
      </Show>
    </section>
  );
}

function IracingPanel() {
  const status = useTopic("status");
  const detected = () => (status()?.connected && !status()?.demo && status()!.userId > 0 ? status()! : null);
  const [err, setErr] = createSignal("");
  const link = async () => {
    const s = detected();
    if (!s) return;
    try {
      await updateProfile({ iracing_id: s.userId, iracing_name: s.userName });
      setErr("");
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  return (
    <section class="panel">
      <h3>iRacing hesabı</h3>
      <Show
        when={profile()?.iracing_id}
        fallback={<p class="muted">Henüz bağlanmadı. iRacing'de bir oturuma girince aşağıdan tek tıkla bağlayabilirsin.</p>}
      >
        <div class="row">
          <div>
            <b>{profile()!.iracing_name}</b>
            <small>Üye no {profile()!.iracing_id}</small>
          </div>
          <button class="btn ghost small" onClick={() => updateProfile({ iracing_id: null, iracing_name: null })}>
            Bağlantıyı kaldır
          </button>
        </div>
      </Show>
      <Show when={detected() && detected()!.userId !== profile()?.iracing_id}>
        <div class="row">
          <div>
            <b>Algılanan: {detected()!.userName}</b>
            <small>Bu bilgisayarda iRacing'de şu an bu hesap açık (üye no {detected()!.userId})</small>
          </div>
          <button class="btn primary" onClick={link}>
            Hesabıma bağla
          </button>
        </div>
      </Show>
      <Show when={err()}>
        <p class="error">{err()}</p>
      </Show>
      <p class="muted small">
        iRacing'in kendi hesabıyla giriş (OAuth) için geliştiricilerin iRacing'den izin alması gerekiyor; iRacing yeni
        uygulama kayıtlarını şu an durdurmuş durumda. O yüzden hesabın, bu bilgisayarda iRacing'e girdiğinde uygulamanın
        okuduğu bilgilerle bağlanır. Paylaştığın düzenlerde iRacing adın görünür, arama da bu adla yapılabilir.
      </p>
    </section>
  );
}

function ProPanel() {
  const [cfg] = createResource(() => config() ?? loadConfig().catch(() => null));
  const c = () => config() ?? cfg();
  const [payEmail, setPayEmail] = createSignal("");
  const locked = () => (c()?.pro_overlays ?? []).map((id) => manifests.find((m) => m.id === id)?.name ?? id);

  return (
    <section class="panel pro-panel">
      <h3>
        PRO üyelik <span class="pro-badge">PRO</span>
      </h3>
      <Show
        when={isPro()}
        fallback={
          <>
            <p>
              PRO üyelik SRTR Pitwall'un geliştirilmesini destekler ve PRO'ya özel overlay'lerin kilidini açar.
              <Show when={locked().length > 0}>
                {" "}
                PRO overlay'ler: <b>{locked().join(", ")}</b>.
              </Show>
            </p>
            <Show when={c()?.pro_note}>
              <p class="muted">{c()!.pro_note}</p>
            </Show>
            <div class="pro-plans">
              <Show when={c()?.price_monthly}>
                <div class="pro-plan">
                  <small>Aylık</small>
                  <b>{c()!.price_monthly}</b>
                </div>
              </Show>
              <Show when={c()?.price_3m}>
                <div class="pro-plan">
                  <small>3 aylık</small>
                  <b>{c()!.price_3m}</b>
                </div>
              </Show>
              <Show when={c()?.price_6m}>
                <div class="pro-plan">
                  <small>6 aylık</small>
                  <b>{c()!.price_6m}</b>
                </div>
              </Show>
              <Show when={c()?.price_yearly}>
                <div class="pro-plan">
                  <small>Yıllık</small>
                  <b>{c()!.price_yearly}</b>
                </div>
              </Show>
            </div>
            <div class="btns">
              <Show when={c()?.patreon_url}>
                <button class="btn primary" onClick={() => openUrl(c()!.patreon_url)}>
                  Patreon'da abone ol
                </button>
              </Show>
              <Show when={c()?.kofi_url}>
                <button class="btn primary" onClick={() => openUrl(c()!.kofi_url)}>
                  Ko-fi'de abone ol
                </button>
              </Show>
            </div>
            <p class="muted small">
              Aboneliği SRTR Pitwall hesabınla <b>aynı e-posta</b> ile yap; PRO birkaç dakika içinde otomatik açılır ve her
              ödemede uzar.
              <Show when={!session()}> Önce yukarıdan hesap oluştur.</Show>
            </p>
          </>
        }
      >
        <p>
          PRO üyesin, teşekkürler!{" "}
          <Show when={!isAdmin()}>
            <span class="muted">
              Geçerlilik: {fmtDate(entitlement().proUntil)} {profile()?.pro_source ? `(${profile()!.pro_source})` : ""}
            </span>
          </Show>
        </p>
      </Show>
      <Show when={session() && profile()}>
        <div class="row">
          <div>
            <b>Ödeme e-postası</b>
            <small>Patreon/Ko-fi'de farklı bir e-posta kullanıyorsan buraya yaz</small>
          </div>
          <div class="mqtt-host">
            <input
              class="input"
              type="email"
              placeholder={session()!.user.email}
              value={payEmail() || profile()!.pay_email || ""}
              onInput={(e) => setPayEmail(e.currentTarget.value)}
            />
            <button class="btn ghost small" onClick={() => updateProfile({ pay_email: payEmail().trim() || null })}>
              Kaydet
            </button>
          </div>
        </div>
        <button class="btn ghost small" onClick={() => refreshEntitlement()}>
          Üyeliği yeniden denetle
        </button>
      </Show>
    </section>
  );
}

function AdminPanel() {
  const [msg, setMsg] = createSignal("");
  const [groups] = createResource(() => listGroups().catch(() => [] as PermGroup[]));
  const [q, setQ] = createSignal("");
  const [users, setUsers] = createSignal<AdminUser[]>([]);
  const [draft, setDraft] = createSignal<Record<string, string>>({});
  const c = () => config();
  const val = (k: "patreon_url" | "kofi_url" | "price_monthly" | "price_3m" | "price_6m" | "price_yearly" | "pro_note") => draft()[k] ?? c()?.[k] ?? "";

  let hide: number | undefined;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      clearTimeout(hide);
      if (ok) hide = window.setTimeout(() => setMsg(""), 3000);
    } catch (e) {
      setMsg("Hata: " + String((e as Error).message));
    }
  };
  const toggle = (id: string, on: boolean) => {
    const cur = new Set(c()?.pro_overlays ?? []);
    on ? cur.add(id) : cur.delete(id);
    run(() => saveConfig({ pro_overlays: [...cur] }), "PRO overlay listesi kaydedildi");
  };
  const [filter, setFilter] = createSignal<UserFilter>("all");
  const [more, setMore] = createSignal(false);
  const [stats, { refetch: refetchStats }] = createResource(() => adminStats().catch(() => null));
  const search = (append = false) =>
    run(async () => {
      const rows = (await adminUsers(q().trim(), filter(), append ? users().length : 0)) ?? [];
      setUsers(append ? [...users(), ...rows] : rows);
      setMore(rows.length === 50);
    }, "");
  onMount(() => search());
  const setPro = (u: AdminUser, days: number | null) =>
    run(async () => {
      await adminSetPro(u.id, days === null ? null : new Date(Date.now() + days * 86400_000));
      await search();
      refetchStats();
    }, days === null ? "PRO kaldırıldı" : `PRO verildi (${days} gün)`);

  return (
    <section class="panel admin-panel">
      <h3>
        Yönetici <span class="admin-badge">sadece sen görürsün</span>
      </h3>
      <Show when={msg()}>
        <div class="toast" classList={{ err: msg().startsWith("Hata") }} onClick={() => setMsg("")}>
          {msg()}
        </div>
      </Show>

      <h4>PRO overlay'ler</h4>
      <p class="muted small">İşaretlenen overlay'ler PRO olmayan kullanıcılarda kilitli olur (panelde açılamaz, ekranda görünmez).</p>
      <div class="admin-ovs">
        <label class="check">
          <input type="checkbox" checked={(c()?.pro_overlays ?? []).includes("voice")} onChange={(e) => toggle("voice", e.currentTarget.checked)} />
          <span>
            <b>Sesli mühendis</b>
          </span>
        </label>
        <For each={manifests}>
          {(m) => (
            <label class="check">
              <input type="checkbox" checked={(c()?.pro_overlays ?? []).includes(m.id)} onChange={(e) => toggle(m.id, e.currentTarget.checked)} />
              <span>{m.name}</span>
            </label>
          )}
        </For>
      </div>

      <h4>Abonelik sayfası</h4>
      <For
        each={
          [
            ["patreon_url", "Patreon bağlantısı", "https://www.patreon.com/..."],
            ["kofi_url", "Ko-fi bağlantısı", "https://ko-fi.com/..."],
            ["price_monthly", "Aylık plan", "ör. 3 € / ay"],
            ["price_3m", "3 aylık plan", "ör. 8 € / 3 ay"],
            ["price_6m", "6 aylık plan", "ör. 15 € / 6 ay"],
            ["price_yearly", "Yıllık plan", "ör. 28 € / yıl"],
            ["pro_note", "PRO açıklaması", "PRO ile gelenler…"],
          ] as const
        }
      >
        {([k, label, ph]) => (
          <div class="row">
            <div>
              <b>{label}</b>
            </div>
            <input class="input admin-wide" placeholder={ph} value={val(k)} onInput={(e) => setDraft({ ...draft(), [k]: e.currentTarget.value })} />
          </div>
        )}
      </For>
      <button
        class="btn primary"
        onClick={() =>
          run(async () => {
            await saveConfig(draft());
            setDraft({});
          }, "Abonelik bilgileri kaydedildi")
        }
        disabled={Object.keys(draft()).length === 0}
      >
        Kaydet
      </button>

      <AdminNotices run={run} />
      <AdminWatermark run={run} />
      <AdminHosting run={run} />

      <Show when={isOwner()}>
        <OwnerGroups run={run} />
        <ModLogPanel />
      </Show>

      <h4>Kullanım</h4>
      <Show when={stats()} fallback={<p class="muted small">{stats.loading ? "Yükleniyor…" : "İstatistikler okunamadı."}</p>}>
        <div class="stat-grid">
          <div class="stat on">
            <b>{stats()!.online}</b>
            <small>Şu an çevrimiçi</small>
          </div>
          <div class="stat race">
            <b>{stats()!.racing}</b>
            <small>Şu an yarışta</small>
          </div>
          <div class="stat">
            <b>{stats()!.active_24h}</b>
            <small>Son 24 saatte kullanan</small>
          </div>
          <div class="stat">
            <b>{stats()!.active_30d}</b>
            <small>Son 30 günde kullanan</small>
          </div>
          <div class="stat">
            <b>{stats()!.installs}</b>
            <small>Toplam kurulum</small>
          </div>
          <div class="stat">
            <b>{stats()!.users}</b>
            <small>{t("Kayıtlı üye (+{0} bu hafta)", stats()!.users_7d)}</small>
          </div>
          <div class="stat pro">
            <b>{stats()!.pro}</b>
            <small>PRO üye</small>
          </div>
          <div class="stat">
            <b>{stats()!.admins}</b>
            <small>Yönetici</small>
          </div>
        </div>
        <small class="muted">Kurulum sayısı giriş yapmayanları da içerir; uygulama açıkken 2 dakikada bir sayılır.</small>
      </Show>
      <div class="btns">
        <button class="btn ghost small" onClick={() => refetchStats()}>
          Yenile
        </button>
      </div>

      <h4>Kullanıcılar</h4>
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
                  <b>{u.display_name || "(adsız)"}</b>
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
                  <small>
                    {u.email}
                    {u.iracing_name ? ` · iRacing: ${u.iracing_name}` : ""}
                  </small>
                  <small>{pro() ? `PRO: ${fmtDate(u.pro_until)} (${u.pro_source ?? "?"})` : "PRO değil"}</small>
                  <small class="muted">
                    {u.created_at ? t("Kayıt: {0}", fmtDate(u.created_at)) : ""}
                    {u.last_seen
                      ? ` · ${new Date(u.last_seen).getTime() > Date.now() - 4 * 60_000 ? t("çevrimiçi") : t("son görülme: {0}", fmtDate(u.last_seen))}`
                      : ""}
                    {u.version ? ` · ${u.version}` : ""}
                  </small>
                </div>
                <div class="btns">
                  <button class="btn ghost small" onClick={() => setPro(u, 31)}>
                    1 ay
                  </button>
                  <button class="btn ghost small" onClick={() => setPro(u, 92)}>
                    3 ay
                  </button>
                  <button class="btn ghost small" onClick={() => setPro(u, 183)}>
                    6 ay
                  </button>
                  <button class="btn ghost small" onClick={() => setPro(u, 366)}>
                    1 yıl
                  </button>
                  <button class="btn ghost small" onClick={() => setPro(u, 36500)}>
                    Süresiz
                  </button>
                  <Show when={pro()}>
                    <button class="btn ghost small danger" onClick={() => setPro(u, null)}>
                      Kaldır
                    </button>
                  </Show>
                </div>
                <Show when={isOwner() && !u.is_owner}>
                  <div class="btns owner-row">
                    <button
                      class="btn ghost small"
                      classList={{ danger: u.is_admin }}
                      onClick={() =>
                        run(async () => {
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
                              run(async () => {
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
    </section>
  );
}

/** Sol menüdeki PRO sayfası */
export function ProPage() {
  onMount(() => {
    if (cloudEnabled) refreshEntitlement();
  });
  return (
    <div class="page narrow">
      <ProPanel />
      <section class="panel">
        <h3>PRO ile gelenler</h3>
        <ul class="pro-list">
          <li>
            <b>Sesli spotter ve mühendis</b> — "solda araç", "üç araç yan yana", bayraklar, yakıt, pozisyon, kalan tur…
            Türkçe ses paketiyle.
          </li>
          <li>
            <b>PRO overlay'ler</b> — yöneticinin PRO'ya ayırdığı overlay'ler.
          </li>
          <li>
            <b>Geliştirmeye destek</b> — yeni özellikler ve simülasyonlar.
          </li>
        </ul>
      </section>
    </div>
  );
}
