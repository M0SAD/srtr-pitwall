-- ---------------------------------------------------------------------------
-- c77: Menü görünürlüğü — yönetici, programın menüsündeki alt sayfaları da gizleyebilir.
--      app_config.hidden_menu (text[]): yönetici olmayanlardan gizlenen menü kayıtlarının kalıcı kimlikleri.
--        "bölüm"          → sol menü bölümü (ör. "drivers"); bölümler için asıl liste hâlâ hidden_sections (c21),
--                           program ikisini birlikte okur.
--        "bölüm.sayfa"    → bölümün alt sayfası (ör. "drivers.league" = Sürücüler › Lig Kategorileri).
--      Varsayılan: lig kayıtları gizli ('{drivers.league}'). Varsayılan YALNIZCA sütun ilk eklendiğinde uygulanır
--      (add column ... default tek ifadede); bu dosya yeniden çalıştırıldığında yöneticinin sonradan açtığı
--      kayıtlar tekrar gizlenmez (ayrıca bir "update" yoktur).
--      hidden_sections / hidden_overlays (c21) ve livechat_hidden_tabs (c52) ile aynı düzen: herkes okur, yazma
--      yetkisi mevcut RLS ile yalnızca yöneticide (ayrı RPC gerekmez). Yöneticiler gizlenenleri "gizli" rozetiyle görür.
--      Yönetim, Hesap ve Ayarlar gizlenemez (program bu kimlikleri yok sayar).
--      Değiştirildiği yer: Yönetim › Görünürlük › Menü görünürlüğü (program ve site yönetim paneli).
-- Sıra: c21'den sonra. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

alter table public.app_config add column if not exists hidden_menu text[] not null default '{drivers.league}';
