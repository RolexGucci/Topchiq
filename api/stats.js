import { supabase } from './_lib/supabase.js';

// GET /api/stats
//
// Footerdagi "Live Statistika" bloki uchun barcha raqamlar.
// Hammasi bitta baza so'rovida olinadi — tez ishlaydi.
//
// MUHIM: kliklar, loyihalar va bidlar BUTUN bazadan hisoblanadi.
// Ilgari frontend faqat ochilgan sahifadagi 50 ta loyihani qo'shar edi,
// shuning uchun loyihalar 50 tadan oshganda raqam noto'g'ri chiqardi.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Faqat GET' });
  }

  // Brauzer keshlamasin — raqamlar jonli bo'lishi kerak.
  // Lekin Vercel chekkasida 10 soniya keshlash mumkin: bu bazani
  // ortiqcha yuklamaydi, foydalanuvchi esa farqni sezmaydi.
  // Kesh qisqa: "hozir onlayn" jonli tuyulishi kerak.
  // 5 soniya bazani ortiqcha yuklamaydi, lekin raqam eskirib qolmaydi.
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');

  const { data, error } = await supabase.rpc('get_site_stats');

  if (error) {
    console.error('stats xatosi:', error);
    return res.status(500).json({ error: error.message });
  }

  const row = Array.isArray(data) ? data[0] : data;

  res.status(200).json({
    totalVisits: Number(row?.total_visits || 0),
    dailyVisits: Number(row?.daily_visits || 0),
    onlineNow: Number(row?.online_now || 0),
    totalClicks: Number(row?.total_clicks || 0),
    totalProjects: Number(row?.total_projects || 0),
    totalBids: Number(row?.total_bids || 0),
  });
}
