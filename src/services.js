// Business logic layer
const { q } = require('./db');
const err = (status, message) => Object.assign(new Error(message), { status });
const today = () => new Date().toISOString().slice(0, 10);
const num = v => Number(v) || 0;
const count = (rows, key) => Object.entries(rows.reduce((a, r) => (a[r[key] || 'Unknown'] = (a[r[key] || 'Unknown'] || 0) + 1, a), {}));
const soon = () => new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);

async function checkConflict(b, id) { // no double booking for a doctor
  if (!b.doctor_id || !b.date || !b.time || b.status === 'Cancelled') return;
  const clash = (await q('select id from appointments where doctor_id=$1 and date=$2 and time=$3 and status=$4', [b.doctor_id, b.date, b.time, 'Scheduled'])).filter(r => String(r.id) !== String(id));
  if (clash.length) throw err(409, 'That doctor already has an appointment at that time');
}
async function billingList() {
  const bills = await q('select * from billing order by id'), pays = await q('select * from payments');
  return bills.map(b => { const total = num(b.consultation) + num(b.laboratory) + num(b.pharmacy) + num(b.admission), paid = pays.filter(p => p.billing_id === b.id).reduce((s, p) => s + num(p.amount), 0); return { ...b, total, paid, balance: total - paid }; });
}
async function prescriptions() {
  const [rec, pat, med] = await Promise.all([q('select * from medical_records where dispensed=false order by id'), q('select id,name from patients'), q('select id,name,quantity from pharmacy')]);
  return rec.filter(r => r.medicine_id).map(r => ({ ...r, patient: (pat.find(p => p.id === r.patient_id) || {}).name, medicine: (med.find(m => m.id === r.medicine_id) || {}).name, stock: (med.find(m => m.id === r.medicine_id) || {}).quantity }));
}
async function dispense(id) { // prescription processing + stock update
  const [r] = await q('select * from medical_records where id=$1', [id]);
  if (!r || !r.medicine_id) throw err(400, 'No medicine on this prescription');
  if (r.dispensed) throw err(400, 'Already dispensed');
  const [m] = await q('select * from pharmacy where id=$1', [r.medicine_id]);
  if (m.quantity < r.quantity) throw err(400, `Not enough stock (${m.quantity} left)`);
  await q('update pharmacy set quantity=$1 where id=$2', [m.quantity - r.quantity, m.id]);
  await q('update medical_records set dispensed=true where id=$1', [id]);
}
async function admit(b) { await q('update patients set type=$1 where id=$2', ['Inpatient', b.patient_id]); }
async function discharge(id) {
  const [a] = await q('select * from admissions where id=$1', [id]); if (!a) throw err(404, 'Not found');
  await q('update admissions set discharged=$1 where id=$2', [today(), id]); await q('update patients set type=$1 where id=$2', ['Outpatient', a.patient_id]);
}
async function history(pid) {
  const t = n => q(`select * from ${n} where patient_id=$1 order by id desc`, [pid]);
  return { records: await t('medical_records'), labs: await t('lab_tests'), appointments: await t('appointments'), admissions: await t('admissions'), documents: await q('select id,filename,uploaded from documents where patient_id=$1', [pid]) };
}
async function dashboard() {
  const [pat, app, lab, med, pay] = await Promise.all([q('select id from patients'), q('select * from appointments'), q('select * from lab_tests'), q('select * from pharmacy'), q('select amount from payments')]);
  return { patients: pat.length, today: app.filter(a => a.date === today() && a.status !== 'Cancelled').length, revenue: pay.reduce((s, p) => s + num(p.amount), 0), lab: lab.filter(l => l.status !== 'Completed').length, alerts: med.filter(m => m.quantity < m.reorder_level || (m.expiry && m.expiry <= soon())).length };
}
async function report(type) {
  const kv = (title, pairs) => ({ title, rows: pairs.map(([Measure, Value]) => ({ Measure, Value })) });
  if (type === 'patients') { const p = await q('select * from patients'); return kv('Patient report', [['Total patients', p.length], ...count(p, 'type'), ...count(p, 'gender')]); }
  if (type === 'appointments') return kv('Appointment report', count(await q('select * from appointments'), 'status'));
  if (type === 'laboratory') return kv('Laboratory report', count(await q('select * from lab_tests'), 'status'));
  if (type === 'revenue') { const b = await billingList(), p = await q('select * from payments'); return { title: 'Revenue report', rows: [{ Measure: 'Total billed', Value: b.reduce((s, x) => s + x.total, 0) }, { Measure: 'Collected', Value: p.reduce((s, x) => s + num(x.amount), 0) }, { Measure: 'Outstanding', Value: b.reduce((s, x) => s + x.balance, 0) }, ...count(p, 'paid_on').map(([d, n]) => ({ Measure: 'Payments on ' + d, Value: n }))] }; }
  if (type === 'pharmacy') return { title: 'Pharmacy report', rows: (await q('select * from pharmacy')).map(m => ({ Medicine: m.name, Stock: m.quantity, 'Reorder level': m.reorder_level, Expiry: m.expiry, Alert: [m.quantity < m.reorder_level && 'Low stock', m.expiry <= soon() && 'Expiring'].filter(Boolean).join(', ') || 'OK' })) };
  if (type === 'staff') { const e = await q('select * from employees'), l = await q('select * from leaves'), a = await q('select * from attendance'); return kv('Staff report', [['Employees', e.length], ...count(e, 'role'), ['Leave records', l.length], ['Present marks', a.filter(x => x.status === 'Present').length]]); }
  throw err(404, 'Unknown report');
}
module.exports = { err, today, checkConflict, billingList, prescriptions, dispense, admit, discharge, history, dashboard, report };
