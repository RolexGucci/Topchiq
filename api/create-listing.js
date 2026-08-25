import { supabase } from './_lib/supabase.js';
import { fetchProfile } from './_lib/profile.js';
import { moderateListing } from './_lib/moderation.js';
import { verifyTelegramInitData } from './_lib/verify-initdata.js';
import { createPayment, MAX_AMOUNT } from './_lib/checkout.js';

// POST /api/create-listing
// Body: {
//   username: "@durov" | "t.me/durov",
//   amount: 500000,
//   category: "umumiy",
//   initData: "<Telegram Mini App initData>"   (ixtiyoriy)
// }
//
// Javob: { ok, payment_url, bid_id, ... }
// Frontend foydalanuvchini payment_url ga yo'naltiradi.

const MIN_BID = 5000; // Topchiq qoidasi (Checkout.uz'ning o'z minimumi 1,000)

// Saytimizning to'liq manzili. Vercel'da SITE_URL o'rnatilmagan bo'lsa,
// so'rov sarlavhasidan o'zi topib oladi.
function siteUrl(req) {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/+$/, '');
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Faqat POST' });
  }

  const { username, amount, category, initData } = req.body || {};

  // ---- Summani tekshirish ----
  const bidAmount = parseInt(amount, 10);

  if (!bidAmount || bidAmount < MIN_BID) {
    return res.status(400).json({ error: "Minimal bid 5,000 so'm" });
  }
  if (bidAmount > MAX_AMOUNT) {
    return res.status(400).json({
      error: `Bitta to'lovda eng ko'pi ${MAX_AMOUNT.toLocaleString('uz-UZ')} so'm. ` +
        `Kattaroq summa uchun bir necha marta bid qo'shing.`,
    });
  }

  // ---- Kim ekanini aniqlash (Mini App bo'lsa) ----
  const tg = initData ? verifyTelegramInitData(initData) : { valid: false };
  const verifiedUserId = tg.valid ? tg.user.id : null;

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username kiritilmagan' });
  }

  // ---- Telegramdan profilni olish ----
  const found = await fetchProfile(username);
  if (!found.found) {
    return res.status(400).json({
      error: "Bu Telegram havolasi topilmadi. Havola ochiq (public) bo'lishi kerak.",
    });
  }

  const profile = { ...found, verified_via_miniapp: tg.valid };

  // ---- Moderatsiya ----
  const mod = await moderateListing(profile);
  if (mod.blocked) {
    return res.status(403).json({ error: `Rad etildi: ${mod.reason}` });
  }

  // ---- Listing (bor bo'lsa ustiga qo'shamiz) ----
  let { data: listing } = await supabase
    .from('listings')
    .select('id, status, name')
    .eq('username', profile.username)
    .maybeSingle();

  if (!listing) {
    const { data: newListing, error: insertErr } = await supabase
      .from('listings')
      .insert({
        username: profile.username,
        type: profile.type,
        name: profile.name,
        bio: profile.bio,
        avatar_url: profile.avatar_url || null,
        subs: profile.subs || null,
        verified_via_miniapp: profile.verified_via_miniapp,
        category: category || 'umumiy',
        status: 'pending',
        total_bid: 0,
        owner_telegram_user_id: verifiedUserId,
      })
      .select('id, name')
      .single();

    if (insertErr) {
      return res.status(500).json({ error: insertErr.message });
    }
    listing = newListing;
  } else if (verifiedUserId) {
    await supabase
      .from('listings')
      .update({ owner_telegram_user_id: verifiedUserId })
      .eq('id', listing.id)
      .is('owner_telegram_user_id', null);
  }

  // ---- Bid yozuvi (hozircha "pending") ----
  const { data: bid, error: bidErr } = await supabase
    .from('bids')
    .insert({
      listing_id: listing.id,
      amount: bidAmount,
      status: 'pending',
    })
    .select('id')
    .single();

  if (bidErr) {
    return res.status(500).json({ error: bidErr.message });
  }

  // ---- Checkout.uz'da to'lov ochamiz ----
  const base = siteUrl(req);

  let payment;
  try {
    payment = await createPayment({
      amount: bidAmount,
      description: `Topchiq — @${profile.username} reytingda ko'tarish`,
      // Webhook: to'lov tasdiqlangach Checkout.uz shu manzilga xabar beradi
      webhookUrl: `${base}/api/checkout-webhook`,
      // Return: foydalanuvchi to'lagach shu sahifaga qaytariladi
      returnUrl: `${base}/rahmat.html?bid=${bid.id}`,
    });
  } catch (e) {
    // To'lov ochilmadi — bidni "failed" qilib qo'yamiz, chala qolmasin
    await supabase.from('bids').update({ status: 'failed' }).eq('id', bid.id);

    console.error('Checkout.uz to\'lov ochishda xato:', e.message);
    return res.status(502).json({
      error: e.message || "To'lov tizimiga ulanib bo'lmadi. Birozdan so'ng urinib ko'ring.",
    });
  }

  // ---- Checkout ma'lumotlarini bidga bog'laymiz ----
  const { error: linkErr } = await supabase
    .from('bids')
    .update({
      checkout_order_id: payment.id,
      checkout_uuid: payment.uuid,
      payment_url: payment.url,
      expires_at: payment.expiresAt,
    })
    .eq('id', bid.id);

  if (linkErr) {
    // Bu jiddiy: to'lov ochildi, lekin biz uni bidga bog'lay olmadik.
    // Ya'ni odam to'lasa ham, qaysi bidga tegishli ekanini bilmaymiz.
    // Shuning uchun to'lovga yo'naltirmaymiz.
    console.error('KRITIK: bidni checkout bilan bog\'lab bo\'lmadi', linkErr, payment);
    return res.status(500).json({
      error: "To'lovni ro'yxatga olishda xatolik. Iltimos qaytadan urinib ko'ring.",
    });
  }

  res.status(200).json({
    ok: true,
    bid_id: bid.id,
    listing_id: listing.id,
    username: profile.username,
    amount: bidAmount,
    payment_url: payment.url,
    expires_at: payment.expiresAt,
  });
}
