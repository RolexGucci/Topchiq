import { supabase } from './_lib/supabase.js';

// GET /api/cron-cleanup
//
// Vercel Cron kuniga bir marta chaqiradi (vercel.json'dagi "crons" bo'limi).
// Vazifasi: to'lanmagan va muddati o'tgan bidlarni 'failed' qilib belgilash.
//
// Nima uchun kerak? Odam bid bosdi, to'lov sahifasi ochildi, lekin to'lamadi.
// Checkout.uz invoysi 1 soatda o'ladi. Bunday yozuvlar tozalanmasa,
// baza vaqt o'tishi bilan keraksiz "pending" qatorlar bilan to'lib ketadi.

export default async function handler(req, res) {
  // Vercel Cron o'z so'roviga maxsus sarlavha qo'shadi. Tashqi odam
  // bu manzilni chaqira olmasligi uchun tekshiramiz.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Ruxsat yo\'q' });
    }
  }

  const { data, error } = await supabase.rpc('expire_stale_bids');

  if (error) {
    console.error('cron-cleanup xatosi:', error);
    return res.status(500).json({ error: error.message });
  }

  console.log(`cron-cleanup: ${data} ta muddati o'tgan bid tozalandi`);
  res.status(200).json({ ok: true, expired: data });
}
