// Disaster recovery: node scripts/restore.js backups/daily-YYYY-MM-DD.json  (use with DATABASE_URL set)
const fs = require('fs'), { pool, init, TABLES } = require('../src/db');
(async () => {
  const dump = JSON.parse(fs.readFileSync(process.argv[2])); await init();
  for (const t of [...TABLES].reverse()) await pool.query(`delete from ${t}`);
  for (const t of TABLES) {
    for (const r of dump[t] || []) { const k = Object.keys(r); await pool.query(`insert into ${t}(${k}) values(${k.map((_, i) => '$' + (i + 1))})`, k.map(c => r[c])); }
    if (process.env.DATABASE_URL) await pool.query(`select setval(pg_get_serial_sequence('${t}','id'), coalesce((select max(id) from ${t}),1))`);
  }
  console.log('Restore complete'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
