/**
 * ============================================================
 *  CONFIGURACIÓN CENTRAL: Backend proxy + Cloudinary
 * ============================================================
 *
 * El frontend ya no accede directamente a Firebase. En su lugar,
 * consulta al backend a través de /api/* y el backend hace de proxy.
 * ------------------------------------------------------------
 */

const CLOUDINARY_CLOUD_NAME = "vgvdzqql";
const DEFAULT_BACKEND_HOST = "https://backend-mkzu.onrender.com";

function getBackendHost() {
  if (typeof BACKEND === 'string' && BACKEND.trim()) {
    return BACKEND.replace(/\/$/, '');
  }

  return DEFAULT_BACKEND_HOST;
}

const API_BASE = getBackendHost();

// -----------------------------
// 2. CONFIGURACIÓN DE CLOUDINARY
// -----------------------------
// Reemplaza por el "Cloud name" que aparece en tu Dashboard de Cloudinary.
// "filename" es el mismo valor que ya guardabas en el array "imagenes" del producto.
function getProductImageUrl(filename) {
  if (!filename) return "Images/product-placeholder.svg";
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_webp,q_auto/${encodeURIComponent(filename)}`;
}

// Construye la URL pública de una imagen de PACK alojada en Cloudinary.
function getPackImageUrl(filename) {
  if (!filename) return "Images/pack-placeholder.svg";
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_webp,q_auto/${encodeURIComponent(filename)}`;
}

// -----------------------------
// 3. HELPERS GENERALES MEDIANTE BACKEND PROXY
// -----------------------------
async function fetchBackendJson(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error en backend ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (data && data.success === false) {
    throw new Error(data.message || `Error en backend: ${endpoint}`);
  }

  return data;
}

// -----------------------------
// 4. HELPERS ESPECÍFICOS (mismo "shape" que antes devolvía cada .json)
// -----------------------------

// Antes: fetch('.../products.json') -> { products: [...] }
async function fetchProductsFromFirebase() {
  const data = await fetchBackendJson('/api/products');
  return { products: Array.isArray(data.products) ? data.products : [] };
}

// Antes: fetch('Json/packs.json') -> { packs: [...] }
async function fetchPacksFromFirebase() {
  const data = await fetchBackendJson('/api/packs');
  return { packs: Array.isArray(data.packs) ? data.packs : [] };
}

// Antes: fetch('Json/afiliados.json') -> { afiliados: [...] }
async function fetchAfiliadosFromFirebase() {
  const data = await fetchBackendJson('/api/afiliados');
  return { afiliados: Array.isArray(data.afiliados) ? data.afiliados : [] };
}

// Antes: fetch('Json/data.json') -> objeto único del banner
async function fetchNotificationBannerFromFirebase() {
  const data = await fetchBackendJson('/api/notification-banner');
  return data.banner || null;
}

// Antes: fetch('Json/mensaje.json') -> array de mensajes
async function fetchMensajesFromFirebase() {
  const data = await fetchBackendJson('/api/mensajes');
  return Array.isArray(data.mensajes) ? data.mensajes : [];
}

// Antes: fetch('Json/evento.json') -> objeto único del evento
async function fetchEventoFromFirebase() {
  const data = await fetchBackendJson('/api/evento');
  return data.evento || null;
}

// Antes: fetch('Json/info.json') -> array de info de productos
async function fetchInfoFromFirebase() {
  const data = await fetchBackendJson('/api/info');
  return Array.isArray(data.info) ? data.info : [];
}

// Antes: fetch('Json/pay.json') -> objeto único con países
async function fetchPayFromFirebase() {
  const data = await fetchBackendJson('/api/pay');
  return data.pay || null;
}

// -----------------------------
// 5. ESCUCHA EN TIEMPO REAL (sin recargar la página)
// -----------------------------
// No es posible suscribirse directamente a Firebase desde el navegador
// cuando el frontend usa el backend como proxy. La actualización en vivo
// debe implementarse con un mecanismo server-sent events o polling.
function watchFirebasePath(path, callback) {
  // Evitar abrir SSE desde el storefront público. Solo habilitar si
  // window.IS_ADMIN_PANEL === true (panel de gestión interno).
  if (!window.IS_ADMIN_PANEL) {
    console.warn('watchFirebasePath: SSE deshabilitado en este contexto (no es panel administrativo).');
    return () => { /* noop cleanup */ };
  }

  const pathConfig = {
    'products': { key: 'products', mode: 'delta' },
    'packs': { key: 'packs', mode: 'delta' },
    'notificationBanner': { key: 'notification-banner', mode: 'full' },
    'afiliados': { key: 'afiliados', mode: 'full' },
    'mensajes': { key: 'mensajes', mode: 'full' },
    'evento': { key: 'evento', mode: 'full' },
    'info': { key: 'info', mode: 'full' },
    'pay': { key: 'pay', mode: 'full' }
  };

  const config = pathConfig[path];
  if (!config) {
    console.warn('watchFirebasePath: path no soportado para SSE:', path);
    return () => { /* noop */ };
  }

  const url = `${API_BASE}/api/stream/${config.key}`;
  const es = new EventSource(url);

  if (config.mode === 'full') {
    const onFull = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        callback(parsed.value);
      } catch (e) {
        console.warn('watchFirebasePath full parse error', e);
      }
    };
    es.addEventListener('full', onFull);

    es.onerror = (err) => {
      console.warn('watchFirebasePath SSE error (full):', err);
    };

    return () => { try { es.close(); } catch (e) {} };
  }

  // delta mode
  let localMap = {};

  // Al conectar, Firebase dispara "child_added" por CADA elemento que ya
  // existe en el nodo (no solo los nuevos). Sin debounce, esto dispara el
  // callback (y por lo tanto un render del panel) una vez por cada producto
  // ya existente, casi simultáneamente => la UI "brinca"/parpadea al cargar.
  // Agrupamos esas ráfagas y solo llamamos al callback una vez que se
  // asienta el flujo de eventos.
  let debounceTimer = null;
  const scheduleCallback = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      callback(Object.values(localMap));
    }, 150);
  };

  const onUpsert = (ev) => {
    try {
      const parsed = JSON.parse(ev.data);
      const { key, value } = parsed;
      if (key !== undefined) {
        localMap[key] = value;
        scheduleCallback();
      }
    } catch (e) {
      console.warn('watchFirebasePath child_upsert parse error', e);
    }
  };

  const onRemoved = (ev) => {
    try {
      const parsed = JSON.parse(ev.data);
      const { key } = parsed;
      if (key !== undefined) {
        delete localMap[key];
        scheduleCallback();
      }
    } catch (e) {
      console.warn('watchFirebasePath child_removed parse error', e);
    }
  };

  es.addEventListener('child_upsert', onUpsert);
  es.addEventListener('child_removed', onRemoved);

  es.onerror = (err) => {
    console.warn('watchFirebasePath SSE error (delta):', err);
  };

  return () => {
    clearTimeout(debounceTimer);
    try { es.close(); } catch (e) {}
  };
}