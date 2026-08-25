import { supabase } from './supabase.js';
import { getPaymentStatus } from './checkout.js';
import { notifyOvertakenListings } from './revenge.js';

// To'lovni tasdiqlashning YAGONA to'g'ri yo'li.
//
// Ikki joydan chaqiriladi:
//   1) /api/checkout-webhook   — Checkout.uz xabar berganda
//   2) /api/payment-status     — foydalanuvchi "rahmat" sahifasida kutayotganda
//
// Ikkalasi bir vaqtda kelsa ham muammo yo'q: pul faqat bir marta qo'shiladi
// (buni bazadagi confirm_bid() funksiyasi kafolatlaydi).
//
// Qaytaradi: { ok, applied, reason?, listing? }
export async function settleBid({ bidId, checkoutOrderId, checkoutUuid }) {
  // ---- 1. Bidni topamiz ----
  let query = supabase
    .from('bids')
    .select('id, listing_id, amount, status, checkout_order_id, checkout_uuid');

  if (bidId) {
    query = query.eq('id', bidId);
  } else if (checkoutUuid) {
    query = query.eq('checkout_uuid', checkoutUuid);
  } else if (checkoutOrderId) {
    query = query.eq('checkout_order_id', String(checkoutOrderId));
  } else {
    return { ok: false, applied: false, reason: 'no_identifier' };
  }

  const { data: bid, error: findErr } = await query.maybeSingle();

  if (findErr) {
    console.error('settleBid: bazadan o\'qishda xato', findErr);
    return { ok: false, applied: false, reason: 'db_error' };
  }
  if (!bid) {
    return { ok: false, applied: false, reason: 'not_found' };
  }

  // Allaqachon hisoblangan — tekshirib o'tirmaymiz, bekorga so'rov yubormaymiz
  if (bid.status === 'paid') {
    return { ok: true, applied: false, reason: 'already_paid' };
  }

  // ---- 2. HAQIQATNI CHECKOUT.UZ'DAN SO'RAYMIZ ----
  //
  // Webhook nima deganidan qat'i nazar shu qadam bajariladi.
  // Webhook'da imzo yo'q, demak unga ishonib bo'lmaydi — birov soxta
  // "to'landi" yuborsa, shu tekshiruv uni to'xtatadi.
  let payment;
  try {
    payment = await getPaymentStatus({
      uuid: bid.checkout_uuid,
      id: bid.checkout_order_id,
    });
  } catch (e) {
    console.error('settleBid: Checkout.uz tekshiruvi muvaffaqiyatsiz', e.message);
    return { ok: false, applied: false, reason: 'verify_failed' };
  }

  if (!payment) {
    return { ok: false, applied: false, reason: 'payment_not_found' };
  }

  if (payment.status !== 'paid') {
    return { ok: true, applied: false, reason: 'not_paid_yet' };
  }

  // Summa mos kelishini ham tekshiramiz — birov invoysni o'zgartirib
  // 1,000 so'm to'lab, 1,000,000 so'mlik o'rin olib qo'ymasin.
  if (Number(payment.amount) < Number(bid.amount)) {
    console.error(
      `settleBid: summa mos emas. Kutilgan ${bid.amount}, to'langan ${payment.amount}`
    );
    return { ok: false, applied: false, reason: 'amount_mismatch' };
  }

  // ---- 3. Atomik tasdiqlash (bazadagi confirm_bid funksiyasi) ----
  const { data: result, error: rpcErr } = await supabase.rpc('confirm_bid', {
    p_bid_id: bid.id,
    p_payment_system: null,
  });

  if (rpcErr) {
    console.error('settleBid: confirm_bid xatosi', rpcErr);
    return { ok: false, applied: false, reason: 'confirm_failed' };
  }

  const row = Array.isArray(result) ? result[0] : result;

  if (!row?.applied) {
    // Parallel so'rov bizdan oldin ulgurgan — bu normal holat
    return { ok: true, applied: false, reason: 'already_paid' };
  }

  // ---- 4. Revenge xabarnomasi ----
  // Xatolik bo'lsa ham to'lov muvaffaqiyatli hisoblanadi — shuning uchun
  // alohida try/catch ichida.
  try {
    await notifyOvertakenListings({
      listingId: row.out_listing_id,
      listingName: row.out_name,
      listingUsername: row.out_username,
      oldTotal: Number(row.old_total),
      newTotal: Number(row.new_total),
    });
  } catch (e) {
    console.error('Revenge xabarnomasi yuborilmadi:', e);
  }

  return {
    ok: true,
    applied: true,
    listing: {
      id: row.out_listing_id,
      username: row.out_username,
      name: row.out_name,
      newTotal: Number(row.new_total),
    },
  };
}
