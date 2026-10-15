-- c120: Ses odası bölümlerinin sırası (yönetici belirler, herkes aynı sırayla görür). Kategori kimlikleri ile
-- "_community" (Topluluk odaları) ve "_private" (Özel odalar) sırayla. Boşsa: kategoriler, sonra Topluluk, sonra Özel.

alter table public.app_config add column if not exists voice_order text[] not null default '{}';

notify pgrst, 'reload schema';
