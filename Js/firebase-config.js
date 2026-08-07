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
function getProductImageUrl(filename) {
  if (!filename) return "Images/product-placeholder.svg";
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_webp,q_auto/products/${filename}`;
}

function getPackImageUrl(filename) {
  if (!filename) return "Images/pack-placeholder.svg";
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_webp,q_auto/packs/${filename}`;
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

async function fetchProductsFromFirebase() {
  const data = await fetchBackendJson('/api/products');
  return { products: Array.isArray(data.products) ? data.products : [] };
}

async function fetchPacksFromFirebase() {
  const data = await fetchBackendJson('/api/packs');
  return { packs: Array.isArray(data.packs) ? data.packs : [] };
}

async function fetchAfiliadosFromFirebase() {
  const data = await fetchBackendJson('/api/afiliados');
  return { afiliados: Array.isArray(data.afiliados) ? data.afiliados : [] };
}

async function fetchNotificationBannerFromFirebase() {
  const data = await fetchBackendJson('/api/notification-banner');
  return data.banner || null;
}

async function fetchMensajesFromFirebase() {
  const data = await fetchBackendJson('/api/mensajes');
  return Array.isArray(data.mensajes) ? data.mensajes : [];
}

async function fetchEventoFromFirebase() {
  const data = await fetchBackendJson('/api/evento');
  return data.evento || null;
}

async function fetchInfoFromFirebase() {
  const data = await fetchBackendJson('/api/info');
  return Array.isArray(data.info) ? data.info : [];
}

async function fetchPayFromFirebase() {
  const data = await fetchBackendJson('/api/pay');
  return data.pay || null;
}

// -----------------------------
// 5. ESCUCHA EN TIEMPO REAL (SSE, solo panel administrativo)
// -----------------------------
// Requiere que el HTML que carga este script defina, ANTES de este
// <script>, la variable: window.IS_ADMIN_PANEL = true;
// Esto evita abrir conexiones SSE desde la tienda pública (storefront),
// donde cada visitante abriría una conexión persistente y dispararía
// el consumo de tráfico en el plan gratuito de Render.
function watchFirebasePath(path, callback) {
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

  const onUpsert = (ev) => {
    try {
      const parsed = JSON.parse(ev.data);
      const { key, value } = parsed;
      if (key !== undefined) {
        localMap[key] = value;
        callback(Object.values(localMap));
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
        callback(Object.values(localMap));
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

  return () => { try { es.close(); } catch (e) {} };
}