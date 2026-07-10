// Netlify Function: sync-reviews
// Trae reseñas de plataformas externas, las normaliza a la forma de reviews.json
// y reporta el estado de conexión de cada plataforma.
//
// Cada plataforma se "conecta" añadiendo sus variables de entorno en Netlify
// (Site settings → Environment variables). NUNCA se guardan en el código/repo.
//
//   Google Business Profile:
//     GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_LOCATION_ID
//   Trustpilot (plan de pago con API):
//     TRUSTPILOT_API_KEY, TRUSTPILOT_BUSINESS_UNIT_ID
//   SmartCustomer (ex-Sitejabber):
//     SMARTCUSTOMER_API_KEY, SMARTCUSTOMER_BUSINESS_ID
//
// Uso desde el panel:
//   GET /.netlify/functions/sync-reviews?status=1  → { connected: {...} }
//   GET /.netlify/functions/sync-reviews           → { connected, count, reviews:[...], errors:[] }
//
// NOTA: los endpoints/campos de cada API deben confirmarse contra la documentación
// vigente de cada plataforma antes de producción. Este archivo deja el cableado listo.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function connectedMap(env) {
  return {
    google:        !!(env.GOOGLE_REFRESH_TOKEN && env.GOOGLE_LOCATION_ID && env.GOOGLE_CLIENT_ID),
    trustpilot:    !!(env.TRUSTPILOT_API_KEY && env.TRUSTPILOT_BUSINESS_UNIT_ID),
    smartcustomer: !!(env.SMARTCUSTOMER_API_KEY && env.SMARTCUSTOMER_BUSINESS_ID),
  };
}

// Forma normalizada que consume el panel
function norm(source, r) {
  return {
    source,
    id: r.id != null ? String(r.id) : undefined,
    author: r.author || 'Anónimo',
    rating: Number(r.rating) || 0,
    text: r.text || '',
    date: r.date || '',
    title: r.title || '',
  };
}

// ── Google Business Profile ──────────────────────────
async function googleAccessToken(env) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Google OAuth: ' + JSON.stringify(data));
  return data.access_token;
}

async function fetchGoogle(env) {
  const token = await googleAccessToken(env);
  // location: "accounts/{accountId}/locations/{locationId}" o el id que Google te asigne
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${env.GOOGLE_LOCATION_ID}/reviews`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Google ' + res.status + ': ' + (await res.text()));
  const data = await res.json();
  const STARS = { STAR_ONE: 1, STAR_TWO: 2, STAR_THREE: 3, STAR_FOUR: 4, STAR_FIVE: 5 };
  return (data.reviews || []).map(rv => norm('google', {
    id: rv.reviewId,
    author: rv.reviewer && rv.reviewer.displayName,
    rating: STARS[rv.starRating] || 0,
    text: rv.comment,
    date: rv.createTime,
  }));
}

// ── Trustpilot (Service Reviews API) ─────────────────
async function fetchTrustpilot(env) {
  const url = `https://api.trustpilot.com/v1/business-units/${env.TRUSTPILOT_BUSINESS_UNIT_ID}/reviews`;
  const res = await fetch(url, { headers: { apikey: env.TRUSTPILOT_API_KEY } });
  if (!res.ok) throw new Error('Trustpilot ' + res.status + ': ' + (await res.text()));
  const data = await res.json();
  return (data.reviews || []).map(rv => norm('trustpilot', {
    id: rv.id,
    author: rv.consumer && rv.consumer.displayName,
    rating: rv.stars,
    text: rv.text,
    title: rv.title,
    date: rv.createdAt,
  }));
}

// ── SmartCustomer (ex-Sitejabber) ────────────────────
// Confirmar endpoint/campos en https://apidocs.smartcustomer.com/
async function fetchSmartCustomer(env) {
  const url = `https://api.smartcustomer.com/v1/business/${env.SMARTCUSTOMER_BUSINESS_ID}/reviews`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env.SMARTCUSTOMER_API_KEY}` } });
  if (!res.ok) throw new Error('SmartCustomer ' + res.status + ': ' + (await res.text()));
  const data = await res.json();
  const list = data.reviews || data.data || [];
  return list.map(rv => norm('smartcustomer', {
    id: rv.id,
    author: rv.author || rv.customerName,
    rating: rv.rating || rv.stars,
    text: rv.body || rv.text,
    title: rv.title,
    date: rv.createdAt || rv.date,
  }));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const env = process.env;
  const connected = connectedMap(env);

  // Modo estado: solo reporta qué plataformas están conectadas
  if ((event.queryStringParameters || {}).status) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ connected }) };
  }

  // Trae de cada plataforma conectada (los errores no tumban al resto)
  const jobs = [];
  if (connected.google)        jobs.push(fetchGoogle(env).catch(e => ({ __err: 'google: ' + e.message })));
  if (connected.trustpilot)    jobs.push(fetchTrustpilot(env).catch(e => ({ __err: 'trustpilot: ' + e.message })));
  if (connected.smartcustomer) jobs.push(fetchSmartCustomer(env).catch(e => ({ __err: 'smartcustomer: ' + e.message })));

  const results = await Promise.all(jobs);
  const reviews = [];
  const errors = [];
  results.forEach(r => {
    if (Array.isArray(r)) reviews.push(...r);
    else if (r && r.__err) errors.push(r.__err);
  });

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ connected, count: reviews.length, reviews, errors }),
  };
};
