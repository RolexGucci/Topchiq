import { supabase } from './_lib/supabase.js';
import { notifyOvertakenListings } from './_lib/revenge.js';

// POST /api/checkout-webhook
//
// !!! DIQQAT — BU FAYL HALI TO'LIQ TAYYOR EMAS !!!
// Checkout.uz "kassa"ni tasdiqlagach, ular sizga aniq JSON-API hujjatini
// beradi (qaysi maydon nomlari bilan order_id/summa/status yuborilishi,
// va MD5 imzoni qanday tekshirish kerakligi). O'sha hujjatni menga
// ko'rsating (skrinshot yoki matn) — shundan keyin quyidagi ikkita
// qismni ("TODO" deb belgilangan joylarni) aniq to'ldiraman:
//   1) Imzo (signature) tekshiruvi — soxta so'rovlarni rad etish uchun SHART
//   2) Checkout.uz yuboradigan maydon nomlari (order_id, amount, status)
//
// Bu ikkalasi to'g'ri bo'lmasa, tizim ishlamaydi yoki (undan ham yomoni)
// birov soxta "to'lov muvaffaqiyatli" xabar yuborib, pulsiz reytingga
// chiqib olishi mumkin — shuning uchun buni taxmin bilan yozmayapman.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Faqat POST' });
  }

  // ---- TODO 1: IMZONI TEKSHIRISH (xavfsizlik uchun SHART) ----
  // const isValid = verifyCheckoutSignature(req.body, process.env.CHECKOUT_UZ_SECRET);
  // if (!isValid) return res.status(403).json({ error: 'Noto'g'ri imzo' });

  // ---- TODO 2: Checkout.uz'ning haqiqiy maydon nomlari bilan almashtiriladi ----
  const { order_id, amount, status } = req.body || {};

  if (!order_id) {
    return res.status(400).json({ error: 'order_id yo\'q' });
  }

  if (status !== 'paid' && status !== 'success') {
    // To'lov hali tasdiqlanmagan — hech narsa qilmaymiz
    return res.status(200).json({ ok: true, skipped: true });
  }

  // bids jadvalida checkout_order_id orqali mos bidni topamiz
  const { data: bid, error: findErr } = await supabase
    .from('bids')
    .select('id, listing_id, amount, status')
    .eq('checkout_order_id', order_id)
    .maybeSingle();

  if (findErr || !bid) {
    return res.status(404).json({ error: 'Bid topilmadi' });
  }

  if (bid.status === 'paid') {
    // Takroriy webhook — xavfsiz, hech narsa qilmaymiz
    return res.status(200).json({ ok: true, already_paid: true });
  }

  // Bidni "paid" qilib belgilaymiz
  await supabase
    .from('bids')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', bid.id);

  // Listing'ning jami bidini oshiramiz va "active" qilamiz (reytingga chiqadi)
  const { data: listing } = await supabase
    .from('listings')
    .select('username, name, total_bid, boost_count')
    .eq('id', bid.listing_id)
    .single();

  const oldTotal = listing?.total_bid || 0;
  const newTotal = oldTotal + bid.amount;

  await supabase
    .from('listings')
    .update({
      total_bid: newTotal,
      status: 'active',
      boost_count: (listing?.boost_count || 0) + 1,
    })
    .eq('id', bid.listing_id);

  // Revenge: shu bid tufayli kim bosib o'tilgan bo'lsa, ularga xabar yuboramiz.
  // Xatolik bo'lsa ham to'lov jarayoniga ta'sir qilmasin deb try/catch bilan o'raymiz.
  try {
    await notifyOvertakenListings({
      listingId: bid.listing_id,
      listingName: listing?.name,
      listingUsername: listing?.username,
      oldTotal,
      newTotal,
    });
  } catch (e) {
    console.error('Revenge xabarnomasi yuborishda xato:', e);
  }

  res.status(200).json({ ok: true });
}
