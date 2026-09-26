let MAPGL_KEY = '';
let DIRECTIONS_KEY = '';

let map = null;
let directions = null;
let markers = [];

let allPlaces = [];
let selectedPlaceIds = new Set();

let builtRoute = [];
let builtEvents = [];

const budgetLimits = {
  economy: 1000,
  medium: 3000,
  premium: Infinity
};

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeUrl(value) {
  try {
    const url = new URL(String(value));

    if (
      url.protocol === 'https:' ||
      url.protocol === 'http:'
    ) {
      return url.toString();
    }
  } catch (error) {
    return '';
  }

  return '';
}

async function requestApi(url, options = {}) {
  const response = await fetch(url, options);

  let data = null;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error(
      'Сервер вернул ответ в неизвестном формате.'
    );
  }

  if (!response.ok || !data.success) {
    throw new Error(
      data.details ||
      data.error ||
      'Ошибка API.'
    );
  }

  return data;
}

function showInfo(id, text, type = '') {
  const element = $(`#${id}`);

  if (!element) {
    return;
  }

  element.textContent = text;
  element.className = `info-message ${type}`;
}

function formatPrice(price) {
  const numericPrice = Number(price) || 0;

  if (numericPrice === 0) {
    return 'Бесплатно';
  }

  return `${numericPrice.toLocaleString('ru-RU')} ₽`;
}

function formatDateTime(dateValue) {
  if (!dateValue) {
    return 'Дата неизвестна';
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

function getTodayInKazan() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function getSettings() {
  const formData = new FormData(
    $('#routeForm')
  );

  return {
    company: formData.get('company'),
    visitDate: formData.get('visitDate'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    budget: formData.get('budget'),
    interests: formData.getAll('interest')
  };
}

function toMinutes(time) {
  const [hours, minutes] = String(time || '00:00')
    .split(':')
    .map(Number);

  return hours * 60 + minutes;
}

function getAvailableMinutes(startTime, endTime) {
  const start = toMinutes(startTime);
  let end = toMinutes(endTime);

  if (end <= start) {
    end += 24 * 60;
  }

  return end - start;
}

async function loadMapConfig() {
  const config = await requestApi('/api/config');

  MAPGL_KEY = config.mapglKey;
  DIRECTIONS_KEY = config.directionsKey;
}

function initializeMap() {
  if (map || !window.mapgl || !MAPGL_KEY) {
    return;
  }

  map = new mapgl.Map('map', {
    center: [49.1221, 55.7908],
    zoom: 12,
    key: MAPGL_KEY
  });

  if (window.mapgl.Directions && DIRECTIONS_KEY) {
    directions = new mapgl.Directions(map, {
      directionsApiKey: DIRECTIONS_KEY
    });
  }
}

function clearMapMarkers() {
  markers.forEach((marker) => {
    marker.destroy();
  });

  markers = [];
}

function renderPlaces() {
  $('#placesCount').textContent =
    `${allPlaces.length} мест`;

  if (allPlaces.length === 0) {
    $('#places').innerHTML = '';

    return;
  }

  $('#places').innerHTML = allPlaces
    .map((place) => {
      const isSelected = selectedPlaceIds.has(
        place.id
      );

      return `
        <article
          class="place-card ${isSelected ? 'is-selected' : ''}"
          data-id="${escapeHtml(place.id)}"
          role="button"
          tabindex="0"
          aria-pressed="${isSelected}"
        >
          <h3>${escapeHtml(place.name)}</h3>

          <p>
            ${escapeHtml(place.description)}
          </p>

          <div class="card-meta">
             ${Number(place.durationMin) || 60} мин
            ·
             ${formatPrice(place.cost)}
            ·
             ${escapeHtml(place.address)}
          </div>
        </article>
      `;
    })
    .join('');

  document
    .querySelectorAll('.place-card')
    .forEach((card) => {
      const togglePlace = async () => {
        const placeId = card.dataset.id;

        if (selectedPlaceIds.has(placeId)) {
          selectedPlaceIds.delete(placeId);
        } else {
          selectedPlaceIds.add(placeId);
        }

        renderPlaces();
        await buildRoute();
      };

      card.addEventListener('click', togglePlace);

      card.addEventListener('keydown', async (event) => {
        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          event.preventDefault();
          await togglePlace();
        }
      });
    });
}

function getCandidatePlaces() {
  const manuallySelectedPlaces = allPlaces.filter(
    (place) => selectedPlaceIds.has(place.id)
  );

  if (manuallySelectedPlaces.length > 0) {
    return manuallySelectedPlaces;
  }

  return [...allPlaces];
}

function buildRoutePlan(candidatePlaces, settings) {
  const availableMinutes = getAvailableMinutes(
    settings.startTime,
    settings.endTime
  );

  const route = [];
  let totalMinutes = 0;
  let totalCost = 0;

  for (const place of candidatePlaces) {
    const placeDuration =
      Number(place.durationMin) || 60;

    const placeCost =
      Number(place.cost) || 0;

    const transferTime =
      route.length > 0
        ? 15
        : 0;

    const newTotalMinutes =
      totalMinutes +
      placeDuration +
      transferTime;

    const newTotalCost =
      totalCost +
      placeCost;

    if (newTotalMinutes > availableMinutes) {
      continue;
    }

    if (newTotalCost > budgetLimits[settings.budget]) {
      continue;
    }

    route.push(place);

    totalMinutes = newTotalMinutes;
    totalCost = newTotalCost;
  }

  if (
    route.length === 0 &&
    candidatePlaces.length > 0
  ) {
    const firstPlace = candidatePlaces[0];

    route.push(firstPlace);

    totalMinutes =
      Number(firstPlace.durationMin) || 60;

    totalCost =
      Number(firstPlace.cost) || 0;
  }

  return {
    route,
    totalMinutes,
    totalCost,
    availableMinutes
  };
}

function renderRouteList() {
  $('#routeList').innerHTML = builtRoute
    .map((place, index) => {
      return `
        <article class="route-card">
          <span class="route-number">
            ${index + 1}
          </span>

          <div>
            <h3>${escapeHtml(place.name)}</h3>

            <div class="card-meta">
              ⏱ ${Number(place.durationMin) || 60} мин
              ·
               ${formatPrice(place.cost)}
              ·
               ${escapeHtml(place.address)}
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

async function drawRouteOnMap() {
  if (!map) {
    return;
  }

  clearMapMarkers();

  markers = builtRoute
    .filter((place) => {
      return (
        Array.isArray(place.coords) &&
        place.coords.length === 2
      );
    })
    .map((place, index) => {
      return new mapgl.Marker(map, {
        coordinates: place.coords,
        label: {
          text: String(index + 1)
        }
      });
    });

  directions?.clear();

  const routePoints = builtRoute
    .filter((place) => {
      return (
        Array.isArray(place.coords) &&
        place.coords.length === 2
      );
    })
    .map((place) => place.coords);

  if (routePoints.length < 2 || !directions) {
    return;
  }

  try {
    await directions.pedestrianRoute({
      points: routePoints
    });
  } catch (error) {
    console.warn(
      'Не удалось нарисовать пешеходную линию маршрута:',
      error
    );
  }
}

async function buildRoute() {
  const settings = getSettings();
  const candidatePlaces = getCandidatePlaces();

  const plan = buildRoutePlan(
    candidatePlaces,
    settings
  );

  builtRoute = plan.route;

  if (builtRoute.length === 0) {
    showInfo(
      'routeInfo',
      'Не удалось подобрать места для маршрута.',
      'is-error'
    );

    $('#routeList').innerHTML = '';
    $('#saveRouteButton').hidden = true;

    clearMapMarkers();
    directions?.clear();

    return;
  }

  showInfo(
    'routeInfo',
    `Маршрут: ${builtRoute.length} точек · ` +
    `${plan.totalMinutes} мин. из ${plan.availableMinutes} мин. · ` +
    `${formatPrice(plan.totalCost)} на человека`,
    'is-success'
  );

  renderRouteList();

  $('#saveRouteButton').hidden = false;

  await drawRouteOnMap();
}

function renderEvents(events) {
  $('#eventsCount').textContent =
    `${events.length} событий`;

  if (events.length === 0) {
    $('#eventsList').innerHTML = '';

    return;
  }

  $('#eventsList').innerHTML = events
    .map((event) => {
      const sourceUrl = safeUrl(event.sourceUrl);

      const eventLink = sourceUrl
        ? `
          <a
            class="event-link"
            href="${escapeHtml(sourceUrl)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть на KudaGo →
          </a>
        `
        : '';

      const priceText =
        event.priceText ||
        formatPrice(event.cost);

      return `
        <article class="event-card">
          <h3>${escapeHtml(event.name)}</h3>

          <p>
            ${escapeHtml(event.description)}
          </p>

          <div class="card-meta">
             ${escapeHtml(event.date || 'Дата уточняется')}
            ·
             ${escapeHtml(event.startTime || 'Время уточняется')}
            ·
             ${escapeHtml(priceText)}
            ·
             ${escapeHtml(event.ageRestriction || 'Возраст не указан')}
            ·
             ${escapeHtml(event.location || 'Площадка уточняется')}
          </div>

          <p class="event-address">
            ${escapeHtml(event.address || 'Адрес уточняется')}
          </p>

          ${eventLink}
        </article>
      `;
    })
    .join('');
}

function filterEventsForUser(events, settings) {
  return events.filter((event) => {
    const eventCost = Number(event.cost) || 0;

    if (
      eventCost > budgetLimits[settings.budget]
    ) {
      return false;
    }

    if (
      settings.company === 'family' &&
      !event.familyFriendly
    ) {
      return false;
    }

    return true;
  });
}

async function loadEvents(settings) {
  $('#eventsCount').textContent = '0 событий';
  $('#eventsList').innerHTML = '';

  showInfo(
    'eventsInfo',
    `Загружаем реальную афишу Казани на ${settings.visitDate}…`
  );

  try {
    const eventsResponse = await requestApi(
      `/api/events?date=${encodeURIComponent(
        settings.visitDate
      )}`
    );

    builtEvents = filterEventsForUser(
      eventsResponse.events || [],
      settings
    );

    renderEvents(builtEvents);

    if (builtEvents.length === 0) {
      showInfo(
        'eventsInfo',
        `На ${settings.visitDate} не найдено подходящих событий ` +
        `в Казани по выбранным фильтрам. ` +
        `Попробуйте изменить дату, бюджет или формат прогулки.`,
        'is-error'
      );

      return;
    }

    showInfo(
      'eventsInfo',
      `Показаны реальные события Казани на ${settings.visitDate}. ` +
      `Источник: KudaGo. Данные получены: ` +
      `${formatDateTime(eventsResponse.updatedAt)}.`,
      'is-success'
    );
  } catch (error) {
    builtEvents = [];
    renderEvents([]);

    showInfo(
      'eventsInfo',
      `Не удалось загрузить афишу: ${error.message}`,
      'is-error'
    );
  }
}

async function loadPlaces(event) {
  event.preventDefault();

  const settings = getSettings();

  if (!settings.visitDate) {
    showInfo(
      'placesInfo',
      'Выберите дату прогулки.',
      'is-error'
    );

    return;
  }

  if (
    !settings.startTime ||
    !settings.endTime
  ) {
    showInfo(
      'placesInfo',
      'Укажите время начала и окончания прогулки.',
      'is-error'
    );

    return;
  }

  try {
    showInfo(
      'placesInfo',
      'Ищем реальные места в 2ГИС…'
    );

    $('#findPlacesButton').disabled = true;
    $('#findPlacesButton').textContent =
      'Ищем места…';

    const response = await requestApi(
      `/api/places?categories=${encodeURIComponent(
        settings.interests.join(',')
      )}`
    );

    allPlaces = response.places || [];
    selectedPlaceIds.clear();

    renderPlaces();

    if (allPlaces.length === 0) {
      showInfo(
        'placesInfo',
        '2ГИС не нашёл мест по выбранным категориям.',
        'is-error'
      );

      builtRoute = [];
      $('#routeList').innerHTML = '';
      $('#saveRouteButton').hidden = true;

      clearMapMarkers();
      directions?.clear();
    } else {
      showInfo(
        'placesInfo',
        `2ГИС нашёл ${allPlaces.length} мест. ` +
        'Нажмите на карточку, чтобы выбрать точку вручную.',
        'is-success'
      );

      await buildRoute();
    }

    await loadEvents(settings);
  } catch (error) {
    allPlaces = [];
    builtRoute = [];

    renderPlaces();

    $('#routeList').innerHTML = '';
    $('#saveRouteButton').hidden = true;

    clearMapMarkers();
    directions?.clear();

    showInfo(
      'placesInfo',
      `Не удалось получить места: ${error.message}`,
      'is-error'
    );
  } finally {
    $('#findPlacesButton').disabled = false;
    $('#findPlacesButton').textContent =
      'Найти места и построить маршрут';
  }
}

async function saveRoute() {
  if (builtRoute.length === 0) {
    showInfo(
      'routeInfo',
      'Сначала постройте маршрут.',
      'is-error'
    );

    return;
  }

  const settings = getSettings();

  try {
    $('#saveRouteButton').disabled = true;
    $('#saveRouteButton').textContent =
      'Сохраняем…';

    const response = await requestApi('/api/routes', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        title: `Маршрут по Казани на ${settings.visitDate}`,
        visitDate: settings.visitDate,
        startTime: settings.startTime,
        endTime: settings.endTime,
        company: settings.company,
        budget: settings.budget,
        interests: settings.interests,
        route: builtRoute,
        events: builtEvents
      })
    });

    showInfo(
      'routeInfo',
      `Маршрут сохранён. Номер маршрута: ${response.id}.`,
      'is-success'
    );
  } catch (error) {
    showInfo(
      'routeInfo',
      `Ошибка сохранения: ${error.message}`,
      'is-error'
    );
  } finally {
    $('#saveRouteButton').disabled = false;
    $('#saveRouteButton').textContent =
      'Сохранить маршрут';
  }
}

function renderSavedRoutes(routes) {
  const container = $('#savedRoutes');

  if (!routes.length) {
    container.innerHTML = `
      <div class="info-message">
        Сохранённых маршрутов пока нет.
      </div>
    `;

    return;
  }

  container.innerHTML = routes
    .map((savedRoute) => {
      const routeData = savedRoute.data || {};
      const routePlaces = Array.isArray(routeData.route)
        ? routeData.route
        : [];

      const routeEvents = Array.isArray(routeData.events)
        ? routeData.events
        : [];

      return `
        <article class="saved-route-card">
          <h3>${escapeHtml(savedRoute.title)}</h3>

          <div class="card-meta">
             ${escapeHtml(routeData.visitDate || 'Дата не указана')}
            ·
             ${routePlaces.length} точек
            ·
             ${routeEvents.length} событий
            ·
             ${escapeHtml(formatDateTime(savedRoute.createdAt))}
          </div>

          <div class="route-actions">
            <button
              class="secondary-button open-saved-route-button"
              type="button"
              data-route-id="${savedRoute.id}"
            >
              Открыть маршрут
            </button>

            <button
              class="secondary-button delete-saved-route-button"
              type="button"
              data-route-id="${savedRoute.id}"
            >
              Удалить
            </button>
          </div>
        </article>
      `;
    })
    .join('');

  document
    .querySelectorAll('.open-saved-route-button')
    .forEach((button) => {
      button.addEventListener('click', async () => {
        await openSavedRoute(
          Number(button.dataset.routeId)
        );
      });
    });

  document
    .querySelectorAll('.delete-saved-route-button')
    .forEach((button) => {
      button.addEventListener('click', async () => {
        await deleteSavedRoute(
          Number(button.dataset.routeId)
        );
      });
    });
}

async function showSavedRoutes() {
  const container = $('#savedRoutes');

  container.innerHTML = `
    <div class="info-message">
      Загружаем сохранённые маршруты…
    </div>
  `;

  try {
    const response = await requestApi('/api/routes');

    renderSavedRoutes(response.routes || []);
  } catch (error) {
    container.innerHTML = `
      <div class="info-message is-error">
        Не удалось загрузить маршруты: ${escapeHtml(error.message)}
      </div>
    `;
  }
}

async function openSavedRoute(routeId) {
  if (!Number.isInteger(routeId) || routeId <= 0) {
    return;
  }

  try {
    const response = await requestApi(
      `/api/routes/${routeId}`
    );

    const routeData = response.route.data || {};

    if (routeData.visitDate) {
      $('#visitDate').value = routeData.visitDate;
    }

    if (routeData.startTime) {
      $('#startTime').value = routeData.startTime;
    }

    if (routeData.endTime) {
      $('#endTime').value = routeData.endTime;
    }

    if (routeData.company) {
      $('#company').value = routeData.company;
    }

    if (routeData.budget) {
      $('#budget').value = routeData.budget;
    }

    allPlaces = Array.isArray(routeData.route)
      ? routeData.route
      : [];

    builtRoute = [...allPlaces];

    builtEvents = Array.isArray(routeData.events)
      ? routeData.events
      : [];

    selectedPlaceIds = new Set(
      allPlaces.map((place) => place.id)
    );

    renderPlaces();
    renderRouteList();
    renderEvents(builtEvents);

    $('#placesCount').textContent =
      `${allPlaces.length} мест`;

    $('#eventsCount').textContent =
      `${builtEvents.length} событий`;

    $('#saveRouteButton').hidden =
      builtRoute.length === 0;

    showInfo(
      'routeInfo',
      `Открыт сохранённый маршрут «${response.route.title}».`,
      'is-success'
    );

    showInfo(
      'eventsInfo',
      builtEvents.length > 0
        ? 'Показаны события, сохранённые вместе с маршрутом.'
        : 'В сохранённом маршруте нет событий.',
      builtEvents.length > 0
        ? 'is-success'
        : ''
    );

    await drawRouteOnMap();

    window.scrollTo({
      top: $('#map').getBoundingClientRect().top +
        window.scrollY -
        20,
      behavior: 'smooth'
    });
  } catch (error) {
    showInfo(
      'routeInfo',
      `Не удалось открыть маршрут: ${error.message}`,
      'is-error'
    );
  }
}

async function deleteSavedRoute(routeId) {
  if (!Number.isInteger(routeId) || routeId <= 0) {
    return;
  }

  const isConfirmed = window.confirm(
    'Удалить сохранённый маршрут?'
  );

  if (!isConfirmed) {
    return;
  }

  try {
    await requestApi(`/api/routes/${routeId}`, {
      method: 'DELETE'
    });

    await showSavedRoutes();

    showInfo(
      'routeInfo',
      'Сохранённый маршрут удалён.',
      'is-success'
    );
  } catch (error) {
    showInfo(
      'routeInfo',
      `Не удалось удалить маршрут: ${error.message}`,
      'is-error'
    );
  }
}

document.addEventListener(
  'DOMContentLoaded',
  async () => {
    $('#visitDate').value = getTodayInKazan();

    $('#routeForm').addEventListener(
      'submit',
      loadPlaces
    );

    $('#saveRouteButton').addEventListener(
      'click',
      saveRoute
    );

    $('#showSavedRoutesButton').addEventListener(
      'click',
      showSavedRoutes
    );

    try {
      await loadMapConfig();
      initializeMap();

      $('#serverStatus').textContent =
        'Сервер работает';

      $('#serverStatus').classList.add(
        'is-online'
      );
    } catch (error) {
      $('#serverStatus').textContent =
        'Ошибка подключения';

      $('#serverStatus').classList.add(
        'is-offline'
      );

      showInfo(
        'routeInfo',
        `Не удалось загрузить карту: ${error.message}`,
        'is-error'
      );
    }
  }
);