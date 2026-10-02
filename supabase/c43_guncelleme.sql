-- ---------------------------------------------------------------------------
-- c43: Canlı Sohbet › Sohbete yaz için geliştirici uygulamalarının HERKESE AÇIK istemci kimlikleri.
--      app_config.livechat_twitch_client_id   Twitch uygulaması (Public istemci, Device Code Flow; gizli anahtar yok)
--      app_config.livechat_youtube_client_id  Google OAuth istemcisi (Masaüstü uygulaması; YouTube Data API v3)
--      app_config.livechat_kick_client_id     Kick geliştirici uygulaması
--      Program bu kimliklerle giriş adresini kurar. app_config herkese açık okunur (kimlikler gizli değildir);
--      sadece yönetici yazar (mevcut "config admin update" politikası). Yönetim › Canlı Sohbet ayarları'ndan girilir.
--      GİZLİ anahtarlar (client secret) veritabanında TUTULMAZ: Supabase › Edge Functions › Secrets
--      (YT_CLIENT_ID, YT_CLIENT_SECRET, KICK_CLIENT_ID, KICK_CLIENT_SECRET) — sadece chat-oauth işlevi kullanır.
--      Kurulum: docs/canli_sohbet_kurulum.md
-- Sıra: herhangi bir zamanda (bağımsız).
-- ---------------------------------------------------------------------------

alter table public.app_config add column if not exists livechat_twitch_client_id text not null default '';
alter table public.app_config add column if not exists livechat_youtube_client_id text not null default '';
alter table public.app_config add column if not exists livechat_kick_client_id text not null default '';

-- Kimlikler kısa ve sadece güvenli karakterler (yanlışlıkla gizli anahtar / boşluk yapıştırılmasın diye uzunluk sınırı)
alter table public.app_config drop constraint if exists app_config_livechat_ids_chk;
alter table public.app_config add constraint app_config_livechat_ids_chk check (
  length(livechat_twitch_client_id) <= 100 and livechat_twitch_client_id ~ '^[A-Za-z0-9._-]*$'
  and length(livechat_youtube_client_id) <= 200 and livechat_youtube_client_id ~ '^[A-Za-z0-9._-]*$'
  and length(livechat_kick_client_id) <= 100 and livechat_kick_client_id ~ '^[A-Za-z0-9._-]*$'
);
