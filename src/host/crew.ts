// Ekip (uzaktan pit ekibi, c53) — sürücü tarafı. Overlay penceresinde (uygulama açık olduğu sürece) çalışır:
//  - ekibimde izleyen varsa canlı veriye "crew" alanını ekler (bkz. social.ts team-fuel-local)
//  - ekip üyelerinin gönderdiği komutları alır (Realtime + yoklama), denetler, iRacing'e uygular ve sonucu yazar
//  - uygulanan her komutu oyun içi bildirim olarak gösterir ("Ali: yakıt 45 L")
//  - "Ekip kontrolünü durdur" kısayolu: ana anahtarı kapatır (bekleyen komutlar da reddedilir)
// Komutlar sadece sim'e bağlıyken ve ana anahtar açıkken uygulanır; aksi halde sebebiyle reddedilir.

import type { Accessor } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { cloudEnabled, session } from "@/cloud/supabase";
import { settings } from "@/sdk/settings";
import type { Status } from "@/sdk/types";
import { t } from "@/sdk/i18n";
import { messageBeep } from "@/cloud/social";
import { crewCommandText, crewControlSet, crewDone, crewList, crewPending, crewSimOk, crewState, onCrewCommands, type CrewCommand, type CrewLive, type CrewMember } from "@/cloud/crew";
import { showMsgToast } from "./social";

let members: CrewMember[] = [];
let controlOn = false;
let extra: CrewLive | null = null;
let started = false;

/** Canlı veriye eklenecek ekip alanı; ekibimde izleyen yoksa null (veri gönderilmez) */
export function crewLiveExtra(): CrewLive | null {
  if (!extra || !members.some((m) => m.can_view || m.can_control)) return null;
  return { ...extra, ctl: controlOn && crewSimOk(extra.sim) };
}

export function startCrew(status: Accessor<Status | undefined>) {
  if (started || !cloudEnabled) return;
  started = true;

  const racing = () => {
    const s = status();
    return !!s?.connected && !s.demo && !s.preview;
  };

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
    if (!racing()) return finish(c, false, "Sürücü oyunda değil");
    if (c.kind === "message") {
      const text = String(c.args?.text ?? "").slice(0, 120);
      if (!text) return finish(c, false, "Mesaj boş");
      showMsgToast({ id: `crew-${c.id}`, from: t("Ekip · {0}", who), body: text }, 9000);
      if (settings().general.social.sound) messageBeep();
      // Sesli okuma (PRO: social.messages_tts; yoksa sessizce atlanır)
      invoke("social_tts_speak", { id: `crew-${c.id}`, name: who, text, readName: true, maxChars: 120 }).catch(() => {});
      return finish(c, true, "");
    }
    if (!controlOn) return finish(c, false, "Sürücü şu an ekip kontrolünü kabul etmiyor");
    if (!crewSimOk(status()?.sim)) return finish(c, false, "Bu oyunda desteklenmiyor");
    try {
      await invoke("crew_pit_command", { kind: c.kind, args: c.args ?? {} });
    } catch (e) {
      return finish(c, false, String((e as Error)?.message ?? e).slice(0, 200));
    }
    showMsgToast({ id: `crew-${c.id}`, from: t("Ekip"), body: `${who}: ${crewCommandText(c.kind, c.args)}` }, 6000);
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

  // "Ekip kontrolünü durdur" kısayolu
  void listen("crew-stop", () => {
    if (!session()) return;
    const was = controlOn;
    controlOn = false;
    void crewControlSet(false)
      .catch(() => {})
      .then(() => emit("crew-changed").catch(() => {}));
    showMsgToast({ id: `crew-stop-${Date.now()}`, from: t("Ekip"), body: was ? t("Ekip kontrolü durduruldu") : t("Ekip kontrolü zaten kapalı") }, 5000);
  });
}
