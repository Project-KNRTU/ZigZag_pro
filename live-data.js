console.log(
  '2ГИС + KudaGo'
);

const key = process.env.DGIS_SEARCH_KEY;

const cache = new Map();

const KAZAN_CENTER = {
  lon: 49.1221,
  lat: 55.7908
};

const categories = {
  cafes: {
    query: 'кафе',
    durationMin: 60,
    cost: 700,
    label: 'Кафе',
    objectType: 'branch'
  },

  museums: {
    query: 'музей',
    durationMin: 90,
    cost: 500,
    label: 'Музей',
    objectType: 'branch'
  },

  parks: {
    query: 'парк',
    durationMin: 60,
    cost: 0,
    label: 'Парк',
    objectType: null
  },

  malls: {
    query: 'торговый центр',
    durationMin: 90,
    cost: 0,
    label: 'Торговый центр',
    objectType: 'branch'
  },

  sights: {
    query: 'достопримечательность',
    durationMin: 60,
    cost: 0,
    label: 'Достопримечательность',
    objectType: null
  }
};

function getCache(cacheKey) {
  const cachedItem = cache.get(cacheKey);

  if (!cachedItem) {
    return null;
  }

  const cacheLifetime = 10 * 60 * 1000;

  if (
    Date.now() - cachedItem.createdAt >
    cacheLifetime
  ) {
    cache.delete(cacheKey);

    return null;
  }

  return cachedItem.data;
}

function saveCache(cacheKey, data) {
  cache.set(cacheKey, {
    createdAt: Date.now(),
    data
  });

  return data;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCoordinates(item) {
  const point = item.point || {};

  const longitude = Number(
    point.lon ?? item.lon
  );

  const latitude = Number(
    point.lat ?? item.lat
  );

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude)
  ) {
    return null;
  }

  return [
    longitude,
    latitude
  ];
}

function getAddress(item) {
  return normalizeText(
    item.address_name ||
    item.full_address_name ||
    item.address?.name ||
    item.address ||
    ''
  );
}

function getRubrics(item) {
  if (!Array.isArray(item.rubrics)) {
    return '';
  }

  return item.rubrics
    .map((rubric) => {
      return normalizeText(rubric?.name);
    })
    .filter(Boolean)
    .join(', ');
}

function getPlaceDescription(item, category) {
  const rubrics = getRubrics(item);
  const address = getAddress(item);

  const categoryName = rubrics || category.label;

  if (address) {
    return `${categoryName}. ${address}`;
  }

  return categoryName;
}

async function getPlacesByCategory(categoryName) {
  const category = categories[categoryName];

  if (!category) {
    throw new Error(
      `Неизвестная категория: ${categoryName}`
    );
  }

  if (!key) {
    throw new Error(
      'В .env отсутствует DGIS_SEARCH_KEY.'
    );
  }

  const cacheKey = `places:${categoryName}`;
  const cachedPlaces = getCache(cacheKey);

  if (cachedPlaces) {
    console.log(
      ` 2ГИС: кэш для категории ${categoryName}`
    );

    return cachedPlaces;
  }

  const requestUrl = new URL(
    'https://catalog.api.2gis.com/3.0/items'
  );

  requestUrl.searchParams.set(
    'key',
    key
  );

  requestUrl.searchParams.set(
    'q',
    `${category.query} Казань`
  );

  requestUrl.searchParams.set(
    'location',
    `${KAZAN_CENTER.lon},${KAZAN_CENTER.lat}`
  );

  requestUrl.searchParams.set(
    'radius',
    '25000'
  );

  requestUrl.searchParams.set(
    'page_size',
    '10'
  );

  requestUrl.searchParams.set(
    'locale',
    'ru_RU'
  );

  requestUrl.searchParams.set(
    'fields',
    [
      'items.point',
      'items.rubrics'
    ].join(',')
  );

  if (category.objectType) {
    requestUrl.searchParams.set(
      'type',
      category.objectType
    );
  }

  console.log('');
  console.log(
    ` 2ГИС: ищем ${categoryName}`
  );
  console.log(
    `   Запрос: ${category.query} Казань`
  );

  const response = await fetch(requestUrl);

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `2ГИС API вернул HTTP ${response.status}: ` +
      errorText.slice(0, 300)
    );
  }

  const responseData = await response.json();

  if (
    responseData.meta?.code &&
    Number(responseData.meta.code) !== 200
  ) {
    throw new Error(
      responseData.meta.error?.message ||
      '2ГИС не смог найти места.'
    );
  }

  const items = responseData.result?.items || [];

  console.log(
    ` 2ГИС: получено объектов: ${items.length}`
  );

  console.log(
    ' Первые объекты 2ГИС:',
    items.slice(0, 3).map((item) => {
      return {
        id: item.id,
        name: item.name,
        address: item.address_name,
        point: item.point
      };
    })
  );

  const places = items
    .map((item) => {
      const name = normalizeText(
        item.name ||
        item.full_name ||
        item.title
      );

      const address = getAddress(item);

      const coords = getCoordinates(item);

      if (!name || !coords) {
        console.warn(
          ' 2ГИС: объект пропущен',
          {
            id: item.id,
            name: item.name,
            address,
            coords
          }
        );

        return null;
      }

      console.log(
        `   ✓ ${name} — ${address}`
      );

      return {
        id: `2gis-${item.id}`,

        name,

        type: categoryName,

        coords,

        address: (
          address ||
          'Адрес не указан в 2ГИС'
        ),

        description: getPlaceDescription(
          item,
          category
        ),

        durationMin: category.durationMin,

        cost: category.cost,

        source: '2GIS',

        sourceId: item.id,

        sourceUrl:
          `https://2gis.ru/kazan/geo/${item.id}`,

        isRealData: true
      };
    })
    .filter(Boolean);

  console.log(
    ` 2ГИС: после обработки ${places.length} реальных мест`
  );

  return saveCache(cacheKey, places);
}

async function getPlaces(selectedCategories = []) {
  let categoriesToLoad = selectedCategories;

  if (
    !Array.isArray(categoriesToLoad) ||
    categoriesToLoad.length === 0
  ) {
    categoriesToLoad = Object.keys(categories);
  }

  categoriesToLoad = categoriesToLoad.filter(
    (categoryName) => {
      return Boolean(categories[categoryName]);
    }
  );

  console.log('');
  console.log(
    ' Загружаем категории:',
    categoriesToLoad
  );

  const results = await Promise.all(
    categoriesToLoad.map((categoryName) => {
      return getPlacesByCategory(categoryName);
    })
  );

  const uniquePlaces = new Map();

  results
    .flat()
    .forEach((place) => {
      if (!uniquePlaces.has(place.id)) {
        uniquePlaces.set(place.id, place);
      }
    });

  const finalPlaces = [
    ...uniquePlaces.values()
  ];

  console.log(
    ` Всего реальных мест: ${finalPlaces.length}`
  );

  return finalPlaces;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value || '')
  );
}

function getKazanDayBounds(visitDate) {
  if (!isValidDate(visitDate)) {
    throw new Error(
      'Дата должна быть в формате YYYY-MM-DD.'
    );
  }

  const startDate = new Date(
    `${visitDate}T00:00:00+03:00`
  );

  const endDate = new Date(
    `${visitDate}T23:59:59+03:00`
  );

  return {
    startTimestamp: Math.floor(
      startDate.getTime() / 1000
    ),

    endTimestamp: Math.floor(
      endDate.getTime() / 1000
    )
  };
}

function getPrice(priceText, isFree) {
  if (isFree) {
    return 0;
  }

  const match = String(priceText || '').match(
    /\d[\d ]*/
  );

  if (!match) {
    return 0;
  }

  return Number(
    match[0].replaceAll(' ', '')
  );
}

function formatEventDate(timestamp) {
  const numericTimestamp = Number(timestamp);

  if (
    !Number.isFinite(numericTimestamp) ||
    numericTimestamp <= 0
  ) {
    return null;
  }

  const date = new Date(
    numericTimestamp * 1000
  );

  return [
    date.getUTCFullYear(),
    String(
      date.getUTCMonth() + 1
    ).padStart(2, '0'),
    String(
      date.getUTCDate()
    ).padStart(2, '0')
  ].join('-');
}

function formatEventTime(timestamp) {
  const numericTimestamp = Number(timestamp);

  if (
    !Number.isFinite(numericTimestamp) ||
    numericTimestamp <= 0
  ) {
    return 'Время уточняется';
  }

  const date = new Date(
    numericTimestamp * 1000
  );

  return [
    String(
      date.getUTCHours()
    ).padStart(2, '0'),
    String(
      date.getUTCMinutes()
    ).padStart(2, '0')
  ].join(':');
}

function eventMatchesVisitDate(event, visitDate) {
  return (event.dates || []).some((date) => {
    const startDate = formatEventDate(
      date.start
    );

    const endDate = (
      formatEventDate(date.end) ||
      startDate
    );

    if (!startDate) {
      return false;
    }

    return (
      visitDate >= startDate &&
      visitDate <= endDate
    );
  });
}

function getMatchingEventDate(event, visitDate) {
  return (event.dates || []).find((date) => {
    const startDate = formatEventDate(
      date.start
    );

    const endDate = (
      formatEventDate(date.end) ||
      startDate
    );

    return (
      startDate &&
      visitDate >= startDate &&
      visitDate <= endDate
    );
  }) || null;
}

function getEventCoords(event) {
  const longitude = Number(
    event.place?.coords?.lon
  );

  const latitude = Number(
    event.place?.coords?.lat
  );

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude)
  ) {
    return null;
  }

  return [
    longitude,
    latitude
  ];
}

async function getEvents(visitDate) {
  if (!isValidDate(visitDate)) {
    throw new Error(
      'Выберите корректную дату прогулки.'
    );
  }

  const cacheKey = `events:${visitDate}`;

  const cachedEvents = getCache(cacheKey);

  if (cachedEvents) {
    console.log(
      ` KudaGo: кэш афиши на ${visitDate}`
    );

    return cachedEvents;
  }

  const {
    startTimestamp,
    endTimestamp
  } = getKazanDayBounds(visitDate);

  const requestUrl = new URL(
    'https://kudago.com/public-api/v1.4/events/'
  );

  requestUrl.searchParams.set(
    'location',
    'kzn'
  );

  requestUrl.searchParams.set(
    'page_size',
    '10'
  );

  requestUrl.searchParams.set(
    'expand',
    'place,dates'
  );

  requestUrl.searchParams.set(
    'text_format',
    'text'
  );

  requestUrl.searchParams.set(
    'actual_since',
    String(startTimestamp)
  );

  requestUrl.searchParams.set(
    'actual_until',
    String(endTimestamp)
  );

  requestUrl.searchParams.set(
    'fields',
    [
      'id',
      'title',
      'description',
      'short_title',
      'dates',
      'place',
      'categories',
      'age_restriction',
      'price',
      'is_free',
      'site_url',
      'tags'
    ].join(',')
  );

  console.log('');
  console.log(
    ` KudaGo: загружаем афишу Казани на ${visitDate}`
  );

  const response = await fetch(requestUrl);

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `KudaGo API вернул ${response.status}: ` +
      errorText.slice(0, 300)
    );
  }

  const responseData = await response.json();

  const apiEvents = responseData.results || [];

  console.log(
    ` KudaGo: получено событий: ${apiEvents.length}`
  );

  const events = apiEvents
    .filter((event) => {
      return eventMatchesVisitDate(
        event,
        visitDate
      );
    })
    .map((event) => {
      const eventDate = getMatchingEventDate(
        event,
        visitDate
      );

      const name = normalizeText(
        event.title ||
        event.short_title
      );

      if (!name) {
        return null;
      }

      const fullText = [
        event.title,
        event.description,
        event.age_restriction,
        ...(event.tags || [])
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return {
        id: `kudago-${event.id}`,

        name,

        type:
          event.categories?.[0] ||
          'event',

        date: visitDate,

        startTime: formatEventTime(
          eventDate?.start
        ),

        endTime: formatEventTime(
          eventDate?.end
        ),

        cost: getPrice(
          event.price,
          event.is_free
        ),

        priceText:
          normalizeText(event.price) ||
          (
            event.is_free
              ? 'Бесплатно'
              : 'Стоимость уточняется'
          ),

        location:
          normalizeText(event.place?.title) ||
          'Площадка не указана',

        address:
          normalizeText(event.place?.address) ||
          'Адрес не указан',

        coords: getEventCoords(event),

        description:
          normalizeText(event.description) ||
          'Описание события не указано KudaGo.',

        ageRestriction:
          normalizeText(event.age_restriction) ||
          'Возраст не указан',

        familyFriendly: (
          fullText.includes('дет') ||
          fullText.includes('семейн') ||
          fullText.includes('0+') ||
          fullText.includes('6+')
        ),

        isFree: Boolean(event.is_free),

        source: 'KudaGo',

        sourceUrl: event.site_url || null,

        isRealData: true,

        updatedAt: new Date().toISOString()
      };
    })
    .filter(Boolean);

  console.log(
    ` KudaGo: событий на ${visitDate}: ${events.length}`
  );

  return saveCache(cacheKey, events);
}

module.exports = {
  getPlaces,
  getEvents
};