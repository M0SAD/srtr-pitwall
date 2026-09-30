// MQTT sunucusu/istemcisi ve takım yakıt paylaşımı ayarları.

import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings, updateSettings, type MqttSettings } from "@/sdk/settings";

interface MqttStatus {
  serverRunning: number | null;
  serverError: string | null;
  serverRestart: boolean;
  clientEnabled: boolean;
  clientConnected: boolean;
  clientError: string | null;
  teamMembers: number;
}

const PUBLISHABLE: { id: string; label: string }[] = [
  { id: "status", label: "Durum" },
  { id: "session", label: "Oturum ve bayraklar" },
  { id: "standings", label: "Sıralama" },
  { id: "relative", label: "Relative" },
  { id: "fuel", label: "Yakıt" },
  { id: "telemetry", label: "Araç (hız, devir, vites)" },
  { id: "inputs", label: "Girdiler" },
  { id: "delta", label: "Tur süreleri ve delta" },
  { id: "weather", label: "Hava" },
  { id: "tires", label: "Lastikler" },
  { id: "raceControl", label: "Yarış kontrol" },
];

export function MqttPanel() {
  const m = () => settings().general.mqtt;
  const c = () => m().client;
  const [st, setSt] = createSignal<MqttStatus | null>(null);
  const [showPass, setShowPass] = createSignal(false);

  const poll = async () => {
    try {
      setSt(await invoke<MqttStatus>("mqtt_status"));
    } catch {
      /* eski sürüm */
    }
  };
  onMount(() => {
    poll();
    const t = setInterval(poll, 1500);
    onCleanup(() => clearInterval(t));
  });

  const setServer = (p: Partial<MqttSettings["server"]>) => updateSettings((d) => Object.assign(d.general.mqtt.server, p));
  const setClient = (p: Partial<MqttSettings["client"]>) => updateSettings((d) => Object.assign(d.general.mqtt.client, p));
  const togglePub = (id: string, on: boolean) =>
    setClient({ publish: on ? [...new Set([...c().publish, id])] : c().publish.filter((x) => x !== id) });
  const port = (v: string, def: number) => Math.max(1, Math.min(65535, Number(v) || def));

  const clientState = () => {
    const s = st();
    if (!c().enabled) return { cls: "", txt: "Kapalı" };
    if (!s) return { cls: "", txt: "…" };
    if (s.clientConnected) return { cls: "ok", txt: "Bağlı" };
    return { cls: "bad", txt: s.clientError ? `Bağlanamadı: ${s.clientError}` : "Bağlanıyor…" };
  };

  return (
    <section class="panel">
      <h3>MQTT ve takım yakıt paylaşımı</h3>
      <p class="muted small">
        MQTT hafif bir mesajlaşma yöntemidir. Takım yarışlarında sürüş yapan kişinin yakıt verisi takımdaki herkese gider:
        sürücü değişiminden sonra izlerken de takım arabasının yakıtını Yakıt overlay'inde ve Pitwall'da görürsün.
        Takımdan biri sunucuyu açar (port yönlendirmesi ya da aynı ağ gerekir) ya da herkes ortak bir MQTT sunucusuna
        bağlanır. Veri konuları da seçilirse kendi dashboard'un veya Home Assistant gibi araçlar{" "}
        <code>{c().prefix || "pitwall"}/&lt;konu&gt;</code> başlıklarından JSON olarak okuyabilir.
      </p>

      <h4>Dahili sunucu</h4>
      <div class="row">
        <div>
          <b>MQTT sunucusunu çalıştır</b>
          <small>
            Bu bilgisayar sunucu olur. Diğerleri bu bilgisayarın IP adresine bağlanır.
            <Show when={st()?.serverRunning}> Çalışıyor: port {st()!.serverRunning}.</Show>
          </small>
        </div>
        <label class="switch">
          <input type="checkbox" checked={m().server.enabled} onChange={(e) => setServer({ enabled: e.currentTarget.checked })} />
          <i />
        </label>
      </div>
      <div class="row">
        <div>
          <b>Sunucu portu</b>
        </div>
        <input class="input port" type="number" value={m().server.port} onChange={(e) => setServer({ port: port(e.currentTarget.value, 1883) })} />
      </div>
      <Show when={st()?.serverError}>
        <p class="error">{st()!.serverError}</p>
      </Show>
      <Show when={st()?.serverRestart}>
        <p class="muted small">Sunucuyu kapatmak ya da portunu değiştirmek için uygulamayı yeniden başlat.</p>
      </Show>

      <h4>İstemci</h4>
      <div class="row">
        <div>
          <b>MQTT sunucusuna bağlan</b>
          <small class={`mqtt-state ${clientState().cls}`}>{clientState().txt}</small>
        </div>
        <label class="switch">
          <input type="checkbox" checked={c().enabled} onChange={(e) => setClient({ enabled: e.currentTarget.checked })} />
          <i />
        </label>
      </div>
      <div class="row">
        <div>
          <b>Sunucu adresi</b>
          <small>Kendi sunucunu açtıysan 127.0.0.1</small>
        </div>
        <div class="mqtt-host">
          <input class="input" value={c().host} onChange={(e) => setClient({ host: e.currentTarget.value.trim() })} />
          <input class="input port" type="number" value={c().port} onChange={(e) => setClient({ port: port(e.currentTarget.value, 1883) })} />
        </div>
      </div>
      <div class="row">
        <div>
          <b>Kullanıcı / şifre</b>
          <small>Sunucu istemiyorsa boş bırak</small>
        </div>
        <div class="mqtt-host">
          <input class="input" placeholder="kullanıcı" value={c().user} onChange={(e) => setClient({ user: e.currentTarget.value })} />
          <input
            class="input"
            type={showPass() ? "text" : "password"}
            placeholder="şifre"
            value={c().pass}
            onChange={(e) => setClient({ pass: e.currentTarget.value })}
          />
          <button class="btn ghost small" onClick={() => setShowPass(!showPass())}>
            {showPass() ? "Gizle" : "Göster"}
          </button>
        </div>
      </div>
      <div class="row">
        <div>
          <b>Takım adı</b>
          <small>Aynı takım adını yazan herkes yakıt verisini paylaşır. Boşsa paylaşım kapalı.</small>
        </div>
        <input class="input" placeholder="ör. ekip-24h" value={c().team} onChange={(e) => setClient({ team: e.currentTarget.value.trim() })} />
      </div>
      <div class="row">
        <div>
          <b>Başlık öneki</b>
        </div>
        <input class="input" value={c().prefix} onChange={(e) => setClient({ prefix: e.currentTarget.value.trim() || "pitwall" })} />
      </div>

      <h4>Yayınlanacak veriler</h4>
      <div class="mqtt-pub">
        <For each={PUBLISHABLE}>
          {(p) => (
            <label class="check">
              <input type="checkbox" checked={c().publish.includes(p.id)} onChange={(e) => togglePub(p.id, e.currentTarget.checked)} />
              <span>
                {p.label} <code>{(c().prefix || "pitwall") + "/" + p.id}</code>
              </span>
            </label>
          )}
        </For>
      </div>
      <div class="row">
        <div>
          <b>Yayın sıklığı</b>
        </div>
        <input
          class="input port"
          type="number"
          min="0.2"
          max="20"
          step="0.5"
          value={c().hz}
          onChange={(e) => setClient({ hz: Math.max(0.2, Math.min(20, Number(e.currentTarget.value) || 2)) })}
        />
      </div>
    </section>
  );
}
