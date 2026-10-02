; SRTR Pitwall kurulum eklentisi (bundle.windows.nsis.installerHooks).
; Tauri'nin installer.nsi dosyası bunu sayfa tanımlarından ÖNCE dahil eder; bu yüzden karşılama sayfasının
; metni burada değiştirilebilir (özel installer.nsi şablonuna gerek kalmaz).
; srtrWelcomeText her dilin kendi dosyasında tanımlıdır (installer/nsis/<Dil>.nsh, customLanguageFiles).
; $_CLICK: NSIS'in kendi "Devam etmek için İleri'ye tıklayın" cümlesi (seçilen dilde).
!define MUI_WELCOMEPAGE_TEXT "$(srtrWelcomeText)$\r$\n$\r$\n$_CLICK"
