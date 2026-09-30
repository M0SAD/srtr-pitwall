// Supabase e-posta şablonlarını üretir: node supabase/templates/build.mjs
// Çıktılar bu klasöre .html olarak yazılır; Supabase → Authentication → Emails'e yapıştırılır.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const ORANGE = "#ff8a2a";
const BG = "#0b0d12";
const CARD = "#151821";
const LINE = "#262b36";
const TEXT = "#e9ecf2";
const MUTED = "#8a93a4";

function layout({ preheader, title, intro, code, codeLabel, after, footerNote, appNote }) {
  const kerb = Array.from({ length: 24 }, (_, i) => `<td style="height:6px;background:${i % 2 ? "#ffffff" : "#e5322d"};font-size:0;line-height:0">&nbsp;</td>`).join("");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <!-- Logo -->
      <tr><td style="padding:0 4px 18px 4px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:34px;height:34px;background:${ORANGE};border-radius:8px;text-align:center;vertical-align:middle;font:900 20px/34px Arial,Helvetica,sans-serif;color:#111;">&#10095;</td>
          <td style="padding-left:10px;font:800 20px/1 'Segoe UI',Arial,Helvetica,sans-serif;color:${TEXT};letter-spacing:0.5px;">SRTR <span style="color:${ORANGE};">Pitwall</span></td>
        </tr></table>
      </td></tr>
      <!-- Kart -->
      <tr><td style="background:${CARD};border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${kerb}</tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:28px 28px 8px 28px;font:700 22px/1.3 'Segoe UI',Arial,Helvetica,sans-serif;color:${TEXT};">${title}</td></tr>
          <tr><td style="padding:0 28px 18px 28px;font:400 15px/1.6 'Segoe UI',Arial,Helvetica,sans-serif;color:${MUTED};">${intro}</td></tr>
          ${
            code
              ? `<tr><td style="padding:4px 28px 6px 28px;font:600 11px/1 'Segoe UI',Arial,Helvetica,sans-serif;color:${MUTED};letter-spacing:1.5px;text-transform:uppercase;">${codeLabel}</td></tr>
          <tr><td style="padding:6px 28px 22px 28px;">
            <div style="background:${BG};border:1px solid ${LINE};border-left:4px solid ${ORANGE};border-radius:10px;padding:18px 0;text-align:center;font:700 34px/1 Consolas,'Courier New',monospace;letter-spacing:10px;color:${TEXT};">${code}</div>
          </td></tr>`
              : ""
          }
          <tr><td style="padding:0 28px 26px 28px;font:400 14px/1.6 'Segoe UI',Arial,Helvetica,sans-serif;color:${MUTED};">${after}</td></tr>
        </table>
      </td></tr>
      <!-- Alt bilgi -->
      <tr><td style="padding:18px 8px 0 8px;font:400 12px/1.6 'Segoe UI',Arial,Helvetica,sans-serif;color:#5d6574;text-align:center;">
        ${footerNote}<br>
        SRTR Pitwall · ${appNote}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}

// ---- Çok dilli metinler ----
// Supabase şablonları Go template kullanır: kullanıcının arayüz dili user_metadata.lang
// alanında durur (uygulama kayıtta ve dil değişince yazar). Her metin parçası dile göre seçilir.

import { readdirSync, readFileSync } from "node:fs";

const LOCALES = resolve(here, "../../src/locales");
const dicts = { tr: null };
for (const f of readdirSync(LOCALES)) {
  const m = /^([a-z]{2}(?:-[A-Z]{2})?)\.json$/.exec(f);
  if (m) dicts[m[1]] = JSON.parse(readFileSync(resolve(LOCALES, f), "utf8"));
}
const CODES = Object.keys(dicts).filter((c) => c !== "tr");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const B = (t) => `<b style="color:#e9ecf2">${t}</b>`;

/** Bir dil için metin: anahtar Türkçe, args yer tutucular (HTML olabilir) */
function tx(code, key, args = []) {
  const raw = code === "tr" ? key : dicts[code]?.[key] ?? key;
  return esc(raw).replace(/\{(\d)\}/g, (m, n) => (args[+n] !== undefined ? args[+n] : m));
}

/** Go template: dile göre seçim; Türkçe varsayılan */
function pick(fn) {
  let out = "";
  CODES.forEach((c, i) => (out += `{{ ${i ? "else if" : "if"} eq $l "${c}" }}${fn(c)}`));
  return out + `{{ else }}${fn("tr")}{{ end }}`;
}

const LANGVAR = '{{ $l := printf "%v" .Data.lang }}';

const TOKEN = "{{ .Token }}";
const specs = {
  "confirm-signup": {
    subject: ["SRTR Pitwall onay kodun: {0}", [TOKEN]],
    preheader: ["Hesabını onaylamak için kodun: {0}", [TOKEN]],
    title: ["Pite hoş geldin! 🏁"],
    intro: ["SRTR Pitwall hesabını oluşturduk. Onaylamak için aşağıdaki kodu uygulamadaki {0} ekranına yaz.", (c) => [B(tx(c, "E-postanı onayla"))]],
    codeLabel: ["Onay kodu"],
    after: ["Kod bir saat geçerlidir. Onayladıktan sonra ayarların buluta kaydedilir, düzenlerini paylaşabilir ve topluluğun düzenlerini indirebilirsin."],
    footerNote: ["Bu hesabı sen oluşturmadıysan bu e-postayı yok sayabilirsin."],
  },
  "reset-password": {
    subject: ["SRTR Pitwall şifre sıfırlama kodun: {0}", [TOKEN]],
    preheader: ["Şifreni sıfırlamak için kodun: {0}", [TOKEN]],
    title: ["Şifreni sıfırla"],
    intro: ["Şifre sıfırlama isteği aldık. Uygulamadaki {0} ekranına bu kodu ve yeni şifreni yaz.", (c) => [B(tx(c, "Yeni şifre belirle"))]],
    codeLabel: ["Sıfırlama kodu"],
    after: ["Kod bir saat geçerlidir ve bir kez kullanılabilir."],
    footerNote: ["Bu isteği sen yapmadıysan bu e-postayı yok say; şifren değişmez."],
  },
  "magic-link": {
    subject: ["SRTR Pitwall giriş kodun: {0}", [TOKEN]],
    preheader: ["Giriş kodun: {0}", [TOKEN]],
    title: ["Giriş kodun"],
    intro: ["SRTR Pitwall'a giriş yapmak için bu kodu kullan."],
    codeLabel: ["Giriş kodu"],
    after: ["Kod bir saat geçerlidir."],
    footerNote: ["Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin."],
  },
  "change-email": {
    subject: ["SRTR Pitwall e-posta değişikliği onay kodun: {0}", [TOKEN]],
    preheader: ["Yeni e-posta adresini onaylamak için kodun: {0}", [TOKEN]],
    title: ["Yeni e-postanı onayla"],
    intro: ["SRTR Pitwall hesabının e-postasını {0} olarak değiştirmek istedin. Onaylamak için bu kodu kullan.", [B("{{ .NewEmail }}")]],
    codeLabel: ["Onay kodu"],
    after: ["Kod bir saat geçerlidir."],
    footerNote: ["Bu isteği sen yapmadıysan bu e-postayı yok say ve şifreni değiştir."],
  },
  reauthentication: {
    subject: ["SRTR Pitwall doğrulama kodun: {0}", [TOKEN]],
    preheader: ["Doğrulama kodun: {0}", [TOKEN]],
    title: ["Kimliğini doğrula"],
    intro: ["Hesabında önemli bir değişiklik yapmak üzeresin. Devam etmek için bu kodu gir."],
    codeLabel: ["Doğrulama kodu"],
    after: ["Kod birkaç dakika geçerlidir."],
    footerNote: ["Bu isteği sen yapmadıysan şifreni değiştir."],
  },
  "password-changed": {
    subject: ["SRTR Pitwall şifren değiştirildi"],
    preheader: ["Hesabının şifresi değiştirildi."],
    title: ["Şifren değiştirildi"],
    intro: ["{0} hesabının şifresi az önce değiştirildi.", [B("{{ .Email }}")]],
    after: ["Bunu sen yaptıysan başka bir şey yapmana gerek yok. Sen yapmadıysan hemen uygulamadan {0} ile şifreni sıfırla.", (c) => [B(tx(c, "Şifremi unuttum"))]],
    footerNote: ["Güvenlik bildirimi"],
    noCode: true,
  },
};

const SUBJECTS = {
  "confirm-signup": "SRTR Pitwall ✓ {{ .Token }}",
  "reset-password": "SRTR Pitwall 🔑 {{ .Token }}",
  "magic-link": "SRTR Pitwall ➜ {{ .Token }}",
  "change-email": "SRTR Pitwall ✉ {{ .Token }}",
  reauthentication: "SRTR Pitwall 🔒 {{ .Token }}",
  "password-changed": "SRTR Pitwall 🔐 ✓",
};

const slot = (spec) => (spec ? pick((c) => tx(c, spec[0], typeof spec[1] === "function" ? spec[1](c) : spec[1] ?? [])) : "");

const templates = {};
for (const [name, sp] of Object.entries(specs)) {
  const html =
    LANGVAR +
    layout({
      preheader: slot(sp.preheader),
      title: slot(sp.title),
      intro: slot(sp.intro),
      codeLabel: sp.noCode ? "" : slot(sp.codeLabel),
      code: sp.noCode ? "" : TOKEN,
      after: slot(sp.after),
      footerNote: slot(sp.footerNote),
      appNote: pick((c) => tx(c, "iRacing overlay uygulaması")),
    });
  // Supabase konu satırını 255 karakterle sınırlar: dilden bağımsız kısa konu; dile göre
  // açıklama e-posta önizlemesinde (preheader) görünür.
  templates[name] = { subject: SUBJECTS[name], html };
}

const subjects = {};
for (const [name, t] of Object.entries(templates)) {
  writeFileSync(resolve(here, `${name}.html`), t.html);
  subjects[name] = t.subject;
}
writeFileSync(resolve(here, "subjects.json"), JSON.stringify(subjects, null, 2) + "\n");
console.log("Şablonlar yazıldı:", Object.keys(templates).join(", "));
