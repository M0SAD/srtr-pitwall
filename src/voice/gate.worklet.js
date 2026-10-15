// Ses odası: ses kapısı (algılama eşiği) ve seviye ölçer — AudioWorklet (ses iş parçacığında çalışır; gizli
// pencerede zamanlayıcılar yavaşlasa da etkilenmez).
//
// mode "gate":  mikrofon. Seviye eşiğin altındaysa (tutma süresi sonra) ses kısılır. Eşik "auto" ise ortam
//               gürültüsü (taban) izlenir, eşik taban + 12 dB (en az -60, en çok -20 dB) olur.
// mode "meter": gelen sesi olduğu gibi geçirir, sadece seviyesini bildirir (konuşan göstergesi).
// Ana iş parçacığına ~60 ms'de bir { db, open, thr } gönderir. Ayarlar port üzerinden: { gate, auto, thr, hold }.

class VoiceGate extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    const o = (opts && opts.processorOptions) || {};
    this.mode = o.mode === "meter" ? "meter" : "gate";
    this.gateOn = o.gate !== false;
    this.auto = o.auto !== false;
    this.thrManual = typeof o.thr === "number" ? o.thr : -50;
    this.holdMs = typeof o.hold === "number" ? o.hold : 300;
    this.floor = -70;
    this.gain = this.mode === "meter" ? 1 : 0;
    this.open = this.mode === "meter";
    this.lastLoud = -1e9;
    this.t = 0;
    this.peakDb = -100;
    this.lastPost = 0;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (typeof d.gate === "boolean") this.gateOn = d.gate;
      if (typeof d.auto === "boolean") this.auto = d.auto;
      if (typeof d.thr === "number") this.thrManual = d.thr;
      if (typeof d.hold === "number") this.holdMs = d.hold;
    };
  }

  threshold() {
    if (!this.auto) return this.thrManual;
    return Math.max(-60, Math.min(-20, this.floor + 12));
  }

  process(inputs, outputs) {
    const inp = inputs[0];
    const out = outputs[0];
    const n = out && out[0] ? out[0].length : 128;
    const ms = (n / sampleRate) * 1000;
    this.t += ms;
    // Seviye (RMS, dB)
    let sum = 0;
    let count = 0;
    if (inp && inp.length) {
      for (let c = 0; c < inp.length; c++) {
        const ch = inp[c];
        for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
        count += ch.length;
      }
    }
    const rms = count ? Math.sqrt(sum / count) : 0;
    const db = rms > 1e-7 ? 20 * Math.log10(rms) : -100;
    if (db > this.peakDb) this.peakDb = db;

    let target = 1;
    if (this.mode === "gate") {
      // Gürültü tabanı: aşağı hızlı, yukarı çok yavaş iner-çıkar (konuşma tabanı yükseltmesin)
      // (konuşma sırasında taban yükselmez: sadece eşiğin altındaki sesler tabanı yukarı çeker)
      if (db < this.floor) this.floor += (db - this.floor) * 0.05;
      else if (db < this.threshold()) this.floor += (db - this.floor) * 0.002;
      if (this.floor < -90) this.floor = -90;
      const thr = this.threshold();
      if (!this.gateOn) {
        this.open = true;
      } else {
        if (db >= thr) this.lastLoud = this.t;
        // Açmak için eşik, kapamak için eşik - 4 dB (titreme olmasın) ve tutma süresi
        if (!this.open && db >= thr) this.open = true;
        else if (this.open && db < thr - 4 && this.t - this.lastLoud > this.holdMs) this.open = false;
      }
      target = this.open ? 1 : 0;
    }
    // Yumuşak geçiş: açılış ~5 ms, kapanış ~60 ms
    const tau = (target > this.gain ? 5 : 60) / 1000;
    const a = 1 - Math.exp(-1 / (sampleRate * tau));
    if (out) {
      for (let c = 0; c < out.length; c++) {
        const o = out[c];
        const src = inp && inp.length ? inp[Math.min(c, inp.length - 1)] : null;
        let g = this.gain;
        for (let i = 0; i < o.length; i++) {
          g += (target - g) * a;
          o[i] = src ? src[i] * g : 0;
        }
        if (c === out.length - 1) this.gain = g;
      }
    }
    if (this.t - this.lastPost >= 60) {
      this.lastPost = this.t;
      this.port.postMessage({ db: this.peakDb, open: this.open, thr: this.mode === "gate" ? this.threshold() : null });
      this.peakDb = -100;
    }
    return true;
  }
}

registerProcessor("pw-voice-gate", VoiceGate);
