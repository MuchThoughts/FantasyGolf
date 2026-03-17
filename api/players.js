const core = require('../lib/fantasy-core');

function getQueryValue(req, key) {
  const value = req.query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

module.exports = async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const seasonYear = core.parseSeasonYear(getQueryValue(req, 'year'));
    const forceRefresh = getQueryValue(req, 'refresh') === '1';
    const payload = await core.fetchTopPlayers(seasonYear, forceRefresh);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({
      error: 'Players API failed.',
      detail: error.message
    });
  }
};
