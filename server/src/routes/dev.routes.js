/* DEV-ONLY live database viewer.
   Lets you watch the tables update in real time (e.g. while booking) WITHOUT
   opening DB Browser — which is unsafe to run alongside the server (it corrupts
   the SQLite file). This reads through the server's OWN single connection, so
   there is no second writer and no corruption risk.

   Safety:
   - Disabled entirely in production (returns 404).
   - Read-only, fixed whitelist of SELECTs (no arbitrary SQL).
   - Never exposes password_hash. */

const express = require('express');
const { db } = require('../db');
const { config } = require('../config/env');

const router = express.Router();

// Hard gate: this whole feature does not exist in production.
router.use((req, res, next) => {
    if (config.isProd) return res.status(404).end();
    // This is a local dev tool serving its own inline HTML/JS, so relax the
    // strict security headers helmet set for the API.
    res.removeHeader('Content-Security-Policy');
    next();
});

// Whitelisted, read-only queries. users intentionally omits password_hash.
const TABLES = {
    bookings: 'SELECT id, reference, user_id, doctor_id, booking_date, booking_time, status, payment_status, payment_method, fee_at_booking, refund_amount, cancellation_reason, paid_at, cancelled_at, refund_at, created_at FROM bookings ORDER BY id DESC',
    users: 'SELECT id, name, email, mobile, role, is_active, deleted_at, deletion_reason, created_at FROM users ORDER BY id',
    notifications: 'SELECT id, user_id, booking_id, type, title, body, is_read, dismissed, created_at FROM notifications ORDER BY id DESC LIMIT 100',
    pending_signups: 'SELECT id, email, name, mobile, attempts, resend_count, verified, expires_at, created_at FROM pending_signups ORDER BY id DESC',
    password_resets: 'SELECT id, user_id, attempts, resend_count, verified, expires_at, created_at FROM password_resets ORDER BY id DESC',
    doctors: 'SELECT id, name, specialty, specialty_key, hospital_id, fee, rating, experience_years FROM doctors ORDER BY id',
    doctor_slots: 'SELECT id, doctor_id, slot_time FROM doctor_slots ORDER BY doctor_id, slot_time',
    hospitals: 'SELECT id, name, area, created_at FROM hospitals ORDER BY id',
    audit_log: 'SELECT id, user_id, action, entity, entity_id, detail, created_at FROM audit_log ORDER BY id DESC LIMIT 100'
};

// JSON snapshot of every table (polled by the page below).
router.get('/db.json', async (req, res, next) => {
    try {
        const tables = {};
        for (const [name, sql] of Object.entries(TABLES)) {
            tables[name] = await db.all(sql);
        }
        res.json({ time: new Date().toISOString(), tables });
    } catch (err) {
        next(err);
    }
});

// The live viewer page. Auto-refreshes every 2s.
router.get(['/', '/db'], (req, res) => {
    res.type('html').send(PAGE);
});

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>O-OPD — Live DB Viewer (dev)</title>
<style>
  :root { --teal:#0f766e; --bg:#f8fafc; --line:#e2e8f0; --ink:#0f172a; --muted:#64748b; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:var(--bg); color:var(--ink); }
  header { position:sticky; top:0; background:var(--teal); color:#fff; padding:12px 20px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; box-shadow:0 2px 8px rgba(0,0,0,.12); }
  header h1 { font-size:1.05rem; margin:0; font-weight:700; }
  header .meta { font-size:.8rem; opacity:.9; }
  header label { font-size:.85rem; display:flex; align-items:center; gap:6px; cursor:pointer; }
  .wrap { padding:20px; max-width:1100px; margin:0 auto; }
  .tbl { background:#fff; border:1px solid var(--line); border-radius:12px; margin-bottom:22px; overflow:hidden; }
  .tbl > h2 { margin:0; padding:12px 16px; font-size:.95rem; background:#f1f5f9; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; }
  .tbl > h2 .count { color:var(--muted); font-weight:500; }
  .scroll { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:.84rem; }
  th, td { text-align:left; padding:8px 12px; border-bottom:1px solid var(--line); white-space:nowrap; }
  th { color:var(--muted); font-weight:600; background:#fafcff; position:sticky; top:0; }
  tr:last-child td { border-bottom:none; }
  .empty { padding:14px 16px; color:var(--muted); font-style:italic; }
  .badge { padding:2px 8px; border-radius:999px; font-size:.75rem; font-weight:600; }
  .badge.booked { background:#dcfce7; color:#166534; }
  .badge.cancelled { background:#fee2e2; color:#991b1b; }
  .badge.completed { background:#dbeafe; color:#1e40af; }
  .flash { animation: flash 1s ease; }
  @keyframes flash { from { background:#fef9c3; } to { background:transparent; } }
</style>
</head>
<body>
<header>
  <h1>🗄️ O-OPD Live DB Viewer</h1>
  <span class="meta" id="meta">connecting…</span>
  <span class="meta">· timestamps shown in IST (Asia/Kolkata)</span>
  <label style="margin-left:auto;"><input type="checkbox" id="auto" checked> Auto-refresh (2s)</label>
  <button id="refresh" style="padding:5px 12px;border:0;border-radius:6px;cursor:pointer;">Refresh now</button>
</header>
<div class="wrap" id="root">Loading…</div>
<script src="/__dev/viewer.js"></script>
</body>
</html>`;

// External script (helmet's default script-src 'self' allows same-origin files).
router.get('/viewer.js', (req, res) => {
    res.type('application/javascript').send(VIEWER_JS);
});

const VIEWER_JS = `
const root = document.getElementById('root');
const meta = document.getElementById('meta');
const auto = document.getElementById('auto');
let prev = {};

function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function statusBadge(s){ return '<span class="badge ' + esc(s) + '">' + esc(s) + '</span>'; }

// Timestamps are stored as IST text "YYYY-MM-DD HH:MM:SS". Parse them as +05:30
// and render in IST. Other columns are shown as-is (booking_date / booking_time
// / slot_time are plain calendar values).
function fmtCell(col, val){
  const isStamp = /_at$/.test(col) && /^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/.test(String(val||''));
  if (!isStamp) return esc(val);
  const d = new Date(String(val).replace(' ', 'T') + '+05:30');
  if (isNaN(d)) return esc(val);
  return esc(d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true
  }));
}

function renderTable(name, rows){
  const cols = rows.length ? Object.keys(rows[0]) : [];
  let html = '<div class="tbl"><h2>' + esc(name) + ' <span class="count">' + rows.length + ' row' + (rows.length===1?'':'s') + '</span></h2>';
  if (!rows.length){ html += '<div class="empty">No rows yet.</div></div>'; return html; }
  html += '<div class="scroll"><table><thead><tr>' + cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>';
  const prevIds = new Set((prev[name]||[]).map(r => JSON.stringify(r)));
  for (const r of rows){
    const isNew = !prevIds.has(JSON.stringify(r));
    html += '<tr class="' + (isNew ? 'flash' : '') + '">' + cols.map(c => {
      if (c === 'status') return '<td>' + statusBadge(r[c]) + '</td>';
      return '<td>' + fmtCell(c, r[c]) + '</td>';
    }).join('') + '</tr>';
  }
  html += '</tbody></table></div></div>';
  return html;
}

async function load(){
  try {
    const res = await fetch('/__dev/db.json', { cache: 'no-store' });
    const data = await res.json();
    const order = ['bookings','notifications','pending_signups','password_resets','users','doctors','doctor_slots','hospitals','audit_log'];
    root.innerHTML = order.map(n => renderTable(n, data.tables[n] || [])).join('');
    prev = data.tables;
    meta.textContent = 'updated ' + new Date(data.time).toLocaleTimeString();
  } catch (e){
    meta.textContent = 'server not reachable — is it running?';
  }
}

document.getElementById('refresh').addEventListener('click', load);
let timer = setInterval(() => { if (auto.checked) load(); }, 2000);
load();
`;

module.exports = router;
