// Authentication, sessions (15 min timeout) and role-based access control
const crypto = require('crypto'), bcrypt = require('bcryptjs'), { q, audit } = require('./db');
const ROLES = {
  admin: '*',
  doctor: 'patients appointments admissions medical_records lab_tests documents',
  nurse: 'patients appointments admissions medical_records documents',
  receptionist: 'patients appointments admissions documents billing payments',
  lab: 'lab_tests', pharmacist: 'pharmacy', accountant: 'billing payments'
};
const ALL = ['patients','doctors','departments','appointments','admissions','medical_records','lab_tests','pharmacy','billing','payments','employees','attendance','leaves','documents'];
const READ_ALL = ['patients','doctors','departments','pharmacy']; // lookups for dropdowns
// Sessions are stored in the database, so every serverless instance sees the same logins (15 min sliding timeout)
let ready;
const ensure = () => ready || (ready = q('create table if not exists sessions(token text primary key, user_id integer, username text, role text, exp text)').catch(e => { ready = null; throw e; }));
const mods = r => ROLES[r] === '*' ? ALL : ROLES[r].split(' ');
const can = (r, m, method) => ROLES[r] === '*' || mods(r).includes(m) || (method === 'GET' && READ_ALL.includes(m));

async function login(username, password, portal) {
  const [u] = await q('select * from users where username=$1', [username || '']);
  if (!u || u.role !== portal || !bcrypt.compareSync(password || '', u.hash)) return null; // each portal only accepts its own role
  await ensure();
  const token = crypto.randomBytes(24).toString('hex');
  await q('delete from sessions where exp < $1', [String(Date.now())]);
  await q('insert into sessions(token,user_id,username,role,exp) values($1,$2,$3,$4,$5)', [token, u.id, u.username, u.role, String(Date.now() + 9e5)]);
  await audit(u.username, 'login');
  return { token, name: u.username, role: u.role, modules: mods(u.role), reports: ['admin', 'accountant'].includes(u.role) };
}
const auth = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const t = req.headers.authorization;
    if (!t) return res.status(401).json({ error: 'No session token received. Please log in again.' });
    await ensure();
    const [s] = await q('select * from sessions where token=$1', [t]);
    if (!s) return res.status(401).json({ error: 'Session not found. Please log in again.' });
    if (Number(s.exp) < Date.now()) return res.status(401).json({ error: 'Session expired. Please log in again.' });
    await q('update sessions set exp=$1 where token=$2', [String(Date.now() + 9e5), t]);
    req.s = { id: s.user_id, user: s.username, role: s.role }; next();
  } catch (e) { next(e); }
};
const allow = roles => (req, res, next) => req.s.role === 'admin' || roles.split(' ').includes(req.s.role) ? next() : res.status(403).json({ error: 'Your role cannot do this' });
async function changePassword(s, oldPw, newPw) {
  const [u] = await q('select * from users where id=$1', [s.id]);
  if (!bcrypt.compareSync(oldPw || '', u.hash)) throw Object.assign(new Error('Current password is wrong'), { status: 400 });
  if ((newPw || '').length < 6) throw Object.assign(new Error('New password needs at least 6 characters'), { status: 400 });
  await q('update users set hash=$1 where id=$2', [bcrypt.hashSync(newPw, 10), s.id]); await audit(s.user, 'password changed');
}
module.exports = { login, auth, allow, can, changePassword, ALL };