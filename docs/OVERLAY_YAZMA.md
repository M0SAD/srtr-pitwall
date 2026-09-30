# Yeni overlay yazmak

Her overlay `src/overlays/<id>/` altında iki (isteğe bağlı üç) dosyadan oluşur:

```
src/overlays/laptimer/
├─ manifest.ts    ad, açıklama, veri ihtiyacı, ayar şeması
├─ Overlay.tsx    görünüm (SolidJS bileşeni)
└─ style.css      (isteğe bağlı) sadece bu overlay'in stili
```

Klasörü eklemek yeterli: kontrol paneli ve overlay penceresi `import.meta.glob` ile klasörü tarar.
`npm run app:dev` çalışırken dosyayı kaydettiğin anda panelde görünür, düzenlediğin anda overlay yenilenir.
Adı `_` ile başlayan klasörler (ör. `_template`) yok sayılır.

## 1. manifest.ts

```ts
import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "laptimer",               // klasör adıyla aynı
  name: "Tur Sayacı",
  description: "Anlık tur süresi",
  category: "driving",          // "race" | "driving" | "info" | "stream"  (paneldeki grup)
  topics: [{ name: "delta", hz: 10 }],
  size: { w: 200, h: 60 },      // düzenleme modundaki çerçeve için yaklaşık boyut
  defaultPosition: { x: 100, y: 100 },
  defaultEnabled: false,
  settings: [
    { key: "big", label: "Büyük yazı", type: "boolean", default: true },
    { key: "digits", label: "Ondalık", type: "number", default: 2, min: 0, max: 3, step: 1 },
    { key: "mode", label: "Mod", type: "select", default: "cur",
      options: [{ value: "cur", label: "Şimdiki" }, { value: "last", label: "Son" }] },
    { key: "color", label: "Renk", type: "color", default: "#ffffff" },
  ],
});
```

`settings` içindeki her alan için kontrol panelinde otomatik form öğesi üretilir (onay kutusu, kaydırıcı,
açılır liste, renk seçici). Ayarlara `hz` adında sayı alanı eklersen manifestteki güncelleme sıklığını ezer.

Alan türleri ve ek özellikler:

| Tür | Görünüm | Not |
|---|---|---|
| `boolean` | anahtar | |
| `number` | kaydırıcı; `ui: "stepper"` ile − / + düğmeleri | `min`, `max`, `step`, `unit` |
| `select` | açılır liste | `options: [{ value, label }]` |
| `color` | renk seçici | |
| `text` | yazı kutusu | `placeholder` |
| `multi` | onay kutusu listesi | `options`, `max` (en fazla seçim), değer `string[]` |
| `order` | sürüklenebilir, açılıp kapatılabilir liste (ör. sütunlar) | `options`, `default: [{ key, on }]`; okurken `orderValue(field, value)` |

Her alana `group: "Başlık"` verirsen panelde o başlıklı katlanır bölüme girer (verilmezse overlay adı).
`showIf: { key: "mod", is: ["gelişmiş"] }` (ya da `not: [...]`) alanı sadece başka bir ayar belirli değerdeyken gösterir.

Leaderboard/Relative gibi başlık satırı olan overlay'ler için `@/sdk/HeaderStats` hazır parçalar sunar:
`headerField("headerFields", "Başlık bilgileri", ["sof", "remaining"])` manifest alanı, `<HeaderStats fields={...} />`
görünümü; `formatName(ad, biçim)` ve `NAME_FORMATS` ad biçimi seçeneği içindir.

Yeni ayar anahtarı eklediğinde kayıtlı eski ayarlar bozulmaz; eksik anahtar varsayılan değeriyle tamamlanır.

## 2. Overlay.tsx

```tsx
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { lapTime } from "@/sdk/format";

export default function LapTimer(props: OverlayProps) {
  const d = useTopic("delta");   // manifestte istenen konu
  return (
    <div class="ov-panel" style={{ padding: "8px 12px", "font-size": props.options.big ? "28px" : "16px" }}>
      {lapTime(props.options.mode === "cur" ? d()?.current : d()?.last, props.options.digits)}
    </div>
  );
}
```

- `props.options`: manifestteki ayarlar
- `props.units`: `"metric"` ya da `"imperial"` (Genel ayarlardan)
- `props.editing`: düzenleme modunda `true` (veri yokken yer tutucu göstermek için)
- Ortak stiller `src/overlays/base.css` içinde: `ov-panel`, `ov-header`, `ov-empty`, `ov-mono`, `ov-dim`, `ov-tag`…
- Yardımcılar `src/sdk/format.ts` içinde (aşağıda).

## Tema kuralları (önemli)

Kullanıcı **Görünüm** sayfasından font, renk, opaklık, köşe, satır yoğunluğu gibi ayarları değiştirir ve bu tüm
overlay'lere aynı anda uygulanır. Bunun çalışması için overlay CSS'inde sabit değer yerine tema değişkenlerini kullan:

| Ne için | Kullan |
|---|---|
| Yazı fontu / sayı fontu | `var(--ov-font)`, `.ov-mono` sınıfı ya da `var(--ov-mono)` |
| Yazı boyutu | `em` birimi (taban `var(--ov-fs)`, varsayılan 13px). Ör. 11px yerine `0.846em` |
| Kalınlık | `var(--ov-weight)`, vurgu için `var(--ov-weight-strong)` |
| Yazı renkleri | `var(--ov-text)`, ikincil `var(--ov-dim)` |
| Panel arka planı | `.ov-panel` sınıfı ya da `var(--ov-bg)`; opak ton gerekirse `var(--ov-bg-solid)` |
| Satır ayırıcı çizgi | `var(--ov-divider)` (panel kenarlığı `var(--ov-line)`) |
| Satır yüksekliği | `var(--ov-row-h)` (yoğunluk ayarına göre 22/26/30px) |
| Senin satırın | `var(--ov-bg-me)` |
| Anlamlı renkler | `--ov-accent`, `--ov-green`, `--ov-red`, `--ov-yellow`, `--ov-blue`, `--ov-purple` |
| Köşe | `var(--ov-radius)` |
| Hafif ton | `color-mix(in srgb, var(--ov-text) 8%, transparent)` |

Yeni bir tema ayarı eklemek için: `src/sdk/theme.ts` → `Theme` tipine alan, `DEFAULT_THEME`'e varsayılan,
`themeVars()`'a CSS değişkeni ve `THEME_GROUPS`'a form alanı ekle. Görünüm sayfası formu otomatik üretir.
Yeni hazır tema için `PRESETS` listesine bir satır eklemen yeterli.
Biçimlendirme yardımcıları (`src/sdk/format.ts`): `lapTime`, `clock`, `wallClock`, `signed`, `speed`, `fuel`, `temp`, `irating`, `gear`.
`speed` ve `wallClock` Genel ayarlardaki "hız her zaman mph" ve 12/24 saat tercihine uyar; kendi saat biçimini yazma.

## Mevcut veri konuları

Tipler `src/sdk/types.ts` içinde.

| Konu | İçerik |
|---|---|
| `status` | bağlantı, demo, pistte/izliyor mu, oturum tipi, pist, araç ve sınıf (her zaman gelir) |
| `inputs` | gaz, fren, debriyaj, direksiyon, vites, hız, devir, ABS |
| `telemetry` | vites, hız, devir, vites ışığı devirleri, pozisyon ve değişimi, son/en iyi tur, yakıt, sıcaklıklar, ABS/TC/BB |
| `delta` | en iyi tura delta, geçerlilik, eğilim, şimdiki/son/en iyi tur |
| `radar` | sol/sağ durumu, önde/arkada mesafe, yakındaki araçlar (taraf + boyuna mesafe) |
| `relative` | oyuncunun önündeki/arkasındaki 8'er araç + hava, SOF, olay, kalan |
| `standings` | tüm sıralama, sınıf bilgileri (SOF, sayı), oturum süresi |
| `fuel` | depo, son/ort5/ort10/en kötü satırları, hedefler, pit penceresi |
| `session` | bayraklar, kalan süre/tur, pozisyon, hava, olay ve sınırı, BB/TC/ABS |
| `weather` | sıcaklıklar, rüzgâr yönü/hızı, araç yönü, nem, yağış, ıslaklık |
| `map` | pist şekli (sadece değişince) ve araçların tur yüzdeleri — `useTrack()` ile kullan |
| `raceControl` | yarış kontrol olayları (Live Timing) |
| `tires` | dört lastik: iç/orta/dış sıcaklık, kalan diş, soğuk basınç, hamur (pitte güncellenir) |
| `team` | MQTT takım yakıt paylaşımı: takım adı, bağlantı, takım arkadaşlarının yakıtı |
| `entries` | oturumdaki sürücüler, orijinal sınıf ve League Builder kategorisi (panel kullanır) |
| `laps` | oyuncunun turları: süre, 3 sektör, yakıt, olay, geçerli/pit; en iyi tur, en iyi sektörler, teorik en iyi |
| `incidents` | oturumdaki olay puanları: saat, tur, sektör, +Nx ve türü; toplam ve sınır |
| `pit` | hız, pit hız sınırı, sınırlayıcı açık mı, pit yolunda/yaklaşıyor |
| `traffic` | arkadan yaklaşan/öndeki yakın araçlar: süre ve metre farkı, daha hızlı sınıf mı; pist dışı durumu |
| `corners` | en iyi turdan bulunan virajlar ve her birinde en iyi/son/bu tur en düşük hız |

Satırlardaki `carName` tam araç adıdır. Marka logosu için `import { CarLogo } from "@/sdk/logos"` ve
`<CarLogo carName={r.carName} />` kullan; logo yoksa marka adı yazar.

Arkadaş vurgusu için satırlarda `userId` ve `name` var: `friendRowStyle("relative", r.userId, r.name)` satır
arka planını, `<FriendBadge place="relative" userId={r.userId} name={r.name} />` isim önündeki rozeti verir
(`@/sdk/friends`, `@/sdk/FriendBadge`).

## Yeni bir veri konusu eklemek (Rust)

iRacing'den yeni bir değişken okumak gerekirse:

1. `src-tauri/src/sdk.rs` → `VarIndex`'e alanı ve `build()` içindeki `match`'e iRacing değişken adını ekle.
2. `src-tauri/src/model.rs` → `Frame`'e alanı ekle, `sdk::extract_frame` içinde doldur.
3. `src-tauri/src/calc.rs` → paket yapısını ve hesaplama fonksiyonunu yaz.
4. `src-tauri/src/engine.rs` → `Packet` enum'una, `KNOWN` listesine ve `publish` içindeki `match`'e ekle.
5. `src/sdk/types.ts` → aynı tipi TypeScript'te tanımla ve `TopicMap`'e ekle.

iRacing değişken listesi: iRacing açıkken `irsdk` örnek araçlarıyla ya da iRacing forumundaki SDK belgelerinden
görülebilir. Demo'da da görünmesi için `src-tauri/src/demo.rs` içinde değer üret.
