// Otomatik pit servisi seçimi (iRacing): Genel ayarlar > "Lastik değişimini otomatik kapat".
// Kullanıcı araca bindiğinde (ve araçtayken oturum yarışa geçtiğinde) pit servisindeki lastik değişimi kaldırılır.
// HER OTURUMDA YALNIZCA BİR KEZ: sürücü sonradan lastik değişimini kendisi açarsa (ör. pit stoptan önce) bir daha
// kapatılmaz. Önceden aracın "pistte / sürüyor" durumu bir an düşüp geri gelince (pite girme, sıfırlama, bağlantı
// kopması) komut yeniden gönderiliyor ve açılan lastik değişimi tekrar kapanıyordu.
// iRacing pit komutlarını yalnızca sürücü araçtayken kabul eder; araç yüklenirken seçimler kendi varsayılanına
// dönebildiği için komut kısa aralıklarla iki kez gönderilir (aynı komut tekrarlanınca bir şey değişmez).
// Overlay ana penceresinde bir kez çalışır (Host.tsx).
import { invoke } from "@tauri-apps/api/core";
import type { Accessor } from "solid-js";
import { settings } from "@/sdk/settings";
import { sessionShowKind } from "@/sdk/sessionShow";
import type { Status } from "@/sdk/types";
import { isDriving } from "./crew";

let started = false;

export function startAutoPit(status: Accessor<Status | undefined>) {
  if (started) return;
  started = true;
  let inCar = false;
  let lastKind: string | null = null;
  let timers: number[] = [];
  /** Lastik değişimi kapatılmış oturumlar (SubSessionID | oturum no.) */
  // Program yeniden açılsa da (ör. yarış ortasında) aynı oturumda tekrar kapatılmasın: son oturumlar saklanır
  const STORE = "pitwall.autoTiresDone";
  const done = new Set<string>(
    (() => {
      try {
        const v = JSON.parse(localStorage.getItem(STORE) ?? "[]");
        return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
      } catch {
        return [];
      }
    })(),
  );
  const markDone = (key: string) => {
    done.add(key);
    try {
      localStorage.setItem(STORE, JSON.stringify([...done].slice(-20)));
    } catch {
      /* yer yok */
    }
  };
  const keyOf = (s: Status) => `${s.subSessionId ?? 0}|${s.sessionNum ?? -1}|${s.track}|${s.sessionType}`;

  const mode = () => settings().general.autoClearTires ?? "off";
  const clear = (key: string) => {
    if (done.has(key)) return;
    timers.forEach(clearTimeout);
    timers = [1500, 5000].map((ms) =>
      window.setTimeout(() => {
        const s = status();
        // Gönderim anında hâlâ araçta ve ayar açık mı
        if (mode() === "off" || !isDriving(s) || !s?.onTrack || (s.sim || "iracing") !== "iracing") return;
        if (mode() === "race" && sessionShowKind(s.sessionType) !== "race") return;
        // Başka bir oturuma geçildiyse bu zamanlayıcı eski oturumundur
        if (keyOf(s) !== key) return;
        markDone(key);
        invoke("crew_pit_command", { kind: "tyres_clear", args: {} }).catch(() => {});
      }, ms),
    );
  };

  setInterval(() => {
    const s = status();
    const now = isDriving(s) && !!s?.onTrack && (s?.sim || "iracing") === "iracing";
    const kind = now ? sessionShowKind(s!.sessionType) : null;
    // Araca binildi ya da araçtayken oturum türü değişti (ör. ısınma turundan yarışa)
    if (now && (!inCar || kind !== lastKind)) {
      if (mode() !== "off" && (mode() === "all" || kind === "race")) clear(keyOf(s!));
    }
    inCar = now;
    lastKind = kind;
  }, 1000);
}
