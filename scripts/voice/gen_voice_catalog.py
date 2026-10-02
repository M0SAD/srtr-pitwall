# -*- coding: utf-8 -*-
# Sesli mühendis ifade kataloğu üretici.
# Girdi: scripts/voice/voice_tree.json (sahibin Türkçe ses paketindeki klasörler ve dosyalar) + motor kaynağı
#        (src-tauri/src/voice_rules.rs, voice.rs: tam metin "kategori/ifade" anahtarları "used" sayılır).
# Çıktı: src-tauri/src/voice_catalog.json; istenirse kullanılmayan klasörlerin Türkçe özeti (--md <dosya>).
# Motor yeni bir ifade kullanmaya başlayınca bu betik yeniden çalıştırılmalı (cargo test keys_exist_in_catalog denetler).
#   python3 scripts/voice/gen_voice_catalog.py [--md voice_unused.md]
import json, re, collections, os, sys

SP = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(SP, '..', '..'))
tree = json.load(open(os.path.join(SP, 'voice_tree.json')))
keys = sorted(k for k in tree if '/' in k)
src = open(f'{REPO}/src-tauri/src/voice_rules.rs').read() + open(f'{REPO}/src-tauri/src/voice.rs').read()
lit = set(m.group(1) for m in re.finditer(r'"([a-z_]+/[A-Za-z0-9_\-]+)"', src))

# ---------------------------------------------------------------- sayı sözcükleri
TR1 = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
TR10 = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
EN1 = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
       "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
EN10 = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def trn(n):
    if n < 10:
        return TR1[n]
    t, o = divmod(n, 10)
    return TR10[t] + ("" if o == 0 else " " + TR1[o])


def enn(n):
    if n < 20:
        return EN1[n]
    t, o = divmod(n, 10)
    return EN10[t] + ("" if o == 0 else "-" + EN1[o])


ORD = {"bir": "birinci", "iki": "ikinci", "üç": "üçüncü", "dört": "dördüncü", "beş": "beşinci", "altı": "altıncı", "yedi": "yedinci",
       "sekiz": "sekizinci", "dokuz": "dokuzuncu", "on": "onuncu", "yirmi": "yirminci", "otuz": "otuzuncu", "kırk": "kırkıncı",
       "elli": "ellinci", "altmış": "altmışıncı"}


def tr_ord(n):
    w = trn(n).split(" ")
    w[-1] = ORD[w[-1]]
    return " ".join(w)


def en_ord(n):
    sp = {1: "first", 2: "second", 3: "third", 5: "fifth", 8: "eighth", 9: "ninth", 12: "twelfth"}
    if n in sp:
        return sp[n]
    if n < 20:
        return enn(n) + "th"
    t, o = divmod(n, 10)
    if o == 0:
        return EN10[t][:-1] + "ieth"
    return EN10[t] + "-" + en_ord(o)


def cap(s):
    """Türkçe büyük harf: i → İ"""
    return ("İ" if s[:1] == "i" else s[:1].upper()) + s[1:]

# ---------------------------------------------------------------- girdiler
E = {}  # key -> [say_en, say_tr, trig_en, trig_tr]


def S(key, en, tr, ten=None, ttr=None):
    E[key] = [en, tr, ten, ttr]


def T(key, ten, ttr):
    """Kullanılan ifadenin tetikleyicisi"""
    E.setdefault(key, [None, None, None, None])
    E[key][2] = ten
    E[key][3] = ttr


# ---- acknowledge
for k_, en, tr in [
    ("OK", "OK.", "Tamam."), ("breath_in", "(breath in)", "(nefes alma sesi)"),
    ("cut_warnings_disabled", "Track limit warnings disabled.", "Pist sınırı uyarıları kapatıldı."),
    ("cut_warnings_enabled", "Track limit warnings enabled.", "Pist sınırı uyarıları açıldı."),
    ("deltasDisabled", "Sector deltas off.", "Sektör farkları kapatıldı."),
    ("deltasEnabled", "Sector deltas on.", "Sektör farkları açıldı."),
    ("didnt_understand", "Sorry, didn't get that.", "Anlayamadım, tekrar eder misin?"),
    ("fill_the_tank", "OK, we'll fill the tank.", "Tamam, depoyu dolduracağız."),
    ("fuel_to_end", "OK, fuel to the end.", "Tamam, sona kadar yetecek yakıt koyacağız."),
    ("keepQuietDisabled", "OK, I'll keep you updated.", "Tamam, seni bilgilendirmeye devam ediyorum."),
    ("keepQuietEnabled", "OK, I'll keep quiet.", "Tamam, susuyorum."),
    ("keep_quiet_in_corners_disabled", "OK, I'll talk in the corners too.", "Tamam, virajlarda da konuşacağım."),
    ("keep_quiet_in_corners_enabled", "OK, I'll keep quiet in the corners.", "Tamam, virajlarda susacağım."),
    ("no", "No.", "Hayır."), ("no_data", "I don't have that data.", "O veri elimde yok."),
    ("no_more_data", "No more data.", "Başka veri yok."),
    ("pit_strategy_1", "Pit strategy one.", "Pit stratejisi bir."), ("pit_strategy_2", "Pit strategy two.", "Pit stratejisi iki."),
    ("pit_strategy_3", "Pit strategy three.", "Pit stratejisi üç."), ("pit_strategy_4", "Pit strategy four.", "Pit stratejisi dört."),
    ("radio_check", "OK, radio check, loud and clear.", "Tamam, telsiz kontrolü, sesin net geliyor."),
    ("spotterDisabled", "Spotter disabled.", "Spotter kapatıldı."), ("spotterEnabled", "Spotter enabled.", "Spotter açıldı."),
    ("stand_by", "Stand by.", "Bekle."), ("yellowDisabled", "Yellow flag warnings off.", "Sarı bayrak uyarıları kapatıldı."),
    ("yellowEnabled", "Yellow flag warnings on.", "Sarı bayrak uyarıları açıldı."), ("yes", "Yes.", "Evet."),
]:
    S("acknowledge/" + k_, en, tr)
for k_, grp_en, grp_tr in [("spotterEnabled", "spotter is switched on", "Spotter açılınca"), ("spotterDisabled", "spotter is switched off", "Spotter kapatılınca"),
                           ("yellowEnabled", "flag warnings are switched on", "Bayraklar açılınca"), ("yellowDisabled", "flag warnings are switched off", "Bayraklar kapatılınca"),
                           ("cut_warnings_enabled", "penalty/track-limit warnings are switched on", "Cezalar açılınca"),
                           ("cut_warnings_disabled", "penalty/track-limit warnings are switched off", "Cezalar kapatılınca"),
                           ("deltasEnabled", "sector deltas are switched on", "Sektör farkları açılınca"), ("deltasDisabled", "sector deltas are switched off", "Sektör farkları kapatılınca"),
                           ("keep_quiet_in_corners_enabled", "'quiet in corners' is switched on", "'Virajlarda sessiz' açılınca"),
                           ("keep_quiet_in_corners_disabled", "'quiet in corners' is switched off", "'Virajlarda sessiz' kapatılınca"),
                           ("keepQuietEnabled", "the voice engineer is switched off", "Sesli mühendis kapatılınca"),
                           ("keepQuietDisabled", "the voice engineer is switched on", "Sesli mühendis açılınca")]:
    T("acknowledge/" + k_, f"Confirmation when {grp_en} on the Voice Engineer page.", f"{grp_tr} (Sesli Mühendis sayfasından) onay olarak.")

# ---- alarm_clock
S("alarm_clock/alarms", "Alarms.", "Alarmlar.")
S("alarm_clock/am", "A.M.", "Sabah (ÖÖ).")
S("alarm_clock/notify", "It's time.", "Zamanı geldi.")
S("alarm_clock/pm", "P.M.", "Akşam (ÖS).")

# ---- battery (hibrit/elektrik)
for k_, en, tr in [
    ("about_to_run_out", "Battery's about to run out.", "Batarya bitmek üzere."),
    ("battery_use_increasing", "Battery use is increasing.", "Batarya kullanımı artıyor."),
    ("battery_use_reducing", "Battery use is reducing.", "Batarya kullanımı azalıyor."),
    ("battery_use_stable", "Battery use is stable.", "Batarya kullanımı sabit."),
    ("critical_battery", "Battery is critical.", "Batarya kritik seviyede."),
    ("current_charge_should_make_end", "Current charge should get us to the end.", "Bu şarjla sona ulaşırız."),
    ("current_charge_should_make_half_distance", "Current charge should get us to half distance.", "Bu şarjla yarı mesafeye ulaşırız."),
    ("five_minutes_battery", "Five minutes of battery left.", "Beş dakikalık batarya kaldı."),
    ("four_laps_battery", "Four laps of battery left.", "Dört turluk batarya kaldı."),
    ("half_charge_warning", "Battery is at half charge.", "Batarya yarıya indi."),
    ("half_distance_good_battery", "Half distance, battery looks good.", "Yarı mesafe, batarya iyi görünüyor."),
    ("half_distance_low_battery", "Half distance, battery is low.", "Yarı mesafe, batarya düşük."),
    ("increase_battery_use_easily_make_end", "You can use more battery, we'll easily make the end.", "Bataryayı daha çok kullanabilirsin, sona rahat yeteriz."),
    ("increase_battery_use_easily_make_half_distance", "You can use more battery, we'll easily make half distance.", "Bataryayı daha çok kullanabilirsin, yarı mesafeye rahat yeteriz."),
    ("laps", "laps", "tur"), ("laps_remaining", "laps remaining", "tur kaldı"), ("low_battery", "Battery is low.", "Batarya düşük."),
    ("minutes", "minutes", "dakika"), ("minutes_remaining", "minutes remaining", "dakika kaldı"),
    ("on_last_lap_you_used", "On the last lap you used", "Son turda kullandığın"),
    ("one_lap_battery", "One lap of battery left.", "Bir turluk batarya kaldı."),
    ("percent", "percent", "yüzde"), ("percent_of_your_battery", "percent of your battery", "bataryanın yüzde"),
    ("percent_per_lap", "percent per lap", "tur başına yüzde"), ("percent_remaining", "percent remaining", "yüzde kaldı"),
    ("plenty_of_battery", "Plenty of battery.", "Bataryamız bol."),
    ("reduce_battery_use_to_make_end", "Reduce battery use to make the end.", "Sona yetmesi için batarya kullanımını azalt."),
    ("reduce_battery_use_to_make_half_distance", "Reduce battery use to make half distance.", "Yarı mesafeye yetmesi için batarya kullanımını azalt."),
    ("ten_minutes_battery", "Ten minutes of battery left.", "On dakikalık batarya kaldı."),
    ("three_laps_battery", "Three laps of battery left.", "Üç turluk batarya kaldı."),
    ("two_laps_battery", "Two laps of battery left.", "İki turluk batarya kaldı."),
    ("two_minutes_battery", "Two minutes of battery left.", "İki dakikalık batarya kaldı."),
    ("we_estimate", "We estimate", "Tahminimiz"), ("we_will_get_another", "We'll get another", "Bir … daha alırız"),
    ("wont_make_end_without_pitstop", "We won't make the end without a pit stop.", "Pit yapmadan sona yetmez."),
    ("wont_make_half_distance_without_pitstop", "We won't make half distance without a pit stop.", "Pit yapmadan yarı mesafeye yetmez."),
]:
    S("battery/" + k_, en, tr)

# ---- conditions
for k_, en, tr in [
    ("air_and_track_temp_decreasing", "Air and track temperatures are dropping.", "Hava ve pist sıcaklığı düşüyor."),
    ("air_and_track_temp_increasing", "Air and track temperatures are rising.", "Hava ve pist sıcaklığı artıyor."),
    ("air_temp_decreasing_its_now", "Air temperature is dropping, it's now", "Hava sıcaklığı düşüyor, şu an"),
    ("air_temp_increasing_its_now", "Air temperature is rising, it's now", "Hava sıcaklığı artıyor, şu an"),
    ("air_temp_is", "Air temperature is", "Hava sıcaklığı"), ("air_temp_is_now", "Air temperature is now", "Hava sıcaklığı şimdi"),
    ("celsius", "degrees Celsius", "derece"), ("fahrenheit", "degrees Fahrenheit", "derece Fahrenheit"),
    ("drizzle_decreasing", "Rain's easing off to a drizzle.", "Yağmur hafifledi, çiseliyor."),
    ("drizzle_increasing", "It's starting to drizzle.", "Çiselemeye başladı."),
    ("heavy_rain_decreasing", "Rain's easing a bit, still heavy.", "Yağmur biraz azaldı ama hâlâ şiddetli."),
    ("heavy_rain_increasing", "Rain's getting heavy.", "Yağmur şiddetlendi."),
    ("light_rain_decreasing", "Rain's easing to light rain.", "Yağmur azaldı, hafif yağıyor."),
    ("light_rain_increasing", "Light rain now.", "Hafif yağmur başladı."),
    ("maximum_rain", "It's absolutely pouring down.", "Bardaktan boşanırcasına yağıyor."),
    ("mid_rain_decreasing", "Rain's easing to moderate.", "Yağmur azaldı, orta şiddette."),
    ("mid_rain_increasing", "Rain's getting heavier, moderate now.", "Yağmur arttı, orta şiddette."),
    ("seeing_some_rain", "We're seeing some rain.", "Yağmur başladı."),
    ("stopped_raining", "It's stopped raining.", "Yağmur durdu."),
    ("track_temp_decreasing_its_now", "Track temperature is dropping, it's now", "Pist sıcaklığı düşüyor, şu an"),
    ("track_temp_increasing_its_now", "Track temperature is rising, it's now", "Pist sıcaklığı artıyor, şu an"),
    ("track_temp_is", "Track temperature is", "Pist sıcaklığı"), ("track_temp_is_now", "Track temperature is now", "Pist sıcaklığı şimdi"),
    ("we_expect_drizzle_in_the_next", "We expect drizzle in the next", "Önümüzdeki … içinde çiseleme bekliyoruz"),
    ("we_expect_heavy_rain_in_the_next", "We expect heavy rain in the next", "Önümüzdeki … içinde şiddetli yağmur bekliyoruz"),
    ("we_expect_light_rain_in_the_next", "We expect light rain in the next", "Önümüzdeki … içinde hafif yağmur bekliyoruz"),
    ("we_expect_medium_rain_in_the_next", "We expect moderate rain in the next", "Önümüzdeki … içinde orta şiddette yağmur bekliyoruz"),
    ("we_expect_rain_in_the_next", "We expect rain in the next", "Önümüzdeki … içinde yağmur bekliyoruz"),
    ("we_expect_rain_to_stop_in_the_next", "We expect the rain to stop in the next", "Yağmurun önümüzdeki … içinde durmasını bekliyoruz"),
    ("we_expect_very_heavy_rain_in_the_next", "We expect very heavy rain in the next", "Önümüzdeki … içinde çok şiddetli yağmur bekliyoruz"),
]:
    S("conditions/" + k_, en, tr)
T("conditions/air_temp_is", "Once per session when you first drive off: \"Air temperature is 24 degrees\".", "Oturumda ilk kez yola çıkınca bir kez: \"Hava sıcaklığı 24 derece\".")
T("conditions/track_temp_is", "Right after the air temperature at session start: \"Track temperature is 32 degrees\".", "Oturum başında hava sıcaklığından hemen sonra: \"Pist sıcaklığı 32 derece\".")
T("conditions/celsius", "Unit after a temperature reading.", "Sıcaklık sayısından sonra birim.")
T("conditions/fahrenheit", "Unit after a temperature when 'mph' units are selected in settings.", "Ayarlarda mil/saat birimi seçiliyse sıcaklık birimi.")
for d, en, tr in [("increasing", "rose", "arttı"), ("decreasing", "fell", "azaldı")]:
    T(f"conditions/air_and_track_temp_{d}", f"Both air and track temperature {en} by 3°C+ in the last 10+ minutes.", f"Son 10+ dakikada hava ve pist sıcaklığı birlikte 3°C'den fazla {tr}.")
    T(f"conditions/track_temp_{d}_its_now", f"Track temperature {en} by 3°C+ in 10+ minutes; followed by the new value.", f"Pist sıcaklığı 10+ dakikada 3°C'den fazla {tr}; ardından yeni değer.")
    T(f"conditions/air_temp_{d}_its_now", f"Air temperature {en} by 3°C+ in 10+ minutes; followed by the new value.", f"Hava sıcaklığı 10+ dakikada 3°C'den fazla {tr}; ardından yeni değer.")
for k_, en, tr in [("seeing_some_rain", "Rain starts (precipitation > 3%, stable 20 s).", "Yağmur başlar (yağış %3'ü geçer, 20 sn sabit)."),
                   ("stopped_raining", "Rain stops (precipitation back to ~0, stable 20 s).", "Yağmur durur (yağış ~0'a döner, 20 sn sabit)."),
                   ("maximum_rain", "Rain reaches the maximum level (>85%).", "Yağış en yüksek seviyeye çıkar (%85+)."),
                   ("drizzle_increasing", "Rain rises to drizzle level (3–20%).", "Yağış çiseleme seviyesine çıkar (%3–20)."),
                   ("drizzle_decreasing", "Rain falls back to drizzle level.", "Yağış çiseleme seviyesine iner."),
                   ("light_rain_increasing", "Rain rises to light level (20–40%).", "Yağış hafif seviyeye çıkar (%20–40)."),
                   ("light_rain_decreasing", "Rain falls back to light level.", "Yağış hafif seviyeye iner."),
                   ("mid_rain_increasing", "Rain rises to moderate level (40–60%).", "Yağış orta seviyeye çıkar (%40–60)."),
                   ("mid_rain_decreasing", "Rain falls back to moderate level.", "Yağış orta seviyeye iner."),
                   ("heavy_rain_increasing", "Rain rises to heavy level (60–85%).", "Yağış şiddetli seviyeye çıkar (%60–85)."),
                   ("heavy_rain_decreasing", "Rain falls from maximum back to heavy.", "Yağış en yüksekten şiddetliye iner.")]:
    T("conditions/" + k_, en, tr)

# ---- damage_reporting
for k_, en, tr in [
    ("acknowledge_driver_is_ok", "Good to hear you're OK.", "İyi olduğuna sevindim."),
    ("acknowledge_driver_is_ok_no_speech", "No answer… I'll assume you're OK.", "Cevap yok… iyi olduğunu varsayıyorum."),
    ("acknowledge_driver_is_ok_not_understood", "Didn't catch that, but sounds like you're OK.", "Anlayamadım ama iyi gibisin."),
    ("are_you_ok_first_try", "That was a big one. Are you OK?", "Sert bir kazaydı. İyi misin?"),
    ("are_you_ok_second_try", "Are you OK? Talk to me.", "İyi misin? Bir şey söyle."),
    ("are_you_ok_third_try", "Hello? Are you alright?", "Alo? İyi misin?"),
    ("busted_brakes", "The brakes are gone.", "Frenler gitti."), ("busted_engine", "The engine's gone.", "Motor gitti."),
    ("busted_suspension", "Suspension's broken.", "Süspansiyon kırıldı."), ("busted_transmission", "Gearbox is gone.", "Şanzıman gitti."),
    ("damage", "We have damage.", "Hasarımız var."),
    ("left_front_puncture", "Left front puncture.", "Sol ön lastik patladı."), ("left_rear_puncture", "Left rear puncture.", "Sol arka lastik patladı."),
    ("right_front_puncture", "Right front puncture.", "Sağ ön lastik patladı."), ("right_rear_puncture", "Right rear puncture.", "Sağ arka lastik patladı."),
    ("minor_aero_damage", "Minor aero damage.", "Hafif aerodinamik hasar."), ("minor_aero_damage_general", "Some minor aero damage.", "Biraz aerodinamik hasar var."),
    ("minor_brake_damage", "Minor brake damage.", "Frenlerde hafif hasar."), ("minor_engine_damage", "Minor engine damage.", "Motorda hafif hasar."),
    ("minor_suspension_damage", "Minor suspension damage.", "Süspansiyonda hafif hasar."),
    ("minor_suspension_damage_general", "Some minor suspension damage.", "Süspansiyonda biraz hasar var."),
    ("minor_transmission_damage", "Minor gearbox damage.", "Şanzımanda hafif hasar."),
    ("missing_wheel", "We've lost a wheel!", "Teker çıktı!"),
    ("no_aero_damage", "No aero damage.", "Aerodinamik hasar yok."), ("no_brake_damage", "No brake damage.", "Fren hasarı yok."),
    ("no_damage", "No damage.", "Hasar yok."), ("no_engine_damage", "No engine damage.", "Motor hasarı yok."),
    ("no_suspension_damage", "No suspension damage.", "Süspansiyon hasarı yok."), ("no_transmission_damage", "No gearbox damage.", "Şanzıman hasarı yok."),
    ("rolling", "We're rolling!", "Takla atıyoruz!"),
    ("severe_aero_damage", "Severe aero damage.", "Ağır aerodinamik hasar."), ("severe_brake_damage", "Severe brake damage.", "Frenlerde ağır hasar."),
    ("severe_engine_damage", "Severe engine damage.", "Motorda ağır hasar."), ("severe_suspension_damage", "Severe suspension damage.", "Süspansiyonda ağır hasar."),
    ("severe_transmission_damage", "Severe gearbox damage.", "Şanzımanda ağır hasar."),
    ("stopped_upside_down", "We're upside down.", "Ters döndük."),
    ("trivial_aero_damage", "Very light aero damage.", "Çok hafif aerodinamik hasar."),
    ("trivial_aero_damage_general", "Just a scratch on the aero.", "Aerodinamikte ufak bir çizik."),
    ("wheel_damage", "Wheel damage.", "Tekerde hasar."),
]:
    S("damage_reporting/" + k_, en, tr)
T("damage_reporting/are_you_ok_first_try", "Big impact detected: speed drops by 25+ m/s within 0.7 s and the car nearly stops.", "Sert kaza algılanınca: hız 0,7 sn içinde 25 m/sn'den fazla düşer ve araç neredeyse durur.")
T("damage_reporting/are_you_ok_second_try", "10 s after a crash the car is still stopped.", "Kazadan 10 sn sonra araç hâlâ duruyorsa.")
T("damage_reporting/are_you_ok_third_try", "20 s after a crash the car is still stopped.", "Kazadan 20 sn sonra araç hâlâ duruyorsa.")

# ---- driver_swaps
for k_, en, tr in [("10_minutes_left_in_stint", "Ten minutes left in your stint.", "Stintinin bitmesine on dakika."),
                   ("15_minutes_left_in_stint", "Fifteen minutes left in your stint.", "Stintinin bitmesine on beş dakika."),
                   ("2_minutes_left_in_stint", "Two minutes left in your stint.", "Stintinin bitmesine iki dakika."),
                   ("5_minutes_left_in_stint", "Five minutes left in your stint.", "Stintinin bitmesine beş dakika."),
                   ("pit_now_for_driver_change", "Box now for the driver change.", "Pilot değişimi için şimdi pite gir."),
                   ("pit_this_lap_driver_change_no_more_stints", "Box this lap for the driver change, that's your last stint.", "Bu tur pilot değişimi için pite gir, son stintindi."),
                   ("pit_this_lap_for_driver_change", "Box this lap for the driver change.", "Bu tur pilot değişimi için pite gir.")]:
    S("driver_swaps/" + k_, en, tr)

# ---- engine_monitor
for k_, en, tr in [("all_clear", "Engine readings are back to normal.", "Motor değerleri normale döndü."),
                   ("hot_oil", "Oil temperature is high.", "Yağ sıcaklığı yüksek."), ("hot_oil_and_water", "Oil and water temperatures are high.", "Yağ ve su sıcaklığı yüksek."),
                   ("hot_water", "Water temperature is high.", "Su sıcaklığı yüksek."), ("low_fuel_pressure", "Fuel pressure is low.", "Yakıt basıncı düşük."),
                   ("low_oil_pressure", "Oil pressure is low.", "Yağ basıncı düşük."), ("oil_temp_intro", "Oil temperature is", "Yağ sıcaklığı"),
                   ("stalled", "You've stalled!", "Motor stop etti!"), ("water_temp_intro", "Water temperature is", "Su sıcaklığı")]:
    S("engine_monitor/" + k_, en, tr)
T("engine_monitor/hot_water", "iRacing water temperature warning, or water temp above 112°C (other sims).", "iRacing su sıcaklığı uyarısı ya da su 112°C'yi geçince (diğer simler).")
T("engine_monitor/hot_oil", "iRacing oil temperature warning, or oil temp above 140°C.", "iRacing yağ sıcaklığı uyarısı ya da yağ 140°C'yi geçince.")
T("engine_monitor/hot_oil_and_water", "Oil and water are both too hot.", "Yağ ve su birlikte fazla ısınınca.")
T("engine_monitor/water_temp_intro", "After a hot water warning, followed by the temperature.", "Su sıcaklığı uyarısından sonra, ardından derece.")
T("engine_monitor/oil_temp_intro", "After a hot oil warning, followed by the temperature.", "Yağ sıcaklığı uyarısından sonra, ardından derece.")
T("engine_monitor/low_oil_pressure", "iRacing low oil pressure warning bit.", "iRacing düşük yağ basıncı uyarısı.")
T("engine_monitor/low_fuel_pressure", "iRacing low fuel pressure warning bit.", "iRacing düşük yakıt basıncı uyarısı.")
T("engine_monitor/stalled", "iRacing 'engine stalled' warning while the session is running.", "Oturum sürerken iRacing 'motor stop etti' uyarısı.")
T("engine_monitor/all_clear", "10 s after all engine warnings have cleared.", "Tüm motor uyarıları kalktıktan 10 sn sonra.")

# ---- flags
FLAG = {
    "and": ("and", "ve"), "black_flag": ("Black flag.", "Siyah bayrak."), "blue_flag": ("Blue flag, let him by.", "Mavi bayrak, yol ver."),
    "choose_a_lane_by_staying_left_or_right": ("Choose a lane by staying left or right.", "Sağda ya da solda kalarak şeridini seç."),
    "clear_to_overtake": ("Clear to overtake.", "Geçmek serbest."), "double_yellow_flag": ("Double yellow flag!", "Çift sarı bayrak!"),
    "fc_yellow_green_flag": ("Green, green, green, safety car's in!", "Yeşil, yeşil! Güvenlik aracı içeride, yarış devam!"),
    "fc_yellow_in_progress_eu": ("Safety car still out.", "Güvenlik aracı hâlâ pistte."), "fc_yellow_in_progress_usa": ("Still under caution.", "Hâlâ sarı bayrak (caution) altındayız."),
    "fc_yellow_last_lap_current": ("Last lap under caution.", "Sarı bayrakta son tur."), "fc_yellow_last_lap_current_eu": ("Safety car in this lap.", "Güvenlik aracı bu tur giriyor."),
    "fc_yellow_last_lap_current_usa": ("Pace car's in this lap.", "Pace car bu tur giriyor."), "fc_yellow_last_lap_next": ("Next lap is the last under caution.", "Sonraki tur sarı bayrakta son tur."),
    "fc_yellow_last_lap_next_eu": ("Safety car in next lap.", "Güvenlik aracı gelecek tur giriyor."), "fc_yellow_last_lap_next_usa": ("Pace car in next lap.", "Pace car gelecek tur giriyor."),
    "fc_yellow_pits_closed": ("Pits are closed.", "Pit kapalı."), "fc_yellow_pits_closed_eu": ("Pit lane is closed.", "Pit yolu kapalı."),
    "fc_yellow_pits_closed_usa": ("Pits are closed.", "Pitler kapalı."), "fc_yellow_pits_open": ("Pits are open.", "Pit açık."),
    "fc_yellow_pits_open_eu": ("Pit lane is open.", "Pit yolu açık."), "fc_yellow_pits_open_lead_lap_cars": ("Pits open for lead-lap cars.", "Pit, lider turundaki araçlara açık."),
    "fc_yellow_pits_open_lead_lap_cars_eu": ("Pit lane open for lead-lap cars.", "Pit yolu lider turundaki araçlara açık."),
    "fc_yellow_pits_open_lead_lap_cars_usa": ("Pits open for the lead-lap cars.", "Pitler lider turundakilere açık."), "fc_yellow_pits_open_usa": ("Pits are open.", "Pitler açık."),
    "fc_yellow_prepare_for_green": ("Get ready for the restart.", "Yeniden kalkışa hazırlan."), "fc_yellow_prepare_for_green_eu": ("Safety car's coming in, get ready.", "Güvenlik aracı giriyor, hazır ol."),
    "fc_yellow_prepare_for_green_usa": ("One to green, get ready.", "Yeşile bir tur, hazır ol."),
    "fc_yellow_start": ("Full course yellow!", "Tüm pistte sarı bayrak!"), "fc_yellow_start_eu": ("Safety car, safety car!", "Güvenlik aracı, güvenlik aracı!"),
    "fc_yellow_start_eu_no_safetycar": ("Full course yellow, no safety car.", "Tüm pistte sarı, güvenlik aracı yok."),
    "fc_yellow_start_usa": ("Caution, caution!", "Caution, caution! Sarı bayrak!"), "fc_yellow_start_usa_no_safetycar": ("Caution is out, no pace car.", "Sarı bayrak çıktı, pace car yok."),
    "give_one_position_back_first_warning": ("Give that position back.", "O pozisyonu geri ver."),
    "give_one_position_back_next_warning": ("You still need to give that position back.", "O pozisyonu hâlâ geri vermen gerekiyor."),
    "give_positions_back_completed": ("OK, positions given back.", "Tamam, pozisyonlar geri verildi."),
    "give_positions_back_first_warning_intro": ("You need to give back", "Geri vermen gereken pozisyon:"), "give_positions_back_first_warning_outro": ("positions.", "pozisyon."),
    "give_positions_back_next_warning_intro": ("You still need to give back", "Hâlâ geri vermen gereken:"), "give_positions_back_next_warning_outro": ("positions.", "pozisyon."),
    "incident_in_corner_intro": ("Incident in turn", "Virajda kaza:"), "incident_in_corner_with_driver_intro": ("Incident involving", "Kazaya karışan:"),
    "is_the_lucky_dog": ("is the lucky dog.", "şanslı araç (lucky dog)."), "let_the_lucky_dog_pass_on_left": ("Let the lucky dog by on the left.", "Şanslı aracı soldan geçir."),
    "local_yellow_ahead": ("Yellow flag ahead.", "İleride sarı bayrak."), "local_yellow_clear": ("Clear of the yellow.", "Sarı bölge geçti, temiz."),
    "local_yellow_flag": ("Local yellow.", "Yerel sarı bayrak."), "lucky_dog_allow_pass_on_outside": ("Let the lucky dog by on the outside.", "Şanslı aracı dıştan geçir."),
    "lucky_dog_pass_on_outside": ("Lucky dog, pass on the outside.", "Şanslı araç, dıştan geç."), "move_to_choose_lane": ("Move over to choose your lane.", "Şeridini seçmek için kenara geç."),
    "move_to_end_of_longest_line_for_penalty": ("Move to the end of the longest line for the penalty.", "Ceza için en uzun sıranın sonuna geç."),
    "name_has_gone_off_in_outro": ("has gone off in", "… pistten çıktı:"), "name_has_gone_off_intro": ("Car off:", "Pistten çıkan:"),
    "name_has_gone_off_outro": ("has gone off.", "pistten çıktı."), "names_have_gone_off_in_outro": ("have gone off in", "… pistten çıktılar:"),
    "names_have_gone_off_outro": ("have gone off.", "pistten çıktılar."), "no_overtaking": ("No overtaking!", "Sollama yok!"),
    "on_the_inside_line": ("on the inside line", "iç hatta"), "on_the_outside_line": ("on the outside line", "dış hatta"),
    "pass_drivername_for_lucky_dog_position_intro": ("Pass", "Geç:"), "pass_drivername_for_lucky_dog_position_outro": ("for the lucky dog.", "… şanslı araç pozisyonu için."),
    "pass_this_guy_to_get_lucky_dog_position": ("Pass this guy to get the lucky dog.", "Şanslı araç olmak için bunu geç."),
    "pileup_in_corner_intro": ("Pile-up in turn", "Virajda zincirleme kaza:"), "red-yellow-flag": ("Debris flag, watch out.", "Kırmızı-sarı bayrak: pistte döküntü var."),
    "remind_lucky_dog": ("Remember, you're the lucky dog.", "Unutma, şanslı araç sensin."), "slippery-surface-flag": ("Slippery surface flag.", "Kaygan zemin bayrağı."),
    "slow_car_ahead": ("Slow car ahead.", "İleride yavaş araç."), "slow_car_ahead_stay_high": ("Slow car ahead, stay high.", "İleride yavaş araç, yukarıda kal."),
    "slow_car_in": ("Slow car in", "Yavaş araç:"), "stay_behind": ("Stay behind.", "Arkada kal."), "stay_behind_the_pace_car": ("Stay behind the pace car.", "Pace car'ın arkasında kal."),
    "stay_below_vsc_speed": ("Stay below the VSC speed.", "Sanal güvenlik aracı hızının altında kal."),
    "stopped_car_ahead": ("Stopped car ahead!", "İleride duran araç!"), "stopped_car_ahead_stay_high": ("Stopped car ahead, stay high!", "İleride duran araç, yukarıda kal!"),
    "stopped_car_in": ("Stopped car in", "Duran araç:"), "the_pace_car_is_in_turn": ("The pace car is in turn", "Pace car şu virajda:"),
    "two_to_green": ("Two to green.", "Yeşile iki tur."), "two_to_green_remind_lucky_dog": ("Two to green, you're the lucky dog.", "Yeşile iki tur, şanslı araç sensin."),
    "virtual_safety_car": ("Virtual safety car!", "Sanal güvenlik aracı!"), "virtual_safety_car_phase_over": ("VSC is ending.", "Sanal güvenlik aracı bitiyor."),
    "virtual_safety_car_speed": ("VSC speed is", "Sanal güvenlik aracı hızı"), "wave_around_catch_end_of_field": ("Wave around, catch the end of the field.", "Tur geri verildi (wave around), grubun sonuna yetiş."),
    "we_are_in_lucky_dog_position": ("We're in the lucky dog position.", "Şanslı araç pozisyonundayız."), "we_are_the_lucky_dog": ("We're the lucky dog.", "Şanslı araç biziz."),
    "we_have_been_waved_around": ("We've been waved around.", "Turumuz geri verildi (wave around)."), "white_flag": ("White flag.", "Beyaz bayrak."),
    "yellow_flag": ("Yellow flag!", "Sarı bayrak!"),
}
for k_, (en, tr) in FLAG.items():
    S("flags/" + k_, en, tr)
for n in (1, 2, 3):
    S(f"flags/green_flag_sector_{n}", f"Green flag in sector {n}.", f"{cap(trn(n))}. sektörde yeşil bayrak.")
    S(f"flags/yellow_flag_sector_{n}", f"Yellow flag in sector {n}.", f"{cap(trn(n))}. sektörde sarı bayrak.")
for n in range(1, 7):
    S(f"flags/position{n}_has_gone_off", f"P{n} has gone off.", f"{cap(tr_ord(n))} sıradaki araç pistten çıktı.")
    S(f"flags/position{n}_has_gone_off_in", f"P{n} has gone off in", f"{cap(tr_ord(n))} sıradaki araç şurada pistten çıktı:")
for kind, en, tr in [("slow", "Slow", "Yavaş"), ("stopped", "Stopped", "Duran")]:
    for where, wen, wtr in [("the_tri-oval", "the tri-oval", "tri-ovalde"), ("turn_1", "turn 1", "birinci virajda"), ("turn_2", "turn 2", "ikinci virajda"),
                            ("turn_3", "turn 3", "üçüncü virajda"), ("turn_4", "turn 4", "dördüncü virajda")]:
        S(f"flags/{kind}_car_in_{where}", f"{en} car in {wen}.", f"{cap(wtr)} {tr.lower()} araç.")
        S(f"flags/{kind}_car_in_{where}_stay_high", f"{en} car in {wen}, stay high.", f"{cap(wtr)} {tr.lower()} araç, yukarıda kal.")
T("flags/yellow_flag", "Local yellow flag appears (no full-course caution).", "Yerel sarı bayrak çıkınca (tüm pist sarısı değilse).")
T("flags/local_yellow_flag", "Alternative line for a local yellow flag.", "Yerel sarı bayrak için alternatif cümle.")
T("flags/local_yellow_ahead", "Alternative line for a local yellow flag.", "Yerel sarı bayrak için alternatif cümle.")
T("flags/double_yellow_flag", "Waving (double) yellow appears (iRacing).", "Sallanan (çift) sarı bayrak çıkınca (iRacing).")
T("flags/local_yellow_clear", "Local yellow cleared after at least 3 s.", "En az 3 sn süren yerel sarı kalkınca.")
T("flags/fc_yellow_start", "Full-course caution starts in a race (alternative line).", "Yarışta tüm pist sarı / güvenlik aracı başlayınca (alternatif cümle).")
T("flags/fc_yellow_start_eu", "Full-course caution starts in a race on a road course.", "Yol pistinde yarışta tüm pist sarı / güvenlik aracı başlayınca.")
T("flags/fc_yellow_start_usa", "Full-course caution starts in a race on an oval.", "Ovalde yarışta caution (tüm pist sarı) başlayınca.")
T("flags/fc_yellow_prepare_for_green", "'One lap to green' shown during caution (alternative).", "Sarı bayrakta 'yeşile bir tur' gösterilince (alternatif).")
T("flags/fc_yellow_prepare_for_green_eu", "'One lap to green' on a road course.", "Yol pistinde 'yeşile bir tur' gösterilince.")
T("flags/fc_yellow_prepare_for_green_usa", "'One lap to green' on an oval.", "Ovalde 'yeşile bir tur' gösterilince.")
T("flags/fc_yellow_green_flag", "Caution ends and green flag is shown.", "Sarı bayrak bitip yeşil yanınca.")
T("flags/blue_flag", "Blue flag shown to you (repeats every 25 s while it stays).", "Sana mavi bayrak gösterilince (sürdükçe 25 sn'de bir).")
T("flags/red-yellow-flag", "Debris flag shown (iRacing), max once a minute.", "Döküntü bayrağı gösterilince (iRacing), dakikada en çok bir.")
T("flags/slippery-surface-flag", "Alternative line for the debris flag.", "Döküntü bayrağı için alternatif cümle.")
T("flags/black_flag", "You get a black flag.", "Siyah bayrak alınca.")
T("flags/white_flag", "Last lap starts (white flag) – one of several alternatives.", "Son tur başlayınca (beyaz bayrak) – alternatiflerden biri.")

# ---- frozen_order
FO = {
    "allow": ("Allow", "İzin ver:"), "allow_car_number": ("Allow car number", "Şu numaralı araca izin ver:"), "allow_guy_behind_to_pass": ("Let the guy behind pass.", "Arkandakinin geçmesine izin ver."),
    "catch_up_to": ("Catch up to", "Şuna yetiş:"), "catch_up_to_car_number": ("Catch up to car number", "Şu numaralı araca yetiş:"),
    "fcy_lineup_single_file": ("Line up single file.", "Tek sıra hizalan."), "follow": ("Follow", "Takip et:"), "follow_car_number": ("Follow car number", "Şu numaralı aracı takip et:"),
    "in_the_inside_column": ("in the inside column", "iç sırada"), "in_the_left_column": ("in the left column", "sol sırada"),
    "in_the_outside_column": ("in the outside column", "dış sırada"), "in_the_right_column": ("in the right column", "sağ sırada"),
    "kilometres_per_hour": ("kilometres per hour", "kilometre"), "line_up_in_the_inside_column": ("Line up in the inside column.", "İç sırada hizalan."),
    "line_up_in_the_left_column": ("Line up in the left column.", "Sol sırada hizalan."), "line_up_in_the_outside_column": ("Line up in the outside column.", "Dış sırada hizalan."),
    "line_up_in_the_right_column": ("Line up in the right column.", "Sağ sırada hizalan."), "line_up_single_file_behind": ("Line up single file behind", "Tek sıra şunun arkasına hizalan:"),
    "line_up_single_file_behind_car_number": ("Line up single file behind car number", "Tek sıra şu numaralı aracın arkasına hizalan:"),
    "line_up_single_file_behind_safety_car_eu": ("Line up single file behind the safety car.", "Güvenlik aracının arkasında tek sıra hizalan."),
    "line_up_single_file_behind_safety_car_usa": ("Line up single file behind the pace car.", "Pace car'ın arkasında tek sıra hizalan."),
    "miles_per_hour": ("miles per hour", "mil"), "move_to_pole": ("Move to pole.", "Pole'e geç."), "move_to_pole_row": ("Move to the pole row.", "Pole sırasına geç."),
    "pace_car_just_left": ("The pace car just left.", "Pace car az önce ayrıldı."), "pace_car_speed_is": ("Pace car speed is", "Pace car hızı"),
    "pass_car_number": ("Pass car number", "Şu numaralı aracı geç:"), "pass_the_pace_car": ("Pass the pace car.", "Pace car'ı geç."),
    "pass_the_safety_car": ("Pass the safety car.", "Güvenlik aracını geç."), "row": ("row", "sıra"), "safety_car_just_left": ("The safety car just left.", "Güvenlik aracı az önce ayrıldı."),
    "safety_car_speed_is": ("Safety car speed is", "Güvenlik aracı hızı"), "safetycar_out_eu": ("The safety car is out.", "Güvenlik aracı pistte."),
    "safetycar_out_usa": ("The pace car is out.", "Pace car pistte."), "stay_in_pole": ("Stay on pole.", "Pole'de kal."),
    "stay_in_pole_in_inside_column": ("Stay on pole in the inside column.", "İç sırada pole'de kal."), "stay_in_pole_in_left_column": ("Stay on pole in the left column.", "Sol sırada pole'de kal."),
    "stay_in_pole_in_outside_column": ("Stay on pole in the outside column.", "Dış sırada pole'de kal."), "stay_in_pole_in_right_column": ("Stay on pole in the right column.", "Sağ sırada pole'de kal."),
    "thats_a_rolling_start": ("It's a rolling start.", "Hareketli start olacak."), "thats_a_standing_start": ("It's a standing start.", "Duran start olacak."),
    "the_pace_car": ("the pace car", "pace car"), "the_safety_car": ("the safety car", "güvenlik aracı"), "to_pass": ("to pass", "geçmesine"),
    "were_starting_from_pole": ("We're starting from pole.", "Pole pozisyonundan başlıyoruz."), "were_starting_from_position": ("We're starting from", "Başlangıç sıramız:"),
    "you_need_to_catch_up_to_the_guy_ahead": ("You need to catch up to the guy ahead.", "Öndekine yetişmen gerekiyor."),
    "youre_ahead_of_guy_you_should_follow": ("You're ahead of the guy you should follow.", "Takip etmen gereken aracın önündesin."),
}
for k_, (en, tr) in FO.items():
    S("frozen_order/" + k_, en, tr)
T("frozen_order/thats_a_rolling_start", "Race session enters parade/pace laps (rolling start).", "Yarış oturumu tören/pace turuna geçince (hareketli start).")
T("frozen_order/were_starting_from_pole", "On the grid before the start, if you start P1.", "Start öncesi gridde, P1'den başlıyorsan.")
T("frozen_order/were_starting_from_position", "On the grid before the start, followed by the grid position (e.g. 'P5').", "Start öncesi gridde, ardından sıra (ör. 'P5').")
T("frozen_order/kilometres_per_hour", "Unit after the pit speed limit (first pit entry in practice/qualifying).", "Pit hız sınırından sonra birim (antrenman/sıralamada ilk pit girişi).")
T("frozen_order/miles_per_hour", "Unit after the pit speed limit when mph units are selected.", "Mil/saat birimi seçiliyse pit hız sınırından sonra birim.")

# ---- fuel
FU = {
    "about_to_run_out": ("You're about to run out of fuel!", "Yakıt bitmek üzere!"), "and_closes_after": ("and closes after", "ve kapanışı"),
    "and_will_close_on_lap": ("and will close on lap", "ve şu turda kapanacak:"), "five_minutes_fuel": ("Five minutes of fuel left.", "Beş dakikalık yakıt kaldı."),
    "for": ("for", "için"), "four_laps_fuel": ("Four laps of fuel left.", "Dört turluk yakıt kaldı."), "fuel_should_be_ok": ("Fuel should be OK.", "Yakıt yeter gibi görünüyor."),
    "fuel_will_be_tight": ("Fuel's going to be tight.", "Yakıt sıkışık olacak."), "gallon": ("gallon", "galon"), "gallons": ("gallons", "galon"),
    "gallons_per_lap": ("gallons per lap", "tur başına galon"), "gallons_remaining": ("gallons remaining", "galon kaldı"),
    "gallons_to_get_to_the_end": ("gallons to get to the end", "galon sona kadar yetmesi için"), "half_a_gallon_remaining": ("Half a gallon remaining.", "Yarım galon kaldı."),
    "half_distance_good_fuel": ("Half distance, fuel's looking good.", "Yarı mesafe, yakıt iyi görünüyor."), "half_distance_low_fuel": ("Half distance, we're low on fuel.", "Yarı mesafe, yakıt az."),
    "half_tank_warning": ("Half a tank left.", "Depo yarıya indi."), "into_the_race": ("into the race", "yarışın başından itibaren"), "laps_remaining": ("laps remaining", "turluk yakıt var"),
    "litre": ("litre", "litre"), "litres": ("litres", "litre"), "litres_per_lap": ("litres per lap", "litre tur başına"), "litres_remaining": ("litres remaining", "litre yakıt kaldı"),
    "litres_to_get_to_the_end": ("litres to get to the end", "litre, sona kadar yetmesi için"), "minutes_remaining": ("minutes remaining", "dakikalık yakıt var"),
    "need_to_add_one_gallon_to_get_to_the_end": ("We need one more gallon to make the end.", "Sona yetmesi için bir galon daha lazım."),
    "not_enough_laps_for_average": ("Not enough laps yet for an average.", "Ortalama için henüz yeterli tur yok."), "one_gallon_remaining": ("One gallon remaining.", "Bir galon kaldı."),
    "one_lap_fuel": ("One lap of fuel left.", "Bir turluk yakıt kaldı."), "one_litre_remaining": ("One litre remaining.", "Bir litre yakıt kaldı."),
    "pit_window_for_fuel_closes_on_lap": ("Fuel pit window closes on lap", "Yakıt için pit penceresi şu turda kapanıyor:"),
    "pit_window_for_fuel_opens_after": ("Fuel pit window opens after", "Yakıt için pit penceresi şu süre sonra açılıyor:"),
    "pit_window_for_fuel_opens_on_lap": ("Fuel pit window opens on lap", "Yakıt için pit penceresi şu turda açılıyor:"),
    "plenty_of_fuel": ("We've got plenty of fuel.", "Yakıtımız bol."), "ten_minutes_fuel": ("Ten minutes of fuel left.", "On dakikalık yakıt kaldı."),
    "three_laps_fuel": ("Three laps of fuel left.", "Üç turluk yakıt kaldı."), "two_laps_fuel": ("Two laps of fuel left.", "İki turluk yakıt kaldı."),
    "two_minutes_fuel": ("Two minutes of fuel left.", "İki dakikalık yakıt kaldı."), "virtual_energy": ("virtual energy", "sanal enerji"),
    "we_estimate": ("We estimate", "Tahminimiz:"), "we_estimate_we_will_need": ("We estimate we'll need", "Tahminen gereken:"),
    "we_will_need_to_add": ("We'll need to add", "Eklememiz gereken:"), "we_will_need_to_pit_for_fuel": ("We'll need to pit for fuel.", "Yakıt için pite girmemiz gerekecek."),
    "will_need_to_stop_again": ("We'll need to stop again after this.", "Bundan sonra bir kez daha durmamız gerekecek."),
}
for k_, (en, tr) in FU.items():
    S("fuel/" + k_, en, tr)
for k_, en, tr in [
    ("about_to_run_out", "Less than half a lap of fuel left and it won't make the finish (once per stint).", "Yarım turdan az yakıt kaldı ve bitişe yetmiyor (stintte bir kez)."),
    ("one_lap_fuel", "At the line: less than ~1.2 laps of fuel and it won't make the finish (lap races / practice).", "Çizgide: ~1,2 turdan az yakıt ve bitişe yetmiyor (turlu yarış / antrenman)."),
    ("two_laps_fuel", "At the line: ~2 laps of fuel left and it won't make the finish.", "Çizgide: ~2 turluk yakıt kaldı ve bitişe yetmiyor."),
    ("three_laps_fuel", "At the line: ~3 laps of fuel left and it won't make the finish.", "Çizgide: ~3 turluk yakıt kaldı ve bitişe yetmiyor."),
    ("four_laps_fuel", "At the line: ~4 laps of fuel left and it won't make the finish.", "Çizgide: ~4 turluk yakıt kaldı ve bitişe yetmiyor."),
    ("ten_minutes_fuel", "Timed race: 10 minutes of fuel left and it won't make the finish.", "Süreli yarış: 10 dakikalık yakıt kaldı ve bitişe yetmiyor."),
    ("five_minutes_fuel", "Timed race: 5 minutes of fuel left and it won't make the finish.", "Süreli yarış: 5 dakikalık yakıt kaldı ve bitişe yetmiyor."),
    ("two_minutes_fuel", "Timed race: 2 minutes of fuel left and it won't make the finish.", "Süreli yarış: 2 dakikalık yakıt kaldı ve bitişe yetmiyor."),
    ("one_litre_remaining", "Fuel drops below 1 litre (and won't make the finish).", "Yakıt 1 litrenin altına inince (bitişe yetmiyorsa)."),
    ("one_gallon_remaining", "mph units: fuel drops below 1 gallon.", "Mil/saat biriminde: yakıt 1 galonun altına inince."),
    ("half_a_gallon_remaining", "mph units: fuel drops below half a gallon.", "Mil/saat biriminde: yakıt yarım galonun altına inince."),
    ("half_tank_warning", "Race: tank drops below half and you won't make the finish on it (once per stint).", "Yarış: depo yarının altına iner ve bununla bitişe yetmiyorsa (stintte bir kez)."),
    ("half_distance_good_fuel", "At race half distance, if the fuel will make the end.", "Yarışın yarısında, yakıt sona yetecekse."),
    ("half_distance_low_fuel", "At race half distance, if more fuel will be needed.", "Yarışın yarısında, ek yakıt gerekecekse."),
    ("plenty_of_fuel", "Race fuel status after 2 measured laps: 2+ laps spare.", "2 ölçülmüş turdan sonra yarış yakıt durumu: 2+ tur fazla."),
    ("fuel_should_be_ok", "Race fuel status: 0.3–2 laps spare.", "Yarış yakıt durumu: 0,3–2 tur fazla."),
    ("fuel_will_be_tight", "Race fuel status: within ±0.7 lap of the finish.", "Yarış yakıt durumu: bitişe ±0,7 tur."),
    ("we_estimate_we_will_need", "After 'fuel will be tight': total fuel needed to the end.", "'Yakıt sıkışık' sonrası: sona kadar gereken toplam yakıt."),
    ("we_will_need_to_pit_for_fuel", "Race fuel status: a fuel stop is needed.", "Yarış yakıt durumu: yakıt için pit gerekiyor."),
    ("pit_window_for_fuel_opens_on_lap", "After 'need to pit for fuel' in lap races: window opening lap.", "Turlu yarışta 'pit gerekiyor' sonrası: pencerenin açıldığı tur."),
    ("and_will_close_on_lap", "…followed by the window closing lap.", "…ardından pencerenin kapandığı tur."),
    ("pit_window_for_fuel_closes_on_lap", "If the fuel window is already open: closing lap.", "Pencere zaten açıksa: kapanış turu."),
    ("pit_window_for_fuel_opens_after", "Timed races: window opens after N minutes.", "Süreli yarışta: pencere N dakika sonra açılıyor."),
    ("and_closes_after", "…and closes after N minutes.", "…ve N dakika sonra kapanıyor."),
    ("will_need_to_stop_again", "Fuel needed to the end is more than a full tank.", "Sona kadar gereken yakıt bir depodan fazlaysa."),
    ("we_estimate", "Practice/qualifying stint estimates on lap 3 of a stint (usage, laps, minutes).", "Antrenman/sıralamada stintin 3. turunda tahminler (tüketim, tur, dakika)."),
    ("litres_per_lap", "After the usage estimate (e.g. '2.4 litres per lap').", "Tüketim tahmininden sonra (ör. '2,4 litre tur başına')."),
    ("gallons_per_lap", "mph units: after the usage estimate.", "Mil/saat biriminde tüketim tahmininden sonra."),
    ("laps_remaining", "Stint estimate: laps of fuel in the tank.", "Stint tahmini: depodaki yakıtın tur karşılığı."),
    ("minutes_remaining", "Stint estimate: minutes of fuel in the tank.", "Stint tahmini: depodaki yakıtın dakika karşılığı."),
    ("litres_remaining", "Stint estimate: fuel in the tank.", "Stint tahmini: depodaki yakıt."),
    ("gallons_remaining", "mph units: fuel in the tank.", "Mil/saat biriminde depodaki yakıt."),
    ("we_will_need_to_add", "Race: when you enter the pit lane and need fuel to finish.", "Yarış: pit yoluna girince, bitiş için yakıt gerekiyorsa."),
    ("litres_to_get_to_the_end", "After the amount: litres needed to finish.", "Miktardan sonra: sona kadar gereken litre."),
    ("gallons_to_get_to_the_end", "mph units: gallons needed to finish.", "Mil/saat biriminde sona kadar gereken galon."),
    ("need_to_add_one_gallon_to_get_to_the_end", "mph units: ≤1 gallon needed when entering the pits.", "Mil/saat biriminde pite girerken ≤1 galon gerekiyorsa."),
]:
    T("fuel/" + k_, en, tr)

# ---- incidents
for k_, en, tr in [("incident_points", "incident points", "olay puanı"), ("incidents", "incidents", "olay puanı"),
                   ("no_incident_limit", "There's no incident limit.", "Olay puanı sınırı yok."), ("no_incident_points_limit", "No incident points limit.", "Olay puanı limiti yok."),
                   ("the_incident_limit_is", "The incident limit is", "Olay puanı sınırı"), ("the_incident_points_limit_is", "The incident points limit is", "Olay puanı limiti"),
                   ("you_have", "You have", "Şu an")]:
    S("incidents/" + k_, en, tr)
T("incidents/you_have", "iRacing: your incident count rises by 2x or more – 'You have 6 incidents'.", "iRacing: olay puanın 2x ya da daha fazla artınca – 'Şu an 6 olay puanı'.")
T("incidents/incidents", "Unit after the incident count.", "Olay sayısından sonra.")
T("incidents/incident_points", "Alternative unit after the incident count.", "Olay sayısından sonra alternatif.")
T("incidents/the_incident_limit_is", "iRacing race start: incident limit (followed by number).", "iRacing yarış başında: olay sınırı (ardından sayı).")
T("incidents/the_incident_points_limit_is", "Alternative for the incident limit line.", "Olay sınırı cümlesinin alternatifi.")
T("incidents/no_incident_limit", "iRacing race start when the incident limit is unlimited.", "iRacing yarış başında olay sınırı yoksa.")
T("incidents/no_incident_points_limit", "Alternative for 'no incident limit'.", "'Sınır yok' cümlesinin alternatifi.")

# ---- lap_counter
LC = {
    "end_of_session": ("That's the end of the session.", "Oturum bitti."), "end_of_session_pole": ("End of session, and that's pole position!", "Oturum bitti ve pole pozisyonu bizim!"),
    "finished_race": ("Race finished.", "Yarış bitti."), "finished_race_good_finish": ("Race finished, good result.", "Yarış bitti, iyi bir sonuç."),
    "finished_race_last": ("Race finished… well, at least we finished.", "Yarış bitti… en azından bitirdik."), "form_up_behind": ("Form up behind", "Şunun arkasında dizil:"),
    "get_ready": ("Get ready…", "Hazır ol…"), "give_that_position_back": ("Give that position back.", "O sırayı geri ver."),
    "green_green_green": ("Green, green, green!", "Yeşil, yeşil, yeşil! Bas!"), "has_taken_the_win": ("has taken the win.", "yarışı kazandı."),
    "hold_position_behind": ("Hold position behind", "Şunun arkasında sıranı koru:"), "hold_this_position_until_start_line": ("Hold this position until the start line.", "Start çizgisine kadar sıranı koru."),
    "hold_your_position": ("Hold your position.", "Sıranı koru."), "laps_make_them_count": ("laps to go, make them count.", "tur kaldı, iyi değerlendir."),
    "last_lap": ("Last lap.", "Son tur."), "last_lap_leading": ("Last lap, bring it home!", "Son tur, öndesin, getir eve!"),
    "last_lap_top_three": ("Last lap, keep it on the podium.", "Son tur, podyumu koru."), "leader_has_crossed_start_line": ("The leader has crossed the start line.", "Lider start çizgisini geçti."),
    "leader_has_gone": ("The leader's gone.", "Lider gitti."), "manual_formation_lap_mode_disabled": ("Manual formation lap off.", "Manuel formasyon turu kapalı."),
    "manual_formation_lap_mode_enabled": ("Manual formation lap on.", "Manuel formasyon turu açık."), "minutes_you_need_to_get_on_with_it": ("minutes, you need to get on with it.", "dakika, acele etmen lazım."),
    "ok_youre_in": ("OK, you're in.", "Tamam, girdin."), "podium_finish": ("Podium finish, great job!", "Podyum! Harika iş!"),
    "race_starts_in": ("The race starts in", "Yarış şu süre sonra başlıyor:"), "rejoin_at_back": ("Rejoin at the back.", "Arkaya katıl."),
    "starting_in_left_lane_behind": ("Starting in the left lane behind", "Sol şeritte şunun arkasından başlıyorsun:"),
    "starting_in_right_lane_behind": ("Starting in the right lane behind", "Sağ şeritte şunun arkasından başlıyorsun:"),
    "strength_of_field_for_our_class_is": ("Strength of field for our class is", "Sınıfımızın güç ortalaması (SoF):"),
    "strength_of_field_is": ("Strength of field is", "Grubun güç ortalaması (SoF):"), "two_to_go": ("Two laps to go.", "İki tur kaldı."),
    "two_to_go_leading": ("Two to go, you're leading.", "İki tur kaldı, öndesin."), "two_to_go_top_three": ("Two to go, you're in the top three.", "İki tur kaldı, ilk üçtesin."),
    "until_start_line": ("until the start line.", "start çizgisine kadar."), "white_flag_last_lap": ("White flag, last lap.", "Beyaz bayrak, son tur."),
    "won_race": ("You won the race!", "Yarışı kazandın!"),
}
for k_, (en, tr) in LC.items():
    S("lap_counter/" + k_, en, tr)
for k_, en, tr in [
    ("end_of_session", "Practice/qualifying ends (checkered).", "Antrenman/sıralama bitince (damalı bayrak)."),
    ("end_of_session_pole", "Qualifying ends and you are P1.", "Sıralama bitince P1'sen."),
    ("finished_race", "You cross the line after the checkered flag (other results).", "Damalı bayraktan sonra çizgiyi geçince (diğer sonuçlar)."),
    ("finished_race_good_finish", "Finished in top 5 or better than your start position.", "İlk 5'te ya da başladığından iyi sırada bitirince."),
    ("finished_race_last", "Finished last in class (4+ cars).", "Sınıfta sonuncu bitirince (4+ araç)."),
    ("podium_finish", "Finished P2 or P3.", "P2 ya da P3 bitirince."), ("won_race", "Finished P1.", "P1 bitirince."),
    ("get_ready", "iRacing start lights 'ready/set' before the start.", "iRacing start ışıkları 'hazır/dikkat' anında."),
    ("green_green_green", "Race goes green at the start.", "Yarış startında yeşil yanınca."),
    ("two_to_go", "Lap race: crossing the line with 2 laps to go.", "Turlu yarış: 2 tur kala çizgiden geçince."),
    ("two_to_go_leading", "Two to go while leading.", "2 tur kala öndeysen."), ("two_to_go_top_three", "Two to go while P2/P3.", "2 tur kala P2/P3'sen."),
    ("last_lap", "Last lap starts (white flag) – alternatives.", "Son tur başlayınca (beyaz bayrak) – alternatifler."),
    ("white_flag_last_lap", "Last lap starts – alternative.", "Son tur başlayınca – alternatif."),
    ("last_lap_leading", "Last lap starts while leading.", "Son tur başlarken öndeysen."), ("last_lap_top_three", "Last lap while P2/P3.", "Son turda P2/P3'sen."),
    ("laps_make_them_count", "After the number with 5 or 3 laps to go (alternative to 'laps remaining').", "5 ya da 3 tur kala sayıdan sonra ('tur kaldı'nın alternatifi)."),
    ("strength_of_field_is", "iRacing, on the grid: field SoF (single class).", "iRacing, gridde: grubun SoF değeri (tek sınıf)."),
    ("strength_of_field_for_our_class_is", "iRacing, on the grid: our class SoF (multiclass).", "iRacing, gridde: sınıfımızın SoF değeri (çok sınıf)."),
]:
    T("lap_counter/" + k_, en, tr)

# ---- lap_times
LT = {
    "best_lap_in_race": ("That's the fastest lap of the race!", "Yarışın en hızlı turu!"), "best_lap_in_race_for_class": ("Fastest lap in class!", "Sınıfın en hızlı turu!"),
    "consistent": ("Nice and consistent.", "Çok istikrarlısın."), "fastest_in_your_class": ("You're fastest in your class.", "Sınıfının en hızlısısın."),
    "gap_intro": ("You're", "Fark:"), "gap_outro_off_pace": ("off the pace.", "tempodan geridesin."), "good_lap": ("Good lap.", "İyi tur."),
    "improving": ("Your times are improving.", "Tur zamanların iyileşiyor."), "less_than_a_tenth_off_self_pace": ("Less than a tenth off your best.", "En iyinden onda birden az geride."),
    "less_than_a_tenth_off_the_pace": ("Less than a tenth off the pace.", "En hızlıdan onda birden az geridesin."),
    "matching_race_pace": ("You're matching the leaders' pace.", "Liderlerin temposunu yakaladın."), "need_to_find_a_few_more_tenths": ("Need to find a few more tenths.", "Birkaç onda bir daha bulmalıyız."),
    "need_to_find_a_second": ("Need to find about a second.", "Bir saniye kadar bulmalıyız."), "need_to_find_more_than_a_second": ("Need to find more than a second.", "Bir saniyeden fazla bulmalıyız."),
    "need_to_find_one_more_tenth": ("Just need one more tenth.", "Bir onda bir daha lazım."), "off_the_pace": ("You're off the pace.", "Tempodan geridesin."),
    "off_the_self_pace": ("That's off your own pace.", "Kendi temponun gerisinde."), "pace_bad": ("Pace isn't great.", "Tempo iyi değil."), "pace_good": ("Pace is good.", "Tempo iyi."),
    "pace_ok": ("Pace is OK.", "Tempo fena değil."), "personal_best": ("Personal best!", "Kişisel rekor!"), "quicker_than_second_place": ("quicker than second place.", "ikinciden daha hızlısın."),
    "quickest_in_class": ("Quickest in class!", "Sınıfın en hızlısı!"), "quickest_overall": ("Quickest overall!", "Genelde en hızlısın!"),
    "setting_current_race_pace": ("You're setting the race pace.", "Yarışın temposunu sen belirliyorsun."), "time_intro": ("That was a", "Tur zamanı:"),
    "worsening": ("Your times are getting worse.", "Tur zamanların kötüleşiyor."),
}
for k_, (en, tr) in LT.items():
    S("lap_times/" + k_, en, tr)
SEC_EN = {"1": "Sector one", "2": "Sector two", "3": "Sector three", "1_and_2": "Sectors one and two", "1_and_3": "Sectors one and three", "2_and_3": "Sectors two and three", "_all": "All sectors"}
SEC_TR = {"1": "Birinci sektör", "2": "İkinci sektör", "3": "Üçüncü sektör", "1_and_2": "Birinci ve ikinci sektörler", "1_and_3": "Birinci ve üçüncü sektörler",
          "2_and_3": "İkinci ve üçüncü sektörler", "_all": "Tüm sektörler"}
BAND = {"a_tenth": ("a tenth", "onda bir"), "two_tenths": ("two tenths", "iki onda bir"), "a_second": ("a second", "bir saniye"),
        "a_few_tenths": ("a few tenths", "birkaç onda bir"), "more_than_a_second": ("more than a second", "bir saniyeden fazla")}
for key in keys:
    m = re.fullmatch(r"lap_times/sector(1_and_2|1_and_3|2_and_3|_all|1|2|3)_(.*)", key)
    if not m:
        continue
    w, rest = m.group(1), m.group(2)
    en0, tr0 = SEC_EN[w], SEC_TR[w]
    plural = "_and_" in w or w == "_all"
    if rest == "fastest":
        S(key, f"{en0} {'were' if plural else 'was'} the fastest.", f"{tr0} en hızlı (mor).")
    elif rest == "fast":
        S(key, f"{en0} {'were' if plural else 'was'} quick.", f"{tr0} hızlı.")
    elif rest in ("is", "are"):
        S(key, f"{en0} {rest}", f"{tr0}:")
    else:
        mm = re.fullmatch(r"(.*)_off_(self_pace|pace)", rest)
        b, ref = mm.group(1), mm.group(2)
        ben, btr = BAND[b]
        if ref == "pace":
            S(key, f"{en0} {'are' if plural else 'is'} {ben} off the pace.", f"{tr0} en hızlıdan {btr} geride.")
        else:
            S(key, f"{en0} {'are' if plural else 'is'} {ben} off your best.", f"{tr0} kendi en iyinden {btr} geride.")
for key in keys:
    if not key.startswith("lap_times/sector") or key not in lit:
        continue
    if key.endswith("_fastest"):
        T(key, "Practice/qualifying lap: these sectors were the class-best (purple).", "Antrenman/sıralama turu: bu sektörler sınıfın en iyisi (mor).")
    elif key.endswith("_fast"):
        T(key, "Practice/qualifying lap: these sectors were within 0.05 s of class-best.", "Antrenman/sıralama turu: bu sektörler sınıfın en iyisine 0,05 sn yakın.")
    elif key.endswith("_off_pace"):
        T(key, "Practice/qualifying, non-PB lap: these sectors were this much slower than the class-best sectors (sector times measured from track position).",
          "Antrenman/sıralama, rekor olmayan tur: bu sektörler sınıfın en iyi sektörlerinden bu kadar yavaş (sektörler pist konumundan ölçülür).")
    else:
        T(key, "Practice/qualifying, non-PB lap: these sectors were this much slower than your own best sectors.",
          "Antrenman/sıralama, rekor olmayan tur: bu sektörler kendi en iyi sektörlerinden bu kadar yavaş.")
for k_, en, tr in [
    ("personal_best", "Valid lap faster than your previous best in this session.", "Bu oturumdaki en iyi turundan hızlı geçerli tur."),
    ("best_lap_in_race", "Race: your PB is the fastest lap of the race.", "Yarış: rekorun yarışın en hızlı turu."),
    ("best_lap_in_race_for_class", "Multiclass race: your PB is the class-fastest lap.", "Çok sınıflı yarış: rekorun sınıfın en hızlı turu."),
    ("consistent", "Race: last 4 clean laps within 0.25 s (max every 10 min).", "Yarış: son 4 temiz tur 0,25 sn içinde (10 dakikada en çok bir)."),
    ("improving", "Race: 3 consecutive laps each 0.1 s+ faster.", "Yarış: art arda 3 tur her biri 0,1 sn+ hızlanınca."),
    ("worsening", "Race: 3 consecutive laps each 0.2 s+ slower.", "Yarış: art arda 3 tur her biri 0,2 sn+ yavaşlayınca."),
    ("setting_current_race_pace", "Race, every 4 laps: your 3-lap average is the best among the class top 3.", "Yarış, 4 turda bir: 3 tur ortalaman sınıfın ilk üçünden iyi."),
    ("matching_race_pace", "Race pace check: within 0.15 s of the leaders' pace.", "Yarış tempo kontrolü: liderlerin temposuna 0,15 sn yakın."),
    ("pace_good", "Race pace check: 0.15–0.5 s off the leaders.", "Yarış tempo kontrolü: liderlerden 0,15–0,5 sn geride."),
    ("pace_ok", "Race pace check: 0.5–1.0 s off the leaders.", "Yarış tempo kontrolü: liderlerden 0,5–1,0 sn geride."),
    ("pace_bad", "Race pace check: 1–2 s off the leaders.", "Yarış tempo kontrolü: liderlerden 1–2 sn geride."),
    ("off_the_pace", "2 s+ off the leaders' race pace, or 3 s+ off the best in practice/qualifying.", "Yarışta liderlerden 2 sn+ ya da antrenman/sıralamada en iyiden 3 sn+ geride."),
    ("good_lap", "Practice/qualifying: lap within 0.15% of your best (not a PB).", "Antrenman/sıralama: en iyine %0,15 yakın tur (rekor değil)."),
    ("time_intro", "Practice/qualifying: every valid lap, followed by the lap time.", "Antrenman/sıralama: her geçerli turda, ardından tur zamanı."),
    ("quickest_overall", "Practice/qualifying: your PB is the quickest in the session.", "Antrenman/sıralama: rekorun oturumun en hızlısı."),
    ("quickest_in_class", "Multiclass qualifying: quickest in class (when not said as gap to P2).", "Çok sınıflı sıralama: sınıfın en hızlısı."),
    ("fastest_in_your_class", "Multiclass practice: your PB is the class-best.", "Çok sınıflı antrenman: rekorun sınıfın en iyisi."),
    ("quicker_than_second_place", "Qualifying: after your PB puts you P1 – '0.3 seconds quicker than second place'.", "Sıralama: rekorunla P1 olunca – '0,3 saniye ikinciden hızlısın'."),
    ("less_than_a_tenth_off_the_pace", "Practice/qualifying PB less than 0.1 s off the class-best.", "Antrenman/sıralama rekoru sınıfın en iyisinden 0,1 sn'den az geride."),
    ("gap_intro", "Practice/qualifying PB: 'You're 0.4 seconds off the pace' (start).", "Antrenman/sıralama rekoru: '0,4 saniye tempodan geridesin' (baş)."),
    ("gap_outro_off_pace", "…end of the gap sentence.", "…fark cümlesinin sonu."),
    ("need_to_find_one_more_tenth", "PB 0.1–0.2 s off the class-best.", "Rekor sınıfın en iyisinden 0,1–0,2 sn geride."),
    ("need_to_find_a_few_more_tenths", "PB 0.2–0.6 s off the class-best.", "Rekor sınıfın en iyisinden 0,2–0,6 sn geride."),
    ("need_to_find_a_second", "PB 0.6–1.2 s off the class-best.", "Rekor sınıfın en iyisinden 0,6–1,2 sn geride."),
    ("need_to_find_more_than_a_second", "PB 1.2–3 s off the class-best.", "Rekor sınıfın en iyisinden 1,2–3 sn geride."),
]:
    T("lap_times/" + k_, en, tr)

# ---- licence
for l_, en, tr in [("a", "A licence", "A lisans"), ("b", "B licence", "B lisans"), ("c", "C licence", "C lisans"), ("d", "D licence", "D lisans"),
                   ("pro", "Pro licence", "Pro lisans"), ("rookie", "Rookie licence", "Çaylak (R) lisans")]:
    S(f"licence/{l_}_licence", en + ".", tr + ".", "iRacing race: at the end of the 'next car is…' info, the licence class of the car ahead.",
      "iRacing yarışı: 'öndeki araç…' bilgisinin sonunda öndekinin lisans sınıfı.")

# ---- mandatory_pit_stops
MP = {
    "box_in": ("Box in", "Pite gir:"), "box_now": ("Box now, box now!", "Şimdi pite gir, şimdi!"), "box_to_fit_options_now": ("Box now to fit the options.", "Seçenek lastikleri takmak için şimdi pite gir."),
    "box_to_fit_primes_now": ("Box now to fit the primes.", "Ana lastikleri takmak için şimdi pite gir."), "can_now_fit_options": ("You can now fit the options.", "Artık seçenek lastikleri takabilirsin."),
    "can_now_fit_primes": ("You can now fit the primes.", "Artık ana lastikleri takabilirsin."), "cant_change_those": ("We can't change those.", "Onları değiştiremeyiz."),
    "cant_do_that": ("We can't do that.", "Onu yapamayız."), "car_has_too_much_damage": ("The car has too much damage.", "Araçta çok fazla hasar var."),
    "disengage_limiter": ("Disengage the limiter.", "Limiti kapat."), "engage_limiter": ("Limiter, limiter!", "Pit limitini aç!"), "feet": ("feet", "fit"),
    "fifty_metres": ("Fifty metres.", "Elli metre."), "laps_so_far": ("laps so far", "tur şimdiye kadar"), "left_pit_too_soon": ("You left the pit too soon!", "Pitten çok erken çıktın!"),
    "metres": ("metres", "metre"), "min_pitstop_time_intro": ("Minimum pit stop time is", "En kısa pit süresi:"), "minutes": ("minutes", "dakika"),
    "missed_stop": ("You missed the stop!", "Pit durağını kaçırdın!"), "no_fuel_this_time": ("No fuel this time.", "Bu sefer yakıt yok."),
    "no_pit_speed_limit": ("There's no pit speed limit.", "Pit hız sınırı yok."), "no_pit_timings_unreliable_fuel_estimates": ("No pit timings, fuel estimates unreliable.", "Pit süresi yok, yakıt tahminleri güvenilmez."),
    "no_pit_timings_unreliable_position_estimates": ("No pit timings, position estimates unreliable.", "Pit süresi yok, sıra tahminleri güvenilmez."),
    "no_tyres_or_fuel": ("No tyres or fuel.", "Lastik de yakıt da yok."), "no_tyres_this_time": ("No tyres this time.", "Bu sefer lastik yok."),
    "one_hundred_feet": ("One hundred feet.", "Yüz fit."), "one_hundred_metres": ("One hundred metres.", "Yüz metre."), "option_tyres": ("option tyres", "seçenek lastikler"),
    "pit_crew_ready": ("Pit crew is ready.", "Pit ekibi hazır."), "pit_now": ("Pit now.", "Şimdi pite gir."), "pit_request_cancelled": ("Pit request cancelled.", "Pit talebi iptal edildi."),
    "pit_speed_limit": ("Pit speed limit is", "Pit hız sınırı"), "pit_stall_available": ("Pit stall is available.", "Pit kutusu boş."),
    "pit_stall_occupied": ("Pit stall is occupied.", "Pit kutusu dolu."), "pit_stop_already_requested": ("Pit stop already requested.", "Pit zaten istendi."),
    "pit_stop_not_requested": ("Pit stop not requested.", "Pit istenmedi."), "pit_stop_requested": ("Pit stop requested.", "Pit istendi."),
    "pit_this_lap": ("Pit this lap.", "Bu tur pite gir."), "pit_this_lap_too_late": ("Too late to pit this lap.", "Bu tur pit için çok geç."),
    "pit_window_closed": ("Pit window is closed.", "Pit penceresi kapandı."), "pit_window_closes_1_min": ("Pit window closes in one minute.", "Pit penceresi bir dakika sonra kapanıyor."),
    "pit_window_closes_2_min": ("Pit window closes in two minutes.", "Pit penceresi iki dakika sonra kapanıyor."), "pit_window_closing": ("Pit window is closing.", "Pit penceresi kapanıyor."),
    "pit_window_open": ("Pit window is open.", "Pit penceresi açık."), "pit_window_opening": ("Pit window is opening.", "Pit penceresi açılıyor."),
    "pit_window_opens_1_min": ("Pit window opens in one minute.", "Pit penceresi bir dakika sonra açılıyor."), "pit_window_opens_2_min": ("Pit window opens in two minutes.", "Pit penceresi iki dakika sonra açılıyor."),
    "pit_window_opens_after": ("Pit window opens after", "Pit penceresi şu süreden sonra açılıyor:"), "pit_window_opens_on_lap": ("Pit window opens on lap", "Pit penceresi şu turda açılıyor:"),
    "prime_tyres": ("prime tyres", "ana lastikler"), "stop_complete_go": ("Stop complete, go go go!", "Durak tamam, git git git!"), "theyve_done": ("They've done", "Yaptıkları:"),
    "three_hundred_feet": ("Three hundred feet.", "Üç yüz fit."), "wait": ("Wait…", "Bekle…"), "wait_5_seconds": ("Wait five seconds.", "Beş saniye bekle."),
    "wait_intro": ("Wait for", "Şunu bekle:"), "watch_your_pit_speed": ("Watch your pit speed!", "Pit hızına dikkat!"), "watch_your_speed": ("Watch your speed!", "Hızına dikkat!"),
    "will_be_serving_penalty": ("We'll be serving the penalty.", "Cezayı çekeceğiz."), "will_change_all_four_tyre_and_refuel": ("We'll change all four tyres and refuel.", "Dört lastiği değiştirip yakıt alacağız."),
    "will_change_all_four_tyre_no_fuel": ("Four tyres, no fuel.", "Dört lastik, yakıt yok."), "will_change_all_four_tyres": ("We'll change all four tyres.", "Dört lastiği değiştireceğiz."),
    "will_change_front_tyres_only": ("Fronts only.", "Sadece ön lastikler."), "will_change_rear_tyres_only": ("Rears only.", "Sadece arka lastikler."),
    "will_fix_front_aero": ("We'll fix the front aero.", "Ön aerodinamiği onaracağız."), "will_fix_front_and_leave_rear_aero": ("Fix the front aero, leave the rear.", "Ön aerodinamiği onar, arkayı bırak."),
    "will_fix_front_and_rear_aero": ("We'll fix front and rear aero.", "Ön ve arka aerodinamiği onaracağız."), "will_fix_rear_aero": ("We'll fix the rear aero.", "Arka aerodinamiği onaracağız."),
    "will_fix_rear_and_leave_front_aero": ("Fix the rear aero, leave the front.", "Arka aerodinamiği onar, önü bırak."), "will_fix_suspension": ("We'll fix the suspension.", "Süspansiyonu onaracağız."),
    "will_leave_suspension": ("We'll leave the suspension.", "Süspansiyona dokunmayacağız."), "will_not_be_serving_penalty": ("We won't be serving the penalty.", "Cezayı çekmeyeceğiz."),
    "will_put_fuel_in": ("We'll put fuel in.", "Yakıt koyacağız."), "will_put_fuel_in_no_tyres": ("Fuel only, no tyres.", "Sadece yakıt, lastik yok."),
    "yes_stop_after": ("Yes, stop after", "Evet, şundan sonra dur:"), "yes_stop_on_lap": ("Yes, stop on lap", "Evet, şu turda dur:"),
}
for k_, (en, tr) in MP.items():
    S("mandatory_pit_stops/" + k_, en, tr)
CONFIRM_TR = {
    "alternate_tyres": "alternatif lastikler", "change_all_tyres": "dört lastik değişecek", "change_front_left_only": "sadece sol ön değişecek",
    "change_front_right_only": "sadece sağ ön değişecek", "change_front_tyres": "ön lastikler değişecek", "change_left_side_tyres": "sol taraf lastikleri değişecek",
    "change_no_tyres": "lastik değişmeyecek", "change_rear_left_only": "sadece sol arka değişecek", "change_rear_right_only": "sadece sağ arka değişecek",
    "change_rear_tyres": "arka lastikler değişecek", "change_right_side_tyres": "sağ taraf lastikleri değişecek", "change_tyres": "lastikler değişecek",
    "dont_fix_aero": "aerodinamik onarılmayacak", "dont_fix_suspension": "süspansiyon onarılmayacak", "dry_tyres": "kuru lastikler",
    "fit_tyre_set_intro": "şu lastik seti takılacak:", "fix_all": "her şey onarılacak", "fix_all_aero": "tüm aerodinamik onarılacak", "fix_body": "kaporta onarılacak",
    "fix_front_aero": "ön aerodinamik onarılacak", "fix_nothing": "hiçbir şey onarılmayacak", "fix_rear_aero": "arka aerodinamik onarılacak",
    "fix_suspension": "süspansiyon onarılacak", "hard_tyres": "sert lastikler", "hypersoft_tyres": "hiper yumuşak lastikler", "intermediate_tyres": "ara lastikler",
    "medium_tyres": "orta lastikler", "monsoon_tyres": "muson (aşırı yağmur) lastikleri", "next_tyre_compound": "bir sonraki hamur", "no_refuelling": "yakıt alınmayacak",
    "option_tyres": "seçenek lastikler", "prime_tyres": "ana lastikler", "refuelling": "yakıt alınacak", "requested_tyre_not_available": "istenen lastik yok",
    "soft_tyres": "yumuşak lastikler", "supersoft_tyres": "süper yumuşak lastikler", "ultrasoft_tyres": "ultra yumuşak lastikler", "wet_tyres": "yağmur lastikleri",
}
for key in keys:
    if key.startswith("mandatory_pit_stops/confirm_"):
        what = key.split("confirm_", 1)[1]
        w = what.replace("_", " ").replace("dont", "don't")
        S(key, f"Confirmed: {w}.", f"Tamam, {CONFIRM_TR.get(what, w)}.")
for k_, en, tr in [
    ("engage_limiter", "Entering pit road above the limit with the limiter off.", "Limit kapalıyken sınırın üstünde pit yoluna girince."),
    ("disengage_limiter", "2 s after leaving pit road the limiter is still on.", "Pit yolundan çıktıktan 2 sn sonra limit hâlâ açıksa."),
    ("pit_speed_limit", "First pit entry in practice/qualifying: 'Pit speed limit is 60 km/h'.", "Antrenman/sıralamada ilk pit girişinde: 'Pit hız sınırı 60 km'."),
    ("watch_your_pit_speed", "Over the pit speed limit for 0.7 s+ (limiter off).", "Limit kapalıyken 0,7 sn+ pit hız sınırını aşınca."),
    ("watch_your_speed", "Alternative pit-speeding warning.", "Pit hız aşımı için alternatif."),
    ("pit_window_open", "Race: fuel pit window opens (lap reached).", "Yarış: yakıt pit penceresi açılınca (tura gelince)."),
    ("pit_window_closing", "Race: one lap before the fuel window closes.", "Yarış: yakıt penceresi kapanmadan bir tur önce."),
    ("pit_window_opens_2_min", "Timed race: fuel window opens in 2 minutes.", "Süreli yarış: yakıt penceresi 2 dk sonra açılıyor."),
    ("pit_window_opens_1_min", "Timed race: fuel window opens in 1 minute.", "Süreli yarış: yakıt penceresi 1 dk sonra açılıyor."),
    ("pit_window_closes_2_min", "Timed race: fuel window closes in 2 minutes.", "Süreli yarış: yakıt penceresi 2 dk sonra kapanıyor."),
    ("pit_window_closes_1_min", "Timed race: fuel window closes in 1 minute.", "Süreli yarış: yakıt penceresi 1 dk sonra kapanıyor."),
    ("pit_this_lap", "At the line, 1–2 laps of fuel left and it won't make the finish.", "Çizgide 1–2 turluk yakıt kaldı ve bitişe yetmiyorsa."),
    ("box_now", "Last 20% of the lap with < 1.25 laps of fuel and it won't make the finish.", "Turun son %20'sinde < 1,25 turluk yakıt varsa ve bitişe yetmiyorsa."),
]:
    T("mandatory_pit_stops/" + k_, en, tr)

# ---- multiclass
CLS = {"carrera_cup": "Carrera Cup", "dtm": "DTM", "group4": "Group 4", "group5": "Group 5", "group6": "Group 6", "groupa": "Group A", "groupb": "Group B",
       "groupc": "Group C", "gt1": "GT1", "gt2": "GT2", "gt3": "GT3", "gt300": "GT300", "gt4": "GT4", "gt5": "GT5", "gt500": "GT500", "gtc": "GTC", "gte": "GTE",
       "gtlm": "GTLM", "gto": "GTO", "gtp": "GTP", "lmdh": "LMDh", "lmp1": "LMP1", "lmp2": "LMP2", "lmp3": "LMP3", "mustang": "Mustang", "tc1": "TC1", "tc2": "TC2"}
for c_, name in CLS.items():
    S(f"multiclass/{c_}", name, name, "After 'you are being caught by the / you are catching the' when the other class has no '_runners' phrase, followed by 'runners'.",
      "'… yetişiyor / … yetişiyoruz' cümlesinde sınıfın '_runners' ifadesi yoksa, ardından 'runners'.")
    if f"multiclass/{c_}_runners" in tree:
        S(f"multiclass/{c_}_runners", f"the {name} runners", f"{name} araçları",
          "Multiclass: 'You're being caught by the / You're catching the' + this class (40% of single-class traffic calls).",
          "Çok sınıf: '… araçları yetişiyor / … araçlarına yetişiyoruz' (tek sınıflı trafik uyarılarının %40'ı).")
MC = {
    "faster_car_behind": ("Faster car behind.", "Arkadan daha hızlı sınıf araç geliyor."),
    "faster_car_behind_is_class_leader": ("Faster car behind, it's their class leader.", "Arkadan hızlı sınıf geliyor, sınıf lideri."),
    "faster_car_behind_racing_player": ("Faster car behind, he's racing for position.", "Arkadan hızlı sınıf geliyor, sıra mücadelesinde."),
    "faster_car_behind_racing_player_is_class_leader": ("Faster class leader behind, racing for position.", "Arkadan hızlı sınıf lideri geliyor, sıra mücadelesinde."),
    "faster_cars_behind": ("Faster cars behind.", "Arkadan hızlı sınıf araçlar geliyor."), "faster_cars_behind_fighting": ("Faster cars behind, and they're fighting.", "Arkadan hızlı araçlar geliyor, kendi aralarında savaşıyorlar."),
    "faster_cars_behind_inc_class_leader": ("Faster cars behind, including their class leader.", "Arkadan hızlı araçlar geliyor, sınıf lideri de aralarında."),
    "faster_cars_fighting_behind_inc_class_leader": ("Faster cars fighting behind, including their class leader.", "Arkada savaşan hızlı araçlar var, sınıf lideri de aralarında."),
    "it_is_a_faster_class": ("It's a faster class.", "Daha hızlı sınıftan."), "it_is_a_slower_class": ("It's a slower class.", "Daha yavaş sınıftan."),
    "runners": ("runners", "araçları"), "same_class_as_us": ("Same class as us.", "Bizim sınıftan."),
    "slower_car_ahead": ("Slower car ahead.", "Önde yavaş sınıf araç."), "slower_car_ahead_is_class_leader": ("Slower car ahead, it's their class leader.", "Önde yavaş sınıf araç, sınıf lideri."),
    "slower_car_ahead_racing_player": ("Slower car ahead, he's racing for position.", "Önde yavaş sınıf araç, sıra mücadelesinde."),
    "slower_car_ahead_racing_player_is_class_leader": ("Slower class leader ahead, racing for position.", "Önde yavaş sınıf lideri, sıra mücadelesinde."),
    "slower_cars_ahead": ("Slower cars ahead.", "Önde yavaş sınıf araçlar."), "slower_cars_ahead_fighting": ("Slower cars ahead, and they're fighting.", "Önde yavaş araçlar, kendi aralarında savaşıyorlar."),
    "slower_cars_ahead_inc_class_leader": ("Slower cars ahead, including their class leader.", "Önde yavaş araçlar, sınıf lideri de aralarında."),
    "slower_cars_fighting_ahead_inc_class_leader": ("Slower cars fighting ahead, including their class leader.", "Önde savaşan yavaş araçlar, sınıf lideri de aralarında."),
    "you_are_being_caught_by_the": ("You're being caught by the", "Arkadan yetişiyorlar:"), "you_are_being_caught_by_the_faster_cars": ("You're being caught by the faster cars.", "Hızlı sınıf araçlar arkadan yetişiyor."),
    "you_are_catching_the": ("You're catching the", "Yetişiyoruz:"), "you_are_catching_the_slower_cars": ("You're catching the slower cars.", "Yavaş sınıf araçlara yetişiyoruz."),
}
for k_, (en, tr) in MC.items():
    S("multiclass/" + k_, en, tr)
for k_, en, tr in [
    ("faster_car_behind", "A faster-class car closes within 4 s behind on track.", "Daha hızlı sınıftan bir araç pistte 4 sn arkamıza girince."),
    ("faster_car_behind_is_class_leader", "…and it's that class's leader.", "…ve o sınıfın lideriyse."),
    ("faster_cars_behind", "2+ faster-class cars within 4 s behind.", "4 sn arkada 2+ hızlı sınıf araç."),
    ("faster_cars_behind_fighting", "2+ faster cars behind within 1 s of each other.", "Arkadaki 2+ hızlı araç birbirine 1 sn yakın."),
    ("faster_cars_behind_inc_class_leader", "2+ faster cars behind, one is their class leader.", "Arkadaki 2+ hızlı araçtan biri sınıf lideri."),
    ("faster_cars_fighting_behind_inc_class_leader", "Faster cars fighting behind, incl. class leader.", "Arkada savaşan hızlı araçlar, sınıf lideri dahil."),
    ("slower_car_ahead", "We close within 4 s of a slower-class car ahead.", "Önümüzde 4 sn içinde yavaş sınıf araç."),
    ("slower_car_ahead_is_class_leader", "…and it's that class's leader.", "…ve o sınıfın lideriyse."),
    ("slower_cars_ahead", "2+ slower-class cars within 4 s ahead.", "4 sn önde 2+ yavaş sınıf araç."),
    ("slower_cars_ahead_fighting", "2+ slower cars ahead within 1 s of each other.", "Öndeki 2+ yavaş araç birbirine 1 sn yakın."),
    ("slower_cars_ahead_inc_class_leader", "2+ slower cars ahead, one is their class leader.", "Öndeki 2+ yavaş araçtan biri sınıf lideri."),
    ("slower_cars_fighting_ahead_inc_class_leader", "Slower cars fighting ahead, incl. class leader.", "Önde savaşan yavaş araçlar, sınıf lideri dahil."),
    ("you_are_being_caught_by_the", "Alternative faster-car call with the class name.", "Sınıf adıyla alternatif hızlı araç uyarısı."),
    ("you_are_catching_the", "Alternative slower-car call with the class name.", "Sınıf adıyla alternatif yavaş araç uyarısı."),
    ("you_are_being_caught_by_the_faster_cars", "Alternative faster-cars call when the class is unknown.", "Sınıf bilinmiyorsa alternatif hızlı araç uyarısı."),
    ("you_are_catching_the_slower_cars", "Alternative slower-cars call when the class is unknown.", "Sınıf bilinmiyorsa alternatif yavaş araç uyarısı."),
    ("runners", "After a class name without its own '_runners' phrase.", "Kendi '_runners' ifadesi olmayan sınıf adından sonra."),
    ("it_is_a_faster_class", "Multiclass: right after the spotter calls a car alongside, if it's a faster class.", "Çok sınıf: spotter yanımızda araç deyince, araç daha hızlı sınıftansa."),
    ("it_is_a_slower_class", "…if the car alongside is a slower class.", "…yanımızdaki araç daha yavaş sınıftansa."),
    ("same_class_as_us", "…if the car alongside is our class.", "…yanımızdaki araç bizim sınıftansa."),
]:
    T("multiclass/" + k_, en, tr)

# ---- opponents
OP = {
    "ahead_is_pitting": ("The car ahead is pitting.", "Öndeki pite giriyor."), "behind_is_pitting": ("The car behind is pitting.", "Arkadaki pite giriyor."),
    "cant_pronounce_name": ("I can't pronounce his name.", "Adını söyleyemiyorum."), "car_exiting_pits_be_careful": ("Car exiting the pits, be careful.", "Pitten araç çıkıyor, dikkat."),
    "car_number": ("car number", "numarası"), "has_just_been_disqualified": ("has just been disqualified.", "diskalifiye edildi."),
    "has_just_retired": ("has just retired.", "yarışı bıraktı."), "is_now_leading": ("is now leading.", "artık lider."), "is_now_on": ("is now on", "artık şu lastikte:"),
    "is_pitting": ("is pitting.", "pite giriyor."), "new_fastest_lap_for": ("New fastest lap for", "En hızlı tur:"), "next_car_is": ("The next car is", "Öndeki araç:"),
    "one_lap_ahead": ("one lap ahead", "bir tur önde"), "one_lap_behind": ("one lap behind", "bir tur geride"), "rating_intro": ("rated", "reytingi"),
    "reputation_intro": ("reputation", "itibarı"), "slow_car_ahead": ("Slow car ahead.", "Önde yavaş araç."),
    "the_car_ahead_has_just_done_a": ("The car ahead has just done a", "Öndeki araç az önce şu turu attı:"), "the_car_ahead_is_now_on": ("The car ahead is now on", "Öndeki araç artık şu lastikte:"),
    "the_car_ahead_is_pitting": ("The car ahead is pitting.", "Öndeki araç pite giriyor."), "the_car_behind_has_just_done_a": ("The car behind has just done a", "Arkadaki araç az önce şu turu attı:"),
    "the_car_behind_is_now_on": ("The car behind is now on", "Arkadaki araç artık şu lastikte:"), "the_car_behind_is_pitting": ("The car behind is pitting.", "Arkadaki araç pite giriyor."),
    "the_leader": ("the leader", "lider"), "the_leader_has_just_done_a": ("The leader has just done a", "Lider az önce şu turu attı:"),
    "the_leader_is_now_on": ("The leader is now on", "Lider artık şu lastikte:"), "the_leader_is_pitting": ("The leader is pitting.", "Lider pite giriyor."), "we_are": ("We are", "Biz"),
}
for k_, (en, tr) in OP.items():
    S("opponents/" + k_, en, tr)
for k_, en, tr in [
    ("the_leader_is_pitting", "Race: class leader enters pit road (not us).", "Yarış: sınıf lideri pit yoluna girince (biz değilsek)."),
    ("the_car_ahead_is_pitting", "Race: the car directly ahead in class enters the pits.", "Yarış: sınıfta hemen öndeki araç pite girince."),
    ("ahead_is_pitting", "Alternative for 'the car ahead is pitting'.", "'Öndeki pite giriyor' alternatifi."),
    ("the_car_behind_is_pitting", "Race: the car directly behind in class enters the pits.", "Yarış: sınıfta hemen arkadaki araç pite girince."),
    ("behind_is_pitting", "Alternative for 'the car behind is pitting'.", "'Arkadaki pite giriyor' alternatifi."),
    ("the_leader_is_now_on", "Leader leaves the pits on a different tyre type (dry↔wet), followed by 'slicks'/'wets'.", "Lider pitten farklı lastikle (kuru↔yağmur) çıkınca, ardından 'slick'/'yağmur'."),
    ("the_car_ahead_is_now_on", "Car ahead leaves the pits on a different tyre type.", "Öndeki araç pitten farklı lastikle çıkınca."),
    ("the_car_behind_is_now_on", "Car behind leaves the pits on a different tyre type.", "Arkadaki araç pitten farklı lastikle çıkınca."),
    ("car_exiting_pits_be_careful", "A car leaves pit lane right next to us (−2.5…+1.5 s).", "Bir araç pitten tam yanımızda çıkınca (−2,5…+1,5 sn)."),
    ("the_leader_has_just_done_a", "Race: the leader sets a new class-fastest lap, followed by the time.", "Yarış: lider sınıfın en hızlı turunu atınca, ardından süre."),
    ("the_car_ahead_has_just_done_a", "Race: the car ahead sets a new class-fastest lap.", "Yarış: öndeki araç sınıfın en hızlı turunu atınca."),
    ("the_car_behind_has_just_done_a", "Race: the car behind sets a new class-fastest lap.", "Yarış: arkadaki araç sınıfın en hızlı turunu atınca."),
    ("next_car_is", "Race: when we get within 2.5 s of a new car ahead – 'The next car is car number 23, rated 2400, A licence'.",
     "Yarış: önümüzdeki yeni araca 2,5 sn yaklaşınca – 'Öndeki araç: 23 numara, reytingi 2400, A lisans'."),
    ("car_number", "Part of the 'next car is' info.", "'Öndeki araç' bilgisinin parçası."),
    ("rating_intro", "iRacing: before the iRating of the car ahead.", "iRacing: öndeki aracın iRating'inden önce."),
]:
    T("opponents/" + k_, en, tr)

# ---- overtaking_aids
for k_, en, tr in [("a_few_tenths_off_drs_range", "A few tenths off DRS range.", "DRS mesafesine birkaç onda bir var."),
                   ("a_second_off_drs_range", "A second off DRS range.", "DRS mesafesine bir saniye var."),
                   ("activations_remaining", "activations remaining", "kullanım hakkı kaldı"), ("dont_forget_drs", "Don't forget DRS.", "DRS'i unutma."),
                   ("drs_activations_remaining", "DRS activations remaining", "DRS hakkı kaldı"), ("drs_disabled", "DRS disabled.", "DRS kapalı."),
                   ("drs_enabled", "DRS enabled.", "DRS açık."), ("five_ptp_activations_remaining", "Five push-to-pass left.", "Beş push-to-pass hakkı kaldı."),
                   ("guy_behind_has_drs", "The guy behind has DRS.", "Arkadakinin DRS'i var."), ("no_activations_remaining", "No activations left.", "Hiç hak kalmadı."),
                   ("no_drs_activations_remaining", "No DRS left.", "DRS hakkı kalmadı."), ("one_activation_remaining", "One activation left.", "Bir hak kaldı."),
                   ("push_to_pass_now_available", "Push-to-pass available.", "Push-to-pass kullanılabilir."), ("remember_to_use_kers", "Remember to use KERS.", "KERS'i kullanmayı unutma."),
                   ("remember_to_use_ptp", "Remember to use push-to-pass.", "Push-to-pass'i kullanmayı unutma."),
                   ("ten_ptp_activations_remaining", "Ten push-to-pass left.", "On push-to-pass hakkı kaldı."),
                   ("three_ptp_activations_remaining", "Three push-to-pass left.", "Üç push-to-pass hakkı kaldı.")]:
    S("overtaking_aids/" + k_, en, tr)

# ---- pace_notes
for k_, en, tr in [("playback_ended", "Pace notes playback ended.", "Pace not oynatma bitti."), ("playback_started", "Pace notes playback started.", "Pace not oynatma başladı."),
                   ("recording_ended", "Pace notes recording ended.", "Pace not kaydı bitti."), ("recording_started", "Pace notes recording started.", "Pace not kaydı başladı.")]:
    S("pace_notes/" + k_, en, tr)

# ---- pearls / rants
S("pearls_of_wisdom/keep_it_up", "Keep it up!", "Böyle devam!", "Race: sometimes (25%, max every 6 min) after a personal best.", "Yarış: kişisel rekordan sonra bazen (%25, 6 dakikada en çok bir).")
S("pearls_of_wisdom/must_do_better", "Come on, we need to do better.", "Hadi, daha iyisini yapmalıyız.", "Race: sometimes (30%) after 'lap times getting worse'.", "Yarış: 'tur zamanların kötüleşiyor'dan sonra bazen (%30).")
S("pearls_of_wisdom/neutral", "Just keep doing what you're doing.", "Aynen böyle sür.", "Race: sometimes (20%) after 'consistent'.", "Yarış: 'istikrarlısın'dan sonra bazen (%20).")
S("rants/general", "(an angry rant)", "(öfkeli bir söylenme)", "Only with 'Slang phrases' on: sometimes after a big crash, or losing 2+ places right after a crash (max every 10 min).",
  "Sadece 'Argo ifadeler' açıkken: sert kazadan sonra bazen ya da kazadan hemen sonra 2+ sıra kaybedince (10 dakikada en çok bir).")

# ---- penalties
PE = {
    "blue_move_now_or_be_penalized": ("Blue flag, move over now or you'll be penalised!", "Mavi bayrak, hemen yol ver yoksa ceza alırsın!"),
    "car_to_car_collision": ("Car-to-car collision.", "Araçlar arası temas."), "cut_track_in_prac_or_qual": ("You cut the track, that lap won't count.", "Pisti kestin, bu tur sayılmayacak."),
    "cut_track_in_prac_or_qual_next_invalid": ("You cut the track, the next lap will be invalid too.", "Pisti kestin, sonraki tur da geçersiz olacak."),
    "cut_track_in_race": ("Watch the track limits!", "Pist sınırlarına dikkat!"),
    "cut_track_prac_or_qual_1": ("Track limits again.", "Yine pist sınırı."), "cut_track_prac_or_qual_2": ("That's another track limit.", "Bir pist sınırı ihlali daha."),
    "cut_track_prac_or_qual_3": ("Stay on the track!", "Pistte kal!"), "cut_track_prac_or_qual_4": ("Seriously, stay on the track!", "Ciddiyim, pistte kal!"),
    "cut_track_race_1": ("Track limits again, careful.", "Yine pist sınırı, dikkat."), "cut_track_race_2": ("Another track limits warning.", "Bir pist sınırı uyarısı daha."),
    "cut_track_race_3": ("Keep it on the track or we'll get a penalty!", "Pistte kal, yoksa ceza alacağız!"), "cut_track_race_4": ("That's way too many cuts!", "Çok fazla pist kesme oldu!"),
    "disqualified_driving_without_headlights": ("Disqualified for driving without headlights.", "Farsız sürmekten diskalifiye."),
    "disqualified_exceeded_allowed_lap_count": ("Disqualified for exceeding the allowed laps.", "İzin verilen tur sayısını aştığın için diskalifiye."),
    "disqualified_ignored_drive_through": ("Disqualified for ignoring the drive-through.", "Drive-through cezasını çekmediğin için diskalifiye."),
    "disqualified_ignored_stop_and_go": ("Disqualified for ignoring the stop-go.", "Stop-go cezasını çekmediğin için diskalifiye."),
    "disqualified_no_headlights": ("Disqualified, no headlights.", "Diskalifiye, farlar kapalı."), "drive_through_cutting_track": ("Drive-through for cutting the track.", "Pist kesmekten drive-through cezası."),
    "drive_through_exceeding_single_stint_time": ("Drive-through for exceeding the stint time.", "Stint süresini aşmaktan drive-through."),
    "drive_through_false_start": ("Drive-through for a jump start.", "Erken kalkıştan drive-through."), "drive_through_ignored_blue": ("Drive-through for ignoring blue flags.", "Mavi bayrağa uymamaktan drive-through."),
    "drive_through_overtaking_on_formation_lap": ("Drive-through for overtaking on the formation lap.", "Formasyon turunda sollamaktan drive-through."),
    "drive_through_overtaking_under_pace_car": ("Drive-through for passing under the pace car.", "Pace car altında sollamaktan drive-through."),
    "drive_through_overtaking_under_safety_car": ("Drive-through for passing under the safety car.", "Güvenlik aracı altında sollamaktan drive-through."),
    "drive_through_overtaking_under_yellow": ("Drive-through for passing under yellow.", "Sarıda sollamaktan drive-through."),
    "drive_through_speeding_in_pit_lane": ("Drive-through for speeding in the pit lane.", "Pit yolunda hız aşımından drive-through."),
    "lap_deleted": ("That lap's been deleted.", "O tur silindi."), "meatball_flag": ("Meatball flag, we need to pit for repairs.", "Hasar bayrağı (turuncu top), onarım için pite girmeliyiz."),
    "new_penalty_black_flag": ("We've been black flagged!", "Siyah bayrak cezası aldık!"), "new_penalty_drivethrough": ("We've got a drive-through.", "Drive-through cezası aldık."),
    "new_penalty_slowdown": ("We've got a slow-down penalty.", "Yavaşlama cezası aldık."), "new_penalty_stopgo": ("We've got a stop-go.", "Stop-go cezası aldık."),
    "one_lap_to_serve_drive_through": ("One lap to serve the drive-through.", "Drive-through'u çekmek için bir tur."),
    "one_lap_to_serve_stop_go": ("One lap to serve the stop-go.", "Stop-go'yu çekmek için bir tur."),
    "one_more_collision_before_kick": ("One more collision and you're out.", "Bir temas daha olursa diskalifiye olursun."),
    "one_more_off_track_before_kick": ("One more off-track and you're out.", "Bir kez daha pistten çıkarsan diskalifiye olursun."),
    "penalty_disqualified": ("We've been disqualified.", "Diskalifiye edildik."), "penalty_not_served": ("Penalty not served.", "Ceza çekilmedi."),
    "penalty_one_lap_left_drivethrough": ("One lap left to serve the drive-through.", "Drive-through için bir tur kaldı."),
    "penalty_one_lap_left_stopgo": ("One lap left to serve the stop-go.", "Stop-go için bir tur kaldı."), "penalty_one_lap_left_to_pit": ("One lap left to pit for the penalty.", "Ceza için pite girmeye bir tur kaldı."),
    "penalty_served": ("Penalty served.", "Ceza çekildi."), "penalty_three_laps_left": ("Three laps left to serve the penalty.", "Cezayı çekmek için üç tur kaldı."),
    "penalty_two_laps_left": ("Two laps left to serve the penalty.", "Cezayı çekmek için iki tur kaldı."), "pit_now_drive_through": ("Pit now for the drive-through.", "Drive-through için şimdi pite gir."),
    "pit_now_stop_go": ("Pit now for the stop-go.", "Stop-go için şimdi pite gir."), "points_will_be_awarded_this_lap": ("Points will be awarded this lap.", "Bu tur puan verilecek."),
    "possible_track_limits_warning": ("Careful, that could be a track limits warning.", "Dikkat, bu bir pist sınırı uyarısı olabilir."),
    "slow_down_penalty_clear": ("Slow-down penalty cleared.", "Yavaşlama cezası tamamlandı."), "slow_down_penalty_cutting_track": ("Slow-down penalty for cutting the track.", "Pist kesmekten yavaşlama cezası."),
    "still_have_to_serve_drive_through": ("You still have to serve the drive-through.", "Drive-through'u hâlâ çekmen gerekiyor."),
    "still_have_to_serve_stop_go": ("You still have to serve the stop-go.", "Stop-go'yu hâlâ çekmen gerekiyor."),
    "stop_go_exceeding_single_stint_time": ("Stop-go for exceeding the stint time.", "Stint süresini aşmaktan stop-go."), "stop_go_exitting_pits_on_red": ("Stop-go for leaving the pits on red.", "Kırmızıda pitten çıkmaktan stop-go."),
    "stop_go_penalty_cutting_track": ("Stop-go for cutting the track.", "Pist kesmekten stop-go."), "stop_go_penalty_false_start": ("Stop-go for a jump start.", "Erken kalkıştan stop-go."),
    "stop_go_penalty_overtaking_on_formation_lap": ("Stop-go for overtaking on the formation lap.", "Formasyon turunda sollamaktan stop-go."),
    "stop_go_penalty_overtaking_under_pace_car": ("Stop-go for passing under the pace car.", "Pace car altında sollamaktan stop-go."),
    "stop_go_penalty_overtaking_under_safety_car": ("Stop-go for passing under the safety car.", "Güvenlik aracı altında sollamaktan stop-go."),
    "stop_go_penalty_overtaking_under_yellow": ("Stop-go for passing under yellow.", "Sarıda sollamaktan stop-go."),
    "stop_go_penalty_speeding_in_pit_lane": ("Stop-go for speeding in the pit lane.", "Pit yolunda hız aşımından stop-go."),
    "time_penalty": ("We've got a time penalty.", "Zaman cezası aldık."), "too_many_car_to_car_collisions": ("Too many collisions.", "Çok fazla temas."),
    "vsc_violation_penalty": ("Penalty for a VSC violation.", "Sanal güvenlik aracı ihlali cezası."), "warning_driving_too_slow": ("Warning, you're driving too slowly.", "Uyarı, çok yavaş gidiyorsun."),
    "warning_enter_pits_to_avoid_exceeding_laps": ("Enter the pits to avoid exceeding the lap limit.", "Tur sınırını aşmamak için pite gir."),
    "warning_enter_pits_to_serve_penalty": ("Enter the pits to serve your penalty.", "Cezanı çekmek için pite gir."), "warning_headlights_required": ("Headlights required!", "Farlarını aç!"),
    "warning_headlights_required_when_raining": ("Headlights required in the rain!", "Yağmurda farlar açık olmalı!"),
    "warning_unsportsmanlike_driving": ("Warning for unsportsmanlike driving.", "Sportmenlik dışı sürüş uyarısı."), "warning_wrong_way": ("You're going the wrong way!", "Ters yöne gidiyorsun!"),
    "you_dont_have_a_penalty": ("You don't have a penalty.", "Cezan yok."), "you_have_a_penalty": ("You have a penalty.", "Cezan var."), "you_still_have_a_penalty": ("You still have a penalty.", "Hâlâ cezan var."),
}
for k_, (en, tr) in PE.items():
    S("penalties/" + k_, en, tr)
for k_, en, tr in [
    ("blue_move_now_or_be_penalized", "Blue flag shown for more than 15 s (max every 40 s).", "Mavi bayrak 15 sn'den uzun sürünce (40 sn'de en çok bir)."),
    ("cut_track_in_race", "Race: first track-limit warning (iRacing 'furled' flag or lap invalidated by the sim).", "Yarış: ilk pist sınırı uyarısı (iRacing 'furled' bayrağı ya da simin turu geçersiz sayması)."),
    ("cut_track_race_1", "Race: 2nd track-limit warning.", "Yarış: 2. pist sınırı uyarısı."), ("cut_track_race_2", "Race: 3rd warning.", "Yarış: 3. uyarı."),
    ("cut_track_race_3", "Race: 4th warning.", "Yarış: 4. uyarı."), ("cut_track_race_4", "Race: 5th+ warning.", "Yarış: 5. ve sonraki uyarılar."),
    ("cut_track_in_prac_or_qual", "Practice/qualifying: first lap invalidation / track-limit warning.", "Antrenman/sıralama: ilk tur iptali / pist sınırı uyarısı."),
    ("lap_deleted", "Alternative for the first practice/qualifying cut.", "Antrenman/sıralamadaki ilk kesmenin alternatifi."),
    ("cut_track_prac_or_qual_1", "Practice/qualifying: 2nd cut.", "Antrenman/sıralama: 2. kesme."), ("cut_track_prac_or_qual_2", "3rd cut.", "3. kesme."),
    ("cut_track_prac_or_qual_3", "4th cut.", "4. kesme."), ("cut_track_prac_or_qual_4", "5th+ cut.", "5. ve sonraki kesmeler."),
    ("meatball_flag", "Meatball (repair) flag shown to you.", "Sana hasar (turuncu top) bayrağı gösterilince."),
    ("new_penalty_black_flag", "Black flag (alternative line).", "Siyah bayrak (alternatif cümle)."),
    ("penalty_served", "Black flag cleared (served).", "Siyah bayrak kalkınca (ceza çekildi)."),
    ("penalty_disqualified", "Disqualification flag shown to you.", "Sana diskalifiye bayrağı gösterilince."),
    ("you_still_have_a_penalty", "Black flag still out when you cross the line (max 3 times).", "Çizgiden geçerken siyah bayrak sürüyorsa (en çok 3 kez)."),
    ("warning_enter_pits_to_serve_penalty", "Alternative black-flag reminder.", "Siyah bayrak hatırlatmasının alternatifi."),
    ("warning_wrong_way", "Driving backwards around the track for 2 s+.", "2 sn'den uzun pistte ters yöne gidince."),
    ("possible_track_limits_warning", "iRacing race: your incident count goes up by 1x (off-track), max every 90 s.", "iRacing yarışı: olay puanın 1x artınca (pist dışı), 90 sn'de en çok bir."),
    ("one_more_collision_before_kick", "iRacing: incidents within 4 of the incident limit.", "iRacing: olay puanın sınıra 4 kala."),
]:
    T("penalties/" + k_, en, tr)

# ---- position
PO = {
    "ahead": ("ahead", "önde"), "bad_start": ("Bad start.", "Kötü start."), "behind": ("behind", "geride"), "being_overtaken": ("He's got you.", "Seni geçti."),
    "consistently_last": ("We're stuck at the back.", "Sürekli sondayız."), "expected_position_current_position_intro": ("We're currently in", "Şu anki sıramız:"),
    "expected_position_current_position_leading": ("We're currently leading.", "Şu an öndeyiz."), "expected_position_intro_medium_field": ("Decent field. Based on ratings we should finish around", "Orta seviye bir grup. Reytinglere göre şu civarda bitirmeliyiz:"),
    "expected_position_intro_mid_race": ("At this rate, we should finish around", "Bu gidişle şu civarda bitiririz:"),
    "expected_position_intro_strong_field": ("Strong field. Based on ratings we should finish around", "Güçlü bir grup. Reytinglere göre şu civarda bitirmeliyiz:"),
    "expected_position_intro_weak_field": ("Weak field. Based on ratings we should finish around", "Zayıf bir grup. Reytinglere göre şu civarda bitirmeliyiz:"),
    "expected_position_win": ("On ratings, we should win this.", "Reytinglere göre bunu kazanmalıyız."), "expected_position_win_mid_race": ("We're on course for the win.", "Kazanma yolundayız."),
    "good_start": ("Great start!", "Harika start!"), "laps_ahead": ("laps ahead", "tur öndeyiz"), "laps_behind": ("laps behind", "tur gerideyiz"), "last": ("We're last.", "Sondayız."),
    "leading": ("You're leading.", "Öndesin, lidersin."), "ok_start": ("OK start.", "Fena olmayan bir start."), "one_lap_ahead": ("We're a lap ahead.", "Bir tur öndeyiz."),
    "one_lap_down": ("We're a lap down.", "Bir tur gerideyiz."), "overtaking": ("Nice move!", "Güzel geçiş!"), "pole": ("Pole position!", "Pole pozisyonu!"),
    "terrible_start": ("Terrible start.", "Berbat bir start."),
}
for k_, (en, tr) in PO.items():
    S("position/" + k_, en, tr)
for n in range(1, 57):
    S(f"position/p{n}", f"P{n}.", f"{cap(tr_ord(n))} sıradasın.", "Position call (see trigger of the sentence it's part of): lap-end position change, grid position, expected position, pit-exit estimate.",
      "Sıra bildirimi: tur sonunda sıra değişince (5 turda bir de hatırlatma), grid sırası, beklenen sıra, pit çıkışı tahmini.")
for k_, en, tr in [
    ("good_start", "Race: 25 s after the start (or lap 2), gained 2+ places.", "Yarış: starttan 25 sn sonra (ya da 2. tur) 2+ sıra kazanmışsan."),
    ("ok_start", "…same or better by one place.", "…aynı sıradaysan ya da bir sıra kazandıysan."),
    ("bad_start", "…lost 1–2 places.", "…1–2 sıra kaybettiysen."), ("terrible_start", "…lost 3+ places.", "…3+ sıra kaybettiysen."),
    ("overtaking", "Race: you pass a car on track (position +1, the car wasn't pitting), max every 25 s.", "Yarış: pistte bir aracı geçince (sıra +1, o araç pitte değil), 25 sn'de en çok bir."),
    ("being_overtaken", "Race: a car passes you on track, max every 25 s.", "Yarış: bir araç seni pistte geçince, 25 sn'de en çok bir."),
    ("leading", "Race: crossing the line in the lead after a position change.", "Yarış: sıra değişiminden sonra çizgiyi lider geçince."),
    ("last", "Race: last in class (4+ cars) at the line.", "Yarış: çizgide sınıfta sonuncuysan (4+ araç)."),
    ("consistently_last", "Race: last for 6 laps in a row.", "Yarış: 6 turdur sonuncuysan."),
    ("one_lap_down", "Race: the class leader lapped you.", "Yarış: sınıf lideri tur bindirince."),
    ("laps_behind", "Race: 2+ laps down, after the number.", "Yarış: 2+ tur gerideysen, sayıdan sonra."),
    ("one_lap_ahead", "Race: leading and you lapped P2.", "Yarış: lidersen ve P2'ye tur bindirdiysen."),
    ("laps_ahead", "Race: leading by 2+ laps, after the number.", "Yarış: 2+ tur öndeysen, sayıdan sonra."),
    ("pole", "Qualifying: your PB puts you P1 (max every 2 min).", "Sıralama: rekorunla P1 olunca (2 dakikada en çok bir)."),
    ("expected_position_win", "iRacing grid: your iRating is the highest in class.", "iRacing grid: sınıfta en yüksek iRating sende."),
    ("expected_position_intro_weak_field", "iRacing grid: SoF < 1500, followed by expected position (iRating rank).", "iRacing grid: SoF < 1500, ardından beklenen sıra (iRating sırası)."),
    ("expected_position_intro_medium_field", "iRacing grid: SoF 1500–2500, followed by expected position.", "iRacing grid: SoF 1500–2500, ardından beklenen sıra."),
    ("expected_position_intro_strong_field", "iRacing grid: SoF ≥ 2500, followed by expected position.", "iRacing grid: SoF ≥ 2500, ardından beklenen sıra."),
    ("expected_position_win_mid_race", "Half distance: expected to win and leading.", "Yarı mesafede: kazanman bekleniyor ve öndesin."),
    ("expected_position_intro_mid_race", "Half distance: reminder of the expected position.", "Yarı mesafede: beklenen sıra hatırlatması."),
]:
    T("position/" + k_, en, tr)

# ---- push_now
for k_, en, tr in [("laps_to_get_the_job_done", "laps to get the job done.", "tur var, işi bitir."), ("minutes_to_set_a_lap", "minutes to set a lap.", "dakika var, tur at."),
                   ("opponent_exiting_pits", "Your rival is coming out of the pits, push!", "Rakibin pitten çıkıyor, bas!"), ("pits_exit_clear", "Pit exit is clear, push!", "Pit çıkışı temiz, bas!"),
                   ("pits_exit_traffic_behind", "Traffic coming at pit exit, careful.", "Pit çıkışında arkadan araç geliyor, dikkat."), ("push_to_get_second", "Push, you can get second!", "Bas, ikinciliği alabilirsin!"),
                   ("push_to_get_third", "Push, you can get third!", "Bas, üçüncülüğü alabilirsin!"), ("push_to_get_win", "Push, you can win this!", "Bas, bu yarışı kazanabilirsin!"),
                   ("push_to_hold_position", "Push to hold position!", "Sıranı korumak için bas!"), ("push_to_improve", "Push, you can gain a place!", "Bas, bir sıra kazanabilirsin!"),
                   ("we_have", "We have", "Elimizde")]:
    S("push_now/" + k_, en, tr)
for k_, en, tr in [
    ("push_to_get_win", "Race, 3 laps (or ~5 min) to go: P2 and the leader is catchable (gap < 0.8 s × laps left).", "Yarış, 3 tur (ya da ~5 dk) kala: P2'sin ve lidere yetişilebilir (fark < 0,8 sn × kalan tur)."),
    ("push_to_get_second", "…P3 and P2 is catchable.", "…P3'sün ve P2'ye yetişilebilir."), ("push_to_get_third", "…P4 and P3 is catchable.", "…P4'sün ve P3'e yetişilebilir."),
    ("push_to_improve", "…the car ahead is catchable.", "…öndekine yetişilebilir."), ("push_to_hold_position", "…the car behind is close enough to catch you.", "…arkadaki sana yetişecek kadar yakın."),
    ("we_have", "After the push call in lap races / qualifying time reminders.", "Turlu yarışta bas çağrısından sonra / sıralamada kalan süre hatırlatması."),
    ("laps_to_get_the_job_done", "'We have 3 laps to get the job done'.", "'Elimizde 3 tur var, işi bitir'."),
    ("minutes_to_set_a_lap", "Timed qualifying at 5 and 2 minutes left: 'We have 5 minutes to set a lap'.", "Süreli sıralamada 5 ve 2 dakika kala: 'Elimizde 5 dakika var, tur at'."),
    ("pits_exit_clear", "Race: leaving the pit lane with no car within 4 s behind on track.", "Yarış: pit yolundan çıkarken pistte 4 sn arkada araç yoksa."),
    ("pits_exit_traffic_behind", "Race: leaving the pit lane with a car within 4 s behind.", "Yarış: pit yolundan çıkarken 4 sn arkada araç varsa."),
    ("opponent_exiting_pits", "Race: the car right behind you in class leaves the pits within 12 s behind.", "Yarış: sınıfta hemen arkandaki araç pitten 12 sn arkanda çıkınca."),
]:
    T("push_now/" + k_, en, tr)

# ---- race_time
RT = {
    "fifteen_minutes_left": ("Fifteen minutes left.", "On beş dakika kaldı."), "five_minutes_left": ("Five minutes left.", "Beş dakika kaldı."),
    "five_minutes_left_leading": ("Five minutes left, you're leading.", "Beş dakika kaldı, öndesin."), "five_minutes_left_podium": ("Five minutes left, you're on the podium.", "Beş dakika kaldı, podyumdasın."),
    "half_way": ("We're at half distance.", "Yarışın yarısındayız."), "laps_remaining": ("laps remaining.", "tur kaldı."), "last_lap": ("Last lap.", "Son tur."),
    "last_lap_leading": ("Last lap, you're leading!", "Son tur, öndesin!"), "last_lap_top_three": ("Last lap, top three!", "Son tur, ilk üçtesin!"),
    "less_than_one_minute": ("Less than a minute left.", "Bir dakikadan az kaldı."), "one_minute_remaining": ("One minute remaining.", "Bir dakika kaldı."),
    "one_more_lap_after_this_one": ("One more lap after this one.", "Bundan sonra bir tur daha."), "remaining": ("remaining.", "kaldı."), "ten_minutes_left": ("Ten minutes left.", "On dakika kaldı."),
    "this_is_the_last_lap": ("This is the last lap.", "Bu son tur."), "twenty_minutes_left": ("Twenty minutes left.", "Yirmi dakika kaldı."),
    "two_minutes_left": ("Two minutes left.", "İki dakika kaldı."), "zero_minutes_left": ("Time's up.", "Süre doldu."),
}
for k_, (en, tr) in RT.items():
    S("race_time/" + k_, en, tr)
for k_, en, tr in [
    ("twenty_minutes_left", "Timed race: 20 minutes left.", "Süreli yarış: 20 dakika kala."), ("fifteen_minutes_left", "Timed race: 15 minutes left.", "Süreli yarış: 15 dakika kala."),
    ("ten_minutes_left", "Timed race/qualifying: 10 minutes left.", "Süreli yarış/sıralama: 10 dakika kala."), ("five_minutes_left", "Timed race: 5 minutes left (P4+).", "Süreli yarış: 5 dakika kala (P4 ve gerisi)."),
    ("five_minutes_left_leading", "Timed race: 5 minutes left while leading.", "Süreli yarış: 5 dakika kala öndeysen."), ("five_minutes_left_podium", "5 minutes left while P2/P3.", "5 dakika kala P2/P3'sen."),
    ("two_minutes_left", "Timed race: 2 minutes left.", "Süreli yarış: 2 dakika kala."), ("one_minute_remaining", "Timed race/qualifying: 1 minute left.", "Süreli yarış/sıralama: 1 dakika kala."),
    ("remaining", "Long timed races at 60/45/30 minutes left: '30 minutes remaining'.", "Uzun süreli yarışta 60/45/30 dakika kala: '30 dakika kaldı'."),
    ("less_than_one_minute", "Timed race: you start a lap with < 1 minute left.", "Süreli yarış: 1 dakikadan az kala tura başlayınca."),
    ("zero_minutes_left", "Timed race: the clock hits zero (before the white flag).", "Süreli yarış: süre sıfırlanınca (beyaz bayraktan önce)."),
    ("one_more_lap_after_this_one", "Leading a timed race with 1–2 laps of time left, or 2 laps to go alternative.", "Süreli yarışta öndeysen 1–2 turluk süre kalınca ya da '2 tur kaldı' alternatifi."),
    ("half_way", "Race reaches half distance (laps or time).", "Yarış yarı mesafeye gelince (tur ya da süre)."),
    ("laps_remaining", "Lap race at 10/5/3 laps to go: '5 laps remaining'.", "Turlu yarışta 10/5/3 tur kala: '5 tur kaldı'."),
    ("last_lap", "Last lap (alternative).", "Son tur (alternatif)."), ("this_is_the_last_lap", "Last lap (alternative).", "Son tur (alternatif)."),
    ("last_lap_leading", "Last lap while leading (alternative).", "Son turda öndeysen (alternatif)."), ("last_lap_top_three", "Last lap while P2/P3 (alternative).", "Son turda P2/P3'sen (alternatif)."),
]:
    T("race_time/" + k_, en, tr)

# ---- radio_check, rejoining
S("radio_check/test", "Radio check.", "Telsiz kontrolü, beni duyuyor musun?", "Once per app run, the first time you're on track in a live session; also the 'Radio check' test button.",
  "Uygulama her açıldığında canlı oturumda ilk kez piste çıkınca bir kez; 'Telsiz testi' düğmesi.")
S("rejoining/rejoin_clear", "Clear to rejoin.", "Yol açık, piste dönebilirsin.", "Off track and slow for 1 s+, no car within 3.5 s behind.", "Pist dışında ve yavaşken (1 sn+), 3,5 sn arkada araç yoksa.")
S("rejoining/rejoin_wait", "Wait, car coming!", "Bekle, araç geliyor!", "Off track and slow, a car is within 3.5 s behind (repeats every 5 s).", "Pist dışında ve yavaşken 3,5 sn arkada araç varsa (5 sn'de bir).")

# ---- spotter
SPOT = {
    "car_inside": ("Car inside.", "İçte araç."), "car_left": ("Car left.", "Solda araç."), "car_outside": ("Car outside.", "Dışta araç."), "car_right": ("Car right.", "Sağda araç."),
    "clear": ("Clear.", "Temiz."), "clear_all_round": ("Clear all round.", "Her yer temiz."), "clear_inside": ("Clear inside.", "İç temiz."), "clear_left": ("Clear left.", "Sol temiz."),
    "clear_outside": ("Clear outside.", "Dış temiz."), "clear_right": ("Clear right.", "Sağ temiz."), "hold_your_line": ("Hold your line.", "Çizgini koru."),
    "in_the_middle": ("You're in the middle.", "Ortadasın, üç araç yan yana."), "still_there": ("Still there.", "Hâlâ orada."),
    "three_wide_on_inside": ("Three wide, you're on the inside.", "Üç araç yan yana, içtesin."), "three_wide_on_left": ("Three wide, you're on the left.", "Üç araç yan yana, soldasın."),
    "three_wide_on_outside": ("Three wide, you're on the outside.", "Üç araç yan yana, dıştasın."), "three_wide_on_right": ("Three wide, you're on the right.", "Üç araç yan yana, sağdasın."),
}
for k_, (en, tr) in SPOT.items():
    S("spotter/" + k_, en, tr)
for k_, en, tr in [
    ("car_left", "A car comes alongside on your left.", "Solunda araç belirince."), ("car_right", "A car comes alongside on your right.", "Sağında araç belirince."),
    ("car_inside", "Oval + 'inside/outside' option: car alongside on the inside (left).", "Ovalde 'iç/dış' seçeneği açıksa: içte (solda) araç."),
    ("car_outside", "Oval + 'inside/outside' option: car alongside on the outside (right).", "Ovalde 'iç/dış' seçeneği açıksa: dışta (sağda) araç."),
    ("clear_left", "The car on your left is gone.", "Soldaki araç gidince."), ("clear_right", "The car on your right is gone.", "Sağdaki araç gidince."),
    ("clear_inside", "Oval: the inside car is gone.", "Ovalde içteki araç gidince."), ("clear_outside", "Oval: the outside car is gone.", "Ovalde dıştaki araç gidince."),
    ("clear_all_round", "From 'in the middle' to nobody alongside.", "'Ortadasın'dan sonra yanında kimse kalmayınca."),
    ("clear", "Three-wide (with you on a side) ends with nobody alongside.", "Kenarda olduğun üç araç durumundan sonra yanında kimse kalmayınca."),
    ("in_the_middle", "Cars on both sides.", "İki yanında da araç varken."),
    ("three_wide_on_left", "Three wide with you on the left.", "Üç araç yan yana ve sen soldayken."), ("three_wide_on_right", "Three wide with you on the right.", "Üç araç yan yana ve sen sağdayken."),
    ("three_wide_on_inside", "Oval: three wide with you on the inside.", "Ovalde üç araç ve sen içteyken."), ("three_wide_on_outside", "Oval: three wide with you on the outside.", "Ovalde üç araç ve sen dıştayken."),
    ("hold_your_line", "In the middle for more than 2 s (once).", "2 sn'den uzun ortada kalınca (bir kez)."),
    ("still_there", "Car still alongside after 4 s (every 4 s).", "Yandaki araç 4 sn sonra hâlâ oradaysa (4 sn'de bir)."),
]:
    T("spotter/" + k_, en, tr)

# ---- strategy
for k_, en, tr in [("a_few_seconds_ahead_of", "a few seconds ahead of", "birkaç saniye önünde"), ("a_few_seconds_behind", "a few seconds behind", "birkaç saniye arkasında"),
                   ("a_pitstop_costs_us_about", "A pit stop costs us about", "Bir pit durağı bize yaklaşık şu kadar kaybettiriyor:"),
                   ("acknowledge_time_pitstop", "OK, I'll time the next pit stop.", "Tamam, sonraki pit durağının süresini ölçeceğim."),
                   ("ahead_of", "ahead of", "önünde"), ("and", "and", "ve"), ("behind", "behind", "arkasında"), ("between", "between", "arasında"), ("close_between", "close between", "yakın, arasında"),
                   ("expect_clear_track_on_pit_exit", "Expect a clear track at pit exit.", "Pit çıkışında pist temiz olacak."),
                   ("expect_traffic_on_pit_exit", "Expect traffic at pit exit.", "Pit çıkışında trafik olacak."),
                   ("he_will_come_out_just_behind", "He'll come out just behind us.", "Hemen arkamızda çıkacak."), ("he_will_come_out_just_in_front", "He'll come out just in front.", "Hemen önümüzde çıkacak."),
                   ("is_pitting_from_position", "is pitting from", "şu sıradan pite giriyor:"), ("just_ahead_of", "just ahead of", "hemen önünde"), ("just_behind", "just behind", "hemen arkasında"),
                   ("set_benchmark_laptime_first", "Set a benchmark lap first.", "Önce bir referans tur at."),
                   ("we_are_sharing_our_pit_box_with", "We're sharing our pit box with", "Pit kutumuzu şununla paylaşıyoruz:"),
                   ("we_should_emerge_in_position", "We should come out in", "Pitten şu sırada çıkmalıyız:"),
                   ("will_calculate_time_loss_from_next_lap", "I'll calculate the time loss from next lap.", "Kaybı sonraki turdan hesaplayacağım.")]:
    S("strategy/" + k_, en, tr)
for k_, en, tr in [
    ("a_pitstop_costs_us_about", "Race: after your first stop's out-lap – measured loss (in-lap + out-lap − 2 normal laps), '… 24 seconds'.",
     "Yarış: ilk pit sonrası çıkış turu bitince – ölçülen kayıp (giriş + çıkış turu − 2 normal tur), '… 24 saniye'."),
    ("we_should_emerge_in_position", "Race, entering the pits once the pit loss is known: estimated position after the stop.", "Yarış, pit kaybı biliniyorken pite girince: duraktan sonra tahmini sıra."),
    ("expect_traffic_on_pit_exit", "…a car is expected within 2 s of where we'll rejoin.", "…çıkacağımız yerde 2 sn içinde araç bekleniyorsa."),
    ("expect_clear_track_on_pit_exit", "…no car expected near our rejoin point.", "…çıkacağımız yerde araç beklenmiyorsa."),
    ("he_will_come_out_just_behind", "After 'car ahead is pitting', if he'll rejoin 0–3 s behind us.", "'Öndeki pite giriyor'dan sonra, 0–3 sn arkamızda çıkacaksa."),
    ("he_will_come_out_just_in_front", "After 'car ahead is pitting', if he'll rejoin 0–3 s in front.", "'Öndeki pite giriyor'dan sonra, 0–3 sn önümüzde çıkacaksa."),
]:
    T("strategy/" + k_, en, tr)

# ---- timings
TI = {
    "ahead_is_increasing": ("The gap ahead is increasing.", "Öndekiyle ara açılıyor."), "ahead_is_now": ("Ahead is now", "Öndekiyle ara şimdi"),
    "bad_reputation": ("He's got a bad reputation.", "Adı kötüye çıkmış biri."), "behind_is_increasing": ("The gap behind is increasing.", "Arkadakiyle ara açılıyor."),
    "behind_is_now": ("Behind is now", "Arkadakiyle ara şimdi"), "being_held_up": ("You're being held up.", "Önündeki seni tutuyor."),
    "being_pressured": ("You're under pressure from behind.", "Arkadan baskı var."), "below_average_reputation": ("His reputation isn't great.", "Sicili pek temiz değil."),
    "car_behind_is_lapping_us": ("The car behind is lapping us.", "Arkadaki araç tur bindiriyor."), "car_behind_is_unlapping_itself": ("The car behind is unlapping himself.", "Arkadaki tur kaybını geri alıyor."),
    "gap_behind_decreasing": ("The gap behind is closing.", "Arkadaki yaklaşıyor."), "gap_behind_increasing": ("You're pulling away from the car behind.", "Arkadakinden uzaklaşıyorsun."),
    "gap_behind_is_now": ("Gap behind is now", "Arkadakiyle fark şimdi"), "gap_in_front_decreasing": ("You're closing on the car ahead.", "Öndekine yaklaşıyorsun."),
    "gap_in_front_increasing": ("The car ahead is pulling away.", "Öndeki uzaklaşıyor."), "gap_in_front_is_now": ("Gap to the car ahead is now", "Öndekiyle fark şimdi"),
    "he_is_faster_entering_corner": ("He's faster into the corner.", "Viraja girişte o daha hızlı."), "he_is_faster_through_corner": ("He's faster through the corner.", "Viraj içinde o daha hızlı."),
    "he_is_slower_entering_corner": ("He's slower into the corner.", "Viraja girişte o daha yavaş."), "he_is_slower_through_corner": ("He's slower through the corner.", "Viraj içinde o daha yavaş."),
    "in_the_gap_is_now": ("in the gap is now", "ile fark şimdi"), "is_reeling_you_in": ("He's reeling you in.", "Arkadaki hızla yaklaşıyor."),
    "opponent_ahead_has_bad_reputation": ("Careful, the guy ahead has a bad reputation.", "Dikkat, öndekinin sicili kötü."),
    "opponent_ahead_has_below_average_reputation": ("The guy ahead's reputation isn't great.", "Öndekinin sicili pek iyi değil."),
    "opponent_behind_has_bad_reputation": ("Careful, the guy behind has a bad reputation.", "Dikkat, arkadakinin sicili kötü."),
    "opponent_behind_has_below_average_reputation": ("The guy behind's reputation isn't great.", "Arkadakinin sicili pek iyi değil."),
    "seconds": ("seconds", "saniye"), "the_gap_to": ("The gap to", "Şununla fark:"), "youre_reeling": ("You're reeling him in.", "Öndekini hızla yakalıyorsun."),
}
for k_, (en, tr) in TI.items():
    S("timings/" + k_, en, tr)
for k_, en, tr in [
    ("gap_in_front_decreasing", "Race, at the line: gap to the class car ahead shrank by 0.5 s+ over 2 laps (gap < 6 s), max every 2.5 min.",
     "Yarış, çizgide: sınıfta öndekiyle fark 2 turda 0,5 sn+ azaldı (fark < 6 sn), 2,5 dakikada en çok bir."),
    ("youre_reeling", "…closing faster (0.8 s+ over 2 laps).", "…daha hızlı yaklaşıyorsan (2 turda 0,8 sn+)."),
    ("gap_in_front_is_now", "After the closing/pulling-away call: current gap.", "Yaklaşma/uzaklaşma bildiriminden sonra: güncel fark."),
    ("gap_in_front_increasing", "Gap to the car ahead grew by 0.8 s+ over 2 laps.", "Öndekiyle fark 2 turda 0,8 sn+ arttı."),
    ("gap_behind_decreasing", "Gap to the car behind shrank by 0.5 s+ over 2 laps (gap < 4 s).", "Arkadakiyle fark 2 turda 0,5 sn+ azaldı (fark < 4 sn)."),
    ("is_reeling_you_in", "…the car behind closes 0.8 s+ over 2 laps and is within 2.5 s.", "…arkadaki 2 turda 0,8 sn+ yaklaşıyor ve 2,5 sn içindeyse."),
    ("gap_behind_is_now", "After the gap-behind call: current gap.", "Arkadaki fark bildiriminden sonra: güncel fark."),
    ("gap_behind_increasing", "Gap to the car behind grew by 0.8 s+ over 2 laps.", "Arkadakiyle fark 2 turda 0,8 sn+ arttı."),
    ("being_held_up", "Within 0.8 s of the car ahead for 3 laps and your best lap is 0.2 s+ quicker than his average.", "3 turdur öndekine 0,8 sn yakınsın ve en iyi turun onun ortalamasından 0,2 sn+ hızlı."),
    ("being_pressured", "The car behind has been within 0.6 s for 3 laps.", "Arkadaki 3 turdur 0,6 sn içinde."),
    ("car_behind_is_lapping_us", "A same-class car a lap ahead is 0.3–1.5 s behind you on track.", "Bir tur önde olan aynı sınıf araç pistte 0,3–1,5 sn arkandaysa."),
    ("car_behind_is_unlapping_itself", "A lapped same-class car, quicker than you, is 0.3–1.5 s behind on track.", "Senden tur geride ama daha hızlı aynı sınıf araç pistte 0,3–1,5 sn arkandaysa."),
    ("opponent_ahead_has_bad_reputation", "iRacing: within 1.5 s of the class car ahead and his safety rating is < 1.5 (once per car).", "iRacing: sınıfta öndekine 1,5 sn yakınsın ve güvenlik puanı < 1,5 (araç başına bir kez)."),
    ("opponent_ahead_has_below_average_reputation", "…safety rating 1.5–2.5.", "…güvenlik puanı 1,5–2,5."),
    ("opponent_behind_has_bad_reputation", "iRacing: car behind within 1.5 s with safety rating < 1.5.", "iRacing: arkadaki 1,5 sn içinde ve güvenlik puanı < 1,5."),
    ("opponent_behind_has_below_average_reputation", "…safety rating 1.5–2.5.", "…güvenlik puanı 1,5–2,5."),
]:
    T("timings/" + k_, en, tr)

# ---- tyre_monitor
CORN_EN = {"all_round": "all round", "fronts": "on the fronts", "rears": "on the rears", "lefts": "on the lefts", "rights": "on the rights",
           "left_front": "on the left front", "right_front": "on the right front", "left_rear": "on the left rear", "right_rear": "on the right rear"}
CORN_TR = {"all_round": "dört lastikte", "fronts": "ön lastiklerde", "rears": "arka lastiklerde", "lefts": "sol lastiklerde", "rights": "sağ lastiklerde",
           "left_front": "sol ön lastikte", "right_front": "sağ ön lastikte", "left_rear": "sol arka lastikte", "right_rear": "sağ arka lastikte"}
TM = {
    "all_tyres_dirty": ("Tyres are dirty all round.", "Dört lastik de kirli."), "left_tyres_dirty": ("Left tyres are dirty.", "Sol lastikler kirli."),
    "right_tyres_dirty": ("Right tyres are dirty.", "Sağ lastikler kirli."), "alternates": ("alternates", "alternatif lastikler"), "are_about": ("are about", "yaklaşık"),
    "average_front_inner_and_outer_same": ("Front inner and outer temps are about the same.", "Ön lastiklerin iç ve dış sıcaklığı hemen hemen aynı."),
    "average_front_inner_temps_are": ("Front inner temps are", "Ön lastiklerde iç taraf"), "average_rear_inner_and_outer_same": ("Rear inner and outer temps are about the same.", "Arka lastiklerin iç ve dış sıcaklığı hemen hemen aynı."),
    "average_rear_inner_temps_are": ("Rear inner temps are", "Arka lastiklerde iç taraf"), "bar": ("bar", "bar"), "camber_ok": ("Camber looks OK.", "Kamber iyi görünüyor."),
    "celsius_colder_than_outer": ("degrees colder than the outer.", "derece dıştan soğuk."), "celsius_colder_than_outers": ("degrees colder than the outers.", "derece dış taraflardan soğuk."),
    "celsius_hotter_than_outer": ("degrees hotter than the outer.", "derece dıştan sıcak."), "celsius_hotter_than_outers": ("degrees hotter than the outers.", "derece dış taraflardan sıcak."),
    "cold_brakes_all_round": ("Brakes are cold all round.", "Frenler soğuk."), "cold_front_brakes": ("Front brakes are cold.", "Ön frenler soğuk."), "cold_rear_brakes": ("Rear brakes are cold.", "Arka frenler soğuk."),
    "cold_front_tyres": ("Front tyres are cold.", "Ön lastikler soğuk."), "cold_rear_tyres": ("Rear tyres are cold.", "Arka lastikler soğuk."), "cold_left_tyres": ("Left tyres are cold.", "Sol lastikler soğuk."),
    "cold_right_tyres": ("Right tyres are cold.", "Sağ lastikler soğuk."), "cold_tyres_all_round": ("Tyres are cold all round.", "Lastikler soğuk."),
    "compound_a": ("compound A", "A hamuru"), "compound_b": ("compound B", "B hamuru"), "compound_c": ("compound C", "C hamuru"), "compound_d": ("compound D", "D hamuru"),
    "cooking_brakes_all_round": ("Brakes are cooking!", "Frenler kaynıyor!"), "cooking_front_brakes": ("Front brakes are cooking!", "Ön frenler kaynıyor!"), "cooking_rear_brakes": ("Rear brakes are cooking!", "Arka frenler kaynıyor!"),
    "faster_than": ("faster than", "şundan hızlı:"), "good_brake_temps": ("Brake temps are good.", "Fren sıcaklıkları iyi."), "good_tyre_temps": ("Tyre temps are good now.", "Lastik sıcaklıkları artık iyi."),
    "good_wear": ("Tyre wear looks good.", "Lastik aşınması iyi görünüyor."), "good_wear_general": ("Wear's fine.", "Aşınma sorun değil."),
    "hards": ("hards", "sert lastikler"), "hot_brakes_all_round": ("Brakes are hot.", "Frenler sıcak."), "hot_front_brakes": ("Front brakes are hot.", "Ön frenler sıcak."), "hot_rear_brakes": ("Rear brakes are hot.", "Arka frenler sıcak."),
    "hyper_softs": ("hypersofts", "hiper yumuşaklar"), "intermediates": ("intermediates", "ara lastikler"), "mediums": ("mediums", "orta lastikler"), "options": ("options", "seçenek lastikler"),
    "primaries": ("primaries", "ana lastikler"), "primes": ("primes", "ana lastikler"), "psi": ("psi", "psi"), "slicks": ("slicks", "kuru (slick) lastikler"), "softs": ("softs", "yumuşaklar"),
    "super_softs": ("supersofts", "süper yumuşaklar"), "ultra_softs": ("ultrasofts", "ultra yumuşaklar"), "wets": ("wets", "yağmur lastikleri"),
    "laps_on_current_tyres_intro": ("We've done", "Bu lastiklerle"), "laps_on_current_tyres_outro": ("laps on these tyres.", "tur yaptık."),
    "minutes_on_current_tyres_intro": ("We've done", "Bu lastiklerle"), "minutes_on_current_tyres_outro": ("minutes on these tyres.", "dakika yaptık."),
    "left_front": ("left front", "sol ön"), "right_front": ("right front", "sağ ön"), "left_rear": ("left rear", "sol arka"), "right_rear": ("right rear", "sağ arka"),
    "fronts_are_flat_spotted": ("Fronts are flat-spotted.", "Ön lastiklerde düzlük (flat spot) var."), "rears_are_flat_spotted": ("Rears are flat-spotted.", "Arka lastiklerde düzlük var."),
    "you_need_more_negative_camber": ("You need more negative camber.", "Daha fazla negatif kamber lazım."), "you_need_more_positive_camber": ("You need less negative camber.", "Negatif kamberi azalt."),
    "you_need_more_negative_camber_on_fronts": ("More negative camber on the fronts.", "Önlere daha fazla negatif kamber."),
    "you_need_more_negative_camber_on_rears": ("More negative camber on the rears.", "Arkalara daha fazla negatif kamber."),
    "you_need_more_positive_camber_on_fronts": ("Less negative camber on the fronts.", "Önlerde negatif kamberi azalt."),
    "you_need_more_positive_camber_on_rears": ("Less negative camber on the rears.", "Arkalarda negatif kamberi azalt."),
}
for k_, (en, tr) in TM.items():
    S("tyre_monitor/" + k_, en, tr)
TYRE_TR = {"lf": "Sol ön", "rf": "Sağ ön", "lr": "Sol arka", "rr": "Sağ arka", "left_front": "Sol ön", "right_front": "Sağ ön", "left_rear": "Sol arka", "right_rear": "Sağ arka"}
TYRE_EN = {"lf": "Left front", "rf": "Right front", "lr": "Left rear", "rr": "Right rear", "left_front": "Left front", "right_front": "Right front", "left_rear": "Left rear", "right_rear": "Right rear"}
for key in keys:
    if not key.startswith("tyre_monitor/") or key in E:
        continue
    p = key.split("/", 1)[1]
    m = re.fullmatch(r"(lf|rf|lr|rr)_inner_and_outer_are_same", p)
    if m:
        S(key, f"{TYRE_EN[m.group(1)]} inner and outer are the same.", f"{TYRE_TR[m.group(1)]} lastiğin içi ve dışı aynı.")
        continue
    m = re.fullmatch(r"(lf|rf|lr|rr)_inner_is_running", p)
    if m:
        S(key, f"{TYRE_EN[m.group(1)]} inner is running", f"{TYRE_TR[m.group(1)]} lastiğin iç tarafı")
        continue
    m = re.fullmatch(r"(left_front|right_front|left_rear|right_rear)_is_flat_spotted", p)
    if m:
        S(key, f"{TYRE_EN[m.group(1)]} is flat-spotted.", f"{TYRE_TR[m.group(1)]} lastikte düzlük var.")
        continue
    m = re.fullmatch(r"(left_front|right_front|left_rear|right_rear|front|rear)_pressures?_(ok|high|low|very_high|very_low)", p)
    if m:
        wh = {"front": ("Front pressures", "Ön lastik basınçları"), "rear": ("Rear pressures", "Arka lastik basınçları")}.get(m.group(1), (TYRE_EN.get(m.group(1), "") + " pressure", TYRE_TR.get(m.group(1), "") + " lastik basıncı"))
        lv = {"ok": ("OK", "iyi"), "high": ("high", "yüksek"), "low": ("low", "düşük"), "very_high": ("very high", "çok yüksek"), "very_low": ("very low", "çok düşük")}[m.group(2)]
        S(key, f"{wh[0]} {lv[0]}.", f"{wh[1]} {lv[1]}.")
        continue
    m = re.fullmatch(r"damage_to_(front|rear)_tyres", p)
    if m:
        S(key, f"Damage to the {m.group(1)} tyres.", f"{'Ön' if m.group(1) == 'front' else 'Arka'} lastiklerde hasar.")
        continue
    m = re.fullmatch(r"damage_to_(left_front|right_front|left_rear|right_rear)_tyre", p)
    if m:
        S(key, f"Damage to the {TYRE_EN[m.group(1)].lower()} tyre.", f"{TYRE_TR[m.group(1)]} lastikte hasar.")
        continue
    m = re.fullmatch(r"(locking|spinning)_(fronts|rears|left_front|right_front|left_rear|right_rear)_(corner|lap)_warning", p)
    if m:
        act_en = "Locking" if m.group(1) == "locking" else "Spinning"
        act_tr = "kilitleniyor" if m.group(1) == "locking" else "patinaj yapıyor"
        wh_en = {"fronts": "the fronts", "rears": "the rears"}.get(m.group(2), "the " + TYRE_EN.get(m.group(2), "").lower())
        wh_tr = {"fronts": "Ön lastikler", "rears": "Arka lastikler"}.get(m.group(2), TYRE_TR.get(m.group(2), "") + " lastik")
        when_en = "in that corner" if m.group(3) == "corner" else "a lot this lap"
        when_tr = "bu virajda" if m.group(3) == "corner" else "bu tur sık sık"
        S(key, f"{act_en} {wh_en} {when_en}.", f"{wh_tr} {when_tr} {act_tr}.")
        continue
    m = re.fullmatch(r"(cold|hot|cooking)_(left_front|right_front|left_rear|right_rear)_tyre", p)
    if m:
        lv = {"hot": ("is hot", "sıcak"), "cooking": ("is cooking", "kaynıyor"), "cold": ("is cold", "soğuk")}[m.group(1)]
        S(key, f"{TYRE_EN[m.group(2)]} tyre {lv[0]}.", f"{TYRE_TR[m.group(2)]} lastik {lv[1]}.")
        continue
    m = re.fullmatch(r"(cold|hot|cooking)_(front|rear|left|right)_tyres", p)
    if m:
        lv = {"hot": ("are hot", "sıcak"), "cooking": ("are cooking", "kaynıyor"), "cold": ("are cold", "soğuk")}[m.group(1)]
        wtr = {"front": "Ön", "rear": "Arka", "left": "Sol", "right": "Sağ"}[m.group(2)]
        S(key, f"{m.group(2).capitalize()} tyres {lv[0]}.", f"{wtr} lastikler {lv[1]}.")
        continue
    m = re.fullmatch(r"(hot|cooking)_tyres_all_round", p)
    if m:
        S(key, f"Tyres are {'hot' if m.group(1) == 'hot' else 'cooking'} all round.", f"Dört lastik de {'sıcak' if m.group(1) == 'hot' else 'kaynıyor'}.")
        continue
    m = re.fullmatch(r"(minor_wear|worn|knackered)_(all_round|fronts|rears|lefts|rights|left_front|right_front|left_rear|right_rear)", p)
    if m:
        lv_en = {"minor_wear": "Minor wear", "worn": "Tyres worn", "knackered": "Tyres are finished"}[m.group(1)]
        lv_tr = {"minor_wear": "hafif aşınma var", "worn": "aşınma belirgin", "knackered": "lastik bitti"}[m.group(1)]
        S(key, f"{lv_en} {CORN_EN[m.group(2)]}.", f"{cap(CORN_TR[m.group(2)])} {lv_tr}.")
        continue
for key in [k for k in keys if k.startswith("tyre_monitor/")]:
    if key not in lit:
        continue
    p = key.split("/", 1)[1]
    if re.match(r"(cold|hot|cooking)_", p):
        lim = {"cold": "below 65°C (40°C on wets) in the first 3 laps of a stint", "hot": "above 100°C (85°C on wets)", "cooking": "above 110°C (95°C on wets)"}[p.split("_")[0]]
        lim_tr = {"cold": "stintin ilk 3 turunda 65°C altında (yağmur lastiğinde 40°C)", "hot": "100°C üstünde (yağmur lastiğinde 85°C)", "cooking": "110°C üstünde (yağmur lastiğinde 95°C)"}[p.split("_")[0]]
        T(key, f"At the line, live tyre temps (ACC/AC/LMU/rF2/AMS2): these tyres average {lim} (repeats after 4 laps).",
          f"Çizgide, canlı lastik sıcaklığında (ACC/AC/LMU/rF2/AMS2): bu lastiklerin ortalaması {lim_tr} (4 tur sonra tekrar).")
    elif re.match(r"(minor_wear|worn|knackered)_", p):
        lim = {"minor": ("< 80%", "%80'in altına"), "worn": ("< 55%", "%55'in altına"), "knackered": ("< 30%", "%30'un altına")}[p.split("_")[0]]
        T(key, f"At the line, live wear data: tread on these tyres drops {lim[0]} remaining (once per level per stint).",
          f"Çizgide, canlı aşınma verisinde: bu lastiklerde kalan diş {lim[1]} inince (stintte seviye başına bir kez).")
for k_, en, tr in [
    ("good_tyre_temps", "After a cold-tyre call, all tyres reach the working window.", "Soğuk lastik uyarısından sonra dört lastik de çalışma aralığına gelince."),
    ("slicks", "After 'the car ahead/behind/leader is now on' – changed to dry tyres.", "'Öndeki/arkadaki/lider artık şu lastikte' sonrası – kuru lastiğe geçti."),
    ("wets", "…changed to wet tyres.", "…yağmur lastiğine geçti."),
    ("laps_on_current_tyres_intro", "Lap race without wear data: every 10 laps of a stint, 'We've done 20 laps on these tyres'.", "Aşınma verisi yokken turlu yarışta: stintte 10 turda bir, 'Bu lastiklerle 20 tur yaptık'."),
    ("laps_on_current_tyres_outro", "…end of that sentence.", "…cümlenin sonu."),
    ("minutes_on_current_tyres_intro", "Timed race without wear data: every 20 minutes of a stint.", "Aşınma verisi yokken süreli yarışta: stintte 20 dakikada bir."),
    ("minutes_on_current_tyres_outro", "…end of that sentence.", "…cümlenin sonu."),
    ("average_front_inner_temps_are", "Practice, iRacing pit-box tyre readings: front inner vs outer difference, '… 6 degrees hotter than the outers'.",
     "Antrenmanda iRacing pit kutusu lastik ölçümü: ön iç–dış farkı, '… 6 derece dış taraflardan sıcak'."),
    ("average_rear_inner_temps_are", "…same for the rears.", "…arka için aynısı."),
    ("average_front_inner_and_outer_same", "…front inner/outer within 3°C.", "…ön iç/dış farkı 3°C içinde."),
    ("average_rear_inner_and_outer_same", "…rear inner/outer within 3°C.", "…arka iç/dış farkı 3°C içinde."),
    ("celsius_hotter_than_outers", "End of the inner-temp sentence (inner hotter).", "İç sıcaklık cümlesinin sonu (iç daha sıcak)."),
    ("celsius_colder_than_outers", "End of the inner-temp sentence (inner colder).", "İç sıcaklık cümlesinin sonu (iç daha soğuk)."),
    ("camber_ok", "After the pit-box reading: inner is 0–12°C hotter on both axles.", "Pit kutusu ölçümünden sonra: iki aksta da iç taraf 0–12°C sıcak."),
    ("you_need_more_negative_camber", "Inner colder than outer on both axles.", "İki aksta da iç taraf dıştan soğuk."),
    ("you_need_more_positive_camber", "Inner 12°C+ hotter on both axles.", "İki aksta da iç taraf 12°C+ sıcak."),
    ("you_need_more_negative_camber_on_fronts", "Front inner colder than outer.", "Önde iç taraf dıştan soğuk."),
    ("you_need_more_negative_camber_on_rears", "Rear inner colder than outer.", "Arkada iç taraf dıştan soğuk."),
    ("you_need_more_positive_camber_on_fronts", "Front inner 12°C+ hotter.", "Önde iç taraf 12°C+ sıcak."),
    ("you_need_more_positive_camber_on_rears", "Rear inner 12°C+ hotter.", "Arkada iç taraf 12°C+ sıcak."),
]:
    T("tyre_monitor/" + k_, en, tr)

# ---- watched_opponents
WO = {
    "acknowledge_no_way_to_refer_to_driver": ("I don't know how to refer to that driver.", "O sürücüyü nasıl anacağımı bilmiyorum."),
    "acknowledge_stop_watching_all": ("OK, I'll stop watching everyone.", "Tamam, kimseyi izlemiyorum."), "acknowledge_stop_watching_car_number": ("OK, I'll stop watching that car number.", "Tamam, o numarayı izlemeyi bıraktım."),
    "acknowledge_stop_watching_driver_name": ("OK, I'll stop watching that driver.", "Tamam, o sürücüyü izlemeyi bıraktım."), "acknowledge_stop_watching_rival": ("OK, I'll stop watching your rival.", "Tamam, rakibini izlemeyi bıraktım."),
    "acknowledge_stop_watching_team_mate": ("OK, I'll stop watching your team mate.", "Tamam, takım arkadaşını izlemeyi bıraktım."), "acknowledge_unknown_driver": ("I don't know that driver.", "O sürücüyü tanımıyorum."),
    "acknowledge_watch_rival": ("OK, I'll watch your rival.", "Tamam, rakibini izleyeceğim."), "acknowledge_watch_team_mate": ("OK, I'll watch your team mate.", "Tamam, takım arkadaşını izleyeceğim."),
    "acknowledge_watch_with_car_number": ("OK, I'll watch car number", "Tamam, şu numarayı izleyeceğim:"), "acknowledge_we_will_watch": ("OK, we'll watch", "Tamam, şunu izleyeceğiz:"),
    "has_just_done_a": ("has just done a", "az önce şu turu attı:"), "is_in_position": ("is in", "şu sırada:"), "is_leaving_pits": ("is leaving the pits.", "pitten çıkıyor."),
    "is_now_in_position": ("is now in", "artık şu sırada:"), "rival_has_just_done_a": ("Your rival has just done a", "Rakibin az önce şu turu attı:"),
    "rival_is_leaving_pits": ("Your rival is leaving the pits.", "Rakibin pitten çıkıyor."), "rival_is_now_in_position": ("Your rival is now in", "Rakibin artık şu sırada:"),
    "rival_pitting_from_position": ("Your rival is pitting from", "Rakibin şu sıradan pite giriyor:"), "team_mate_has_just_done_a": ("Your team mate has just done a", "Takım arkadaşın az önce şu turu attı:"),
    "team_mate_is_leaving_pits": ("Your team mate is leaving the pits.", "Takım arkadaşın pitten çıkıyor."), "team_mate_is_now_in_position": ("Your team mate is now in", "Takım arkadaşın artık şu sırada:"),
    "team_mate_pitting_from_position": ("Your team mate is pitting from", "Takım arkadaşın şu sıradan pite giriyor:"), "your_rival": ("your rival", "rakibin"), "your_team_mate": ("your team mate", "takım arkadaşın"),
}
for k_, (en, tr) in WO.items():
    S("watched_opponents/" + k_, en, tr)

# ---- numbers
for key in keys:
    if not key.startswith("numbers/"):
        continue
    p = key.split("/", 1)[1]
    m = re.fullmatch(r"\d+", p)
    if m and not p.startswith("0") or p == "0":
        n = int(p)
        S(key, enn(n), trn(n))
        continue
    m = re.fullmatch(r"0(\d)", p)
    if m:
        d = int(m.group(1))
        S(key, f"oh {enn(d)}", f"sıfır {trn(d)}")
        continue
    m = re.fullmatch(r"(\d)_(\d\d)", p)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        bs_en = enn(b) if b >= 10 else f"oh {enn(b)}"
        bs_tr = trn(b) if b >= 10 else f"sıfır {trn(b)}"
        S(key, f"{enn(a)} {bs_en} (lap time {a}:{b:02d})", f"{trn(a)} {bs_tr} (tur zamanı {a}:{b:02d})")
        continue
    m = re.fullmatch(r"(\d+)point(\d)seconds", p)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        S(key, f"{enn(a)} point {enn(b)} seconds", f"{trn(a)} virgül {trn(b)} saniye")
        continue
    m = re.fullmatch(r"point(\d)seconds", p)
    if m:
        b = int(m.group(1))
        S(key, f"point {enn(b)} seconds", f"sıfır virgül {trn(b)} saniye")
        continue
    m = re.fullmatch(r"(\d+)point(\d)", p)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        S(key, f"{enn(a)} point {enn(b)}", f"{trn(a)} virgül {trn(b)}")
        continue
    m = re.fullmatch(r"point(\d\d?)", p)
    if m:
        b = m.group(1)
        if len(b) == 1:
            S(key, f"point {enn(int(b))}", f"virgül {trn(int(b))}")
        else:
            words_en = " ".join(enn(int(c)) for c in b) if b.startswith("0") else enn(int(b))
            words_tr = "sıfır " + trn(int(b[1])) if b.startswith("0") else trn(int(b))
            S(key, f"point {words_en}", f"virgül {words_tr}")
        continue
WORDS = {"double_oh": ("double oh", "sıfır sıfır"), "hour": ("hour", "saat"), "hours": ("hours", "saat"), "hundred": ("hundred", "yüz"), "hundred_and": ("hundred and", "yüz (İngilizce 'hundred and')"),
         "minus": ("minus", "eksi"), "minute": ("minute", "dakika"), "minutes": ("minutes", "dakika"), "oh": ("oh", "sıfır"), "point": ("point", "virgül"), "second": ("second", "saniye"),
         "seconds": ("seconds", "saniye"), "tenth": ("tenth", "onda bir"), "tenths": ("tenths", "onda"), "thousand": ("thousand", "bin"), "thousand_and": ("thousand and", "bin (İngilizce 'thousand and')"),
         "zerozero": ("zero zero", "sıfır sıfır")}
for w, (en, tr) in WORDS.items():
    S("numbers/" + w, en, tr)

# ---------------------------------------------------------------- kullanım (motor)
def number_used(p):
    if re.fullmatch(r"\d+", p):
        return True  # 0..99 tam sayılar ve 01..09 (tur zamanında saniye)
    if re.fullmatch(r"\d_\d\d", p):
        return True  # 1:xx, 2:xx tur zamanları
    if re.fullmatch(r"\d+point\d(seconds)?", p) or re.fullmatch(r"point\dseconds", p):
        return True
    if re.fullmatch(r"point\d", p):
        return True
    return p in ("hundred", "thousand", "minute", "minutes", "second", "seconds", "zerozero")


NUM_TRIG = {
    "int": ("Spoken numbers: laps left, positions above P56, incidents, SoF/iRating, fuel litres, temperatures, minutes, car numbers.",
            "Okunan sayılar: kalan tur, P56 üstü sıralar, olay puanı, SoF/iRating, yakıt litresi, sıcaklıklar, dakikalar, araç numaraları."),
    "lap": ("Lap times 1:00–2:59 ('1:23' + tenths).", "1:00–2:59 arası tur zamanları ('1:23' + onda bir)."),
    "oh": ("Lap times of 3+ minutes when seconds < 10 (e.g. 3:05.2).", "3 dakikadan uzun tur zamanlarında saniye < 10 iken (ör. 3:05.2)."),
    "dec": ("Decimal numbers: gaps 10–59.9 s (+'seconds'), lap times under a minute, fuel usage per lap (e.g. 2.4).",
            "Ondalıklı sayılar: 10–59,9 sn farklar (+'saniye'), bir dakikadan kısa tur zamanları, tur başı yakıt (ör. 2,4)."),
    "secs": ("Gaps under 10 seconds (e.g. '1.3 seconds').", "10 saniyenin altındaki farklar (ör. '1,3 saniye')."),
    "point": ("Tenths of a lap time (e.g. '1:23' + 'point 4').", "Tur zamanının onda biri (ör. '1:23' + 'virgül 4')."),
    "words": ("Number words used when composing (hundred/thousand for SoF and iRating, minutes/seconds for times, 'zero zero' for x:00 lap times).",
              "Sayı birleştirmede kullanılan sözcükler (SoF/iRating için yüz/bin, süreler için dakika/saniye, x:00 tur zamanı için 'sıfır sıfır')."),
}
NUM_UNUSED = {
    "pointNN": ("Hundredths (lap times are read to a tenth).", "Yüzde birler (tur zamanları onda bir hassasiyetle okunuyor)."),
    "hundred_and": ("English-only form; the Turkish pack uses 'hundred'.", "Sadece İngilizce paketlerde; Türkçede 'yüz' kullanılıyor."),
    "thousand_and": ("English-only form; the Turkish pack uses 'thousand'.", "Sadece İngilizce paketlerde; Türkçede 'bin' kullanılıyor."),
    "double_oh": ("Only used if 'zerozero' is missing from the pack.", "Sadece pakette 'zerozero' yoksa kullanılır."),
    "oh": ("Only used if the '01'..'09' folders are missing.", "Sadece '01'..'09' klasörleri yoksa kullanılır."),
    "point": ("Not needed: decimals use the 'NpointM' / 'pointN' folders.", "Gerekmiyor: ondalıklar 'NpointM' / 'pointN' klasörleriyle okunuyor."),
    "minus": ("No negative numbers are spoken.", "Negatif sayı okunmuyor."),
    "hour": ("No hour-long readings yet.", "Saat cinsinden okuma yok."), "hours": ("No hour-long readings yet.", "Saat cinsinden okuma yok."),
    "tenth": ("Tenths are read as decimals.", "Onda birler ondalık olarak okunuyor."), "tenths": ("Tenths are read as decimals.", "Onda birler ondalık olarak okunuyor."),
}

# Kategorilere göre "neden kullanılmıyor"
WHY = {
    "acknowledge": ("Voice-command reply; SRTR Pitwall has no speech recognition.", "Sesli komut cevabı; SRTR Pitwall'da konuşma tanıma yok."),
    "alarm_clock": ("Crew Chief alarm-clock voice command; no equivalent.", "Crew Chief'in sesli alarm komutu; karşılığı yok."),
    "battery": ("No hybrid/EV battery data in our telemetry.", "Telemetrimizde hibrit/elektrik batarya verisi yok."),
    "conditions": ("No weather forecast data (only current rain/temperature).", "Hava tahmini verisi yok (sadece anlık yağmur/sıcaklık)."),
    "damage_reporting": ("No per-component damage/puncture data from the sims we read.", "Okuduğumuz simlerden parça bazlı hasar/patlak verisi gelmiyor."),
    "driver_swaps": ("No stint/driver-swap schedule data.", "Stint / pilot değişimi planı verisi yok."),
    "flags": ("Needs data we don't read (sector flags, lucky dog, wave-around, VSC, named off-track drivers, corner names).",
              "Okumadığımız veri gerekiyor (sektör bayrakları, lucky dog, wave-around, VSC, isimli pist dışı, viraj adları)."),
    "frozen_order": ("Safety-car/pace-car formation ordering isn't exposed by our telemetry.", "Güvenlik aracı/pace car sıralama talimatları telemetride yok."),
    "fuel": ("Not needed by the current fuel logic.", "Mevcut yakıt mantığında gerekmiyor."),
    "lap_counter": ("Formation/rolling-start instructions or driver names needed; not available.", "Formasyon/start talimatı ya da sürücü adı gerekiyor; veri yok."),
    "lap_times": ("Not used by the current lap-time logic.", "Mevcut tur zamanı mantığında kullanılmıyor."),
    "mandatory_pit_stops": ("Pit-menu confirmations / mandatory-stop rules need voice commands or series data we don't have.",
                            "Pit menüsü onayları / zorunlu pit kuralları sesli komut ya da seri verisi gerektiriyor; yok."),
    "multiclass": ("Not used.", "Kullanılmıyor."),
    "opponents": ("Needs driver-name audio or voice commands.", "Sürücü adı sesi ya da sesli komut gerekiyor."),
    "overtaking_aids": ("No DRS / push-to-pass / KERS data in our telemetry.", "Telemetrimizde DRS / push-to-pass / KERS verisi yok."),
    "pace_notes": ("Rally pace-notes recorder; not implemented.", "Ralli pace-not kaydı; uygulanmadı."),
    "penalties": ("Penalty type/reason isn't exposed (only black/meatball/DQ flags).", "Ceza türü/nedeni telemetride yok (sadece siyah/hasar/DSQ bayrakları)."),
    "position": ("Not used.", "Kullanılmıyor."),
    "strategy": ("Needs voice commands or names (benchmark laps, shared pit box, named rivals).", "Sesli komut ya da sürücü adı gerekiyor."),
    "timings": ("Needs names or corner-by-corner comparison data.", "Sürücü adı ya da viraj viraj karşılaştırma verisi gerekiyor."),
    "tyre_monitor": ("No brake temps, pressures targets, lock-up/wheelspin, flat-spot, dirt or compound-name data.",
                     "Fren sıcaklığı, basınç hedefi, kilitlenme/patinaj, flat spot, kir ya da hamur adı verisi yok."),
    "watched_opponents": ("Watching rivals/team mates is a voice command; no speech recognition.", "Rakip/takım arkadaşı izleme sesli komutla seçilir; konuşma tanıma yok."),
    "race_time": ("Not used.", "Kullanılmıyor."),
    "push_now": ("Not used.", "Kullanılmıyor."),
    "engine_monitor": ("Not used.", "Kullanılmıyor."),
    "incidents": ("Not used.", "Kullanılmıyor."),
    "licence": ("Not used.", "Kullanılmıyor."),
    "spotter": ("Not used.", "Kullanılmıyor."),
    "rejoining": ("Not used.", "Kullanılmıyor."),
}
WHY_KEY = {
    "flags/white_flag": None,
    "fuel/gallon": ("Unit word not needed (amounts use 'gallons to get to the end').", "Birim tek başına gerekmiyor."),
    "fuel/gallons": ("Unit word not needed (amounts use 'gallons to get to the end').", "Birim tek başına gerekmiyor."),
    "fuel/litre": ("Unit word not needed (amounts use 'litres to get to the end').", "Birim tek başına gerekmiyor."),
    "fuel/litres": ("Unit word not needed (amounts use 'litres to get to the end').", "Birim tek başına gerekmiyor."),
    "fuel/for": ("Connector word not needed.", "Bağlaç gerekmiyor."),
    "fuel/into_the_race": ("Window times are said relative to now.", "Pencere süreleri şu andan itibaren söyleniyor."),
    "fuel/not_enough_laps_for_average": ("Voice-command reply.", "Sesli komut cevabı."),
    "fuel/virtual_energy": ("LMU virtual energy isn't read.", "LMU sanal enerji okunmuyor."),
    "lap_times/less_than_a_tenth_off_self_pace": ("Covered by sector self-pace calls.", "Kendi sektör farkı bildirimleri bunu karşılıyor."),
    "lap_times/off_the_self_pace": ("Covered by sector self-pace calls.", "Kendi sektör farkı bildirimleri bunu karşılıyor."),
    "lap_times/sector1_is": ("Needs a time after it; sector deltas use band phrases instead.", "Ardından süre ister; sektör farkları bant ifadeleriyle söyleniyor."),
    "lap_times/sector2_is": ("Needs a time after it; sector deltas use band phrases instead.", "Ardından süre ister; sektör farkları bant ifadeleriyle söyleniyor."),
    "lap_times/sector3_is": ("Needs a time after it; sector deltas use band phrases instead.", "Ardından süre ister; sektör farkları bant ifadeleriyle söyleniyor."),
    "lap_times/sector1_and_2_are": ("Needs a time after it.", "Ardından süre ister."), "lap_times/sector1_and_3_are": ("Needs a time after it.", "Ardından süre ister."),
    "lap_times/sector2_and_3_are": ("Needs a time after it.", "Ardından süre ister."), "lap_times/sector_all_are": ("Needs a time after it.", "Ardından süre ister."),
    "mandatory_pit_stops/pit_window_opening": ("Covered by 'opens in 1/2 minutes'.", "'1/2 dakika sonra açılıyor' karşılıyor."),
    "mandatory_pit_stops/pit_window_closed": ("Fuel window closing is warned before it closes.", "Yakıt penceresi kapanmadan önce uyarılıyor."),
    "mandatory_pit_stops/pit_window_opens_on_lap": ("The fuel pit window phrases are used instead.", "Yerine yakıt pit penceresi ifadeleri kullanılıyor."),
    "mandatory_pit_stops/pit_window_opens_after": ("The fuel pit window phrases are used instead.", "Yerine yakıt pit penceresi ifadeleri kullanılıyor."),
    "mandatory_pit_stops/stop_complete_go": ("Pit service completion isn't exposed reliably (a wrong 'go' would abort the stop).", "Pit servisinin bittiği güvenilir okunamıyor (yanlış 'git' durağı bozar)."),
    "mandatory_pit_stops/minutes": ("Not needed (numbers/minutes is used).", "Gerekmiyor (numbers/minutes kullanılıyor)."),
    "multiclass/faster_car_behind_racing_player": ("'Racing the player' relation isn't tracked.", "'Oyuncuyla yarışıyor' ilişkisi izlenmiyor."),
    "multiclass/faster_car_behind_racing_player_is_class_leader": ("'Racing the player' relation isn't tracked.", "'Oyuncuyla yarışıyor' ilişkisi izlenmiyor."),
    "multiclass/slower_car_ahead_racing_player": ("'Racing the player' relation isn't tracked.", "'Oyuncuyla yarışıyor' ilişkisi izlenmiyor."),
    "multiclass/slower_car_ahead_racing_player_is_class_leader": ("'Racing the player' relation isn't tracked.", "'Oyuncuyla yarışıyor' ilişkisi izlenmiyor."),
    "opponents/slow_car_ahead": ("Slow cars ahead aren't detected separately.", "Öndeki yavaş araç ayrıca algılanmıyor."),
    "opponents/one_lap_ahead": ("Needs a name before it.", "Önünde sürücü adı ister."), "opponents/one_lap_behind": ("Needs a name before it.", "Önünde sürücü adı ister."),
    "position/ahead": ("Connector word for named gaps.", "İsimli farklar için bağlaç."), "position/behind": ("Connector word for named gaps.", "İsimli farklar için bağlaç."),
    "position/expected_position_current_position_intro": ("Expected position is said with the field-strength intros.", "Beklenen sıra güç ifadeleriyle söyleniyor."),
    "position/expected_position_current_position_leading": ("Expected position is said with the field-strength intros.", "Beklenen sıra güç ifadeleriyle söyleniyor."),
    "tyre_monitor/good_wear": ("Not said (only wear warnings).", "Söylenmiyor (sadece aşınma uyarıları)."),
    "tyre_monitor/good_wear_general": ("Not said (only wear warnings).", "Söylenmiyor (sadece aşınma uyarıları)."),
    "timings/seconds": ("numbers/seconds is used.", "numbers/seconds kullanılıyor."),
    "timings/ahead_is_now": ("gap_in_front_is_now is used.", "gap_in_front_is_now kullanılıyor."), "timings/behind_is_now": ("gap_behind_is_now is used.", "gap_behind_is_now kullanılıyor."),
    "timings/ahead_is_increasing": ("gap_in_front_increasing is used.", "gap_in_front_increasing kullanılıyor."),
    "timings/behind_is_increasing": ("gap_behind_increasing is used.", "gap_behind_increasing kullanılıyor."),
    "timings/bad_reputation": ("The ahead/behind reputation phrases are used.", "Önde/arkada itibar ifadeleri kullanılıyor."),
    "timings/below_average_reputation": ("The ahead/behind reputation phrases are used.", "Önde/arkada itibar ifadeleri kullanılıyor."),
    "opponents/reputation_intro": ("Reputation is said with the timings phrases.", "İtibar timings ifadeleriyle söyleniyor."),
    "flags/slow_car_ahead": ("Slow/stopped car detection by corner isn't implemented.", "Virajdaki yavaş/duran araç algılaması yok."),
    "flags/stopped_car_ahead": ("Slow/stopped car detection by corner isn't implemented.", "Virajdaki yavaş/duran araç algılaması yok."),
    "flags/fc_yellow_in_progress_eu": ("Caution reminders each lap were too chatty.", "Her turda sarı hatırlatması çok gevezeydi."),
    "flags/fc_yellow_in_progress_usa": ("Caution reminders each lap were too chatty.", "Her turda sarı hatırlatması çok gevezeydi."),
    "lap_counter/race_starts_in": ("Countdown to start isn't exposed.", "Starta geri sayım telemetride yok."),
    "lap_counter/leader_has_crossed_start_line": ("Not needed.", "Gerekmiyor."),
    "frozen_order/safetycar_out_eu": ("The flags/fc_yellow_start phrases are used.", "flags/fc_yellow_start ifadeleri kullanılıyor."),
    "frozen_order/safetycar_out_usa": ("The flags/fc_yellow_start phrases are used.", "flags/fc_yellow_start ifadeleri kullanılıyor."),
    "frozen_order/thats_a_standing_start": ("Standing starts aren't detectable before they happen.", "Duran start önceden anlaşılamıyor."),
    "conditions/air_temp_is_now": ("'air_temp_is' / '…increasing_its_now' are used.", "'air_temp_is' / '…increasing_its_now' kullanılıyor."),
    "conditions/track_temp_is_now": ("'track_temp_is' / '…increasing_its_now' are used.", "'track_temp_is' / '…increasing_its_now' kullanılıyor."),
    "penalties/you_have_a_penalty": ("Black flag phrases are used.", "Siyah bayrak ifadeleri kullanılıyor."),
    "penalties/you_dont_have_a_penalty": ("Voice-command reply.", "Sesli komut cevabı."),
    "penalties/cut_track_in_prac_or_qual_next_invalid": ("The sim doesn't tell us the next lap is invalid.", "Sim sonraki turun geçersiz olacağını bildirmiyor."),
    "tyre_monitor/lf_inner_is_running": ("Per-axle averages are used.", "Aks ortalamaları kullanılıyor."),
}
for k_ in ("acknowledge_driver_is_ok", "acknowledge_driver_is_ok_no_speech", "acknowledge_driver_is_ok_not_understood"):
    WHY_KEY["damage_reporting/" + k_] = ("Reply to the driver's spoken answer; no speech recognition.", "Sürücünün sesli cevabına yanıt; konuşma tanıma yok.")
for t_ in ("lf", "rf", "lr", "rr"):
    WHY_KEY[f"tyre_monitor/{t_}_inner_is_running"] = ("Per-axle averages are used.", "Aks ortalamaları kullanılıyor.")
    WHY_KEY[f"tyre_monitor/{t_}_inner_and_outer_are_same"] = ("Per-axle averages are used.", "Aks ortalamaları kullanılıyor.")
for s_ in ("celsius_colder_than_outer", "celsius_hotter_than_outer"):
    WHY_KEY["tyre_monitor/" + s_] = ("Per-axle averages ('…outers') are used.", "Aks ortalamaları ('…outers') kullanılıyor.")

catalog = []
missing_say = []
for key in keys:
    cat, ph = key.split("/", 1)
    files = len([f for f in tree[key] if f.lower().endswith((".wav", ".ogg"))])
    e = E.get(key) or [None, None, None, None]
    if e[0] is None:
        missing_say.append(key)
        e = [ph.replace("_", " ").capitalize() + ".", ph.replace("_", " ") + " (çeviri yok)", None, None]
    if cat == "numbers":
        used = number_used(ph)
        if used:
            if re.fullmatch(r"\d_\d\d", ph):
                tg = NUM_TRIG["lap"]
            elif re.fullmatch(r"0\d", ph):
                tg = NUM_TRIG["oh"]
            elif re.fullmatch(r"\d+", ph):
                tg = NUM_TRIG["int"]
            elif ph.endswith("seconds") and "point" in ph:
                tg = NUM_TRIG["secs"]
            elif re.fullmatch(r"\d+point\d", ph):
                tg = NUM_TRIG["dec"]
            elif re.fullmatch(r"point\d", ph):
                tg = NUM_TRIG["point"]
            else:
                tg = NUM_TRIG["words"]
            ten, ttr = tg
        else:
            why = NUM_UNUSED["pointNN"] if re.fullmatch(r"point\d\d", ph) else NUM_UNUSED.get(ph, ("Not used.", "Kullanılmıyor."))
            ten, ttr = "Never plays: " + why[0], "Çalmaz: " + why[1]
    else:
        used = key in lit or (cat == "position" and re.fullmatch(r"p\d+", ph) is not None) or key == "multiclass/runners" or (cat == "multiclass" and ph in CLS)
        if used:
            ten, ttr = e[2], e[3]
            if ten is None:
                ten, ttr = "Used by the engine.", "Motor kullanıyor."
                print("UYARI tetikleyici yok:", key)
        else:
            why = WHY_KEY.get(key) or WHY.get(cat, ("Not used.", "Kullanılmıyor."))
            ten, ttr = "Never plays: " + why[0], "Çalmaz: " + why[1]
    catalog.append({"key": key, "files": files, "used": used, "trigger_tr": ttr, "trigger_en": ten, "say_tr": e[1], "say_en": e[0]})

if missing_say:
    print("say eksik:", len(missing_say), missing_say[:40])
out = f"{REPO}/src-tauri/src/voice_catalog.json"
with open(out, "w", encoding="utf-8") as fh:
    fh.write("[\n" + ",\n".join(json.dumps(x, ensure_ascii=False) for x in catalog) + "\n]\n")
u = [x for x in catalog if not x["used"]]
print("toplam", len(catalog), "kullanılan", len(catalog) - len(u), "kullanılmayan", len(u))

# ---------------------------------------------------------------- voice_unused.md
by = collections.OrderedDict()
for x in u:
    by.setdefault(x["key"].split("/")[0], []).append(x)
lines = ["# Sesli mühendis: kullanılmayan ifade klasörleri", "",
         f"Toplam {len(catalog)} ifade klasörü var; motor bunlardan **{len(catalog) - len(u)}** tanesini kullanıyor, **{len(u)}** tanesi hiç çalmıyor.",
         "Aşağıdakiler silinebilir (ya da ileride veri gelirse kullanılabilir). Her satırda klasör, kayıt sayısı ve neden kullanılmadığı var.", ""]
for cat, items in by.items():
    total = len([k for k in keys if k.startswith(cat + "/")])
    lines.append(f"## {cat} ({len(items)} / {total} kullanılmıyor)")
    lines.append("")
    if len(items) == total:
        lines.append(f"Kategorinin tamamı kullanılmıyor: {items[0]['trigger_tr'].replace('Çalmaz: ', '')}")
        lines.append("")
        lines.append("<details><summary>Klasörler</summary>")
        lines.append("")
        lines.append(", ".join(f"`{x['key'].split('/', 1)[1]}`" for x in items))
        lines.append("")
        lines.append("</details>")
        lines.append("")
        continue
    groups = collections.OrderedDict()
    for x in items:
        groups.setdefault(x["trigger_tr"].replace("Çalmaz: ", ""), []).append(x)
    for why, xs in groups.items():
        if len(xs) > 6:
            lines.append(f"- {why} — {len(xs)} klasör: " + ", ".join(f"`{x['key'].split('/', 1)[1]}`" for x in xs))
        else:
            for x in xs:
                lines.append(f"- `{x['key']}` ({x['files']} kayıt) — {why}")
    lines.append("")
lines.append("Not: `fuel/fuel.wav` bir ifade klasörü değil, `fuel` klasörünün içine düşmüş tek bir dosya; silinebilir.")
if "--md" in sys.argv:
    open(sys.argv[sys.argv.index("--md") + 1], "w", encoding="utf-8").write("\n".join(lines) + "\n")
