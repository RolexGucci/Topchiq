import { settleBid } from './_lib/settle-bid.js';

// POST /api/checkout-webhook
//
// Checkout.uz to'lov tasdiqlangach shu manzilga POST yuboradi.
// Kassa sozlamalarida "Webhook URL" sifatida shu manzilni ko'rsating:
//   https://SIZNING-DOMENINGIZ/api/checkout-webhook
//
// ============================================================
// MUHIM XAVFSIZLIK ESLATMASI
// ============================================================
// Checkout.uz hujjatida aniq yozilgan: webhook so'rovlariga hech qanday
// kriptografik imzo qo'shilmaydi. Ya'ni bu manzilni bilgan HAR QANDAY
// odam soxta "to'lov muvaffaqiyatli" xabarini yuborishi mumkin.
//
// Shuning uchun biz bu so'rovning MAZMUNIGA UMUMAN ISHONMAYMIZ.
// Undan faqat bitta narsani olamiz: "shu buyurtmani tekshirib ko'r" degan
// signal. Keyin settleBid() Checkout.uz'ning /status_payment endpointiga
// murojaat qilib, to'lov haqiqatan bo'lganini o'z serveridan so'raydi.
//
// Natijada: soxta webhook yuborgan odam hech narsaga erisha olmaydi.
// ============================================================
//
// Yana bir e'tibor: Checkout.uz muvaffaqiyatsiz yetkazishni QAYTA
// YUBORMAYDI. Shuning uchun webhook yagona umid emas — foydalanuvchi
// "rahmat" sahifasiga qaytganda /api/payment-status ham xuddi shu
// tekshiruvni bajaradi. Ikkalasidan qaysi biri birinchi kelsa, o'sha
// ishlaydi; ikkinchisi hech narsa qilmaydi.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Faqat POST' });
  }

  const body = req.body || {};
  const data = body.data || {};

  // Checkout.uz'ning maydonlari (llm.txt hujjatidan):
  //   body.event            -> "payment_confirmed"
  //   body.payment_system   -> "click" | "payme" | "plum" | "vmcard"
  //   body.data.order_id    -> create_payment javobidagi _id
  const orderId = data.order_id;

  if (!orderId) {
    return res.status(400).json({ error: "order_id yo'q" });
  }

  // Hozircha faqat bitta hodisa turi bor, lekin kelajakda boshqasi
  // qo'shilsa, uni jimgina o'tkazib yuboramiz.
  if (body.event && body.event !== 'payment_confirmed') {
    return res.status(200).json({ ok: true, skipped: body.event });
  }

  let result;
  try {
    result = await settleBid({ checkoutOrderId: orderId });
  } catch (e) {
    console.error('checkout-webhook: kutilmagan xato', e);
    // 500 qaytarsak Checkout.uz baribir qayta yubormaydi, lekin
    // ularning panelida "muvaffaqiyatsiz" bo'lib ko'rinadi — shunisi to'g'ri.
    return res.status(500).json({ error: 'internal' });
  }

  if (!result.ok && result.reason === 'not_found') {
    // Bizda bunday bid yo'q. Ehtimol soxta so'rov yoki boshqa loyihaning
    // to'lovi. 200 qaytaramiz — qayta urinishlarini istamaymiz.
    console.warn('checkout-webhook: noma\'lum order_id', orderId);
    return res.status(200).json({ ok: true, ignored: true });
  }

  if (result.applied) {
    console.log(
      `To'lov tasdiqlandi: @${result.listing.username} -> ` +
        `${result.listing.newTotal.toLocaleString('uz-UZ')} so'm`
    );
  }

  // Checkout.uz'dan kutilgani — oddiy HTTP 200
  res.status(200).json({ ok: true, applied: result.applied });
}
