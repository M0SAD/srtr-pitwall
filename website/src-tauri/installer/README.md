# Kurulum (installer) görselleri

| Dosya | Boyut (px) | Nerede |
|---|---|---|
| `nsis-sidebar.bmp` | 164 × 314 | Kurulum (.exe) karşılama ve bitiş sayfalarının sol şeridi |
| `nsis-header.bmp` | 150 × 57 | Kurulum (.exe) diğer sayfalarının sağ üst köşesi |
| `wix-dialog.bmp` | 493 × 312 | MSI karşılama / bitiş arka planı (sol ~164 px görsel, sağı beyaz kalmalı: yazılar oraya gelir) |
| `wix-banner.bmp` | 493 × 58 | MSI diğer sayfaların üst şeridi (sol taraf beyaz kalmalı: başlık oraya yazılır) |

Hepsi 24 bit BMP olmalı. Şimdiki görseller uygulama simgesinden üretilmiş yer tutuculardır; aynı adla
değiştirmek yeterli. Ayarlar: `src-tauri/tauri.conf.json` → `bundle.windows.nsis` / `bundle.windows.wix`.
