import { supabase } from './_lib/supabase.js';
import { settleBid } from './_lib/settle-bid.js';

// GET /api/payment-status?bid=<uuid>
//
// "Rahmat" sahifasi shu manzilni har 2 soniyada so'rab turadi.
//
// Nima uchun kerak?
// Checkout.uz webhook'ni faqat bir marta yuboradi va muvaffaqiyatsiz bo'lsa
// QAYTA URINMAYDI. Agar o'sha bir lahzada bizning serverimiz javob bermay
// qolsa, to'lov abadiy "pending" bo'lib qolardi.
//
// Bu endpoint zaxira yo'l: foydalanuvchi to'lab qaytganda biz o'zimiz
// Checkout.uz'dan so'rab, to'lovni tasdiqlaymiz. Webhook allaqachon
// ishlagan bo'lsa, hech narsa takrorlanmaydi.

export default async function handler(req, res) {
  const bidId = req.query.bid;

  if (!bidId) {
    return res.status(400).json({ error: 'bid parametri yo\'q' });
  }

  // UUID formatini tekshiramiz — bazaga axlat yubormaslik uchun
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bidId)) {
    return res.status(400).json({ error: 'Noto\'g\'ri bid identifikatori' });
  }

  const { data: bid, error } = await supabase
    .from('bids')
    .select('id, status, amount, expires_at, listing_id')
    .eq('id', bidId)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: 'Baza xatosi' });
  }
  if (!bid) {
    return res.status(404).json({ error: 'Topilmadi' });
  }

  // Allaqachon to'langan — darrov javob beramiz
  if (bid.status === 'paid') {
    return res.status(200).json(await withListing(bid, 'paid'));
  }

  if (bid.status === 'failed') {
    return res.status(200).json({ status: 'failed' });
  }

  // Hali "pending" — Checkout.uz'dan tekshirib ko'ramiz
  let result;
  try {
    result = await settleBid({ bidId: bid.id });
  } catch (e) {
    console.error('payment-status: settleBid xatosi', e);
    return res.status(200).json({ status: 'error', reason: 'settle_crashed' });
  }

  if (result.applied || result.reason === 'already_paid') {
    return res.status(200).json(await withListing(bid, 'paid'));
  }

  // Tekshiruvning o'zi ishlamadi (Checkout.uz javob bermadi, kalit noto'g'ri
  // va h.k.). Sahifa bunda bekorga aylanib turmasligi kerak — sababni
  // qaytaramiz va foydalanuvchiga aniq xabar ko'rsatiladi.
  if (!result.ok) {
    return res.status(200).json({ status: 'error', reason: result.reason });
  }

  // Muddati o'tganmi?
  if (bid.expires_at && new Date(bid.expires_at) < new Date()) {
    return res.status(200).json({ status: 'expired' });
  }

  res.status(200).json({ status: 'pending' });
}

// To'langan bo'lsa, listing haqida ham ma'lumot qo'shamiz —
// sahifada "@username hozir #3-o'rinda" deb ko'rsatish uchun.
async function withListing(bid, status) {
  const { data: listing } = await supabase
    .from('listings')
    .select('username, name, total_bid, avatar_url')
    .eq('id', bid.listing_id)
    .maybeSingle();

  if (!listing) return { status };

  // Nechanchi o'rinda ekanini hisoblaymiz
  const { count } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .gt('total_bid', listing.total_bid);

  return {
    status,
    amount: bid.amount,
    listing: {
      username: listing.username,
      name: listing.name,
      avatar_url: listing.avatar_url,
      total_bid: Number(listing.total_bid),
      rank: (count || 0) + 1,
    },
  };
}
