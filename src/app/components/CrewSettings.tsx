// Ayarlar › Paylaşım: Ekip (uzaktan pit ekibi, c53) — sürücü tarafı.
//  - Ana anahtar "Ekibim pit ayarlarımı değiştirebilsin" (sunucuda crew_prefs.control_on; satır yoksa PRO üyede
//    varsayılan AÇIK, değilse kapalı: c58. crew_state() etkin değeri döner)
//  - "Ekibim canlı pitwall'ımı izleyebilsin" (crew_prefs.wall_on, varsayılan açık: c58): Ekip Pitwall'ı için
//    çevredeki araçlar / spotter durumu saniyede bir gönderilir; yalnızca ekipten biri paneli açıkken.
//  - Arkadaş başına Görebilir / Değiştirebilir (crew_set). Şu an paneli açık olan ekip üyesi "bağlı" görünür.
//  - "Ekip kontrolünü durdur": ana anahtarı hemen kapatır (bekleyen komutlar da reddedilir); kısayolu da var.
//  - Son komutlar: ekibin gönderdiği son komutlar ve sonuçları.
// Komutları overlay penceresindeki servis uygular (src/host/crew.ts); bu ekran sadece yetkileri yönetir.

import { For, Show, createResource, createSignal, onCleanup } from "solid-js";
import { emit, listen } from "@tauri-apps/api/event";
import { t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { myFriends, type Friend } from "@/cloud/social";
import { crewCommandText, crewControlSet, crewHistory, crewList, crewSet, crewState, crewStatusText, crewWallSet, type CrewCommand, type CrewMember, type CrewState } from "@/cloud/crew";
import { prettyKey, shortcut } from "@/sdk/shortcuts";
import { F } from "@/sdk/proFeatures";
import { settings, updateSettings } from "@/sdk/settings";
import { go } from "../ui";
import { Switch } from "./SettingsForm";
import { ProTag } from "./ProLock";

export function CrewSettings() {
  const [err, setErr] = createSignal("");
  const uid = () => session()?.user.id;
  const [friends] = createResource(uid, () => myFriends().then((l) => (l ?? []).filter((f) => f.status === "accepted")).catch(() => [] as Friend[]));
  const [state, { refetch: refetchState, mutate: setState }] = createResource(uid, () => crewState().catch(() => null as CrewState | null));
  const [crew, { refetch: refetchCrew, mutate: setCrew }] = createResource(uid, () => crewList().catch(() => null as CrewMember[] | null));
  const [log, { refetch: refetchLog }] = createResource(uid, () => crewHistory(15).catch(() => [] as CrewCommand[]));

  const reload = () => {
    void refetchState();
    void refetchCrew();
    void refetchLog();
  };
  // Kimin bağlı olduğu ve komut listesi sık değişir
  const iv = window.setInterval(() => {
    if (!uid()) return;
    void refetchCrew();
    void refetchLog();
  }, 15_000);
  onCleanup(() => clearInterval(iv));
  // Overlay penceresi: komut uygulandı / kısayolla durduruldu
  let un: (() => void) | undefined;
  let dead = false;
  void listen("crew-changed", reload).then((f) => (dead ? f() : (un = f)));
  onCleanup(() => {
    dead = true;
    un?.();
  });

  const act = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    }
    // Overlay penceresindeki ekip servisi yetkileri hemen yenilesin
    void emit("crew-refresh");
    reload();
  };
  const on = () => !!state()?.control_on;
  const setOn = (v: boolean) => {
    setState((x) => ({ needs_pro: !!x?.needs_pro, count: x?.count ?? 0, max: x?.max ?? 10, wall_on: x?.wall_on, control_on: v, control_default: false }));
    void act(() => crewControlSet(v));
  };
  const wallOn = () => state()?.wall_on !== false;
  const setWall = (v: boolean) => {
    setState((x) => ({ needs_pro: !!x?.needs_pro, count: x?.count ?? 0, max: x?.max ?? 10, control_on: !!x?.control_on, control_default: x?.control_default, wall_on: v }));
    void act(() => crewWallSet(v));
  };
  const member = (id: string) => (crew() ?? []).find((m) => m.member_id === id);
  const setRole = (f: Friend, view: boolean, control: boolean) => {
    setCrew((l) => {
      const rest = (l ?? []).filter((m) => m.member_id !== f.friend_id);
      if (!view && !control) return rest;
      const cur = member(f.friend_id);
      return [...rest, { member_id: f.friend_id, display_name: f.display_name, avatar_path: f.avatar_path ?? null, can_view: true, can_control: control, watching: !!cur?.watching, seen_at: cur?.seen_at ?? null }];
    });
    void act(() => crewSet(f.friend_id, view || control, control));
  };
  const watching = () => (crew() ?? []).filter((m) => m.watching);
  const when = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <section class="panel">
      <h3>
        Ekip (uzaktan pit) <ProTag feature={F.crew} />
      </h3>
      <p class="muted small">
        Ekibine eklediğin arkadaşların, sen yarışırken yarış bilgilerini (yakıt, tur, pit servisi) uygulamadan ya da telefondan (web sitesi › Ekip)
        izler. Değiştirme yetkisi verdiklerin yakıt miktarını, lastik değişimini, hızlı tamiri ve vizör filmini senin yerine ayarlayabilir ve kısa mesaj
        gönderebilir. Başka hiçbir ayarına ya da hesabına erişemezler. Uzaktan pit komutları şimdilik sadece iRacing'de çalışır; diğer oyunlarda
        ekip yalnızca izler.
      </p>
      <Show when={session()} fallback={<p class="muted">Bu özellik için hesabına giriş yapmalısın.</p>}>
        <Show when={crew() === null}>
          <p class="muted small">Ekip listesi okunamadı. Daha sonra tekrar dene.</p>
        </Show>
        <Show when={state()?.needs_pro}>
          <p class="muted small">Ekibe değiştirme yetkisi vermek PRO üyelere özel. İzleme yetkisi vermek ve başkasının ekibinde olmak ücretsiz.</p>
        </Show>
        <div class="row">
          <div>
            <b>Ekibim pit ayarlarımı değiştirebilsin</b>
            <small>Kapalıyken ekip sadece izler; gelen pit komutları reddedilir. Komutlar yalnızca oyuna bağlıyken uygulanır.</small>
            <Show when={on() && state()?.control_default}>
              <small>PRO üyelerde varsayılan olarak açık. Kapatırsan kapalı kalır.</small>
            </Show>
          </div>
          <Switch checked={on()} disabled={!!state()?.needs_pro && !on()} onChange={setOn} />
        </div>
        <Show when={on()}>
          <div class="row">
            <div>
              <b>Ekip kontrolünü durdur</b>
              <small>
                {t("Uzaktan kontrolü hemen kapatır; bekleyen komutlar uygulanmaz. Kısayol: {0}", prettyKey(shortcut("crewStop")))}
              </small>
            </div>
            <button class="btn danger small" onClick={() => setOn(false)}>
              Durdur
            </button>
          </div>
        </Show>
        <div class="row">
          <div>
            <b>Ekibim canlı pitwall'ımı izleyebilsin</b>
            <small>
              Ekip Pitwall'ı: ekibin çevrendeki araçları, farkları, tur sürelerini, bayrakları, havayı ve yanında araç olup olmadığını saniyede bir
              izler; sana hazır spotter mesajları gönderebilir. Veri yalnızca ekipten biri paneli açıkken gönderilir. Kapalıyken ekip sadece 3
              saniyede bir yenilenen özet paneli görür.
            </small>
          </div>
          <Switch checked={wallOn()} onChange={setWall} />
        </div>
        <div class="row">
          <div>
            <b>
              Konuşmalarımı (altyazı) ekibimle paylaş <ProTag feature={F.liveStt} />
            </b>
            <small>
              Konuşma → yazı açıkken söylediklerin (ve sesli komut soruların) Ekip Pitwall'ında, ekibinin sana mesaj yazdığı yerde altyazı olarak
              görünür. Yalnızca son bir dakikanın cümleleri, ekipten biri paneli açıkken gönderilir; altyazıyı görmek için ekip üyesi de PRO olmalı.
            </small>
            <small>
              <Show when={settings().general.livechat.stt.enabled} fallback={t("Konuşma → yazı şu an kapalı: ekibin altyazı görmez.")}>
                {t("Konuşma → yazı açık.")}
              </Show>{" "}
              <button class="link" onClick={() => go("livechat", "stt")}>
                Canlı Sohbet › Konuşma → yazı
              </button>
            </small>
          </div>
          <Switch
            checked={settings().general.social.crewSpeech !== false}
            disabled={!wallOn()}
            onChange={(v) => updateSettings((d) => void (d.general.social.crewSpeech = v))}
          />
        </div>
        <div class="row">
          <div>
            <b>Şu an bağlı</b>
            <small classList={{ success: watching().length > 0 }} data-no-i18n>
              {watching().length ? watching().map((m) => m.display_name || "?").join(", ") : t("Ekipten paneli açık olan yok")}
            </small>
          </div>
        </div>
        <Show when={!friends.loading && (friends() ?? []).length === 0}>
          <p class="muted small">Henüz arkadaşın yok. Arkadaşlar penceresinden arkadaş ekleyebilirsin.</p>
        </Show>
        <For each={friends() ?? []}>
          {(f) => {
            const m = () => member(f.friend_id);
            return (
              <div class="row">
                <div>
                  <b data-no-i18n>{f.display_name || "?"}</b>
                  <small classList={{ success: !!m()?.watching }}>
                    {m()?.watching ? t("Şu an bağlı") : m()?.can_control ? t("İzleyebilir ve pit ayarlarını değiştirebilir") : m() ? t("Sadece izleyebilir") : t("Ekipte değil")}
                  </small>
                </div>
                <div class="btns" style={{ "align-items": "center", gap: "14px", "flex-wrap": "nowrap" }}>
                  <label class="muted small" style={{ display: "flex", "align-items": "center", gap: "6px", margin: "0" }}>
                    Görebilir
                    <Switch checked={!!m()} onChange={(v) => setRole(f, v, false)} />
                  </label>
                  <label class="muted small" style={{ display: "flex", "align-items": "center", gap: "6px", margin: "0" }}>
                    Değiştirebilir
                    <Switch checked={!!m()?.can_control} disabled={!!state()?.needs_pro && !m()?.can_control} onChange={(v) => setRole(f, true, v)} />
                  </label>
                </div>
              </div>
            );
          }}
        </For>
        <Show when={err()}>
          <p class="error">{t(err())}</p>
        </Show>
        <h3 style={{ "margin-top": "14px" }}>Son komutlar</h3>
        <Show when={(log() ?? []).length > 0} fallback={<p class="muted small">Henüz komut yok.</p>}>
          <For each={log() ?? []}>
            {(c) => (
              <div class="row" style={{ padding: "6px 0" }}>
                <div>
                  <b data-no-i18n>
                    {c.sender_name || "?"}: {crewCommandText(c.kind, c.args)}
                  </b>
                  <small data-no-i18n>
                    {when(c.created_at)} · {crewStatusText(c.status)}
                    {c.result ? ` · ${t(c.result)}` : ""}
                  </small>
                </div>
              </div>
            )}
          </For>
        </Show>
      </Show>
    </section>
  );
}
