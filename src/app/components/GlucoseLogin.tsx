// "Kan Şekeri" overlay'inin giriş kutusu (overlay ayarlarının en üstünde): kaynak seç, giriş yap / çıkış yap.
// Bilgiler Rust tarafına verilir ve yalnızca bu bilgisayarda şifreli saklanır (ayarlara / buluta yazılmaz).
import { Show, createSignal } from "solid-js";
import { t } from "@/sdk/i18n";
import { inTauri } from "@/sdk/platform";
import { glucoseLogin, glucoseLogout, useGlucose, type GlucoseSource } from "@/sdk/glucose";
import { Section } from "./OverlaySettings";

const SOURCES: { id: GlucoseSource; label: string }[] = [
  { id: "libre", label: "FreeStyle Libre (LibreLinkUp)" },
  { id: "dexcom", label: "Dexcom (Share)" },
  { id: "nightscout", label: "Nightscout" },
];
const NAMES: Record<string, string> = { libre: "LibreLinkUp", dexcom: "Dexcom", nightscout: "Nightscout" };

/** Rust tarafından dönen hata / bilgi metinleri (çeviri kataloğuna girsin diye burada da durur) */
export const GLUCOSE_MESSAGES = [
  "E-posta ya da şifre hatalı",
  "LibreLinkUp sunucusuna ulaşılamadı",
  "LibreLinkUp yanıtı okunamadı",
  "LibreLinkUp bölgesi belirlenemedi",
  "LibreLinkUp girişi başarısız",
  "LibreLinkUp oturumu açılamadı",
  "Çok fazla deneme yapıldı: birkaç dakika sonra tekrar dene",
  "Çok fazla deneme yapıldı: bir süre sonra tekrar dene",
  "LibreLinkUp uygulamasını açıp bekleyen adımı (kullanım koşulları / doğrulama) tamamla, sonra tekrar dene",
  "Hesap geçici olarak kilitlendi: bir süre sonra tekrar dene",
  "Bu LibreLinkUp hesabı kimseyi takip etmiyor: sensör sahibinin LibreLink uygulamasından davet gönderilmeli",
  "Sensörden henüz veri gelmedi",
  "Dexcom sunucusuna ulaşılamadı",
  "Kullanıcı adı ya da şifre hatalı (bölgeyi de kontrol et)",
  "Dexcom hatası",
  "Dexcom oturumu açılamadı",
  "Son 3 saatte veri yok (Dexcom uygulamasında Share açık ve en az bir takipçi ekli olmalı)",
  "Nightscout'ta ölçüm bulunamadı",
  "Nightscout adresine ulaşılamadı",
  "Nightscout erişim belirteci (token) geçersiz ya da gerekli",
  "Nightscout yanıtı okunamadı",
  "Nightscout adresi gerekli",
  "Nightscout adresi geçersiz",
  "E-posta / kullanıcı adı ve şifre gerekli",
  "Giriş bilgileri çok uzun",
  "Kaynak seçilmedi",
  "Okuma hatası",
];

export function GlucoseLoginPanel() {
  const st = useGlucose(() => false);
  const [source, setSource] = createSignal<GlucoseSource>("libre");
  const [user, setUser] = createSignal("");
  const [pass, setPass] = createSignal("");
  const [region, setRegion] = createSignal("ous");
  const [url, setUrl] = createSignal("");
  const [token, setToken] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");

  const login = async () => {
    if (busy()) return;
    setErr("");
    setBusy(true);
    try {
      await glucoseLogin({ source: source(), user: user(), password: pass(), region: region(), ns_url: url(), ns_token: token() });
      // Şifre ve belirteç bellekte kalmasın
      setPass("");
      setToken("");
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setErr("");
    await glucoseLogout().catch((e) => setErr(String((e as Error)?.message ?? e)));
  };
  const enter = (e: KeyboardEvent) => e.key === "Enter" && void login();

  return (
    <Section title="Sensör hesabı">
      <Show when={inTauri} fallback={<p class="f2-hint">Giriş yalnızca masaüstü uygulamasında yapılır.</p>}>
        <Show
          when={!st().loggedIn}
          fallback={
            <div class="f2 gl-acct">
              <div class="gl-acct-row">
                <span class="gl-acct-dot" classList={{ err: !!st().error }} />
                <span data-no-i18n>
                  <b>{NAMES[st().source] ?? st().source}</b> · {st().account}
                </span>
              </div>
              <small class="f2-hint">
                {st().error ? t(st().error) : st().value != null ? t("Bağlı: son ölçüm {0}", new Date(st().ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })) : t("Bağlı: overlay ekrandayken ölçüm okunur")}
              </small>
              <button class="btn small" onClick={logout}>
                Çıkış yap
              </button>
            </div>
          }
        >
          <div class="f2">
            <div class="f2-cap">Sensör / kaynak</div>
            <select class="input" value={source()} onChange={(e) => (setSource(e.currentTarget.value as GlucoseSource), setErr(""))} data-no-i18n>
              {SOURCES.map((s) => (
                <option value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <Show when={source() !== "nightscout"}>
            <div class="f2">
              <div class="f2-cap">{source() === "dexcom" ? t("Dexcom kullanıcı adı / e-posta") : t("LibreLinkUp e-posta")}</div>
              <input class="input f2-text" type="email" autocomplete="off" spellcheck={false} value={user()} onInput={(e) => setUser(e.currentTarget.value)} onKeyDown={enter} />
            </div>
            <div class="f2">
              <div class="f2-cap">Şifre</div>
              <input class="input f2-text" type="password" autocomplete="off" value={pass()} onInput={(e) => setPass(e.currentTarget.value)} onKeyDown={enter} />
            </div>
          </Show>
          <Show when={source() === "dexcom"}>
            <div class="f2">
              <div class="f2-cap">Bölge</div>
              <select class="input" value={region()} onChange={(e) => setRegion(e.currentTarget.value)}>
                <option value="ous">ABD dışı (Avrupa, Türkiye ...)</option>
                <option value="us">ABD</option>
                <option value="jp">Japonya</option>
              </select>
            </div>
          </Show>
          <Show when={source() === "nightscout"}>
            <div class="f2">
              <div class="f2-cap">Nightscout adresi</div>
              <input class="input f2-text" type="url" autocomplete="off" spellcheck={false} placeholder="https://siteniz.example.com" value={url()} onInput={(e) => setUrl(e.currentTarget.value)} onKeyDown={enter} />
            </div>
            <div class="f2">
              <div class="f2-cap">Erişim belirteci (token, gerekiyorsa)</div>
              <input class="input f2-text" type="password" autocomplete="off" value={token()} onInput={(e) => setToken(e.currentTarget.value)} onKeyDown={enter} />
            </div>
          </Show>
          <div class="f2">
            <button class="btn primary" disabled={busy()} onClick={login}>
              {busy() ? t("Giriş yapılıyor…") : t("Giriş yap")}
            </button>
            <Show when={err()}>
              <p class="error">{t(err())}</p>
            </Show>
            <small class="f2-hint">
              <Show when={source() === "libre"}>Sensörü takip eden LibreLinkUp (takipçi) hesabının bilgilerini gir. </Show>
              <Show when={source() === "dexcom"}>Dexcom uygulamasında Share açık ve en az bir takipçi ekli olmalı. </Show>
              Giriş bilgileri yalnızca bu bilgisayarda, şifreli saklanır; buluta, yedeğe ve diğer cihazlara gönderilmez.
            </small>
          </div>
        </Show>
        <small class="f2-hint">Bu overlay tıbbi cihaz değildir: değerler gecikmeli olabilir. Tedavi kararlarını sensörünün resmi uygulamasına göre ver.</small>
      </Show>
    </Section>
  );
}
