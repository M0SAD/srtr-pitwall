// Web sunucusu: OBS tarayıcı kaynağı ve ağdaki cihazlar (tablet, ikinci PC) için.

import { For, Show, createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings, updateSettings, type ServerSettings } from "@/sdk/settings";

export interface ServerInfo {
  running: boolean;
  port: number;
  url: string | null;
  lanUrl: string | null;
  error: string | null;
}

export function CopyUrl(p: { label: string; url: string; hint?: string }) {
  const [copied, setCopied] = createSignal(false);
  return (
    <div class="url-row">
      <div>
        <b>{p.label}</b>
        <Show when={p.hint}>
          <small>{p.hint}</small>
        </Show>
      </div>
      <code>{p.url}</code>
      <button
        class="btn ghost small"
        onClick={async () => {
          await navigator.clipboard.writeText(p.url).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied() ? "Kopyalandı" : "Kopyala"}
      </button>
    </div>
  );
}

export function ServerPanel() {
  const [info, setInfo] = createSignal<ServerInfo | null>(null);
  const [busy, setBusy] = createSignal(false);
  const srv = () => settings().general.server;
  onMount(async () => setInfo(await invoke<ServerInfo>("server_status")));

  const apply = async (patch: Partial<ServerSettings>) => {
    updateSettings((d) => Object.assign(d.general.server, patch));
    setBusy(true);
    const s = { ...srv(), ...patch };
    setInfo(await invoke<ServerInfo>("server_apply", { enabled: s.enabled, port: s.port, lan: s.lan }));
    setBusy(false);
  };
  const base = () => info()?.url ?? `http://127.0.0.1:${srv().port}`;

  return (
    <section class="panel">
      <h3>HTTP sunucusu</h3>
      <div class="row">
        <div>
          <b>Etkin</b>
          <small>Overlay'leri OBS'e tarayıcı kaynağı olarak eklemek, Pitwall ve mühendis ekranını başka cihazdan açmak için.</small>
        </div>
        <label class="switch">
          <input type="checkbox" checked={srv().enabled} disabled={busy()} onChange={(e) => apply({ enabled: e.currentTarget.checked })} />
          <i />
        </label>
      </div>
      <div class="row">
        <div>
          <b>Uzaktan erişim</b>
          <small>Sunucuyu yerel ağa açar: ikinci OBS bilgisayarı, telefon, tablet erişebilir. Her şey bu bilgisayardaysa kapalı bırak.</small>
        </div>
        <label class="switch">
          <input type="checkbox" checked={srv().lan} disabled={busy()} onChange={(e) => apply({ lan: e.currentTarget.checked })} />
          <i />
        </label>
      </div>
      <div class="row">
        <div>
          <b>Port</b>
        </div>
        <input
          class="input port"
          type="number"
          min="1024"
          max="65535"
          value={srv().port}
          onChange={(e) => apply({ port: Math.max(1024, Math.min(65535, Number(e.currentTarget.value) || 8910)) })}
        />
      </div>
      <Show when={info()?.error}>
        <p class="error">{info()!.error}</p>
      </Show>
      <Show when={info()?.running}>
        <div class="urls">
          <CopyUrl label="Sunucu adresi" url={info()?.lanUrl ?? base()} />
          <CopyUrl label="SRTR Pitwall" url={`${info()?.lanUrl ?? base()}/window.html?view=pitwall`} />
          <CopyUrl label="Live Timing" url={`${info()?.lanUrl ?? base()}/window.html?view=timing`} />
          <For each={Object.values(settings().profiles).filter((p) => p.rules.mode === "stream")}>
            {(p) => <CopyUrl label={`OBS: ${p.name}`} url={`${base()}/overlay.html?layout=${encodeURIComponent(p.id)}`} />}
          </For>
        </div>
      </Show>
    </section>
  );
}
