//! Ses çıkışı: kayıtlı sesleri (ses paketi, wav/ogg) art arda çalar, uyarı bipleri ve
//! yanındaki araç için sola/sağa yönlendirilmiş ton üretir. Tek bir arka plan iş parçacığı.

use rodio::source::{ChannelVolume, SineWave, Source};
use rodio::{Decoder, OutputStream, Sink};
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::OnceLock;
use std::time::Duration;

pub enum Cmd {
    /// Ses parçalarını art arda çal. `spotter` sesleri mühendisi keser ve önceliklidir.
    /// `sub`: altyazı kimliği (bkz. `voicesub`; 0: altyazı yok)
    Say { parts: Vec<PathBuf>, spotter: bool, volume: f32, sub: u64 },
    /// Kısa bip
    Beep { freq: f32, ms: u64, volume: f32, pan: f32 },
    /// Sürekli ton (yanında araç): None durdurur. pan -1 sol, 1 sağ
    Alongside(Option<(f32, f32, f32)>),
    /// Çıkış cihazı (ad; boş: Windows varsayılanı). Aynı cihaz yeniden gönderilirse hiçbir şey olmaz.
    Device(String),
}

static TX: OnceLock<Sender<Cmd>> = OnceLock::new();
/// Mühendis ya da spotter şu an konuşuyor mu (ses iş parçacığı en geç 100 ms'de bir günceller)
static BUSY: AtomicBool = AtomicBool::new(false);

/// Varsayılan ses çıkışı açılamadı (ses iş parçacığı komutları sessizce tüketiyor)
static NO_DEVICE: AtomicBool = AtomicBool::new(false);

pub fn no_device() -> bool {
    NO_DEVICE.load(Ordering::Relaxed)
}

/// Ses kanalı meşgul mü: sesli mühendis kuyruğu bir sonraki mesajı bunun bitmesini bekleyerek gönderir
pub fn busy() -> bool {
    BUSY.load(Ordering::Relaxed)
}

/// Ses iş parçacığını (ilk çağrıda) başlatır ve komut gönderir.
pub fn send(cmd: Cmd) {
    let tx = TX.get_or_init(|| {
        let (tx, rx) = channel::<Cmd>();
        std::thread::Builder::new()
            .name("audio".into())
            .spawn(move || crate::crashlog::supervise("audio", || run(&rx)))
            .expect("ses iş parçacığı başlatılamadı");
        tx
    });
    let _ = tx.send(cmd);
}

fn pan_volumes(pan: f32, volume: f32) -> Vec<f32> {
    let p = pan.clamp(-1.0, 1.0);
    let l = volume * (1.0 - p.max(0.0));
    let r = volume * (1.0 + p.min(0.0));
    vec![l, r]
}

fn run(rx: &Receiver<Cmd>) {
    // Ses aygıtı yoksa (ör. sunucu) komutları sessizce tüket
    let Ok((mut _stream, mut handle)) = OutputStream::try_default() else {
        BUSY.store(false, Ordering::Relaxed);
        NO_DEVICE.store(true, Ordering::Relaxed);
        while rx.recv().is_ok() {}
        return;
    };
    let Ok(mut voice) = Sink::try_new(&handle) else { return };
    let Ok(mut spotter) = Sink::try_new(&handle) else { return };
    let Ok(mut fx) = Sink::try_new(&handle) else { return };
    // Seçili çıkış cihazı ("" = Windows varsayılanı)
    let mut device = String::new();
    let mut tone: Option<Sink> = None;
    let mut tone_key: Option<(i32, i32, i32)> = None;

    // Altyazı: son gönderilen mesajın kimliği ve kanalın bir önceki durumu
    let mut last_sub: u64 = 0;
    let mut was_busy = false;

    loop {
        let busy_now = !voice.empty() || !spotter.empty();
        BUSY.store(busy_now, Ordering::Relaxed);
        if was_busy && !busy_now && last_sub != 0 {
            crate::voicesub::end(last_sub);
        }
        was_busy = busy_now;
        // Kanal boşken (çalan / sıradaki ses yok) durum ancak yeni bir komutla değişebilir: 100 ms'de bir
        // uyanmak yerine komut gelene kadar uyu. Ses çalarken bitişi yakalamak için eskisi gibi yoklanır.
        let cmd = if busy_now {
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(c) => c,
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        } else {
            match rx.recv() {
                Ok(c) => c,
                Err(_) => return,
            }
        };
        match cmd {
            Cmd::Device(name) => {
                if name == device {
                    continue;
                }
                // Cihaz bulunamazsa / açılamazsa Windows varsayılanına düşülür (ses hiç kesilmesin)
                let opened = {
                    use rodio::cpal::traits::HostTrait;
                    use rodio::DeviceTrait;
                    let dev = if name.is_empty() {
                        None
                    } else {
                        rodio::cpal::default_host().output_devices().ok().and_then(|mut it| it.find(|d| d.name().map(|n| n == name).unwrap_or(false)))
                    };
                    match dev {
                        Some(d) => OutputStream::try_from_device(&d).or_else(|_| OutputStream::try_default()),
                        None => OutputStream::try_default(),
                    }
                };
                let Ok((s, h)) = opened else { continue };
                let (Ok(v), Ok(sp), Ok(f)) = (Sink::try_new(&h), Sink::try_new(&h), Sink::try_new(&h)) else { continue };
                if let Some(t) = tone.take() {
                    t.stop();
                }
                tone_key = None;
                // Eski akıştaki sesler akışla birlikte kapanır; yenileri yeni cihazda çalar
                voice = v;
                spotter = sp;
                fx = f;
                handle = h;
                _stream = s;
                device = name;
            }
            Cmd::Say { parts, spotter: is_spotter, volume, sub } => {
                let sink = if is_spotter { &spotter } else { &voice };
                if is_spotter {
                    // Eski spotter mesajı artık geçersiz: yenisi hemen çalsın. Spotter en önceliklidir:
                    // konuşan mühendisi de keser.
                    sink.clear();
                    sink.play();
                    voice.clear();
                    voice.play();
                } else if sink.len() > 6 {
                    // Kuyruk çok uzadıysa eskileri at
                    sink.clear();
                    sink.play();
                }
                sink.set_volume(volume.clamp(0.0, 2.0));
                // Kayıtların toplam süresi (hepsi biliniyorsa altyazı süresi düzeltilir)
                let mut total = Some(Duration::ZERO);
                for p in parts {
                    let Ok(f) = File::open(&p) else { continue };
                    if let Ok(src) = Decoder::new(BufReader::new(f)) {
                        total = match (total, src.total_duration()) {
                            (Some(t), Some(d)) => Some(t + d),
                            _ => None,
                        };
                        sink.append(src);
                    }
                }
                let busy_now = !voice.empty() || !spotter.empty();
                BUSY.store(busy_now, Ordering::Relaxed);
                if sub != 0 {
                    last_sub = sub;
                    if !busy_now {
                        // Hiçbir kayıt çözülemedi: altyazı ekranda kalmasın
                        crate::voicesub::end(sub);
                    } else if let Some(t) = total.filter(|t| !t.is_zero()) {
                        crate::voicesub::duration(sub, t.as_millis().min(60_000) as u32);
                    }
                }
                was_busy = busy_now;
            }
            Cmd::Beep { freq, ms, volume, pan } => {
                let src = SineWave::new(freq)
                    .take_duration(Duration::from_millis(ms))
                    .fade_in(Duration::from_millis(8));
                fx.append(ChannelVolume::new(src, pan_volumes(pan, volume * 0.5)));
            }
            Cmd::Alongside(state) => {
                let key = state.map(|(pan, freq, vol)| ((pan * 10.0) as i32, freq as i32, (vol * 100.0) as i32));
                if key == tone_key {
                    continue;
                }
                tone_key = key;
                if let Some(s) = tone.take() {
                    s.stop();
                }
                if let Some((pan, freq, vol)) = state {
                    if let Ok(s) = Sink::try_new(&handle) {
                        let src = SineWave::new(freq).fade_in(Duration::from_millis(40));
                        s.append(ChannelVolume::new(src, pan_volumes(pan, vol * 0.35)));
                        tone = Some(s);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pan() {
        assert_eq!(pan_volumes(0.0, 1.0), vec![1.0, 1.0]);
        assert_eq!(pan_volumes(-1.0, 1.0), vec![1.0, 0.0]);
        assert_eq!(pan_volumes(1.0, 1.0), vec![0.0, 1.0]);
    }
}
