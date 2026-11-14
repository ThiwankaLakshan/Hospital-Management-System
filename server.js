const express = require('express'), db = require('./src/db'), routes = require('./src/routes');
const app = express();
app.use(express.json({ limit: '3mb' })); app.use(express.static('public')); app.use('/api', routes);
app.use((e, req, res, next) => res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' }));
db.init().then(async () => {
  await db.backup(); setInterval(db.backup, 864e5); // automatic daily backup
  app.listen(process.env.PORT || 3000, () => console.log('HMS running on http://localhost:' + (process.env.PORT || 3000)));
}).catch(e => { console.error(e); process.exit(1); });
