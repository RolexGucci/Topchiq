-- TOPCHIQ.UZ — 3-yangilanish: Checkout.uz to'lov tizimi
-- Supabase -> SQL Editor -> New query ga joylashtirib "Run" bosing.
-- Xavfsiz: mavjud ma'lumotlarga tegmaydi.

-- ============================================================
-- 1) bids jadvaliga Checkout.uz maydonlari
-- ============================================================

-- Checkout.uz invoysining UUID kodi (_uuid). status_payment shu orqali so'raladi.
alter table bids
  add column if not exists checkout_uuid text;

-- To'lov sahifasining havolasi (_url) — foydalanuvchi shu yerga yo'naltiriladi
alter table bids
  add column if not exists payment_url text;

-- Invoys qachon "o'ladi" (Checkout.uz sukut bo'yicha 1 soat beradi)
alter table bids
  add column if not exists expires_at timestamptz;

-- Qaysi to'lov tizimi orqali to'landi: click | payme | plum | vmcard
alter table bids
  add column if not exists payment_system text;

create unique index if not exists idx_bids_checkout_uuid
  on bids (checkout_uuid)
  where checkout_uuid is not null;

create index if not exists idx_bids_pending_expiry
  on bids (expires_at)
  where status = 'pending';

-- ============================================================
-- 2) confirm_bid() — to'lovni tasdiqlashning YAGONA yo'li
-- ============================================================
-- Nima uchun bu funksiya kerak?
--
-- To'lov ikki xil yo'l bilan tasdiqlanishi mumkin:
--   a) Checkout.uz webhook yuboradi
--   b) foydalanuvchi "rahmat" sahifasiga qaytadi va biz o'zimiz so'raymiz
-- Ikkalasi bir vaqtda kelib qolishi mumkin. Agar oddiy "o'qi -> qo'sh -> yoz"
-- qilsak, bitta to'lov ikki marta hisoblanib ketishi mumkin edi.
--
-- Bu funksiya hammasini bitta tranzaksiyada, qatorni "for update" bilan
-- qulflab bajaradi. Shuning uchun necha marta chaqirsangiz ham,
-- pul faqat BIR MARTA qo'shiladi.
--
-- applied = true  -> bid endi hisoblandi (Revenge xabarini yuborish kerak)
-- applied = false -> allaqachon hisoblangan yoki topilmadi (hech narsa qilinmaydi)

create or replace function confirm_bid(
  p_bid_id uuid,
  p_payment_system text default null
)
returns table (
  applied boolean,
  old_total bigint,
  new_total bigint,
  out_listing_id uuid,
  out_username text,
  out_name text
)
language plpgsql
security definer
as $$
declare
  v_bid     bids%rowtype;
  v_listing listings%rowtype;
  v_old     bigint;
  v_new     bigint;
begin
  -- Bid qatorini qulflaymiz — parallel so'rov kutib turadi
  select * into v_bid from bids where id = p_bid_id for update;

  if not found then
    return query select false, 0::bigint, 0::bigint, null::uuid, null::text, null::text;
    return;
  end if;

  -- Allaqachon to'langan — takroriy chaqiruv, hech narsa qilmaymiz
  if v_bid.status = 'paid' then
    select * into v_listing from listings where id = v_bid.listing_id;
    return query select false, v_listing.total_bid, v_listing.total_bid,
                        v_listing.id, v_listing.username, v_listing.name;
    return;
  end if;

  update bids
     set status = 'paid',
         paid_at = now(),
         payment_system = coalesce(p_payment_system, payment_system)
   where id = p_bid_id;

  select * into v_listing from listings where id = v_bid.listing_id for update;

  v_old := v_listing.total_bid;
  v_new := v_old + v_bid.amount;

  update listings
     set total_bid   = v_new,
         status      = 'active',
         boost_count = boost_count + 1
   where id = v_bid.listing_id;

  return query select true, v_old, v_new,
                      v_listing.id, v_listing.username, v_listing.name;
end;
$$;

-- ============================================================
-- 3) Muddati o'tgan to'lanmagan bidlarni tozalash
-- ============================================================
-- Odam bid bosdi, to'lov sahifasi ochildi, lekin to'lamadi.
-- 1 soatdan keyin invoys o'ladi — bunday yozuvlarni 'failed' qilamiz,
-- aks holda baza keraksiz "pending" bilan to'lib ketadi.

create or replace function expire_stale_bids()
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  with expired as (
    update bids
       set status = 'failed'
     where status = 'pending'
       and expires_at is not null
       and expires_at < now() - interval '10 minutes'
    returning id
  )
  select count(*) into v_count from expired;

  -- Hech qachon to'lanmagan va hech qanday bidi bo'lmagan listinglarni ham
  -- o'chirib yuboramiz (reytingda ko'rinmaydi, shunchaki joy egallaydi)
  delete from listings l
   where l.status = 'pending'
     and l.total_bid = 0
     and l.created_at < now() - interval '24 hours'
     and not exists (
       select 1 from bids b
        where b.listing_id = l.id and b.status = 'paid'
     );

  return v_count;
end;
$$;
