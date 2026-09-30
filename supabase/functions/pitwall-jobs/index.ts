// SRTR Pitwall sunucu işleri (veritabanı tarafından çağrılır, uygulama çağırmaz):
//   {"type":"report","id":"<rapor id>"}  Yeni rapor: yöneticilere e-posta gönderir
//   {"type":"cleanup"}                   6 aydır açılmayan ekran görüntülerini siler,
//                                        sahibine uygulama içi bildirim ve e-posta gönderir
//
// Kurulum: docs/SUPABASE.md → "Sunucu işleri". JWT doğrulaması kapalı çalışır (veritabanı çağırır);
// işler tekrar çağrılsa da zarar vermez (rapor bir kez bildirilir, temizlik sadece süresi dolanları siler).
//
// Gizli değerler (Edge Functions → Secrets):
//   SMTP_PASS  Gmail uygulama şifresi (e-posta göndermek için; yoksa sadece uygulama içi bildirim)
//   SMTP_USER  (isteğe bağlı) varsayılan: erkinazcan@gmail.com
//   SMTP_HOST / SMTP_PORT (isteğe bağlı) varsayılan: smtp.gmail.com / 465
//   REPORT_TO  (isteğe bağlı) rapor e-postalarının ek alıcıları, virgülle

import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return keys.default ?? Object.values(keys)[0] ?? "";
  } catch {
    return "";
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SUPABASE_URL, serviceKey(), { auth: { persistSession: false } });

const SMTP_USER = Deno.env.get("SMTP_USER") ?? "erkinazcan@gmail.com";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? 465);

const SIX_MONTHS_MS = 182 * 24 * 3600 * 1000;

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function page(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#0e1116;font-family:Segoe UI,Arial,sans-serif;color:#eceff4">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
  <div style="font-weight:800;font-size:18px;letter-spacing:.02em;margin-bottom:14px"><span style="color:#ff8a2a">&#9656;</span> SRTR Pitwall</div>
  <div style="background:#181b21;border:1px solid #2a2f3a;border-radius:12px;padding:22px">
    <h2 style="margin:0 0 12px;font-size:18px;color:#fff">${esc(title)}</h2>
    ${body}
  </div>
</div></body></html>`;
}

async function sendMail(to: string[], subject: string, html: string) {
  if (!SMTP_PASS || to.length === 0) return false;
  const client = new SMTPClient({
    connection: { hostname: SMTP_HOST, port: SMTP_PORT, tls: true, auth: { username: SMTP_USER, password: SMTP_PASS } },
  });
  try {
    await client.send({ from: `SRTR Pitwall <${SMTP_USER}>`, to, subject, html, content: "auto" });
  } finally {
    await client.close();
  }
  return true;
}

async function userInfo(id: string) {
  const { data } = await db.auth.admin.getUserById(id);
  const u = data?.user;
  return { email: u?.email ?? "", lang: String(u?.user_metadata?.lang ?? "en") };
}

// ---------------------------------------------------------------------------
// Rapor bildirimi (yöneticiye)
// ---------------------------------------------------------------------------

const REASONS: Record<string, { tr: string; en: string }> = {
  inappropriate: { tr: "Uygunsuz içerik", en: "Inappropriate content" },
  spam: { tr: "Spam / reklam", en: "Spam / advertising" },
  copyright: { tr: "Telif hakkı ihlali", en: "Copyright infringement" },
  harassment: { tr: "Hakaret / taciz", en: "Harassment / abuse" },
  impersonation: { tr: "Başkasının içeriği / kimliği", en: "Someone else's content / identity" },
  other: { tr: "Diğer", en: "Other" },
};

const KINDS: Record<string, { tr: string; en: string }> = {
  shot: { tr: "Ekran görüntüsü", en: "Screenshot" },
  shot_comment: { tr: "Ekran görüntüsü yorumu", en: "Screenshot comment" },
  layout: { tr: "Paylaşılan düzen", en: "Shared layout" },
  layout_comment: { tr: "Düzen yorumu", en: "Layout comment" },
};

async function report(id: string) {
  const { data: r, error } = await db.from("report_list").select("*").eq("id", id).maybeSingle();
  if (error || !r) return { ok: false, error: error?.message ?? "rapor yok" };
  if (r.notified_at) return { ok: true, skipped: true };

  const { data: admins } = await db.from("profiles").select("id").eq("is_admin", true);
  const to: string[] = [];
  let lang = "tr";
  for (const a of admins ?? []) {
    const u = await userInfo(a.id);
    if (u.email) to.push(u.email);
    lang = u.lang;
  }
  for (const x of (Deno.env.get("REPORT_TO") ?? "").split(",").map((s) => s.trim()).filter(Boolean)) to.push(x);
  const L = lang === "tr" ? "tr" : "en";
  const reason = REASONS[r.reason]?.[L] ?? r.reason;
  const kind = KINDS[r.target_type]?.[L] ?? r.target_type;
  const t = r.target ?? {};
  const img = t.thumb_path ? `${SUPABASE_URL}/storage/v1/object/public/screenshots/${t.thumb_path}` : "";
  const row = (k: string, v: string) =>
    `<tr><td style="color:#8b93a3;padding:4px 12px 4px 0;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0">${v}</td></tr>`;
  const title = L === "tr" ? "Yeni rapor" : "New report";
  const body = `
    ${img ? `<img src="${img}" alt="" style="width:100%;border-radius:8px;margin-bottom:12px">` : ""}
    <table style="font-size:14px;border-collapse:collapse">
      ${row(L === "tr" ? "Sebep" : "Reason", `<b style="color:#ffb35c">${esc(reason)}</b>`)}
      ${row(L === "tr" ? "Tür" : "Type", esc(kind))}
      ${row(L === "tr" ? "İçerik" : "Content", esc(t.title ?? t.body ?? (L === "tr" ? "(silinmiş)" : "(deleted)")))}
      ${row(L === "tr" ? "İçerik sahibi" : "Owner", esc(t.author ?? "?"))}
      ${row(L === "tr" ? "Raporlayan" : "Reported by", esc(r.reporter_name))}
      ${r.note ? row(L === "tr" ? "Not" : "Note", esc(r.note)) : ""}
    </table>
    <p style="color:#8b93a3;font-size:13px;margin:16px 0 0">${
      L === "tr" ? "Uygulamada Hesap → Moderasyon bölümünden inceleyebilirsin." : "Review it in the app under Account → Moderation."
    }</p>`;
  const sent = await sendMail([...new Set(to)], `SRTR Pitwall · ${title}: ${reason}`, page(title, body));
  await db.from("reports").update({ notified_at: new Date().toISOString() }).eq("id", id);
  return { ok: true, sent };
}

// ---------------------------------------------------------------------------
// 6 aydır açılmayan görsellerin silinmesi
// ---------------------------------------------------------------------------

const EXPIRED: Record<string, { subject: string; line: string; hint: string }> = {
  tr: {
    subject: "Görselin otomatik olarak silindi",
    line: "Görselin 6 aydır görüntülenmediği için otomatik olarak silinmiştir:",
    hint: "Yer açmak için uzun süre açılmayan görseller kaldırılır. İstersen yeniden paylaşabilirsin.",
  },
  en: {
    subject: "Your screenshot was deleted automatically",
    line: "Your screenshot was deleted automatically because it hasn't been viewed for 6 months:",
    hint: "Images that haven't been opened for a long time are removed to save space. You can share it again anytime.",
  },
  de: {
    subject: "Dein Screenshot wurde automatisch gelöscht",
    line: "Dein Screenshot wurde automatisch gelöscht, weil er 6 Monate lang nicht angesehen wurde:",
    hint: "Bilder, die lange nicht geöffnet wurden, werden entfernt, um Speicher zu sparen. Du kannst es jederzeit erneut teilen.",
  },
  es: {
    subject: "Tu captura se ha eliminado automáticamente",
    line: "Tu captura se ha eliminado automáticamente porque no se ha visto en 6 meses:",
    hint: "Las imágenes que no se abren durante mucho tiempo se eliminan para ahorrar espacio. Puedes volver a compartirla cuando quieras.",
  },
  "pt-BR": {
    subject: "Sua captura foi excluída automaticamente",
    line: "Sua captura foi excluída automaticamente porque não foi visualizada por 6 meses:",
    hint: "Imagens que não são abertas por muito tempo são removidas para economizar espaço. Você pode compartilhá-la de novo quando quiser.",
  },
  "pt-PT": {
    subject: "A tua captura foi eliminada automaticamente",
    line: "A tua captura foi eliminada automaticamente porque não foi vista durante 6 meses:",
    hint: "As imagens que não são abertas durante muito tempo são removidas para poupar espaço. Podes voltar a partilhá-la quando quiseres.",
  },
  fr: {
    subject: "Ta capture a été supprimée automatiquement",
    line: "Ta capture a été supprimée automatiquement car elle n'a pas été consultée depuis 6 mois :",
    hint: "Les images qui ne sont pas ouvertes pendant longtemps sont supprimées pour libérer de l'espace. Tu peux la repartager quand tu veux.",
  },
  it: {
    subject: "Il tuo screenshot è stato eliminato automaticamente",
    line: "Il tuo screenshot è stato eliminato automaticamente perché non è stato visualizzato per 6 mesi:",
    hint: "Le immagini non aperte da molto tempo vengono rimosse per risparmiare spazio. Puoi ricondividerlo quando vuoi.",
  },
  nl: {
    subject: "Je screenshot is automatisch verwijderd",
    line: "Je screenshot is automatisch verwijderd omdat hij 6 maanden niet is bekeken:",
    hint: "Afbeeldingen die lang niet zijn geopend, worden verwijderd om ruimte te besparen. Je kunt hem altijd opnieuw delen.",
  },
  pl: {
    subject: "Twój zrzut ekranu został automatycznie usunięty",
    line: "Twój zrzut ekranu został automatycznie usunięty, ponieważ nie był oglądany od 6 miesięcy:",
    hint: "Obrazy, które długo nie były otwierane, są usuwane, aby oszczędzać miejsce. Możesz udostępnić go ponownie w każdej chwili.",
  },
  sv: {
    subject: "Din skärmdump har raderats automatiskt",
    line: "Din skärmdump har raderats automatiskt eftersom den inte har visats på 6 månader:",
    hint: "Bilder som inte har öppnats på länge tas bort för att spara utrymme. Du kan dela den igen när du vill.",
  },
  fi: {
    subject: "Kuvakaappauksesi poistettiin automaattisesti",
    line: "Kuvakaappauksesi poistettiin automaattisesti, koska sitä ei ole katsottu 6 kuukauteen:",
    hint: "Pitkään avaamattomat kuvat poistetaan tilan säästämiseksi. Voit jakaa sen uudelleen milloin tahansa.",
  },
  ru: {
    subject: "Твой скриншот удалён автоматически",
    line: "Твой скриншот удалён автоматически, так как его не просматривали 6 месяцев:",
    hint: "Изображения, которые долго не открывали, удаляются для экономии места. Ты можешь снова поделиться им в любое время.",
  },
  "zh-CN": {
    subject: "你的截图已被自动删除",
    line: "你的截图因 6 个月未被查看，已被自动删除：",
    hint: "长时间未被打开的图片会被删除以节省空间。你可以随时重新分享。",
  },
  ja: {
    subject: "スクリーンショットが自動的に削除されました",
    line: "6か月間閲覧されなかったため、スクリーンショットが自動的に削除されました:",
    hint: "長期間開かれていない画像は容量節約のため削除されます。いつでも再共有できます。",
  },
};

async function cleanup() {
  const before = new Date(Date.now() - SIX_MONTHS_MS).toISOString();
  const { data: rows, error } = await db
    .from("screenshots")
    .select("id,user_id,title,path,thumb_path,created_at")
    .lt("last_viewed_at", before)
    .limit(500);
  if (error) return { ok: false, error: error.message };
  if (!rows?.length) return { ok: true, deleted: 0 };

  const paths = rows.flatMap((r) => [r.path, r.thumb_path]);
  for (let i = 0; i < paths.length; i += 100) {
    await db.storage.from("screenshots").remove(paths.slice(i, i + 100));
  }
  await db.from("screenshots").delete().in("id", rows.map((r) => r.id));
  await db.from("notifications").insert(
    rows.map((r) => ({ user_id: r.user_id, kind: "shot_expired", data: { title: r.title, created_at: r.created_at } })),
  );

  // Her kullanıcıya tek e-posta
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  let mails = 0;
  for (const [uid, list] of byUser) {
    const u = await userInfo(uid);
    if (!u.email) continue;
    const m = EXPIRED[u.lang] ?? EXPIRED[u.lang.split("-")[0]] ?? EXPIRED.en;
    const items = list.map((r) => `<li style="margin:4px 0"><b>${esc(r.title)}</b></li>`).join("");
    const body = `<p style="margin:0 0 8px">${esc(m.line)}</p><ul style="padding-left:18px;margin:0 0 12px">${items}</ul>
      <p style="color:#8b93a3;font-size:13px;margin:0">${esc(m.hint)}</p>`;
    try {
      if (await sendMail([u.email], `SRTR Pitwall · ${m.subject}`, page(m.subject, body))) mails++;
    } catch (e) {
      console.error("mail", uid, e);
    }
  }
  return { ok: true, deleted: rows.length, mails };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("SRTR Pitwall jobs", { status: 200 });
  let body: { type?: string; id?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* boş */
  }
  try {
    const res =
      body.type === "report" && body.id ? await report(body.id) : body.type === "cleanup" ? await cleanup() : { ok: false, error: "bilinmeyen iş" };
    return Response.json(res, { status: res.ok ? 200 : 400 });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
