//! Edge çevrimiçi sesleri: Sec-MS-GEC v2 belirteci. Microsoft 13 Ekim 2026'da v1 belirtecini (dosya zamanı + belirteç
//! → SHA-256) reddetmeye başladı; her istek 403 döndü. v2: aynı metin (5 dakikaya yuvarlanmış Windows dosya zamanı,
//! 100 ns adım + istemci belirteci), sabit bir önekle değiştirilmiş SHA-256 ve CS64 özeti; biçim "<16 hex>-<64 hex>",
//! sürüm "2-<Chromium sürümü>". edge-tts 7.3.x `drm.py`'nin birebir karşılığıdır (LGPL-3.0, rany2/edge-tts); test
//! değerleri oradan üretildi.

const WIN_EPOCH: f64 = 11_644_473_600.0;

const SHA256_INITIAL: [u32; 8] = [
    0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
];
const SHA256_STATE: [u32; 8] = [
    0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2,
];
const SHA256_SCHEDULE: [u32; 14] = [
    0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6, 0xF0C31573,
    0x7058CE4E, 0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564,
];
const K: [u32; 64] = [
    0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5, 0xD807AA98,
    0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174, 0xE49B69C1, 0xEFBE4786,
    0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA, 0x983E5152, 0xA831C66D, 0xB00327C8,
    0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967, 0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13,
    0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85, 0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819,
    0xD6990624, 0xF40E3585, 0x106AA070, 0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A,
    0x5B9CCA4F, 0x682E6FF3, 0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7,
    0xC67178F2,
];
const SHA256_ADJUSTMENT: u32 = 0xC9DC06A7;
const SIGMA0_ADJUSTMENT: u32 = 0x059C0B80;
const SIGMA1_ADJUSTMENT: u32 = 0x000B92C0;

const CS64_COEFFICIENTS: [(u32, u32); 14] = [
    (0xE82E91B1, 0xB32700D0),
    (0x44DE24C6, 0x88DFF51D),
    (0x3BEB65BC, 0x29514038),
    (0xC89C5933, 0xB328CBDF),
    (0x8D1EC211, 0xD405B4D5),
    (0x314EF5D5, 0x26E55F3C),
    (0xE92491B1, 0x607801C6),
    (0xF0A5B9D5, 0x82B2C1FB),
    (0x06064CF3, 0xFA51A3DA),
    (0xDA79FA60, 0x207CC464),
    (0xBED20560, 0x3C3C74F3),
    (0x89F9C9F8, 0xD2D14B61),
    (0x35FA38C6, 0xBB04A2C1),
    (0xCB49E3C6, 0xC5626167),
];
const CS64_FACTOR: u32 = 0x82893933;
const CS64_ADJUSTMENT0: u32 = 0xF2F90B1A;
const CS64_ADJUSTMENT1: u32 = 0x0B1A0000;

fn rol16(v: u32) -> u32 {
    v.rotate_left(16)
}
fn sigma0(v: u32) -> u32 {
    v.rotate_right(7) ^ v.rotate_right(18) ^ (v >> 3)
}
fn sigma1(v: u32) -> u32 {
    v.rotate_right(17) ^ v.rotate_right(19) ^ (v >> 10)
}

/// SHA-256 turları (`first` turundan başlayarak; 14'ten başlarken 14. sabit değiştirilmiş)
fn rounds(state: [u32; 8], w: &[u32; 64], first: usize) -> [u32; 8] {
    let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = state;
    for i in first..64 {
        let k = if first == 14 && i == 14 { SHA256_ADJUSTMENT } else { K[i] };
        let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let ch = g ^ (e & (f ^ g));
        let t1 = h.wrapping_add(s1).wrapping_add(ch).wrapping_add(k).wrapping_add(w[i]);
        let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let maj = (a & b) | (c & (a | b));
        let t2 = s0.wrapping_add(maj);
        h = g;
        g = f;
        f = e;
        e = d.wrapping_add(t1);
        d = c;
        c = b;
        b = a;
        a = t1.wrapping_add(t2);
    }
    [a, b, c, d, e, f, g, h]
}

fn expand(w: &mut [u32; 64], from: usize) {
    for i in from..64 {
        w[i] = sigma1(w[i - 2]).wrapping_add(w[i - 7]).wrapping_add(sigma0(w[i - 15])).wrapping_add(w[i - 16]);
    }
}

fn add8(x: [u32; 8], y: [u32; 8]) -> [u32; 8] {
    let mut o = [0u32; 8];
    for i in 0..8 {
        o[i] = x[i].wrapping_add(y[i]);
    }
    o
}

/// İlk blok (sabit önek + verinin ilk 7 baytı) sonrası durum
fn sha_init(d7: &[u8]) -> [u32; 8] {
    let mut w = [0u32; 64];
    w[14] = u32::from_be_bytes([0, d7[0], d7[1], d7[2]]);
    w[15] = u32::from_be_bytes([d7[3], d7[4], d7[5], d7[6]]);
    for i in 16..30 {
        let mut v = SHA256_SCHEDULE[i - 16];
        if i - 2 >= 14 {
            let s = sigma1(w[i - 2]);
            v = v.wrapping_add(if i == 16 { s ^ SIGMA1_ADJUSTMENT } else { s });
        }
        if i - 7 >= 14 {
            v = v.wrapping_add(w[i - 7]);
        }
        if i >= 29 {
            let s = sigma0(w[i - 15]);
            v = v.wrapping_add(if i == 29 { s ^ SIGMA0_ADJUSTMENT } else { s });
        }
        w[i] = v;
    }
    w[30] = sigma1(w[28])
        .wrapping_add(w[23])
        .wrapping_add(sigma0(w[15]))
        .wrapping_add(w[14])
        .wrapping_add(SHA256_ADJUSTMENT)
        .wrapping_sub(K[14]);
    expand(&mut w, 31);
    add8(SHA256_INITIAL, rounds(SHA256_STATE, &w, 14))
}

fn sha_digest(data: &[u8]) -> [u8; 32] {
    let length = 57 + data.len();
    let mut padded = data[7..].to_vec();
    padded.push(0x80);
    let zeros = (55i64 - length as i64).rem_euclid(64) as usize;
    padded.extend(std::iter::repeat(0u8).take(zeros));
    padded.extend_from_slice(&((length as u64) * 8).to_be_bytes());
    let mut state = sha_init(&data[..7]);
    for block in padded.chunks(64) {
        let mut w = [0u32; 64];
        for (j, c) in block.chunks(4).enumerate() {
            w[j] = u32::from_be_bytes([c[0], c[1], c[2], c[3]]);
        }
        expand(&mut w, 16);
        state = add8(state, rounds(state, &w, 0));
    }
    let mut out = [0u8; 32];
    for (i, v) in state.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&v.to_be_bytes());
    }
    out
}

/// Küçük uçlu 32 bit sözcükler (sıfırla 4'ün katına, sayısı çifte tamamlanır)
fn words_le4_even(data: &[u8]) -> Vec<u32> {
    let mut p = data.to_vec();
    while p.len() % 4 != 0 {
        p.push(0);
    }
    let mut w: Vec<u32> = p.chunks(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
    if w.len() % 2 == 1 {
        w.push(0);
    }
    w
}

fn cs64(data: &[u8], digest: &[u8; 32]) -> (u32, u32) {
    let key_a = u32::from_le_bytes([digest[0], digest[1], digest[2], digest[3]]) | 1;
    let key_b = u32::from_le_bytes([digest[4], digest[5], digest[6], digest[7]]) | 1;
    let factors = [key_a.wrapping_mul(CS64_FACTOR), key_b.wrapping_mul(CS64_FACTOR)];
    let mut terms: Vec<u32> = CS64_COEFFICIENTS.iter().enumerate().map(|(i, c)| c.0.wrapping_mul(factors[i % 2])).collect();
    let mut offsets: Vec<u32> = CS64_COEFFICIENTS.iter().map(|c| c.1).collect();
    let mut buf = Vec::with_capacity(data.len() + 1);
    buf.push(0u8);
    buf.extend_from_slice(data);
    for (i, word) in words_le4_even(&buf).into_iter().enumerate() {
        let even = i % 2 == 0;
        let mut term = word.wrapping_mul(if even { key_a } else { key_b });
        let mut offset = rol16(word).wrapping_mul(if even { 0xEF0569FB } else { 0xC31713DB });
        if i == 0 {
            term = term.wrapping_add(CS64_ADJUSTMENT0.wrapping_mul(factors[0]));
            offset = offset.wrapping_add(CS64_ADJUSTMENT1);
        }
        terms.push(term);
        offsets.push(offset);
    }
    let (mut swap_acc, mut swap_last, mut state, mut acc) = (0u32, 0u32, 0u32, 0u32);
    let mut i = 0;
    while i + 1 < terms.len() {
        let (x, y) = (terms[i], terms[i + 1]);
        let t = rol16(offsets[i].wrapping_add(x));
        let q = t.wrapping_mul(0x76F50F34);
        swap_acc = swap_acc.wrapping_add(rol16(q).wrapping_mul(0xC3EFEA97).wrapping_add(q));
        let t = rol16(offsets[i + 1].wrapping_add(y));
        let q = t.wrapping_mul(0x1881CE3C);
        swap_last = rol16(q).wrapping_mul(0x35BD1EC9).wrapping_add(q);
        swap_acc = swap_acc.wrapping_add(swap_last);

        state = state.wrapping_mul(key_a).wrapping_add(x);
        state = rol16(state).wrapping_mul(0xCF98B111);
        state = rol16(state).wrapping_mul(0x87085B9F);
        state = rol16(state).wrapping_mul(0x12CEB96D);
        state = rol16(state).wrapping_mul(0x257E1D83);
        acc = acc.wrapping_add(state);
        let mut t = state.wrapping_mul(key_b).wrapping_add(y);
        t = rol16(t).wrapping_mul(0xA27416F5);
        t = rol16(t).wrapping_mul(0xD38396FF);
        state = rol16(rol16(t).wrapping_mul(0x7C932B89)).wrapping_mul(0xBFA49F69);
        acc = acc.wrapping_add(state);
        i += 2;
    }
    (swap_last ^ state, swap_acc ^ acc)
}

fn hex_upper(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02X}")).collect()
}

/// Sec-MS-GEC v2 değeri: `unix_secs` anı için (5 dakikalık dilime yuvarlanır). `token`: istemci belirteci.
pub fn sec_ms_gec_v2(unix_secs: f64, token: &str) -> String {
    // edge-tts ile aynı kayan noktalı hesap (tam sayı hesabı bazı anlarda farklı metin üretir)
    let mut ticks = unix_secs + WIN_EPOCH;
    ticks -= ticks % 300.0;
    ticks *= 1e9 / 100.0;
    let data = format!("{ticks:.0}{token}");
    let digest = sha_digest(data.as_bytes());
    let (a, b) = cs64(data.as_bytes(), &digest);
    let mut c = a.to_le_bytes().to_vec();
    c.extend_from_slice(&b.to_le_bytes());
    format!("{}-{}", hex_upper(&c), hex_upper(&digest))
}

#[cfg(test)]
mod tests {
    use super::*;
    const TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

    #[test]
    fn matches_edge_tts() {
        // edge-tts 7.3.1 drm.generate_sec_ms_gec_v2 çıktıları
        for (t, want) in [
            (1791888000.0, "492D7694A183A45E-56E821F95D4579C5B7C7E33DC7303FF379EC36D510213555BBBB9EB17EF15876"),
            (1700000000.0, "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2"),
            (1792950000.5, "5B5D1F3C98080E4C-136278E995BB3EBE5F7F5C76E6130D26142D76B2C219FC7BE759F2E66336549C"),
            (1800000123.0, "99E54519B490BE5C-E162DB0977FBDCB9B86DD8148BF1BCDC3C0303176CE39852A42B415935C20654"),
        ] {
            assert_eq!(sec_ms_gec_v2(t, TOKEN), want, "{t}");
        }
    }
}
