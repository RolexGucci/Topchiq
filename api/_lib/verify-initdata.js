import crypto from 'crypto';

// Telegram Mini App "initData" ni tekshiradi.
//
// NEGA BU KERAK:
// Mini App ochilganda Telegram brauzerga foydalanuvchi ma'lumotini beradi.
// Lekin bu ma'lumot oddiy matn — kimdir uni o'zgartirib, "men falonchiman"
// deb yuborishi mumkin. Telegram shu sababli har bir initData'ga bot token
// asosida IMZO (hash) qo'yadi. Faqat bot token egasi (biz) shu imzoni
// tekshira oladi. Imzo to'g'ri bo'lsa — foydalanuvchi haqiqatan o'sha odam.
//
// Buni tekshirmasak, har kim istalgan odam nomidan profil qo'sha olardi.

export function verifyTelegramInitData(initData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !initData) return { valid: false };

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { valid: false };

    params.delete('hash');

    // Maydonlarni alifbo tartibida "kalit=qiymat" ko'rinishida qatorlash
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== hash) return { valid: false };

    // Eski initData'ni qabul qilmaymiz (24 soatdan oshgan bo'lsa)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (!authDate || ageSeconds > 86400) {
      return { valid: false, expired: true };
    }

    const userRaw = params.get('user');
    const user = userRaw ? JSON.parse(userRaw) : null;
    if (!user?.id) return { valid: false };

    return {
      valid: true,
      user: {
        id: user.id,
        username: user.username || null,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        photo_url: user.photo_url || null,
      },
    };
  } catch {
    return { valid: false };
  }
}
