-- TOPCHIQ.UZ — 5-yangilanish: statistika tuzatishlari
-- Supabase -> SQL Editor -> New query ga joylashtirib "Run" bosing.

-- ============================================================
-- MUAMMO 1: Kun UTC bo'yicha hisoblanardi
-- ============================================================
-- current_date Supabase'da UTC beradi, O'zbekiston esa UTC+5.
-- Shu sababli "kunlik tashriflar" yarim tunda emas, ertalab
-- soat 5:00 da nolga tushardi.
--
-- Endi hamma joyda Toshkent vaqti ishlatiladi.

create or replace function tashkent_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Tashkent')::date;
$$;

-- ============================================================
-- MUAMMO 2: bitta odam qayta kirganda yangi "tashrifchi" bo'lishi
-- ============================================================
-- Eski usulda visitor_hash IP manzilga bog'liq edi. Mobil internetda
-- IP ba'zan o'zgarishi mumkin, shuning uchun endi kod brauzer
-- saqlaydigan barqaror ID ishlatadi (IP zaxira sifatida qoladi).
--
-- DIQQAT: bu yerda mavjud visits/presence ma'lumotlari O'CHIRILMAYDI.
-- Tekshirilgach, bugungi tashriflar turli vaqtlarda (bir necha soat
-- oralig'ida) kelgani va haqiqiy tashrifchilar ekani aniqlandi —
-- ular guruhlarga tarqatilgandan keyin kirgan real odamlar edi.

-- ============================================================
-- record_visit — Toshkent kuni bilan
-- ============================================================

create or replace function record_visit(p_hash text)
returns void
language plpgsql
security definer
as $$
begin
  insert into visits (visitor_hash, day)
  values (p_hash, tashkent_today())
  on conflict (visitor_hash, day) do nothing;

  insert into presence (visitor_hash, last_seen)
  values (p_hash, now())
  on conflict (visitor_hash)
  do update set last_seen = now();
end;
$$;

-- ============================================================
-- get_site_stats — Toshkent kuni bilan
-- ============================================================
-- Eslatma: kliklar har bosishda sanaladi (takroriy bosishlar ham),
-- tashriflar esa kuniga bir marta. Bu ataylab shunday.

create or replace function get_site_stats()
returns table (
  total_visits   bigint,
  daily_visits   bigint,
  online_now     bigint,
  total_clicks   bigint,
  total_projects bigint,
  total_bids     bigint
)
language sql
security definer
as $$
  select
    (select count(*) from visits),
    (select count(*) from visits where day = tashkent_today()),
    (select count(*) from presence where last_seen > now() - interval '2 minutes'),
    (select coalesce(sum(clicks), 0) from listings where status = 'active'),
    (select count(*) from listings where status = 'active'),
    (select coalesce(sum(total_bid), 0) from listings where status = 'active');
$$;
