// Netlify Function: save-data
// Saves reviews.json or settings.json to GitHub via API → triggers Netlify rebuild
// Required env vars: ADMIN_PASSWORD, GITHUB_TOKEN
// Optional env vars: GITHUB_OWNER (default: Mvillzar), GITHUB_REPO (default: mudify-reviews)

const FILE_PATHS = {
  reviews: 'Claude Test/data/reviews.json',
  settings: 'Claude Test/data/settings.json',
};

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { password, file, data } = body;

  // Password check
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'ADMIN_PASSWORD not configured in Netlify env vars' }) };
  }
  if (password !== expected) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Contraseña incorrecta' }) };
  }

  // Validate file target
  const filePath = FILE_PATHS[file];
  if (!filePath) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Invalid file: ${file}` }) };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'GITHUB_TOKEN not configured in Netlify env vars' }) };
  }

  const owner = process.env.GITHUB_OWNER || 'Mvillzar';
  const repo = process.env.GITHUB_REPO || 'mudify-reviews';

  // Encode path (handle spaces in "Claude Test")
  const encodedPath = filePath.split('/').map(s => encodeURIComponent(s)).join('/');
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

  const ghHeaders = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'mudify-admin/1.0',
  };

  // Get current file SHA (needed to update existing file)
  let sha;
  try {
    const getRes = await fetch(apiUrl, { headers: ghHeaders });
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    } else if (getRes.status !== 404) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: `GitHub GET error: ${getRes.status}` }) };
    }
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Network error reaching GitHub: ' + e.message }) };
  }

  // Encode content as base64
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

  // PUT updated file to GitHub
  const putPayload = {
    message: `Admin: update ${file} via panel`,
    content,
    ...(sha && { sha }),
  };

  try {
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify(putPayload),
    });

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: `GitHub PUT error ${putRes.status}: ${err.message || JSON.stringify(err)}`,
          debug_url: apiUrl,
          debug_sha_found: !!sha,
          debug_owner: owner,
          debug_repo: repo,
          debug_path: filePath,
        }),
      };
    }
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Network error updating GitHub: ' + e.message }) };
  }

  // Trigger Netlify rebuild via build hook
  const buildHook = process.env.NETLIFY_BUILD_HOOK;
  if (buildHook) {
    await fetch(buildHook, { method: 'POST' }).catch(() => {});
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ success: true, message: `${file} guardado. El sitio se reconstruye en ~30 segundos.` }),
  };
};
