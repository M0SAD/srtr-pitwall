// Windows'ta sürüm derlemesinde arka planda konsol penceresi açılmasın.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pitwall_lib::run()
}
