const core = require('../lib/fantasy-core');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const result = await core.fetchAllLeagues();
      res.status(200).json({
        ...result,
        limits: core.getLeagueLimits()
      });
      return;
    }

    if (req.method === 'POST') {
      const body = await core.readJsonBody(req);
      const leagueName = String(body?.name || '').trim();
      const users = Array.isArray(body?.users) ? body.users : [];

      if (!leagueName) {
        res.status(400).json({ error: 'League name is required.' });
        return;
      }

      const savedLeague = await core.saveLeague(leagueName, users);
      res.status(200).json({
        league: savedLeague
      });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    res.status(500).json({
      error: 'Leagues API failed.',
      detail: error.message
    });
  }
};
