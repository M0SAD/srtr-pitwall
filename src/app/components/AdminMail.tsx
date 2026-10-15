// Yönetim › E-posta (c123): Gmail / SMTP ayarları uygulamadan. Supabase paneline girmeden:
//   * uygulamanın kendi e-postaları (bildirim, rapor, destek; pitwall-jobs) → mail_settings
//   * kayıt doğrulama / şifre sıfırlama e-postaları (Supabase Auth) → Management API (PITWALL_MGMT_TOKEN)
// İşi "admin-mail" fonksiyonu yapar; şifre istemciye hiçbir zaman geri gelmez.

import { Show, createResource, createSignal } from "solid-js";
import { t } from "@/sdk/i18n";
import { callFunction } from "@/cloud/supabase";
import { openUrl } from "../ui";
import * as I from "../icons";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

interface MailState {
  settings: { host: string; port: number; user: string; sender_name: string } | null;
  has_pass: boolean;
  mgmt: boolean;
  auth: { smtp: boolean; smtp_host: string; smtp_user: string; confirm_email: boolean; rate: number | null } | null;
  auth_error: string;
  email: string;
}

const APP_PASSWORDS = "https://myaccount.google.com/apppasswords";
const TWO_STEP = "https://myaccount.google.com/signinoptions/twosv";
const TOKENS = "https://supabase.com/dashboard/account/tokens";

export function AdminMail(p: { run: Run }) {
  const [st, { refetch }] = createResource(() => callFunction<MailState>("admin-mail", { action: "get" }));
  const [host, setHost] = createSignal("");
  const [port, setPort] = createSignal("");
  const [user, setUser] = createSignal("");
  const [pass, setPass] = createSignal("");
  const [sender, setSender] = createSignal("");
  const [testTo, setTestTo] = createSignal("");
  const [busy, setBusy] = createSignal("");
  const [msg, setMsg] = createSignal<{ ok: boolean; text: string } | null>(null);

  const v = (sig: () => string, saved: string | number | undefined, def: string) => sig() || (saved !== undefined && saved !== "" ? String(saved) : def);
  const cur = () => ({
    host: v(host, st()?.settings?.host, "smtp.gmail.com"),
    port: Number(v(port, st()?.settings?.port, "465")),
    user: v(user, st()?.settings?.user, ""),
    sender_name: v(sender, st()?.settings?.sender_name, "SRTR Pitwall"),
  });

  const save = async () => {
    setBusy("save");
    setMsg(null);
    try {
      const r = await callFunction<{ ok: boolean; auth_ok: boolean; auth_error: string }>("admin-mail", { action: "save", ...cur(), pass: pass() });
      setPass("");
      setMsg(
        r.auth_ok
          ? { ok: true, text: t("Kaydedildi. Uygulama e-postaları ve kayıt / şifre sıfırlama e-postaları bu hesaptan gidecek.") }
          : { ok: false, text: t("Uygulama e-postaları için kaydedildi, ama kayıt e-postası ayarı Supabase'e gönderilemedi: {0}", r.auth_error) },
      );
      void refetch();
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error)?.message ?? e) });
    }
    setBusy("");
  };

  const test = async () => {
    setBusy("test");
    setMsg(null);
    try {
      const r = await callFunction<{ ok: boolean; to: string }>("admin-mail", { action: "test", ...cur(), pass: pass(), to: testTo().trim() });
      setMsg({ ok: true, text: t("Deneme e-postası gönderildi: {0}. Gelen kutunu (ve spam klasörünü) kontrol et.", r.to) });
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error)?.message ?? e) });
    }
    setBusy("");
  };

  return (
    <section class="panel admin-panel am-panel">
      <h3>E-posta (SMTP)</h3>
      <p class="muted small">
        Uygulamanın gönderdiği bütün e-postalar (kayıt doğrulama, şifre sıfırlama, bildirimler, destek yanıtları) buradaki hesaptan gider. Şifreyi
        değiştirdiğinde buradan kaydetmen yeterli; Supabase paneline girmen gerekmez.
      </p>

      <Show when={st.error}>
        <p class="am-msg bad">
          {String((st.error as Error)?.message ?? st.error)}
          <br />
          <small>{t("“admin-mail” fonksiyonu Supabase'e yüklenmemiş olabilir (kurulum aşağıda).")}</small>
        </p>
      </Show>

      <Show when={st()}>
        {(s) => (
          <div class="am-status">
            <span classList={{ ok: s().has_pass, bad: !s().has_pass }}>
              {s().has_pass ? <I.Check /> : <I.TriangleAlert />}
              {s().has_pass ? t("Uygulama e-postaları: {0}", s().settings?.user ?? "") : t("Uygulama e-postaları: ayarlanmadı")}
            </span>
            <span classList={{ ok: !!s().auth?.smtp, bad: !s().auth?.smtp }}>
              {s().auth?.smtp ? <I.Check /> : <I.TriangleAlert />}
              {!s().mgmt
                ? t("Kayıt e-postaları: Supabase erişim anahtarı eksik (bir kerelik kurulum)")
                : s().auth_error
                  ? t("Kayıt e-postaları: {0}", s().auth_error)
                  : s().auth?.smtp
                    ? t("Kayıt e-postaları: {0}", s().auth!.smtp_user || s().auth!.smtp_host)
                    : t("Kayıt e-postaları: Supabase'in sınırlı kendi postası (saatte birkaç e-posta)")}
            </span>
          </div>
        )}
      </Show>

      <div class="row">
        <div>
          <b>Gmail adresi</b>
          <small>E-postalar bu adresten gider</small>
        </div>
        <input class="input" type="email" placeholder="ornek@gmail.com" value={cur().user} onInput={(e) => setUser(e.currentTarget.value.trim())} />
      </div>
      <div class="row">
        <div>
          <b>Uygulama şifresi</b>
          <small>
            {st()?.has_pass
              ? t("Kayıtlı bir şifre var. Değiştirmek istemiyorsan boş bırak.")
              : t("Normal Gmail şifren değil: Google'ın verdiği 16 harflik uygulama şifresi.")}
          </small>
        </div>
        <input
          class="input"
          type="password"
          autocomplete="new-password"
          placeholder={st()?.has_pass ? "••••••••••••••••" : "abcd efgh ijkl mnop"}
          value={pass()}
          onInput={(e) => setPass(e.currentTarget.value)}
        />
      </div>
      <div class="am-help">
        <b>
          <I.KeyRound /> {t("Uygulama şifresi nasıl alınır")}
        </b>
        <ol>
          <li>
            {t("Google hesabında 2 Adımlı Doğrulama açık olmalı.")}{" "}
            <a class="msg-link" href={TWO_STEP} onClick={(e) => (e.preventDefault(), openUrl(TWO_STEP))}>
              {t("2 Adımlı Doğrulama")} <I.ExternalLink />
            </a>
          </li>
          <li>
            {t("Uygulama şifreleri sayfasını aç, bir ad yaz (ör. Pitwall) ve Oluştur'a bas.")}{" "}
            <a class="msg-link" href={APP_PASSWORDS} onClick={(e) => (e.preventDefault(), openUrl(APP_PASSWORDS))}>
              myaccount.google.com/apppasswords <I.ExternalLink />
            </a>
          </li>
          <li>{t("Çıkan 16 harfi kopyalayıp yukarıdaki kutuya yapıştır (boşluklar önemli değil) ve Kaydet'e bas.")}</li>
          <li>{t("Google şifreni değiştirirsen uygulama şifreleri iptal olur: yenisini alıp buraya tekrar gir.")}</li>
        </ol>
      </div>
      <details class="am-adv">
        <summary>{t("Gelişmiş: sunucu, port, gönderen adı")}</summary>
        <div class="row">
          <b>SMTP sunucusu</b>
          <input class="input" value={cur().host} onInput={(e) => setHost(e.currentTarget.value.trim())} />
        </div>
        <div class="row">
          <b>Port</b>
          <input class="input" type="number" style={{ width: "100px" }} value={cur().port} onInput={(e) => setPort(e.currentTarget.value)} />
        </div>
        <div class="row">
          <b>Gönderen adı</b>
          <input class="input" maxLength={60} value={cur().sender_name} onInput={(e) => setSender(e.currentTarget.value)} />
        </div>
      </details>

      <div class="am-act">
        <button class="btn primary" disabled={!!busy() || !cur().user} onClick={() => void save()}>
          <I.Check /> {busy() === "save" ? t("Kaydediliyor…") : t("Kaydet")}
        </button>
        <input
          class="input am-to"
          type="email"
          placeholder={st()?.email || t("Deneme adresi")}
          value={testTo()}
          onInput={(e) => setTestTo(e.currentTarget.value)}
        />
        <button class="btn" disabled={!!busy() || !cur().user} onClick={() => void test()}>
          <I.Send /> {busy() === "test" ? t("Gönderiliyor…") : t("Deneme e-postası gönder")}
        </button>
      </div>
      <Show when={msg()}>
        {(m) => (
          <p class="am-msg" classList={{ ok: m().ok, bad: !m().ok }}>
            {m().text}
          </p>
        )}
      </Show>

      <Show when={st()?.mgmt && st()?.auth}>
        <div class="row">
          <div>
            <b>Kayıtta e-posta doğrulaması</b>
            <small>
              Açıkken yeni üye e-postasındaki bağlantıya tıklayınca hesabı açılır. Kapalıyken e-posta beklemeden hemen giriş yapar (e-posta gönderilemezse
              geçici çözüm).
            </small>
          </div>
          <input
            type="checkbox"
            checked={!!st()?.auth?.confirm_email}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              void p.run(
                async () => {
                  await callFunction("admin-mail", { action: "confirm", on });
                  await refetch();
                },
                on ? t("E-posta doğrulaması açıldı") : t("E-posta doğrulaması kapatıldı"),
              );
            }}
          />
        </div>
      </Show>

      <Show when={st() && !st()!.mgmt}>
        <div class="am-setup">
          <b>
            <I.Wrench /> {t("Bir kerelik kurulum: kayıt e-postaları için Supabase erişim anahtarı")}
          </b>
          <p class="muted small">
            Kayıt doğrulama ve şifre sıfırlama e-postalarının ayarı Supabase'in kendisinde durur. Uygulamanın bunu senin yerine değiştirebilmesi için bir kez
            erişim anahtarı tanımlaman gerekir; sonra hep buradan değiştirirsin.
          </p>
          <ol>
            <li>
              <a class="msg-link" href={TOKENS} onClick={(e) => (e.preventDefault(), openUrl(TOKENS))}>
                supabase.com/dashboard/account/tokens <I.ExternalLink />
              </a>{" "}
              {t("sayfasında “Generate new token” ile bir anahtar oluştur ve kopyala.")}
            </li>
            <li>{t("Supabase › Edge Functions › Secrets › Add new secret: ad PITWALL_MGMT_TOKEN, değer kopyaladığın anahtar.")}</li>
            <li>{t("Bu sayfayı yenile; üstte “Kayıt e-postaları” yeşil olunca Kaydet'e bir kez daha bas.")}</li>
          </ol>
        </div>
      </Show>
    </section>
  );
}
