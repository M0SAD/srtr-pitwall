-- ---------------------------------------------------------------------------
-- c48: Yönetici/moderatör başkasının görselini (ya da düzenini) silemiyordu:
--      'record "old" has no field "screenshot_id"'. audit_content() tetikleyicisi yorum olmayan satırlarda da
--      old.screenshot_id / old.layout_id alanına bakıyordu (plpgsql "and" kısa devre yapmaz). Alanlar artık
--      to_jsonb(old) üzerinden okunur; davranış aynı.
-- Sıra: herhangi bir zamanda. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------
create or replace function public.audit_content() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid := old.user_id;
  kind text := tg_argv[0];
  j jsonb := to_jsonb(old);
begin
  if auth.uid() is null or auth.uid() = owner then
    return null;
  end if;
  -- Üst içerik silinirken zincirleme silinen yorumlar kayda geçmez
  if kind = 'shot_comment' then
    if not exists (select 1 from public.screenshots where id = (j ->> 'screenshot_id')::uuid) then
      return null;
    end if;
  elsif kind = 'layout_comment' then
    if not exists (select 1 from public.shared_layouts where id = (j ->> 'layout_id')::uuid) then
      return null;
    end if;
  end if;
  perform public.log_mod(lower(tg_op), kind, old.id::text, owner,
    case when tg_op = 'DELETE' then j else jsonb_build_object('before', j, 'after', to_jsonb(new)) end);
  if tg_op = 'DELETE' and kind in ('shot', 'layout') then
    insert into public.notifications (user_id, kind, data)
    values (owner, case when kind = 'shot' then 'shot_removed' else 'layout_removed' end, jsonb_build_object('title', j ->> 'title'));
  end if;
  return null;
end $$;
