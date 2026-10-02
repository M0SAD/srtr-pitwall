# Araç markası logoları (paketlenmiş PNG / SVG)

Bu klasöre koyulan `.png` ve `.svg` dosyaları derleme sırasında uygulamaya otomatik eklenir
(`src/sdk/logos.tsx` içinde `import.meta.glob`). Kod değişikliği gerekmez; dosyayı koyup
uygulamayı yeniden derlemek yeterli.

## Dosya adları

Şu an 46 markanın saydam zeminli PNG logosu (en uzun kenar 128 px) pakete dahildir.

Dosya adı = marka kimliği, küçük harf, kelimeler tire ile: `<marka-kimliği>.png` ya da `.svg`
(büyük/küçük harf ve tire farkı tolere edilir: `AstonMartin.svg` de çalışır, ama standart biçimi kullanın).
Aynı marka için hem PNG hem SVG varsa SVG kullanılır.

```
acura.png          alfa-romeo.png     alpine.png         aston-martin.png
audi.png           bentley.png        bmw.png            buick.png
cadillac.png       chevrolet.png      cupra.png          dallara.png
dodge.png          ferrari.png        ford.png           genesis.png
ginetta.png        holden.png         honda.png          hyundai.png
jaguar.png         kia.png            lamborghini.png    lexus.png
ligier.png         lotus.png          maserati.png       mazda.png
mclaren.png        mercedes.png       mini.png           nissan.png
oreca.png          peugeot.png        pontiac.png        porsche.png
radical.png        ray.png            renault.png        riley.png
skip-barber.png    subaru.png         tatuus.png         toyota.png
volkswagen.png     williams.png
```

Tam liste ve araç adından markayı bulan eşleştirme kuralları: `src/sdk/logos.tsx` → `BRANDS`
(`id` alanı dosya adıdır). Yeni bir marka eklemek için oraya `{ id, name, match }` satırı ekleyin.

## Koyu logolar (`meta.json`)

Overlay'ler koyu zeminli olduğu için siyah/lacivert logolar okunmaz. `meta.json` her PNG için
`dark` (arkasına açık renkli yuvarlak çip konur) ve `mono` (düz siyah logo, beyaza çevrilir)
bayraklarını tutar. Dosya elle yazılmaz; PNG'ler piksel piksel incelenerek üretilir:

```
python3 scripts/carlogos_meta.py
```

Yeni PNG ekledikten ya da değiştirdikten sonra bu betiği yeniden çalıştırın (Pillow gerekir).
Renkli/parlak logolara dokunulmaz. SVG'ler ve kullanıcının kendi logoları için bayrak uygulanmaz.

## Görünüm

Relative ve Sıralama Tablosu'nda logo sütunu varsayılan olarak açıktır ve sürücü adının hemen
solundadır. Hücre sabit genişliktedir (`.car-logo-cell`, `src/overlays/base.css`): logo en-boy
oranı ne olursa olsun ortalanır (`object-fit: contain`), logosu olmayan markada hücre boş kalır.

## Öncelik

1. Bu klasördeki paketlenmiş logo (SVG, yoksa PNG). Herkes bu logoları görür; kullanıcının kendi
   "logos" klasörü artık okunmaz (Ayarlar'daki "Marka logoları" bölümü kaldırıldı).
2. Logo yoksa hücre boş kalır (Sıralama Tablosu'nda "Logo ve yazı" / "Sadece yazı" seçiliyse marka adı yazılır).

## Logo önerileri

- `viewBox` tanımlı olsun, sabit `width`/`height` şart değil (logo satır yüksekliğine sığdırılır).
- Kenarlarda gereksiz boşluk bırakmayın; yatay logolar en fazla ~3:1 oranında iyi görünür.
- Koyu zemin üzerinde okunur renkler kullanın (overlay'ler çoğunlukla koyu arka planlıdır).
- Harici font / resim bağlantısı olmasın; yazılar path'e çevrilmiş olsun.
- Marka logoları tescillidir: yalnızca kullanım hakkınız olan dosyaları ekleyin.
