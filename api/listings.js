import { supabase } from './_lib/supabase.js';

// GET /api/listings?category=umumiy&page=1
// Reyting ro'yxatini qaytaradi: total_bid bo'yicha kamayish tartibida,
// har sahifada 50 tadan (Sindir.uz kabi).
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Faqat GET' });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const category = req.query.category;

  let query = supabase
    .from('listings')
    .select('id, username, type, name, bio, avatar_url, category, total_bid, clicks, boost_count', {
      count: 'exact',
    })
    .eq('status', 'active')
    .order('total_bid', { ascending: false })
    .range(from, to);

  if (category && category !== 'umumiy') {
    query = query.eq('category', category);
  }

  const { data, count, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({
    listings: data,
    total: count,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
