// Hesap → E-posta bildirimleri: hangi bildirimler e-postayla da gelsin (c35 email_prefs).
// İşlem/hesap e-postaları (ödeme makbuzu, hediye PRO, PRO değişikliği, giriş kodları) kapatılamaz.
import { For, Show, createResource, createSignal } from "solid-js";
import { myEmailPrefs, setEmailPrefs, type EmailPrefKey, type EmailPrefs } from "@/cloud/account";

const CATS: { key: EmailPrefKey; label: string; sub: string }[] = [
  { key: "friends", label: "Arkadaşlık istekleri", sub: "Sana gelen arkadaşlık istekleri" },
  { key: "teams", label: "Takım bildirimleri", sub: "Davet, katılma isteği, kabul, duyuru, yöneticilik" },
  { key: "support", label: "Destek yanıtları", sub: "Destek talebine yanıt geldiğinde" },
  { key: "ads", label: "Reklam durumu", sub: "Reklamın yayına alındı, reddedildi ya da bitti" },
  { key: "pro", label: "PRO hatırlatmaları", sub: "PRO üyeliğinin bitmesine 10 gün ve 1 gün kala" },
  { key: "shots", label: "Ekran görüntüleri", sub: "6 ay açılmadığı için silinen ekran görüntüleri" },
];

export function EmailPrefsPanel() {
  const [prefs, { mutate }] = createResource(() => myEmailPrefs().catch(() => null));
  const [err, setErr] = createSignal("");
  const toggle = async (key: EmailPrefKey, on: boolean) => {
    const prev = prefs();
    mutate((p) => (p ? { ...p, [key]: on } : p));
    try {
      const next = await setEmailPrefs({ [key]: on } as Partial<EmailPrefs>);
      if (next) mutate(next);
      setErr("");
    } catch (e) {
      mutate(prev ?? null);
      setErr(String((e as Error).message ?? e));
    }
  };
  return (
    <section class="panel">
      <h3>E-posta bildirimleri</h3>
      <p class="muted small">Hangi bildirimlerin e-postayla da gelmesini istediğini seç. Uygulama içi bildirimler her zaman gelir.</p>
      <Show when={prefs()} fallback={<p class="muted">{prefs.loading ? "Yükleniyor…" : "E-posta tercihleri okunamadı"}</p>}>
        <For each={CATS}>
          {(c) => (
            <div class="row">
              <div>
                <b>{c.label}</b>
                <small>{c.sub}</small>
              </div>
              <label class="switch">
                <input type="checkbox" checked={!!prefs()![c.key]} onChange={(e) => void toggle(c.key, e.currentTarget.checked)} />
                <i />
              </label>
            </div>
          )}
        </For>
        <div class="row">
          <div>
            <b>Hesap ve ödeme e-postaları</b>
            <small>Ödeme makbuzları, hediye PRO, PRO süresi değişiklikleri ve giriş kodları her zaman gönderilir</small>
          </div>
          <label class="switch disabled" title="Her zaman açık">
            <input type="checkbox" checked disabled />
            <i />
          </label>
        </div>
      </Show>
      <Show when={err()}>
        <p class="error">{err()}</p>
      </Show>
    </section>
  );
}
