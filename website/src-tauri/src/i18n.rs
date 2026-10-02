//! Arayüz dili: Rust tarafında görünen metinler (tepsi menüsü, pencere başlıkları, oturum
//! özetleri). Çeviriler panelden `i18n_set` ile gelir; anahtarlar Türkçe kaynak metinlerdir.

use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::OnceLock;

fn table() -> &'static Mutex<HashMap<String, String>> {
    static T: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    T.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn set(strings: HashMap<String, String>) {
    *table().lock() = strings;
}

/// Türkçe kaynak metnin karşılığı (yoksa kendisi)
pub fn tr(key: &str) -> String {
    table().lock().get(key).cloned().unwrap_or_else(|| key.to_string())
}

/// `{0}`, `{1}` yer tutucularını doldurur
pub fn trf(key: &str, args: &[&dyn std::fmt::Display]) -> String {
    let mut s = tr(key);
    for (i, a) in args.iter().enumerate() {
        s = s.replace(&format!("{{{i}}}"), &a.to_string());
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fills() {
        assert_eq!(trf("Port {0} açılamadı: {1}", &[&8910, &"x"]), "Port 8910 açılamadı: x");
    }
}
