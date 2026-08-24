import { supabase } from './_lib/supabase.js';

// POST /api/track-click
// Body: { id: "<listing uuid>" }
// "Tashrif buyurish" bosilganda chaqiriladi — faqat Topchiq.uz orqali
// o'tgan kliklarni sanaydi.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Faqat POST' });
  }

  const { id } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: 'id yo\'q' });
  }

  const { data: listing } = await supabase
    .from('listings')
    .select('clicks')
    .eq('id', id)
    .maybeSingle();

  if (!listing) {
    // Klik hisoblanmasa ham foydalanuvchiga xalaqit bermaymiz
    return res.status(200).json({ ok: true, tracked: false });
  }

  await supabase
    .from('listings')
    .update({ clicks: (listing.clicks || 0) + 1 })
    .eq('id', id);

  res.status(200).json({ ok: true, tracked: true });
}
