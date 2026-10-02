# Kurulum (installer) görselleri

| Dosya | Boyut (px) | Nerede |
|---|---|---|
| `nsis-sidebar.bmp` | 164 × 314 | Kurulum (.exe) karşılama ve bitiş sayfalarının sol şeridi |
| `nsis-header.bmp` | 150 × 57 | Kurulum (.exe) diğer sayfalarının sağ üst köşesi |
| `wix-dialog.bmp` | 493 × 312 | MSI karşılama / bitiş arka planı (sol ~164 px görsel, sağı beyaz kalmalı: yazılar oraya gelir) |
| `wix-banner.bmp` | 493 × 58 | MSI diğer sayfaların üst şeridi (sol taraf beyaz kalmalı: başlık oraya yazılır) |

Hepsi 24 bit BMP olmalı. Şimdiki görseller uygulama simgesinden üretilmiş yer tutuculardır; aynı adla
değiştirmek yeterli. Ayarlar: `src-tauri/tauri.conf.json` → `bundle.windows.nsis` / `bundle.windows.wix`.

## Kurulum dili (NSIS .exe)

- Kurulum 15 dilde: `tauri.conf.json` → `bundle.windows.nsis.languages` (uygulamanın 15 diliyle aynı).
- Dil seçimi: kurulum açılırken dil penceresi çıkar ve **Windows görüntüleme dili** önceden seçili gelir
  (uygulama da ilk açılışta aynı dili seçer). İndirilen .exe'ye sitenin/uygulamanın dili aktarılamaz.
  Seçilen dil kayıt defterine yazılır; sonraki kurulum/güncellemede yeniden sorulmaz. Uygulama içi güncelleme sessizdir.
- Metinler: `nsis/<Dil>.nsh` (`customLanguageFiles`). Her dosya Tauri'nin yerleşik dil dosyasındaki 27 anahtarın
  tamamını + `srtrWelcomeText` (karşılama sayfasındaki ürün açıklaması) içerir. Tauri güncellenip yeni anahtar
  eklerse 15 dosyaya da eklenmelidir (eksik anahtar derleme uyarısı verir, o metin boş görünür).
- **Dosyalar BOM'suz UTF-8 olmalı.** Tauri derlerken BOM'u kendisi ekler; BOM'lu kaydedilirse çift BOM olur ve
  CI derlemesi `Invalid command` hatasıyla durur.
- `nsis/hooks.nsh` (`installerHooks`): karşılama metnini `$(srtrWelcomeText)` yapar; özel installer.nsi şablonu yok.
- Yerelleştirilemeyenler: .exe dosya özelliklerindeki açıklama (`shortDescription`) tek dildir (İngilizce);
  MSI (WiX) kurulumu İngilizce kalır (çok dilli MSI her dil için ayrı dosya üretir, bilerek açılmadı).
