// Ekip paneli (tek sürücünün canlı verisi + pit kontrolleri). crew.html (crew.js) ve Arkadaşlar paneli (friends.js)
// aynı paneli kullanır: mountCrewPanel(kap, sürücü) paneli kaba çizer, 3 sn'de bir yeniler; destroy() durdurur.
// Sunucu: supabase/c53_guncelleme.sql (crew_driver, crew_command, crew_command_get).
// Ekip odası (c64: crew_room, crew_chat_send): sağ sütunda odadakiler (kim pit yetkilisi) + sohbet; mesajlar buradan yazılır.
// Ekip Pitwall'ı (c58: crew_wall): panelin üstünde, saniyede bir yenilenen uzaktan pit duvarı — sürücünün çevresindeki
// araçlar, farklar, tur / delta, bayraklar, hava ve spotter durumu (solda / sağda araç) + hazır spotter mesajları.
// Sürücüden gelen veri güvenilmezdir: metinler esc() ile, sayılar n0() ile, renkler desenle süzülür.
import { T, addDict, esc, sb, toast } from "./core.js";

addDict({
  cw_title: ["Ekip", "Crew"],
  cw_lead: [
    "Ekibinde olduğun sürücünün yarışını izle; izin verdiyse yakıt, lastik ve tamir ayarlarını uzaktan değiştir.",
    "Watch the race of a driver whose crew you are on; if allowed, change fuel, tyre and repair settings remotely.",
  ],
  cw_login: ["Ekip panelini kullanmak için giriş yapmalısın.", "Sign in to use the crew panel."],
  cw_login_btn: ["Giriş yap", "Sign in"],
  cw_none: [
    "Henüz kimsenin ekibinde değilsin. Arkadaşın SRTR Pitwall programında <b>Ayarlar › Paylaşım › Ekip</b> bölümünden seni eklediğinde burada görünür.",
    "You are not on anyone's crew yet. When a friend adds you in the SRTR Pitwall app under <b>Settings › Sharing › Crew</b>, they will appear here.",
  ],
  cw_error: ["Ekip listesi okunamadı. Daha sonra tekrar dene.", "Could not load the crew list. Try again later."],
  cw_pick: ["Sürücü seç", "Pick a driver"],
  cw_back: ["← Sürücüler", "← Drivers"],
  cw_fit: ["Ekrana sığdır", "Fit to screen"],
  cw_fit_h: ["Kaydırmaya gerek kalmadan tüm panel ekrana sığacak şekilde ölçeklenir", "Scales the whole panel so it fits the screen without scrolling"],
  cw_full: ["Tam ekran", "Full screen"],
  cw_full_exit: ["Tam ekrandan çık", "Exit full screen"],
  cw_live: ["Canlı", "Live"],
  cw_racing: ["Yarışta", "Racing"],
  cw_online: ["Çevrimiçi", "Online"],
  cw_offline: ["Çevrimdışı", "Offline"],
  cw_role_control: ["Pit kontrolü", "Pit control"],
  cw_role_view: ["Sadece izleme", "View only"],
  cw_no_data: [
    "Sürücü şu an veri göndermiyor. Yarışa girdiğinde burası kendiliğinden dolar.",
    "The driver is not sending data right now. This fills in automatically when they are on track.",
  ],
  cw_stale: ["Son alınan veri ({0} önce)", "Last received data ({0} ago)"],
  cw_sec: ["{0} sn", "{0} s"],
  cw_min: ["{0} dk", "{0} min"],
  cw_pos: ["Sıra", "Position"],
  cw_class: ["sınıf", "class"],
  cw_lap: ["Tur", "Lap"],
  cw_remain: ["Kalan", "Remaining"],
  cw_laps_n: ["{0} tur", "{0} laps"],
  cw_last: ["Son tur", "Last lap"],
  cw_best: ["En iyi tur", "Best lap"],
  cw_inc: ["Olay puanı", "Incidents"],
  cw_where: ["Konum", "Location"],
  cw_on_track: ["Pistte", "On track"],
  cw_pit_road: ["Pit yolunda", "On pit road"],
  cw_pit_stall: ["Pit kutusunda", "In pit stall"],
  cw_fuel: ["Yakıt", "Fuel"],
  cw_tank: ["Depo", "Tank"],
  cw_per_lap: ["Tur başı", "Per lap"],
  cw_fuel_laps: ["Depoyla tur", "Laps of fuel"],
  cw_race_left: ["Yarışın bitmesine", "Race remaining"],
  cw_to_finish: ["Bitiş için eklenecek", "To add to finish"],
  cw_enough: ["Yeterli", "Enough"],
  cw_service: ["Pit servisi (şu an ayarlı)", "Pit service (currently set)"],
  cw_service_na: ["Bu oyun pit servisi ayarlarını bildirmiyor.", "This game does not report pit service settings."],
  cw_sv_fuel_none: ["Eklenmeyecek", "No fuel"],
  cw_tyres: ["Lastik", "Tyres"],
  cw_tyres_4: ["4 lastik", "All 4"],
  cw_tyres_0: ["Değişmeyecek", "No change"],
  cw_lf: ["Sol ön", "Left front"],
  cw_rf: ["Sağ ön", "Right front"],
  cw_lr: ["Sol arka", "Left rear"],
  cw_rr: ["Sağ arka", "Right rear"],
  cw_fr: ["Hızlı tamir", "Fast repair"],
  cw_fr_left: ["{0} hak", "{0} left"],
  cw_tearoff: ["Vizör filmi", "Tear-off"],
  cw_on: ["Açık", "On"],
  cw_off: ["Kapalı", "Off"],
  cw_tyre_state: ["Lastikler (kalan diş · sıcaklık)", "Tyres (tread left · temperature)"],
  cw_control: ["Pit kontrolü", "Pit control"],
  cw_set_l: ["{0} L ayarla", "Set {0} L"],
  cw_fuel_end: ["Yarış sonuna kadar yakıt", "Fuel to the finish"],
  cw_fuel_end_l: ["Yarış sonuna kadar yakıt ({0} L)", "Fuel to the finish ({0} L)"],
  cw_fuel_none: ["Yakıt ekleme", "No fuel"],
  cw_all: ["4 lastik", "All 4"],
  cw_none_t: ["Hiçbiri", "None"],
  cw_clear: ["Tümünü temizle", "Clear all"],
  cw_clear_ask: ["Bütün pit servisi seçimleri kaldırılsın mı?", "Clear every pit service selection?"],
  cw_msg: ["Mesaj", "Message"],
  cw_msg_ph: ["Sürücüye kısa mesaj (ekranında görünür)", "Short message to the driver (shown on screen)"],
  cw_send: ["Gönder", "Send"],
  cw_b_view: ["Bu sürücü sana sadece izleme yetkisi verdi.", "This driver gave you view-only access."],
  cw_b_idle: ["Sürücü şu an yarışta değil ya da veri göndermiyor.", "The driver is not racing or not sending data right now."],
  cw_b_sim: ["Uzaktan pit komutları bu oyunda desteklenmiyor (sadece izleme).", "Remote pit commands are not supported in this game (view only)."],
  cw_b_off: ["Sürücü ekip kontrolünü kapattı.", "The driver turned crew control off."],
  cw_st_pending: ["Bekliyor…", "Pending…"],
  cw_st_applied: ["Uygulandı", "Applied"],
  cw_st_rejected: ["Reddedildi", "Rejected"],
  cw_st_expired: ["Süresi doldu", "Expired"],
  cw_c_fuel: ["yakıt {0} L", "fuel {0} L"],
  cw_c_fuel_clear: ["yakıt eklenmeyecek", "no fuel"],
  cw_c_tyres_all: ["4 lastik değişecek", "change all 4 tyres"],
  cw_c_tyres: ["lastik: {0}", "tyres: {0}"],
  cw_c_tyres_clear: ["lastik değişmeyecek", "no tyre change"],
  cw_c_fr_on: ["hızlı tamir açık", "fast repair on"],
  cw_c_fr_off: ["hızlı tamir kapalı", "fast repair off"],
  cw_c_to_on: ["vizör filmi açık", "tear-off on"],
  cw_c_to_off: ["vizör filmi kapalı", "tear-off off"],
  cw_c_clear: ["pit servisi temizlendi", "pit service cleared"],
  cw_flag_check: ["Damalı bayrak", "Chequered flag"],
  cw_flag_red: ["Kırmızı bayrak", "Red flag"],
  cw_flag_sc: ["Güvenlik aracı", "Safety car"],
  cw_flag_yellow: ["Sarı bayrak", "Yellow flag"],
  cw_flag_white: ["Son tur", "Final lap"],
  // Sunucunun / programın Türkçe döndürdüğü sonuç ve hata metinleri
  cw_r_stopped: ["Sürücü ekip kontrolünü durdurdu", "The driver stopped crew control"],
  cw_r_not_accept: ["Sürücü şu an ekip kontrolünü kabul etmiyor", "The driver is not accepting crew control right now"],
  cw_r_not_in_game: ["Sürücü oyunda değil", "The driver is not in the game"],
  cw_r_not_driving: ["Sürücü şu an aracı sürmüyor", "The driver is not driving the car right now"],
  cw_r_unsupported: ["Bu oyunda desteklenmiyor", "Not supported in this game"],
  cw_r_expired: ["Süresi doldu (sürücünün uygulaması yanıt vermedi)", "Expired (the driver's app did not respond)"],
  cw_r_no_perm: ["Bu sürücünün pit ayarlarını değiştirme yetkin yok", "You are not allowed to change this driver's pit settings"],
  cw_r_not_crew: ["Bu sürücünün ekibinde değilsin", "You are not on this driver's crew"],
  cw_r_rate: ["Çok hızlı: dakikada en fazla 30 komut gönderebilirsin", "Too fast: at most 30 commands per minute"],
  cw_r_fuel_range: ["Yakıt miktarı 1 ile 1000 litre arasında olmalı", "Fuel must be between 1 and 1000 litres"],
  // Ekip Pitwall'ı (c58)
  cw_wall: ["Ekip Pitwall'ı", "Crew pit wall"],
  cw_wall_off: ["Sürücü canlı pitwall paylaşımını kapattı. Aşağıdaki özet panel çalışmaya devam eder.", "The driver turned live pit wall sharing off. The summary panel below keeps working."],
  cw_wall_wait: [
    "Pitwall verisi bekleniyor… Sürücü pistteyken birkaç saniye içinde gelir (sürücünün programı güncel olmalı).",
    "Waiting for pit wall data… It arrives within a few seconds while the driver is on track (their app must be up to date).",
  ],
  cw_wall_late: ["Veri gecikti", "Data delayed"],
  cw_wall_note: [
    "Veri 1–2 saniye gecikmeyle gelir; yan araç göstergesi anlık spotter yerine geçmez. Sesli görüşme yoktur.",
    "Data arrives 1–2 seconds late; the side indicator does not replace a real-time spotter. There is no voice chat.",
  ],
  cw_delta: ["Delta (en iyi tura göre)", "Delta (to best lap)"],
  cw_wx: ["Hava / pist", "Air / track"],
  cw_wet: ["ıslak", "wet"],
  cw_sp_left: ["SOLDA ARAÇ", "CAR LEFT"],
  cw_sp_right: ["SAĞDA ARAÇ", "CAR RIGHT"],
  cw_sp_both: ["İki yanda araç", "Cars on both sides"],
  cw_sp_l: ["Solunda araç", "Car on the left"],
  cw_sp_r: ["Sağında araç", "Car on the right"],
  cw_sp_clear: ["Temiz", "Clear"],
  cw_sp_none: ["Spotter verisi yok", "No spotter data"],
  cw_ahead: ["Önde {0} m", "Ahead {0} m"],
  cw_behind: ["Arkada {0} m", "Behind {0} m"],
  cw_th_class: ["Sınıf", "Class"],
  cw_th_no: ["No", "No"],
  cw_th_driver: ["Sürücü", "Driver"],
  cw_th_gap: ["Fark", "Gap"],
  cw_th_last: ["Son tur", "Last"],
  cw_th_best: ["En iyi", "Best"],
  cw_near: ["Pistte çevresindekiler", "Around on track"],
  cw_lapdiff: ["{0} tur", "{0} lap"],
  cw_f_green: ["Yeşil bayrak", "Green flag"],
  cw_f_blue: ["Mavi bayrak", "Blue flag"],
  cw_f_debris: ["Pistte parça", "Debris on track"],
  cw_f_1green: ["Yeşile bir tur", "One lap to green"],
  cw_f_black: ["Siyah bayrak", "Black flag"],
  cw_f_dq: ["Diskalifiye", "Disqualified"],
  cw_f_repair: ["Tamir bayrağı", "Repair flag"],
  // Sürücünün konuşma altyazısı (c60)
  cw_speech: ["Sürücü konuşuyor", "Driver speaking"],
  cw_speech_empty: ["Sürücünün konuşma altyazısı kapalı ya da henüz konuşmadı", "The driver's speech captions are off, or they have not spoken yet"],
  cw_speech_pro: ["Sürücünün konuşmasını altyazı olarak görmek PRO üyelere özel.", "Reading the driver's speech as subtitles is for PRO members."],
  cw_quick: ["Hızlı spotter mesajları (sürücünün ekranında görünür ve sesli okunur)", "Quick spotter messages (shown on the driver's screen and read aloud)"],
  cw_q_left: ["Solunda araç", "Car on your left"],
  cw_q_right: ["Sağında araç", "Car on your right"],
  cw_q_clear: ["Temiz", "Clear"],
  cw_q_fast: ["Arkandan hızlı araç geliyor", "Faster car coming from behind"],
  cw_q_pit: ["Bu tur pit", "Pit this lap"],
  cw_q_save: ["Yakıt tasarrufu yap", "Save fuel"],
  cw_r_windows: ["iRacing komutları sadece Windows'ta çalışır", "iRacing commands only work on Windows"],
  // Grafik panel (lastik / yakıt / servis görselleri)
  cw_ty_hint: ["Lastiğe dokun: değişimi aç / kapat. Dolgu kalan dişi, sayı sıcaklığı gösterir.", "Tap a tyre to toggle its change. The fill shows tread left, the number shows temperature."],
  cw_ty_legend: ["Dolgu kalan dişi, sayı sıcaklığı gösterir.", "The fill shows tread left, the number shows temperature."],
  cw_will: ["değişecek", "will change"],
  cw_stays: ["değişmeyecek", "no change"],
  cw_wear: ["kalan diş", "tread left"],
  cw_cmp_dry: ["Kuru", "Dry"],
  cw_cmp_wet: ["Yağmur", "Wet"],
  cw_after: ["Pit sonrası", "After the stop"],
  cw_finish: ["Bitiş", "Finish"],
  cw_fin_add: ["Bitiş için +{0} L", "+{0} L to finish"],
  cw_fin_ok: ["Bitişe yeter", "Enough to finish"],
  cw_q_end: ["Bitişe kadar", "To the finish"],
  cw_q_full: ["Dolu", "Full"],
  cw_add_aria: ["Eklenecek yakıt (litre)", "Fuel to add (litres)"],
  cw_tank_aria: ["Depo {0} L, pit sonrası {1} L", "Tank {0} L, after the stop {1} L"],
  cw_ring_aria: ["Tur {0}, kalan {1}", "Lap {0}, remaining {1}"],
  cw_sp_L: ["SOL", "LEFT"],
  cw_sp_R: ["SAĞ", "RIGHT"],
  cw_locked: ["Kilitli", "Locked"],
  // Ekip odası (c64): odadakiler + sohbet
  cw_room: ["Ekip odası", "Crew room"],
  cw_room_n: ["{0} kişi odada", "{0} in the room"],
  cw_room_driver: ["Sürücü", "Driver"],
  cw_room_ctl: ["Pit yetkilisi", "Pit control"],
  cw_room_ctl_h: ["Yakıt ve lastik ayarlarını değiştirebilir", "Can change fuel and tyre settings"],
  cw_room_ctl_idle: ["Yetkili, ancak sürücü ekip kontrolünü kapattı", "Authorised, but the driver turned crew control off"],
  cw_room_watch: ["İzliyor", "Watching"],
  cw_room_away: ["Odada değil", "Not in the room"],
  cw_room_empty: ["Henüz mesaj yok. Buraya yazılanları sürücü ve odadaki tüm ekip görür.", "No messages yet. Everything written here is seen by the driver and the whole crew in the room."],
  cw_room_ph: ["Ekip odasına yaz (sürücü ve ekip görür)", "Write to the crew room (seen by the driver and crew)"],
  cw_room_err: ["Ekip odası okunamadı. Daha sonra tekrar dene.", "Could not load the crew room. Try again later."],
  cw_r_chat_fast: ["Çok hızlı: dakikada en fazla 20 mesaj gönderebilirsin", "Too fast: you can send at most 20 messages per minute"],
  // c75: yalnızca yarıştaki sürücüler, sürücü başına tek spotter, odaya yalnızca spotter yazar
  cw_none_race: [
    "Şu an yarışta olan ve seni ekibine eklemiş bir arkadaşın yok. Burada yalnızca o an yarışta olan arkadaşların listelenir; yarıştan çıkan sürücü listeden düşer ve ekip odasının sohbeti silinir. Arkadaşın seni SRTR Pitwall programında <b>Ayarlar › Paylaşım › Ekip</b> bölümünden ekibine ekler.",
    "None of the friends who added you to their crew is racing right now. Only friends who are currently in a race are listed here; a driver who leaves the race drops off the list and the crew room chat is deleted. A friend adds you to their crew in the SRTR Pitwall app under <b>Settings › Sharing › Crew</b>.",
  ],
  cw_spot_me: ["Spotter: sen", "Spotter: you"],
  cw_spot_is: ["Spotter: {0}", "Spotter: {0}"],
  cw_spot_none: ["Spotter: yok", "Spotter: none"],
  cw_spot_other: ["Spotter: {0} — sadece izleme", "Spotter: {0} — view only"],
  cw_spot_tag: ["Spotter", "Spotter"],
  cw_spot_tag_h: ["Pit ayarlarını yöneten ve odaya yazabilen tek kişi", "The only person who manages the pit settings and can write in the room"],
  cw_b_spot: [
    "Spotter: {0} — sadece izliyorsun. Pit ayarlarını aynı anda tek kişi yönetebilir; yer boşalınca sana geçer.",
    "Spotter: {0} — you are only watching. Only one person can manage the pit settings at a time; you take over when the seat frees up.",
  ],
  cw_ro_spot: ["Spotter: {0} — sadece izliyorsun. Odaya yalnızca spotter yazabilir.", "Spotter: {0} — you are only watching. Only the spotter can write in the room."],
  cw_ro_view: [
    "Odaya yalnızca spotter yazabilir. Spotter olmak için pit ayarlarını değiştirme yetkisi gerekir.",
    "Only the spotter can write in the room. You need permission to change pit settings to become the spotter.",
  ],
  cw_ro_closed: [
    "Ekip odası yalnızca sürücü yarıştayken açıktır. Yarış bitince sohbet silinir.",
    "The crew room is only open while the driver is racing. The chat is deleted when the race ends.",
  ],
  cw_room_closed: ["Sürücü şu an yarışta değil. Ekip odası yarış başlayınca açılır.", "The driver is not racing right now. The crew room opens when a race starts."],
  cw_gone_race: ["Sürücü yarıştan çıktı: ekip odası kapandı.", "The driver left the race: the crew room is closed."],
  cw_r_spot_only: ["Sadece spotter mesaj yazabilir", "Only the spotter can write messages"],
  cw_r_spot_busy: ["Pit ayarlarını şu an başka bir spotter yönetiyor: sadece izleyebilirsin", "Another spotter is managing the pit settings right now: you can only watch"],
});

/** Sunucudan / programdan gelen Türkçe metin -> çeviri anahtarı */
const RESULT_KEYS = {
  "Çok hızlı: dakikada en fazla 20 mesaj gönderebilirsin": "cw_r_chat_fast",
  "Sadece spotter mesaj yazabilir": "cw_r_spot_only",
  "Pit ayarlarını şu an başka bir spotter yönetiyor: sadece izleyebilirsin": "cw_r_spot_busy",
  "Sürücü ekip kontrolünü durdurdu": "cw_r_stopped",
  "Sürücü şu an ekip kontrolünü kabul etmiyor": "cw_r_not_accept",
  "Sürücü oyunda değil": "cw_r_not_in_game",
  "Sürücü şu an aracı sürmüyor": "cw_r_not_driving",
  "Bu oyunda desteklenmiyor": "cw_r_unsupported",
  "Süresi doldu (sürücünün uygulaması yanıt vermedi)": "cw_r_expired",
  "Bu sürücünün pit ayarlarını değiştirme yetkin yok": "cw_r_no_perm",
  "Bu sürücünün ekibinde değilsin": "cw_r_not_crew",
  "Çok hızlı: dakikada en fazla 30 komut gönderebilirsin": "cw_r_rate",
  "Yakıt miktarı 1 ile 1000 litre arasında olmalı": "cw_r_fuel_range",
  "iRacing komutları sadece Windows'ta çalışır": "cw_r_windows",
};
export const tr = (s) => (RESULT_KEYS[s] ? T(RESULT_KEYS[s]) : s || "");

const PIT = { lf: 1, rf: 2, lr: 4, rr: 8, fuel: 0x10, tearoff: 0x20, fr: 0x40, tyres: 0x0f };
const CORNERS = [
  ["lf", PIT.lf],
  ["rf", PIT.rf],
  ["lr", PIT.lr],
  ["rr", PIT.rr],
];
export const SIMS = { iracing: "iRacing", acc: "ACC", ac: "Assetto Corsa", lmu: "Le Mans Ultimate", rf2: "rFactor 2", ams2: "AMS2" };
const simOk = (s) => !s || s === "iracing";

/** Sürücüden gelen veri güvenilmez: sayı olmayan her şey 0 sayılır (HTML'e sayı olarak yazılır) */
export const n0 = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
export const num = (v, d = 1) => (typeof v === "number" && isFinite(v) ? v.toFixed(d) : "—");
function lapTime(s) {
  if (!(s > 0)) return "—";
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m > 0 ? `${m}:${r.toFixed(3).padStart(6, "0")}` : r.toFixed(3);
}
function remain(sec, laps) {
  if (typeof laps === "number" && laps >= 0 && laps < 32000) return T("cw_laps_n", laps);
  sec = typeof sec === "number" ? sec : -1;
  if (sec == null || sec < 0 || sec > 600000) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function flagText(f) {
  if (!f) return "";
  if (f & 0x1) return T("cw_flag_check");
  if (f & 0x10) return T("cw_flag_red");
  if (f & (0x4000 | 0x8000)) return T("cw_flag_sc");
  if (f & (0x8 | 0x100)) return T("cw_flag_yellow");
  if (f & 0x2) return T("cw_flag_white");
  return "";
}
const ago = (s) => (s < 90 ? T("cw_sec", s) : T("cw_min", Math.round(s / 60)));
export const statusText = (d) => T(d.live ? "cw_live" : d.racing ? "cw_racing" : d.online ? "cw_online" : "cw_offline");

function cmdText(kind, a = {}) {
  switch (kind) {
    case "fuel_set":
      return T("cw_c_fuel", Math.ceil(Number(a.liters) || 0));
    case "fuel_clear":
      return T("cw_c_fuel_clear");
    case "tyres_all":
      return T("cw_c_tyres_all");
    case "tyres": {
      const l = CORNERS.filter(([k]) => a[k]).map(([k]) => T("cw_" + k));
      return l.length ? T("cw_c_tyres", l.join(", ")) : T("cw_c_tyres_clear");
    }
    case "tyres_clear":
      return T("cw_c_tyres_clear");
    case "fast_repair":
      return T(a.on === false ? "cw_c_fr_off" : "cw_c_fr_on");
    case "tearoff":
      return T(a.on === false ? "cw_c_to_off" : "cw_c_to_on");
    case "clear_all":
      return T("cw_c_clear");
    case "message":
      return String(a.text ?? "");
    default:
      return kind;
  }
}


// ---- Ekip Pitwall'ı ----
const WALL_FLAGS = {
  checkered: ["cw_flag_check", "chk"],
  white: ["cw_flag_white", "wht"],
  green: ["cw_f_green", "grn"],
  yellow: ["cw_flag_yellow", "yel"],
  red: ["cw_flag_red", "red"],
  blue: ["cw_f_blue", "blu"],
  debris: ["cw_f_debris", "yel"],
  greenHeld: ["cw_f_green", "grn"],
  oneLapToGreen: ["cw_f_1green", "yel"],
  caution: ["cw_flag_sc", "yel"],
  cautionWaving: ["cw_flag_sc", "yel"],
  black: ["cw_f_black", "blk"],
  disqualify: ["cw_f_dq", "blk"],
  repair: ["cw_f_repair", "blk"],
};
const QUICK = ["cw_q_left", "cw_q_right", "cw_q_clear", "cw_q_fast", "cw_q_pit", "cw_q_save"];
const safeColor = (c) => (typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c) ? c : "transparent");
const WALL_CSS = `
.cw-wall{margin:10px 0 4px}
.cw-wflags{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.cw-wflag{padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;border:1px solid var(--line,#333)}
.cw-wflag.yel{background:#f5c518;color:#111;border-color:#f5c518}
.cw-wflag.red{background:#d93025;color:#fff;border-color:#d93025}
.cw-wflag.grn{background:#1e9e4a;color:#fff;border-color:#1e9e4a}
.cw-wflag.blu{background:#1f6feb;color:#fff;border-color:#1f6feb}
.cw-wflag.wht,.cw-wflag.chk{background:#f2f2f2;color:#111}
.cw-wflag.blk{background:#000;color:#fff}
.cw-spot{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:6px;margin:8px 0;align-items:stretch}
.cw-spot.off{opacity:.55}
.cw-side{display:flex;align-items:center;justify-content:center;min-height:48px;padding:4px;border:1px solid var(--line,#333);border-radius:10px;font-size:12px;font-weight:800;text-align:center}
.cw-side.on{background:#d93025;border-color:#d93025;color:#fff}
.cw-mid{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center}
.cw-mid small{color:var(--muted,#999);font-size:12px}
.cw-tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
.cw-table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.cw-table th{padding:4px 6px;text-align:left;color:var(--muted,#999);font-size:11px;font-weight:500}
.cw-table td{padding:6px;border-top:1px solid var(--line,#333);white-space:nowrap}
.cw-table .r{text-align:right}
.cw-table tr.me td{background:rgba(255,255,255,.08);font-weight:700}
.cw-table tr.pit td{color:var(--muted,#999)}
.cw-table tr.sep td{border-top:0;padding-top:8px;color:var(--muted,#999);font-size:11px}
.cw-table td.nm{max-width:38vw;overflow:hidden;text-overflow:ellipsis}
.cw-table td.nm em{margin-left:5px;padding:0 4px;border-radius:4px;background:#f5c518;color:#111;font-size:10px;font-style:normal;font-weight:700}
.cw-table i.cc{display:inline-block;width:4px;height:14px;margin-right:5px;border-radius:2px;vertical-align:-2px}
.cw-table .tr-c{color:#2fbf71}
.cw-table .tr-o{color:#e5534b}
.cw-table .dim{color:var(--muted,#999)}
.cw-speech{margin:12px 0 4px;padding:8px 10px;border:1px solid var(--line,#333);border-radius:10px}
.cw-speech h4{margin:0 0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#999)}
.cw-speech p{display:flex;gap:8px;margin:2px 0;font-size:13px;line-height:1.35;transition:opacity .6s}
.cw-speech time{flex:none;color:var(--muted,#999);font-size:11px;font-variant-numeric:tabular-nums;padding-top:2px}
.cw-speech p.now{font-size:15px;font-weight:600}
.cw-speech p.live span{color:#f2b233}
.cw-speech p.empty{color:var(--muted,#999);font-size:12px;font-style:italic}
.cw-speech .pro{display:inline-block;margin-right:6px;padding:1px 6px;border-radius:4px;background:#f2b233;color:#111;font-size:10px;font-weight:800;font-style:normal}
.cw-quick{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0 10px}
.cw-stat.good b{color:#2fbf71}
@media (max-width:420px){.cw-table .best{display:none}}
`;
function wallStyle() {
  if (document.getElementById("cw-wall-style")) return;
  const el = document.createElement("style");
  el.id = "cw-wall-style";
  el.textContent = WALL_CSS;
  document.head.appendChild(el);
}

// ---- Grafikler (pg-*: crew.css). Özgün çizimler; dış görsel yok. ----
const IC = {
  fuel: '<path d="M5 20V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v14M3.5 20h12M7.5 7.5h4V11h-4zM14 10h1.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V9l-2.5-2.5"/>',
  tyre: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5V9M12 15v5.5M3.5 12H9M15 12h5.5"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 0 0 5.2-5.2l-2.5 2.5-2.2-.8-.8-2.2z"/>',
  visor: '<path d="M4 15a8 8 0 0 1 16-1.5V16a2 2 0 0 1-2 2h-6.5L8 15z"/><path d="M10.5 10.5H19.5M10.5 10.5 12 14h8"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  warn: '<path d="M12 4.5 20.5 19h-17zM12 10v4M12 16.6v.2"/>',
  left: '<path d="M11 6l-6 6 6 6M5 12h14"/>',
  right: '<path d="M13 6l6 6-6 6M19 12H5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  fast: '<path d="M6 12l6-6 6 6M6 19l6-6 6 6"/>',
  pit: '<path d="M8 20V5h5a4 4 0 0 1 0 8H8"/>',
  drop: '<path d="M12 3.5c3 4 5.5 6.8 5.5 10a5.5 5.5 0 0 1-11 0c0-3.2 2.5-6 5.5-10z"/>',
  road: '<path d="M8 4 5 20M16 4l3 16M12 5v3M12 11v3M12 17v3"/>',
  send: '<path d="M4 12 20 5l-5 15-3-6z"/>',
  helmet: '<path d="M4 14a8 8 0 0 1 16 0v3a2 2 0 0 1-2 2H9l-5-3z"/><path d="M11 12h9M11 12l1.5 3.5H20"/>',
};
const ic = (n) => `<svg class="pg-ic" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
/** Üstten araç silueti (burun yukarıda); lastikler ayrı çizilir */
const carSvg = (cls) => `<svg class="${cls}" viewBox="0 0 96 220" aria-hidden="true">
  <g class="ax"><rect x="0" y="50" width="96" height="4" rx="2"/><rect x="0" y="166" width="96" height="4" rx="2"/></g>
  <rect class="wg" x="20" y="3" width="56" height="6" rx="3"/>
  <path class="bd" d="M48 6C62 6 72 12 74 26L76 44C78 60 78 70 74 84L72 120C72 132 78 140 78 156L78 188C78 200 70 206 48 206C26 206 18 200 18 188L18 156C18 140 24 132 24 120L22 84C18 70 18 60 20 44L22 26C24 12 34 6 48 6Z"/>
  <path class="st" d="M48 12V74"/>
  <path class="ck" d="M35 88C35 77 61 77 61 88L63 126C63 136 33 136 33 126Z"/>
  <path class="gl" d="M37 90C40 82 56 82 59 90L58 100H38Z"/>
  <ellipse class="mr" cx="20" cy="92" rx="4" ry="3"/><ellipse class="mr" cx="76" cy="92" rx="4" ry="3"/>
  <path class="lt" d="M27 19l8-5M69 19l-8-5"/>
  <rect class="wg" x="10" y="204" width="76" height="10" rx="3"/>
</svg>`;
/** Oturum bayrağı (iRacing SessionFlags) -> [çeviri anahtarı, renk sınıfı] */
function flagInfo(f) {
  if (!f) return null;
  if (f & 0x1) return ["cw_flag_check", "chk"];
  if (f & 0x10) return ["cw_flag_red", "red"];
  if (f & (0x4000 | 0x8000)) return ["cw_flag_sc", "yel"];
  if (f & (0x8 | 0x100)) return ["cw_flag_yellow", "yel"];
  if (f & 0x2) return ["cw_flag_white", "wht"];
  return null;
}
/** Depo çizimi ölçüleri (yüzde): seviye, pit sonrası (hayalet dolgu), bitiş işareti */
function fuelGeo(level, cap, add, needed) {
  const scale = cap > 0 ? cap : Math.max(level + add, needed, level, 1) * 1.1;
  const pc = (v) => Math.max(0, Math.min(100, (v / scale) * 100));
  const after = cap > 0 ? Math.min(cap, level + add) : level + add;
  return { lvl: pc(level), gh: Math.max(0, pc(after) - pc(level)), fin: needed > 0 ? pc(needed) : -1, over: needed > scale, after };
}
const QUICK_IC = { cw_q_left: "left", cw_q_right: "right", cw_q_clear: "check", cw_q_fast: "fast", cw_q_pit: "pit", cw_q_save: "drop" };

const stat = (label, value, cls = "") => `<div class="cw-stat ${cls}"><small>${label}</small><b>${value}</b></div>`;

/**
 * Sürücü panelini `host` içine kurar. opts.onGone: yetki kalktığında (ekipten çıkarıldın) çağrılır.
 * Dönüş: { destroy(), redraw() }. Aynı anda birden çok panel olabilir (durum kapanışta tutulur).
 */
/** İçeriği silip baştan yazmak yerine yerinde günceller: yalnızca değişen düğümler / nitelikler dokunulur.
 *  Böylece her yenilemede panel "sayfa yenileniyor" gibi kırpışmaz; odak, kaydırma ve animasyonlar korunur. */
function morphNode(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return void a.replaceWith(b.cloneNode(true));
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
  for (const at of b.attributes) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  // Yazı / sayı kutuları: kullanıcı o an yazmıyorsa değer de eşitlenir
  if ((a.nodeName === "INPUT" || a.nodeName === "TEXTAREA") && document.activeElement !== a) {
    const v = b.getAttribute("value");
    if (v !== null && a.value !== v) a.value = v;
  }
  morphKids(a, b);
}
function morphKids(a, b) {
  const an = [...a.childNodes];
  const bn = [...b.childNodes];
  for (let i = 0; i < bn.length; i++) {
    if (i < an.length) morphNode(an[i], bn[i]);
    else a.appendChild(bn[i].cloneNode(true));
  }
  for (let i = bn.length; i < an.length; i++) an[i].remove();
}
function morph(el, html) {
  if (!el.firstChild) return void (el.innerHTML = html);
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  morphKids(el, tpl.content);
}

export function mountCrewPanel(host, ownerId, opts = {}) {
  let alive = true;
  let drv = null;
  let liters = 40;
  let litersTouched = false;
  let sent = []; // son komutlar (yeni başta)
  const q = (s) => host.querySelector(s);
  // ---- Görünüm: ekrana sığdır / tam ekran ----
  // box: ölçeklenmeyen sarmalayıcı (görünen yükseklik buradan ölçülür); body: içerik (CSS zoom burada)
  host.textContent = "";
  const box = document.createElement("div");
  box.className = "cw-box";
  const bar = document.createElement("div");
  bar.className = "cw-view";
  const body = document.createElement("div");
  body.className = "cw-body";
  box.append(bar, body);
  host.append(box);
  const ls = (k, v) => {
    try {
      if (v === undefined) return localStorage.getItem(k) === "1";
      localStorage.setItem(k, v ? "1" : "0");
    } catch {}
    return false;
  };
  let fit = ls("crew.fit");
  let full = false;
  let zoom = 1;
  let fitRaf = 0;
  const isFs = () => document.fullscreenElement === host;
  function drawBar() {
    morph(
      bar,
      `<button type="button" class="cw-vb${fit ? " on" : ""}" data-view="fit" title="${esc(T("cw_fit_h"))}">${T("cw_fit")}</button>` +
        `<button type="button" class="cw-vb${full ? " on" : ""}" data-view="full">${T(full ? "cw_full_exit" : "cw_full")}</button>`,
    );
    host.classList.toggle("cw-fit", fit);
    host.classList.toggle("cw-full", full);
  }
  function runFit() {
    fitRaf = 0;
    if (!alive) return;
    if (!fit) {
      zoom = 1;
      body.style.removeProperty("zoom");
      box.classList.remove("cols2");
      return;
    }
    box.classList.toggle("cols2", box.clientWidth >= 900);
    // Tam ekranda tüm ekran; sayfada ise panelin sayfadaki konumundan ekranın altına kadar
    const top = full ? box.getBoundingClientRect().top : box.getBoundingClientRect().top + window.scrollY;
    const avail = Math.max(240, window.innerHeight - Math.min(top, window.innerHeight * 0.5) - 12);
    for (let i = 0; i < 8; i++) {
      body.style.zoom = String(zoom);
      const h = box.getBoundingClientRect().height;
      if (h < 1) break;
      const nz = Math.max(0.4, Math.min(1, (zoom * avail) / h));
      if (Math.abs(nz - zoom) < 0.012 || (nz > zoom && nz - zoom < 0.03)) break;
      zoom = nz;
    }
    body.style.zoom = String(zoom);
  }
  const kickFit = () => {
    if (!fitRaf) fitRaf = requestAnimationFrame(runFit);
  };
  const fitRo = new ResizeObserver(kickFit);
  fitRo.observe(body);
  fitRo.observe(box);
  window.addEventListener("resize", kickFit);
  const setFull = (v) => {
    full = v;
    try {
      if (v && !isFs()) host.requestFullscreen?.()?.catch?.(() => {});
      else if (!v && isFs()) document.exitFullscreen?.()?.catch?.(() => {});
    } catch {}
    drawBar();
    kickFit();
  };
  let wasFs = false;
  const onFsChange = () => {
    if (wasFs && !isFs() && full) setFull(false);
    wasFs = isFs();
    kickFit();
  };
  const onFsKey = (e) => {
    if (e.key === "Escape" && full && !isFs()) setFull(false);
  };
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("keydown", onFsKey);
  // Ekip Pitwall'ı durumu
  let wall = null; // crew_wall() yanıtı {on, age_ms, data}; null: henüz yok / okunamadı
  let wallBusy = false;
  let wallSkip = 0;
  let wallTs = 0;
  let trend = {}; // araç idx -> fark değişimi (sn; − kapanıyor)
  const hist = new Map();
  wallStyle();

  async function loadWall() {
    if (!alive || wallBusy || document.hidden) return;
    // Okunamadıysa (ör. sunucu güncel değil) 10 sn bekle
    if (wallSkip > 0) return void wallSkip--;
    wallBusy = true;
    try {
      const { data, error } = await sb.rpc("crew_wall", { p_owner: ownerId });
      if (!alive) return;
      wall = error ? null : data;
      if (error) wallSkip = 10;
      const d = wall?.data;
      if (d && typeof d === "object" && d.ts !== wallTs) {
        wallTs = d.ts;
        const tr = {};
        const seen = new Set();
        for (const r of Array.isArray(d.rows) ? d.rows : []) {
          if (!r || r.me || typeof r.g !== "number" || r.lr) continue;
          seen.add(r.i);
          const h = hist.get(r.i) || [];
          h.push({ ts: n0(d.ts), g: Math.abs(r.g) });
          while (h.length > 6) h.shift();
          hist.set(r.i, h);
          if (h.length >= 3 && n0(d.ts) - h[0].ts >= 2000) tr[r.i] = Math.abs(r.g) - h[0].g;
        }
        for (const k of [...hist.keys()]) if (!seen.has(k)) hist.delete(k);
        trend = tr;
      }
      drawWall();
    } finally {
      wallBusy = false;
    }
  }

  function wallRow(r) {
    const tv = trend[r.i];
    const tc = typeof tv === "number" && Math.abs(tv) >= 0.1 ? (tv < 0 ? "tr-c" : "tr-o") : "";
    const gap = r.me ? "" : r.lr ? esc(T("cw_lapdiff", (n0(r.lr) > 0 ? "+" : "") + n0(r.lr))) : typeof r.g === "number" ? `${r.g > 0 ? "−" : "+"}${Math.abs(r.g).toFixed(1)}` : "—";
    return `<tr class="${r.me ? "me" : ""}${r.pit ? " pit" : ""}" translate="no">
      <td><i class="cc" style="background:${safeColor(r.c)}"></i>${n0(r.cp) > 0 ? n0(r.cp) : "—"}</td>
      <td>#${esc(String(r.n ?? "").slice(0, 4))}</td>
      <td class="nm">${esc(String(r.nm ?? "?").slice(0, 28))}${r.pit ? "<em>PIT</em>" : ""}</td>
      <td class="r ${tc}">${gap}${tc ? (tc === "tr-c" ? " ▼" : " ▲") : ""}</td>
      <td class="r">${lapTime(n0(r.l))}</td>
      <td class="r dim best">${lapTime(n0(r.b))}</td></tr>`;
  }

  function wallHtml() {
    if (!wall) return "";
    let h = `<h3 class="cw-h">${T("cw_wall")}</h3>`;
    if (wall.on === false) return h + `<p class="muted small">${T("cw_wall_off")}</p>`;
    const d = wall.data;
    if (!d || typeof d !== "object") return drv?.live ? h + `<p class="muted small">${T("cw_wall_wait")}</p>` : "";
    const stale = n0(wall.age_ms) > 5000;
    const me = d.me || {};
    const sp = stale ? 0 : n0(d.sp);
    const L = sp === 2 || sp === 4;
    const R = sp === 3 || sp === 4;
    const flags = (Array.isArray(d.flags) ? d.flags : []).map((f) => WALL_FLAGS[f]).filter(Boolean);
    if (stale) h += `<p class="muted small">${T("cw_wall_late")}</p>`;
    if (flags.length) h += `<div class="cw-wflags">${flags.map(([k, c]) => `<span class="cw-wflag ${c}">${T(k)}</span>`).join("")}</div>`;
    const delta = typeof me.d === "number" ? `${me.d > 0 ? "+" : ""}${me.d.toFixed(2)}` : "—";
    h += `<div class="cw-grid">
      ${stat(T("cw_last"), lapTime(n0(me.last)))}
      ${stat(T("cw_best"), lapTime(n0(me.best)))}
      ${stat(T("cw_delta"), delta, typeof me.d === "number" ? (me.d < 0 ? "good" : me.d > 0 ? "warn" : "") : "")}
      ${d.wx ? stat(T("cw_wx"), `${num(d.wx.air, 0)}° / ${num(d.wx.track, 0)}°${n0(d.wx.wet) >= 3 ? ` <i>${T("cw_wet")}</i>` : ""}`) : ""}
    </div>`;
    const dist = [typeof d.ahead === "number" ? T("cw_ahead", d.ahead.toFixed(0)) : "", typeof d.behind === "number" ? T("cw_behind", d.behind.toFixed(0)) : ""].filter(Boolean).join(" · ");
    const spTxt = T(sp === 0 ? "cw_sp_none" : L && R ? "cw_sp_both" : L ? "cw_sp_l" : R ? "cw_sp_r" : "cw_sp_clear");
    h += `<div class="pg-spot${sp === 0 ? " off" : ""}${sp === 1 ? " clr" : ""}" role="img" aria-label="${esc(spTxt + (dist ? " · " + dist : ""))}">
      <div class="pg-sbar l${L ? " on" : ""}"><b>${T(L ? "cw_sp_left" : "cw_sp_L")}</b></div>
      <div class="pg-smid"><small>${typeof d.ahead === "number" ? esc(T("cw_ahead", d.ahead.toFixed(0))) : "&nbsp;"}</small>${carSvg("pg-minicar")}<small>${typeof d.behind === "number" ? esc(T("cw_behind", d.behind.toFixed(0))) : "&nbsp;"}</small></div>
      <div class="pg-sbar r${R ? " on" : ""}"><b>${T(R ? "cw_sp_right" : "cw_sp_R")}</b></div>
      <b class="pg-stxt">${sp === 1 ? "✓ " : L || R ? "⚠ " : ""}${spTxt}</b>
    </div>`;
    const rows = (Array.isArray(d.rows) ? d.rows : []).filter((r) => r && typeof r === "object").slice(0, 20);
    const top = rows.filter((r) => r.top).sort((a, b) => n0(a.cp) - n0(b.cp));
    const near = rows.filter((r) => !r.top).sort((a, b) => n0(b.g) - n0(a.g));
    h += `<div class="cw-tw"><table class="cw-table"><thead><tr><th>${T("cw_th_class")}</th><th>${T("cw_th_no")}</th><th>${T("cw_th_driver")}</th>
      <th class="r">${T("cw_th_gap")}</th><th class="r">${T("cw_th_last")}</th><th class="r best">${T("cw_th_best")}</th></tr></thead><tbody>
      ${top.map(wallRow).join("")}${top.length ? `<tr class="sep"><td colspan="6">${T("cw_near")}</td></tr>` : ""}${near.map(wallRow).join("")}
      </tbody></table></div><p class="muted small">${T("cw_wall_note")}</p>`;
    return h;
  }

  // Sürücünün konuşma altyazısı: sunucu PRO olmayan izleyiciye `speech` göndermez (speech_locked)
  function speechHtml() {
    let h = `<h4>${T("cw_speech")}</h4>`;
    if (wall?.speech_locked) return h + `<p class="empty"><span class="pro">PRO</span>${T("cw_speech_pro")}</p>`;
    const d = wall?.data;
    const list = (d && Array.isArray(d.speech) ? d.speech : []).filter((l) => l && typeof l.text === "string" && l.text).slice(-6);
    if (!list.length) return h + `<p class="empty">${T("cw_speech_empty")}</p>`;
    const ref = n0(d.ts);
    list.forEach((l, i) => {
      const last = i === list.length - 1;
      const op = last ? 1 : Math.max(0.4, 1 - Math.max(0, ref - n0(l.t)) / 75000);
      const tm = new Date(n0(l.t)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      h += `<p class="${last ? "now" : ""}${l.final === false ? " live" : ""}" style="opacity:${op.toFixed(2)}"><time>${esc(tm)}</time><span>${esc(String(l.text).slice(0, 400))}${l.final === false ? " …" : ""}</span></p>`;
    });
    return h;
  }

  function drawWall() {
    const sp = q("#cw-speech");
    if (sp) morph(sp, speechHtml());
    const el = q("#cw-wall");
    if (el) morph(el, wallHtml());
  }

  // ---- Ekip odası (c64): odadakiler + sohbet. crew_room() 2,5 sn'de bir; yeni mesajlar p_after ile istenir ----
  let room = null; // son crew_room() yanıtı
  let roomFail = false; // sunucuda oda yok (c64 kurulmamış) ya da okunamadı: eski tek yönlü mesaj komutu kullanılır
  let roomBusy = false;
  let roomSkip = 0;
  let chat = []; // eskiden yeniye
  let chatLast = "";
  let chatSending = false;
  const myId = () => room?.members?.find((m) => m.me)?.id || "";
  function chatDown(force) {
    const el = q("#cw-chat");
    if (!el) return;
    if (!force && el.scrollHeight - el.scrollTop - el.clientHeight > 80) return;
    requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }
  async function loadRoom(force) {
    if (!alive || roomBusy || (!force && document.hidden)) return;
    if (roomSkip > 0 && !force) return void roomSkip--;
    roomBusy = true;
    try {
      const { data, error } = await sb.rpc("crew_room", { p_owner: ownerId, p_after: chatLast || null, p_limit: 60 });
      if (!alive) return;
      if (error || !data) {
        roomFail = true;
        roomSkip = 4;
        if (!room) drawRoom();
        return;
      }
      roomFail = false;
      room = data;
      // c75: sürücü yarıştan çıkınca oda boşalır (sunucu mesajları siler); eldeki mesajlar da atılır
      if (data.racing === false) {
        chat = [];
        chatLast = "";
        drawRoom();
        return;
      }
      if (data.cleared_at) {
        const cut = new Date(data.cleared_at).getTime();
        if (cut > 0) chat = chat.filter((m) => new Date(m.at).getTime() > cut);
      }
      const add = Array.isArray(data.messages) ? data.messages.filter((m) => m && typeof m === "object") : [];
      let down = false;
      if (add.length) {
        const first = !chatLast;
        const known = new Set(chat.map((m) => m.id));
        const fresh = add.filter((m) => !known.has(m.id));
        chatLast = add[add.length - 1].at;
        chat = [...chat, ...fresh].slice(-200);
        down = first || fresh.some((m) => m.sender === myId());
        if (fresh.length && !down) {
          const el = q("#cw-chat");
          down = !!el && el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
        }
      }
      drawRoom();
      if (down) chatDown(true);
    } finally {
      roomBusy = false;
    }
  }
  async function sendChat(text) {
    const body = String(text || "").trim().slice(0, 300);
    if (!alive || !body || chatSending) return;
    if (roomRO()) return void toast(roomRO(), true);
    // Oda sunucuda yoksa eski yol: sürücünün ekranına tek yönlü mesaj
    if (roomFail && !room) return void send("message", { text: body.slice(0, 120) });
    chatSending = true;
    try {
      const { data: sentId, error } = await sb.rpc("crew_chat_send", { p_owner: ownerId, p_body: body });
      if (error) return void toast(tr(error.message), true);
      if (sentId === null) toast(T("cw_room_closed"), true);
      if (navigator.vibrate) navigator.vibrate(15);
      await loadRoom(true);
      chatDown(true);
    } finally {
      chatSending = false;
    }
  }
  function membersHtml() {
    if (!room) return `<p class="muted small">${T(roomFail ? "cw_room_err" : "loading")}</p>`;
    const d = room.driver;
    const ms = Array.isArray(room.members) ? room.members : [];
    const here = ms.filter((m) => m.present);
    const away = ms.filter((m) => !m.present);
    let h = "";
    // c75: o anki spotter (eski sunucu alanı göndermez: satır çizilmez)
    const sp = room.spotter && typeof room.spotter === "object" ? room.spotter : null;
    if (room.racing === true)
      h += `<p class="crm-spot${room.spotter_me ? " me" : sp ? "" : " none"}">${ic("wrench")}<span translate="no">${esc(
        room.spotter_me ? T("cw_spot_me") : sp ? T("cw_spot_is", String(sp.name || "?")) : T("cw_spot_none"),
      )}</span></p>`;
    if (d)
      h += `<div class="crm-m drv${d.online ? "" : " off"}"><i class="crm-dot"></i><b translate="no">${esc(d.name || "?")}</b><em class="crm-tag drv">${ic("helmet")}${T("cw_room_driver")}</em></div>`;
    for (const m of here) {
      h += `<div class="crm-m${m.me ? " me" : ""}"><i class="crm-dot"></i><b translate="no">${esc(m.name || "?")}</b>${
        m.spotter
          ? `<em class="crm-tag ctl spot" title="${esc(T("cw_spot_tag_h"))}">${ic("wrench")}${T("cw_spot_tag")}</em>`
          : sp
            ? `<em class="crm-tag">${T("cw_room_watch")}</em>`
            : m.can_control
          ? `<em class="crm-tag ctl${room.control_on ? "" : " idle"}" title="${esc(T(room.control_on ? "cw_room_ctl_h" : "cw_room_ctl_idle"))}">${ic("wrench")}${T("cw_room_ctl")}</em>`
          : `<em class="crm-tag">${T("cw_room_watch")}</em>`
      }</div>`;
    }
    if (away.length)
      h += `<p class="crm-away">${T("cw_room_away")}: <span translate="no">${esc(away.map((m) => `${m.name || "?"}${m.can_control ? ` (${T("cw_room_ctl")})` : ""}`).join(", "))}</span></p>`;
    return h;
  }
  function chatHtml() {
    if (!chat.length) return `<p class="crm-empty">${T(room?.racing === false ? "cw_room_closed" : "cw_room_empty")}</p>`;
    const me = myId();
    return chat
      .map((m) => {
        const role = ["driver", "control", "view"].includes(m.role) ? m.role : "gone";
        const dt = new Date(m.at);
        const tm = isNaN(dt.getTime()) ? "" : dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const rt = role === "driver" ? T("cw_room_driver") : role === "control" ? T("cw_room_ctl") : "";
        const nm = String(m.name || "?");
        return `<div class="crm-msg ${role}${m.sender === me ? " mine" : ""}"><span class="crm-av" translate="no">${esc((Array.from(nm.trim())[0] || "?").toLocaleUpperCase())}</span><div>
          <div class="crm-meta"><b translate="no">${esc(nm)}</b>${rt ? `<em>${rt}</em>` : ""}<time>${esc(tm)}</time></div>
          <p translate="no">${esc(String(m.body || "").slice(0, 300))}</p></div></div>`;
      })
      .join("");
  }
  function roomCount() {
    if (!room) return "";
    const n = (Array.isArray(room.members) ? room.members.filter((m) => m.present).length : 0) + (room.driver?.online ? 1 : 0);
    return `<span class="cw-badge${n > 0 ? " live" : ""}">${esc(T("cw_room_n", n))}</span>`;
  }
  /** c75: odaya yazamıyorsam sebebi (boş: yazabilirim). Eski sunucu can_write göndermez: herkes yazabilir. */
  function roomRO() {
    if (!room || room.can_write !== false) return "";
    if (room.racing === false) return T("cw_ro_closed");
    const sp = room.spotter && typeof room.spotter === "object" ? room.spotter : null;
    return sp ? T("cw_ro_spot", String(sp.name || "?")) : T("cw_ro_view");
  }
  let dashRO = "";
  function drawRoom() {
    // Yazma hakkı değiştiyse (spotter oldum / yer başkasına geçti) mesaj kutusu da yeniden çizilir
    if (roomRO() !== dashRO) drawDash();
    // Yerinde güncelleme: içerik aynıysa DOM'a hiç dokunulmaz; sohbet kutusunun kaydırma konumu korunur
    // (kullanıcı en alttaysa altta kalır, yukarıda eski mesajlara bakıyorsa yerinden oynamaz).
    const put = (sel, html) => {
      const el = q(sel);
      if (!el || el.__crmHtml === html) return;
      morph(el, html);
      el.__crmHtml = html;
    };
    put("#cw-room-n", roomCount());
    put("#cw-members", membersHtml());
    const c = q("#cw-chat");
    if (!c) return;
    const html = chatHtml();
    if (c.__crmHtml === html) return;
    const top = c.scrollTop;
    const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight <= 80;
    morph(c, html);
    c.__crmHtml = html;
    c.scrollTop = atBottom ? c.scrollHeight : top;
  }

  async function loadDriver() {
    if (!alive) return;
    const { data, error } = await sb.rpc("crew_driver", { p_owner: ownerId });
    if (!alive) return;
    if (error) {
      // Ekipten çıkarılmış olabilir: paneli kapat (liste / arkadaş listesine dönülür)
      toast(tr(error.message), true);
      opts.onGone?.();
      return;
    }
    // c75: sürücü yarıştan çıktı — panel kapanır (liste / arkadaş listesine dönülür)
    if (data && data.racing_now === false && opts.onGone) {
      toast(T("cw_gone_race"), true);
      opts.onGone();
      return;
    }
    drv = data;
    // İlk açılışta litre kutusu: şu an ayarlı pit yakıtı ya da bitiş için gereken
    if (!litersTouched) {
      const c = drv?.data?.crew;
      const want = c?.pit?.flags >= 0 && c.pit.flags & PIT.fuel && c.pit.fuel > 0 ? c.pit.fuel : (c?.toFinish ?? 0);
      if (n0(want) > 0) liters = Math.min(1000, Math.ceil(n0(want)));
    }
    drawDash();
  }

  async function send(kind, args = {}) {
    if (!alive) return;
    const { data: id, error } = await sb.rpc("crew_command", { p_owner: ownerId, p_kind: kind, p_args: args });
    if (error) {
      toast(tr(error.message), true);
      return;
    }
    const row = { id, kind, args, status: "pending", result: "" };
    sent = [row, ...sent].slice(0, 6);
    drawSent();
    const keys = fxKeys(kind, args);
    const mark = { s: "pend" };
    for (const k of keys) fx[k] = mark;
    applyFx();
    if (navigator.vibrate) navigator.vibrate(15);
    // Sonucu bekle (sunucu 30 sn'de 'expired' yapar)
    for (let i = 0; alive && i < 40 && row.status === "pending"; i++) {
      await new Promise((r) => setTimeout(r, i < 10 ? 500 : 1000));
      const { data } = await sb.rpc("crew_command_get", { p_id: id });
      if (data && data.status !== "pending") {
        row.status = data.status;
        row.result = data.result || "";
      }
    }
    if (row.status === "pending") row.status = "expired";
    drawSent();
    mark.s = row.status === "applied" ? "ok" : "bad";
    applyFx();
    setTimeout(() => {
      for (const k of keys) if (fx[k] === mark) delete fx[k];
      if (alive) applyFx();
    }, 1600);
    if (alive) void loadDriver();
  }


  // ---- Komut geri bildirimi: gönderilen komutun ilgili çizimi bekler (halka) → yeşil parlar / kırmızı sallanır ----
  let fx = {};
  const fxc = (k) => (fx[k] ? ` fx-${fx[k].s}` : "");
  function applyFx() {
    host.querySelectorAll("[data-fx]").forEach((el) => {
      el.classList.remove("fx-pend", "fx-ok", "fx-bad");
      const s = fx[el.dataset.fx];
      if (s) el.classList.add("fx-" + s.s);
    });
  }
  function fxKeys(kind, a = {}) {
    const pf = drv?.data?.crew?.pit?.flags ?? -1;
    const cur = (bit) => pf >= 0 && (pf & bit) !== 0;
    const corners = (want) => {
      const l = CORNERS.filter(([k, bit]) => want(k) !== cur(bit)).map(([k]) => k);
      return [...(l.length ? l : CORNERS.map(([k]) => k)), "tyres"];
    };
    switch (kind) {
      case "fuel_set":
      case "fuel_clear":
        return ["fuel"];
      case "tyres":
        return corners((k) => !!a[k]);
      case "tyres_all":
        return corners(() => true);
      case "tyres_clear":
        return corners(() => false);
      case "fast_repair":
        return ["fr"];
      case "tearoff":
        return ["tearoff"];
      case "clear_all":
        return ["lf", "rf", "lr", "rr", "tyres", "fuel", "fr", "tearoff"];
      default:
        return [];
    }
  }

  /** Depo ölçüleri (sürücü verisi + seçili litre) */
  function fuelNow() {
    const d = drv;
    const x = d?.data;
    const c = x?.crew || null;
    const pf = c?.pit?.flags ?? -1;
    const level = Math.max(0, n0(x?.level));
    const cap = Math.max(0, n0(x?.max));
    const toFinish = Math.max(0, n0(c?.toFinish ?? x?.refuel));
    const needed = Math.max(0, n0(c?.needed)) || (toFinish > 0 ? level + toFinish : 0);
    const setL = pf >= 0 && pf & PIT.fuel ? Math.max(0, n0(c.pit.fuel)) : 0;
    const add = d?.can_control ? liters : setL;
    return { level, cap, toFinish, needed, setL, add, room: cap > 0 ? Math.floor(Math.max(0, cap - level)) : 0, g: fuelGeo(level, cap, add, needed) };
  }
  /** Litre değişti: sayıyı, sürgüyü, düğmeyi ve depodaki hayalet dolguyu yerinde güncelle (yeniden çizmeden) */
  function updFuel(from) {
    const f = fuelNow();
    const inp = q("#cw-liters");
    if (inp && from !== "num") inp.value = liters;
    const rg = q("#cw-range");
    if (rg && from !== "range") rg.value = Math.min(Number(rg.max), liters);
    const set = q("#cw-set");
    if (set) set.textContent = T("cw_set_l", liters);
    const gh = q("#cw-gh");
    if (gh) gh.style.height = f.g.gh.toFixed(1) + "%";
    const af = q("#cw-after");
    if (af) af.textContent = `${num(f.g.after)} L`;
  }

  function blocked() {
    const d = drv;
    if (!d) return " ";
    if (!d.can_control) return T("cw_b_view");
    // c75: pit ayarlarını aynı anda tek kişi (spotter) yönetir; yer doluysa sadece izlenir
    if (d.spotter_id && !d.spotter_me) return T("cw_b_spot", String(d.spotter_name || "?"));
    if (d.spotter_me === false) return T("cw_b_idle");
    if (!d.live) return T("cw_b_idle");
    if (!simOk(d.data?.crew?.sim ?? d.sim)) return T("cw_b_sim");
    if (!d.control_on || d.data?.crew?.ctl === false) return T("cw_b_off");
    return "";
  }

  /** Yarış durumu: sıra rozeti, tur halkası, kalan / son / en iyi, bayrak · olay · konum · veri yaşı */
  function raceHtml(d, x, c) {
    const pos = n0(x.position);
    const cp = n0(c?.classPos);
    const lap = n0(x.lap);
    const lapsLim = typeof c?.lapsRemain === "number" && c.lapsRemain >= 0 && c.lapsRemain < 32000;
    const p = lapsLim ? (lap + c.lapsRemain > 0 ? lap / (lap + c.lapsRemain) : 0) : Math.min(1, Math.max(0, n0(x.lapPct)));
    const C = 2 * Math.PI * 27;
    const rem = remain(c?.timeRemain, c?.lapsRemain);
    const fl = flagInfo(c?.flags);
    const where = c?.stall ? "cw_pit_stall" : x.onPit ? "cw_pit_road" : "cw_on_track";
    return `<div class="pg-race">
        <div class="pg-pos" translate="no"><small>${T("cw_pos")}</small><b>${pos ? `P${pos}` : "—"}</b>${cp ? `<i>${T("cw_class")} P${cp}</i>` : ""}</div>
        <div class="pg-ring" role="img" aria-label="${esc(T("cw_ring_aria", lap || "—", rem))}">
          <svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="27"/><circle class="fg" cx="32" cy="32" r="27" transform="rotate(-90 32 32)" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - p)).toFixed(1)}"/></svg>
          <span><small>${T("cw_lap")}</small><b>${lap || "—"}</b></span>
        </div>
        <dl class="pg-kv">
          <dt>${T("cw_remain")}</dt><dd>${esc(rem)}</dd>
          <dt>${T("cw_last")}</dt><dd>${lapTime(x.last)}</dd>
          <dt>${T("cw_best")}</dt><dd>${lapTime(x.best)}</dd>
        </dl>
        <div class="pg-chips">
          ${fl ? `<span class="pg-chip flag ${fl[1]}"><i></i>${T(fl[0])}</span>` : ""}
          <span class="pg-chip${x.onPit || c?.stall ? " warn" : ""}">${ic(x.onPit || c?.stall ? "pit" : "road")}${T(where)}</span>
          ${c ? `<span class="pg-chip" title="${esc(T("cw_inc"))}">${ic("warn")}<span class="sr">${T("cw_inc")} </span>${n0(c.inc)}x</span>` : ""}
          ${!d.live && d.age != null ? `<span class="pg-chip stale">${ic("clock")}${esc(T("cw_stale", ago(n0(d.age))))}</span>` : ""}
        </div>
      </div>`;
  }

  /** Yakıt kartı: depo çizimi (seviye, pit sonrası hayalet dolgu, bitiş işareti) + litre kontrolü */
  function fuelHtml(d, x, c, b) {
    const f = fuelNow();
    const lapsLeft = n0(x?.lapsLeft);
    const low = lapsLeft > 0 && lapsLeft < 2;
    const rmax = Math.max(liters, f.cap > 0 ? Math.max(1, Math.ceil(f.cap - f.level)) : 150);
    let h = `<section class="pg-card pg-fuel${fxc("fuel")}" data-fx="fuel">
        <h3 class="pg-h">${ic("fuel")}${T("cw_fuel")}<span class="sp"></span>${
          f.setL > 0 ? `<span class="pg-badge on">✓ +${num(f.setL, 0)} L</span>` : c?.pit?.flags >= 0 ? `<span class="pg-badge">${T("cw_sv_fuel_none")}</span>` : ""
        }</h3>
        <div class="pg-fuel-top">
          <div class="pg-tank" role="img" aria-label="${esc(T("cw_tank_aria", num(f.level), num(f.g.after)))}">
            <div class="pg-tank-b">
              <i class="gh" id="cw-gh" style="bottom:${f.g.lvl.toFixed(1)}%;height:${f.g.gh.toFixed(1)}%"></i>
              <i class="lvl${low ? " low" : ""}" style="height:${f.g.lvl.toFixed(1)}%"></i>
              <b>${num(f.level)}<small>L</small></b>
            </div>
            ${f.g.fin >= 0 ? `<i class="fin${f.g.over ? " over" : ""}" style="bottom:${f.g.fin.toFixed(1)}%"><em>${f.g.over ? "▲ " : ""}${T("cw_finish")}</em></i>` : ""}
          </div>
          <div class="pg-fuel-n">
            <div class="pg-big${low ? " low" : ""}"><b>${lapsLeft > 0 ? num(lapsLeft) : "—"}</b><small>${T("cw_fuel_laps")}</small></div>
            <span class="pg-chip ${f.toFinish > 0 ? "warn" : "ok"}">${f.toFinish > 0 ? ic("warn") + esc(T("cw_fin_add", num(f.toFinish))) : ic("check") + T("cw_fin_ok")}</span>
          </div>
        </div>
        <dl class="pg-kv g2">
          <dt>${T("cw_tank")}</dt><dd>${num(f.level)}${f.cap > 0 ? ` / ${num(f.cap, 0)}` : ""} L</dd>
          <dt>${T("cw_per_lap")}</dt><dd>${n0(x?.usage) > 0 ? `${num(x.usage, 2)} L` : "—"}</dd>
          <dt>${T("cw_race_left")}</dt><dd>${c?.raceLaps ? esc(T("cw_laps_n", num(c.raceLaps))) : "—"}</dd>
          <dt>${T("cw_after")}</dt><dd id="cw-after">${num(f.g.after)} L</dd>
        </dl>`;
    if (d.can_control) {
      h += `<fieldset class="pg-ctl" ${b ? "disabled" : ""}>
          <input class="pg-range" id="cw-range" type="range" min="1" max="${rmax}" step="1" value="${Math.min(rmax, liters)}" aria-label="${esc(T("cw_add_aria"))}" />
          <div class="pg-step">
            <button type="button" class="pg-b" data-l="-1" aria-label="−1 L">−1</button>
            <input id="cw-liters" type="number" inputmode="numeric" min="1" max="1000" value="${liters}" aria-label="${esc(T("cw_add_aria"))}" />
            <button type="button" class="pg-b" data-l="1" aria-label="+1 L">+1</button>
            <button type="button" class="pg-b" data-l="5">+5 L</button>
            <button type="button" class="pg-b" data-l="10">+10 L</button>
          </div>
          <button type="button" class="pg-b pri" data-cmd="fuel_set" id="cw-set">${esc(T("cw_set_l", liters))}</button>
          <div class="pg-row">
            <button type="button" class="pg-b" data-cmd="fuel_end" title="${esc(T("cw_fuel_end"))}">${T("cw_q_end")}${f.toFinish > 0 ? `<small>${Math.ceil(f.toFinish)} L</small>` : ""}</button>
            <button type="button" class="pg-b" data-cmd="fuel_full" ${f.room >= 1 ? "" : "disabled"}>${T("cw_q_full")}${f.room >= 1 ? `<small>${f.room} L</small>` : ""}</button>
            <button type="button" class="pg-b" data-cmd="fuel_clear">${T("cw_fuel_none")}</button>
          </div>
        </fieldset>`;
    }
    return h + `</section>`;
  }

  /** Lastik kartı: üstten araç + dört lastik (dolgu: kalan diş, sayı: sıcaklık, halka + ✓: değişecek) */
  function tyresHtml(d, c, b, pf) {
    const has = (bit) => pf >= 0 && (pf & bit) !== 0;
    const ro = !d.can_control || !!b || pf < 0;
    const tyre = ([k, bit], i) => {
      const w = c?.wear?.[i];
      const hasW = typeof w === "number" && w >= 0;
      const wv = Math.round(Math.min(100, n0(w)));
      const tp = Math.round(n0(c?.temp?.[i]));
      const chg = has(bit);
      const wc = !hasW ? "" : wv >= 60 ? " w-ok" : wv >= 30 ? " w-mid" : " w-low";
      const hc = tp <= 0 ? "" : tp < 50 ? " h-cold" : tp > 105 ? " h-hot" : " h-ok";
      const label = [T("cw_" + k) + ":", hasW ? `${T("cw_wear")} ${wv}%,` : "", tp > 0 ? `${tp}°C,` : "", pf >= 0 ? T(chg ? "cw_will" : "cw_stays") : ""].filter(Boolean).join(" ").replace(/[,:]$/, "");
      return `<button type="button" id="cw-ty-${k}" class="pg-tyre ${k}${wc}${hc}${chg ? " chg" : ""}${fxc(k)}" data-corner="${k}" data-fx="${k}" aria-pressed="${chg}" aria-label="${esc(label)}" title="${esc(label)}" ${ro ? "disabled" : ""}>
          <span class="inf"><small>${T("cw_" + k)}</small><b>${hasW ? `${wv}%` : "—"}</b><em>${tp > 0 ? `${tp}°C` : "—"}</em></span>
          <span class="rub"><i style="height:${hasW ? wv : 0}%"></i></span>
          <span class="tick">${chg ? `✓ ${T("cw_will")}` : ""}</span>
        </button>`;
    };
    const cmp = (v) => (typeof v === "number" && v >= 0 ? T(v > 0 ? "cw_cmp_wet" : "cw_cmp_dry") : "");
    const cur = cmp(c?.compound);
    const next = pf >= 0 && (pf & PIT.tyres) !== 0 ? cmp(c?.pit?.compound) : "";
    return `<section class="pg-card pg-tyres">
        <h3 class="pg-h">${ic("tyre")}${T("cw_tyres")}<span class="sp"></span>${cur ? `<span class="pg-badge">${cur}${next && next !== cur ? ` → ${next}` : ""}</span>` : ""}${
          ro && d.can_control === false ? `<span class="pg-badge" title="${esc(T("cw_role_view"))}">${ic("lock")}<span class="sr">${T("cw_locked")}</span></span>` : ""
        }</h3>
        <div class="pg-car">${tyre(CORNERS[0], 0)}${carSvg("pg-carsvg")}${tyre(CORNERS[1], 1)}${tyre(CORNERS[2], 2)}${tyre(CORNERS[3], 3)}</div>
        <p class="pg-note">${T(ro ? "cw_ty_legend" : "cw_ty_hint")}</p>
        ${
          d.can_control
            ? `<fieldset class="pg-ctl" ${b ? "disabled" : ""}><div class="pg-row">
            <button type="button" class="pg-b" data-cmd="tyres_all">${ic("tyre")}${T("cw_all")}</button>
            <button type="button" class="pg-b" data-cmd="tyres_clear">${T("cw_none_t")}</button></div></fieldset>`
            : ""
        }
      </section>`;
  }

  /** Pit servisi özeti: simgeli dört kutu (kontrol varsa aç / kapat düğmesi) */
  function svcHtml(d, c, b, pf) {
    const has = (bit) => pf >= 0 && (pf & bit) !== 0;
    const ro = !d.can_control || !!b || pf < 0;
    const ty = pf >= 0 ? pf & PIT.tyres : 0;
    const tyText = pf < 0 ? "—" : ty === PIT.tyres ? T("cw_tyres_4") : ty === 0 ? T("cw_tyres_0") : CORNERS.filter(([, bit]) => pf & bit).map(([k]) => T("cw_" + k)).join(", ");
    const onoff = (on) => (pf < 0 ? "—" : T(on ? "cw_on" : "cw_off"));
    const fr = typeof c?.pit?.fr === "number" && c.pit.fr >= 0 ? n0(c.pit.fr) : -1;
    const tile = (key, icon, label, value, on, extra = "") =>
      `<button type="button" id="cw-sv-${key}" class="pg-sv${on ? " on" : ""}${fxc(key)}" data-svc="${key}" data-fx="${key}" aria-pressed="${!!on}" title="${esc(`${label}: ${value}`)}" ${ro ? "disabled" : ""}>
        <span class="ic">${ic(icon)}</span><span class="tx"><small>${label}</small><b>${esc(value)}</b></span>${extra}<i class="st" aria-hidden="true">${on ? "✓" : ""}</i></button>`;
    return `<div class="pg-svc">
        ${tile("fuel", "fuel", T("cw_fuel"), pf < 0 ? "—" : has(PIT.fuel) ? `+${num(c.pit.fuel, 0)} L` : T("cw_sv_fuel_none"), has(PIT.fuel))}
        ${tile("tyres", "tyre", T("cw_tyres"), tyText, ty !== 0)}
        ${tile("fr", "wrench", T("cw_fr"), onoff(has(PIT.fr)), has(PIT.fr), fr >= 0 ? `<em class="cnt">${esc(T("cw_fr_left", fr))}</em>` : "")}
        ${tile("tearoff", "visor", T("cw_tearoff"), onoff(has(PIT.tearoff)), has(PIT.tearoff))}
      </div>`;
  }

  function dashHtml() {
    const d = drv;
    if (!d) return `<p class="muted" data-t="loading">${T("loading")}</p>`;
    const x = d.data;
    const c = x?.crew || null;
    const pf = c?.pit?.flags ?? -1;
    const b = blocked();
    let h = `<div class="cw-c3"><div class="cw-col cw-col-a"><div class="cw-head">
        <div><h2 translate="no">${esc(d.display_name || "?")}</h2>
        <p class="muted small">${esc([SIMS[c?.sim || d.sim] || "", x?.track || d.track, x?.car || d.car, x?.session || d.session].filter(Boolean).join(" · ") || "—")}</p></div>
        <span class="cw-badge${d.live ? " live" : ""}">${statusText(d)}</span>
      </div>`;
    if (x) h += `<div class="pg${d.live ? "" : " stale"}">${raceHtml(d, x, c)}</div>`;
    h += `<div class="cw-wall" id="cw-wall">${wallHtml()}</div>`;
    if (!x) h += `<div class="card cw-empty"><p>${T("cw_no_data")}</p></div>`;
    h += `<div class="cw-speech" id="cw-speech">${speechHtml()}</div></div><div class="cw-col cw-col-b">`;
    // Pit: görseller her zaman (izleme yetkisinde kilitli); kontroller sadece yetki varsa
    h += `<h3 class="cw-h">${T("cw_control")}</h3>`;
    if (d.can_control && d.spotter_me) h += `<p class="crm-spot me">${ic("wrench")}<span>${T("cw_spot_me")}</span></p>`;
    const ro = roomRO();
    dashRO = ro;
    if (b.trim()) h += `<p class="cw-blocked pg-lock">${ic("lock")}<span>${esc(b)}</span></p>`;
    if (x || !b) {
      h += `<div class="pg${d.live ? "" : " stale"}${d.can_control ? "" : " ro"}">
        <div class="pg-duo">${fuelHtml(d, x, c, b)}${tyresHtml(d, c, b, pf)}</div>
        <h3 class="pg-h pg-h2">${T("cw_service")}</h3>
        ${pf < 0 ? `<p class="muted small pg-na">${T("cw_service_na")}</p>` : ""}
        ${svcHtml(d, c, b, pf)}
        ${d.can_control ? `<fieldset class="pg-ctl" ${b ? "disabled" : ""}><button type="button" class="pg-b dng" data-cmd="clear_all">${T("cw_clear")}</button></fieldset>` : ""}
      </div>`;
    }
    // Sağ sütun: ekip odası (odadakiler, sohbet, hazır spotter mesajları, tek mesaj kutusu)
    h += `<div id="cw-sent"></div></div><div class="cw-col cw-col-c">
      <h3 class="cw-h crm-h">${T("cw_room")}<span id="cw-room-n">${roomCount()}</span></h3>
      <div class="crm-members" id="cw-members">${membersHtml()}</div>
      <div class="crm-chat" id="cw-chat">${chatHtml()}</div>
      ${
        ro
          ? `<p class="cw-blocked pg-lock crm-ro">${ic("lock")}<span>${esc(ro)}</span></p>`
          : `<div class="pg crm-quick"><div class="pg-quick">${QUICK.map((k) => `<button type="button" class="pg-b" data-quick="${k}">${ic(QUICK_IC[k])}<span>${T(k)}</span></button>`).join("")}</div></div>
      <form class="cw-msg" id="cw-msg"><input id="cw-text" maxlength="300" autocomplete="off" placeholder="${esc(T("cw_room_ph"))}" />
      <button type="submit" class="cw-btn accent">${ic("send")}<span class="sr">${T("cw_send")}</span></button></form>`
      }
    </div></div>`;
    return h;
  }

  function drawSent() {
    const el = q("#cw-sent");
    if (!el) return;
    morph(
      el,
      sent.map(
        (c) => `<div class="cw-cmd ${c.status}"><span>${esc(cmdText(c.kind, c.args))}</span>
          <b>${T("cw_st_" + c.status)}${c.result ? ` · ${esc(tr(c.result))}` : ""}</b></div>`,
      ).join(""),
    );
  }


  function drawDash() {
    if (!alive) return;
    const text = q("#cw-text");
    const keep = text ? { v: text.value, f: document.activeElement === text, s: text.selectionStart } : null;
    const litF = document.activeElement?.id === "cw-liters" && host.contains(document.activeElement);
    if (litF || dragging) return; // litre yazılırken / sürgü çekilirken çizme (bir sonraki yenilemede güncellenir)
    const act = document.activeElement;
    const fid = act && act.id && act.id !== "cw-text" && host.contains(act) ? act.id : "";
    drawBar();
    morph(body, dashHtml());
    kickFit();
    drawSent();
    if (fid) host.querySelector("#" + CSS.escape(fid))?.focus({ preventScroll: true });
    if (keep) {
      const t2 = q("#cw-text");
      if (t2) {
        t2.value = keep.v;
        if (keep.f) {
          t2.focus();
          try {
            t2.setSelectionRange(keep.s, keep.s);
          } catch {}
        }
      }
    }
  }

  // ---- Olaylar (tek dinleyici: içerik sık yeniden çizilir) ----
  const onClick = (e) => {
    const t = e.target.closest("button");
    if (!t || t.disabled) return;
    if (t.dataset.view === "fit") {
      fit = !fit;
      ls("crew.fit", fit);
      drawBar();
      return void kickFit();
    }
    if (t.dataset.view === "full") return void setFull(!full);
    if (t.dataset.quick && QUICK.includes(t.dataset.quick)) return void sendChat(T(t.dataset.quick));
    if (t.dataset.l) {
      liters = Math.min(1000, Math.max(1, liters + Number(t.dataset.l)));
      litersTouched = true;
      updFuel();
      return;
    }
    const pf = drv?.data?.crew?.pit?.flags ?? -1;
    const has = (bit) => pf >= 0 && (pf & bit) !== 0;
    if (t.dataset.corner) {
      const a = {};
      for (const [k, bit] of CORNERS) a[k] = has(bit);
      a[t.dataset.corner] = !a[t.dataset.corner];
      return void send("tyres", a);
    }
    // Servis özeti kutuları: aç / kapat
    switch (t.dataset.svc) {
      case "fuel":
        return void (has(PIT.fuel) ? send("fuel_clear") : send("fuel_set", { liters }));
      case "tyres":
        return void send(pf & PIT.tyres ? "tyres_clear" : "tyres_all");
      case "fr":
        return void send("fast_repair", { on: !has(PIT.fr) });
      case "tearoff":
        return void send("tearoff", { on: !has(PIT.tearoff) });
    }
    switch (t.dataset.cmd) {
      case "fuel_full": {
        const room = fuelNow().room;
        if (room < 1) return;
        liters = Math.min(1000, room);
        litersTouched = true;
        updFuel();
        return void send("fuel_set", { liters });
      }
      case "fuel_set":
        return void send("fuel_set", { liters });
      case "fuel_end": {
        const c = drv?.data?.crew;
        const need = Math.min(1000, Math.max(0, n0(c?.toFinish ?? drv?.data?.refuel)));
        if (need > 0) {
          liters = Math.ceil(need);
          litersTouched = true;
          updFuel();
        }
        return void (need > 0 ? send("fuel_set", { liters }) : send("fuel_clear"));
      }
      case "fuel_clear":
      case "tyres_all":
      case "tyres_clear":
        return void send(t.dataset.cmd);
      case "fast_repair":
        return void send("fast_repair", { on: !has(PIT.fr) });
      case "tearoff":
        return void send("tearoff", { on: !has(PIT.tearoff) });
      case "clear_all":
        if (confirm(T("cw_clear_ask"))) void send("clear_all");
        return;
    }
  };
  const onInput = (e) => {
    const range = e.target.id === "cw-range";
    if (!range && e.target.id !== "cw-liters") return;
    const v = Math.round(Number(e.target.value));
    if (v >= 1 && v <= 1000) {
      liters = v;
      litersTouched = true;
      updFuel(range ? "range" : "num");
    }
  };
  // Sürgü çekilirken panel yeniden çizilmez (çizim sürgüyü elden kaçırır)
  let dragging = false;
  const onDown = (e) => {
    if (e.target.id === "cw-range") dragging = true;
  };
  const onUp = () => {
    dragging = false;
  };
  const onSubmit = (e) => {
    if (e.target.id !== "cw-msg") return;
    e.preventDefault();
    const inp = q("#cw-text");
    const text = (inp?.value || "").trim();
    if (!text) return;
    inp.value = "";
    void sendChat(text);
  };

  host.addEventListener("click", onClick);
  host.addEventListener("input", onInput);
  host.addEventListener("submit", onSubmit);
  host.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  const tick = () => {
    if (!document.hidden) void loadDriver();
  };
  const timer = setInterval(tick, opts.interval || 3000);
  const wallTimer = setInterval(() => void loadWall(), 1000);
  const roomTimer = setInterval(() => void loadRoom(), 2500);
  const onVis = () => !document.hidden && (tick(), void loadWall(), void loadRoom());
  document.addEventListener("visibilitychange", onVis);
  // c75: panel kapanırken spotter yeri hemen bırakılır (bırakılamazsa sunucu 45 sn sonra kendiliğinden boşaltır)
  const release = () => {
    if (drv?.spotter_me) void sb.rpc("crew_spot_release", { p_owner: ownerId }).then(() => {}, () => {});
  };
  window.addEventListener("pagehide", release);
  drawDash();
  void loadDriver();
  void loadWall();
  void loadRoom(true);
  return {
    redraw: drawDash,
    destroy() {
      alive = false;
      release();
      window.removeEventListener("pagehide", release);
      clearInterval(timer);
      clearInterval(wallTimer);
      clearInterval(roomTimer);
      fitRo.disconnect();
      if (fitRaf) cancelAnimationFrame(fitRaf);
      window.removeEventListener("resize", kickFit);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("keydown", onFsKey);
      if (isFs()) document.exitFullscreen?.()?.catch?.(() => {});
      host.classList.remove("cw-fit", "cw-full");
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("click", onClick);
      host.removeEventListener("input", onInput);
      host.removeEventListener("submit", onSubmit);
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    },
  };
}
