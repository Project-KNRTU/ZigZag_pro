require('dotenv').config();

const path = require('node:path');
const express = require('express');

const {
  getPlaces,
  getEvents
} = require('./live-data');

const {
  saveRoute,
  getRoutes,
  getRouteById,
  deleteRoute
} = require('./database');

const {
  requireMaxUser
} = require('./max-auth');

const app = express();

const PORT = process.env.PORT || 3000;

console.log('ZIGZAG SERVER: STARTING');


app.use(express.json());


app.post('/webhook', async (request, response) => {
  try {
    const secret = process.env.MAX_WEBHOOK_SECRET;

    
    if (
      secret &&
      request.headers['x-max-bot-api-secret'] !== secret
    ) {
      console.warn('MAX WEBHOOK: неверный секрет');

      return response.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const update = request.body;

    console.log(
      'MAX WEBHOOK:',
      JSON.stringify(update, null, 2)
    );

     if (update.update_type === 'message_created') {
  const message = update.message || update;

  const userId = message.sender?.user_id;

  const chatId =
    message.recipient?.chat_id ||
    message.chat_id;

  const text =
    message.body?.text ||
    '';

  console.log('MAX MESSAGE:', {
    userId,
    botUserId: message.recipient?.user_id,
    chatId,
    text
  });

  if (userId) {
    await sendMaxMessage(
      userId,
      `Привет! 👋\n\nЯ бот ZigZag.\n\nТы написал: ${text}`
    );
  } else {
    console.warn(
      'MAX MESSAGE: не найден userId отправителя'
    );
  }
}

     
     if (update.update_type === 'bot_started') {
      const userId =
  message.sender?.user_id ||
  update.user_id;

  if (userId) {
    await sendMaxMessage(
      userId,
      'Привет! 👋 Я бот ZigZag.\n\nНажми кнопку ниже, чтобы открыть приложение.'
    );
  }
}

     
    return response.sendStatus(200);

  } catch (error) {
    console.error(
      'MAX WEBHOOK ERROR:',
      error
    );

     
    return response.sendStatus(200);
  }
});


    async function sendMaxMessage(userId, text) {
  const token = process.env.MAX_BOT_TOKEN;

  if (!token) {
    throw new Error(
      'MAX_BOT_TOKEN не настроен'
    );
  }

  console.log(
    'MAX SEND: отправляем пользователю:',
    userId
  );

  const url =
    `https://platform-api2.max.ru/messages?user_id=${encodeURIComponent(userId)}`;

  console.log(
    'MAX SEND URL:',
    url
  );

  const maxResponse = await fetch(
    url,
    {
      method: 'POST',

      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        text,

        attachments: [
          {
            type: 'inline_keyboard',
            payload: {
              buttons: [
                [
                  {
                    type: 'link',
                    text: '🚀 Открыть ZigZag',
                    url: 'https://zigzag-pro.onrender.com'
                  }
                ]
              ]
            }
          }
        ]
      })
    }
  );

  const result = await maxResponse.json();

  console.log(
    'MAX SEND RESPONSE:',
    JSON.stringify(result, null, 2)
  );

  if (!maxResponse.ok) {
    throw new Error(
      `MAX API ${maxResponse.status}: ${JSON.stringify(result)}`
    );
  }

  return result;
}


app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);


app.get('/api/health', (request, response) => {
  response.json({
    success: true,
    status: 'ok',
    message: 'ZigZag server is running'
  });
});



app.get('/api/config', (request, response) => {
  const mapglKey = process.env.MAPGL_KEY;
  const directionsKey = process.env.DIRECTIONS_KEY;

  if (!mapglKey || !directionsKey) {
    return response.status(500).json({
      success: false,
      error: 'MAPGL_KEY или DIRECTIONS_KEY не настроены.'
    });
  }

  response.json({
    success: true,
    mapglKey,
    directionsKey
  });
});



app.get('/api/places', async (request, response) => {
  try {
    const categoriesParameter = String(
      request.query.categories || ''
    );

    const categories = categoriesParameter
      .split(',')
      .map((category) => category.trim())
      .filter(Boolean);

    const places = await getPlaces(categories);

    response.json({
      success: true,
      source: '2GIS Search API',
      count: places.length,
      places
    });
  } catch (error) {
    console.error(
      'Ошибка поиска мест:',
      error
    );

    response.status(500).json({
      success: false,
      error: 'Не удалось получить реальные места.',
      details: error.message
    });
  }
});


app.get('/api/events', async (request, response) => {
  try {
    const visitDate = String(
      request.query.date || ''
    );

    if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
      return response.status(400).json({
        success: false,
        error:
          'Передайте параметр date в формате YYYY-MM-DD.'
      });
    }

    const events = await getEvents(visitDate);

    response.json({
      success: true,
      source: 'KudaGo',
      visitDate,
      count: events.length,
      updatedAt: new Date().toISOString(),
      events
    });
  } catch (error) {
    console.error(
      'Ошибка загрузки афиши:',
      error
    );

    response.status(500).json({
      success: false,
      error: 'Не удалось получить афишу Казани.',
      details: error.message
    });
  }
});



app.use(
  '/api/routes',
  requireMaxUser
);



app.get('/api/routes', (request, response) => {
  try {
    const routes = getRoutes(
      request.maxUserId
    );

    response.json({
      success: true,
      routes
    });
  } catch (error) {
    console.error(
      'Ошибка чтения маршрутов:',
      error
    );

    response.status(500).json({
      success: false,
      error:
        'Не удалось загрузить сохранённые маршруты.'
    });
  }
});



app.get(
  '/api/routes/:id',
  (request, response) => {
    try {
      const routeId = Number(
        request.params.id
      );

      if (
        !Number.isInteger(routeId) ||
        routeId <= 0
      ) {
        return response.status(400).json({
          success: false,
          error: 'Некорректный ID маршрута.'
        });
      }

      const route = getRouteById(
        request.maxUserId,
        routeId
      );

      if (!route) {
        return response.status(404).json({
          success: false,
          error: 'Маршрут не найден.'
        });
      }

      response.json({
        success: true,
        route
      });
    } catch (error) {
      console.error(
        'Ошибка чтения маршрута:',
        error
      );

      response.status(500).json({
        success: false,
        error:
          'Не удалось открыть маршрут.'
      });
    }
  }
);



app.post(
  '/api/routes',
  (request, response) => {
    try {
      const routeData = request.body;

      if (
        !routeData ||
        typeof routeData !== 'object' ||
        Array.isArray(routeData)
      ) {
        return response.status(400).json({
          success: false,
          error:
            'Не переданы данные маршрута.'
        });
      }

      if (
        !Array.isArray(routeData.route) ||
        routeData.route.length === 0
      ) {
        return response.status(400).json({
          success: false,
          error:
            'Нельзя сохранить пустой маршрут.'
        });
      }

      const routeId = saveRoute(
        request.maxUserId,
        routeData
      );

      response.status(201).json({
        success: true,
        message: 'Маршрут сохранён.',
        id: routeId
      });
    } catch (error) {
      console.error(
        'Ошибка сохранения маршрута:',
        error
      );

      response.status(500).json({
        success: false,
        error:
          'Не удалось сохранить маршрут.'
      });
    }
  }
);



app.delete(
  '/api/routes/:id',
  (request, response) => {
    try {
      const routeId = Number(
        request.params.id
      );

      if (
        !Number.isInteger(routeId) ||
        routeId <= 0
      ) {
        return response.status(400).json({
          success: false,
          error: 'Некорректный ID маршрута.'
        });
      }

      const wasDeleted = deleteRoute(
        request.maxUserId,
        routeId
      );

      if (!wasDeleted) {
        return response.status(404).json({
          success: false,
          error: 'Маршрут не найден.'
        });
      }

      response.json({
        success: true,
        message: 'Маршрут удалён.'
      });
    } catch (error) {
      console.error(
        'Ошибка удаления маршрута:',
        error
      );

      response.status(500).json({
        success: false,
        error:
          'Не удалось удалить маршрут.'
      });
    }
  }
);


app.use(
  (request, response) => {
    response.status(404).json({
      success: false,
      error: 'Адрес API не найден.'
    });
  }
);



app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log('');
    console.log('==============================');
    console.log(' ZigZag запущен');
    console.log(` Порт: ${PORT}`);
    console.log('==============================');
    console.log('');
  }
);
