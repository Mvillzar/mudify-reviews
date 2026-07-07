// Netlify Function: save-data
// Saves data files to GitHub via API → triggers Netlify rebuild
// Supports single-password auth (ADMIN_PASSWORD) and multi-user auth (data/users.json)
// Required env vars: ADMIN_PASSWORD, GITHUB_TOKEN
// Optional env vars: GITHUB_OWNER, GITHUB_REPO

const crypto = require('crypto');

const FILE_PATHS = {
  reviews:  'Claude Test/data/reviews.json',
  settings: 'Claude Test/data/settings.json',
  users:    'Claude Test/data/users.json',
};

// Who can save each file type
const FILE_PERMISSIONS = {
  reviews:  ['admin', 'marketing'],
  settings: ['admin', 'design', 'marketing'],
  users:    ['admin'],
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function ghFetch(url, token, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'mudify-admin/1.0',
      ...(opts.headers || {}),
    },
  });
}

async function validateMultiUser(email, password, token, owner, repo) {
  const encoded = 'Claude%20Test/data/users.json';
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encoded}`;
  const res = await ghFetch(url, token);
  if (!res.ok) return null;
  const file = await res.json();
  const users = JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8')).users || [];
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim() && u.active);
  if (!user) return null;
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  return hash === user.passwordHash ? user : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { email, password, file, data } = body;

  const token = process.env.GITHUB_TOKEN;
  if (!token) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'GITHUB_TOKEN not configured' }) };

  const owner = process.env.GITHUB_OWNER || 'Mvillzar';
  const repo  = process.env.GITHUB_REPO  || 'mudify-reviews';

  // Auth: single-password super admin (no email) OR multi-user
  let userRole = null;
  if (!email) {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected || password !== expected) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Contraseña incorrecta' }) };
    userRole = 'admin';
  } else {
    try {
      const user = await validateMultiUser(email, password, token, owner, repo);
      if (!user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Credenciales incorrectas' }) };
      userRole = user.role;
    } catch (e) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Error de autenticación: ' + e.message }) };
    }
  }

  // Validate file target
  const filePath = FILE_PATHS[file];
  if (!filePath) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: `Archivo no válido: ${file}` }) };

  // Check role permission
  const allowed = FILE_PERMISSIONS[file] || [];
  if (!allowed.includes(userRole)) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: `Sin permiso para guardar "${file}" con rol "${userRole}"` }) };
  }

  const encodedPath = filePath.split('/').map(s => encodeURIComponent(s)).join('/');
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

  // Get current file SHA
  let sha;
  try {
    const getRes = await ghFetch(apiUrl, token);
    if (getRes.ok) sha = (await getRes.json()).sha;
    else if (getRes.status !== 404) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: `GitHub GET error: ${getRes.status}` }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Network error reaching GitHub: ' + e.message }) };
  }

  // PUT updated file
  try {
    const putRes = await ghFetch(apiUrl, token, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Admin (${userRole}): update ${file} via panel`,
        content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
        ...(sha && { sha }),
      }),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: `GitHub PUT error ${putRes.status}: ${err.message || JSON.stringify(err)}` }) };
    }
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Network error updating GitHub: ' + e.message }) };
  }

  // Trigger rebuild (skip for users file — no frontend rebuild needed)
  if (file !== 'users') {
    const buildHook = process.env.NETLIFY_BUILD_HOOK;
    if (buildHook) await fetch(buildHook, { method: 'POST' }).catch(() => {});
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ success: true, message: `${file} guardado.${file !== 'users' ? ' El sitio se reconstruye en ~30 segundos.' : ''}` }),
  };
};
