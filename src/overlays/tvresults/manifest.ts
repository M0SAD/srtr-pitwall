import { defineOverlay } from "@/sdk/overlay";
import { finishSettings, tvShowSettings } from "@/sdk/tvkit";

export default defineOverlay({
  id: "tvresults",
  name: "TV Sonuç Tablosu",
  description:
    "Yarış sonunda televizyonda gösterilen büyük sonuç tablosu: başlıkta etkinlik adı, pist ve oturum; her satırda sıra, marka logosu, takım, sürücüler, numara ve fark (+3 LAPS gibi). Kalabalık sonuçlar sayfa sayfa döner. Sürücü değişikliği olan dayanıklılık yarışlarında aracı süren herkes sırayla yazılır.",
  category: "stream",
  topics: [
    { name: "standings", hz: 1 },
    { name: "session", hz: 1 },
    { name: "status", hz: 1 },
  ],
  size: { w: 820, h: 680 },
  defaultPosition: { x: 550, y: 200 },
  defaultCenter: true,
  defaultEnabled: false,
  settings: [
    { key: "title", label: "Etkinlik adı", type: "text", default: "", placeholder: "SUZUKA 1000KM", group: "Başlık", hint: "Boş bırakılırsa pist adı yazılır." },
    { key: "trackText", label: "Pist yazısı (boş: simdeki pist)", type: "text", default: "", placeholder: "SUZUKA", group: "Başlık" },
    ...tvShowSettings({ autoLabel: "Damalı bayraktan sonra", maxSecs: 60, showSecs: 30, everyMin: 10, once: { label: "Yarış sonunda ekranda kalma", hint: "Damalı bayraktan sonra bu kadar görünür, sonra kaybolur ve o yarışta tekrar çıkmaz. 0: oturum bitene kadar ekranda kalır." } }),
    ...finishSettings(true),
    { key: "afterPodium", label: "TV Yarış Sonucu'ndan sonra aç", type: "boolean", default: true, group: "Ne zaman görünsün", showIf: { key: "show", is: ["auto"] }, hint: "TV Yarış Sonucu (podyum) da açıksa önce podyum gösterilir, o kapanınca sonuç tablosu açılır (kule → podyum → sonuç tablosu)." },
    { key: "highlightMe", label: "Kendi satırımı vurgula", type: "boolean", default: false, hint: "Kapalıyken tablo tarafsızdır (TV'deki gibi)." },
    { key: "perPage", label: "Sayfadaki satır", type: "number", default: 20, min: 5, max: 30, step: 1, ui: "stepper" },
    { key: "pageSecs", label: "Sayfa değişme süresi", type: "number", default: 10, min: 3, max: 60, step: 1, unit: "sn" },
    {
      key: "classFilter",
      label: "Gösterilen sınıf",
      type: "select",
      default: "all",
      options: [
        { value: "all", label: "Genel" },
        { value: "mine", label: "Sadece benim sınıfım" },
      ],
    },
    {
      key: "numColor",
      label: "Numara kutusu rengi",
      type: "select",
      default: "category",
      options: [
        { value: "category", label: "Kategori (iRating'e göre)" },
        { value: "class", label: "Sınıf rengi" },
        { value: "white", label: "Beyaz" },
      ],
    },
    { key: "showTeam", label: "Takım sütunu", type: "boolean", default: true, hint: "Takım adı yoksa aracın adı yazılır." },
    { key: "drivers", label: "Sürücü sütunu sayısı", type: "number", default: 3, min: 1, max: 3, step: 1, ui: "stepper" },
    {
      key: "nameFormat",
      label: "Sürücü adı",
      type: "select",
      default: "initial",
      options: [
        { value: "initial", label: "A. SOYAD" },
        { value: "full", label: "AD SOYAD (tam ad)" },
        { value: "last", label: "SOYAD" },
      ],
      hint: "Tam ad uzunsa sürücü sütunu sayısını azaltmak adların sığmasını kolaylaştırır.",
    },
    { key: "showLogos", label: "Marka logoları", type: "boolean", default: true },
    { key: "showFlag", label: "Ülke bayrakları", type: "boolean", default: false, hint: "Sürücünün iRacing profilindeki ülke. iRacing ülke bilgisini göndermiyorsa (bazı lig / tekrar oturumları) bayrak çıkmaz." },
    { key: "showBest", label: "En iyi tur sütunu", type: "boolean", default: false },
    { key: "accent", label: "Ana renk", type: "color", default: "#d4151d", group: "Görünüm" },
    { key: "lineColor", label: "Ayırıcı çizgi rengi", type: "color", default: "#f07a12", group: "Görünüm" },
    { key: "scale", label: "Boyut", type: "number", default: 100, min: 50, max: 200, step: 5, unit: "%", group: "Görünüm" },
  ],
});
