const {
  createHmac,
  timingSafeEqual
} = require('node:crypto');

 
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

   
  const keys = entries.map(
    ([key]) => key
  );

  if (
    new Set(keys).size !== keys.length
  ) {
    return null;
  }

   
  const receivedHash = params.get('hash');

  if (
    !receivedHash ||
    !/^[0-9a-f]{64}$/i.test(receivedHash)
  ) {
    return null;
  }

   
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

   
  const secretKey = createHmac(
    'sha256',
    'WebAppData'
  )
    .update(botToken)
    .digest();

   
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

     
    return String(user.id);
  } catch {
    return null;
  }
}
 
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