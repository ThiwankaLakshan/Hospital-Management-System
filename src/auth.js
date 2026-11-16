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
// Stateless signed tokens (work across serverless instances). Set SESSION_SECRET in production.
const SECRET = process.env.SESSION_SECRET || (process.env.DATABASE_URL ? crypto.createHash('sha256').update('hms:' + process.env.DATABASE_URL).digest('hex') : crypto.randomBytes(32).toString('hex'));
const mac = b => crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
const sign = s => { const b = Buffer.from(JSON.stringify(s)).toString('base64url'); return b + '.' + mac(b); };
const verify = t => {
  const [b, g] = String(t || '').split('.'); if (!b || !g) return null;
  const ok = mac(b); if (g.length !== ok.length || !crypto.timingSafeEqual(Buffer.from(g), Buffer.from(ok))) return null;
  const s = JSON.parse(Buffer.from(b, 'base64url').toString()); return s.exp > Date.now() ? s : null;
};
const mods = r => ROLES[r] === '*' ? ALL : ROLES[r].split(' ');
const can = (r, m, method) => ROLES[r] === '*' || mods(r).includes(m) || (method === 'GET' && READ_ALL.includes(m));

async function login(username, password, portal) {
  const [u] = await q('select * from users where username=$1', [username || '']);
  if (!u || u.role !== portal || !bcrypt.compareSync(password || '', u.hash)) return null; // each portal only accepts its own role
  const token = sign({ id: u.id, user: u.username, role: u.role, exp: Date.now() + 9e5 });
  await audit(u.username, 'login');
  return { token, name: u.username, role: u.role, modules: mods(u.role), reports: ['admin', 'accountant'].includes(u.role) };
}
const auth = (req, res, next) => {
  const s = verify(req.headers.authorization);
  if (!s) return res.status(401).json({ error: 'Session expired. Please log in again.' });
  res.set('X-Token', sign({ ...s, exp: Date.now() + 9e5 })); // sliding 15 minute timeout
  req.s = s; next();
};
const allow = roles => (req, res, next) => req.s.role === 'admin' || roles.split(' ').includes(req.s.role) ? next() : res.status(403).json({ error: 'Your role cannot do this' });
async function changePassword(s, oldPw, newPw) {
  const [u] = await q('select * from users where id=$1', [s.id]);
  if (!bcrypt.compareSync(oldPw || '', u.hash)) throw Object.assign(new Error('Current password is wrong'), { status: 400 });
  if ((newPw || '').length < 6) throw Object.assign(new Error('New password needs at least 6 characters'), { status: 400 });
  await q('update users set hash=$1 where id=$2', [bcrypt.hashSync(newPw, 10), s.id]); await audit(s.user, 'password changed');
}
module.exports = { login, auth, allow, can, changePassword, ALL };
