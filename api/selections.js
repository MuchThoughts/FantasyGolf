const core = require('../lib/fantasy-core');

function getQueryValue(req, key) {
  const value = req.query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const seasonYear = core.parseSeasonYear(getQueryValue(req, 'year'));
      const leagueName = core.parseLeagueName(getQueryValue(req, 'league'));
      const result = await core.fetchStoredSelections(seasonYear, leagueName);

      res.status(200).json(result);
      return;
    }

    if (req.method === 'POST') {
      const body = await core.readJsonBody(req);
      const seasonYear = core.parseSeasonYear(body?.seasonYear);
      const leagueName = core.parseLeagueName(body?.leagueName);
      const teamName = String(body?.teamName || '').trim();
      const selections = body?.selections || {};

      if (!teamName) {
        res.status(400).json({ error: 'teamName is required.' });
        return;
      }

      const saved = await core.upsertSelections(seasonYear, leagueName, teamName, selections);
      res.status(200).json(saved);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    res.status(500).json({
      error: 'Selections API failed.',
      detail: error.message
    });
  }
};
