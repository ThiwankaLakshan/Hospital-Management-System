const express = require('express'), db = require('./src/db'), routes = require('./src/routes');
const app = express(), ready = db.init(); ready.catch(e => console.error(e));
app.use(express.json({ limit: '3mb' })); app.use(express.static('public'));
app.use('/api', async (req, res, next) => { try { await ready; next(); } catch (e) { next(e); } }, routes);
app.use((e, req, res, next) => res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' }));
module.exports = app;
if (require.main === module) { // local run; on Vercel the app is exported instead
  db.backup(); setInterval(db.backup, 864e5); // daily backup (use your database provider's backups on Vercel)
  app.listen(process.env.PORT || 3000, () => console.log('HMS running on http://localhost:' + (process.env.PORT || 3000)));
}
