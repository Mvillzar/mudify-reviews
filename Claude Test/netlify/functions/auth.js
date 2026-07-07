// Netlify Function: auth
// Validates user credentials against data/users.json stored in GitHub
// Falls back to ADMIN_PASSWORD env var when no email is provided
// Returns: { success, role, name, userId }

const crypto = require('crypto');

const USERS_FILE_PATH = 'Claude Test/data/users.json';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function fetchUsers(token, owner, repo) {
  const encoded = USERS_FILE_PATH.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encoded}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'mudify-admin/1.0',
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const file = await res.json();
  return JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8')).users || [];
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { email, password } = body;

  // Backward-compat: single-password super admin (no email)
  if (!email && password) {
    const expected = process.env.ADMIN_PASSWORD;
    if (expected && password === expected) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, role: 'admin', name: 'Admin', userId: 'superadmin' }) };
    }
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Contraseña incorrecta' }) };
  }

  if (!email || !password) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Email y contraseña requeridos' }) };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'GITHUB_TOKEN not configured' }) };

  const owner = process.env.GITHUB_OWNER || 'Mvillzar';
  const repo  = process.env.GITHUB_REPO  || 'mudify-reviews';

  let users;
  try {
    users = await fetchUsers(token, owner, repo);
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'No se pudo cargar usuarios: ' + e.message }) };
  }

  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim() && u.active);
  if (!user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Usuario no encontrado o inactivo' }) };

  const hash = crypto.createHash('sha256').update(password).digest('hex');
  if (hash !== user.passwordHash) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Contraseña incorrecta' }) };

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, role: user.role, name: user.name, userId: user.id }) };
};
