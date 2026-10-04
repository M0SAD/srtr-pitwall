// Ayarlar: alt sayfalar (Edge düzeni).

import { localeTag } from "@/sdk/i18n";
import { CreatorPanel } from "../components/Creator";
import { For, Match, Show, Switch as SwitchC, createResource, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings, updateSettings, defaultSettings } from "@/sdk/settings";
import { GeneralPage, About } from "./GeneralPage";
import { AppearancePage } from "./AppearancePage";
import { ChatLookPage } from "./ChatLookPage";
import { ShortcutsPanel } from "../components/ShortcutsPanel";
import { MqttPanel } from "../components/MqttPanel";
import { TrustedSharing } from "../components/TrustedSharing";
import { CrewSettings } from "../components/CrewSettings";
import { ServerPanel, CopyUrl } from "../components/ServerPanel";
import { SoundsPanel } from "../components/SoundsPanel";
import { VrPanel } from "../components/VrPanel";
import { Switch } from "../components/SettingsForm";
import { ENGINEER_SCREENS } from "@/window/engineerScreens";
import { SETTINGS_PAGES } from "./settingsPages";

export { SETTINGS_PAGES };

function Row(p: { title: string; sub?: string; children: any }) {
  return (
    <div class="row">
      <div>
        <b>{p.title}</b>
        <Show when={p.sub}>
          <small>{p.sub}</small>
        </Show>
      </div>
      {p.children}
    </div>
  );
}

function Seg<T extends string | number>(p: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="seg">
      <For each={p.options}>
        {(o) => (
          <button classList={{ on: p.value === o.v }} onClick={() => p.onChange(o.v)}>
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

function Performance() {
  const pf = () => settings().general.perf;
  const set = (fn: (x: ReturnType<typeof pf>) => void) => updateSettings((d) => fn(d.general.perf));
  return (
    <div class="page narrow">
      <section class="panel">
        <h3>Performans</h3>
        <Row title="Görsel efektleri azalt" sub="Gradyan ve gölgeleri düz renklerle değiştirir, ekran kartını daha az yorar.">
          <Switch checked={pf().reduceEffects} onChange={(v) => set((x) => (x.reduceEffects = v))} />
        </Row>
        <Row title="Telemetri güncelleme hızı" sub="Tüm overlay'ler, OBS kaynakları ve panolar için üst sınır.">
          <Seg value={pf().telemetryHz} options={[{ v: 15, label: "15 Hz" }, { v: 30, label: "30 Hz" }, { v: 60, label: "60 Hz" }]} onChange={(v) => set((x) => (x.telemetryHz = v))} />
        </Row>
        <Row title="Girdi (pedal) grafiği hızı" sub="En akıcı pedal izi için 60 Hz, daha az kaynak için 30 Hz.">
          <Seg value={pf().inputHz} options={[{ v: 30, label: "30 Hz" }, { v: 60, label: "60 Hz" }]} onChange={(v) => set((x) => (x.inputHz = v))} />
        </Row>
        <p class="muted small">
          SRTR Pitwall sadece açık overlay'lerin ihtiyaç duyduğu veriyi, istenen sıklıkta hesaplar. Gizli pencere ekran kartı kullanmaz.
        </p>
      </section>
    </div>
  );
}

function Display() {
  const ds = () => settings().general.display;
  const set = (fn: (x: ReturnType<typeof ds>) => void) => updateSettings((d) => fn(d.general.display));
  return (
    <div class="page narrow">
      <section class="panel">
        <h3>Grafik ve şeffaflık</h3>
        <p class="muted small">
          Overlay'ler şeffaf yerine siyah arka planla görünüyor ya da titriyorsa bunları sırayla dene. Uygulamayı yeniden
          başlatınca etkili olur.
        </p>
        <Row title="GPU birleştirmeyi kapat" sub="Siyah/titreyen overlay'ler için en sık işe yarayan çözüm.">
          <Switch checked={ds().disableGpuCompositing} onChange={(v) => set((x) => (x.disableGpuCompositing = v))} />
        </Row>
        <Row title="Donanım hızlandırmayı kapat" sub="Sorun sürerse yazılımla çizim (işlemci kullanımı biraz artar).">
          <Switch checked={ds().disableGpu} onChange={(v) => set((x) => (x.disableGpu = v))} />
        </Row>
      </section>
      <section class="panel">
        <h3>Önemli</h3>
        <p class="muted">
          Overlay'lerin oyunun üstünde görünmesi için iRacing'i <b>Kenarlıksız pencere (Borderless / Windowed Fullscreen)</b>{" "}
          modunda çalıştır. Özel tam ekran modunda Windows başka pencerelerin üstte görünmesine izin vermez.
        </p>
      </section>
    </div>
  );
}

function Integrations() {
  const g = () => settings().general;
  return (
    <div class="page narrow">
      <ServerPanel />
      <MqttPanel />
      <section class="panel">
        <h3>Uzak telemetri</h3>
        <p class="muted small">
          Başka bir bilgisayardaki SRTR Pitwall'dan veri al (ör. yayın bilgisayarında overlay'leri, oyun bilgisayarının verisiyle
          göster). Diğer bilgisayarda HTTP sunucusu ve uzaktan erişim açık olmalı.
        </p>
        <Row title="Etkin">
          <Switch checked={g().remote.enabled} onChange={(v) => updateSettings((d) => (d.general.remote.enabled = v))} />
        </Row>
        <Row title="Adres" sub="Diğer bilgisayarın IP adresi">
          <div class="mqtt-host">
            <input class="input" placeholder="192.168.1.x" value={g().remote.host} onChange={(e) => updateSettings((d) => (d.general.remote.host = e.currentTarget.value.trim()))} />
            <input class="input port" type="number" value={g().remote.port} onChange={(e) => updateSettings((d) => (d.general.remote.port = Number(e.currentTarget.value) || 8910))} />
          </div>
        </Row>
      </section>
    </div>
  );
}

function Engineer() {
  const e = () => settings().general.engineer;
  const [info] = createResource(() => invoke<{ url: string | null; lanUrl: string | null; running: boolean }>("server_status").catch(() => null));
  const base = () => info()?.lanUrl ?? info()?.url ?? `http://127.0.0.1:${settings().general.server.port}`;
  return (
    <div class="page narrow">
      <section class="panel">
        <h3>Mühendis ekranı adresleri</h3>
        <p class="muted small">Tablet, ikinci monitör ya da SimHub/tarayıcı panelleri için. HTTP sunucusu açık olmalı.</p>
        <CopyUrl label="Mühendis" url={`${base()}/window.html?view=engineer&size=1000x600`} />
        <CopyUrl label="Geniş (XL)" url={`${base()}/window.html?view=engineer&size=1920x480`} />
        <CopyUrl label="Geniş yüksek (XLT)" url={`${base()}/window.html?view=engineer&size=1920x720`} />
        <button class="btn ghost" onClick={() => invoke("window_open", { view: "engineer" })}>
          Bu bilgisayarda aç
        </button>
      </section>
      <section class="panel">
        <h3>Döngüdeki ekranlar</h3>
        <Row title="Geçiş süresi" sub="Ekranlar arasında kendiliğinden geçiş (0: kapalı)">
          <Seg
            value={e().cycleSec}
            options={[{ v: 0, label: "Kapalı" }, { v: 6, label: "6 sn" }, { v: 10, label: "10 sn" }, { v: 20, label: "20 sn" }]}
            onChange={(v) => updateSettings((d) => (d.general.engineer.cycleSec = v))}
          />
        </Row>
        <For each={ENGINEER_SCREENS}>
          {(s) => (
            <Row title={s.name} sub={s.desc}>
              <Switch
                checked={e().screens.includes(s.id)}
                onChange={(on) =>
                  updateSettings((d) => {
                    const cur = d.general.engineer.screens;
                    d.general.engineer.screens = on ? [...new Set([...cur, s.id])] : cur.filter((x) => x !== s.id);
                  })
                }
              />
            </Row>
          )}
        </For>
      </section>
    </div>
  );
}

interface SessionsInfo {
  count: number;
  dir: string;
  recent: { file: string; track: string; kind: string; car: string; started: number; laps: number; best: number; incidents: number; finishPos: number }[];
}

function fmtLap(t: number) {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : s;
}

function Sharing() {
  const c = () => settings().general.mqtt.client;
  const sh = () => settings().general.sharing;
  const [code, setCode] = createSignal("");
  const [sessions, { refetch }] = createResource(() =>
    invoke<SessionsInfo>("sessions_info").catch(() => ({ count: 0, dir: "", recent: [] }) as SessionsInfo),
  );
  const [open, setOpen] = createSignal<string | null>(null);
  const [summary] = createResource(open, (f) => invoke<string>("session_summary", { file: f }).catch((e) => String(e)));

  const join = (teamCode: string) => {
    const t = teamCode.trim().toUpperCase();
    if (!t) return;
    updateSettings((d) => {
      const cl = d.general.mqtt.client;
      cl.enabled = true;
      cl.team = t;
      // Ortak sunucu yoksa herkese açık MQTT sunucusu (sadece yakıt sayıları paylaşılır)
      if (!cl.host || cl.host === "127.0.0.1") {
        cl.host = "broker.hivemq.com";
        cl.port = 1883;
        cl.prefix = "pitwall-tr";
      }
    });
  };
  const create = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const c = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    setCode(c);
    join(c);
  };

  return (
    <div class="page narrow">
      <section class="panel">
        <h3>Takım yakıtı</h3>
        <p class="muted small">
          Kod oluştur ve takım arkadaşlarına ver; aynı kodla katılan herkes sürüş yapanın yakıtını görür (Yakıt overlay'i ve
          Pitwall). Ayrı bir sunucu gerekmez; istersen Entegrasyonlar'dan kendi MQTT sunucunu kullanabilirsin.
        </p>
        <div class="fr-add">
          <input class="input" placeholder="Katılma kodu" value={code() || c().team} onInput={(e) => setCode(e.currentTarget.value)} />
          <button class="btn primary" onClick={() => join(code() || c().team)}>
            Katıl
          </button>
          <button class="btn ghost" onClick={create}>
            Oluştur
          </button>
        </div>
        <Show when={c().enabled && c().team}>
          <p class="success">
            Takım kodu: <b>{c().team}</b> · sunucu {c().host}
          </p>
        </Show>
      </section>
      <TrustedSharing />
      <CrewSettings />
      <section class="panel">
        <h3>Yarış özetleri</h3>
        <Row title="Otomatik oluştur" sub="Yarış bitince sonuçlar, tur süreleri ve olaylar bir özet dosyasına yazılır.">
          <Switch checked={sh().summaries} onChange={(v) => updateSettings((d) => (d.general.sharing.summaries = v))} />
        </Row>
        <Row title="Özet ve oturum klasörü" sub={sessions()?.dir || "Varsayılan konum"}>
          <button class="btn ghost" onClick={() => invoke("sessions_open_dir")}>
            Aç
          </button>
        </Row>
      </section>
      <section class="panel">
        <h3>Oturum kayıtları</h3>
        <Row title="Kayıtlı oturum" sub={`${sessions()?.count ?? 0} oturum`}>
          <div class="btns">
            <button class="btn ghost small" onClick={() => invoke("sessions_prune", { days: 15, keep: 0 }).then(refetch)}>
              15 günden eskileri sil
            </button>
            <button class="btn ghost small" onClick={() => invoke("sessions_prune", { days: 0, keep: sh().keepSessions }).then(refetch)}>
              Son {sh().keepSessions} kalsın
            </button>
            <button class="btn ghost small danger" onClick={() => confirm("Tüm oturum kayıtları silinsin mi?") && invoke("sessions_prune", { days: 0, keep: 0, all: true }).then(refetch)}>
              Hepsini sil
            </button>
          </div>
        </Row>
        <Show when={(sessions()?.recent.length ?? 0) > 0}>
          <div class="sess-list">
            <For each={sessions()!.recent}>
              {(x) => (
                <button class="sess-item" classList={{ sel: open() === x.file }} onClick={() => setOpen(open() === x.file ? null : x.file)}>
                  <b>{x.track || "Pist"}</b>
                  <span class="muted">{x.kind}</span>
                  <span class="muted">{new Date(x.started).toLocaleString(localeTag(), { dateStyle: "short", timeStyle: "short" })}</span>
                  <span>{x.laps} tur</span>
                  <span class="mono">{x.best > 0 ? fmtLap(x.best) : "—"}</span>
                  <span>{x.incidents}x</span>
                  <span>{x.finishPos > 0 ? `P${x.finishPos}` : ""}</span>
                </button>
              )}
            </For>
          </div>
          <Show when={open()}>
            <pre class="sess-sum">{summary.loading ? "Yükleniyor…" : summary()}</pre>
          </Show>
        </Show>
      </section>
    </div>
  );
}

function AboutPage() {
  const reset = (what: "positions" | "settings" | "all") => {
    const msg = { positions: "Tüm overlay konumları", settings: "Tüm overlay ayarları", all: "Tüm overlay'ler, konumlar ve ayarlar" }[what];
    if (!confirm(`${msg} varsayılana dönsün mü?`)) return;
    const d0 = defaultSettings();
    updateSettings((d) => {
      if (what === "all") {
        d.profiles = d0.profiles;
        d.activeProfile = d0.activeProfile;
        d.theme = d0.theme;
        return;
      }
      for (const p of Object.values(d.profiles)) {
        for (const [k, o] of Object.entries(p.overlays)) {
          const def = d0.profiles.default.overlays[o.type];
          if (!def) continue;
          if (what === "positions") {
            o.x = def.x;
            o.y = def.y;
            o.scale = 1;
            o.monitor = "";
          } else {
            p.overlays[k].options = structuredClone(def.options);
            o.opacity = 1;
          }
        }
      }
    });
  };
  return (
    <div class="page narrow">
      <CreatorPanel />
      <About />
      <section class="panel">
        <h3>Sıfırla</h3>
        <Row title="Konumları sıfırla" sub="Tüm overlay konumları ve boyutları varsayılana döner">
          <button class="btn ghost" onClick={() => reset("positions")}>
            Sıfırla
          </button>
        </Row>
        <Row title="Ayarları sıfırla" sub="Tüm overlay seçenekleri varsayılana döner">
          <button class="btn ghost" onClick={() => reset("settings")}>
            Sıfırla
          </button>
        </Row>
        <Row title="Hepsini sıfırla" sub="Düzenler, overlay'ler ve görünüm">
          <button class="btn ghost danger" onClick={() => reset("all")}>
            Hepsini sıfırla
          </button>
        </Row>
      </section>
    </div>
  );
}

export function SettingsPage(props: { page: string }) {
  return (
    <SwitchC fallback={<GeneralPage />}>
      <Match when={props.page === "appearance"}>
        <AppearancePage />
      </Match>
      <Match when={props.page === "chat"}>
        <ChatLookPage />
      </Match>
      <Match when={props.page === "sounds"}>
        <div class="page narrow">
          <SoundsPanel />
        </div>
      </Match>
      <Match when={props.page === "performance"}>
        <Performance />
      </Match>
      <Match when={props.page === "display"}>
        <Display />
      </Match>
      <Match when={props.page === "vr"}>
        <VrPanel />
      </Match>
      <Match when={props.page === "integrations"}>
        <Integrations />
      </Match>
      <Match when={props.page === "engineer"}>
        <Engineer />
      </Match>
      <Match when={props.page === "keybinds"}>
        <div class="page narrow">
          <ShortcutsPanel />
        </div>
      </Match>
      <Match when={props.page === "sharing"}>
        <Sharing />
      </Match>
      <Match when={props.page === "about"}>
        <AboutPage />
      </Match>
    </SwitchC>
  );
}
