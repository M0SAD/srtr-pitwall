//! Tahmini iRating değişimi (yarış). Topluluğun yaygın kullandığı hesap (iRacing hesaplayıcı tabloları):
//! her sürücü çifti için kazanma olasılığı 1/(1+exp((ir_b-ir_a)/br)) eğrisinin iRacing biçimi
//! (br = 1600/ln 2), beklenen skor = olasılıkların toplamı − 0.5, yarışa başlamayanlar için düzeltme payı.
//! Sınıf başına ayrı çağrılır. Resmi sonuç değildir: iRacing kesin değeri yarış bitince kendi hesaplar.

const BR: f64 = 1600.0 / std::f64::consts::LN_2;

/// Sınıftaki bir sürücü
#[derive(Clone, Copy, Debug)]
pub struct Entry {
    pub irating: i32,
    /// Sınıf içi sıra, başlayanlar arasında 1..N (başlamayanlarda kullanılmaz)
    pub pos: i32,
    /// Yarışa başladı mı (sıralaması var mı)
    pub started: bool,
}

/// `field` ile aynı sırada tahmini değişimler. Hesaplanamıyorsa (tek araç, iRating yok, kimse başlamadı) sıfırlar.
pub fn estimate(field: &[Entry]) -> Vec<i32> {
    let n = field.len();
    let starters = field.iter().filter(|e| e.started).count();
    if n < 2 || starters == 0 || !field.iter().any(|e| e.irating > 0) {
        return vec![0; n];
    }
    let non_starters = n - starters;
    let e: Vec<f64> = field.iter().map(|x| (-(x.irating.max(1) as f64) / BR).exp()).collect();
    // a'nın b'yi yenme olasılığı
    let chance = |a: usize, b: usize| {
        let (ea, eb) = (e[a], e[b]);
        ((1.0 - ea) * eb) / ((1.0 - eb) * ea + (1.0 - ea) * eb)
    };
    let nf = n as f64;
    let nsf = non_starters as f64;
    // Beklenen skor: yenmesi beklenen rakip sayısı (kendisiyle eşleşme 0.5 sayılır, çıkarılır)
    let expected: Vec<f64> = (0..n).map(|i| (0..n).map(|j| chance(i, j)).sum::<f64>() - 0.5).collect();
    let mut out = vec![0f64; n];
    let mut sum_starters = 0.0;
    for i in 0..n {
        if !field[i].started {
            continue;
        }
        let pos = field[i].pos as f64;
        let fudge = ((nf - nsf / 2.0) / 2.0 - pos) / 100.0;
        out[i] = (nf - pos - expected[i] - fudge) * 200.0 / starters as f64;
        sum_starters += out[i];
    }
    if non_starters > 0 {
        // Başlayanların toplam kazancı başlamayanlara beklenen skorları oranında dağıtılır (ters işaretle)
        let avg: f64 = (0..n).filter(|&i| !field[i].started).map(|i| expected[i]).sum::<f64>() / nsf;
        for i in 0..n {
            if !field[i].started {
                out[i] = if avg.abs() > 1e-9 { -sum_starters / nsf * expected[i] / avg } else { 0.0 };
            }
        }
    }
    out.into_iter().map(|v| v.round() as i32).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn e(irating: i32, pos: i32, started: bool) -> Entry {
        Entry { irating, pos, started }
    }

    #[test]
    fn favourite_gains_little_underdog_gains_much() {
        let d = estimate(&[e(3000, 1, true), e(2000, 2, true), e(1000, 3, true)]);
        let u = estimate(&[e(1000, 1, true), e(2000, 2, true), e(3000, 3, true)]);
        assert!(d[0] > 0 && d[2] < 0);
        assert!(u[0] > d[0] && u[2] < d[2]);
    }

    #[test]
    fn roughly_zero_sum_and_non_starters_lose() {
        let f = [e(2500, 1, true), e(1800, 2, true), e(2200, 3, true), e(1500, 4, true), e(2000, 0, false)];
        let d = estimate(&f);
        assert!(d[4] < 0);
        assert!(d.iter().sum::<i32>().abs() <= 3);
    }

    #[test]
    fn degenerate_fields() {
        assert_eq!(estimate(&[e(2000, 1, true)]), vec![0]);
        assert_eq!(estimate(&[e(0, 1, true), e(0, 2, true)]), vec![0, 0]);
        assert_eq!(estimate(&[e(2000, 0, false), e(1500, 0, false)]), vec![0, 0]);
    }
}
