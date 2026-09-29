const {
  createHmac,
  timingSafeEqual
} = require('node:crypto');

/*
  Проверяет подписанные данные MAX и
  возвращает настоящий user.id.

  Если данные не прошли проверку —
  возвращает null.
*/
function getVerifiedUserId(
  rawInitData,
  botToken
) {
  if (
    typeof rawInitData !== 'string' ||
    !rawInitData ||
    !botToken
  ) {
    return null;
  }

  const params = new URLSearchParams(
    rawInitData
  );

  const entries = [
    ...params.entries()
  ];

  /*
    Не допускаем повторяющиеся параметры.
  */
  const keys = entries.map(
    ([key]) => key
  );

  if (
    new Set(keys).size !== keys.length
  ) {
    return null;
  }

  /*
    Получаем подпись MAX.
  */
  const receivedHash = params.get('hash');

  if (
    !receivedHash ||
    !/^[0-9a-f]{64}$/i.test(receivedHash)
  ) {
    return null;
  }

  /*
    Формируем строку для проверки подписи.
  */
  const checkString = entries
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => {
      if (left < right) {
        return -1;
      }

      if (left > right) {
        return 1;
      }

      return 0;
    })
    .map(
      ([key, value]) =>
        `${key}=${value}`
    )
    .join('\n');

  /*
    Создаём секретный ключ из BOT_TOKEN.
  */
  const secretKey = createHmac(
    'sha256',
    'WebAppData'
  )
    .update(botToken)
    .digest();

  /*
    Вычисляем ожидаемую подпись.
  */
  const expectedHash = createHmac(
    'sha256',
    secretKey
  )
    .update(checkString)
    .digest();

  const actualHash = Buffer.from(
    receivedHash,
    'hex'
  );

  /*
    Безопасно сравниваем подписи.
  */
  if (
    actualHash.length !==
      expectedHash.length ||
    !timingSafeEqual(
      actualHash,
      expectedHash
    )
  ) {
    return null;
  }

  /*
    Проверяем время создания initData.

    Не принимаем:
    - данные из будущего более чем на 60 секунд;
    - данные старше 1 часа.
  */
  const authDate = Number(
    params.get('auth_date')
  );

  const now = Math.floor(
    Date.now() / 1000
  );

  if (
    !Number.isSafeInteger(authDate) ||
    authDate > now + 60 ||
    now - authDate > 3600
  ) {
    return null;
  }

  /*
    Получаем пользователя из подписанных данных.
  */
  try {
    const user = JSON.parse(
      params.get('user') || 'null'
    );

    if (
      !user ||
      !Number.isSafeInteger(user.id) ||
      user.id <= 0
    ) {
      return null;
    }

    /*
      Возвращаем ID как строку,
      чтобы одинаково хранить его в SQLite.
    */
    return String(user.id);
  } catch {
    return null;
  }
}

/*
  Express middleware.

  Берёт исходный initData из:
  X-Max-Init-Data

  Проверяет подпись через BOT_TOKEN.

  Если пользователь подтверждён,
  записывает его ID в:

  request.maxUserId
*/
function requireMaxUser(
  request,
  response,
  next
) {
  const userId =
    getVerifiedUserId(
      request.get(
        'X-Max-Init-Data'
      ),
      process.env.BOT_TOKEN
    );

  if (!userId) {
    return response.status(401).json({
      success: false,
      error:
        'Не удалось подтвердить пользователя MAX.'
    });
  }

  request.maxUserId = userId;

  next();
}

module.exports = {
  getVerifiedUserId,
  requireMaxUser
};