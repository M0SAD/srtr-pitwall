import { localeTag, t } from "@/sdk/i18n";
import { For, Match, Show, Switch, createResource, createSignal, onMount, createEffect } from "solid-js";
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
  settingsHistory,
  restoreSettingsVersion,
  localBackup,
  restoreLocalBackup,
  type SettingsVersion,
  syncState,
} from "@/cloud/supabase";
import {
  checkoutUrl,
  config,
  entitlement,
  isAdmin,
  isPro,
  loadConfig,
  loadProInfo,
  proDaysLeft,
  proExpiringSoon,
  promoActive,
  promoUntil,
  proInfo,
  profile,
  refreshEntitlement,
  updateProfile,
  PLAN_LIST,
  payGroupsShown,
  payMethods,
  planFor,
  isProCheckout,
  startProCheckout,
  checkoutPaid,
  checkoutGift,
  myGifts,
  cancelGift,
  portalUrl,
  SUB_LIVE,
  type AppConfig,
  type GiftSent,
} from "@/cloud/account";
import { findPeople, hashColor, initialOf, type Person } from "@/cloud/social";
import { useTopic } from "@/sdk/telemetry";
import { manifests } from "@/sdk/registry";
import { openUrl } from "../ui";
import { AdSlot } from "../components/AdSlot";
import { EmailPrefsPanel } from "../components/EmailPrefsPanel";
import { PublicProfilePanel } from "../components/Profile";
import { DemoShowcaseToggle } from "../components/DemoShowcaseToggle";
import { PayCats } from "../components/PayCats";
import { CouponBox, CouponPrice, couponFor } from "../components/CouponBox";
import { ProPromoCard } from "../components/ProPromoCard";

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
      <AdSlot placement="panel_banner" />
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
      <PublicProfilePanel />
      <IracingPanel />
      <EmailPrefsPanel />
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
        <p class="muted">
          Bütün ayarların (düzenler, overlay ayarları, tema, ses çıkışı seçimleri, kısayollar) hesabına kaydedilir; değişikliklerden kısa süre sonra kendiliğinden
          gönderilir. Uygulamayı sıfırdan kurup hesabına girdiğinde hepsi geri gelir.
        </p>
        <SettingsVersions />
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
    </>
  );
}

/** Hesaptaki ayarların önceki sürümleri + bu bilgisayardaki giriş öncesi yedek: yanlışlıkla silinen düzenleri geri almak için */
function SettingsVersions() {
  const [open, setOpen] = createSignal(false);
  const [list, { refetch }] = createResource(open, (o) => (o ? settingsHistory().catch(() => [] as SettingsVersion[]) : []));
  const [busy, setBusy] = createSignal(false);
  const [msg, setMsg] = createSignal("");
  const when = (s: string | number) => new Date(s).toLocaleString(localeTag(), { dateStyle: "short", timeStyle: "short" });
  const run = async (fn: () => Promise<void>) => {
    if (busy() || !confirm(t("Şimdiki ayarların yerine bu sürüm yüklensin mi? Şimdiki halin de önceki sürümler arasında saklanır."))) return;
    setBusy(true);
    setMsg("");
    try {
      await fn();
      setMsg(t("Ayarlar geri yüklendi"));
      void refetch();
    } catch (e) {
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="setver">
      <button class="btn ghost small" onClick={() => setOpen(!open())}>
        {open() ? "Önceki sürümleri gizle" : "Ayarların önceki sürümleri"}
      </button>
      <Show when={open()}>
        <p class="muted small">
          Hesabındaki ayar kaydı değiştikçe eski hali burada saklanır (son 8 sürüm). Düzenlerin kaybolduysa buradan geri yükleyebilirsin.
        </p>
        <Show when={localBackup()}>
          {(b) => (
            <div class="setver-row">
              <span>
                <b>Bu bilgisayardaki yedek</b>
                <small class="muted">
                  {when(b().at)} · {t("{0} düzen", Object.keys(b().data.profiles ?? {}).length)}
                </small>
              </span>
              <button class="btn small" disabled={busy()} onClick={() => run(restoreLocalBackup)}>
                Geri yükle
              </button>
            </div>
          )}
        </Show>
        <For each={list() ?? []} fallback={<p class="muted small">{list.loading ? "Yükleniyor…" : "Hesapta saklanan önceki sürüm yok."}</p>}>
          {(v) => (
            <div class="setver-row">
              <span>
                <b>{when(v.updated_at)}</b>
                <small class="muted">
                  {t("{0} düzen", v.profiles)} · {t("{0} açık overlay", v.overlays)} · {Math.round(v.bytes / 1024)} KB
                </small>
              </span>
              <button class="btn small" disabled={busy()} onClick={() => run(() => restoreSettingsVersion(v.id))}>
                Geri yükle
              </button>
            </div>
          )}
        </For>
        <Show when={msg()}>
          <p class="small">{msg()}</p>
        </Show>
      </Show>
    </div>
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
  createEffect(() => {
    const s = detected();
    if (s && profile() && !profile()!.iracing_id) void link();
  });
  return (
    <section class="panel">
      <h3>iRacing hesabı</h3>
      <Show
        when={profile()?.iracing_id}
        fallback={<p class="muted">Henüz bağlanmadı. iRacing'e bağlandığında (bir oturuma girdiğinde) iRacing adın ve üye numaran buraya kendiliğinden yazılır.</p>}
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
        SRTR Pitwall iRacing'den veri almaya başlayınca (bu bilgisayarda iRacing'de hangi hesap açıksa) adını ve üye
        numaranı hesabına otomatik bağlar. Adın paylaştığın düzenlerde görünür ve arkadaşların seni bu adla bulabilir.
      </p>
    </section>
  );
}



function ProPanel() {
  const [cfg] = createResource(() => config() ?? loadConfig().catch(() => null));
  const c = () => config() ?? cfg();
  const [payEmail, setPayEmail] = createSignal("");
  const locked = () => (c()?.pro_overlays ?? []).map((id) => manifests.find((m) => m.id === id)?.name ?? id);
  onMount(() => loadProInfo());
  const plans = () => PLAN_LIST.map((p) => ({ ...p, ...planFor(c(), p) })).filter((p) => p.price || p.checkout);
  const sub = () => proInfo()?.sub ?? null;
  // Abonelik yönetimi: Lemon kalıcı portal bağlantısı verir; Paddle'da her tıklamada kısa ömürlü oturum açılır
  const [portalBusy, setPortalBusy] = createSignal(false);
  const [portalErr, setPortalErr] = createSignal("");
  const manage = async () => {
    const s = sub();
    if (!s) return;
    if (s.provider !== "paddle") return openUrl(s.portal_url);
    setPortalBusy(true);
    setPortalErr("");
    try {
      openUrl(await portalUrl());
    } catch (e) {
      setPortalErr(String((e as Error).message ?? e));
    } finally {
      setPortalBusy(false);
    }
  };
  const days = () => proDaysLeft();
  const [buying, setBuying] = createSignal("");
  const [buyErr, setBuyErr] = createSignal("");
  const buy = async (id: (typeof PLAN_LIST)[number]["id"], link: string) => {
    setBuyErr("");
    if (!isProCheckout(link)) return openUrl(checkoutUrl(link));
    setBuying(id);
    try {
      await startProCheckout(id, undefined, couponFor(id)?.code);
    } catch (e) {
      setBuyErr(String((e as Error).message ?? e));
    } finally {
      setBuying("");
    }
  };

  return (
    <section class="panel pro-panel">
      <h3>
        PRO üyelik <span class="pro-badge">PRO</span>
      </h3>
      <ProPromoCard />
      <Show when={promoActive()}>
        <p class="pro-promo" style={{ padding: "10px 12px", border: "1px solid #3ddc84", "border-radius": "8px", background: "color-mix(in srgb, #3ddc84 8%, transparent)", color: "#bff5d5" }}>
          <b>{t("Ücretsiz PRO kampanyası: {0} tarihine kadar tüm PRO özellikleri herkese açık!", new Date(promoUntil()).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" }))}</b>
          <Show when={c()?.promo_note}>
            <br />
            <span class="muted">{c()!.promo_note}</span>
          </Show>
        </p>
      </Show>
      <Show
        when={isPro()}
        fallback={
          <>
            <p>
              PRO üyelik SRTR Pitwall'un geliştirilmesini destekler ve PRO'ya özel özelliklerin kilidini açar.
              <Show when={locked().length > 0}>
                {" "}
                PRO overlay'ler: <b>{locked().join(", ")}</b>.
              </Show>
            </p>
            <Show when={c()?.pro_note}>
              <p class="muted">{c()!.pro_note}</p>
            </Show>
          </>
        }
      >
        <div class="pro-status" classList={{ warn: proExpiringSoon() }}>
          <Show
            when={!isAdmin()}
            fallback={
              <p>
                PRO üyesin, teşekkürler! <span class="muted">Yönetici hesabında PRO süresizdir.</span>
              </p>
            }
          >
            <p>
              <b>PRO üyesin, teşekkürler!</b>
            </p>
            <Show when={days() !== null} fallback={<p class="muted">PRO süresiz.</p>}>
              <div class="pro-left">
                <b>{t("{0} gün kaldı", days() ?? 0)}</b>
                <small>{t("Bitiş: {0}", fmtDate(entitlement().proUntil))}</small>
              </div>
            </Show>
            <Show when={sub()}>
              <p class="muted small">
                <Show
                  when={proInfo()?.renewing}
                  fallback={
                    <>
                      {sub()!.status === "cancelled" ? "Abonelik iptal edildi; ödediğin dönemin sonuna kadar PRO sürer." : t("Abonelik durumu: {0}", sub()!.status)}
                    </>
                  }
                >
                  {t("Otomatik yenileniyor · sonraki ödeme: {0}", fmtDate(sub()!.renews_at))}
                </Show>
              </p>
            </Show>
            <Show when={proInfo()?.gift}>
              <p class="gift-from">
                {t("🎁 {0} tarafından hediye edildi", proInfo()!.gift!.gifted_by_name || "?")}
                <Show when={proInfo()!.gift!.status === "cancelled"}>
                  <br />
                  <small class="muted">{t("Hediye sonlandırıldı; PRO {0} tarihine kadar sürer.", fmtDate(entitlement().proUntil))}</small>
                </Show>
              </p>
            </Show>
            <Show when={proExpiringSoon()}>
              <p class="pro-warn">PRO üyeliğin yakında bitiyor. Aşağıdan yenileyebilirsin.</p>
            </Show>
          </Show>
          <DemoShowcaseToggle />
        </div>
      </Show>

      {/* Satın alma / süre uzatma her zaman görünür (PRO iken süre üstüne eklenir) */}
      <div class="pro-buy">
        <Show when={isPro()}>
          <p class="pro-extend-cap">
            <b>Süreni uzat</b>{" "}
            <span class="muted small">
              {isAdmin() ? "Yönetici hesabında gerekmez; kullanıcılar bu bölümü böyle görür." : "Satın aldığın süre kalan sürenin üstüne eklenir."}
            </span>
          </p>
        </Show>
        <Show when={plans().length > 0}>
          <Show when={session() && !payMethods(c()).hide_coupon && plans().some((p) => isProCheckout(p.checkout))}>
            <CouponBox />
          </Show>
          <div class="pro-plans">
            <For each={plans()}>
              {(p) => (
                <div class="pro-plan">
                  <small>{p.label}</small>
                  <CouponPrice plan={p.id} price={p.price} />
                  <button
                    class="btn primary small"
                    disabled={!session() || !p.checkout || !!buying()}
                    title={!session() ? "Önce giriş yap" : ""}
                    onClick={() => buy(p.id, p.checkout)}
                  >
                    {buying() === p.id ? "Açılıyor…" : isPro() ? "Uzat" : "Abone ol"}
                  </button>
                </div>
              )}
            </For>
          </div>
          <Show when={buyErr()}>
            <p class="error">{buyErr()}</p>
          </Show>
          <Show when={checkoutPaid()}>
            <p class="ok" style={{ color: "#3ddc84" }}>
              {checkoutGift()
                ? t("Hediye ödemen alındı, teşekkürler! PRO birkaç saniye içinde alıcının hesabına işlenir.")
                : t("Ödemen alındı, teşekkürler! PRO birkaç saniye içinde hesabına işlenir.")}
            </p>
          </Show>
        </Show>
        <div class="btns">
        </div>
        {/* Yöneticinin ödeme kategorileri (ör. ByNoGame): plan kartı görünümünde bağlantılar. PRO elle tanımlanır. */}
        <PayCats cfg={c} open={openUrl} />
        <Show when={!session() && (plans().length > 0 || payGroupsShown(c()).length > 0)}>
          <p class="muted small">Önce hesap oluştur ya da giriş yap.</p>
        </Show>
        <div class="btns">
          <button class="btn ghost small" onClick={() => openUrl("https://pitwall.simracetr.com/hesap.html")}>
            Web sitesinde hesabım
          </button>
        </div>
      </div>
      <Show when={session()}>
        <GiftPanel cfg={c} />
      </Show>
      <Show when={sub()?.portal_url || sub()?.provider === "paddle"}>
        <div class="btns">
          <button class="btn ghost" disabled={portalBusy()} onClick={() => void manage()}>
            {portalBusy() ? "Bekleyin…" : "Aboneliği yönet (kart, fatura, iptal)"}
          </button>
        </div>
        <Show when={portalErr()}>
          <p class="error small">{portalErr()}</p>
        </Show>
      </Show>

      <Show when={session() && profile()}>
        <div class="row">
          <div>
            <b>Ödeme e-postası</b>
            <small>Ödemeyi farklı bir e-postayla yaptıysan buraya yaz</small>
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
        <button
          class="btn ghost small"
          onClick={async () => {
            await refreshEntitlement();
            await loadProInfo();
          }}
        >
          Üyeliği yeniden denetle
        </button>
      </Show>
    </section>
  );
}

/** Hediye PRO: üye ara, plan seç, öde; hediye ettiklerimi listele ve sonlandır */
function GiftPanel(props: { cfg: () => AppConfig | null | undefined }) {
  const [open, setOpen] = createSignal(false);
  const [q, setQ] = createSignal("");
  const [res, setRes] = createSignal<Person[] | null>(null);
  const [to, setTo] = createSignal<Person | null>(null);
  const [searching, setSearching] = createSignal(false);
  const [buying, setBuying] = createSignal("");
  const [err, setErr] = createSignal("");
  const [ask, setAsk] = createSignal<string | null>(null);
  const [ending, setEnding] = createSignal("");
  const [gifts, { refetch }] = createResource(
    () => session()?.user.id,
    () => myGifts().catch(() => [] as GiftSent[]),
  );
  const me = () => session()?.user.id ?? "";
  const plans = () => PLAN_LIST.map((p) => ({ ...p, ...planFor(props.cfg(), p) })).filter((p) => isProCheckout(p.checkout));

  // Hediye ödemesi bitince listeyi birkaç kez yenile (webhook gecikmesi)
  createEffect(() => {
    if (checkoutPaid() && checkoutGift()) for (const ms of [3000, 8000, 14000]) setTimeout(() => refetch(), ms);
  });

  const search = async () => {
    const v = q().trim();
    if (v.length < 2) return;
    setSearching(true);
    setErr("");
    try {
      setRes(((await findPeople(v)) ?? []).filter((p) => p.id !== me()));
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setSearching(false);
    }
  };
  const buy = async (id: (typeof PLAN_LIST)[number]["id"]) => {
    const r = to();
    if (!r) return;
    setErr("");
    setBuying(id);
    try {
      await startProCheckout(id, r.id, couponFor(id, true)?.code);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBuying("");
    }
  };
  const end = async (g: GiftSent) => {
    setEnding(g.lemon_id);
    setErr("");
    try {
      await cancelGift(g.lemon_id);
      setAsk(null);
      await refetch();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setEnding("");
    }
  };
  const Avatar = (p: { id: string | null; name: string }) => (
    <span class="gift-av" style={{ background: hashColor(p.id || "?") }} data-no-i18n>
      {initialOf(p.name)}
    </span>
  );

  return (
    <div class="gift-box">
      <div class="row">
        <div>
          <b>🎁 Hediye PRO</b>
          <small>Kayıtlı bir üyeye PRO aboneliği hediye et. Ödemeyi sen yaparsın, istediğin zaman sonlandırabilirsin.</small>
        </div>
        <button class="btn ghost" onClick={() => setOpen(!open())}>
          {open() ? "Kapat" : "Hediye et"}
        </button>
      </div>
      <Show when={open()}>
        <div class="gift-inline">
          <Show when={plans().length > 0 || payGroupsShown(props.cfg()).length > 0} fallback={<p class="muted small">Hediye PRO şu an kullanılamıyor.</p>}>
            <Show
              when={to()}
              fallback={
                <>
                  <div class="fr-add">
                    <input
                      class="input"
                      placeholder="Üye ara (görünen ad ya da iRacing adı)"
                      maxLength={40}
                      value={q()}
                      ref={(el) => setTimeout(() => el.focus())}
                      onInput={(e) => setQ(e.currentTarget.value)}
                      onKeyDown={(e) => e.key === "Enter" && search()}
                    />
                    <button class="btn small" disabled={searching() || q().trim().length < 2} onClick={search}>
                      Ara
                    </button>
                  </div>
                  <Show when={res() && res()!.length === 0}>
                    <p class="muted small">Kimse bulunamadı. Adın en az 2 harfini yaz.</p>
                  </Show>
                  <div class="gift-list">
                    <For each={res() ?? []}>
                      {(p) => (
                        <div class="gift-row">
                          <Avatar id={p.id} name={p.display_name} />
                          <div class="gift-main">
                            <b data-no-i18n>{p.display_name || "?"}</b>
                            <Show when={p.iracing_name}>
                              <small class="muted" data-no-i18n>
                                iRacing: {p.iracing_name}
                              </small>
                            </Show>
                          </div>
                          <button class="btn primary small" onClick={() => setTo(p)}>
                            Seç
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </>
              }
            >
              <div class="gift-row gift-sel">
                <Avatar id={to()!.id} name={to()!.display_name} />
                <div class="gift-main">
                  <small class="muted">Alıcı</small>
                  <b data-no-i18n>{to()!.display_name || "?"}</b>
                </div>
                <button class="btn ghost small" disabled={!!buying()} onClick={() => setTo(null)}>
                  Değiştir
                </button>
              </div>
              <Show when={plans().length > 0}>
              <div class="pro-plans">
                <For each={plans()}>
                  {(p) => (
                    <div class="pro-plan">
                      <small>{p.label}</small>
                      <CouponPrice plan={p.id} price={p.price} gift />
                      <button class="btn primary small" disabled={!!buying()} onClick={() => buy(p.id)}>
                        {buying() === p.id ? "Açılıyor…" : "Hediye et"}
                      </button>
                    </div>
                  )}
                </For>
              </div>
              <p class="muted small">
                Ödeme sayfasında senin e-postan kullanılır; fatura ve yenileme ödemeleri sana aittir. Alıcının e-postası kimseyle
                paylaşılmaz. Alıcının PRO süresi varsa hediye üstüne eklenir.
              </p>
              </Show>
              <PayCats cfg={props.cfg} open={openUrl} badges={false} gift={() => to()?.display_name || "?"} />
            </Show>
          </Show>
        </div>
      </Show>
      <Show when={err()}>
        <p class="error">{err()}</p>
      </Show>
      <Show when={(gifts() ?? []).length > 0}>
        <h4 class="gift-h">Hediye ettiğim abonelikler</h4>
        <div class="gift-list">
          <For each={gifts() ?? []}>
            {(g) => {
              const live = () => SUB_LIVE.includes(g.status);
              return (
                <div class="gift-row">
                  <Avatar id={g.recipient} name={g.recipient_name} />
                  <div class="gift-main">
                    <b data-no-i18n>{g.recipient_name || "?"}</b>
                    <small>
                      <span data-no-i18n>{g.plan || "—"}</span>
                      {" · "}
                      <Show
                        when={live()}
                        fallback={
                          <span class="muted">
                            {g.status === "cancelled" ? t("İptal edildi – bitiş {0}", fmtDate(g.ends_at ?? g.until)) : "Sona erdi"}
                          </span>
                        }
                      >
                        <span class="gift-ok">aktif</span>
                      </Show>
                    </small>
                    <Show when={live() && g.renews_at}>
                      <small class="muted">{t("Sonraki yenileme: {0}", fmtDate(g.renews_at))}</small>
                    </Show>
                    <Show when={ask() === g.lemon_id}>
                      <small>{t("Hediye sonlandırılsın mı? Artık yenilenmez; {0} ödenen dönemin sonuna kadar PRO kalır.", g.recipient_name || "?")}</small>
                      <div class="btns">
                        <button class="btn ghost danger small" disabled={ending() === g.lemon_id} onClick={() => end(g)}>
                          {ending() === g.lemon_id ? "Bekleyin…" : "Evet, sonlandır"}
                        </button>
                        <button class="btn ghost small" disabled={ending() === g.lemon_id} onClick={() => setAsk(null)}>
                          Vazgeç
                        </button>
                      </div>
                    </Show>
                  </div>
                  <Show when={live() && ask() !== g.lemon_id}>
                    <button class="btn ghost small" onClick={() => setAsk(g.lemon_id)}>
                      Sonlandır
                    </button>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
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
