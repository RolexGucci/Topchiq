// Checkout.uz API bilan ishlash uchun kichik kutubxona.
// Rasmiy hujjat: https://checkout.uz/api-docs  (yoki https://checkout.uz/llm.txt)
//
// Vercel "Environment Variables" bo'limiga qo'shiladigan qiymatlar:
//   CHECKOUT_API_KEY   -> kassa sozlamalaridagi API kalit (SIRLI!)
//   CHECKOUT_API_BASE  -> ixtiyoriy. Sukut: https://checkout.uz/api/v1
//                         (zaxira server: https://pre-view.checkout.uz/api/v1)

const BASE = process.env.CHECKOUT_API_BASE || 'https://checkout.uz/api/v1';

// Checkout.uz belgilagan chegaralar
export const MIN_AMOUNT = 1000;
export const MAX_AMOUNT = 10000000;

function apiKey() {
  const key = process.env.CHECKOUT_API_KEY;
  if (!key) {
    throw new Error('CHECKOUT_API_KEY sozlanmagan (Vercel -> Environment Variables)');
  }
  return key;
}

// Umumiy so'rov yuboruvchi. Timeout qo'yilgan — Checkout.uz javob bermay
// qolsa, bizning funksiyamiz osilib qolmasligi kerak.
async function call(path, body, { timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      throw new Error("Checkout.uz javob bermadi (vaqt tugadi)");
    }
    throw new Error(`Checkout.uz'ga ulanib bo'lmadi: ${e.message}`);
  }
  clearTimeout(timer);

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Checkout.uz noto'g'ri javob qaytardi (HTTP ${res.status})`);
  }

  if (!res.ok) {
    // Hujjatdagi xato formati: { "error": "..." }
    const msg = data?.error || `HTTP ${res.status}`;

    // Eng ko'p uchraydigan ikkita xatoni tushunarli tilga o'giramiz,
    // chunki bularni ko'rsang sozlamada muammo bor degani.
    if (res.status === 401) {
      throw new Error(
        "Checkout.uz: API kalit noto'g'ri yoki kassa hali Faol emas"
      );
    }
    if (res.status === 403) {
      throw new Error(
        'Checkout.uz: IP ruxsat etilmagan. Kassa sozlamalarida ' +
          "IP Whitelist'ni o'chiring (Vercel'ning IP manzili doim o'zgaradi)."
      );
    }
    throw new Error(`Checkout.uz: ${msg}`);
  }

  return data;
}

// Yangi to'lov havolasi (invoys) yaratadi.
// Qaytaradi: { id, uuid, url, amount, expiresAt }
export async function createPayment({ amount, description, webhookUrl, returnUrl }) {
  const body = { amount };
  if (description) body.description = description;
  if (webhookUrl) body.webhook_url = webhookUrl;
  if (returnUrl) body.return_url = returnUrl;

  const data = await call('/create_payment', body);
  const p = data?.payment;

  if (!p?._id || !p?._url) {
    throw new Error("Checkout.uz to'lov havolasini qaytarmadi");
  }

  // Hujjatda maydon nomi "_lifteme" (ularning imlo xatosi) — 3600 soniya
  const lifetimeSec = Number(p?._lifteme?._second) || 3600;

  return {
    id: String(p._id),
    uuid: p._uuid || null,
    url: p._url,
    amount: Number(p._amount) || amount,
    expiresAt: new Date(Date.now() + lifetimeSec * 1000).toISOString(),
  };
}

// To'lov holatini Checkout.uz'ning O'ZIDAN so'raydi.
//
// BU ENG MUHIM FUNKSIYA. Webhook'da imzo (signature) yo'q, ya'ni
// istalgan odam bizning webhook manzilimizga soxta "to'landi" yuborishi
// mumkin. Shuning uchun hech qachon webhook'ning gapiga ishonmaymiz —
// har safar shu funksiya orqali haqiqatni Checkout.uz'dan so'raymiz.
//
// Qaytaradi: { status: 'pending'|'paid', amount, paidAt } yoki null
export async function getPaymentStatus({ id, uuid }) {
  // Hujjatga ko'ra id yoki uuid dan FAQAT BITTASI yuborilishi kerak
  const body = uuid ? { uuid } : { id: parseInt(id, 10) };

  let data;
  try {
    data = await call('/status_payment', body);
  } catch (e) {
    // 404 = bunday to'lov yo'q (yoki boshqa kassaga tegishli)
    if (/topilmadi|not found|404/i.test(e.message)) return null;
    throw e;
  }

  const d = data?.data;
  if (!d) return null;

  return {
    id: String(d.id),
    status: d.status,
    amount: Number(d.amount) || 0,
    paidAt: d.paid_at || null,
  };
}
