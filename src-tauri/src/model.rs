#![allow(dead_code)]
//! Normalize edilmiş veri modeli. Hem canlı iRacing hem demo kaynağı bu yapıları doldurur.

pub const MAX_CARS: usize = 64;

#[derive(Debug, Clone, Copy, Default)]
pub struct CarState {
    pub lap: i32,
    pub lap_completed: i32,
    pub pct: f32,
    pub position: i32,
    pub class_position: i32,
    pub on_pit: bool,
    pub est_time: f32,
    pub last: f32,
    pub best: f32,
    /// -1 dünyada değil, 0 pist dışı, 1 pit kutusu, 2 pit yoluna yaklaşıyor, 3 pistte
    pub surface: i32,
    pub f2: f32,
    /// Lastik hamuru (-1 bilinmiyor, 0 kuru, 1+ ıslak/diğer)
    pub tire: i32,
    /// Hamur türü harfi (sim doğrudan veriyorsa): b'S' yumuşak, b'M' orta, b'H' sert,
    /// b'I' ara, b'W' yağmur, b'D' kuru (türü bilinmiyor), 0 bilinmiyor
    pub tire_kind: u8,
    /// Araca özel bayraklar (siyah, mavi, hasar, diskalifiye...)
    pub flags: u32,
    /// Simin verdiği sektör numarası (0 bilinmiyor; değeri değil DEĞİŞİMİ kullanılır: resmi sektör sınırı, bkz. timing.rs)
    pub sector: u8,
}

/// Hibrit / ERS durumu (oyuncu aracı). Bilinmeyen sayısal alanlar -1; güçler için `*_ok` bayrağı.
#[derive(Debug, Clone, Copy)]
pub struct Hybrid {
    /// Araçta batarya / hibrit sistem var (sim bu veriyi veriyor)
    pub has: bool,
    /// Batarya doluluğu 0..1
    pub battery_pct: f32,
    /// Bataryadaki enerji (J)
    pub battery_j: f32,
    /// Bu turda kalan harcama hakkı 0..1 (tur başına harcama sınırı olan araçlar)
    pub lap_deploy_left: f32,
    /// MGU-K gücü (kW): + harcama (deploy), - geri kazanım (regen)
    pub mguk_kw: f32,
    pub mguk_ok: bool,
    /// MGU-H gücü (kW)
    pub mguh_kw: f32,
    pub mguh_ok: bool,
    /// Harcama modu (araç içi ayar), sabit harcama ve geri kazanım kazancı
    pub mode: i32,
    pub regen_gain: f32,
    /// Push-to-pass: kalan hak ve şu an açık mı
    pub p2p_count: i32,
    pub p2p_active: bool,
    /// DRS: -1 yok, 0 kapalı, 1 yaklaşan bölgede kullanılabilir, 2 şimdi açılabilir, 3 açık
    pub drs: i32,
    /// Mod adları kümesi: 0 genel ("Mod N"), 1 demo adları
    pub mode_set: u8,
}

impl Default for Hybrid {
    fn default() -> Self {
        Hybrid {
            has: false,
            battery_pct: -1.0,
            battery_j: -1.0,
            lap_deploy_left: -1.0,
            mguk_kw: 0.0,
            mguk_ok: false,
            mguh_kw: 0.0,
            mguh_ok: false,
            mode: -1,
            regen_gain: -1.0,
            p2p_count: -1,
            p2p_active: false,
            drs: -1,
            mode_set: 0,
        }
    }
}

/// Tek bir telemetri karesi. Sabit boyutlu, her karede bellek ayırmaz.
#[derive(Debug, Clone)]
pub struct Frame {
    pub tick: i32,
    pub session_time: f64,
    pub session_time_remain: f64,
    pub session_laps_remain: i32,
    pub session_num: i32,
    pub session_state: i32,
    pub session_flags: u32,
    /// Start ışıkları (startlights overlay'i): yanan kırmızı ışık sayısı ve toplam; sim vermiyorsa toplam 0
    /// (LMU/rF2 mStartLight / mNumRedLights). iRacing bunu SessionFlags start bitleriyle verir.
    pub start_lit: u8,
    pub start_total: u8,
    pub player_idx: i32,
    pub speed: f32,
    pub rpm: f32,
    pub gear: i32,
    pub throttle: f32,
    pub brake: f32,
    pub clutch: f32,
    pub steer: f32,
    pub abs_active: bool,
    /// Çekiş kontrolü şu an devrede (ACC/AC tcInAction; iRacing vermez)
    pub tc_active: bool,
    /// Yanal / boyuna ivme (g). lat_g + = sağa (sağ viraj), long_g + = ileri (hızlanma), fren negatif
    pub lat_g: f32,
    pub long_g: f32,
    /// Oyuncunun bekleyen cezası (0 yok, 1 pit geçişi, 2 dur-kalk, 3 diskalifiye, 4 süre cezası, 5 belirsiz ceza).
    /// ACC / AMS2 / LMU-rF2 doldurur; iRacing'de ceza siyah bayrak bitinden anlaşılır
    pub penalty: u8,
    pub fuel_level: f32,
    pub fuel_pct: f32,
    pub lap: i32,
    pub lap_completed: i32,
    pub lap_dist_pct: f32,
    pub lap_cur: f32,
    pub lap_last: f32,
    pub lap_best: f32,
    pub delta_best: f32,
    pub delta_best_ok: bool,
    /// Oturumun en iyi turuna / optimal tura göre fark (sadece iRacing verir)
    pub delta_session: f32,
    pub delta_session_ok: bool,
    pub delta_optimal: f32,
    pub delta_optimal_ok: bool,
    pub car_left_right: i32,
    pub on_pit_road: bool,
    pub is_on_track: bool,
    pub is_in_garage: bool,
    pub replay: bool,
    /// Tekrar modu canlı ana yetişmiş (iRacing'de araçtan inince/izleyiciyken sim tekrar ekranındadır;
    /// bu gerçek bir tekrar izleme sayılmaz). Sadece iRacing verir (ReplayFrameNumEnd).
    pub replay_live: bool,
    /// iRacing tekrar kafasının konumu (ReplaySessionNum/Time, ReplayFrameNum, ReplayFrameNumEnd) ve kameranın aracı
    pub replay_session_num: i32,
    pub replay_session_time: f64,
    /// -1: sim vermiyor
    pub replay_frame: i32,
    pub replay_frame_end: i32,
    pub cam_car_idx: i32,
    pub air_temp: f32,
    pub track_temp: f32,
    pub incidents: i32,
    /// Sim bu turu geçersiz saydı (ACC isValidLap, LMU/rF2 mCountLapFlag, AMS2 mLapsInvalidated).
    /// iRacing bunu vermez: orada pist dışı ve olay puanından çıkarılır (bkz. laprec.rs)
    pub lap_invalid: bool,
    pub track_wetness: i32,
    pub brake_bias: f32,
    pub tc: f32,
    pub abs_setting: f32,
    /// Motor yağı / soğutma suyu sıcaklığı (°C); bilinmiyorsa -1
    pub oil_temp: f32,
    pub water_temp: f32,
    pub engine_warnings: u32,
    /// Yön (radyan, kuzeye göre) ve araç yerel hızları (m/s): pist haritası kaydı için
    pub yaw_north: f32,
    pub vel_x: f32,
    pub vel_y: f32,
    pub wind_dir: f32,
    pub wind_vel: f32,
    pub humidity: f32,
    pub precip: f32,
    pub shift_pct: f32,
    /// Lastikler: LF, RF, LR, RR. Sıcaklık ve aşınma lastik yüzeyinde sol/orta/sağ.
    /// iRacing bu değerleri sadece pitte (lastik kontrolünde) günceller.
    pub tire_temp: [[f32; 3]; 4],
    pub tire_wear: [[f32; 3]; 4],
    /// Soğuk basınç (kPa)
    pub tire_press: [f32; 4],
    pub tire_compound: i32,
    /// Pit servisi seçimleri (iRacing PitSvFlags: 1 LF, 2 RF, 4 LR, 8 RR lastik, 0x10 yakıt, 0x20 vizör filmi,
    /// 0x40 hızlı tamir); sim vermiyorsa -1
    pub pit_sv_flags: i32,
    /// Pitte eklenecek yakıt (L; iRacing PitSvFuel)
    pub pit_sv_fuel: f32,
    /// Pitte takılacak lastik hamuru (iRacing PitSvTireCompound), bilinmiyorsa -1
    pub pit_sv_compound: i32,
    /// Kalan hızlı tamir hakkı (iRacing FastRepairAvailable), bilinmiyorsa -1
    pub fast_repairs: i32,
    /// Hibrit / ERS / batarya (bkz. `Hybrid`)
    pub hybrid: Hybrid,
    /// Hasar (bkz. drivecues.rs `Damage`): sim ne veriyorsa, yoksa `detail` 0
    pub damage: crate::drivecues::Damage,
    /// Pist dışındaki teker sayısı 0..4 (ACC/AC numberOfTyresOut; LMU/rF2 ve AMS2'de zemin türünden), bilinmiyorsa -1
    pub tyres_out: i8,
    /// Sadece demo: kör noktadaki sanal araçlar (taraf -1 sol / 1 sağ / 0 orta, boyuna mesafe m)
    pub demo_side_cars: Option<Vec<(i8, f32)>>,
    pub cars: [CarState; MAX_CARS],
}

impl Default for Frame {
    fn default() -> Self {
        Frame {
            tick: 0,
            session_time: 0.0,
            session_time_remain: -1.0,
            session_laps_remain: 32767,
            session_num: 0,
            session_state: 0,
            session_flags: 0,
            start_lit: 0,
            start_total: 0,
            player_idx: -1,
            speed: 0.0,
            rpm: 0.0,
            gear: 0,
            throttle: 0.0,
            brake: 0.0,
            clutch: 0.0,
            steer: 0.0,
            abs_active: false,
            tc_active: false,
            lat_g: 0.0,
            long_g: 0.0,
            penalty: 0,
            fuel_level: 0.0,
            fuel_pct: 0.0,
            lap: 0,
            lap_completed: 0,
            lap_dist_pct: 0.0,
            lap_cur: 0.0,
            lap_last: -1.0,
            lap_best: -1.0,
            delta_best: 0.0,
            delta_best_ok: false,
            delta_session: 0.0,
            delta_session_ok: false,
            delta_optimal: 0.0,
            delta_optimal_ok: false,
            car_left_right: 0,
            on_pit_road: false,
            is_on_track: false,
            is_in_garage: false,
            replay: false,
            replay_live: false,
            replay_session_num: 0,
            replay_session_time: 0.0,
            replay_frame: -1,
            replay_frame_end: 0,
            cam_car_idx: -1,
            air_temp: 0.0,
            track_temp: 0.0,
            incidents: 0,
            lap_invalid: false,
            track_wetness: 0,
            brake_bias: -1.0,
            tc: -1.0,
            abs_setting: -1.0,
            oil_temp: -1.0,
            water_temp: -1.0,
            engine_warnings: 0,
            yaw_north: 0.0,
            vel_x: 0.0,
            vel_y: 0.0,
            wind_dir: 0.0,
            wind_vel: 0.0,
            humidity: -1.0,
            precip: -1.0,
            shift_pct: 0.0,
            tire_temp: [[0.0; 3]; 4],
            tire_wear: [[-1.0; 3]; 4],
            tire_press: [0.0; 4],
            tire_compound: -1,
            pit_sv_flags: -1,
            pit_sv_fuel: 0.0,
            pit_sv_compound: -1,
            fast_repairs: -1,
            hybrid: Hybrid::default(),
            damage: crate::drivecues::Damage::default(),
            tyres_out: -1,
            demo_side_cars: None,
            cars: [CarState { surface: -1, pct: -1.0, tire: -1, ..Default::default() }; MAX_CARS],
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Driver {
    pub car_idx: i32,
    /// iRacing üye numarası (CustID); takım yarışında o an süren sürücü
    pub user_id: i64,
    pub name: String,
    pub abbrev: String,
    pub car_number: String,
    pub class_id: i32,
    pub class_name: String,
    pub class_color: String,
    pub class_est_lap: f32,
    pub irating: i32,
    pub license: String,
    pub lic_color: String,
    pub car_name: String,
    pub car_path: String,
    pub car_id: i32,
    /// Ülke/bayrak kısa kodu (iRacing "flair"), yoksa boş
    pub flair: String,
    pub team_name: String,
    /// League Builder uygulanmadan önceki iRacing sınıfı
    pub orig_class_name: String,
    pub orig_class_color: String,
    pub is_spectator: bool,
    pub is_pace_car: bool,
    /// Yapay zekâ sürücü (iRacing CarIsAI, rF2/LMU mControl = 1)
    pub is_ai: bool,
}

#[derive(Debug, Clone, Default)]
pub struct SessionEntry {
    pub num: i32,
    pub kind: String,
    pub laps: Option<i32>,
    pub time: Option<f64>,
}

/// Session YAML'ından çıkarılan, seyrek değişen bilgiler.
#[derive(Debug, Clone, Default)]
pub struct SessionData {
    pub track_name: String,
    pub track_config: String,
    pub track_length_km: f32,
    /// Pit yolu hız sınırı (km/h), bilinmiyorsa 0
    pub pit_limit_kph: f32,
    pub player_idx: i32,
    pub fuel_max_ltr: f32,
    pub max_fuel_pct: f32,
    pub shift_rpm: f32,
    pub redline: f32,
    pub est_lap_time: f32,
    /// Vites ışıkları (iRacing DriverCarSL*)
    pub sl_first: f32,
    pub sl_last: f32,
    pub sl_blink: f32,
    pub incident_limit: i32,
    pub league_id: i64,
    pub track_id: i32,
    pub series_id: i32,
    /// Road / Oval / DirtRoad / DirtOval
    pub category: String,
    pub drivers: Vec<Option<Driver>>, // CarIdx ile indekslenir
    pub sessions: Vec<SessionEntry>,
    /// iRacing DriverInfo.DriverTires: (TireIndex, TireCompoundType) — oyuncunun aracı için
    pub tire_types: Vec<(i32, String)>,
    /// Botlara karşı çevrimdışı oturum (sürücü listesinde AI bayrağı olmayan simler için, ör. ACC çevrimdışı)
    pub ai_session: bool,
    /// iRacing DriverInfo.DriverUserID: bu bilgisayardaki hesabın üye no (takım yarışında araçtaki sürücüden farklı olabilir)
    pub player_user_id: i64,
    /// Resmi sektör başlangıçları (tur yüzdesi, ilki 0; iRacing SplitTimeInfo). Boş: bilinmiyor
    pub sector_starts: Vec<f32>,
}

impl SessionData {
    pub fn driver(&self, idx: usize) -> Option<&Driver> {
        self.drivers.get(idx).and_then(|d| d.as_ref())
    }

    pub fn session(&self, num: i32) -> Option<&SessionEntry> {
        self.sessions.iter().find(|s| s.num == num)
    }

    pub fn is_race(&self, num: i32) -> bool {
        self.session(num).map(|s| s.kind.contains("Race")).unwrap_or(false)
    }

    /// Rakipler arasında yapay zekâ sürücü var mı (botlarla yarış)
    pub fn has_ai_opponents(&self) -> bool {
        self.ai_session
            || self
                .drivers
                .iter()
                .flatten()
                .any(|d| d.is_ai && d.car_idx != self.player_idx && !d.is_pace_car && !d.is_spectator)
    }

    pub fn player(&self) -> Option<&Driver> {
        if self.player_idx < 0 {
            return None;
        }
        self.driver(self.player_idx as usize)
    }

    pub fn class_count(&self) -> usize {
        let mut ids: Vec<i32> = self
            .drivers
            .iter()
            .flatten()
            .filter(|d| !d.is_pace_car && !d.is_spectator)
            .map(|d| d.class_id)
            .collect();
        ids.sort_unstable();
        ids.dedup();
        ids.len()
    }
}

/// Lastik hamuru adından tür harfi ("Soft" → S, "Wet"/"Rain" → W, "Intermediate" → I...).
pub fn tire_kind_from_name(name: &str) -> u8 {
    let n = name.to_ascii_lowercase();
    if n.is_empty() {
        0
    } else if n.contains("wet") || n.contains("rain") {
        b'W'
    } else if n.contains("inter") {
        b'I'
    } else if n.contains("soft") {
        b'S'
    } else if n.contains("med") {
        b'M'
    } else if n.contains("hard") {
        b'H'
    } else {
        b'D'
    }
}

/// Bir aracın lastik türü harfi; bilinmiyorsa 0.
/// Sim doğrudan verdiyse o; yoksa iRacing lastik listesi (sadece oyuncunun sınıfı için güvenilir);
/// o da yoksa 0 = kuru, 1+ = yağmur varsayımı.
pub fn tire_kind(c: &CarState, s: &SessionData, same_class_as_player: bool) -> u8 {
    if c.tire_kind != 0 {
        return c.tire_kind;
    }
    if c.tire < 0 {
        return 0;
    }
    if same_class_as_player && !s.tire_types.is_empty() {
        if let Some((_, name)) = s.tire_types.iter().find(|(i, _)| *i == c.tire) {
            let k = tire_kind_from_name(name);
            // Tek kuru hamuru olan araçlarda ("Hard" + "Wet") sert yazmak yanıltıcı: sadece "kuru"
            let dry = s.tire_types.iter().filter(|(_, n)| !matches!(tire_kind_from_name(n), b'W' | b'I')).count();
            return if dry <= 1 && !matches!(k, b'W' | b'I') { b'D' } else { k };
        }
    }
    if c.tire == 0 {
        b'D'
    } else {
        b'W'
    }
}
