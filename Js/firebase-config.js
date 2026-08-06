/**
 * ============================================================
 *  CONFIGURACIÓN CENTRAL: Firebase Realtime Database + Cloudinary
 * ============================================================
 * Este archivo reemplaza los antiguos fetch() a los .json del
 * repo de GitHub (raw.githubusercontent.com) y a las carpetas
 * Images/products y Images/Packs.
 *
 * IMPORTANTE: debes cargar este script ANTES que afiliados.js,
 * notifications.js, message-notification-system.js, payment.js,
 * dynamic-system.js y script.js en tu index.html. También debes
 * cargar el SDK "compat" de Firebase antes que este archivo
 * (ver instrucciones que te di aparte para el <head> de index.html).
 * ------------------------------------------------------------
 */

// -----------------------------
// 1. CONFIGURACIÓN DE FIREBASE
// -----------------------------
// Reemplaza estos valores por los que te da la consola de Firebase en:
// Configuración del proyecto -> Tus apps -> App web -> "Config"
// Estos datos NO son secretos, es normal que sean públicos en el frontend.
const firebaseConfig = {
  apiKey: "AIzaSyCmjcF63Q_0Co1F-W56IT44j00MmPbrjp8",
  authDomain: "notify-buquenque.firebaseapp.com",
  databaseURL: "https://notify-buquenque-default-rtdb.firebaseio.com",
  projectId: "notify-buquenque",
  storageBucket: "notify-buquenque.firebasestorage.app",
  messagingSenderId: "1018432787080",
  appId: "1:1018432787080:web:e50767fb4843df565d053d"
};

// Evitar doble inicialización si el script se llegara a cargar dos veces
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const rtdb = firebase.database();

// -----------------------------
// 2. CONFIGURACIÓN DE CLOUDINARY
// -----------------------------
// Reemplaza por el "Cloud name" que aparece en tu Dashboard de Cloudinary.
const CLOUDINARY_CLOUD_NAME = "vgvdzqql";

// Construye la URL pública de una imagen de PRODUCTO alojada en Cloudinary.
// "filename" es el mismo valor que ya guardabas en el array "imagenes" del producto.
function getProductImageUrl(filename) {
  if (!filename) return "Images/product-placeholder.svg";
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto/products/${filename}`;
}

// Construye la URL pública de una imagen de PACK alojada en Cloudinary.
function getPackImageUrl(filename) {
  if (!filename) return "Images/pack-placeholder.svg";
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto/packs/${filename}`;
}

// -----------------------------
// 3. HELPERS GENÉRICOS DE LECTURA
// -----------------------------
async function rtdbGetValue(path) {
  const snap = await rtdb.ref(path).once("value");
  return snap.val();
}

async function rtdbGetObjectAsArray(path) {
  const val = await rtdbGetValue(path);
  return val ? Object.values(val) : [];
}

// -----------------------------
// 4. HELPERS ESPECÍFICOS (mismo "shape" que antes devolvía cada .json)
// -----------------------------

// Antes: fetch('.../products.json') -> { products: [...] }
async function fetchProductsFromFirebase() {
  const products = await rtdbGetObjectAsArray("products");
  return { products };
}

// Antes: fetch('Json/packs.json') -> { packs: [...] }
async function fetchPacksFromFirebase() {
  const packs = await rtdbGetObjectAsArray("packs");
  return { packs };
}

// Antes: fetch('Json/afiliados.json') -> { afiliados: [...] }
async function fetchAfiliadosFromFirebase() {
  const afiliados = await rtdbGetObjectAsArray("afiliados");
  return { afiliados };
}

// Antes: fetch('Json/data.json') -> objeto único del banner
async function fetchNotificationBannerFromFirebase() {
  return await rtdbGetValue("notificationBanner");
}

// Antes: fetch('Json/mensaje.json') -> array de mensajes
async function fetchMensajesFromFirebase() {
  return await rtdbGetObjectAsArray("mensajes");
}

// Antes: fetch('Json/evento.json') -> objeto único del evento
async function fetchEventoFromFirebase() {
  return await rtdbGetValue("evento");
}

// Antes: fetch('Json/info.json') -> array de info de productos
async function fetchInfoFromFirebase() {
  return await rtdbGetObjectAsArray("info");
}

// Antes: fetch('Json/pay.json') -> objeto único con países
async function fetchPayFromFirebase() {
  return await rtdbGetValue("pay");
}

// -----------------------------
// 5. ESCUCHA EN TIEMPO REAL (sin recargar la página)
// -----------------------------
// Se suscribe a un path de la base de datos y ejecuta "callback" cada vez que
// cambia algo ahí (agregar producto, editar precio, cambiar imagen, etc).
// Ignora el primer disparo porque ese ya lo cubre la carga inicial normal
// (loadProducts/loadPacks/etc que se llama una vez al abrir la página).
function watchFirebasePath(path, callback) {
  let isFirstSnapshot = true;
  rtdb.ref(path).on("value", () => {
    if (isFirstSnapshot) {
      isFirstSnapshot = false;
      return;
    }
    callback();
  });
}
