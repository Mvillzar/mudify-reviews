// Netlify Function: analytics
// Calls GA4 Data API via service account JWT authentication
// Required env vars: GA4_PROPERTY_ID, GA4_SERVICE_ACCOUNT_JSON
// Optional: GA4_COMPARE (boolean, enable period comparison)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── JWT helper (no external deps) ────────────────
function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getGoogleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));

  const { createSign } = require('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${header}.${payload}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data));
  return data.access_token;
}

// ── GA4 report helper ─────────────────────────────
async function runReport(propertyId, token, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GA4 ${res.status}: ${err}`);
  }
  return res.json();
}

function fmtDate(d) {
  // GA4 Data API requiere formato YYYY-MM-DD (con guiones)
  return d.toISOString().slice(0, 10);
}

function daysBefore(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const propertyId = process.env.GA4_PROPERTY_ID;
  const saJson     = process.env.GA4_SERVICE_ACCOUNT_JSON;

  if (!propertyId || !saJson) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ configured: false, message: 'GA4 not configured. Set GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON.' }),
    };
  }

  const params = event.queryStringParameters || {};
  const days   = Math.min(parseInt(params.days || '30', 10), 365);

  let sa;
  try { sa = JSON.parse(saJson); } catch {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Invalid GA4_SERVICE_ACCOUNT_JSON' }) };
  }

  let token;
  try { token = await getGoogleToken(sa); } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Auth error: ' + e.message }) };
  }

  const endDate   = fmtDate(new Date());
  const startDate = fmtDate(daysBefore(days));
  const prevEnd   = fmtDate(daysBefore(days + 1));
  const prevStart = fmtDate(daysBefore(days * 2 + 1));

  try {
    const [overview, sources, pages] = await Promise.all([
      // Overview metrics
      runReport(propertyId, token, {
        dateRanges: [
          { startDate, endDate },
          { startDate: prevStart, endDate: prevEnd },
        ],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' },
        ],
      }),
      // Traffic sources
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionSource' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }),
      // Top pages
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),
    ]);

    // Parse overview (current period = dateRange0, prev = dateRange1)
    function val(report, metricIdx, rangeIdx = 0) {
      return parseFloat(report.rows?.[0]?.metricValues?.[metricIdx]?.value || '0');
    }
    function trend(curr, prev) {
      if (!prev) return null;
      const pct = ((curr - prev) / prev) * 100;
      return { pct: Math.round(pct), dir: pct >= 0 ? 'up' : 'down' };
    }

    const curr = {
      users:    val(overview, 0, 0),
      sessions: val(overview, 1, 0),
      views:    val(overview, 2, 0),
      duration: val(overview, 3, 0),
      bounce:   val(overview, 4, 0),
    };
    const prev = overview.rows?.[0]?.metricValues?.length > 5 ? {
      users:    parseFloat(overview.rows[0].metricValues[5]?.value || '0'),
      sessions: parseFloat(overview.rows[0].metricValues[6]?.value || '0'),
      views:    parseFloat(overview.rows[0].metricValues[7]?.value || '0'),
      duration: parseFloat(overview.rows[0].metricValues[8]?.value || '0'),
    } : null;

    const totalSessions = sources.rows?.reduce((s, r) => s + parseFloat(r.metricValues[0].value), 0) || 1;
    const srcData = (sources.rows || []).map(r => ({
      source: r.dimensionValues[0].value || '(direct)',
      sessions: parseInt(r.metricValues[0].value),
      pct: Math.round((parseInt(r.metricValues[0].value) / totalSessions) * 100),
    }));

    const pagesData = (pages.rows || []).map(r => ({
      path: r.dimensionValues[0].value,
      views: parseInt(r.metricValues[0].value),
    }));

    const fmtDuration = s => {
      const m = Math.floor(s / 60), sec = Math.round(s % 60);
      return `${m}m ${sec}s`;
    };

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        configured: true,
        days,
        metrics: {
          users:    { val: Math.round(curr.users),    trend: prev ? trend(curr.users, prev.users) : null },
          sessions: { val: Math.round(curr.sessions), trend: prev ? trend(curr.sessions, prev.sessions) : null },
          views:    { val: Math.round(curr.views),    trend: prev ? trend(curr.views, prev.views) : null },
          duration: { val: fmtDuration(curr.duration), raw: curr.duration, trend: prev ? trend(curr.duration, prev.duration) : null },
          bounce:   { val: Math.round(curr.bounce * 100) + '%' },
        },
        sources: srcData,
        pages: pagesData,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
