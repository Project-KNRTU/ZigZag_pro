require('dotenv').config();

const path =require('node:path');
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
console.log('ZIGZAG SERVER: NEW SERVER.JS');

const PORT = process.env.PORT || 3000;

/*
  Разбираем JSON-запросы.
*/
app.use(express.json());


app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

/*
  Проверка работоспособности сервера.
*/
app.get('/api/health', (request, response) => {
  response.json({
    success: true,
    status: 'ok',
    message: 'ZigZag server is running'
  });
});

/*
  Конфигурация карт.
*/
app.get('/api/config', (request, response) => {
  const mapglKey = process.env.MAPGL_KEY;
  const directionsKey =
    process.env.DIRECTIONS_KEY;

  if (
    !mapglKey ||
    !directionsKey
  ) {
    return response.status(500).json({
      success: false,
      error:
        'В .env не указаны MAPGL_KEY или DIRECTIONS_KEY.'
    });
  }

  response.json({
    success: true,
    mapglKey,
    directionsKey
  });
});

/*
  Поиск мест.

  Этот API пока публичный.
*/
app.get('/api/places', async (
  request,
  response
) => {
  try {
    const categoriesParameter =
      String(
        request.query.categories || ''
      );

    const categories =
      categoriesParameter
        .split(',')
        .map(
          (category) =>
            category.trim()
        )
        .filter(Boolean);

    const places =
      await getPlaces(categories);

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
      error:
        'Не удалось получить реальные места.',
      details: error.message
    });
  }
});

/*
  Афиша событий.

  Этот API пока публичный.
*/
app.get('/api/events', async (
  request,
  response
) => {
  try {
    const visitDate =
      String(
        request.query.date || ''
      );

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        visitDate
      )
    ) {
      return response.status(400).json({
        success: false,
        error:
          'Передайте параметр date в формате YYYY-MM-DD.'
      });
    }

    const events =
      await getEvents(visitDate);

    response.json({
      success: true,
      source: 'KudaGo',
      visitDate,
      count: events.length,
      updatedAt:
        new Date().toISOString(),
      events
    });
  } catch (error) {
    console.error(
      'Ошибка загрузки афиши:',
      error
    );

    response.status(500).json({
      success: false,
      error:
        'Не удалось получить афишу Казани.',
      details: error.message
    });
  }
});

/*
  =====================================================
  ЗАЩИЩЁННЫЕ МАРШРУТЫ
  =====================================================

  Всё, что находится ниже:
    /api/routes
    /api/routes/:id

  требует подтверждённого пользователя MAX.

  requireMaxUser:
    1. получает X-Max-Init-Data;
    2. проверяет подпись;
    3. получает настоящий user.id;
    4. записывает его в request.maxUserId.

  После этого обработчик использует только
  request.maxUserId.
*/
app.use(
  '/api/routes',
  requireMaxUser
);

/*
  Получение маршрутов текущего пользователя.
*/
app.get('/api/routes', (
  request,
  response
) => {
  try {
    const routes =
      getRoutes(
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

/*
  Получение одного маршрута.

  ВАЖНО:
  database.js дополнительно проверяет,
  что этот маршрут принадлежит
  request.maxUserId.
*/
app.get('/api/routes/:id', (
  request,
  response
) => {
  try {
    const routeId =
      Number(
        request.params.id
      );

    if (
      !Number.isInteger(routeId) ||
      routeId <= 0
    ) {
      return response.status(400).json({
        success: false,
        error:
          'Некорректный ID маршрута.'
      });
    }

    const route =
      getRouteById(
        request.maxUserId,
        routeId
      );

    if (!route) {
      return response.status(404).json({
        success: false,
        error:
          'Маршрут не найден.'
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
});

/*
  Сохранение маршрута.

  userId НЕ берём из request.body.

  Пользователь определяется только
  через проверенный MAX initData.
*/
app.post('/api/routes', (
  request,
  response
) => {
  try {
    const routeData =
      request.body;

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
      !Array.isArray(
        routeData.route
      ) ||
      routeData.route.length === 0
    ) {
      return response.status(400).json({
        success: false,
        error:
          'Нельзя сохранить пустой маршрут.'
      });
    }

    const routeId =
      saveRoute(
        request.maxUserId,
        routeData
      );

    response.status(201).json({
      success: true,
      message:
        'Маршрут сохранён.',
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
});

/*
  Удаление маршрута.

  Удалить можно только маршрут
  текущего пользователя MAX.
*/
app.delete('/api/routes/:id', (
  request,
  response
) => {
  try {
    const routeId =
      Number(
        request.params.id
      );

    if (
      !Number.isInteger(routeId) ||
      routeId <= 0
    ) {
      return response.status(400).json({
        success: false,
        error:
          'Некорректный ID маршрута.'
      });
    }

    const wasDeleted =
      deleteRoute(
        request.maxUserId,
        routeId
      );

    if (!wasDeleted) {
      return response.status(404).json({
        success: false,
        error:
          'Маршрут не найден.'
      });
    }

    response.json({
      success: true,
      message:
        'Маршрут удалён.'
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
});


/*
  Если адрес не найден.
*/
app.use((
  request,
  response
) => {
  response.status(404).json({
    success: false,
    error:
      'Адрес API не найден.'
  });
});

/*
  Запуск сервера.
*/
app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log('');
    console.log(
      '=============================='
    );
    console.log(
      ' ZigZag запущен'
    );
    console.log(
      ` Порт: ${PORT}`
    );
    console.log(
      '=============================='
    );
    console.log('');
  }
); 