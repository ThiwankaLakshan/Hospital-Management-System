// Database layer: real PostgreSQL if DATABASE_URL is set, otherwise an in-memory PostgreSQL emulator
const fs = require('fs'), path = require('path'), bcrypt = require('bcryptjs');
let pool;
if (process.env.DATABASE_URL) {
  const pg = require('pg'); pg.types.setTypeParser(1082, v => v); // keep dates as plain YYYY-MM-DD
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 }); console.log('Using PostgreSQL');
} else {
  const { newDb } = require('pg-mem'); pool = new (newDb().adapters.createPg().Pool)();
  console.log('No DATABASE_URL set: using in-memory PostgreSQL emulator (data resets on restart)');
}
const fix = v => v instanceof Date ? v.toISOString().slice(0, 10) : v;
const q = async (sql, p = []) => (await pool.query(sql, p)).rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fix(v)])));
const audit = (u, a) => q('insert into audit_logs(username,action,at) values($1,$2,$3)', [u, a, new Date().toISOString()]);
const TABLES = ['departments','users','patients','doctors','appointments','admissions','medical_records','lab_tests','pharmacy','billing','payments','employees','attendance','leaves','documents','audit_logs'];

async function init() {
  for (const s of fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8').split(';')) if (s.trim()) await pool.query(s);
  if ((await q('select id from users')).length) return;
  for (const r of ['admin','doctor','nurse','receptionist','lab','pharmacist','accountant'])
    await q('insert into users(username,hash,role) values($1,$2,$3)', [r, bcrypt.hashSync(r + '123', 10), r]);
  await q("insert into departments(name) values('General Medicine'),('Paediatrics'),('Surgery')");
  await q("insert into doctors(name,department_id,schedule_days,start_time,end_time) values('Dr. A. Perera',1,'Mon-Fri','08:00','16:00')");
  await q("insert into patients(name,age,gender,phone,address,type) values('Nimal Fernando',45,'Male','0771234567','Vavuniya','Outpatient')");
  await q("insert into pharmacy(name,quantity,reorder_level,expiry,price) values('Paracetamol 500mg',420,100,'2027-06-30',5),('Amoxicillin 250mg',60,80,'2026-12-15',20)");
}
// Daily backup (full JSON dump); on Sundays also a weekly full backup
async function backup() {
  fs.mkdirSync('backups', { recursive: true });
  const dump = {}; for (const t of TABLES) dump[t] = await q(`select * from ${t}`);
  const day = new Date().toISOString().slice(0, 10), body = JSON.stringify(dump);
  fs.writeFileSync(`backups/daily-${day}.json`, body);
  if (new Date().getDay() === 0) fs.writeFileSync(`backups/weekly-${day}.json`, body);
}
module.exports = { pool, q, audit, init, backup, TABLES };
