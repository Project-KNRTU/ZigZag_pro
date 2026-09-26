const Database = require('better-sqlite3');

/*
  SQLite создаст файл zigzag.db
  в папке проекта автоматически.
*/
const db = new Database('zigzag.db');

/*
  Таблица для сохранённых маршрутов.

  Сейчас все маршруты относятся к тестовому пользователю.
  Позже вместо user_id = "development-user"
  будет использоваться настоящий ID пользователя MAX.
*/
db.exec(`
  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id TEXT NOT NULL DEFAULT 'development-user',

    title TEXT NOT NULL,

    route_data TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function saveRoute(routeData) {
  const title =
    routeData.title ||
    'Маршрут ZigZag';

  const statement = db.prepare(`
    INSERT INTO routes (
      title,
      route_data
    )
    VALUES (
      ?,
      ?
    )
  `);

  const result = statement.run(
    title,
    JSON.stringify(routeData)
  );

  return Number(result.lastInsertRowid);
}

function getRoutes() {
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
    'development-user'
  );

  return rows.map((row) => {
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      data: JSON.parse(row.route_data)
    };
  });
}

function getRouteById(routeId) {
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
    'development-user'
  );

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    data: JSON.parse(row.route_data)
  };
}

function deleteRoute(routeId) {
  const statement = db.prepare(`
    DELETE FROM routes
    WHERE id = ?
      AND user_id = ?
  `);

  const result = statement.run(
    routeId,
    'development-user'
  );

  return result.changes > 0;
}

module.exports = {
  saveRoute,
  getRoutes,
  getRouteById,
  deleteRoute
};