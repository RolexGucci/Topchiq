import { cleanUsername } from './_lib/tme-preview.js';

// GET /api/avatar?u=username
//
// NEGA KERAK:
// t.me sahifasidagi profil rasmi (og:image) VAQTINCHALIK havola.
// Uni bir marta olib bazaga saqlab qo'ysak, bir muddatdan keyin
// Telegram uni eskirtiradi va rasm 403/404 bo'lib qoladi — frontend
// buni "xato" deb qabul qilib, o'rniga harf ko'rsata boshlaydi.
//
// Yechim: bazada URL saqlamaymiz. Buning o'rniga har safar shu
// endpoint chaqirilganda t.me sahifasini QAYTADAN o'qib, ENG YANGI
// rasmni topib, uni frontendga uzatamiz. Shuning uchun rasm hech
// qachon eskirmaydi.

const CACHE_SECONDS = 3600; // 1 soat — server yukini kamaytiradi

function pickImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

// Kichik shaffof PNG — rasm topilmasa yoki xato bo'lsa shuni qaytaramiz.
// Frontendning <img onError> logikasi buni "rasm yo'q" deb harfga
// almashtiradi — xuddi avvalgidek ishlaydi, faqat 404 o'rniga.
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

function sendFallback(res) {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=60'); // qisqa — tez qaytadan urinsin
  res.status(200).send(TRANSPARENT_PNG);
}

export default async function handler(req, res) {
  const username = cleanUsername(req.query.u || '');

  if (!username || !/^[A-Za-z0-9_]{4,32}$/.test(username)) {
    return sendFallback(res);
  }

  let html;
  try {
    const pageRes = await fetch(`https://t.me/${username}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!pageRes.ok) return sendFallback(res);
    html = await pageRes.text();
  } catch {
    return sendFallback(res);
  }

  const imageUrl = pickImage(html);
  if (!imageUrl) return sendFallback(res);

  // Rasmning o'zini Telegram CDN'idan olib, o'zimiznikidek uzatamiz.
  // Bu shuningdek referrer-policy muammolarining oldini oladi.
  let imgRes;
  try {
    imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(6000) });
    if (!imgRes.ok) return sendFallback(res);
  } catch {
    return sendFallback(res);
  }

  const buf = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Cache-Control',
    `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`
  );
  res.status(200).send(buf);
}
