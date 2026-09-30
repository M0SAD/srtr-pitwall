# Sürümler ve otomatik güncelleme

## Sürüm numarası

Biçim **GGAAYY-NN**, örneğin `290926-01`:

- `GGAAYY`: sürümün yükseltildiği gün, ay, yıl
- `NN`: her değişiklikte 1 artan sıra numarası (gün değişince sıfırlanmaz)

Windows kurulum paketleri ve güncelleme sistemi sayısal bir sürüm ister. Bu yüzden her sürümün bir de
"paket sürümü" vardır: `1.0.NN` (ör. `290926-01` → `1.0.1`). İkisi de `version.json` dosyasında tutulur.
Uygulama kullanıcıya her zaman `290926-01` biçimini gösterir.

Sürümü yükseltmek için:

```bat
node scripts\surum.mjs
```

Betik `version.json`, `package.json`, `src-tauri/tauri.conf.json` ve `src-tauri/Cargo.toml` dosyalarını
günceller. Ardından `SURUM_NOTLARI.md` dosyasının en üstüne yeni sürümün başlığını ve değişiklikleri yaz.

## Otomatik güncelleme nasıl çalışır

1. Sen yeni bir sürüm etiketi (`v1.0.2` gibi) GitHub'a gönderirsin.
2. GitHub Actions Windows'ta uygulamayı derler, kurulum dosyasını **imzalar** ve GitHub Releases'a yükler.
   Yanına `latest.json` adında küçük bir dosya koyar (en yeni sürüm, notlar, indirme adresi, imza).
3. Kullanıcıların bilgisayarındaki SRTR Pitwall, kontrol paneli açılınca bu dosyaya bakar. Daha yeni sürüm varsa
   Genel ayarlar > Hakkında bölümünde "Güncelle" düğmesi çıkar ve üst çubukta bildirim görünür.
4. "Güncelle"ye basınca yeni kurulum indirilir, imzası doğrulanır, sessizce kurulur ve uygulama yeniden başlar.
   Ayarlar korunur.

İmza, güncellemenin gerçekten senden geldiğini garanti eder. Özel anahtar sende kalır, açık anahtar uygulamanın
içine gömülür; imzası uymayan bir dosya kurulmaz.

## Bir kerelik kurulum

### 1. GitHub deposu

Projeyi bir GitHub deposuna yükle (ör. `github.com/KULLANICI/pitwall`). Depo **public** olmalı ya da
güncelleme dosyalarını herkese açık bir yerde yayınlamalısın (özel depodaki Release dosyaları giriş
yapmadan indirilemez).

### 2. İmza anahtarı üret

Proje klasöründe:

```bat
npx tauri signer generate -w %USERPROFILE%\.tauri\pitwall.key
```

Bir şifre sorar (boş bırakabilirsin ama şifre önerilir). İki dosya oluşur:

- `pitwall.key` → **özel anahtar**. Kimseyle paylaşma, depoya koyma, yedekle. Kaybedersen mevcut
  kullanıcılara bir daha güncelleme gönderemezsin.
- `pitwall.key.pub` → açık anahtar

### 3. Açık anahtarı ve adresi yapılandır

`src-tauri/tauri.release.conf.json` dosyasını aç:

```json
"updater": {
  "pubkey": "pitwall.key.pub DOSYASININ İÇERİĞİNİ BURAYA YAPIŞTIR",
  "endpoints": ["https://github.com/KULLANICI/pitwall/releases/latest/download/latest.json"],
  "windows": { "installMode": "passive" }
}
```

`KULLANICI/pitwall` kısmını kendi deponla değiştir.

### 4. GitHub gizli değişkenleri

GitHub'da depo → **Settings → Secrets and variables → Actions → New repository secret**:

| Ad | Değer |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `pitwall.key` dosyasının içeriği |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | anahtarı üretirken verdiğin şifre (boşsa bu secret'ı ekleme) |
| `VITE_SUPABASE_URL` | (isteğe bağlı) bulut senkronizasyonu için |
| `VITE_SUPABASE_ANON_KEY` | (isteğe bağlı) bulut senkronizasyonu için |

Ayrıca **Settings → Actions → General → Workflow permissions** kısmında "Read and write permissions"
seçili olmalı.

## Her yeni sürümde

```bat
node scripts\surum.mjs
:: SURUM_NOTLARI.md dosyasının en üstüne yeni sürümün notlarını yaz
git add -A
git commit -m "Sürüm 290926-02"
git tag v1.0.2
git push
git push --tags
```

`git tag` için betiğin yazdığı paket sürümünü kullan. Birkaç dakika içinde GitHub'daki **Actions**
sekmesinde derleme biter ve **Releases** sayfasında yeni sürüm görünür. Kullanıcılar paneli açtığında
güncellemeyi görür.

İlk imzalı sürümü kullanıcılar bir kere elle kurmalıdır (içinde açık anahtar olan ilk sürüm). Sonraki tüm
sürümler otomatik gelir.

## Yerel derlemeler

`build.bat` ile yapılan yerel derlemelerde imza anahtarı olmadığı için güncelleme kapalıdır; uygulama bunu
Hakkında bölümünde "bu derlemede otomatik güncelleme yapılandırılmamış" olarak gösterir. Kendi
bilgisayarında imzalı derleme yapmak istersen:

```bat
set TAURI_SIGNING_PRIVATE_KEY=%USERPROFILE%\.tauri\pitwall.key
set TAURI_SIGNING_PRIVATE_KEY_PASSWORD=şifren
npx tauri build --config src-tauri/tauri.release.conf.json
```
