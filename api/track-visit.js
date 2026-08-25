import crypto from 'crypto';
import { supabase } from './_lib/supabase.js';

// POST /api/track-visit
//
// Sahifa ochilganda va keyin har 30 soniyada chaqiriladi.
// Ikki vazifasi bor:
//   1) kunlik noyob tashrifni yozish (bir odam kuniga bir marta)
//   2) "hozir onlayn" belgisini yangilash
//
// MAXFIYLIK
// Biz cookie ishlatmaymiz va hech kimning shaxsini saqlamaymiz.
// visitor_hash = SHA-256(IP + brauzer + bugungi sana + maxfiy so'z).
// Sana ichida bo'lgani uchun hash har kuni butunlay o'zgaradi —
// ya'ni bir odamni kundan kunga kuzatib bo'lmaydi. Bu Umami va
// Plausible kabi maxfiylikka e'tiborli tizimlar ishlatadigan usul.

function visitorHash(req) {
  // Vercel haqiqiy IP ni shu sarlavhada beradi
  const fwd = req.headers['x-forwarded-for'] || '';
  const ip = String(fwd).split(',')[0].trim() || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';

  // Har kuni yangilanadigan tuz
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.VISIT_SALT || 'topchiq-default-salt';

  return crypto
    .createHash('sha256')
    .update(`${ip}|${ua}|${day}|${salt}`)
    .digest('hex')
    .slice(0, 32);
}

// Botlarni ajratish.
// Googlebot, skanerlar, uptime monitorlar — bularning hammasi
// "tashrifchi" bo'lib sanalsa, raqam sun'iy shishadi va statistikaga
// ishonib bo'lmay qoladi.
const BOT_RE =
  /bot|crawl|spider|slurp|curl|wget|python|java|go-http|axios|node-fetch|headless|phantom|puppeteer|playwright|lighthouse|pingdom|uptime|monitor|preview|scrape|facebookexternalhit|whatsapp|telegrambot|vercel|semrush|ahrefs|dataprovider|bytespider|gptbot|claudebot|ccbot/i;

function isBot(req) {
  const ua = req.headers['user-agent'] || '';
  // User-agent umuman yo'q bo'lsa — bu ham odatda bot
  if (!ua.trim()) return true;
  return BOT_RE.test(ua);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Faqat POST' });
  }

  // Botni jimgina rad etamiz — u xato ko'rmaydi, biz sanamaymiz
  if (isBot(req)) {
    return res.status(200).json({ ok: true, counted: false });
  }

  try {
    const { error } = await supabase.rpc('record_visit', {
      p_hash: visitorHash(req),
    });

    if (error) {
      console.error('track-visit xatosi:', error);
      return res.status(200).json({ ok: false });
    }
  } catch (e) {
    // Statistika hech qachon saytni buzmasligi kerak
    console.error('track-visit kutilmagan xato:', e);
    return res.status(200).json({ ok: false });
  }

  res.status(200).json({ ok: true });
}
