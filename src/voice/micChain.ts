// Ses odası mikrofon zinciri (WebAudio):
//   mikrofon → alçak kesen süzgeç (90 Hz uğultu) → kazanç → [RNNoise gürültü engelleme] → ses kapısı (algılama eşiği)
//   → gönderilen iz
// RNNoise (xiph/rnnoise, WebAssembly) klavye, fan, motor sesi gibi sürekli ve ani gürültüleri konuşmadan ayırır.
// Ses kapısı eşiğin altındaki sesi tamamen keser (Discord'daki "giriş hassasiyeti" gibi). Kapı ve RNNoise AudioWorklet'te
// çalışır: panel gizliyken zamanlayıcılar yavaşlasa da ses etkilenmez.

import { createSignal } from "solid-js";
import { uiPref } from "@/sdk/settings";
import gateUrl from "./gate.worklet.js?url&no-inline";
import { RnnoiseWorkletNode, loadRnnoise } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url&no-inline";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url&no-inline";
import rnnoiseSimdUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url&no-inline";

// ---- Tercihler (hesapla eşitlenir)
export type NoiseMode = "off" | "standard" | "strong";
export const [inputDevice, setInputDevice] = uiPref<string>("voice.room.inDev", "");
export const [outputDevice, setOutputDevice] = uiPref<string>("voice.room.outDev", "");
/** Gürültü engelleme: kapalı | standart (tarayıcının) | güçlü (RNNoise + tarayıcının) */
export const [noiseMode, setNoiseMode] = uiPref<NoiseMode>("voice.room.noise", "strong");
export const [echoCancel, setEchoCancel] = uiPref<boolean>("voice.room.ec", true);
export const [autoGain, setAutoGain] = uiPref<boolean>("voice.room.agc", true);
/** Mikrofon kazancı (%) */
export const [inputGain, setInputGain] = uiPref<number>("voice.room.inGain", 100);
/** Algılama eşiği: auto (ortam gürültüsüne göre) | manual (gateDb) | off (kapı yok) */
export const [gateMode, setGateMode] = uiPref<"auto" | "manual" | "off">("voice.room.gate", "auto");
export const [gateDb, setGateDb] = uiPref<number>("voice.room.gateDb", -50);
/** Konuşma bitince kapının açık kalma süresi (ms) */
export const [gateHold, setGateHold] = uiPref<number>("voice.room.gateHold", 300);

// ---- Canlı ölçüm (son zincirden)
const [micDb, setMicDb] = createSignal(-100);
const [gateOpen, setGateOpen] = createSignal(false);
const [gateThr, setGateThr] = createSignal(-50);
export const micMeter = { db: micDb, open: gateOpen, thr: gateThr };

const modules = new WeakMap<BaseAudioContext, Promise<void>>();
let rnWasm: Promise<ArrayBuffer> | null = null;

function loadModules(ctx: AudioContext, rn: boolean): Promise<void> {
  let p = modules.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(gateUrl);
    modules.set(ctx, p);
  }
  if (!rn) return p;
  const key = ctx as unknown as { __rn?: Promise<void> };
  if (!key.__rn) key.__rn = ctx.audioWorklet.addModule(rnnoiseWorkletUrl);
  return Promise.all([p, key.__rn]).then(() => undefined);
}

/** Uzak ses için seviye ölçer düğümü (sesi olduğu gibi geçirir) */
export async function meterNode(ctx: AudioContext, onDb: (db: number) => void): Promise<AudioWorkletNode | null> {
  try {
    await loadModules(ctx, false);
    const n = new AudioWorkletNode(ctx, "pw-voice-gate", { processorOptions: { mode: "meter" } });
    n.port.onmessage = (e) => onDb(Number(e.data?.db ?? -100));
    return n;
  } catch {
    return null;
  }
}

export function gateParams() {
  return { gate: gateMode() !== "off", auto: gateMode() === "auto", thr: gateDb(), hold: gateHold() };
}

export interface MicChain {
  /** Gönderilecek iz (işlenmiş) */
  track: MediaStreamTrack;
  /** Kendini duy (mikrofon testi) */
  setLoopback(on: boolean): void;
  /** Kapı / kazanç ayarı değişti (zinciri yeniden kurmadan) */
  update(): void;
  close(): void;
}

export async function getMicStream(): Promise<MediaStream> {
  const dev = inputDevice();
  const nm = noiseMode();
  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...(dev ? { deviceId: { exact: dev } } : {}),
      echoCancellation: echoCancel(),
      noiseSuppression: nm !== "off",
      autoGainControl: autoGain(),
      channelCount: 1,
    },
    video: false,
  });
}

/** Mikrofon zincirini kur. RNNoise yüklenemezse (eski WebView) standart engellemeyle sürer. */
export async function buildMicChain(ctx: AudioContext, mic: MediaStream): Promise<MicChain> {
  const strong = noiseMode() === "strong";
  let rnOk = strong;
  try {
    await loadModules(ctx, strong);
  } catch {
    rnOk = false;
    await loadModules(ctx, false);
  }
  const src = ctx.createMediaStreamSource(mic);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 90;
  const gain = ctx.createGain();
  gain.gain.value = inputGain() / 100;
  let rn: RnnoiseWorkletNode | null = null;
  if (rnOk) {
    try {
      if (!rnWasm) rnWasm = loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdUrl });
      rn = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: await rnWasm });
    } catch {
      rnWasm = null;
      rn = null;
    }
  }
  const gate = new AudioWorkletNode(ctx, "pw-voice-gate", {
    processorOptions: { mode: "gate", ...gateParams() },
    channelCount: 1,
    channelCountMode: "explicit",
  });
  gate.port.onmessage = (e) => {
    const d = e.data ?? {};
    setMicDb(Number(d.db ?? -100));
    setGateOpen(!!d.open);
    if (typeof d.thr === "number") setGateThr(d.thr);
  };
  const dest = ctx.createMediaStreamDestination();
  src.connect(hp);
  hp.connect(gain);
  if (rn) {
    gain.connect(rn);
    rn.connect(gate);
  } else gain.connect(gate);
  gate.connect(dest);
  let loop = false;
  return {
    track: dest.stream.getAudioTracks()[0],
    setLoopback(on) {
      if (on === loop) return;
      loop = on;
      try {
        if (on) gate.connect(ctx.destination);
        else gate.disconnect(ctx.destination);
      } catch {
        /* zaten ayrık */
      }
    },
    update() {
      gain.gain.value = inputGain() / 100;
      gate.port.postMessage(gateParams());
    },
    close() {
      try {
        src.disconnect();
        hp.disconnect();
        gain.disconnect();
        rn?.disconnect();
        rn?.destroy();
        gate.disconnect();
      } catch {
        /* zaten ayrık */
      }
      gate.port.onmessage = null;
      dest.stream.getTracks().forEach((x) => x.stop());
      setMicDb(-100);
      setGateOpen(false);
    },
  };
}
