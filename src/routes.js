// Application layer: HTTP routes
const router = require('express').Router(), { q, audit } = require('./db'), A = require('./auth'), S = require('./services');
const h = f => (req, res, next) => f(req, res).catch(next);
const COLS = {
  patients: 'name age gender phone address type', doctors: 'name department_id schedule_days start_time end_time', departments: 'name',
  appointments: 'patient_id doctor_id date time status', admissions: 'patient_id doctor_id ward admitted discharged',
  medical_records: 'patient_id doctor_id diagnosis treatment prescription medicine_id quantity', lab_tests: 'patient_id test status result',
  pharmacy: 'name quantity reorder_level expiry price', billing: 'patient_id consultation laboratory pharmacy admission',
  payments: 'billing_id amount method', employees: 'name role department_id phone', attendance: 'employee_id date status',
  leaves: 'employee_id from_date to_date reason', documents: 'patient_id filename data'
};
const DATED = { medical_records: 'created', lab_tests: 'created', billing: 'created', payments: 'paid_on', documents: 'uploaded' };

router.post('/login', h(async (req, res) => { const r = await A.login(req.body.username, req.body.password, req.body.portal); r ? res.json(r) : res.status(401).json({ error: 'Wrong username or password for this portal' }); }));
router.use(A.auth);
router.post('/password', h(async (req, res) => { await A.changePassword(req.s, req.body.old, req.body.new); res.json({ ok: true }); }));
router.get('/dashboard', h(async (req, res) => res.json(await S.dashboard())));
router.get('/reports/:type', A.allow('accountant'), h(async (req, res) => res.json(await S.report(req.params.type))));
router.get('/patients/:id/history', A.allow('doctor nurse'), h(async (req, res) => res.json(await S.history(req.params.id))));
router.get('/prescriptions', A.allow('pharmacist'), h(async (req, res) => res.json(await S.prescriptions())));
router.post('/prescriptions/:id/dispense', A.allow('pharmacist'), h(async (req, res) => { await S.dispense(req.params.id); await audit(req.s.user, 'dispense ' + req.params.id); res.json({ ok: true }); }));
router.post('/admissions/:id/discharge', A.allow('doctor nurse receptionist'), h(async (req, res) => { await S.discharge(req.params.id); await audit(req.s.user, 'discharge ' + req.params.id); res.json({ ok: true }); }));
router.get('/documents/:id/file', A.allow('doctor nurse receptionist'), h(async (req, res) => res.json((await q('select filename,data from documents where id=$1', [req.params.id]))[0] || {})));

// generic CRUD guarded by role
router.use('/:t', (req, res, next) => COLS[req.params.t] ? (A.can(req.s.role, req.params.t, req.method) ? next() : res.status(403).json({ error: `Your role (${req.s.role}) cannot ${req.method} ${req.params.t}` })) : res.status(404).json({ error: 'Unknown module' }));
const pick = (t, b) => COLS[t].split(' ').filter(c => c in b).map(c => [c, b[c] === '' ? null : b[c]]);
router.get('/:t', h(async (req, res) => {
  const t = req.params.t;
  res.json(t === 'billing' ? await S.billingList() : await q(t === 'documents' ? 'select id,patient_id,filename,uploaded from documents order by id desc' : `select * from ${t} order by id`));
}));
router.post('/:t', h(async (req, res) => {
  const t = req.params.t, f = pick(t, req.body);
  if (t === 'appointments') await S.checkConflict(req.body);
  if (DATED[t]) f.push([DATED[t], t === 'documents' ? new Date().toISOString() : S.today()]);
  const [row] = await q(`insert into ${t}(${f.map(x => x[0])}) values(${f.map((_, i) => '$' + (i + 1))}) returning ${t === 'documents' ? 'id' : '*'}`, f.map(x => x[1]));
  if (t === 'admissions') await S.admit(req.body);
  await audit(req.s.user, `create ${t} ${row.id}`); res.json(row);
}));
router.put('/:t/:id', h(async (req, res) => {
  const t = req.params.t, f = pick(t, req.body);
  if (t === 'appointments') { const [old] = await q('select * from appointments where id=$1', [req.params.id]); await S.checkConflict({ ...old, ...req.body }, req.params.id); }
  if (!f.length) return res.json({ ok: true });
  const [row] = await q(`update ${t} set ${f.map((x, i) => x[0] + '=$' + (i + 1))} where id=$${f.length + 1} returning *`, [...f.map(x => x[1]), req.params.id]);
  await audit(req.s.user, `update ${t} ${req.params.id}`); res.json(row || {});
}));
router.delete('/:t/:id', h(async (req, res) => { await q(`delete from ${req.params.t} where id=$1`, [req.params.id]); await audit(req.s.user, `delete ${req.params.t} ${req.params.id}`); res.json({ ok: true }); }));
module.exports = router;
