//! Sohbet anketi: izleyiciler sadece şık numarasını yazarak oy verir ("1", "#2", "3.").
//! Herkesin (platform + kullanıcı) ilk oyu geçerlidir. 2–9 şık, isteğe bağlı soru ve şık metinleri,
//! isteğe bağlı süre (0 = süresiz, elle bitirilir). Beraberlikte şıklar arasında yavaşlayarak gezen
//! bir vurgu rastgele birinde durur (MultiChatOverlay `_start_tiebreak` ile aynı zamanlama).

use super::model::Platform;
use serde::Serialize;
use std::collections::HashSet;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum PollState {
    #[default]
    Idle,
    Active,
    Result,
}

#[derive(Default)]
pub struct Poll {
    pub state: PollState,
    pub options: u8,
    pub counts: Vec<u32>,
    voters: HashSet<(Platform, String)>,
    pub question: String,
    pub answers: Vec<String>,
    /// Bitiş zamanı (süresizse None)
    pub ends_at: Option<f64>,
    pub result_until: f64,
    pub result_duration: f64,
    /// Beraberlik: berabere kalan şıklar (1'den başlar)
    pub tie: Vec<u8>,
    pub spinning: bool,
    pub highlight: u8,
    pub picked: Option<u8>,
    /// Dönme planı: (zaman, vurgulanan şık)
    spin: Vec<(f64, u8)>,
    spin_done_at: f64,
    /// Kaç kez değişti (arayüz yenilemesi için)
    pub rev: u64,
}

/// Oy denemesinin sonucu
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Vote {
    /// Oy biçiminde değil ya da anket yok
    No,
    /// Geçerli oy biçimi, sayıldı
    Counted(u8),
    /// Geçerli oy biçimi ama kullanıcı zaten oy vermişti
    Repeat(u8),
}

/// Mesaj SADECE bir sayıdan mı oluşuyor: `#?(\d{1,2})[.!]?`
pub fn parse_vote(text: &str) -> Option<u32> {
    let t = text.trim();
    let t = t.strip_prefix('#').unwrap_or(t);
    let t = t.strip_suffix('.').or_else(|| t.strip_suffix('!')).unwrap_or(t);
    if t.is_empty() || t.len() > 2 || !t.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    t.parse().ok()
}

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PollView {
    pub state: PollState,
    pub options: u8,
    pub counts: Vec<u32>,
    pub total: u32,
    /// Kalan saniye (süresizse null)
    pub remaining: Option<u32>,
    /// Bitiş (unix ms, süresizse null)
    pub ends_at: Option<u64>,
    /// Kazanan(lar) — dönerken o an vurgulanan şık
    pub winners: Vec<u8>,
    pub tie: Vec<u8>,
    pub spinning: bool,
    pub picked: Option<u8>,
    pub question: String,
    pub answers: Vec<String>,
    /// Türkçe özet (kayıt ve basit gösterim için; arayüz kendi metnini alanlardan kurabilir)
    pub result_text: String,
    pub rev: u64,
}

impl Poll {
    pub fn start(&mut self, options: u8, duration_secs: f64, question: &str, answers: &[String], result_duration: f64, now: f64) {
        let n = options.clamp(2, 9);
        let mut ans: Vec<String> = answers.iter().take(n as usize).map(|a| a.trim().chars().take(60).collect()).collect();
        ans.resize(n as usize, String::new());
        *self = Poll {
            state: PollState::Active,
            options: n,
            counts: vec![0; n as usize],
            question: question.trim().chars().take(200).collect(),
            answers: ans,
            ends_at: (duration_secs > 0.0).then(|| now + duration_secs.max(5.0)),
            result_duration: result_duration.clamp(3.0, 600.0),
            rev: self.rev + 1,
            ..Default::default()
        };
    }

    pub fn active(&self) -> bool {
        self.state == PollState::Active
    }

    pub fn vote(&mut self, platform: Platform, user: &str, text: &str) -> Vote {
        if self.state != PollState::Active {
            return Vote::No;
        }
        let Some(n) = parse_vote(text) else { return Vote::No };
        if n < 1 || n > self.options as u32 {
            return Vote::No;
        }
        let n = n as u8;
        let voter = (platform, user.trim().trim_start_matches('@').to_lowercase());
        if self.voters.insert(voter) {
            self.counts[n as usize - 1] += 1;
            self.rev += 1;
            Vote::Counted(n)
        } else {
            Vote::Repeat(n)
        }
    }

    /// Anketi bitirir; beraberlikte `pick` berabere kalanlardan birini seçer (rastgele).
    pub fn finish_with(&mut self, now: f64, pick: impl FnOnce(&[u8]) -> u8) {
        if self.state != PollState::Active {
            return;
        }
        self.state = PollState::Result;
        self.result_until = now + self.result_duration;
        self.rev += 1;
        let top = self.counts.iter().copied().max().unwrap_or(0);
        if top == 0 {
            return;
        }
        let tied: Vec<u8> = self.counts.iter().enumerate().filter(|(_, c)| **c == top).map(|(i, _)| i as u8 + 1).collect();
        if tied.len() < 2 {
            self.picked = tied.first().copied();
            return;
        }
        let chosen = pick(&tied);
        // Adımlar: 3-4 tur, son adım seçilen şıkta biter; aralar 70 ms'den ~520 ms'ye uzar
        let rounds = if tied.len() > 2 { 3 } else { 4 };
        let mut order: Vec<u8> = Vec::new();
        for _ in 0..rounds {
            order.extend(&tied);
        }
        let idx = tied.iter().position(|x| *x == chosen).unwrap_or(0);
        order.extend(&tied[..=idx]);
        let n = order.len();
        let mut t = now;
        self.spin.clear();
        for (i, o) in order.iter().enumerate() {
            self.spin.push((t, *o));
            let f = i as f64 / (n.max(2) - 1) as f64;
            t += (70.0 + 450.0 * f.powf(2.2)) / 1000.0;
        }
        self.spin_done_at = self.spin.last().map(|x| x.0).unwrap_or(now) + 0.65;
        self.tie = tied;
        self.spinning = true;
        self.highlight = order[0];
        self.picked = Some(chosen);
    }

    pub fn finish(&mut self, now: f64) {
        self.finish_with(now, |tied| tied[(rand_u64() % tied.len() as u64) as usize]);
    }

    pub fn cancel(&mut self) {
        let rev = self.rev + 1;
        *self = Poll { rev, ..Default::default() };
    }

    /// Zamanlayıcı: süresi biten anketi bitirir, dönme animasyonunu ilerletir, sonuç süresi bitince kapatır.
    /// Bir şey değiştiyse true.
    pub fn tick(&mut self, now: f64) -> bool {
        match self.state {
            PollState::Idle => false,
            PollState::Active => {
                if self.ends_at.is_some_and(|e| now >= e) {
                    self.finish(now);
                    return true;
                }
                false
            }
            PollState::Result => {
                if self.spinning {
                    if now >= self.spin_done_at {
                        self.spinning = false;
                        self.result_until = now + self.result_duration;
                        self.rev += 1;
                        return true;
                    }
                    let cur = self.spin.iter().rev().find(|(t, _)| *t <= now).map(|x| x.1).unwrap_or(self.highlight);
                    if cur != self.highlight {
                        self.highlight = cur;
                        self.rev += 1;
                        return true;
                    }
                    return false;
                }
                if now >= self.result_until {
                    self.cancel();
                    return true;
                }
                false
            }
        }
    }

    pub fn view(&self, now: f64) -> PollView {
        if self.state == PollState::Idle {
            return PollView { rev: self.rev, ..Default::default() };
        }
        let total: u32 = self.counts.iter().sum();
        let ans = |n: u8| self.answers.get(n as usize - 1).cloned().unwrap_or_default();
        let (winners, text) = if self.state == PollState::Result {
            if self.spinning {
                (vec![self.highlight], "Beraberlik — rastgele seçiliyor…".to_string())
            } else if !self.tie.is_empty() {
                let n = self.picked.unwrap_or(self.tie[0]);
                let list = self.tie.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(", ");
                let a = ans(n);
                let a = if a.is_empty() { String::new() } else { format!(" — {a}") };
                (vec![n], format!("Beraberlik ({list}), rastgele seçilen: {n}{a} ({} oy)", self.counts[n as usize - 1]))
            } else if let Some(n) = self.picked {
                let c = self.counts[n as usize - 1];
                let pct = if total > 0 { (c as f64 * 100.0 / total as f64).round() as u32 } else { 0 };
                let a = ans(n);
                let head = if a.is_empty() { format!("Kazanan: {n}") } else { format!("Kazanan: {n} — {a}") };
                (vec![n], format!("{head} ({c} oy, %{pct})"))
            } else {
                (vec![], "Hiç oy gelmedi".to_string())
            }
        } else {
            (vec![], String::new())
        };
        PollView {
            state: self.state,
            options: self.options,
            counts: self.counts.clone(),
            total,
            remaining: self.ends_at.map(|e| (e - now).max(0.0).ceil() as u32),
            ends_at: self.ends_at.map(|e| (e * 1000.0) as u64),
            winners,
            tie: self.tie.clone(),
            spinning: self.spinning,
            picked: if self.spinning { None } else { self.picked },
            // Soru sadece anket sürerken (ve sonuçta) gösterilir
            question: self.question.clone(),
            answers: self.answers.clone(),
            result_text: text,
            rev: self.rev,
        }
    }
}

/// Basit rastgele sayı (zaman + sayaç, xorshift); kriptografik değil
pub fn rand_u64() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEED: AtomicU64 = AtomicU64::new(0);
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(1);
    let mut x = t ^ SEED.fetch_add(0x9E37_79B9_7F4A_7C15, Ordering::Relaxed);
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    x
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn votes() {
        assert_eq!(parse_vote("1"), Some(1));
        assert_eq!(parse_vote(" #2 "), Some(2));
        assert_eq!(parse_vote("3."), Some(3));
        assert_eq!(parse_vote("12!"), Some(12));
        assert_eq!(parse_vote("1 bence"), None);
        assert_eq!(parse_vote("123"), None);
        assert_eq!(parse_vote(""), None);

        let mut p = Poll::default();
        assert_eq!(p.vote(Platform::Twitch, "a", "1"), Vote::No);
        p.start(3, 60.0, "Hangisi?", &["Bir".into()], 15.0, 0.0);
        assert_eq!(p.answers, vec!["Bir".to_string(), String::new(), String::new()]);
        assert_eq!(p.vote(Platform::Twitch, "a", "1"), Vote::Counted(1));
        assert_eq!(p.vote(Platform::Twitch, "A", "2"), Vote::Repeat(2));
        assert_eq!(p.vote(Platform::Kick, "a", "2"), Vote::Counted(2));
        assert_eq!(p.vote(Platform::Kick, "b", "4"), Vote::No);
        assert_eq!(p.vote(Platform::Kick, "b", "0"), Vote::No);
        assert_eq!(p.vote(Platform::Kick, "c", "2"), Vote::Counted(2));
        assert_eq!(p.counts, vec![1, 2, 0]);
        let v = p.view(10.0);
        assert_eq!(v.remaining, Some(50));
        // Süre bitince sonuç
        assert!(p.tick(60.0));
        let v = p.view(60.0);
        assert_eq!(v.state, PollState::Result);
        assert_eq!(v.winners, vec![2]);
        assert_eq!(v.result_text, "Kazanan: 2 (2 oy, %67)");
        // Sonuç süresi bitince kapanır
        assert!(p.tick(80.0));
        assert_eq!(p.state, PollState::Idle);
    }

    #[test]
    fn no_timer_and_no_votes() {
        let mut p = Poll::default();
        p.start(2, 0.0, "", &[], 15.0, 0.0);
        assert!(!p.tick(10_000.0));
        assert_eq!(p.view(5.0).remaining, None);
        p.finish(10.0);
        assert_eq!(p.view(10.0).result_text, "Hiç oy gelmedi");
    }

    #[test]
    fn tiebreak() {
        let mut p = Poll::default();
        p.start(3, 30.0, "", &["A".into(), "B".into(), "C".into()], 15.0, 0.0);
        p.vote(Platform::Twitch, "x", "1");
        p.vote(Platform::Twitch, "y", "3");
        p.finish_with(1.0, |tied| {
            assert_eq!(tied, &[1, 3]);
            3
        });
        assert!(p.spinning);
        assert_eq!(p.view(1.0).picked, None);
        let mut t = 1.0;
        let mut seen = vec![];
        while p.spinning {
            t += 0.05;
            if p.tick(t) && p.spinning {
                seen.push(p.highlight);
            }
            assert!(t < 30.0);
        }
        assert!(seen.contains(&1) && seen.contains(&3));
        assert_eq!(p.highlight, 3);
        let v = p.view(t);
        assert_eq!(v.picked, Some(3));
        assert_eq!(v.result_text, "Beraberlik (1, 3), rastgele seçilen: 3 — C (1 oy)");
        assert_eq!(p.state, PollState::Result);
    }
}
