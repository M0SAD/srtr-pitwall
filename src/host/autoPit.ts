// Otomatik pit servisi seçimleri (iRacing): Genel ayarlar > "Lastik değişimini otomatik kapat" ve "Autofuel'i otomatik aç".
// Autofuel: SDK'da pit komutu olmadığından "#autofuel" makrosu iRacing sohbetine yazılır (Rust: pit_autofuel); komut her
// zaman "aç" demektir, zaten açıksa değişmez. Sohbet kutusu bir an göründüğü için bir kez gönderilir.
// Kullanıcı araca bindiğinde (ve araçtayken oturum yarışa geçtiğinde) pit servisindeki lastik değişimi kaldırılır.
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

  const mode = () => settings().general.autoClearTires ?? "off";
  const fuelMode = () => settings().general.autoFuel ?? "off";
  let fuelTimer: number | undefined;
  const autofuel = () => {
    clearTimeout(fuelTimer);
    fuelTimer = window.setTimeout(() => {
      const s = status();
      if (fuelMode() === "off" || !isDriving(s) || !s?.onTrack || (s.sim || "iracing") !== "iracing") return;
      if (fuelMode() === "race" && sessionShowKind(s.sessionType) !== "race") return;
      invoke("pit_autofuel").catch(() => {});
    }, 3000);
  };
  const clear = () => {
    timers.forEach(clearTimeout);
    timers = [1500, 5000].map((ms) =>
      window.setTimeout(() => {
        const s = status();
        // Gönderim anında hâlâ araçta ve ayar açık mı
        if (mode() === "off" || !isDriving(s) || !s?.onTrack || (s.sim || "iracing") !== "iracing") return;
        if (mode() === "race" && sessionShowKind(s.sessionType) !== "race") return;
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
      if (mode() !== "off" && (mode() === "all" || kind === "race")) clear();
      if (fuelMode() !== "off" && (fuelMode() === "all" || kind === "race")) autofuel();
    }
    inCar = now;
    lastKind = kind;
  }, 1000);
}
