// HMS frontend. One config (M) drives every module screen; f = [key, label, type, optional]
const M = {
  patients:{t:'Patients',search:1,f:[['name','Full name'],['age','Age','number'],['gender','Gender',['Female','Male','Other']],['phone','Phone'],['address','Address'],['type','Type',['Outpatient','Inpatient']]],x:r=>btn('History',`hist(${r.id})`)+btn('Upload',`upl(${r.id})`)},
  doctors:{t:'Doctors',f:[['name','Name'],['department_id','Department','@departments'],['schedule_days','Days (e.g. Mon-Fri)'],['start_time','From','time'],['end_time','To','time']]},
  departments:{t:'Departments',f:[['name','Name']]},
  appointments:{t:'Appointments',cal:1,f:[['patient_id','Patient','@patients'],['doctor_id','Doctor','@doctors'],['date','Date','date'],['time','Time','time'],['status','Status',['Scheduled','Completed','Cancelled']]],x:r=>r.status==='Scheduled'?btn('Cancel',`setSt(${r.id},'Cancelled')`)+btn('Complete',`setSt(${r.id},'Completed')`):''},
  admissions:{t:'Admissions',f:[['patient_id','Patient','@patients'],['doctor_id','Doctor','@doctors'],['ward','Ward'],['admitted','Admitted on','date']],show:[['discharged','Discharged']],x:r=>r.discharged?'':btn('Discharge',`dis(${r.id})`)},
  medical_records:{t:'Medical records',f:[['patient_id','Patient','@patients'],['doctor_id','Doctor','@doctors'],['diagnosis','Diagnosis'],['treatment','Treatment'],['prescription','Prescription notes'],['medicine_id','Medicine','@pharmacy',1],['quantity','Quantity','number',1]],show:[['dispensed','Dispensed']]},
  lab_tests:{t:'Laboratory',f:[['patient_id','Patient','@patients'],['test','Test'],['status','Status',['Requested','Sample collected','Completed']],['result','Result',,1]],x:r=>r.status==='Completed'?btn('Print report',`labRep(${r.id})`):''},
  pharmacy:{t:'Pharmacy',pre:'rx',f:[['name','Medicine'],['quantity','Stock','number'],['reorder_level','Reorder level','number'],['expiry','Expiry','date'],['price','Price','number']],show:[['_alert','Alert',r=>[r.quantity<r.reorder_level&&'Low stock',r.expiry&&r.expiry<=soon()&&'Expiring soon'].filter(Boolean).join(', ')||'OK']]},
  billing:{t:'Billing',f:[['patient_id','Patient','@patients'],['consultation','Consultation','number'],['laboratory','Laboratory','number'],['pharmacy','Pharmacy','number'],['admission','Admission','number']],show:[['total','Total'],['paid','Paid'],['balance','Balance']],x:r=>(r.balance>0?btn('Pay',`pay(${r.id},${r.balance})`):'')+btn('Receipt',`rec(${r.id})`)},
  employees:{t:'Staff',f:[['name','Name'],['role','Role'],['department_id','Department','@departments'],['phone','Phone']]},
  attendance:{t:'Attendance',f:[['employee_id','Employee','@employees'],['date','Date','date'],['status','Status',['Present','Absent','Late']]]},
  leaves:{t:'Leave records',f:[['employee_id','Employee','@employees'],['from_date','From','date'],['to_date','To','date'],['reason','Reason']]}
};
const V = { dashboard:'Dashboard', reports:'Reports', account:'Account' };
let token, cur, editing, cal = false, rows = [], look = {};
const $ = id => document.getElementById(id), btn = (l, a) => `<button class="sm g" onclick="${a}">${l}</button>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const soon = () => new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
const nm = (t, id) => (look[t]?.find(x => x.id === id) || {}).name || id || '';

async function api(path, method = 'GET', body) {
  const r = await fetch('/api/' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: token || '' }, body: body && JSON.stringify(body) });
  const nt = r.headers.get('X-Token'); if (nt) token = nt;
  const j = await r.json();
  if (r.status === 401 && token) { logout(j.error); throw new Error(j.error); }
  if (!r.ok) throw new Error(j.error); return j;
}
async function login() {
  try {
    const j = await api('login', 'POST', { username: $('u').value, password: $('p').value, portal: document.body.dataset.portal });
    token = j.token; $('who').textContent = j.name; $('login').hidden = true; $('app').hidden = false;
    const tabs = ['dashboard', ...j.modules.filter(m => M[m]), ...(j.reports ? ['reports'] : []), 'account'];
    $('nav').innerHTML = tabs.map(m => `<button data-m="${m}" onclick="show('${m}')">${(M[m] || {t:V[m]}).t || V[m]}</button>`).join(''); show('dashboard');
  } catch (e) { $('err').textContent = e.message; }
}
function logout(msg) { token = null; $('app').hidden = true; $('login').hidden = false; $('p').value = ''; $('err').textContent = msg || ''; }
async function show(c) {
  cur = c; editing = null; document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.m === c));
  try {
    if (c === 'dashboard') return dash(); if (c === 'reports') return reports(); if (c === 'account') return account();
    for (const f of M[c].f) if ((f[2] || '')[0] === '@') look[f[2].slice(1)] = await api(f[2].slice(1));
    rows = await api(c); draw();
  } catch (e) { $('main').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
async function dash() {
  const d = await api('dashboard');
  $('main').innerHTML = `<div class="stats">${[['Total patients',d.patients],['Today’s appointments',d.today],['Revenue collected','LKR '+d.revenue.toLocaleString()],['Open lab requests',d.lab],['Pharmacy alerts',d.alerts]].map(s=>`<div class="stat"><b>${s[1]}</b>${s[0]}</div>`).join('')}</div>`;
}
function input(f, v = '') {
  const [k, l, t, opt] = f, req = opt ? '' : 'required';
  if (Array.isArray(t)) return `<label>${l}<select name="${k}">${t.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
  if ((t || '')[0] === '@') return `<label>${l}<select name="${k}" ${req}>${opt ? '<option value=""></option>' : ''}${look[t.slice(1)].map(o => `<option value="${o.id}" ${o.id == v ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>`;
  return `<label>${l}<input name="${k}" type="${t || 'text'}" value="${esc(v)}" ${req}></label>`;
}
const cell = (f, r) => (f[2] || '')[0] === '@' ? esc(nm(f[2].slice(1), r[f[0]])) : r[f[0]] === true ? 'Yes' : r[f[0]] === false ? 'No' : esc(r[f[0]]);
async function draw() {
  const m = M[cur], row = rows.find(r => r.id === editing) || {};
  const extra = m.show || [], pre = m.pre === 'rx' ? await rxPanel() : '';
  const body = cal ? calendar() : `<div class="tw"><table><tr>${m.f.map(f => `<th>${f[1]}</th>`).join('')}${extra.map(e => `<th>${e[1]}</th>`).join('')}<th></th></tr>
  ${rows.map(r => `<tr>${m.f.map(f => `<td>${cell(f, r)}</td>`).join('')}${extra.map(e => `<td>${e[2] ? e[2](r) : esc(r[e[0]] === true ? 'Yes' : r[e[0]] === false ? 'No' : r[e[0]])}</td>`).join('')}<td>${m.x ? m.x(r) : ''}${cur === 'documents' ? '' : btn('Edit', `edit(${r.id})`) + btn('Delete', `del(${r.id})`)}</td></tr>`).join('') || '<tr><td>No records yet.</td></tr>'}</table></div>`;
  $('main').innerHTML = pre + `<form onsubmit="saveRow(event)">${m.f.map(f => input(f, row[f[0]])).join('')}<button>${editing ? 'Save changes' : 'Add'}</button></form>
  ${m.search ? '<input placeholder="Search…" oninput="filt(this.value)" style="margin-bottom:10px">' : ''}${m.cal ? `<p><button class="g" onclick="cal=!cal;draw()">${cal ? 'Table view' : 'Calendar view'}</button></p>` : ''}${body}`;
}
function calendar() {
  const days = [...new Set(rows.map(r => r.date))].sort();
  return days.map(d => `<div class="day"><b>${d}</b>${rows.filter(r => r.date === d).sort((a, b) => a.time > b.time ? 1 : -1).map(r => `<div>${r.time} · ${esc(nm('patients', r.patient_id))} with ${esc(nm('doctors', r.doctor_id))} <i>(${r.status})</i></div>`).join('')}</div>`).join('') || '<p>No appointments.</p>';
}
const filt = v => document.querySelectorAll('main tr').forEach((tr, i) => { if (i) tr.hidden = !tr.textContent.toLowerCase().includes(v.toLowerCase()); });
async function rxPanel() {
  try { const p = await api('prescriptions'); return `<h3>Prescriptions waiting to be dispensed</h3>${p.length ? `<div class="tw"><table><tr><th>Patient</th><th>Medicine</th><th>Qty</th><th>Stock</th><th></th></tr>${p.map(r => `<tr><td>${esc(r.patient)}</td><td>${esc(r.medicine)}</td><td>${r.quantity}</td><td>${r.stock}</td><td>${btn('Dispense', `disp(${r.id})`)}</td></tr>`).join('')}</table></div>` : '<p>None waiting.</p>'}<h3>Inventory</h3>`; } catch { return ''; }
}
async function saveRow(e) {
  e.preventDefault(); const b = Object.fromEntries(new FormData(e.target));
  M[cur].f.forEach(f => { if (f[2] === 'number' && b[f[0]] !== '') b[f[0]] = +b[f[0]]; });
  try { editing ? await api(`${cur}/${editing}`, 'PUT', b) : await api(cur, 'POST', b); show(cur); } catch (err) { alert(err.message); }
}
const act = async (p, m = 'POST', b) => { try { await api(p, m, b); show(cur); } catch (e) { alert(e.message); } };
const edit = id => { editing = id; draw(); }, del = id => confirm('Delete this record?') && act(`${cur}/${id}`, 'DELETE');
const setSt = (id, status) => act(`appointments/${id}`, 'PUT', { status }), dis = id => act(`admissions/${id}/discharge`), disp = id => act(`prescriptions/${id}/dispense`);
const pay = (id, bal) => { const a = +prompt('Amount received (LKR)', bal); if (a > 0) act('payments', 'POST', { billing_id: id, amount: a, method: 'Cash' }); };
function dlg(h) { $('dlg').innerHTML = h + '<p><button onclick="window.print()">Print</button> <button class="g" onclick="$(\'dlg\').close()">Close</button></p>'; $('dlg').showModal(); }
function rec(id) { const b = rows.find(r => r.id === id); dlg(`<h3>${b.balance > 0 ? 'Invoice' : 'Receipt'} #${b.id}</h3><p>${esc(nm('patients', b.patient_id))} · ${b.created}</p><table><tr><td>Consultation</td><td>${b.consultation || 0}</td></tr><tr><td>Laboratory</td><td>${b.laboratory || 0}</td></tr><tr><td>Pharmacy</td><td>${b.pharmacy || 0}</td></tr><tr><td>Admission</td><td>${b.admission || 0}</td></tr><tr><th>Total</th><th>LKR ${b.total}</th></tr><tr><td>Paid</td><td>LKR ${b.paid}</td></tr><tr><td>Balance</td><td>LKR ${b.balance}</td></tr></table>`); }
function labRep(id) { const l = rows.find(r => r.id === id); dlg(`<h3>Laboratory report #${l.id}</h3><p>Patient: ${esc(nm('patients', l.patient_id))}<br>Test: ${esc(l.test)}<br>Date: ${l.created}</p><p><b>Result:</b> ${esc(l.result)}</p>`); }
async function hist(id) {
  const h = await api(`patients/${id}/history`), t = (title, a, c) => `<h4>${title}</h4>${a.length ? a.map(c).join('<br>') : '<i>None</i>'}`;
  dlg(`<h3>${esc(nm('patients', id))}</h3>${t('Diagnoses and treatment', h.records, r => `${r.created}: ${esc(r.diagnosis)} / ${esc(r.treatment)} / ${esc(r.prescription)}`)}${t('Lab tests', h.labs, l => `${l.created}: ${esc(l.test)} (${l.status}) ${esc(l.result)}`)}${t('Appointments', h.appointments, a => `${a.date} ${a.time}: ${a.status}`)}${t('Admissions', h.admissions, a => `${a.admitted} → ${a.discharged || 'current'} (${esc(a.ward)})`)}${t('Documents', h.documents, d => `<a href="#" onclick="dl(${d.id});return false">${esc(d.filename)}</a>`)}`);
}
async function dl(id) { const f = await api(`documents/${id}/file`), a = document.createElement('a'); a.href = f.data; a.download = f.filename; a.click(); }
function upl(pid) {
  const i = $('file'); i.value = ''; i.onchange = () => { const f = i.files[0]; if (!f) return; if (f.size > 2e6) return alert('File must be under 2 MB');
    const r = new FileReader(); r.onload = () => api('documents', 'POST', { patient_id: pid, filename: f.name, data: r.result }).then(() => alert('Document uploaded')).catch(e => alert(e.message)); r.readAsDataURL(f); }; i.click();
}
function reports() {
  $('main').innerHTML = `<label>Report<select onchange="rep(this.value)"><option value="">Choose…</option>${['patients','appointments','revenue','pharmacy','laboratory','staff'].map(r => `<option value="${r}">${r[0].toUpperCase() + r.slice(1)}</option>`).join('')}</select></label><div id="rep"></div>`;
}
async function rep(t) {
  if (!t) return; const r = await api('reports/' + t), k = Object.keys(r.rows[0] || {});
  $('rep').innerHTML = `<h3>${r.title}</h3><div class="tw"><table><tr>${k.map(c => `<th>${c}</th>`).join('')}</tr>${r.rows.map(x => `<tr>${k.map(c => `<td>${esc(x[c])}</td>`).join('')}</tr>`).join('')}</table></div><p><button onclick="print()">Print report</button></p>`;
}
function account() {
  $('main').innerHTML = `<h3>Change password</h3><form onsubmit="chg(event)"><label>Current password<input name="old" type="password" required></label><label>New password (6+ characters)<input name="new" type="password" required></label><button>Update password</button></form>`;
}
async function chg(e) { e.preventDefault(); try { await api('password', 'POST', Object.fromEntries(new FormData(e.target))); alert('Password updated'); e.target.reset(); } catch (x) { alert(x.message); } }
