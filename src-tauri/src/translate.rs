//! Makine çevirisi (Yönetim › PRO tanıtım mesajı › "Diğer dillere çevir").
//! Anahtar gerektirmeyen MyMemory servisi kullanılır (istek başına ~500 karakter; uzun metin cümle/satır
//! bazında bölünür). İstek Rust'tan yapılır (tarayıcı CORS'una takılmasın).
//! "SRTR Pitwall" ve "PRO" çevrilmez: gönderilmeden önce yer tutucuya çevrilir, sonra geri konur.

use serde_json::Value;

/// İstek başına en fazla karakter (MyMemory sınırı 500 bayt; UTF-8 payı bırakılır)
const MAX_CHUNK: usize = 400;

/// Program dil kodu -> MyMemory dil kodu
fn code(lang: &str) -> &str {
    match lang {
        "pt-BR" => "pt-BR",
        "pt-PT" => "pt-PT",
        "zh-CN" => "zh-CN",
        "en" => "en-GB",
        other => other,
    }
}

fn enc(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Korunan adlar: çeviriye yer tutucu olarak gider
const KEEP: [(&str, &str); 2] = [("SRTR Pitwall", "XQZ1X"), ("PRO", "XQZ2X")];

fn protect(s: &str) -> String {
    let mut out = s.replace(KEEP[0].0, KEEP[0].1);
    // "PRO" sadece ayrı sözcükken (PROFİL gibi sözcüklerin içinde değil)
    let chars: Vec<char> = out.chars().collect();
    let mut res = String::with_capacity(out.len());
    let mut i = 0;
    while i < chars.len() {
        let is_pro = i + 3 <= chars.len()
            && chars[i] == 'P'
            && chars[i + 1] == 'R'
            && chars[i + 2] == 'O'
            && (i == 0 || !chars[i - 1].is_alphanumeric())
            && (i + 3 == chars.len() || !chars[i + 3].is_alphanumeric());
        if is_pro {
            res.push_str(KEEP[1].1);
            i += 3;
        } else {
            res.push(chars[i]);
            i += 1;
        }
    }
    out = res;
    out
}

fn restore(s: &str) -> String {
    let mut out = s.to_string();
    for (name, ph) in KEEP {
        // Servis yer tutucunun harf büyüklüğünü ya da aradaki boşluğu değiştirebilir
        for v in [ph.to_string(), ph.to_lowercase(), format!("{} {}", &ph[..3], &ph[3..]), format!("{} {}", &ph[..4], &ph[4..])] {
            out = out.replace(&v, name);
        }
    }
    out
}

/// Metni en fazla MAX_CHUNK karakterlik parçalara böler: önce satır, sonra cümle, olmazsa sözcük.
/// Satır sonları korunur (parça "\n" ise çevrilmeden geri eklenir).
fn chunks(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for (li, line) in text.split('\n').enumerate() {
        if li > 0 {
            out.push("\n".into());
        }
        if line.chars().count() <= MAX_CHUNK {
            out.push(line.to_string());
            continue;
        }
        let mut cur = String::new();
        let mut sentence = String::new();
        let flush_sentence = |sentence: &mut String, cur: &mut String, out: &mut Vec<String>| {
            if cur.chars().count() + sentence.chars().count() > MAX_CHUNK && !cur.is_empty() {
                out.push(std::mem::take(cur));
            }
            // Tek cümle sınırı aşıyorsa sözcüklerden böl
            if sentence.chars().count() > MAX_CHUNK {
                for w in sentence.split_inclusive(' ') {
                    if cur.chars().count() + w.chars().count() > MAX_CHUNK && !cur.is_empty() {
                        out.push(std::mem::take(cur));
                    }
                    cur.push_str(w);
                }
                sentence.clear();
            } else {
                cur.push_str(sentence);
                sentence.clear();
            }
        };
        let cs: Vec<char> = line.chars().collect();
        for (i, c) in cs.iter().enumerate() {
            sentence.push(*c);
            let end = matches!(c, '.' | '!' | '?' | '…') && cs.get(i + 1).map_or(true, |n| n.is_whitespace());
            if end {
                flush_sentence(&mut sentence, &mut cur, &mut out);
            }
        }
        flush_sentence(&mut sentence, &mut cur, &mut out);
        if !cur.is_empty() {
            out.push(cur);
        }
    }
    out
}

async fn one(part: &str, from: &str, to: &str) -> Result<String, String> {
    let url = format!(
        "https://api.mymemory.translated.net/get?q={}&langpair={}%7C{}",
        enc(part),
        enc(code(from)),
        enc(code(to))
    );
    let http = crate::livechat::net::http()?;
    let res = http.get(&url).send().await.map_err(|_| "Çeviri servisine bağlanılamadı".to_string())?;
    let http_status = res.status().as_u16();
    let body = res.text().await.map_err(|_| "Çeviri servisinin yanıtı okunamadı".to_string())?;
    if http_status == 429 {
        return Err("Günlük ücretsiz çeviri sınırı doldu, daha sonra tekrar dene".into());
    }
    let v: Value = serde_json::from_str(&body).map_err(|_| format!("Çeviri servisi beklenmeyen yanıt verdi ({http_status})"))?;
    let status = v.get("responseStatus").and_then(|s| s.as_u64().or_else(|| s.as_str().and_then(|x| x.parse().ok()))).unwrap_or(http_status as u64);
    let out = v.pointer("/responseData/translatedText").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let quota = status == 429 || out.to_uppercase().contains("MYMEMORY WARNING") || out.to_uppercase().contains("QUERY LENGTH LIMIT");
    if quota {
        return Err("Günlük ücretsiz çeviri sınırı doldu, daha sonra tekrar dene".into());
    }
    if status != 200 || out.trim().is_empty() {
        return Err(format!("Çeviri yapılamadı ({status})"));
    }
    Ok(decode_entities(&out))
}

fn decode_entities(s: &str) -> String {
    s.replace("&#39;", "'").replace("&quot;", "\"").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
}

/// Metni `from` dilinden `to` diline çevirir. Hata iletisi Türkçedir.
#[tauri::command]
pub async fn translate_text(text: String, from: String, to: String) -> Result<String, String> {
    if text.trim().is_empty() || from == to {
        return Ok(text);
    }
    if text.chars().count() > 5000 {
        return Err("Metin çok uzun".into());
    }
    let mut out = String::new();
    for part in chunks(&protect(&text)) {
        if part.trim().is_empty() {
            out.push_str(&part);
            continue;
        }
        // Baştaki/sondaki boşluk servis tarafından atılır: elle korunur
        let lead: String = part.chars().take_while(|c| c.is_whitespace()).collect();
        let trail: String = part.chars().rev().take_while(|c| c.is_whitespace()).collect::<Vec<_>>().into_iter().rev().collect();
        out.push_str(&lead);
        out.push_str(one(part.trim(), &from, &to).await?.trim());
        out.push_str(&trail);
    }
    Ok(restore(&out))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protects_names() {
        let p = protect("SRTR Pitwall PRO ol, PROFİL değil. PRO!");
        assert!(!p.contains("SRTR Pitwall"));
        assert!(p.contains("PROFİL"));
        assert_eq!(restore(&p), "SRTR Pitwall PRO ol, PROFİL değil. PRO!");
        assert_eq!(restore("xqz2x und XQZ 2X"), "PRO und PRO");
    }

    #[test]
    fn splits_long_text() {
        let s = "Bu bir cümle. ".repeat(80);
        let c = chunks(&s);
        assert!(c.len() > 1);
        assert!(c.iter().all(|x| x.chars().count() <= MAX_CHUNK));
        assert_eq!(c.concat(), s);
        assert_eq!(chunks("a\nb").concat(), "a\nb");
        let w = "kelime ".repeat(200);
        assert_eq!(chunks(&w).concat(), w);
    }

    #[test]
    fn encodes() {
        assert_eq!(enc("a b|ç"), "a%20b%7C%C3%A7");
    }
}
