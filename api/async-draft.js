const core = require('../lib/fantasy-core');

function getQueryValue(req, key) {
  const value = req.query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const league = String(getQueryValue(req, 'league') || '').trim();
    const year = String(getQueryValue(req, 'year') || '').trim();

    if (!league || !year) {
      res.status(400).json({ error: 'league and year are required.' });
      return;
    }

    try {
      const state = await core.getAsyncDraft(league, year);
      if (!state) {
        res.status(404).json({ error: 'Async draft not found.' });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ state });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load async draft.', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await core.readJsonBody(req);
    } catch (error) {
      res.status(400).json({ error: 'Invalid request body.' });
      return;
    }

    const action = String(body?.action || '').trim();

    if (action === 'init') {
      const setup = body?.setup;
      if (!setup) {
        res.status(400).json({ error: 'setup is required.' });
        return;
      }
      try {
        const state = await core.initAsyncDraft(setup);
        res.status(200).json({ state });
      } catch (error) {
        res.status(500).json({ error: 'Failed to initialize async draft.', detail: error.message });
      }
      return;
    }

    if (action === 'pick') {
      const league = String(body?.league || '').trim();
      const year = String(body?.year || '').trim();
      const playerName = String(body?.playerName || '').trim();

      if (!league || !year || !playerName) {
        res.status(400).json({ error: 'league, year, and playerName are required.' });
        return;
      }

      try {
        const state = await core.saveAsyncDraftPick(league, year, playerName);
        res.status(200).json({ state });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
      return;
    }

    res.status(400).json({ error: 'action must be "init" or "pick".' });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method Not Allowed' });
};
