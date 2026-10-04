// Ekip (uzaktan pit ekibi, c53) — sürücü tarafı. Overlay penceresinde (uygulama açık olduğu sürece) çalışır:
//  - ekibimde izleyen varsa canlı veriye "crew" alanını ekler (bkz. social.ts team-fuel-local)
//  - ekip üyelerinin gönderdiği komutları alır (Realtime + yoklama), denetler, iRacing'e uygular ve sonucu yazar
//  - uygulanan her komutu ekranın alt ortasındaki ekip kutucuğunda gösterir ("Ali: yakıt 45 L")
//  - Ekip odası (c64): odama yazılan mesajları Mesajlar overlay'ine yayınlar; ayar açıksa kutucukta da gösterir
//  - Ekip Pitwall'ı (c58): ekipten biri paneli açıkken çevredeki araçları, tur / delta / bayrak / hava bilgisini ve
//    spotter durumunu saniyede bir sunucuya yazar (crew_wall_push). Kimse izlemiyorken telemetri aboneliği de
//    veri gönderimi de kapalıdır; 5 sn'de bir yalnızca "izleyen var mı" diye sorulur.
//  - "Sürücünün gözünden" görünümler (c79): ekipten biri Live Timing / Mühendis / Olaylar sekmesini açtıysa (sunucu
//    crew_ext_push dönüşünde `want` ile bildirir) sıralamanın tamamını, mühendis ekranı konularını ve olay listesini
//    3 sn'de bir yazar (olaylar yalnızca değişince). Yalnızca veri gider: tekrar / kamera komutu alınmaz.
//  - "Ekip kontrolünü durdur" kısayolu: ana anahtarı kapatır (bekleyen komutlar da reddedilir)
// Komutlar sadece sim'e bağlıyken ve ana anahtar açıkken uygulanır; aksi halde sebebiyle reddedilir.

import { createSignal, type Accessor } from "solid-js";
import { Channel, invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { cloudEnabled, session } from "@/cloud/supabase";
import { settings } from "@/sdk/settings";
import type { Packet, Status, TopicMap } from "@/sdk/types";
import { t } from "@/sdk/i18n";
import { friendLook, messageBeep } from "@/cloud/social";
import { broadcastOvMsg, ovMsgShown, type OvMsg } from "@/sdk/ovmsg";
import { CREWCALL_EVENT, type CrewCallEvt } from "@/sdk/crewcall";
import { crewCommandText, crewControlSet, crewDone, crewDrivers, crewList, crewPending, crewRoom, crewSessionEnd, crewSimOk, crewState, crewWallPush, crewExtPush, packRows, CREW_EXT_MAX, onCrewChat, onCrewCommands, type CrewExtE, type CrewExtG, type CrewExtT, type CrewChatMsg, type CrewCommand, type CrewLive, type CrewMember, type CrewSpeech, type CrewWall, type WallRow } from "@/cloud/crew";

/** Ekip kutucuğu: ekranın alt ortasında birkaç saniye görünüp solan kısa bildirim (Host.tsx çizer) */
export interface CrewBox {
  id: string;
  from: string;
  body: string;
  /** Solmaya başladı */
  out?: boolean;
}
const [box, setBox] = createSignal<CrewBox | null>(null);
export { box as crewBox };
function showCrewBox(x: CrewBox, ms = 6000) {
  setBox(x);
  setTimeout(() => setBox((c) => (c?.id === x.id ? { ...c, out: true } : c)), ms);
  setTimeout(() => setBox((c) => (c?.id === x.id ? null : c)), ms + 700);
}
/** Ayar: "Ekip mesajlarını kutucukta göster" (yok = açık) */
const boxOn = () => settings().general.social.crewBox !== false;

let members: CrewMember[] = [];
let controlOn = false;
let wallOn = true;
let extra: CrewLive | null = null;
let started = false;

/** Canlı veriye eklenecek ekip alanı; ekibimde izleyen yoksa null (veri gönderilmez) */
export function crewLiveExtra(): CrewLive | null {
  if (!extra || !members.some((m) => m.can_view || m.can_control)) return null;
  return { ...extra, ctl: controlOn && crewSimOk(extra.sim) };
}

/**
 * Kullanıcı gerçek bir simde KENDİ aracının sürücüsü mü (demo / önizleme değil; izleyici, spotter, tekrar dosyası
 * ya da araçta takım arkadaşı değil). Arkadaşlara "yarışta" durumu, canlı veri ve ekip pitwall'u yalnızca bu
 * doğruyken açıktır. Karar Rust tarafında verilir (src-tauri/src/sims/role.rs).
 */
export function isDriving(s: Status | undefined): boolean {
  return !!s?.connected && !s.demo && !s.preview && s.driver !== false;
}

export function startCrew(status: Accessor<Status | undefined>) {
  if (started || !cloudEnabled) return;
  started = true;

  // Sadece kendi aracımın sürücüsüyken: izlerken / spotter'ken / tekrarda odam kapalıdır (veri yok, komut reddedilir)
  const racing = () => isDriving(status());
  const inSim = () => {
    const s = status();
    return !!s?.connected && !s.demo && !s.preview;
  };

  // c75: yarıştan çıkınca (70 sn bekleme payı: oturum geçişi / kısa kopma) odam boşaltılır — sunucu sohbeti siler
  // ve spotter yerini açar. Sunucu ayrıca kendi ölçütüyle denetler (hâlâ yarışta görünüyorsam hiçbir şey silinmez)
  // ve uygulama kapanırsa ilk okumada kendisi temizler; bu çağrı yalnızca temizliği geciktirmemek içindir.
  let wasRacing = false;
  let endAt = 0;
  setInterval(() => {
    const r = racing();
    if (r) endAt = 0;
    else if (wasRacing) endAt = Date.now() + 70_000;
    wasRacing = r;
    if (endAt && Date.now() >= endAt) {
      endAt = 0;
      if (session() && members.length) void crewSessionEnd().catch(() => {});
    }
  }, 5000);

  void listen<CrewLive>("crew-live-local", (e) => {
    extra = e.payload;
  });

  // ---- Ekibim ve ana anahtar ----
  let uid = "";
  let stopRt: () => void = () => {};
  let rtFor = "";
  const refresh = async () => {
    const me = session()?.user.id ?? "";
    if (me !== uid) {
      uid = me;
      members = [];
      controlOn = false;
      handled.clear();
    }
    if (!me) {
      stopRt();
      stopRt = () => {};
      rtFor = "";
      return;
    }
    try {
      const [st, list] = await Promise.all([crewState(), crewList()]);
      if (session()?.user.id !== me) return;
      members = list;
      controlOn = !!st?.control_on;
      wallOn = st?.wall_on !== false;
    } catch {
      return; // eski sunucu (c53 yok) ya da ağ hatası: mevcut durum kalır
    }
    // Komut kanalı: ekibim varsa açık
    const want = members.length ? me : "";
    if (want !== rtFor) {
      rtFor = want;
      stopRt();
      stopRt = () => {};
      if (want) stopRt = await onCrewCommands(() => void process());
    }
  };
  setTimeout(refresh, 5000);
  setInterval(refresh, 60_000);
  void listen("crew-refresh", () => void refresh());
  void listen("social-refresh", () => void refresh());

  // ---- Komutlar ----
  const handled = new Set<string>();
  let busy = false;
  const finish = (c: CrewCommand, ok: boolean, result: string) => {
    void crewDone(c.id, ok ? "applied" : "rejected", result)
      .catch(() => {})
      .then(() => emit("crew-changed").catch(() => {}));
  };
  const handle = async (c: CrewCommand) => {
    const who = c.sender_name || "?";
    if (c.allowed === false) return finish(c, false, c.kind === "message" ? "Yetki yok" : "Sürücü şu an ekip kontrolünü kabul etmiyor");
    if (!inSim()) return finish(c, false, "Sürücü oyunda değil");
    if (!racing()) return finish(c, false, "Sürücü şu an aracı sürmüyor");
    if (c.kind === "message") {
      const text = String(c.args?.text ?? "").slice(0, 120);
      if (!text) return finish(c, false, "Mesaj boş");
      // Eski tek yönlü mesaj komutu (güncellenmemiş uygulama / site): oda mesajı gibi gösterilir
      const ov: OvMsg = { id: `crew-${c.id}`, kind: "crew", from: c.sender, peer: uid, name: who, color: friendLook(c.sender).color, team: t("Ekip"), body: text, mine: false, ts: Date.now() };
      // Rahatsız Etme: overlay satırı, kutucuk ve ses yok (mesaj yine teslim edilmiş sayılır)
      if (!settings().general.social.dnd) {
        broadcastOvMsg(ov);
        if (boxOn() && !ovMsgShown(ov)) showCrewBox({ id: ov.id, from: t("Ekip · {0}", who), body: text }, 7000);
        messageBeep();
      }
      return finish(c, true, "");
    }
    if (!controlOn) return finish(c, false, "Sürücü şu an ekip kontrolünü kabul etmiyor");
    if (!crewSimOk(status()?.sim)) return finish(c, false, "Bu oyunda desteklenmiyor");
    try {
      await invoke("crew_pit_command", { kind: c.kind, args: c.args ?? {} });
    } catch (e) {
      return finish(c, false, String((e as Error)?.message ?? e).slice(0, 200));
    }
    showCrewBox({ id: `crew-${c.id}`, from: t("Ekip"), body: `${who}: ${crewCommandText(c.kind, c.args)}` }, 5000);
    // Ekip Çağrısı overlay'i: uygulanan pit komutu ekranın ortasında da duyurulur
    void emit(CREWCALL_EVENT, { id: `crew-${c.id}`, from: who, body: crewCommandText(c.kind, c.args) } satisfies CrewCallEvt).catch(() => {});
    finish(c, true, "");
  };
  async function process() {
    if (busy || !session()) return;
    busy = true;
    try {
      for (const c of await crewPending()) {
        if (handled.has(c.id)) continue;
        handled.add(c.id);
        if (handled.size > 500) handled.clear();
        await handle(c);
      }
    } catch {
      /* sonraki yoklamada */
    } finally {
      busy = false;
    }
  }
  // Yoklama (Realtime kaçırırsa): yarışta 2 sn, değilken 10 sn — sadece ekibim varsa
  let tick = 0;
  setInterval(() => {
    tick++;
    if (!members.length || !session()) return;
    if (racing() || tick % 5 === 0) void process();
  }, 2000);

  // ---- Ekip odası (c64) ----
  // Odama (sürücü = ben) VE ekip üyesi olduğum sürücülerin odalarına yazılan mesajlar: Mesajlar overlay'ine
  // yayınlanır (overlay kendi ayarına göre gösterir / sesli okur). Kendi odamın mesajı, ayar açıksa alt ortadaki
  // kutucukta da gösterilir. Realtime + yoklama (kendi odam: yarışta 4 sn, değilken 20 sn; diğer odalar 20 sn).
  interface ChatRoom {
    last: string;
    busy: boolean;
    stop: () => void;
  }
  const rooms = new Map<string, ChatRoom>();
  let chatFor = "";
  /** Ekip üyesi olduğum sürücüler (odalarını görebildiklerim) */
  let driverIds: string[] = [];
  const chatSeen = new Set<string>();
  const onChatMsg = (m: CrewChatMsg, me: string, owner: string) => {
    if (chatSeen.has(m.id)) return;
    chatSeen.add(m.id);
    if (chatSeen.size > 400) chatSeen.clear();
    const mine = m.sender === me;
    const look = friendLook(m.sender);
    const ov: OvMsg = { id: `crew-${m.id}`, kind: "crew", from: m.sender, peer: owner, name: m.name || "?", color: look.color, photo: look.photo || undefined, team: t("Ekip"), body: m.body, mine, ts: Date.now() };
    // Rahatsız Etme: overlay satırı (Ekip çağrısı overlay'inin sesi dahil), kutucuk ve ses yok; kendi mesajım yine görünür
    const dnd = settings().general.social.dnd;
    if (mine || !dnd) broadcastOvMsg(ov);
    // Kutucuk ve ses yalnızca kendi odam için (başkasının odasını panel / Ekip Pitwall'ı zaten gösterir)
    if (mine || owner !== me || dnd) return;
    if (boxOn() && !ovMsgShown(ov)) showCrewBox({ id: ov.id, from: t("Ekip · {0}", m.name || "?"), body: m.body }, 7000);
    messageBeep();
  };
  const pollChat = async (owner: string) => {
    const me = session()?.user.id ?? "";
    const room = rooms.get(owner);
    if (!me || !room || room.busy) return;
    room.busy = true;
    try {
      // İlk çağrı: geçmiş gösterilmez, yalnızca "şu andan sonrası" için saat alınır
      const r = await crewRoom(owner, room.last || null, room.last ? 30 : 1);
      if (session()?.user.id !== me || rooms.get(owner) !== room || !r) return;
      if (!room.last) {
        room.last = r.messages?.[r.messages.length - 1]?.at ?? r.now;
        if (r.now > room.last) room.last = r.now;
        return;
      }
      for (const m of r.messages ?? []) {
        room.last = m.at;
        onChatMsg(m, me, owner);
      }
    } catch {
      /* eski sunucu (c64 yok) ya da ağ hatası: sonraki yoklamada */
    } finally {
      room.busy = false;
    }
  };
  const syncRooms = () => {
    const me = session()?.user.id ?? "";
    if (chatFor !== me) {
      chatFor = me;
      driverIds = [];
      chatSeen.clear();
      for (const r of rooms.values()) r.stop();
      rooms.clear();
    }
    const want = new Set<string>(me ? [...(members.length ? [me] : []), ...driverIds] : []);
    for (const [id, r] of rooms) {
      if (want.has(id)) continue;
      r.stop();
      rooms.delete(id);
    }
    for (const id of want) {
      if (rooms.has(id)) continue;
      const room: ChatRoom = { last: "", busy: false, stop: () => {} };
      rooms.set(id, room);
      void pollChat(id);
      void onCrewChat(id, () => void pollChat(id)).then((stop) => {
        if (rooms.get(id) === room) room.stop = stop;
        else stop();
      });
    }
  };
  const loadDrivers = async () => {
    const me = session()?.user.id ?? "";
    if (!me) return;
    try {
      const l = await crewDrivers();
      if (session()?.user.id !== me) return;
      driverIds = l.filter((d) => d.can_view !== false && d.owner_id !== me).map((d) => d.owner_id).slice(0, 8);
    } catch {
      /* eski sunucu ya da ağ hatası: mevcut liste kalır */
    }
  };
  void listen("crew-refresh", () => void loadDrivers());
  void listen("social-refresh", () => void loadDrivers());
  let chatTick = 0;
  setInterval(() => {
    chatTick++;
    if (!session()) return syncRooms();
    if (chatTick % 15 === 2) void loadDrivers();
    syncRooms();
    const me = session()?.user.id ?? "";
    for (const [id, r] of rooms) {
      if (!r.last || (id === me && racing()) || chatTick % 5 === 0) void pollChat(id);
    }
  }, 4000);

  // ---- Ekip Pitwall'ı ----
  // Kendi telemetri kanalı (overlay'lerin aboneliğinden bağımsız): sadece izleyen varken açık
  const latest: Partial<TopicMap> = {};
  let streamId: number | null = null;
  let streamBusy = false;
  /** Son gönderimden beri görülen yan araçlar (radar 5 Hz, gönderim 1 Hz: kısa süren yan yana an kaçmasın) */
  let seenL = false;
  let seenR = false;
  const startStream = async () => {
    if (streamId !== null || streamBusy) return;
    streamBusy = true;
    try {
      const channel = new Channel<Packet>();
      channel.onmessage = (p) => {
        if (p.t === "settings") return;
        if (p.t === "captions") return void onCaptions(p.d);
        if (p.t === "voice") return void onVoice(p.d);
        (latest as Record<string, unknown>)[p.t] = p.d;
        if (p.t === "radar") {
          const st = p.d.state;
          if (st === 2 || st === 4 || st === 5) seenL = true;
          if (st === 3 || st === 4 || st === 6) seenR = true;
        }
      };
      streamId = await invoke<number>("stream_start", {
        channel,
        topics: [
          { name: "relative", hz: 2 },
          { name: "standings", hz: 1 },
          { name: "session", hz: 1 },
          { name: "weather", hz: 1 },
          { name: "delta", hz: 2 },
          { name: "telemetry", hz: 1 },
          { name: "radar", hz: 5 },
          { name: "pit", hz: 1 },
          { name: "fuel", hz: 1 },
          // c79 (sürücünün gözünden görünümler): yalnızca bu akış açıkken (ekipten biri izlerken) üretilir
          { name: "tires", hz: 1 },
          { name: "laps", hz: 1 },
          { name: "raceControl", hz: 1 },
          // Konuşma altyazısı (c60): sürücünün tanınan cümleleri ekibe altyazı olarak gider
          { name: "captions", hz: 2 },
          { name: "voice", hz: 5 },
        ],
      });
    } catch {
      streamId = null;
    } finally {
      streamBusy = false;
    }
  };
  const stopStream = () => {
    if (streamId === null) return;
    const id = streamId;
    streamId = null;
    invoke("stream_stop", { id }).catch(() => {});
    for (const k of Object.keys(latest)) delete (latest as Record<string, unknown>)[k];
    seenL = seenR = false;
    speech.length = 0;
    micPrev = "";
    micTs = 0;
    voiceId = -1;
  };
  // ---- Konuşma altyazısı (c60) ----
  // Kaynaklar: "captions" konusundaki mikrofon satırı (Konuşma → yazı; tek satır, yeni sözler sonuna eklenir) ve
  // "voice" konusundaki sürücü sorusu (sesli komut). Yalnızca pitwall akışı açıkken (ekipten biri izlerken) toplanır.
  /** t: ilk söz, u: son ekleme (ms) */
  const speech: { t: number; u: number; text: string }[] = [];
  let micPrev = "";
  let micTs = 0;
  let voiceId = -1;
  const addSpeech = (text: string, now: number) => {
    const x = text.replace(/\s+/g, " ").trim();
    if (!x) return;
    const last = speech[speech.length - 1];
    // Aynı cümle iki kaynaktan da gelebilir (altyazı + sesli komut)
    if (last && now - last.u < 6000 && last.text.toLowerCase().endsWith(x.toLowerCase())) return;
    if (last && now - last.u < 4000 && last.text.length + x.length < 160) {
      last.text = `${last.text} ${x}`;
      last.u = now;
    } else speech.push({ t: now, u: now, text: x.slice(0, 180) });
    while (speech.length > 12) speech.shift();
  };
  const onCaptions = (c: TopicMap["captions"] | undefined) => {
    const mic = c?.lines?.find((l) => l.src === "mic");
    if (!mic || !mic.ts || mic.ts === micTs) return;
    const first = micTs === 0;
    micTs = mic.ts;
    const cur = String(mic.text ?? "").replace(/^…/, "").trim();
    const prev = micPrev;
    micPrev = cur;
    // Akış açıldığında ekranda kalmış eski satır: yalnızca tazeyse al
    if (first && Date.now() - mic.ts > 8000) return;
    let add = cur;
    if (prev) {
      if (cur.startsWith(prev)) add = cur.slice(prev.length);
      else {
        // Satır baştan kırpılmış olabilir (180 karakter sınırı): eski metnin sonunu yeni metinde ara
        const tail = prev.slice(-30);
        const at = cur.lastIndexOf(tail);
        if (at >= 0) add = cur.slice(at + tail.length);
      }
    }
    addSpeech(add, Date.now());
  };
  const onVoice = (v: TopicMap["voice"] | undefined) => {
    if (!v || v.id === voiceId) return;
    const first = voiceId === -1;
    voiceId = v.id;
    if (v.role !== "driver" || (first && !v.speaking)) return;
    addSpeech(String(v.text ?? ""), Date.now());
  };
  /** Anlık görüntüye girecek satırlar: son 60 sn, en fazla 6 satır / 400 karakter (en yeniler) */
  const buildSpeech = (): CrewSpeech[] | undefined => {
    if (settings().general.social.crewSpeech === false) return undefined;
    const now = Date.now();
    const out: CrewSpeech[] = [];
    let chars = 0;
    for (let i = speech.length - 1; i >= 0 && out.length < 6; i--) {
      const s = speech[i];
      if (now - s.u > 60_000) break;
      const text = s.text.slice(0, 400 - chars);
      if (!text) break;
      chars += text.length;
      out.unshift({ t: s.t, text, final: now - s.u > 2500 });
    }
    return out.length ? out : undefined;
  };
  const r1 = (x: number | undefined | null, d = 1) => (typeof x === "number" && isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : 0);
  const buildWall = (): CrewWall | null => {
    const rel = latest.relative;
    const ses = latest.session;
    if (!rel || !ses) return null;
    const all = rel.rows ?? [];
    const mi = all.findIndex((r) => r.isMe);
    const near = mi < 0 ? all.slice(0, 11) : all.slice(Math.max(0, mi - 5), mi + 6);
    const rows: WallRow[] = near.map((r) => ({
      i: r.idx,
      p: r.pos,
      cp: r.classPos,
      n: String(r.number ?? "").slice(0, 4),
      nm: String(r.name ?? "").slice(0, 28),
      c: r.classColor,
      g: r.isMe ? 0 : r1(r.gap, 2),
      l: r1(r.last, 3),
      b: r1(r.best, 3),
      ...(r.onPit ? { pit: true } : {}),
      ...(r.isMe ? { me: true } : {}),
      ...(r.lapRel ? { lr: r.lapRel } : {}),
    }));
    // Sınıfın ilk üçü (yakında değillerse ayrıca eklenir). Yarışta fark: lidere farkların farkı.
    const st = latest.standings;
    const mine = st?.rows.find((r) => r.isMe);
    if (st && mine) {
      for (const r of st.rows) {
        if (r.classId !== mine.classId || r.classPos < 1 || r.classPos > 3 || r.isMe || rows.some((x) => x.i === r.idx)) continue;
        const sameLap = r.lapsDown === mine.lapsDown;
        rows.push({
          i: r.idx,
          p: r.pos,
          cp: r.classPos,
          n: String(r.number ?? "").slice(0, 4),
          nm: String(r.name ?? "").slice(0, 28),
          c: r.classColor,
          g: st.race && sameLap ? r1(mine.gap - r.gap, 1) : null,
          l: r1(r.last, 3),
          b: r1(r.best, 3),
          ...(r.onPit ? { pit: true } : {}),
          top: true,
        });
      }
    }
    const dl = latest.delta;
    const tel = latest.telemetry;
    const wx = latest.weather;
    const rd = latest.radar;
    const pit = latest.pit;
    const fu = latest.fuel;
    const sp = !rd || rd.state === 0 ? 0 : seenL && seenR ? 4 : seenL ? 2 : seenR ? 3 : 1;
    seenL = seenR = false;
    const sph = buildSpeech();
    return {
      ...(sph ? { speech: sph } : {}),
      ts: Date.now(),
      ses: ses.sessionType ?? "",
      rows,
      me: {
        pos: ses.position,
        cp: ses.classPosition,
        cars: ses.carCount,
        lap: ses.lap,
        last: r1(tel?.last ?? dl?.last, 3),
        best: r1(tel?.best ?? dl?.best, 3),
        cur: r1(dl?.current, 1),
        d: dl?.valid ? r1(dl.delta, 2) : null,
      },
      flags: (ses.flags ?? []).slice(0, 8),
      wx: wx ? { air: r1(wx.airTemp), track: r1(wx.trackTemp), wet: wx.wetness, rain: r1(wx.precip, 2), wind: r1(wx.windVel) } : null,
      sp,
      ahead: rd?.aheadM != null ? r1(rd.aheadM) : null,
      behind: rd?.behindM != null ? r1(rd.behindM) : null,
      pit: { road: !!(pit?.onPitRoad ?? ses.onPitRoad), stall: !!pit?.inStall, lim: !!pit?.limiter },
      inc: ses.incidents,
      incMax: ses.incidentLimit,
      fuel: fu ? { lvl: r1(fu.level), laps: r1(fu.avg5?.laps), use: r1(fu.avg5?.usage, 2) } : null,
      rem: { t: Math.round(ses.timeRemain), l: ses.lapsRemain },
    };
  };
  let watchers = 0;
  let wallTick = 0;
  let wallBusy = false;
  setInterval(() => {
    wallTick++;
    const can = wallOn && !!session() && racing() && members.some((m) => m.can_view || m.can_control);
    if (!can) {
      watchers = 0;
      stopStream();
      return;
    }
    if (watchers > 0) void startStream();
    else stopStream();
    // İzleyen yokken 5 sn'de bir sor; varken saniyede bir gönder
    if (wallBusy || (watchers === 0 && wallTick % 5 !== 0)) return;
    const data = watchers > 0 ? buildWall() : null;
    wallBusy = true;
    crewWallPush(data)
      .then((r) => {
        watchers = Math.max(0, Number(r?.watchers) || 0);
        if (r && r.wall_on === false) wallOn = false;
      })
      .catch(() => {
        /* eski sunucu (c58 yok) ya da ağ hatası: bir sonraki turda */
        if (watchers === 0) wallTick = 1; // 5 sn sonra yeniden
      })
      .finally(() => (wallBusy = false));
  }, 1000);

  // ---- "Sürücünün gözünden" görünümler (c79) ----
  // 3 sn'de bir: sunucuya hangi parçaların istendiği sorulur (want) ve bir önceki yanıtta istenenler gönderilir.
  // t: Live Timing (sıralama + oturum + yarış kontrol), g: mühendis ekranı konuları, e: olaylar (değişince).
  const round = <T,>(v: T): T => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "number" ? (isFinite(x) ? Math.round(x * 1000) / 1000 : 0) : x)));
  const buildT = (): CrewExtT | null => {
    const st = latest.standings;
    const ses = latest.session;
    if (!st && !ses) return null;
    let rows = st?.rows ?? [];
    if (rows.length > CREW_EXT_MAX.cars) {
      // İlk sıradakiler + kendi aracım (kırpılanların arasındaysa)
      const me = rows.find((r) => r.isMe);
      rows = rows.slice(0, CREW_EXT_MAX.cars);
      if (me && !rows.includes(me)) rows[rows.length - 1] = me;
    }
    const rc = (latest.raceControl?.events ?? []).slice(0, CREW_EXT_MAX.rc).map((e) => ({ ...e, name: String(e.name ?? "").slice(0, 40), text: String(e.text ?? "").slice(0, 120) }));
    return { ts: Date.now(), st: st ? { ...round({ ...st, rows: [] }), rows: packRows(rows) } : null, ses: ses ? round(ses) : null, rc: round(rc) };
  };
  const buildG = (): CrewExtG | null => {
    const rel = latest.relative;
    const all = rel?.rows ?? [];
    const mi = all.findIndex((r) => r.isMe);
    const near = mi < 0 ? all.slice(0, 13) : all.slice(Math.max(0, mi - 6), mi + 7);
    const laps = latest.laps;
    const topics: CrewExtG["topics"] = {};
    if (latest.fuel) topics.fuel = round(latest.fuel);
    if (latest.tires) topics.tires = round(latest.tires);
    if (latest.weather) topics.weather = round(latest.weather);
    if (latest.telemetry) topics.telemetry = round(latest.telemetry);
    if (latest.session) topics.session = round(latest.session);
    if (laps) topics.laps = round({ ...laps, laps: (laps.laps ?? []).slice(-25) });
    if (!rel && !Object.keys(topics).length) return null;
    return { ts: Date.now(), rel: rel ? { ...round({ ...rel, rows: [] }), rows: packRows(near) } : null, topics };
  };
  interface EvInfo {
    demo?: boolean;
    sessionNum?: number;
    rev?: number;
    events: { id?: number; name?: string; text?: string }[];
  }
  /** Olay listesi (Rust events.rs; güncel oturum): en yeni 60 olay + oturum özeti. rev: değişiklik anahtarı */
  const buildE = async (): Promise<{ rev: string; data: CrewExtE } | null> => {
    try {
      const i = await invoke<EvInfo>("events_get", { view: "current" });
      if (!i || i.demo) return null;
      const all = i.events ?? [];
      const events = all.slice(-CREW_EXT_MAX.events).map((e) => ({ ...e, name: String(e.name ?? "").slice(0, 40), text: String(e.text ?? "").slice(0, 140) }));
      const rev = `${i.sessionNum ?? 0}.${i.rev ?? 0}.${all.length}.${all[all.length - 1]?.id ?? 0}`;
      // Tekrar bilgisi gönderilmez: uzaktan tekrar komutu yoktur
      return { rev, data: { ts: Date.now(), total: all.length, info: round({ ...i, replayOk: false, previous: false, hasPrevious: false, events }) } };
    } catch {
      return null;
    }
  };
  const size = (v: unknown) => (v ? JSON.stringify(v).length : 0);
  let extWant = "";
  let extBusy = false;
  /** Sunucuda saklı olay sürümü ve son tam gönderim anı (özet — tur, sıra — 30 sn'de bir yenilensin) */
  let extRev: string | null = null;
  let extEAt = 0;
  let extSkip = 0;
  setInterval(() => {
    if (extBusy) return;
    if (extSkip > 0) return void extSkip--;
    const can = watchers > 0 && wallOn && !!session() && racing();
    if (!can) {
      extWant = "";
      return;
    }
    extBusy = true;
    void (async () => {
      try {
        let tp = extWant.includes("t") ? buildT() : null;
        // Sunucu sınırı 64 KB: aşarsa satırlar azaltılır (çok kalabalık ızgara + uzun isimler)
        while (tp?.st && size(tp) > 60_000 && tp.st.rows.length > 20) tp = { ...tp, st: { ...tp.st, rows: tp.st.rows.slice(0, tp.st.rows.length - 8) } };
        let g = extWant.includes("g") ? buildG() : null;
        if (g && size(g) > 30_000) g = { ...g, topics: { ...g.topics, laps: undefined } };
        if (g && size(g) > 30_000) g = null;
        let e: CrewExtE | null = null;
        let rev: string | null = null;
        if (extWant.includes("e")) {
          const b = await buildE();
          if (b) {
            rev = b.rev;
            if (b.rev !== extRev || Date.now() - extEAt > 30_000) {
              e = b.data;
              while (size(e) > 30_000 && e.info.events.length > 10) e = { ...e, info: { ...e.info, events: e.info.events.slice(10) } };
            }
          }
        }
        const r = await crewExtPush(tp, g, e, rev);
        extWant = String(r?.want ?? "");
        extRev = r?.e_rev ?? null;
        if (e && extRev === rev) extEAt = Date.now();
      } catch {
        /* eski sunucu (c79 yok) ya da ağ hatası: bir dakika sonra yeniden */
        extWant = "";
        extSkip = 20;
      } finally {
        extBusy = false;
      }
    })();
  }, 3000);

  // "Ekip kontrolünü durdur" kısayolu
  void listen("crew-stop", () => {
    // Kısayol bildirimi (üst orta): sonuç burada belli olur
    void invoke("osd_push", { key: "crewStop", on: !!session() && controlOn }).catch(() => {});
    if (!session()) return;
    const was = controlOn;
    controlOn = false;
    void crewControlSet(false)
      .catch(() => {})
      .then(() => emit("crew-changed").catch(() => {}));
    showCrewBox({ id: `crew-stop-${Date.now()}`, from: t("Ekip"), body: was ? t("Ekip kontrolü durduruldu") : t("Ekip kontrolü zaten kapalı") }, 5000);
  });
}
