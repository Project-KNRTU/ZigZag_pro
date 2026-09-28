const fs = require('node:fs');
const path = require('node:path');

const Database = require('better-sqlite3');


/*
  Если DB_PATH есть в .env:
  ./data/zigzag.db

  База будет храниться в папке проекта:
  ZigZag_pro/data/zigzag.db

  Если переменной нет, используем:
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
  Создаём папку data автоматически,
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


/*
  Сохранение маршрута.
*/
function saveRoute(routeData) {
  const title =
    routeData.title ||
    'Маршрут ZigZag';

  const statement = db.prepare(`
    INSERT INTO routes (
      title,
      route_data
    )
    VALUES (?, ?)
  `);

  const result = statement.run(
    title,
    JSON.stringify(routeData)
  );

  return Number(result.lastInsertRowid);
}


/*
  Список маршрутов тестового пользователя.
*/
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


/*
  Один маршрут по его ID.
*/
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


/*
  Удаление маршрута.
*/
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