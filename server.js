const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const core = require('./lib/fantasy-core');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

async function serveStaticFile(res, requestedPathname) {
  let pathname = requestedPathname;
  if (pathname === '/') {
    pathname = '/index.html';
  }

  const absolutePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  try {
    const fileBuffer = await fs.readFile(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fileBuffer);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/majors') {
      if (req.method !== 'GET') {
        res.writeHead(405, {
          'Content-Type': 'application/json; charset=utf-8',
          Allow: 'GET'
        });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return;
      }

      const forceRefresh = url.searchParams.get('refresh') === '1';
      const seasonYear = core.parseSeasonYear(url.searchParams.get('year'));
      const leagueName = core.parseLeagueName(url.searchParams.get('league'));
      const payload = await core.getCachedPayload(seasonYear, leagueName, forceRefresh);

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(payload));
      return;
    }

    if (url.pathname === '/api/selections') {
      if (req.method === 'GET') {
        const seasonYear = core.parseSeasonYear(url.searchParams.get('year'));
        const leagueName = core.parseLeagueName(url.searchParams.get('league'));
        const result = await core.fetchStoredSelections(seasonYear, leagueName);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === 'POST') {
        const body = await core.readJsonBody(req);
        const seasonYear = core.parseSeasonYear(body?.seasonYear);
        const leagueName = core.parseLeagueName(body?.leagueName);
        const teamName = String(body?.teamName || '').trim();
        const selections = body?.selections || {};

        if (!teamName) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'teamName is required.' }));
          return;
        }

        const saved = await core.upsertSelections(seasonYear, leagueName, teamName, selections);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(saved));
        return;
      }

      res.writeHead(405, {
        'Content-Type': 'application/json; charset=utf-8',
        Allow: 'GET, POST'
      });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    if (url.pathname === '/api/leagues') {
      if (req.method === 'GET') {
        const leagues = await core.fetchAllLeagues();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            ...leagues,
            limits: core.getLeagueLimits()
          })
        );
        return;
      }

      if (req.method === 'POST') {
        const body = await core.readJsonBody(req);
        const leagueName = String(body?.name || '').trim();
        const users = Array.isArray(body?.users) ? body.users : [];

        if (!leagueName) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'League name is required.' }));
          return;
        }

        const savedLeague = await core.saveLeague(leagueName, users);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ league: savedLeague }));
        return;
      }

      res.writeHead(405, {
        'Content-Type': 'application/json; charset=utf-8',
        Allow: 'GET, POST'
      });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    await serveStaticFile(res, url.pathname);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: 'Failed to load golf data.',
        detail: error.message
      })
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(`${core.APP_NAME} running at http://${HOST}:${PORT}`);
});
