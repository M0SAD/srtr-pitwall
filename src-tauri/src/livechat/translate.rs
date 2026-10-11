//! Altyazı çevirisi (PRO: `livechat.translate`).
//!
//! Konuşma → yazının "Çevrimiçi (Whisper)" motoru bir cümleyi yazıya döktükten sonra (ör. oyunda / Discord'da İngilizce
//! konuşan biri) cümle, seçilen dile çevrilip altyazıya öyle yazılır. Çeviri aynı OpenAI uyumlu sunucunun sohbet ucuyla
//! yapılır (`POST {url}/chat/completions`, aynı API anahtarı): Groq'ta Llama, OpenAI'da gpt-4o-mini; kendi sunucunda
//! model adı ayardan. Ek hesap gerekmez.
//!
//! Cümleler sırayla çevrilir (tek iş parçacığı): altyazıda sıra bozulmaz. Çeviri başarısız olursa cümle olduğu gibi
//! (çevrilmeden) yazılır ve durum satırında kısa bir uyarı çıkar.

use super::stt_cloud::{check_url, RunErr};

pub const FEATURE: &str = "livechat.translate";

#[derive(Clone, Debug, PartialEq, Default)]
pub struct TrCfg {
    /// OpenAI uyumlu taban adres (Whisper ile aynı)
    pub url: String,
    pub key: String,
    /// Sohbet modeli (boş: sunucuya göre varsayılan)
    pub model: String,
    /// Hedef dil kodu ("tr", "en"…)
    pub target: String,
}

/// Sunucuya göre varsayılan sohbet modeli
pub fn default_model(url: &str) -> &'static str {
    let u = url.to_ascii_lowercase();
    if u.contains("openai.com") {
        "gpt-4o-mini"
    } else {
        // Groq ve çoğu OpenAI uyumlu sunucu
        "llama-3.3-70b-versatile"
    }
}

/// Dil kodunun İngilizce adı (modele verilen talimat için)
pub fn language_name(code: &str) -> &'static str {
    match code.split(['-', '_']).next().unwrap_or("").to_ascii_lowercase().as_str() {
        "tr" => "Turkish",
        "en" => "English",
        "de" => "German",
        "fr" => "French",
        "es" => "Spanish",
        "it" => "Italian",
        "pt" => "Portuguese",
        "nl" => "Dutch",
        "pl" => "Polish",
        "fi" => "Finnish",
        "sv" => "Swedish",
        "ru" => "Russian",
        "ja" => "Japanese",
        "zh" => "Simplified Chinese",
        _ => "Turkish",
    }
}

fn prompt(target: &str) -> String {
    let lang = language_name(target);
    format!(
        "You translate live subtitles from sim racing voice chat (iRacing, Discord, team radio) into {lang}. \
         Translate the user's message into natural, short spoken {lang}. Keep racing terms understandable \
         (pit, box, DRS, safety car, blue flag, push, gap, lap). Keep names, numbers and car numbers as they are. \
         If the message is already in {lang}, return it unchanged. If it is only noise or meaningless, return it unchanged. \
         Output only the translation: no quotes, no notes, no explanations."
    )
}

/// Modelin yanıtını temizle: tırnak, "Translation:" gibi önekler
fn clean(out: &str) -> String {
    let mut s = out.trim();
    for p in ["Translation:", "Çeviri:", "Translated:"] {
        if let Some(r) = s.strip_prefix(p) {
            s = r.trim();
        }
    }
    let s = s.trim_matches(|c| c == '"' || c == '“' || c == '”' || c == '\'');
    s.lines().map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join(" ")
}

pub async fn translate(cfg: &TrCfg, text: &str) -> Result<String, RunErr> {
    let base = check_url(&cfg.url).map_err(|e| (true, e))?;
    let model = if cfg.model.trim().is_empty() { default_model(&cfg.url).to_string() } else { cfg.model.trim().to_string() };
    let body = serde_json::json!({
        "model": model,
        "temperature": 0.2,
        "max_tokens": 300,
        "messages": [
            { "role": "system", "content": prompt(&cfg.target) },
            { "role": "user", "content": text },
        ],
    });
    let client = super::net::http().map_err(|e| (false, e))?;
    let mut req = client.post(format!("{base}/chat/completions")).json(&body);
    if !cfg.key.is_empty() {
        req = req.bearer_auth(&cfg.key);
    }
    let resp = req.send().await.map_err(|e| {
        let m = if e.is_timeout() { "Çeviri sunucusu yanıt vermedi (zaman aşımı)." } else { "Çeviri isteği gönderilemedi." };
        (false, m.to_string())
    })?;
    let status = resp.status().as_u16();
    let raw = resp.text().await.unwrap_or_default();
    let v: serde_json::Value = serde_json::from_str(&raw).unwrap_or(serde_json::Value::Null);
    let msg = || {
        v.pointer("/error/message").or_else(|| v.pointer("/message")).and_then(|x| x.as_str()).unwrap_or("").chars().take(160).collect::<String>()
    };
    match status {
        200..=299 => {
            let out = v.pointer("/choices/0/message/content").and_then(|x| x.as_str()).unwrap_or("");
            let out = clean(out);
            if out.is_empty() {
                Err((false, "Çeviri boş döndü.".into()))
            } else {
                Ok(out)
            }
        }
        401 | 403 => Err((true, "Çeviri: API anahtarı geçersiz ya da yetkisiz.".into())),
        404 => Err((true, format!("Çeviri modeli bulunamadı (404): model adını ({model}) kontrol edin. {}", msg()))),
        429 => Err((false, "Çeviri kotası / hız sınırı doldu; cümle çevrilmeden yazıldı.".into())),
        _ => Err((false, format!("Çeviri sunucusu hata verdi ({status}). {}", msg()))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_model_output() {
        assert_eq!(clean("  \"Pite gir, lastikler bitti\" "), "Pite gir, lastikler bitti");
        assert_eq!(clean("Translation: Arkandayım\n"), "Arkandayım");
        assert_eq!(clean("Bir\n\nİki"), "Bir İki");
    }

    #[test]
    fn models_and_languages() {
        assert_eq!(default_model("https://api.openai.com/v1"), "gpt-4o-mini");
        assert_eq!(default_model("https://api.groq.com/openai/v1"), "llama-3.3-70b-versatile");
        assert_eq!(language_name("tr"), "Turkish");
        assert_eq!(language_name("pt-BR"), "Portuguese");
        assert_eq!(language_name("zh-CN"), "Simplified Chinese");
    }
}
