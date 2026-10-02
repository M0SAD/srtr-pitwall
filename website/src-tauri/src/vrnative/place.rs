//! Yerel VR: yerleşim matematiği, fareyle düzenleme ve piksel dönüşümü (platformdan bağımsız, birim testli).
//!
//! Koordinatlar OpenVR'ınkidir: +x sağ, +y yukarı, -z ileri; overlay dörtgeninin ön yüzü +z'ye bakar.
//! Ayarlarda `z` "öne uzaklık" olarak (pozitif = önde) saklanır ve OpenVR'a -z olarak geçer.

use super::{HmdMatrix34, MouseInput};
use serde_json::{json, Value};

pub type V3 = [f32; 3];

/// Bakış modu: overlay'in açısal yarı boyutuna eklenen pay
pub const GAZE_MARGIN_DEG: f32 = 10.0;
/// Bakış modu: belirme / kaybolma süresi
pub const GAZE_FADE_SECS: f32 = 0.12;

/// Bir overlay'in gözlükteki yeri (ayarlar: `general.vr.native.overlays[<kopya kimliği>]`)
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Placement {
    /// Metre; x sağ, y yukarı, z öne uzaklık (başlangıç noktasına göre)
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// Derece; yaw: dikey eksen çevresinde, pitch: yatay eksen çevresinde dönüş
    pub yaw: f32,
    pub pitch: f32,
    /// Genişlik (metre)
    pub width: f32,
    /// Eğrilik 0..1
    pub curve: f32,
    /// Opaklık 0.1..1
    pub alpha: f32,
    /// Hep kullanıcıya dönük, sabit uzaklıkta
    pub face_me: bool,
    /// Sadece bakınca görünür
    pub gaze: bool,
}

impl Placement {
    /// Varsayılan dizilim: `count` overlay, ~1,2 m önde bir yay üzerinde (ortadan sağa sola 24° aralıkla, iki sıra)
    pub fn default_for(index: usize, count: usize) -> Placement {
        const RADIUS: f32 = 1.2;
        const STEP: f32 = 24.0;
        const PER_ROW: usize = 5;
        let count = count.max(1);
        let row = index / PER_ROW;
        let in_row = (count - row * PER_ROW).min(PER_ROW).max(1);
        let col = (index % PER_ROW) as f32;
        let theta = (col - (in_row as f32 - 1.0) / 2.0) * STEP;
        let (s, c) = theta.to_radians().sin_cos();
        Placement {
            x: RADIUS * s,
            y: -0.05 - 0.32 * row as f32,
            z: RADIUS * c,
            yaw: -theta,
            pitch: 0.0,
            width: 0.4,
            curve: 0.0,
            alpha: 1.0,
            face_me: false,
            gaze: false,
        }
    }

    pub fn from_json(v: &Value, d: Placement) -> Placement {
        let f = |k: &str, d: f32| v.get(k).and_then(|x| x.as_f64()).filter(|x| x.is_finite()).map(|x| x as f32).unwrap_or(d);
        let b = |k: &str, d: bool| v.get(k).and_then(|x| x.as_bool()).unwrap_or(d);
        let mut p = Placement {
            x: f("x", d.x),
            y: f("y", d.y),
            z: f("z", d.z),
            yaw: f("yaw", d.yaw),
            pitch: f("pitch", d.pitch),
            width: f("widthM", d.width),
            curve: f("curve", d.curve),
            alpha: f("alpha", d.alpha),
            face_me: b("faceMe", d.face_me),
            gaze: b("gaze", d.gaze),
        };
        p.clamp();
        p
    }

    pub fn to_json(&self) -> Value {
        let r = |x: f32| (x as f64 * 1000.0).round() / 1000.0;
        json!({
            "x": r(self.x), "y": r(self.y), "z": r(self.z), "yaw": r(self.yaw), "pitch": r(self.pitch),
            "widthM": r(self.width), "curve": r(self.curve), "alpha": r(self.alpha),
            "faceMe": self.face_me, "gaze": self.gaze,
        })
    }

    pub fn clamp(&mut self) {
        self.x = self.x.clamp(-5.0, 5.0);
        self.y = self.y.clamp(-5.0, 5.0);
        self.z = self.z.clamp(-10.0, 10.0);
        while self.yaw > 180.0 {
            self.yaw -= 360.0;
        }
        while self.yaw < -180.0 {
            self.yaw += 360.0;
        }
        self.pitch = self.pitch.clamp(-90.0, 90.0);
        self.width = self.width.clamp(0.05, 3.0);
        self.curve = self.curve.clamp(0.0, 1.0);
        self.alpha = self.alpha.clamp(0.1, 1.0);
    }

    /// Başlangıç noktasına uzaklık
    pub fn distance(&self) -> f32 {
        len([self.x, self.y, self.z])
    }
}

// ---- vektör / matris ----

pub fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
pub fn add(a: V3, b: V3) -> V3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
pub fn scale(a: V3, k: f32) -> V3 {
    [a[0] * k, a[1] * k, a[2] * k]
}
pub fn dot(a: V3, b: V3) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
pub fn len(a: V3) -> f32 {
    dot(a, a).sqrt()
}

type M3 = [[f32; 3]; 3];

fn m3_mul(a: M3, b: M3) -> M3 {
    let mut o = [[0.0; 3]; 3];
    for (i, row) in o.iter_mut().enumerate() {
        for (j, c) in row.iter_mut().enumerate() {
            *c = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
        }
    }
    o
}
fn rot_y(rad: f32) -> M3 {
    let (s, c) = rad.sin_cos();
    [[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]]
}
fn rot_x(rad: f32) -> M3 {
    let (s, c) = rad.sin_cos();
    [[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]]
}
/// z ekseni çevresinde 180° ("Overlay'leri ters çevir")
const ROT_Z_180: M3 = [[-1.0, 0.0, 0.0], [0.0, -1.0, 0.0], [0.0, 0.0, 1.0]];

fn compose(r: M3, t: V3) -> HmdMatrix34 {
    HmdMatrix34 { m: [[r[0][0], r[0][1], r[0][2], t[0]], [r[1][0], r[1][1], r[1][2], t[1]], [r[2][0], r[2][1], r[2][2], t[2]]] }
}
fn rotation(m: &HmdMatrix34) -> M3 {
    [[m.m[0][0], m.m[0][1], m.m[0][2]], [m.m[1][0], m.m[1][1], m.m[1][2]], [m.m[2][0], m.m[2][1], m.m[2][2]]]
}
pub fn translation(m: &HmdMatrix34) -> V3 {
    [m.m[0][3], m.m[1][3], m.m[2][3]]
}
fn apply(r: M3, v: V3) -> V3 {
    [dot(r[0], v), dot(r[1], v), dot(r[2], v)]
}
fn transpose(r: M3) -> M3 {
    [[r[0][0], r[1][0], r[2][0]], [r[0][1], r[1][1], r[2][1]], [r[0][2], r[1][2], r[2][2]]]
}
/// a · b (katı dönüşümler)
pub fn mul(a: &HmdMatrix34, b: &HmdMatrix34) -> HmdMatrix34 {
    let ra = rotation(a);
    compose(m3_mul(ra, rotation(b)), add(apply(ra, translation(b)), translation(a)))
}
/// Noktayı `m` uzayından üst uzaya taşır
#[cfg(test)]
pub fn point(m: &HmdMatrix34, p: V3) -> V3 {
    add(apply(rotation(m), p), translation(m))
}
/// Katı dönüşümün tersiyle: üst uzaydaki noktayı `m` uzayına getirir
pub fn point_inv(m: &HmdMatrix34, p: V3) -> V3 {
    apply(transpose(rotation(m)), sub(p, translation(m)))
}
/// Gözlüğün baktığı yön (-z sütunu)
pub fn forward(m: &HmdMatrix34) -> V3 {
    [-m.m[0][2], -m.m[1][2], -m.m[2][2]]
}

/// Kendi başlangıç noktamız ("Ortala" ile gözlüğün o anki yeri ve yönü): OpenVR koordinatında konum + yaw
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Base {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// Derece
    pub yaw: f32,
}

impl Base {
    pub const ZERO: Base = Base { x: 0.0, y: 0.0, z: 0.0, yaw: 0.0 };

    /// Gözlüğün o anki yeri ve yatay bakış yönü yeni başlangıç olur (eğim ve yatış yok sayılır)
    pub fn from_hmd(hmd: &HmdMatrix34) -> Base {
        let f = forward(hmd);
        let t = translation(hmd);
        // rot_y(a) için -z sütunu (-sin a, 0, -cos a) = bakış yönü
        let yaw = if f[0].abs() + f[2].abs() < 1e-4 { 0.0 } else { (-f[0]).atan2(-f[2]).to_degrees() };
        Base { x: t[0], y: t[1], z: t[2], yaw }
    }

    pub fn matrix(&self) -> HmdMatrix34 {
        compose(rot_y(self.yaw.to_radians()), [self.x, self.y, self.z])
    }

    pub fn from_json(v: &Value) -> Option<Base> {
        let f = |k: &str| v.get(k).and_then(|x| x.as_f64()).filter(|x| x.is_finite()).map(|x| x as f32);
        Some(Base { x: f("x")?, y: f("y")?, z: f("z")?, yaw: f("yaw")? })
    }

    pub fn to_json(&self) -> Value {
        let r = |x: f32| (x as f64 * 1000.0).round() / 1000.0;
        json!({ "x": r(self.x), "y": r(self.y), "z": r(self.z), "yaw": r(self.yaw) })
    }
}

/// Overlay'in izleme uzayındaki dönüşümü (SetOverlayTransformAbsolute).
/// `hmd`: gözlüğün aynı izleme uzayındaki konumu ("bana dön" için; yoksa saklanan açı kullanılır).
pub fn transform(p: &Placement, base: &HmdMatrix34, hmd: Option<&HmdMatrix34>, invert: bool) -> HmdMatrix34 {
    let mut pos: V3 = [p.x, p.y, -p.z];
    let mut rot = m3_mul(rot_y(p.yaw.to_radians()), rot_x(p.pitch.to_radians()));
    if let (true, Some(h)) = (p.face_me, hmd) {
        // Gözlük merkezli, saklanan uzaklıkta bir kürede; ön yüz gözlüğe bakar
        let head = point_inv(base, translation(h));
        let dist = len(pos);
        let dir = if dist < 0.05 { [0.0, 0.0, -1.0] } else { scale(pos, 1.0 / dist) };
        pos = add(head, scale(dir, dist.max(0.05)));
        let to_head = scale(dir, -1.0);
        let yaw = to_head[0].atan2(to_head[2]);
        let pitch = -to_head[1].clamp(-1.0, 1.0).asin();
        rot = m3_mul(rot_y(yaw), rot_x(pitch));
    }
    if invert {
        rot = m3_mul(rot, ROT_Z_180);
    }
    mul(base, &compose(rot, pos))
}

/// Bakış modu: gözlük overlay'e (açısal yarı boyutu + 10°) bakıyor mu. `aspect` = yükseklik / genişlik.
pub fn gaze_inside(hmd: &HmdMatrix34, overlay: &HmdMatrix34, width: f32, aspect: f32) -> bool {
    let v = sub(translation(overlay), translation(hmd));
    let dist = len(v);
    if dist < 0.01 {
        return true;
    }
    let cos = (dot(forward(hmd), v) / (dist * len(forward(hmd)).max(1e-6))).clamp(-1.0, 1.0);
    let half = (width * aspect.clamp(0.05, 20.0).max(1.0) / 2.0 / dist).atan();
    cos.acos() <= half + GAZE_MARGIN_DEG.to_radians()
}

/// Bakış solması: `cur` (0..1) değerini `dt` saniyede hedefe doğru ilerletir (tam geçiş 120 ms)
pub fn fade(cur: f32, target_on: bool, dt: f32) -> f32 {
    let step = (dt / GAZE_FADE_SECS).max(0.0);
    if target_on {
        (cur + step).min(1.0)
    } else {
        (cur - step).max(0.0)
    }
}

// ---- fareyle düzenleme ----

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Mode {
    /// Sol sürükle: x/y, sağ sürükle: uzaklık
    #[default]
    Position,
    /// Sol: boyut, sağ: döndür, orta: eğrilik, tekerlek: saydamlık
    Adjust,
}

/// Sağ sürüklemede eksen kilidi: ilk hareket eden eksen (yaw ya da pitch) sürükleme bitene kadar tutulur
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AxisLock {
    /// Some(true): yaw, Some(false): pitch
    pub axis: Option<bool>,
    acc: (i32, i32),
}

/// Fare hareketini yerleşime uygular; bir şey değiştiyse true.
pub fn apply_mouse(p: &mut Placement, mode: Mode, m: &MouseInput, lock: &mut AxisLock) -> bool {
    if !m.right_down && m.right == (0, 0) {
        *lock = AxisLock::default();
    }
    if m.is_idle() {
        return false;
    }
    let before = *p;
    match mode {
        Mode::Position => {
            // 1000 piksel ≈ overlay'in uzaklığı kadar yol
            let k = 0.001 * p.distance().max(0.3);
            p.x += m.left.0 as f32 * k;
            p.y -= m.left.1 as f32 * k;
            let dz = -(m.right.1 as f32) * 0.002; // yukarı sürükle: uzaklaş
            if dz != 0.0 {
                if p.face_me {
                    // Kürenin yarıçapı değişir, yön aynı kalır
                    let d = p.distance().max(0.05);
                    let k = ((d + dz).max(0.2)) / d;
                    p.x *= k;
                    p.y *= k;
                    p.z *= k;
                } else {
                    p.z = (p.z + dz).max(0.2);
                }
            }
        }
        Mode::Adjust => {
            p.width *= (-(m.left.1 as f32) * 0.004).exp(); // yukarı sürükle: büyüt
            let (dx, dy) = m.right;
            if dx != 0 || dy != 0 {
                let yaw_only = if m.shift {
                    Some(true)
                } else if m.ctrl {
                    Some(false)
                } else {
                    if lock.axis.is_none() {
                        lock.acc.0 += dx;
                        lock.acc.1 += dy;
                        if lock.acc.0.abs().max(lock.acc.1.abs()) >= 4 {
                            lock.axis = Some(lock.acc.0.abs() >= lock.acc.1.abs());
                        }
                    }
                    lock.axis
                };
                match yaw_only {
                    Some(true) => p.yaw -= dx as f32 * 0.15,
                    Some(false) => p.pitch += dy as f32 * 0.15,
                    None => {}
                }
            }
            p.curve += m.middle.0 as f32 * 0.002;
            p.alpha += m.wheel as f32 * 0.05;
        }
    }
    p.clamp();
    *p != before
}

// ---- pikseller ----

/// Yakalanan BGRA kareyi RGBA'ya çevirir. `key` verilirse o renge (kanal başına `tol` payla) eşit pikseller
/// tam saydam olur; diğerleri opak. WebView2'nin PrintWindow çıktısında güvenilir alfa olmadığı için alfa hep yazılır.
pub fn bgra_to_rgba(buf: &mut [u8], key: Option<[u8; 3]>, tol: u8) {
    match key {
        Some([kr, kg, kb]) => {
            for px in buf.chunks_exact_mut(4) {
                px.swap(0, 2);
                let hit = px[0].abs_diff(kr) <= tol && px[1].abs_diff(kg) <= tol && px[2].abs_diff(kb) <= tol;
                if hit {
                    px.copy_from_slice(&[0, 0, 0, 0]);
                } else {
                    px[3] = 255;
                }
            }
        }
        None => {
            for px in buf.chunks_exact_mut(4) {
                px.swap(0, 2);
                px[3] = 255;
            }
        }
    }
}

/// Kare değişti mi diye hızlı özet (FNV-1a, 8 baytlık adımlarla)
pub fn frame_hash(buf: &[u8], w: u32, h: u32) -> u64 {
    let mut x: u64 = 0xcbf29ce484222325 ^ ((w as u64) << 32 | h as u64);
    let mut it = buf.chunks_exact(8);
    for c in &mut it {
        x ^= u64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]]);
        x = x.wrapping_mul(0x100000001b3);
    }
    for b in it.remainder() {
        x ^= *b as u64;
        x = x.wrapping_mul(0x100000001b3);
    }
    x
}

/// "rrggbb" -> [r, g, b]
pub fn parse_rgb(s: &str) -> Option<[u8; 3]> {
    let s = s.trim_start_matches('#');
    if s.len() != 6 || !s.is_ascii() {
        return None;
    }
    let p = |i: usize| u8::from_str_radix(&s[i..i + 2], 16).ok();
    Some([p(0)?, p(2)?, p(4)?])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: V3, b: V3) -> bool {
        len(sub(a, b)) < 1e-3
    }
    /// Overlay'in ön yüzünün baktığı yön (+z sütunu)
    fn normal(m: &HmdMatrix34) -> V3 {
        [m.m[0][2], m.m[1][2], m.m[2][2]]
    }

    #[test]
    fn default_arc_faces_origin() {
        // Tek overlay tam önde, 1,2 m; ön yüzü kullanıcıya (+z) bakar
        let p = Placement::default_for(0, 1);
        assert!((p.x).abs() < 1e-4 && (p.z - 1.2).abs() < 1e-4);
        let m = transform(&p, &HmdMatrix34::IDENTITY, None, false);
        assert!(close(translation(&m), [0.0, -0.05, -1.2]));
        assert!(close(normal(&m), [0.0, 0.0, 1.0]));
        // Yaydaki her overlay başlangıç noktasına bakar ve ~1,2 m uzaktadır
        for i in 0..7 {
            let p = Placement::default_for(i, 7);
            let m = transform(&p, &HmdMatrix34::IDENTITY, None, false);
            let t = translation(&m);
            let flat = [t[0], 0.0, t[2]];
            assert!((len(flat) - 1.2).abs() < 1e-3, "{i}");
            assert!(close(normal(&m), scale(flat, -1.0 / len(flat))), "{i}: {:?} {:?}", normal(&m), t);
        }
        // Sağdaki overlay sağda (x > 0), ikinci sıra aşağıda
        assert!(Placement::default_for(4, 5).x > 0.5 && Placement::default_for(0, 5).x < -0.5);
        assert!(Placement::default_for(5, 7).y < Placement::default_for(0, 7).y);
    }

    #[test]
    fn invert_rotates_about_z() {
        let p = Placement::default_for(0, 1);
        let a = transform(&p, &HmdMatrix34::IDENTITY, None, false);
        let b = transform(&p, &HmdMatrix34::IDENTITY, None, true);
        assert!(close(normal(&a), normal(&b)));
        // x ve y eksenleri ters döner
        assert!((a.m[0][0] + b.m[0][0]).abs() < 1e-5 && (a.m[1][1] + b.m[1][1]).abs() < 1e-5);
        assert_eq!(translation(&a), translation(&b));
    }

    #[test]
    fn face_me_follows_head_on_sphere() {
        let mut p = Placement { x: 0.6, y: 0.2, z: 1.0, yaw: 33.0, pitch: -12.0, face_me: true, ..Placement::default_for(0, 1) };
        p.clamp();
        let dist = p.distance();
        for head in [[0.0, 0.0, 0.0], [0.3, -0.1, 0.25], [-1.0, 0.4, -0.5]] {
            let hmd = compose(rot_y(0.7), head);
            let m = transform(&p, &HmdMatrix34::IDENTITY, Some(&hmd), false);
            let t = translation(&m);
            assert!((len(sub(t, head)) - dist).abs() < 1e-3);
            // Ön yüz gözlüğe dönük
            assert!(close(normal(&m), scale(sub(head, t), 1.0 / dist)));
        }
        // Gözlük konumu yoksa saklanan açı kullanılır
        let m = transform(&p, &HmdMatrix34::IDENTITY, None, false);
        assert!(close(translation(&m), [0.6, 0.2, -1.0]));
    }

    #[test]
    fn recenter_base() {
        // Gözlük (1, 1.5, 2) noktasında, sağa (+x) bakıyor: rot_y(-90°) için -z sütunu +x olur
        let hmd = compose(m3_mul(rot_y(-std::f32::consts::FRAC_PI_2), rot_x(0.3)), [1.0, 1.5, 2.0]);
        assert!(forward(&hmd)[0] > 0.9);
        let base = Base::from_hmd(&hmd);
        assert!((base.yaw + 90.0).abs() < 0.01, "{}", base.yaw);
        // Tam öndeki overlay artık gözlüğün baktığı yönde, 1,2 m ötede
        let p = Placement { y: 0.0, ..Placement::default_for(0, 1) };
        let m = transform(&p, &base.matrix(), None, false);
        assert!(close(translation(&m), [2.2, 1.5, 2.0]), "{:?}", translation(&m));
        assert!(close(normal(&m), [-1.0, 0.0, 0.0]));
        let j = base.to_json();
        assert_eq!(Base::from_json(&j), Some(Base { x: 1.0, y: 1.5, z: 2.0, yaw: base.to_json()["yaw"].as_f64().unwrap() as f32 }));
        assert_eq!(Base::from_json(&json!({ "x": 1 })), None);
        // point / point_inv birbirinin tersi
        let q = [0.3, -0.2, 0.9];
        assert!(close(point_inv(&base.matrix(), point(&base.matrix(), q)), q));
    }

    #[test]
    fn gaze_area_and_fade() {
        let hmd = HmdMatrix34::IDENTITY; // -z'ye bakıyor
        let at = |deg: f32| {
            let (s, c) = deg.to_radians().sin_cos();
            compose(rot_y(0.0), [1.2 * s, 0.0, -1.2 * c])
        };
        // 0,4 m genişlik, 1,2 m: yarı açı ≈ 9,5° → eşik ≈ 19,5°
        assert!(gaze_inside(&hmd, &at(0.0), 0.4, 0.5));
        assert!(gaze_inside(&hmd, &at(18.0), 0.4, 0.5));
        assert!(!gaze_inside(&hmd, &at(22.0), 0.4, 0.5));
        assert!(!gaze_inside(&hmd, &at(180.0), 0.4, 0.5));
        // Uzun (dikey) overlay'de yükseklik esas alınır
        assert!(gaze_inside(&hmd, &at(22.0), 0.4, 2.0));
        // 120 ms'de tam geçiş
        let mut f = 0.0;
        for _ in 0..6 {
            f = fade(f, true, 0.02);
        }
        assert!((f - 1.0).abs() < 1e-4);
        assert!((fade(1.0, false, 0.06) - 0.5).abs() < 1e-4);
        assert_eq!(fade(0.2, false, 1.0), 0.0);
    }

    #[test]
    fn mouse_position_mode() {
        let mut p = Placement::default_for(0, 1);
        let mut lock = AxisLock::default();
        let m = MouseInput { left: (100, -50), ..Default::default() };
        assert!(apply_mouse(&mut p, Mode::Position, &m, &mut lock));
        assert!(p.x > 0.1 && p.y > 0.0 && (p.z - 1.2).abs() < 1e-5);
        // Sağ sürükle yukarı: uzaklaş
        let z = p.z;
        assert!(apply_mouse(&mut p, Mode::Position, &MouseInput { right: (40, -100), right_down: true, ..Default::default() }, &mut lock));
        assert!((p.z - z - 0.2).abs() < 1e-4);
        // Hareket yoksa değişmez
        assert!(!apply_mouse(&mut p, Mode::Position, &MouseInput::default(), &mut lock));
        // "Bana dön" açıkken uzaklık kürenin yarıçapını değiştirir, yön aynı kalır
        let mut q = Placement { x: 0.5, y: 0.5, z: 1.0, face_me: true, ..p };
        let d = q.distance();
        apply_mouse(&mut q, Mode::Position, &MouseInput { right: (0, -100), right_down: true, ..Default::default() }, &mut lock);
        assert!((q.distance() - d - 0.2).abs() < 1e-3 && (q.x - q.y).abs() < 1e-5);
    }

    #[test]
    fn mouse_adjust_mode() {
        let mut p = Placement::default_for(0, 1);
        let mut lock = AxisLock::default();
        let w = p.width;
        apply_mouse(&mut p, Mode::Adjust, &MouseInput { left: (0, -100), ..Default::default() }, &mut lock);
        assert!(p.width > w * 1.4);
        // Eksen kilidi: önce yatay hareket → yaw; sonraki dikey hareket yok sayılır
        let (yaw, pitch) = (p.yaw, p.pitch);
        apply_mouse(&mut p, Mode::Adjust, &MouseInput { right: (10, 2), right_down: true, ..Default::default() }, &mut lock);
        assert_eq!(lock.axis, Some(true));
        apply_mouse(&mut p, Mode::Adjust, &MouseInput { right: (0, 50), right_down: true, ..Default::default() }, &mut lock);
        assert!(p.yaw != yaw && p.pitch == pitch);
        // Tuş bırakılınca kilit kalkar; yeni sürükleme dikey başlarsa pitch
        apply_mouse(&mut p, Mode::Adjust, &MouseInput::default(), &mut lock);
        assert_eq!(lock.axis, None);
        apply_mouse(&mut p, Mode::Adjust, &MouseInput { right: (1, 20), right_down: true, ..Default::default() }, &mut lock);
        assert!(lock.axis == Some(false) && p.pitch != pitch);
        // Shift: yalnız yaw, Ctrl: yalnız pitch (kilitten bağımsız)
        let (yaw, pitch) = (p.yaw, p.pitch);
        apply_mouse(&mut p, Mode::Adjust, &MouseInput { right: (20, 20), right_down: true, ctrl: true, ..Default::default() }, &mut lock);
        assert!(p.yaw == yaw && p.pitch != pitch);
        let pitch = p.pitch;
        apply_mouse(&mut p, Mode::Adjust, &MouseInput { right: (20, 20), right_down: true, shift: true, ..Default::default() }, &mut lock);
        assert!(p.yaw != yaw && p.pitch == pitch);
        // Orta: eğrilik, tekerlek: saydamlık (sınırlar içinde)
        apply_mouse(&mut p, Mode::Adjust, &MouseInput { middle: (100, 0), wheel: -4, ..Default::default() }, &mut lock);
        assert!((p.curve - 0.2).abs() < 1e-4 && (p.alpha - 0.8).abs() < 1e-4);
        apply_mouse(&mut p, Mode::Adjust, &MouseInput { middle: (-9000, 0), wheel: -400, ..Default::default() }, &mut lock);
        assert!(p.curve == 0.0 && (p.alpha - 0.1).abs() < 1e-6);
    }

    #[test]
    fn json_roundtrip_and_clamp() {
        let d = Placement::default_for(2, 5);
        let p = Placement::from_json(&json!({ "x": 0.25, "widthM": 99, "alpha": -3, "faceMe": true, "yaw": 190, "pitch": "bozuk" }), d);
        assert_eq!((p.x, p.width, p.alpha, p.face_me, p.gaze), (0.25, 3.0, 0.1, true, false));
        assert!((p.yaw + 170.0).abs() < 1e-4 && p.pitch == d.pitch && p.z == d.z);
        let back = Placement::from_json(&p.to_json(), Placement::default_for(0, 1));
        assert!((back.x - p.x).abs() < 1e-3 && (back.yaw - p.yaw).abs() < 1e-3 && back.face_me);
    }

    #[test]
    fn pixels() {
        // BGRA: mavi, siyah, neredeyse siyah, beyaz
        let src = [255u8, 0, 0, 0, 0, 0, 0, 0, 3, 2, 1, 0, 255, 255, 255, 0];
        let mut a = src;
        bgra_to_rgba(&mut a, None, 0);
        assert_eq!(a, [0, 0, 255, 255, 0, 0, 0, 255, 1, 2, 3, 255, 255, 255, 255, 255]);
        let mut b = src;
        bgra_to_rgba(&mut b, Some([0, 0, 0]), 2);
        assert_eq!(b, [0, 0, 255, 255, 0, 0, 0, 0, 1, 2, 3, 255, 255, 255, 255, 255]);
        let mut c = src;
        bgra_to_rgba(&mut c, Some([0, 0, 0]), 4);
        assert_eq!(c[8..12], [0, 0, 0, 0]);
        assert_ne!(frame_hash(&a, 2, 2), frame_hash(&b, 2, 2));
        assert_ne!(frame_hash(&a, 2, 2), frame_hash(&a, 4, 1));
        assert_eq!(frame_hash(&a, 2, 2), frame_hash(&a.clone(), 2, 2));
        assert_eq!(parse_rgb("#00ff7F"), Some([0, 255, 127]));
        assert_eq!(parse_rgb("yeşil!"), None);
    }
}
