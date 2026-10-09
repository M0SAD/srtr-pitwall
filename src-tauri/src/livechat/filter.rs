//! Moderasyon: kelime filtresi (yıldızla / gizle, "kelime*" önek), bağlantı engeli, tekrar (spam) filtresi,
//! metindeki bağlantıları parçalara ayırma. MultiChatOverlay `yardimci.py` (WordFilter, LINK_RE) ile aynı kurallar.

use super::model::{Part, Platform};
use std::collections::HashMap;

/// Python'daki `\w`
pub fn is_w(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Türkçe uyumlu küçük harf + ı/i farkını yok say (filtre atlatılamasın). Uzunluk korunur (karakter başına bir karakter).
pub fn norm_chars(s: &str) -> Vec<char> {
    s.chars()
        .map(|c| match c {
            'İ' | 'I' | 'ı' => 'i',
            _ => c.to_lowercase().next().unwrap_or(c),
        })
        .collect()
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct WordFilter {
    /// (normalize edilmiş kelime, önek mi)
    words: Vec<(Vec<char>, bool)>,
}

impl WordFilter {
    /// Virgülle (ya da satırla) ayrılmış liste. "kelime*" → o kelimeyle başlayanlar; diğerleri tam kelime.
    pub fn new(list: &str) -> WordFilter {
        let mut words = Vec::new();
        for w in list.split(|c| c == ',' || c == '\n') {
            let w = w.trim();
            let prefix = w.ends_with('*');
            let w = w.trim_end_matches('*').trim();
            if w.is_empty() {
                continue;
            }
            words.push((norm_chars(w), prefix));
        }
        WordFilter { words }
    }

    pub fn active(&self) -> bool {
        !self.words.is_empty()
    }

    /// Eşleşen aralıklar (karakter indeksleri, [başlangıç, bitiş))
    fn ranges(&self, text: &[char]) -> Vec<(usize, usize)> {
        let mut out = Vec::new();
        for (w, prefix) in &self.words {
            let n = w.len();
            if n == 0 || n > text.len() {
                continue;
            }
            let mut i = 0;
            while i + n <= text.len() {
                let left_ok = i == 0 || !is_w(text[i - 1]);
                if left_ok && text[i..i + n] == w[..] {
                    let mut end = i + n;
                    if *prefix {
                        while end < text.len() && is_w(text[end]) {
                            end += 1;
                        }
                        out.push((i, end));
                        i = end.max(i + 1);
                        continue;
                    } else if end == text.len() || !is_w(text[end]) {
                        out.push((i, end));
                        i = end;
                        continue;
                    }
                }
                i += 1;
            }
        }
        out
    }

    pub fn matches(&self, text: &str) -> bool {
        self.active() && !self.ranges(&norm_chars(text)).is_empty()
    }

    /// Eşleşen kelimeleri ilk harfi kalacak şekilde yıldızlar ("kötü" → "k***"). Değişiklik yoksa None.
    pub fn mask(&self, text: &str) -> Option<String> {
        if !self.active() {
            return None;
        }
        let norm = norm_chars(text);
        let ranges = self.ranges(&norm);
        if ranges.is_empty() {
            return None;
        }
        let mut chars: Vec<char> = text.chars().collect();
        for (s, e) in ranges {
            for c in chars.iter_mut().take(e).skip(s + 1) {
                if !c.is_whitespace() {
                    *c = '*';
                }
            }
        }
        Some(chars.into_iter().collect())
    }

    /// Mesaj parçalarındaki metinleri yıldızlar (emote/bağlantı adlarına dokunmaz). Değiştiyse true.
    pub fn mask_parts(&self, parts: &mut [Part]) -> bool {
        let mut changed = false;
        for p in parts.iter_mut() {
            if let Part::Text { v } = p {
                if let Some(m) = self.mask(v) {
                    *v = m;
                    changed = true;
                }
            }
        }
        changed
    }
}

const TLDS: [&str; 19] = [
    "com", "net", "org", "tv", "gg", "io", "me", "xyz", "ly", "co", "tr", "ru", "info", "biz", "link", "site", "live", "app", "com.tr",
];

/// Kelime bir bağlantı mı (http(s)://, www., ya da alanadı.uzantı)
fn token_is_link(tok: &str) -> bool {
    let low = tok.to_lowercase();
    if low.contains("http://") || low.contains("https://") || low.starts_with("www.") || low.contains("://www.") {
        return true;
    }
    let chars: Vec<char> = low.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        if c != '.' || i == 0 {
            continue;
        }
        let prev = chars[i - 1];
        if !(is_w(prev) || prev == '-') {
            continue;
        }
        let tld: String = chars[i + 1..].iter().take_while(|c| is_w(**c)).collect();
        if TLDS.contains(&tld.as_str()) {
            return true;
        }
    }
    false
}

/// Metinde bağlantı var mı (LINK_RE karşılığı)
pub fn has_link(text: &str) -> bool {
    text.split_whitespace().any(token_is_link)
}

/// Metin parçalarındaki bağlantıları ayrı "link" parçalarına böler
pub fn linkify(parts: Vec<Part>) -> Vec<Part> {
    let mut out = Vec::with_capacity(parts.len());
    for p in parts {
        let Part::Text { v } = &p else {
            out.push(p);
            continue;
        };
        if !has_link(v) {
            out.push(p);
            continue;
        }
        let mut buf = String::new();
        let mut rest = v.as_str();
        while !rest.is_empty() {
            let ws_end = rest.find(|c: char| !c.is_whitespace()).unwrap_or(rest.len());
            buf.push_str(&rest[..ws_end]);
            rest = &rest[ws_end..];
            if rest.is_empty() {
                break;
            }
            let tok_end = rest.find(char::is_whitespace).unwrap_or(rest.len());
            let tok = &rest[..tok_end];
            rest = &rest[tok_end..];
            if token_is_link(tok) {
                // Sondaki noktalama bağlantıya dahil değil
                let core = tok.trim_end_matches(|c: char| ".,!?;:)]}'\"".contains(c));
                let tail = &tok[core.len()..];
                let core_low = core.to_lowercase();
                let url = if core_low.starts_with("http://") || core_low.starts_with("https://") {
                    core.to_string()
                } else {
                    format!("https://{core}")
                };
                if !buf.is_empty() {
                    out.push(Part::text(std::mem::take(&mut buf)));
                }
                out.push(Part::Link { url, v: core.to_string() });
                buf.push_str(tail);
            } else {
                buf.push_str(tok);
            }
        }
        if !buf.is_empty() {
            out.push(Part::text(buf));
        }
    }
    out
}

/// Aynı kullanıcının aynı mesajı `window` saniye içinde tekrar yazması. Her tekrar süreyi tazeler.
#[derive(Default)]
pub struct SpamFilter {
    last: HashMap<(Platform, String), (String, f64)>,
}

impl SpamFilter {
    /// true: tekrar (gizle)
    pub fn check(&mut self, platform: Platform, user: &str, text: &str, now: f64, window: f64) -> bool {
        let key = (platform, user.trim().trim_start_matches('@').to_lowercase());
        let norm = text.trim().to_string();
        let dup = match self.last.get(&key) {
            Some((t, ts)) => *t == norm && now - ts < window,
            None => false,
        };
        self.last.insert(key, (norm, now));
        if self.last.len() > 4000 {
            self.last.retain(|_, (_, ts)| now - *ts < window);
        }
        dup
    }

    pub fn clear(&mut self) {
        self.last.clear();
    }
}

/// Kullanıcı adını yasak listesi için normalleştirir ("@Ali " → "ali")
pub fn norm_user(s: &str) -> String {
    s.trim().trim_start_matches('@').to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn word_filter() {
        let f = WordFilter::new("kötü, salak*,  ");
        assert!(f.matches("bu çok KÖTÜ bir şey"));
        assert!(!f.matches("kötülük"));
        assert!(f.matches("salaklık yapma"));
        assert_eq!(f.mask("Kötü ve salaklar!").unwrap(), "K*** ve s*******!");
        assert!(f.mask("temiz mesaj").is_none());
        // ı/İ farkı atlatılamaz
        let f = WordFilter::new("aptal");
        assert!(f.matches("APTAL"));
        let f = WordFilter::new("şişli");
        assert!(f.matches("ŞİŞLİ"));
        assert!(f.matches("şışlı"));
        let mut parts = vec![Part::text("hey aptal "), Part::Emote { url: "u".into(), name: "aptal".into(), custom: false }];
        assert!(WordFilter::new("aptal").mask_parts(&mut parts));
        assert_eq!(parts[0], Part::text("hey a**** "));
        assert_eq!(parts[1], Part::Emote { url: "u".into(), name: "aptal".into(), custom: false });
    }

    #[test]
    fn links() {
        assert!(has_link("bak https://x.y/z"));
        assert!(has_link("www.site.org"));
        assert!(has_link("gel simracetr.com/abc"));
        assert!(has_link("discord.gg/xyz"));
        assert!(!has_link("computer science"));
        assert!(!has_link("tamam. sonra"));
        assert!(!has_link("1.5 saniye"));
        let p = linkify(vec![Part::text("bak: simracetr.com, güzel")]);
        assert_eq!(
            p,
            vec![
                Part::text("bak: "),
                Part::Link { url: "https://simracetr.com".into(), v: "simracetr.com".into() },
                Part::text(", güzel")
            ]
        );
    }

    #[test]
    fn spam() {
        let mut s = SpamFilter::default();
        assert!(!s.check(Platform::Twitch, "Ali", "selam", 0.0, 10.0));
        assert!(s.check(Platform::Twitch, "ali", "selam", 5.0, 10.0));
        assert!(s.check(Platform::Twitch, "ali", "selam", 14.0, 10.0)); // süre tazelendi
        assert!(!s.check(Platform::Twitch, "ali", "selam", 30.0, 10.0));
        assert!(!s.check(Platform::Kick, "ali", "selam", 31.0, 10.0));
        assert!(!s.check(Platform::Twitch, "ali", "başka", 32.0, 10.0));
    }
}
