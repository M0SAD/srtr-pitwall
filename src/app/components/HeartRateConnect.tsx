// "Nabız" overlay'inin bağlantı kutusu (overlay ayarlarının en üstünde): kaynak seç, bağlan / bağlantıyı kes.
// Belirteç ve anahtar Rust tarafına verilir, yalnızca bu bilgisayarda şifreli saklanır.
import { For, Show, createResource, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { t } from "@/sdk/i18n";
import { inTauri } from "@/sdk/platform";
import { HR_STALE_MS, heartConnect, heartDisconnect, useHeartRate, type HeartSource } from "@/sdk/heartrate";
import { Section } from "./OverlaySettings";
import { CopyUrl, type ServerInfo } from "./ServerPanel";

const SOURCES: { id: HeartSource; label: string }[] = [
  { id: "pulsoid", label: "Pulsoid" },
  { id: "hyperate", label: "HypeRate" },
  { id: "local", label: "Yerel gönderim (Health Data Server, HeartRateOnStream ...)" },
];
const NAMES: Record<string, string> = { pulsoid: "Pulsoid", hyperate: "HypeRate", local: "Yerel gönderim" };

/** Rust tarafından dönen ileti metinleri (çeviri kataloğuna girsin diye burada da durur) */
export const HEART_MESSAGES = [
  "Pulsoid erişim belirteci geçersiz",
  "HypeRate API anahtarı geçersiz",
  "HypeRate oturum kimliği geçersiz",
  "Pulsoid erişim belirteci kabul edilmedi",
  "HypeRate API anahtarı kabul edilmedi",
  "HypeRate oturum kimliği kabul edilmedi",
  "Sunucu yanıt vermedi",
  "Sunucuya bağlanılamadı",
  "Bağlantı koptu",
  "Kaynak seçilmedi",
];

export function HeartRateConnectPanel() {
  const st = useHeartRate(() => true);
  const [source, setSource] = createSignal<HeartSource>("pulsoid");
  const [token, setToken] = createSignal("");
  const [id, setId] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  // Yerel gönderim adresi: sunucu ağa açıksa bu bilgisayarın yerel adresleri, değilse yalnızca bu bilgisayar
  const [srv, { refetch }] = createResource(
    () => (inTauri && st().source === "local" ? st().localKey : null),
    async () => {
      const info = await invoke<ServerInfo>("server_status").catch(() => null);
      const lan = (await invoke<string[]>("server_lan_urls").catch(() => [])) ?? [];
      return { info, lan };
    },
  );

  const connect = async () => {
    if (busy()) return;
    setErr("");
    setBusy(true);
    try {
      await heartConnect({ source: source(), token: token(), id: id() });
      setToken("");
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  const enter = (e: KeyboardEvent) => e.key === "Enter" && void connect();
  const fresh = () => st().bpm != null && Date.now() - st().ts < HR_STALE_MS;
  const urls = () => {
    const s = srv();
    if (!s?.info?.running) return [];
    const base = s.lan.length ? s.lan : s.info.url ? [s.info.url.replace(/\/$/, "")] : [];
    return base.map((b) => `${b}/hr/${st().localKey}`);
  };

  return (
    <Section title="Nabız kaynağı">
      <Show when={inTauri} fallback={<p class="f2-hint">Bağlantı yalnızca masaüstü uygulamasında kurulur.</p>}>
        <Show
          when={!st().configured}
          fallback={
            <div class="f2 gl-acct">
              <div class="gl-acct-row">
                <span class="gl-acct-dot" classList={{ err: !fresh() }} />
                <span data-no-i18n>
                  <b>{NAMES[st().source] ? t(NAMES[st().source]) : st().source}</b>
                </span>
              </div>
              <small class="f2-hint">{st().error ? t(st().error) : fresh() ? t("Ölçüm geliyor: {0} bpm", String(st().bpm)) : st().connected ? t("Bağlı: ölçüm bekleniyor (saatte / uygulamada ölçüm açık olmalı)") : t("Ölçüm bekleniyor…")}</small>
              <Show when={st().source === "local"}>
                <Show
                  when={urls().length}
                  fallback={
                    <small class="f2-hint">
                      Yerel gönderim için Ayarlar › Web sunucusu açık olmalı; saat / telefondan ulaşmak için "Ağdaki cihazlara izin ver" seçeneğini de aç.{" "}
                      <button class="link" onClick={() => void refetch()}>
                        Yenile
                      </button>
                    </small>
                  }
                >
                  <For each={urls()}>{(u) => <CopyUrl label={t("Gönderim adresi")} url={u} />}</For>
                  <small class="f2-hint">
                    Saat / telefon uygulamasında hedef adres olarak bunu gir. PUT, POST ya da GET kabul edilir; gövde ya da sorgu şunlardan biri olabilir: <code data-no-i18n>heartRate:72</code>, <code data-no-i18n>{'{"bpm":72}'}</code>, <code data-no-i18n>?bpm=72</code>.
                  </small>
                </Show>
              </Show>
              <button class="btn small" onClick={() => void heartDisconnect().catch((e) => setErr(String(e)))}>
                Bağlantıyı kes
              </button>
            </div>
          }
        >
          <div class="f2">
            <div class="f2-cap">Kaynak</div>
            <select class="input" value={source()} onChange={(e) => (setSource(e.currentTarget.value as HeartSource), setErr(""))}>
              <For each={SOURCES}>{(s) => <option value={s.id}>{s.id === "local" ? t(s.label) : s.label}</option>}</For>
            </select>
          </div>
          <Show when={source() === "pulsoid"}>
            <div class="f2">
              <div class="f2-cap">Pulsoid erişim belirteci (access token)</div>
              <input class="input f2-text" type="password" autocomplete="off" value={token()} onInput={(e) => setToken(e.currentTarget.value)} onKeyDown={enter} />
              <small class="f2-hint">
                Telefonuna Pulsoid uygulamasını kur ve saatini / bandını bağla (Apple Watch, Wear OS, Garmin, Bluetooth bantlar). Belirteci <span data-no-i18n>pulsoid.net/ui/keys</span> sayfasından oluştur (kapsam: <span data-no-i18n>data:heart_rate:read</span>).
              </small>
            </div>
          </Show>
          <Show when={source() === "hyperate"}>
            <div class="f2">
              <div class="f2-cap">HypeRate oturum kimliği</div>
              <input class="input f2-text" autocomplete="off" spellcheck={false} value={id()} onInput={(e) => setId(e.currentTarget.value)} onKeyDown={enter} />
            </div>
            <div class="f2">
              <div class="f2-cap">HypeRate API anahtarı</div>
              <input class="input f2-text" type="password" autocomplete="off" value={token()} onInput={(e) => setToken(e.currentTarget.value)} onKeyDown={enter} />
              <small class="f2-hint">
                Oturum kimliği HypeRate uygulamasında görünen kısa koddur. API anahtarı HypeRate'ten geliştirici olarak istenir (<span data-no-i18n>hyperate.io/api</span>); anahtarın yoksa Pulsoid ya da yerel gönderimi kullan.
              </small>
            </div>
          </Show>
          <Show when={source() === "local"}>
            <small class="f2-hint">
              Saatindeki / telefonundaki uygulama nabzı doğrudan bu bilgisayara gönderir (ör. Apple Watch ve Wear OS için Health Data Server, HeartRateOnStream ya da kendi betiğin). Bağlan'a basınca gönderim adresi burada görünür. İnternet ya da hesap gerekmez.
            </small>
          </Show>
          <div class="f2">
            <button class="btn primary" disabled={busy()} onClick={connect}>
              {busy() ? t("Bağlanıyor…") : t("Bağlan")}
            </button>
            <Show when={err()}>
              <p class="error">{t(err())}</p>
            </Show>
            <small class="f2-hint">Belirteç / anahtar yalnızca bu bilgisayarda, şifreli saklanır; buluta ve diğer cihazlara gönderilmez.</small>
          </div>
        </Show>
        <small class="f2-hint">Bu overlay tıbbi cihaz değildir.</small>
      </Show>
    </Section>
  );
}
