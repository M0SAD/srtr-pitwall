# Sesli mühendis: kullanılmayan ifade klasörleri

Toplam 2255 ifade klasörü var; motor bunlardan **1493** tanesini kullanıyor, **762** tanesi hiç çalmıyor.
Aşağıdakiler silinebilir (ya da ileride veri gelirse kullanılabilir). Her satırda klasör, kayıt sayısı ve neden kullanılmadığı var.

## acknowledge (15 / 27 kullanılmıyor)

- Sesli komut cevabı; SRTR Pitwall'da konuşma tanıma yok. — 15 klasör: `OK`, `breath_in`, `didnt_understand`, `fill_the_tank`, `fuel_to_end`, `no`, `no_data`, `no_more_data`, `pit_strategy_1`, `pit_strategy_2`, `pit_strategy_3`, `pit_strategy_4`, `radio_check`, `stand_by`, `yes`

## alarm_clock (4 / 4 kullanılmıyor)

Kategorinin tamamı kullanılmıyor: Crew Chief'in sesli alarm komutu; karşılığı yok.

<details><summary>Klasörler</summary>

`alarms`, `am`, `notify`, `pm`

</details>

## battery (36 / 36 kullanılmıyor)

Kategorinin tamamı kullanılmıyor: Telemetrimizde hibrit/elektrik batarya verisi yok.

<details><summary>Klasörler</summary>

`about_to_run_out`, `battery_use_increasing`, `battery_use_reducing`, `battery_use_stable`, `critical_battery`, `current_charge_should_make_end`, `current_charge_should_make_half_distance`, `five_minutes_battery`, `four_laps_battery`, `half_charge_warning`, `half_distance_good_battery`, `half_distance_low_battery`, `increase_battery_use_easily_make_end`, `increase_battery_use_easily_make_half_distance`, `laps`, `laps_remaining`, `low_battery`, `minutes`, `minutes_remaining`, `on_last_lap_you_used`, `one_lap_battery`, `percent`, `percent_of_your_battery`, `percent_per_lap`, `percent_remaining`, `plenty_of_battery`, `reduce_battery_use_to_make_end`, `reduce_battery_use_to_make_half_distance`, `ten_minutes_battery`, `three_laps_battery`, `two_laps_battery`, `two_minutes_battery`, `we_estimate`, `we_will_get_another`, `wont_make_end_without_pitstop`, `wont_make_half_distance_without_pitstop`

</details>

## conditions (9 / 30 kullanılmıyor)

- `conditions/air_temp_is_now` (3 kayıt) — 'air_temp_is' / '…increasing_its_now' kullanılıyor.
- `conditions/track_temp_is_now` (3 kayıt) — 'track_temp_is' / '…increasing_its_now' kullanılıyor.
- Hava tahmini verisi yok (sadece anlık yağmur/sıcaklık). — 7 klasör: `we_expect_drizzle_in_the_next`, `we_expect_heavy_rain_in_the_next`, `we_expect_light_rain_in_the_next`, `we_expect_medium_rain_in_the_next`, `we_expect_rain_in_the_next`, `we_expect_rain_to_stop_in_the_next`, `we_expect_very_heavy_rain_in_the_next`

## damage_reporting (36 / 39 kullanılmıyor)

- `damage_reporting/acknowledge_driver_is_ok` (8 kayıt) — Sürücünün sesli cevabına yanıt; konuşma tanıma yok.
- `damage_reporting/acknowledge_driver_is_ok_no_speech` (6 kayıt) — Sürücünün sesli cevabına yanıt; konuşma tanıma yok.
- `damage_reporting/acknowledge_driver_is_ok_not_understood` (6 kayıt) — Sürücünün sesli cevabına yanıt; konuşma tanıma yok.
- Okuduğumuz simlerden parça bazlı hasar/patlak verisi gelmiyor. — 33 klasör: `busted_brakes`, `busted_engine`, `busted_suspension`, `busted_transmission`, `damage`, `left_front_puncture`, `left_rear_puncture`, `minor_aero_damage`, `minor_aero_damage_general`, `minor_brake_damage`, `minor_engine_damage`, `minor_suspension_damage`, `minor_suspension_damage_general`, `minor_transmission_damage`, `missing_wheel`, `no_aero_damage`, `no_brake_damage`, `no_damage`, `no_engine_damage`, `no_suspension_damage`, `no_transmission_damage`, `right_front_puncture`, `right_rear_puncture`, `rolling`, `severe_aero_damage`, `severe_brake_damage`, `severe_engine_damage`, `severe_suspension_damage`, `severe_transmission_damage`, `stopped_upside_down`, `trivial_aero_damage`, `trivial_aero_damage_general`, `wheel_damage`

## driver_swaps (7 / 7 kullanılmıyor)

Kategorinin tamamı kullanılmıyor: Stint / pilot değişimi planı verisi yok.

<details><summary>Klasörler</summary>

`10_minutes_left_in_stint`, `15_minutes_left_in_stint`, `2_minutes_left_in_stint`, `5_minutes_left_in_stint`, `pit_now_for_driver_change`, `pit_this_lap_driver_change_no_more_stints`, `pit_this_lap_for_driver_change`

</details>

## flags (107 / 124 kullanılmıyor)

- Okumadığımız veri gerekiyor (sektör bayrakları, lucky dog, wave-around, VSC, isimli pist dışı, viraj adları). — 103 klasör: `and`, `choose_a_lane_by_staying_left_or_right`, `clear_to_overtake`, `fc_yellow_last_lap_current`, `fc_yellow_last_lap_current_eu`, `fc_yellow_last_lap_current_usa`, `fc_yellow_last_lap_next`, `fc_yellow_last_lap_next_eu`, `fc_yellow_last_lap_next_usa`, `fc_yellow_pits_closed`, `fc_yellow_pits_closed_eu`, `fc_yellow_pits_closed_usa`, `fc_yellow_pits_open`, `fc_yellow_pits_open_eu`, `fc_yellow_pits_open_lead_lap_cars`, `fc_yellow_pits_open_lead_lap_cars_eu`, `fc_yellow_pits_open_lead_lap_cars_usa`, `fc_yellow_pits_open_usa`, `fc_yellow_start_eu_no_safetycar`, `fc_yellow_start_usa_no_safetycar`, `give_one_position_back_first_warning`, `give_one_position_back_next_warning`, `give_positions_back_completed`, `give_positions_back_first_warning_intro`, `give_positions_back_first_warning_outro`, `give_positions_back_next_warning_intro`, `give_positions_back_next_warning_outro`, `green_flag_sector_1`, `green_flag_sector_2`, `green_flag_sector_3`, `incident_in_corner_intro`, `incident_in_corner_with_driver_intro`, `is_the_lucky_dog`, `let_the_lucky_dog_pass_on_left`, `lucky_dog_allow_pass_on_outside`, `lucky_dog_pass_on_outside`, `move_to_choose_lane`, `move_to_end_of_longest_line_for_penalty`, `name_has_gone_off_in_outro`, `name_has_gone_off_intro`, `name_has_gone_off_outro`, `names_have_gone_off_in_outro`, `names_have_gone_off_outro`, `no_overtaking`, `on_the_inside_line`, `on_the_outside_line`, `pass_drivername_for_lucky_dog_position_intro`, `pass_drivername_for_lucky_dog_position_outro`, `pass_this_guy_to_get_lucky_dog_position`, `pileup_in_corner_intro`, `position1_has_gone_off`, `position1_has_gone_off_in`, `position2_has_gone_off`, `position2_has_gone_off_in`, `position3_has_gone_off`, `position3_has_gone_off_in`, `position4_has_gone_off`, `position4_has_gone_off_in`, `position5_has_gone_off`, `position5_has_gone_off_in`, `position6_has_gone_off`, `position6_has_gone_off_in`, `remind_lucky_dog`, `slow_car_ahead_stay_high`, `slow_car_in`, `slow_car_in_the_tri-oval`, `slow_car_in_the_tri-oval_stay_high`, `slow_car_in_turn_1`, `slow_car_in_turn_1_stay_high`, `slow_car_in_turn_2`, `slow_car_in_turn_2_stay_high`, `slow_car_in_turn_3`, `slow_car_in_turn_3_stay_high`, `slow_car_in_turn_4`, `slow_car_in_turn_4_stay_high`, `stay_behind`, `stay_behind_the_pace_car`, `stay_below_vsc_speed`, `stopped_car_ahead_stay_high`, `stopped_car_in`, `stopped_car_in_the_tri-oval`, `stopped_car_in_the_tri-oval_stay_high`, `stopped_car_in_turn_1`, `stopped_car_in_turn_1_stay_high`, `stopped_car_in_turn_2`, `stopped_car_in_turn_2_stay_high`, `stopped_car_in_turn_3`, `stopped_car_in_turn_3_stay_high`, `stopped_car_in_turn_4`, `stopped_car_in_turn_4_stay_high`, `the_pace_car_is_in_turn`, `two_to_green`, `two_to_green_remind_lucky_dog`, `virtual_safety_car`, `virtual_safety_car_phase_over`, `virtual_safety_car_speed`, `wave_around_catch_end_of_field`, `we_are_in_lucky_dog_position`, `we_are_the_lucky_dog`, `we_have_been_waved_around`, `yellow_flag_sector_1`, `yellow_flag_sector_2`, `yellow_flag_sector_3`
- `flags/fc_yellow_in_progress_eu` (8 kayıt) — Her turda sarı hatırlatması çok gevezeydi.
- `flags/fc_yellow_in_progress_usa` (7 kayıt) — Her turda sarı hatırlatması çok gevezeydi.
- `flags/slow_car_ahead` (5 kayıt) — Virajdaki yavaş/duran araç algılaması yok.
- `flags/stopped_car_ahead` (5 kayıt) — Virajdaki yavaş/duran araç algılaması yok.

## frozen_order (43 / 48 kullanılmıyor)

- Güvenlik aracı/pace car sıralama talimatları telemetride yok. — 40 klasör: `allow`, `allow_car_number`, `allow_guy_behind_to_pass`, `catch_up_to`, `catch_up_to_car_number`, `fcy_lineup_single_file`, `follow`, `follow_car_number`, `in_the_inside_column`, `in_the_left_column`, `in_the_outside_column`, `in_the_right_column`, `line_up_in_the_inside_column`, `line_up_in_the_left_column`, `line_up_in_the_outside_column`, `line_up_in_the_right_column`, `line_up_single_file_behind`, `line_up_single_file_behind_car_number`, `line_up_single_file_behind_safety_car_eu`, `line_up_single_file_behind_safety_car_usa`, `move_to_pole`, `move_to_pole_row`, `pace_car_just_left`, `pace_car_speed_is`, `pass_car_number`, `pass_the_pace_car`, `pass_the_safety_car`, `row`, `safety_car_just_left`, `safety_car_speed_is`, `stay_in_pole`, `stay_in_pole_in_inside_column`, `stay_in_pole_in_left_column`, `stay_in_pole_in_outside_column`, `stay_in_pole_in_right_column`, `the_pace_car`, `the_safety_car`, `to_pass`, `you_need_to_catch_up_to_the_guy_ahead`, `youre_ahead_of_guy_you_should_follow`
- `frozen_order/safetycar_out_eu` (5 kayıt) — flags/fc_yellow_start ifadeleri kullanılıyor.
- `frozen_order/safetycar_out_usa` (5 kayıt) — flags/fc_yellow_start ifadeleri kullanılıyor.
- `frozen_order/thats_a_standing_start` (3 kayıt) — Duran start önceden anlaşılamıyor.

## fuel (8 / 44 kullanılmıyor)

- `fuel/for` (5 kayıt) — Bağlaç gerekmiyor.
- `fuel/gallon` (3 kayıt) — Birim tek başına gerekmiyor.
- `fuel/gallons` (3 kayıt) — Birim tek başına gerekmiyor.
- `fuel/litre` (3 kayıt) — Birim tek başına gerekmiyor.
- `fuel/litres` (3 kayıt) — Birim tek başına gerekmiyor.
- `fuel/into_the_race` (5 kayıt) — Pencere süreleri şu andan itibaren söyleniyor.
- `fuel/not_enough_laps_for_average` (3 kayıt) — Sesli komut cevabı.
- `fuel/virtual_energy` (3 kayıt) — LMU sanal enerji okunmuyor.

## lap_counter (17 / 36 kullanılmıyor)

- Formasyon/start talimatı ya da sürücü adı gerekiyor; veri yok. — 15 klasör: `form_up_behind`, `give_that_position_back`, `has_taken_the_win`, `hold_position_behind`, `hold_this_position_until_start_line`, `hold_your_position`, `leader_has_gone`, `manual_formation_lap_mode_disabled`, `manual_formation_lap_mode_enabled`, `minutes_you_need_to_get_on_with_it`, `ok_youre_in`, `rejoin_at_back`, `starting_in_left_lane_behind`, `starting_in_right_lane_behind`, `until_start_line`
- `lap_counter/leader_has_crossed_start_line` (5 kayıt) — Gerekmiyor.
- `lap_counter/race_starts_in` (11 kayıt) — Starta geri sayım telemetride yok.

## lap_times (9 / 92 kullanılmıyor)

- `lap_times/less_than_a_tenth_off_self_pace` (4 kayıt) — Kendi sektör farkı bildirimleri bunu karşılıyor.
- `lap_times/off_the_self_pace` (3 kayıt) — Kendi sektör farkı bildirimleri bunu karşılıyor.
- `lap_times/sector1_and_2_are` (3 kayıt) — Ardından süre ister.
- `lap_times/sector1_and_3_are` (3 kayıt) — Ardından süre ister.
- `lap_times/sector2_and_3_are` (3 kayıt) — Ardından süre ister.
- `lap_times/sector_all_are` (3 kayıt) — Ardından süre ister.
- `lap_times/sector1_is` (3 kayıt) — Ardından süre ister; sektör farkları bant ifadeleriyle söyleniyor.
- `lap_times/sector2_is` (3 kayıt) — Ardından süre ister; sektör farkları bant ifadeleriyle söyleniyor.
- `lap_times/sector3_is` (3 kayıt) — Ardından süre ister; sektör farkları bant ifadeleriyle söyleniyor.

## mandatory_pit_stops (101 / 114 kullanılmıyor)

- Pit menüsü onayları / zorunlu pit kuralları sesli komut ya da seri verisi gerektiriyor; yok. — 95 klasör: `box_in`, `box_to_fit_options_now`, `box_to_fit_primes_now`, `can_now_fit_options`, `can_now_fit_primes`, `cant_change_those`, `cant_do_that`, `car_has_too_much_damage`, `confirm_alternate_tyres`, `confirm_change_all_tyres`, `confirm_change_front_left_only`, `confirm_change_front_right_only`, `confirm_change_front_tyres`, `confirm_change_left_side_tyres`, `confirm_change_no_tyres`, `confirm_change_rear_left_only`, `confirm_change_rear_right_only`, `confirm_change_rear_tyres`, `confirm_change_right_side_tyres`, `confirm_change_tyres`, `confirm_dont_fix_aero`, `confirm_dont_fix_suspension`, `confirm_dry_tyres`, `confirm_fit_tyre_set_intro`, `confirm_fix_all`, `confirm_fix_all_aero`, `confirm_fix_body`, `confirm_fix_front_aero`, `confirm_fix_nothing`, `confirm_fix_rear_aero`, `confirm_fix_suspension`, `confirm_hard_tyres`, `confirm_hypersoft_tyres`, `confirm_intermediate_tyres`, `confirm_medium_tyres`, `confirm_monsoon_tyres`, `confirm_next_tyre_compound`, `confirm_no_refuelling`, `confirm_option_tyres`, `confirm_prime_tyres`, `confirm_refuelling`, `confirm_requested_tyre_not_available`, `confirm_soft_tyres`, `confirm_supersoft_tyres`, `confirm_ultrasoft_tyres`, `confirm_wet_tyres`, `feet`, `fifty_metres`, `laps_so_far`, `left_pit_too_soon`, `metres`, `min_pitstop_time_intro`, `missed_stop`, `no_fuel_this_time`, `no_pit_speed_limit`, `no_pit_timings_unreliable_fuel_estimates`, `no_pit_timings_unreliable_position_estimates`, `no_tyres_or_fuel`, `no_tyres_this_time`, `one_hundred_feet`, `one_hundred_metres`, `option_tyres`, `pit_crew_ready`, `pit_now`, `pit_request_cancelled`, `pit_stall_available`, `pit_stall_occupied`, `pit_stop_already_requested`, `pit_stop_not_requested`, `pit_stop_requested`, `pit_this_lap_too_late`, `prime_tyres`, `theyve_done`, `three_hundred_feet`, `wait`, `wait_5_seconds`, `wait_intro`, `will_be_serving_penalty`, `will_change_all_four_tyre_and_refuel`, `will_change_all_four_tyre_no_fuel`, `will_change_all_four_tyres`, `will_change_front_tyres_only`, `will_change_rear_tyres_only`, `will_fix_front_aero`, `will_fix_front_and_leave_rear_aero`, `will_fix_front_and_rear_aero`, `will_fix_rear_aero`, `will_fix_rear_and_leave_front_aero`, `will_fix_suspension`, `will_leave_suspension`, `will_not_be_serving_penalty`, `will_put_fuel_in`, `will_put_fuel_in_no_tyres`, `yes_stop_after`, `yes_stop_on_lap`
- `mandatory_pit_stops/minutes` (3 kayıt) — Gerekmiyor (numbers/minutes kullanılıyor).
- `mandatory_pit_stops/pit_window_closed` (4 kayıt) — Yakıt penceresi kapanmadan önce uyarılıyor.
- `mandatory_pit_stops/pit_window_opening` (3 kayıt) — '1/2 dakika sonra açılıyor' karşılıyor.
- `mandatory_pit_stops/pit_window_opens_after` (3 kayıt) — Yerine yakıt pit penceresi ifadeleri kullanılıyor.
- `mandatory_pit_stops/pit_window_opens_on_lap` (3 kayıt) — Yerine yakıt pit penceresi ifadeleri kullanılıyor.
- `mandatory_pit_stops/stop_complete_go` (4 kayıt) — Pit servisinin bittiği güvenilir okunamıyor (yanlış 'git' durağı bozar).

## multiclass (4 / 67 kullanılmıyor)

- `multiclass/faster_car_behind_racing_player` (9 kayıt) — 'Oyuncuyla yarışıyor' ilişkisi izlenmiyor.
- `multiclass/faster_car_behind_racing_player_is_class_leader` (7 kayıt) — 'Oyuncuyla yarışıyor' ilişkisi izlenmiyor.
- `multiclass/slower_car_ahead_racing_player` (10 kayıt) — 'Oyuncuyla yarışıyor' ilişkisi izlenmiyor.
- `multiclass/slower_car_ahead_racing_player_is_class_leader` (7 kayıt) — 'Oyuncuyla yarışıyor' ilişkisi izlenmiyor.

## numbers (110 / 1052 kullanılmıyor)

- `numbers/double_oh` (4 kayıt) — Sadece pakette 'zerozero' yoksa kullanılır.
- `numbers/hour` (3 kayıt) — Saat cinsinden okuma yok.
- `numbers/hours` (3 kayıt) — Saat cinsinden okuma yok.
- `numbers/hundred_and` (1 kayıt) — Sadece İngilizce paketlerde; Türkçede 'yüz' kullanılıyor.
- `numbers/minus` (3 kayıt) — Negatif sayı okunmuyor.
- `numbers/oh` (2 kayıt) — Sadece '01'..'09' klasörleri yoksa kullanılır.
- `numbers/point` (2 kayıt) — Gerekmiyor: ondalıklar 'NpointM' / 'pointN' klasörleriyle okunuyor.
- Yüzde birler (tur zamanları onda bir hassasiyetle okunuyor). — 100 klasör: `point00`, `point01`, `point02`, `point03`, `point04`, `point05`, `point06`, `point07`, `point08`, `point09`, `point10`, `point11`, `point12`, `point13`, `point14`, `point15`, `point16`, `point17`, `point18`, `point19`, `point20`, `point21`, `point22`, `point23`, `point24`, `point25`, `point26`, `point27`, `point28`, `point29`, `point30`, `point31`, `point32`, `point33`, `point34`, `point35`, `point36`, `point37`, `point38`, `point39`, `point40`, `point41`, `point42`, `point43`, `point44`, `point45`, `point46`, `point47`, `point48`, `point49`, `point50`, `point51`, `point52`, `point53`, `point54`, `point55`, `point56`, `point57`, `point58`, `point59`, `point60`, `point61`, `point62`, `point63`, `point64`, `point65`, `point66`, `point67`, `point68`, `point69`, `point70`, `point71`, `point72`, `point73`, `point74`, `point75`, `point76`, `point77`, `point78`, `point79`, `point80`, `point81`, `point82`, `point83`, `point84`, `point85`, `point86`, `point87`, `point88`, `point89`, `point90`, `point91`, `point92`, `point93`, `point94`, `point95`, `point96`, `point97`, `point98`, `point99`
- `numbers/tenth` (3 kayıt) — Onda birler ondalık olarak okunuyor.
- `numbers/tenths` (3 kayıt) — Onda birler ondalık olarak okunuyor.
- `numbers/thousand_and` (1 kayıt) — Sadece İngilizce paketlerde; Türkçede 'bin' kullanılıyor.

## opponents (13 / 28 kullanılmıyor)

- Sürücü adı sesi ya da sesli komut gerekiyor. — 9 klasör: `cant_pronounce_name`, `has_just_been_disqualified`, `has_just_retired`, `is_now_leading`, `is_now_on`, `is_pitting`, `new_fastest_lap_for`, `the_leader`, `we_are`
- `opponents/one_lap_ahead` (3 kayıt) — Önünde sürücü adı ister.
- `opponents/one_lap_behind` (3 kayıt) — Önünde sürücü adı ister.
- `opponents/reputation_intro` (4 kayıt) — İtibar timings ifadeleriyle söyleniyor.
- `opponents/slow_car_ahead` (3 kayıt) — Öndeki yavaş araç ayrıca algılanmıyor.

## overtaking_aids (17 / 17 kullanılmıyor)

Kategorinin tamamı kullanılmıyor: Telemetrimizde DRS / push-to-pass / KERS verisi yok.

<details><summary>Klasörler</summary>

`a_few_tenths_off_drs_range`, `a_second_off_drs_range`, `activations_remaining`, `dont_forget_drs`, `drs_activations_remaining`, `drs_disabled`, `drs_enabled`, `five_ptp_activations_remaining`, `guy_behind_has_drs`, `no_activations_remaining`, `no_drs_activations_remaining`, `one_activation_remaining`, `push_to_pass_now_available`, `remember_to_use_kers`, `remember_to_use_ptp`, `ten_ptp_activations_remaining`, `three_ptp_activations_remaining`

</details>

## pace_notes (4 / 4 kullanılmıyor)

Kategorinin tamamı kullanılmıyor: Ralli pace-not kaydı; uygulanmadı.

<details><summary>Klasörler</summary>

`playback_ended`, `playback_started`, `recording_ended`, `recording_started`

</details>

## penalties (54 / 75 kullanılmıyor)

- Ceza türü/nedeni telemetride yok (sadece siyah/hasar/DSQ bayrakları). — 51 klasör: `car_to_car_collision`, `disqualified_driving_without_headlights`, `disqualified_exceeded_allowed_lap_count`, `disqualified_ignored_drive_through`, `disqualified_ignored_stop_and_go`, `disqualified_no_headlights`, `drive_through_cutting_track`, `drive_through_exceeding_single_stint_time`, `drive_through_false_start`, `drive_through_ignored_blue`, `drive_through_overtaking_on_formation_lap`, `drive_through_overtaking_under_pace_car`, `drive_through_overtaking_under_safety_car`, `drive_through_overtaking_under_yellow`, `drive_through_speeding_in_pit_lane`, `new_penalty_drivethrough`, `new_penalty_slowdown`, `new_penalty_stopgo`, `one_lap_to_serve_drive_through`, `one_lap_to_serve_stop_go`, `one_more_off_track_before_kick`, `penalty_not_served`, `penalty_one_lap_left_drivethrough`, `penalty_one_lap_left_stopgo`, `penalty_one_lap_left_to_pit`, `penalty_three_laps_left`, `penalty_two_laps_left`, `pit_now_drive_through`, `pit_now_stop_go`, `points_will_be_awarded_this_lap`, `slow_down_penalty_clear`, `slow_down_penalty_cutting_track`, `still_have_to_serve_drive_through`, `still_have_to_serve_stop_go`, `stop_go_exceeding_single_stint_time`, `stop_go_exitting_pits_on_red`, `stop_go_penalty_cutting_track`, `stop_go_penalty_false_start`, `stop_go_penalty_overtaking_on_formation_lap`, `stop_go_penalty_overtaking_under_pace_car`, `stop_go_penalty_overtaking_under_safety_car`, `stop_go_penalty_overtaking_under_yellow`, `stop_go_penalty_speeding_in_pit_lane`, `time_penalty`, `too_many_car_to_car_collisions`, `vsc_violation_penalty`, `warning_driving_too_slow`, `warning_enter_pits_to_avoid_exceeding_laps`, `warning_headlights_required`, `warning_headlights_required_when_raining`, `warning_unsportsmanlike_driving`
- `penalties/cut_track_in_prac_or_qual_next_invalid` (8 kayıt) — Sim sonraki turun geçersiz olacağını bildirmiyor.
- `penalties/you_dont_have_a_penalty` (3 kayıt) — Sesli komut cevabı.
- `penalties/you_have_a_penalty` (3 kayıt) — Siyah bayrak ifadeleri kullanılıyor.

## position (4 / 80 kullanılmıyor)

- `position/ahead` (3 kayıt) — İsimli farklar için bağlaç.
- `position/behind` (3 kayıt) — İsimli farklar için bağlaç.
- `position/expected_position_current_position_intro` (5 kayıt) — Beklenen sıra güç ifadeleriyle söyleniyor.
- `position/expected_position_current_position_leading` (5 kayıt) — Beklenen sıra güç ifadeleriyle söyleniyor.

## strategy (14 / 20 kullanılmıyor)

- Sesli komut ya da sürücü adı gerekiyor. — 14 klasör: `a_few_seconds_ahead_of`, `a_few_seconds_behind`, `acknowledge_time_pitstop`, `ahead_of`, `and`, `behind`, `between`, `close_between`, `is_pitting_from_position`, `just_ahead_of`, `just_behind`, `set_benchmark_laptime_first`, `we_are_sharing_our_pit_box_with`, `will_calculate_time_loss_from_next_lap`

## timings (13 / 29 kullanılmıyor)

- `timings/ahead_is_increasing` (3 kayıt) — gap_in_front_increasing kullanılıyor.
- `timings/ahead_is_now` (3 kayıt) — gap_in_front_is_now kullanılıyor.
- `timings/bad_reputation` (43 kayıt) — Önde/arkada itibar ifadeleri kullanılıyor.
- `timings/below_average_reputation` (23 kayıt) — Önde/arkada itibar ifadeleri kullanılıyor.
- `timings/behind_is_increasing` (3 kayıt) — gap_behind_increasing kullanılıyor.
- `timings/behind_is_now` (3 kayıt) — gap_behind_is_now kullanılıyor.
- `timings/he_is_faster_entering_corner` (6 kayıt) — Sürücü adı ya da viraj viraj karşılaştırma verisi gerekiyor.
- `timings/he_is_faster_through_corner` (6 kayıt) — Sürücü adı ya da viraj viraj karşılaştırma verisi gerekiyor.
- `timings/he_is_slower_entering_corner` (6 kayıt) — Sürücü adı ya da viraj viraj karşılaştırma verisi gerekiyor.
- `timings/he_is_slower_through_corner` (6 kayıt) — Sürücü adı ya da viraj viraj karşılaştırma verisi gerekiyor.
- `timings/in_the_gap_is_now` (3 kayıt) — Sürücü adı ya da viraj viraj karşılaştırma verisi gerekiyor.
- `timings/the_gap_to` (3 kayıt) — Sürücü adı ya da viraj viraj karşılaştırma verisi gerekiyor.
- `timings/seconds` (3 kayıt) — numbers/seconds kullanılıyor.

## tyre_monitor (112 / 182 kullanılmıyor)

- Fren sıcaklığı, basınç hedefi, kilitlenme/patinaj, flat spot, kir ya da hamur adı verisi yok. — 100 klasör: `all_tyres_dirty`, `alternates`, `are_about`, `bar`, `cold_brakes_all_round`, `cold_front_brakes`, `cold_rear_brakes`, `compound_a`, `compound_b`, `compound_c`, `compound_d`, `cooking_brakes_all_round`, `cooking_front_brakes`, `cooking_rear_brakes`, `damage_to_front_tyres`, `damage_to_left_front_tyre`, `damage_to_left_rear_tyre`, `damage_to_rear_tyres`, `damage_to_right_front_tyre`, `damage_to_right_rear_tyre`, `faster_than`, `front_pressures_high`, `front_pressures_low`, `front_pressures_ok`, `front_pressures_very_high`, `front_pressures_very_low`, `fronts_are_flat_spotted`, `good_brake_temps`, `hards`, `hot_brakes_all_round`, `hot_front_brakes`, `hot_rear_brakes`, `hyper_softs`, `intermediates`, `left_front`, `left_front_is_flat_spotted`, `left_front_pressure_high`, `left_front_pressure_low`, `left_front_pressure_ok`, `left_front_pressure_very_high`, `left_front_pressure_very_low`, `left_rear`, `left_rear_is_flat_spotted`, `left_rear_pressure_high`, `left_rear_pressure_low`, `left_rear_pressure_ok`, `left_rear_pressure_very_high`, `left_rear_pressure_very_low`, `left_tyres_dirty`, `locking_fronts_corner_warning`, `locking_fronts_lap_warning`, `locking_left_front_corner_warning`, `locking_left_front_lap_warning`, `locking_left_rear_lap_warning`, `locking_rears_corner_warning`, `locking_rears_lap_warning`, `locking_right_front_corner_warning`, `locking_right_front_lap_warning`, `locking_right_rear_lap_warning`, `mediums`, `options`, `primaries`, `primes`, `psi`, `rear_pressures_high`, `rear_pressures_low`, `rear_pressures_ok`, `rear_pressures_very_high`, `rear_pressures_very_low`, `rears_are_flat_spotted`, `right_front`, `right_front_is_flat_spotted`, `right_front_pressure_high`, `right_front_pressure_low`, `right_front_pressure_ok`, `right_front_pressure_very_high`, `right_front_pressure_very_low`, `right_rear`, `right_rear_is_flat_spotted`, `right_rear_pressure_high`, `right_rear_pressure_low`, `right_rear_pressure_ok`, `right_rear_pressure_very_high`, `right_rear_pressure_very_low`, `right_tyres_dirty`, `softs`, `spinning_fronts_corner_warning`, `spinning_fronts_lap_warning`, `spinning_left_front_corner_warning`, `spinning_left_front_lap_warning`, `spinning_left_rear_corner_warning`, `spinning_left_rear_lap_warning`, `spinning_rears_corner_warning`, `spinning_rears_lap_warning`, `spinning_right_front_corner_warning`, `spinning_right_front_lap_warning`, `spinning_right_rear_corner_warning`, `spinning_right_rear_lap_warning`, `super_softs`, `ultra_softs`
- `tyre_monitor/celsius_colder_than_outer` (5 kayıt) — Aks ortalamaları ('…outers') kullanılıyor.
- `tyre_monitor/celsius_hotter_than_outer` (5 kayıt) — Aks ortalamaları ('…outers') kullanılıyor.
- `tyre_monitor/good_wear` (3 kayıt) — Söylenmiyor (sadece aşınma uyarıları).
- `tyre_monitor/good_wear_general` (2 kayıt) — Söylenmiyor (sadece aşınma uyarıları).
- Aks ortalamaları kullanılıyor. — 8 klasör: `lf_inner_and_outer_are_same`, `lf_inner_is_running`, `lr_inner_and_outer_are_same`, `lr_inner_is_running`, `rf_inner_and_outer_are_same`, `rf_inner_is_running`, `rr_inner_and_outer_are_same`, `rr_inner_is_running`

## watched_opponents (25 / 25 kullanılmıyor)

Kategorinin tamamı kullanılmıyor: Rakip/takım arkadaşı izleme sesli komutla seçilir; konuşma tanıma yok.

<details><summary>Klasörler</summary>

`acknowledge_no_way_to_refer_to_driver`, `acknowledge_stop_watching_all`, `acknowledge_stop_watching_car_number`, `acknowledge_stop_watching_driver_name`, `acknowledge_stop_watching_rival`, `acknowledge_stop_watching_team_mate`, `acknowledge_unknown_driver`, `acknowledge_watch_rival`, `acknowledge_watch_team_mate`, `acknowledge_watch_with_car_number`, `acknowledge_we_will_watch`, `has_just_done_a`, `is_in_position`, `is_leaving_pits`, `is_now_in_position`, `rival_has_just_done_a`, `rival_is_leaving_pits`, `rival_is_now_in_position`, `rival_pitting_from_position`, `team_mate_has_just_done_a`, `team_mate_is_leaving_pits`, `team_mate_is_now_in_position`, `team_mate_pitting_from_position`, `your_rival`, `your_team_mate`

</details>

Not: `fuel/fuel.wav` bir ifade klasörü değil, `fuel` klasörünün içine düşmüş tek bir dosya; silinebilir.
