// Ses odaları (c116): Cloudflare Realtime SFU aracısı.
//
// Ses Supabase'den geçmez: her kullanıcı tek bir WebRTC bağlantısıyla Cloudflare'in SFU'suna bağlanır, kendi
// mikrofonunu oraya "push" eder, konuşma hakkı olanların seslerini oradan "pull" eder. Cloudflare anahtarı yalnızca
// burada durur; istemci SFU'ya doğrudan istek atamaz. Söz hakkı (voice_can_speak) burada denetlenir: söz hakkı
// olmayan birinin sesi kimseye iletilmez.
//
// Adres: https://<proje>.supabase.co/functions/v1/voice-sfu   (POST {action, ...})
//   join       {room?, code?}                 → odaya katıl (voice_room_join) + SFU oturumu aç → {room, session_id, ice}
//   push       {session_id, sdp, mid}         → mikrofon izini yayınla → {sdp (answer)}
//   pull       {session_id, targets:[sid]}    → konuşabilen kişilerin seslerini çek → {sdp?, renegotiate, tracks:[{target, mid}], denied:[sid]}
//   renegotiate{session_id, sdp}              → istemcinin cevabını SFU'ya ver
//   close      {session_id, mids, sdp?}       → çekilen izleri kapat → {sdp?}
//   leave      {session_id}                   → oturumu bırak
// Verify JWT: KAPALI (oturum fonksiyon içinde db.auth.getUser ile doğrulanır).
// Gizli değerler: CF_REALTIME_APP_ID, CF_REALTIME_APP_TOKEN (Cloudflare › Realtime › SFU uygulaması).
// Önce c116_guncelleme.sql çalıştırılmalı.

import { createClient } from "npm:@supabase/supabase-js@2";

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

function anonKey(): string {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    return keys.default ?? Object.values(keys)[0] ?? "";
  } catch {
    return "";
  }
}

const URL_ = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_, serviceKey(), { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const APP_ID = () => (Deno.env.get("CF_REALTIME_APP_ID") ?? "").trim();
const APP_TOKEN = () => (Deno.env.get("CF_REALTIME_APP_TOKEN") ?? "").trim();
const CF = () => `https://rtc.live.cloudflare.com/v1/apps/${APP_ID()}`;

// deno-lint-ignore no-explicit-any
async function cf<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(CF() + path, {
    method,
    headers: { Authorization: `Bearer ${APP_TOKEN()}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.errorCode) throw new Error(`SFU ${res.status}: ${j?.errorDescription ?? j?.errorCode ?? ""}`);
  return j as T;
}

// deno-lint-ignore no-explicit-any
const sdpOf = (j: any) => (j?.sessionDescription?.sdp ? { sdp: String(j.sessionDescription.sdp), type: String(j.sessionDescription.type) } : null);

const okId = (s: unknown) => typeof s === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST bekleniyor" });
  try {
    if (!APP_ID() || !APP_TOKEN()) return reply(503, { error: "Ses odaları sunucusu yapılandırılmadı (CF_REALTIME_APP_ID / CF_REALTIME_APP_TOKEN)" });
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: ud, error: ue } = await db.auth.getUser(jwt);
    const user = ud?.user;
    if (ue || !user) return reply(401, { error: "Giriş yapmalısın" });
    const me = user.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    // ---- Odaya katıl: yetki / davet kodu / kişi sınırı RPC'de (kullanıcının kendi oturumuyla) denetlenir
    if (action === "join") {
      const asUser = createClient(URL_, anonKey(), {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: room, error } = await asUser.rpc("voice_room_join", {
        p_room: typeof body.room === "string" ? body.room : null,
        p_code: typeof body.code === "string" ? body.code : null,
      });
      if (error || !room) return reply(400, { error: error?.message ?? "Odaya girilemedi" });
      const s = await cf<{ sessionId: string }>("POST", "/sessions/new");
      if (!okId(s.sessionId)) throw new Error("SFU oturumu açılamadı");
      // Aynı odadaki eski bağlantılarım (başka pencere / kopan bağlantı) bırakılır: kişi başı tek bağlantı
      await db.from("voice_sessions").delete().eq("room_id", room.id).eq("user_id", me);
      const { error: ie } = await db.from("voice_sessions").insert({ session_id: s.sessionId, room_id: room.id, user_id: me });
      if (ie) throw new Error(ie.message);
      return reply(200, { room, session_id: s.sessionId, ice: [{ urls: "stun:stun.cloudflare.com:3478" }] });
    }

    // ---- Diğer işlemler: oturum benim olmalı
    const sid = body?.session_id;
    if (!okId(sid)) return reply(400, { error: "Geçersiz oturum" });
    const { data: mine } = await db.from("voice_sessions").select("room_id, user_id").eq("session_id", sid).maybeSingle();
    if (!mine || mine.user_id !== me) return reply(403, { error: "Bu bağlantı senin değil (odaya yeniden gir)" });
    const room = mine.room_id as string;

    if (action === "leave") {
      await db.from("voice_sessions").delete().eq("session_id", sid);
      await db.from("voice_requests").delete().eq("room_id", room).eq("user_id", me);
      return reply(200, { ok: true });
    }

    // Odadan atıldıysa ya da yasaklandıysa hiçbir şey yapamaz
    const { data: role } = await db.rpc("voice_role", { p_room: room, p_user: me });
    if (!role) {
      await db.from("voice_sessions").delete().eq("session_id", sid);
      return reply(403, { error: "Bu odaya giremezsin" });
    }

    if (action === "push") {
      const sdp = String(body?.sdp ?? "");
      const mid = String(body?.mid ?? "");
      if (!sdp || sdp.length > 20000 || !mid) return reply(400, { error: "Geçersiz istek" });
      // İz adı kişiye özgüdür; yayınlamak serbest (giriş trafiği ücretsiz), dinletmek söz hakkına bağlı (pull)
      const trackName = `a-${me.replace(/-/g, "").slice(0, 24)}`;
      const j = await cf("POST", `/sessions/${sid}/tracks/new`, {
        sessionDescription: { sdp, type: "offer" },
        tracks: [{ location: "local", mid, trackName }],
      });
      await db.from("voice_sessions").update({ track_name: trackName, last_seen: new Date().toISOString() }).eq("session_id", sid);
      return reply(200, { sdp: sdpOf(j) });
    }

    if (action === "pull") {
      const targets: string[] = Array.isArray(body?.targets) ? body.targets.filter(okId).slice(0, 60) : [];
      if (!targets.length) return reply(200, { tracks: [], denied: [] });
      const { data: rows } = await db
        .from("voice_sessions")
        .select("session_id, user_id, track_name")
        .eq("room_id", room)
        .in("session_id", targets);
      const ok: { session_id: string; track_name: string }[] = [];
      const denied: string[] = [];
      const speakCache = new Map<string, boolean>();
      for (const t of targets) {
        const r = (rows ?? []).find((x) => x.session_id === t);
        if (!r || !r.track_name || r.user_id === me) {
          denied.push(t);
          continue;
        }
        let can = speakCache.get(r.user_id);
        if (can === undefined) {
          const { data } = await db.rpc("voice_can_speak", { p_room: room, p_user: r.user_id });
          can = !!data;
          speakCache.set(r.user_id, can);
        }
        if (can) ok.push(r);
        else denied.push(t);
      }
      if (!ok.length) return reply(200, { tracks: [], denied });
      const j = await cf("POST", `/sessions/${sid}/tracks/new`, {
        tracks: ok.map((r) => ({ location: "remote", sessionId: r.session_id, trackName: r.track_name })),
      });
      // deno-lint-ignore no-explicit-any
      const tracks = (j?.tracks ?? []).map((x: any) => ({
        target: ok.find((r) => r.track_name === x.trackName && (!x.sessionId || r.session_id === x.sessionId))?.session_id ?? x.sessionId,
        mid: x.mid,
        error: x.errorCode ? String(x.errorDescription ?? x.errorCode) : undefined,
      }));
      await db.from("voice_sessions").update({ last_seen: new Date().toISOString() }).eq("session_id", sid);
      return reply(200, { sdp: sdpOf(j), renegotiate: !!j?.requiresImmediateRenegotiation, tracks, denied });
    }

    if (action === "renegotiate") {
      const sdp = String(body?.sdp ?? "");
      if (!sdp || sdp.length > 40000) return reply(400, { error: "Geçersiz istek" });
      await cf("PUT", `/sessions/${sid}/renegotiate`, { sessionDescription: { sdp, type: "answer" } });
      return reply(200, { ok: true });
    }

    if (action === "close") {
      const mids: string[] = Array.isArray(body?.mids) ? body.mids.map(String).slice(0, 60) : [];
      if (!mids.length) return reply(200, {});
      const sdp = typeof body?.sdp === "string" && body.sdp ? body.sdp : null;
      const j = await cf("PUT", `/sessions/${sid}/tracks/close`, {
        tracks: mids.map((mid) => ({ mid })),
        ...(sdp ? { sessionDescription: { sdp, type: "offer" }, force: false } : { force: true }),
      });
      return reply(200, { sdp: sdpOf(j), renegotiate: !!j?.requiresImmediateRenegotiation });
    }

    return reply(400, { error: "Bilinmeyen işlem" });
  } catch (e) {
    return reply(500, { error: String((e as Error)?.message ?? e) });
  }
});
