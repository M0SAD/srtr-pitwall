//! "Arabayı gerçekten ben mi sürüyorum?" kararı.
//!
//! Sime bağlı olmak sürücü olmak demek değildir: kullanıcı bir arkadaşını izlemek için oturuma girmiş (izleyici),
//! birinin spotter'ı / ekip şefi olmuş, bir tekrar dosyası açmış ya da takım yarışında araçta takım arkadaşı
//! olabilir. Arkadaş durumu ("yarışta"), canlı veri paylaşımı ve ekip pitwall'u yalnızca `Role::Driver` iken
//! çalışır (bkz. `calc::Status::driver`, src/host/crew.ts `isDriving`).
//!
//! Kural (sim başına):
//! - iRacing
//!   1. `WeekendInfo.SimMode` "replay" → tekrar dosyası: `Replay`.
//!   2. `DriverInfo.DriverCarIdx` yok ya da o girişte `IsSpectator` / `CarIsPaceCar` → `Spectator`.
//!   3. `IsOnTrack` (kullanıcı araçta) → `Driver`.
//!   4. Oyuncunun aracındaki o anki sürücü (`Drivers[DriverCarIdx].UserID`) kullanıcının kendisi
//!      (`DriverInfo.DriverUserID`) değil → `Teammate`: takım yarışında araçta takım arkadaşı var ya da kullanıcı
//!      başkasının aracına spotter / ekip olarak katılmış.
//!   5. Aksi halde `Driver`: kendi aracı, garajda / pitte / araçtan inmiş (iRacing'de araçtan inince sim tekrar
//!      ekranına geçer; `IsReplayPlaying` ve kameranın başka araçta olması (`CamCarIdx`) bu yüzden ölçüt DEĞİLDİR).
//! - LMU / rF2: oyuncu aracı yok → `Spectator`; `mControl` 3 → `Replay`; 2 (uzaktan) → `Teammate`; diğerleri `Driver`.
//! - ACC / AC / AMS2: sim yalnızca tekrarı bildirir (`Frame::replay`) → `Replay`; izleyici bilgisi paylaşılan
//!   bellekte yok, bu yüzden canlıyken hep `Driver` (eski davranış).

use crate::model::{Frame, SessionData};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    /// Kendi aracının sürücüsü (araçta, garajda ya da pitte)
    Driver,
    /// Oyuncunun aracını şu an başkası sürüyor (takım arkadaşı; ya da kullanıcı o aracın spotter'ı / ekibi)
    Teammate,
    /// İzleyici: bu oturumda aracı yok
    Spectator,
    /// Tekrar izliyor
    Replay,
}

impl Role {
    pub fn is_driver(self) -> bool {
        self == Role::Driver
    }

    /// `status.role` değeri
    pub fn id(self) -> &'static str {
        match self {
            Role::Driver => "driver",
            Role::Teammate => "teammate",
            Role::Spectator => "spectator",
            Role::Replay => "replay",
        }
    }
}

/// `sim`: `SimKind::id()` ("iracing" | "acc" | "ac" | "lmu" | "rf2" | "ams2"). Saf fonksiyon.
pub fn role(sim: &str, f: &Frame, s: &SessionData) -> Role {
    match sim {
        "iracing" => iracing(f, s),
        "lmu" | "rf2" => match f.seat {
            _ if f.replay => Role::Replay,
            1 => Role::Spectator,
            2 => Role::Teammate,
            _ => Role::Driver,
        },
        _ => {
            if f.replay {
                Role::Replay
            } else {
                Role::Driver
            }
        }
    }
}

fn iracing(f: &Frame, s: &SessionData) -> Role {
    if s.sim_mode == "replay" {
        return Role::Replay;
    }
    let Some(me) = s.player() else {
        // Oturum bilgisi henüz gelmedi (bağlanma anı): araçtaysa sürücüdür
        return if f.is_on_track { Role::Driver } else { Role::Spectator };
    };
    if me.is_spectator || me.is_pace_car {
        return Role::Spectator;
    }
    if f.is_on_track {
        return Role::Driver;
    }
    if s.player_user_id > 0 && me.user_id > 0 && me.user_id != s.player_user_id {
        return Role::Teammate;
    }
    Role::Driver
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Driver;

    fn sd(entry_user: i64, my_user: i64) -> SessionData {
        let mut s = SessionData { drivers: vec![None; 8], player_idx: 3, player_user_id: my_user, sim_mode: "full".into(), ..Default::default() };
        s.drivers[3] = Some(Driver { car_idx: 3, user_id: entry_user, ..Default::default() });
        s
    }

    #[test]
    fn iracing_own_car() {
        let s = sd(77, 77);
        let mut f = Frame::default();
        // Araçtan inmiş: sim tekrar ekranında, kamera başka araçta — yine de sürücü
        f.replay = true;
        f.cam_car_idx = 5;
        assert_eq!(role("iracing", &f, &s), Role::Driver);
        f.is_in_garage = true;
        assert_eq!(role("iracing", &f, &s), Role::Driver);
        f.is_in_garage = false;
        f.is_on_track = true;
        assert_eq!(role("iracing", &f, &s), Role::Driver);
        assert!(role("iracing", &f, &s).is_driver());
    }

    #[test]
    fn iracing_spectator() {
        let mut s = sd(77, 77);
        s.drivers[3].as_mut().unwrap().is_spectator = true;
        let f = Frame::default();
        assert_eq!(role("iracing", &f, &s), Role::Spectator);
        // Oyuncunun girişi yok
        s.player_idx = -1;
        assert_eq!(role("iracing", &f, &s), Role::Spectator);
        let mut s = sd(77, 77);
        s.drivers[3].as_mut().unwrap().is_pace_car = true;
        assert_eq!(role("iracing", &f, &s), Role::Spectator);
    }

    #[test]
    fn iracing_teammate_or_spotter() {
        // Aracın o anki sürücüsü başkası: takım arkadaşı sürüyor / spotter olarak katılmış
        let s = sd(99, 77);
        let mut f = Frame::default();
        assert_eq!(role("iracing", &f, &s), Role::Teammate);
        assert!(!role("iracing", &f, &s).is_driver());
        // Sürücü değişimi: araca bindim, oturum bilgisi henüz güncellenmedi
        f.is_on_track = true;
        assert_eq!(role("iracing", &f, &s), Role::Driver);
        // Üye no bilinmiyorsa (eski kayıt / AI oturumu) sürücü sayılır
        assert_eq!(role("iracing", &Frame::default(), &sd(99, 0)), Role::Driver);
    }

    #[test]
    fn iracing_replay_file() {
        let mut s = sd(77, 77);
        s.sim_mode = "replay".into();
        let mut f = Frame::default();
        f.is_on_track = true;
        assert_eq!(role("iracing", &f, &s), Role::Replay);
        assert_eq!(Role::Replay.id(), "replay");
    }

    #[test]
    fn rf2_seat() {
        let s = SessionData::default();
        let mut f = Frame::default();
        assert_eq!(role("lmu", &f, &s), Role::Driver);
        f.seat = 1;
        assert_eq!(role("lmu", &f, &s), Role::Spectator);
        f.seat = 2;
        assert_eq!(role("rf2", &f, &s), Role::Teammate);
        f.replay = true;
        assert_eq!(role("rf2", &f, &s), Role::Replay);
    }

    #[test]
    fn other_sims_replay_only() {
        let s = SessionData::default();
        let mut f = Frame::default();
        for sim in ["acc", "ac", "ams2"] {
            f.replay = false;
            assert_eq!(role(sim, &f, &s), Role::Driver);
            f.replay = true;
            assert_eq!(role(sim, &f, &s), Role::Replay);
        }
    }
}
