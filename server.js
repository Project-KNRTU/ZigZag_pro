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


const app = express();

const PORT = process.env.PORT || 3000;


app.use(express.json());


app.use(
  express.static(__dirname)
);


/*
  Проверка запуска сервера.

  Откройте:
  http://localhost:3000/api/health
*/
app.get('/api/health', (request, response) => {
  response.json({
    success: true,
    status: 'ok',
    message: 'ZigZag server is running'
  });
});


/*
  Передаёт в браузер только публичные ключи,
  которые нужны карте и построению маршрутов.

  Адрес:
  GET /api/config
*/
app.get('/api/config', (request, response) => {
  const mapglKey = process.env.MAPGL_KEY;
  const directionsKey = process.env.DIRECTIONS_KEY;

  if (!mapglKey || !directionsKey) {
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
  Возвращает реальные места из 2ГИС Search API.

  Примеры:

  /api/places?categories=cafes

  /api/places?categories=cafes,museums,parks,sights
*/
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
    console.error('Ошибка поиска мест:', error);

    response.status(500).json({
      success: false,
      error: 'Не удалось получить реальные места.',
      details: error.message
    });
  }
});


/*
  Возвращает настоящую афишу Казани из KudaGo.

  Адрес:
  GET /api/events
*/
app.get('/api/events', async (request, response) => {
  try {
    const visitDate = String(request.query.date || '');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
      return response.status(400).json({
        success: false,
        error: 'Передайте параметр date в формате YYYY-MM-DD.'
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
    console.error('Ошибка загрузки афиши:', error);

    response.status(500).json({
      success: false,
      error: 'Не удалось получить афишу Казани.',
      details: error.message
    });
  }
});


/*
  Все сохранённые маршруты.

  Адрес:
  GET /api/routes
*/
app.get('/api/routes', (request, response) => {
  try {
    const routes = getRoutes();

    response.json({
      success: true,
      routes
    });
  } catch (error) {
    console.error('Ошибка чтения маршрутов:', error);

    response.status(500).json({
      success: false,
      error: 'Не удалось загрузить сохранённые маршруты.'
    });
  }
});


/*
  Один маршрут по ID.

  Пример:
  GET /api/routes/1
*/
app.get('/api/routes/:id', (request, response) => {
  try {
    const routeId = Number(request.params.id);

    if (!Number.isInteger(routeId) || routeId <= 0) {
      return response.status(400).json({
        success: false,
        error: 'Некорректный ID маршрута.'
      });
    }

    const route = getRouteById(routeId);

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
    console.error('Ошибка чтения маршрута:', error);

    response.status(500).json({
      success: false,
      error: 'Не удалось открыть маршрут.'
    });
  }
});


/*
  Сохраняет маршрут в zigzag.db.

  Адрес:
  POST /api/routes
*/
app.post('/api/routes', (request, response) => {
  try {
    const routeData = request.body;

    if (!routeData || typeof routeData !== 'object') {
      return response.status(400).json({
        success: false,
        error: 'Не переданы данные маршрута.'
      });
    }

    if (
      !Array.isArray(routeData.route) ||
      routeData.route.length === 0
    ) {
      return response.status(400).json({
        success: false,
        error: 'Нельзя сохранить пустой маршрут.'
      });
    }

    const routeId = saveRoute(routeData);

    response.status(201).json({
      success: true,
      message: 'Маршрут сохранён.',
      id: routeId
    });
  } catch (error) {
    console.error('Ошибка сохранения маршрута:', error);

    response.status(500).json({
      success: false,
      error: 'Не удалось сохранить маршрут.'
    });
  }
});


/*
  Удаляет сохранённый маршрут.

  Пример:
  DELETE /api/routes/1
*/
app.delete('/api/routes/:id', (request, response) => {
  try {
    const routeId = Number(request.params.id);

    if (!Number.isInteger(routeId) || routeId <= 0) {
      return response.status(400).json({
        success: false,
        error: 'Некорректный ID маршрута.'
      });
    }

    const wasDeleted = deleteRoute(routeId);

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
    console.error('Ошибка удаления маршрута:', error);

    response.status(500).json({
      success: false,
      error: 'Не удалось удалить маршрут.'
    });
  }
});


/*
  Главная страница приложения.
*/
app.get('/', (request, response) => {
  response.sendFile(
    path.join(__dirname, 'index.html')
  );
});


/*
  Обработка неизвестных адресов.
*/
app.use((request, response) => {
  response.status(404).json({
    success: false,
    error: 'Адрес API не найден.'
  });
});


app.listen(PORT, () => {
  console.log('');
  console.log('==============================');
  console.log(' ZigZag запущен');
  console.log(` http://localhost:${PORT}`);
  console.log('==============================');
  console.log('');
});