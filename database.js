const fs = require('node:fs');
const path = require('node:path');

const Database = require('better-sqlite3');

/*
  Если DB_PATH есть в .env:
  ./data/zigzag.db

  База будет храниться в папке проекта:
  ZigZag_pro/data/zigzag.db

  Если переменной нет:
  ZigZag_pro/zigzag.db
*/
const databasePath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'zigzag.db');

/*
  Получаем папку, где должна лежать база.
*/
const databaseDirectory = path.dirname(
  databasePath
);

/*
  Создаём папку автоматически,
  если её ещё нет.
*/
fs.mkdirSync(databaseDirectory, {
  recursive: true
});

console.log(
  `SQLite database: ${databasePath}`
);

const db = new Database(databasePath);

/*
  Таблица сохранённых маршрутов.

  user_id — настоящий ID пользователя MAX.
*/
db.exec(`
  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id TEXT NOT NULL,

    title TEXT NOT NULL,

    route_data TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

/*
  Сохранение маршрута.
*/
function saveRoute(userId, routeData) {
  if (!userId) {
    throw new Error(
      'Не указан userId.'
    );
  }

  const title =
    routeData.title ||
    'Маршрут ZigZag';

  const statement = db.prepare(`
    INSERT INTO routes (
      user_id,
      title,
      route_data
    )
    VALUES (?, ?, ?)
  `);

  const result = statement.run(
    String(userId),
    title,
    JSON.stringify(routeData)
  );

  return Number(
    result.lastInsertRowid
  );
}

/*
  Список маршрутов текущего пользователя.
*/
function getRoutes(userId) {
  if (!userId) {
    throw new Error(
      'Не указан userId.'
    );
  }

  const statement = db.prepare(`
    SELECT
      id,
      title,
      route_data,
      created_at
    FROM routes
    WHERE user_id = ?
    ORDER BY id DESC
  `);

  const rows = statement.all(
    String(userId)
  );

  return rows.map((row) => {
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      data: JSON.parse(
        row.route_data
      )
    };
  });
}

/*
  Один маршрут по ID.

  Одновременно проверяем user_id,
  чтобы пользователь не мог открыть
  чужой маршрут.
*/
function getRouteById(userId, routeId) {
  if (!userId) {
    throw new Error(
      'Не указан userId.'
    );
  }

  const statement = db.prepare(`
    SELECT
      id,
      title,
      route_data,
      created_at
    FROM routes
    WHERE id = ?
      AND user_id = ?
  `);

  const row = statement.get(
    routeId,
    String(userId)
  );

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    data: JSON.parse(
      row.route_data
    )
  };
}

/*
  Удаление маршрута.

  Удалить можно только маршрут
  текущего пользователя.
*/
function deleteRoute(userId, routeId) {
  if (!userId) {
    throw new Error(
      'Не указан userId.'
    );
  }

  const statement = db.prepare(`
    DELETE FROM routes
    WHERE id = ?
      AND user_id = ?
  `);

  const result = statement.run(
    routeId,
    String(userId)
  );

  return result.changes > 0;
}

module.exports = {
  saveRoute,
  getRoutes,
  getRouteById,
  deleteRoute
};