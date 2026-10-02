// "Başka cihazda aç" (PRO: dashboard.remote): direksiyon ekranını aynı ağdaki telefon / tablette aç.
// Yerel web sunucusundaki /dash sayfasının adresini ve QR kodunu gösterir. Sunucu varsayılan olarak yalnızca bu
// bilgisayara açıktır; ağa açmak kullanıcının buradaki (ya da Ayarlar › Entegrasyonlar'daki) açık onayına bağlıdır.

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings, updateSettings, type ServerSettings } from "@/sdk/settings";
import { F, optionLocked, proLocked } from "@/sdk/proFeatures";
import { manifestById } from "@/sdk/registry";
import { ProLockBox } from "@/app/components/ProLock";
import { CopyUrl, type ServerInfo } from "@/app/components/ServerPanel";
import { qrMatrix, qrSvgPath } from "./qr";
import "./designer.css";

/** Uzak sayfada açılabilecek hazır görünümler (Direksiyon Ekranı manifestindeki "Görünüm" seçenekleri) */
export function builtinViews(): { value: string; label: string; locked: boolean }[] {
  const f = manifestById("dashboard")?.settings.find((x) => x.key === "view");
  if (f?.type !== "select") return [];
  return f.options.filter((o) => o.value !== "custom").map((o) => ({ value: o.value, label: o.label, locked: optionLocked("dashboard", "view", o) }));
}

export function DashRemotePanel() {
  const srv = () => settings().general.server;
  const [busy, setBusy] = createSignal(false);
  const [tick, setTick] = createSignal(0);
  const [info] = createResource(tick, () => invoke<ServerInfo>("server_status").catch(() => null));
  const [lan] = createResource(tick, () => invoke<string[]>("server_lan_urls").catch(() => [] as string[]));
  const [pick, setPick] = createSignal("");
  const [urlIdx, setUrlIdx] = createSignal(0);

  const apply = async (patch: Partial<ServerSettings>) => {
    updateSettings((d) => Object.assign(d.general.server, patch));
    setBusy(true);
    const s = { ...srv(), ...patch };
    await invoke<ServerInfo>("server_apply", { enabled: s.enabled, port: s.port, lan: s.lan }).catch(() => null);
    setBusy(false);
    setTick((v) => v + 1);
  };

  const path = () => (pick() ? `/dash/${encodeURIComponent(pick())}` : "/dash");
  const urls = createMemo(() => (lan() ?? []).map((b) => `${b}${path()}`));
  const qrUrl = () => urls()[Math.min(urlIdx(), urls().length - 1)];
  const qr = createMemo(() => {
    const u = qrUrl();
    const m = u ? qrMatrix(u) : null;
    return m ? qrSvgPath(m, 3) : null;
  });

  return (
    <ProLockBox feature={F.dashRemote} text="Direksiyon ekranını telefon ya da tabletten açmak PRO üyelere özel.">
      <section class="panel">
        <h3>Başka cihazda aç</h3>
        <p class="muted">
          Direksiyon ekranını aynı ağdaki telefon ya da tablette tam ekran aç: hazır görünümler, araca göre kendiliğinden seçilen araç tarzı
          ekranlar ya da kendi tasarımın. Veri bu bilgisayardan canlı gelir; cihaza uygulama kurmak gerekmez.
        </p>
        <div class="dr-grid">
          <div>
            <div class="row">
              <div>
                <b>HTTP sunucusu</b>
                <small>Uzak gösterge sayfasını bu bilgisayar sunar.</small>
              </div>
              <label class="switch">
                <input type="checkbox" checked={srv().enabled} disabled={busy()} onChange={(e) => apply({ enabled: e.currentTarget.checked })} />
                <i />
              </label>
            </div>
            <div class="row">
              <div>
                <b>Ağdaki cihazlara izin ver</b>
                <small>
                  Sunucuyu yerel ağa açar (Ayarlar › Entegrasyonlar › “Uzaktan erişim” ile aynı ayar). Kapalıyken sayfa yalnızca bu bilgisayardan
                  açılır.
                </small>
              </div>
              <label class="switch">
                <input type="checkbox" checked={srv().lan} disabled={busy() || !srv().enabled} onChange={(e) => apply({ lan: e.currentTarget.checked })} />
                <i />
              </label>
            </div>
            <div class="row">
              <div>
                <b>Gösterilecek ekran</b>
                <small>Cihazda açılınca ilk bu görünür; sayfadaki menüden başka birine geçilebilir.</small>
              </div>
              <select class="input" value={pick()} onChange={(e) => setPick(e.currentTarget.value)}>
                <option value="">Kendiliğinden (ilk tasarımın, yoksa araca göre)</option>
                <Show when={settings().dashes.length}>
                  <optgroup label="Tasarımların">
                    <For each={settings().dashes}>{(d) => <option value={d.id}>{`Özel: ${d.name}`}</option>}</For>
                  </optgroup>
                </Show>
                <optgroup label="Hazır görünümler">
                  <For each={builtinViews()}>
                    {(o) => (
                      <option value={o.value} disabled={o.locked}>
                        {o.label}
                      </option>
                    )}
                  </For>
                </optgroup>
              </select>
            </div>
            <Show when={info()?.error}>
              <p class="error">{info()!.error}</p>
            </Show>
            <Show when={info()?.running}>
              <div class="urls">
                <For each={urls()} fallback={<CopyUrl label="Bu bilgisayar" url={`${info()!.url}${path()}`} hint="Yalnızca bu bilgisayardan açılır" />}>
                  {(u, i) => <CopyUrl label={urls().length > 1 ? `Adres ${i() + 1}` : "Adres"} url={u} hint={urls().length > 1 ? "Cihazınla aynı ağdaki adresi kullan" : undefined} />}
                </For>
              </div>
            </Show>
            <ul class="dr-note">
              <li>Telefon / tablet bu bilgisayarla aynı Wi-Fi ağında (aynı modemde) olmalı; misafir ağı çoğu zaman çalışmaz.</li>
              <li>Windows Güvenlik Duvarı ilk açılışta sorarsa “Özel ağlar” için izin ver. Sayfa açılmıyorsa güvenlik duvarında SRTR Pitwall'a izin verildiğini kontrol et.</li>
              <li>Sayfada: ekrana dokun → sonraki sayfa; köşedeki düğme → ekran seçimi ve tam ekran. Ekran, sayfa açıkken uyanık tutulmaya çalışılır.</li>
              <li>iPhone'da tam ekran için Paylaş › “Ana Ekrana Ekle” ile kısayol oluştur.</li>
            </ul>
          </div>
          <Show when={!proLocked(F.dashRemote) && info()?.running && qr()} fallback={<Show when={info()?.running && !urls().length}><p class="muted">QR kod için “Ağdaki cihazlara izin ver”i aç.</p></Show>}>
            <div class="dr-qr" data-no-i18n>
              <svg viewBox={`0 0 ${qr()!.n} ${qr()!.n}`} shape-rendering="crispEdges" role="img" aria-label="QR">
                <path d={qr()!.d} fill="#000" />
              </svg>
              <small>{qrUrl()}</small>
              <Show when={urls().length > 1}>
                <button class="btn ghost small" onClick={() => setUrlIdx((i) => (i + 1) % urls().length)}>
                  Diğer adres
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </section>
    </ProLockBox>
  );
}
