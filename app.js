(function () {
"use strict";
var CFG = window.SOX_CONFIG || {}, sb = null;
var S = { user: null, client: null, customers: [], quotes: [], invoices: [], log: [], tab: "today", qf: "all", inf: "open", busy: false };
var $ = function (s) { return document.querySelector(s); };

/* ---------- small helpers ---------- */
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); }
function money(n) { return Number(n || 0).toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function tzOf() { var z = (S.client && S.client.timezone) || "Australia/Brisbane"; try { new Intl.DateTimeFormat("en-CA", { timeZone: z }); return z; } catch (e) { return "Australia/Brisbane"; } }
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: tzOf() }).format(new Date()); }
function addDays(iso, n) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5); }
function fmtDate(iso) { if (!iso) return ""; return new Date(String(iso).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }); }
function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
function firstName(n) { var p = String(n || "").trim().split(/\s+/).filter(Boolean); if (!p.length) return "there"; return (/^(mr|mrs|ms|miss|mx|dr|prof)\.?$/i.test(p[0]) && p[1]) ? p[0] + " " + p[1] : p[0]; }
function toast(msg) { var t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("on"); }, 2600); }
function nextNumber(rows) { var m = 0; rows.forEach(function (r) { var n = parseInt(String(r.number || "").replace(/\D/g, ""), 10); if (n > m) m = n; }); return String(m + 1).padStart(4, "0"); }
function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
function check(res) { if (res && res.error) throw new Error(res.error.message || "Something went wrong"); return res ? res.data : null; }
var ICON = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  quotes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  invoices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  customers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.7c1.9.6 3.2 2.3 3.5 4.8"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 14l4-5"/><circle cx="12" cy="14" r="1"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>'
};

/* ---------- start ---------- */
function init() {
  if (!window.supabase) return fatal("Couldn't load. Check your internet and refresh.");
  if (!CFG.supabaseAnonKey || /PASTE/.test(CFG.supabaseAnonKey)) return fatal("This app isn't connected yet. The public key is missing in config.js.");
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  var rec = /type=(recovery|invite)/.test(String(location.hash || ""));
  sb.auth.getSession().then(function (r) { var s = r && r.data && r.data.session; if (rec) return showSetPassword(!!s); if (s) start(s.user); else showLogin(); });
  if (sb.auth.onAuthStateChange) sb.auth.onAuthStateChange(function (ev) { if (ev === "PASSWORD_RECOVERY") showSetPassword(true); });
}
function fatal(msg) { $("#app").innerHTML = '<div class="fatal"><h2>Not ready</h2><p>' + esc(msg) + '</p></div>'; }
function showLogin(err, email) {
  $("#app").innerHTML = '<div class="login"><form class="box" data-form="login"><img src="sox-icon.svg" alt=""><h1>Sign in</h1><p>Use your email and password.</p>' +
    '<label>Email<input type="email" name="email" autocomplete="username" value="' + esc(email || "") + '" required></label>' +
    '<label>Password<input type="password" name="password" autocomplete="current-password" required></label>' +
    (err ? '<div class="err" role="alert">' + esc(err) + '</div>' : '') +
    '<div style="margin-top:20px"><button class="btn pri block" type="submit">Sign in</button></div><p style="text-align:center;margin:14px 0 0"><button class="btn ghost small" type="button" data-act="forgot">Forgot your password?</button></p><p style="text-align:center;margin:8px 0 0" class="hint"><a href="terms.html" target="_blank" rel="noopener">Terms</a></p></form></div>';
}
function showForgot(msg, email) {
  $("#app").innerHTML = '<div class="login"><form class="box" data-form="forgot"><img src="sox-icon.svg" alt=""><h1>Reset your password</h1><p>Type your email. We\'ll send you a link to choose a new password.</p>' +
    '<label>Email<input type="email" name="email" autocomplete="username" value="' + esc(email || "") + '" required></label>' +
    (msg ? '<div class="ok-note" role="status">' + esc(msg) + '</div>' : '') +
    '<div style="margin-top:20px"><button class="btn pri block" type="submit">Send me the link</button></div><p style="text-align:center;margin:14px 0 0"><button class="btn ghost small" type="button" data-act="to-login">Back to sign in</button></p></form></div>';
}
function showSetPassword(hasSession, err) {
  if (!hasSession) { $("#app").innerHTML = '<div class="fatal"><h2>That link has run out</h2><p>Links only work for a short time and only once. Ask for a new one.</p><p><button class="btn pri" data-act="forgot">Send me a new link</button></p></div>'; return; }
  $("#app").innerHTML = '<div class="login"><form class="box" data-form="setpw"><img src="sox-icon.svg" alt=""><h1>Choose your password</h1><p>At least 8 characters. Only you will know it.</p>' +
    '<label>New password<input type="password" name="pw" autocomplete="new-password" minlength="8" required></label>' +
    '<label>Type it again<input type="password" name="pw2" autocomplete="new-password" minlength="8" required></label>' +
    (err ? '<div class="err" role="alert">' + esc(err) + '</div>' : '') +
    '<div style="margin-top:20px"><button class="btn pri block" type="submit">Save my password</button></div></form></div>';
}
function passwordForm(err) {
  openSheet('<form data-form="changepw"><h2>Change your password</h2><p class="sub">At least 8 characters.</p>' +
    '<label>New password<input type="password" name="pw" autocomplete="new-password" minlength="8" required></label>' +
    '<label>Type it again<input type="password" name="pw2" autocomplete="new-password" minlength="8" required></label>' +
    '<div class="btns"><button class="btn pri" type="submit">Save password</button><button class="btn ghost" type="button" data-act="close-sheet">Cancel</button></div></form>');
}
function pwCheck(fd) {
  var a = String(fd.get("pw") || ""), b = String(fd.get("pw2") || "");
  if (a.length < 8) return "Use at least 8 characters.";
  if (a !== b) return "The two passwords don't match.";
  return "";
}
function start(user) {
  S.user = user;
  loadAll().then(function () {
    if (!S.client) { $("#app").innerHTML = '<div class="fatal"><h2>Account not set up yet</h2><p>You\'re signed in, but your business isn\'t set up. Please contact SOX Management.</p><p><button class="btn" data-act="signout">Sign out</button></p></div>'; return; }
    try { sb.from("clients").update({ last_seen: new Date().toISOString() }).eq("id", user.id).then(function () { }, function () { }); } catch (e) { }   // so we can see when you were last in
    render();
  }).catch(function (e) { fatal("Couldn't load your data. " + e.message); });
}
function loadAll() {
  var id = S.user.id;
  return Promise.all([
    sb.from("clients").select("*").eq("id", id).maybeSingle(),
    sb.from("customers").select("*").eq("client_id", id).order("name", { ascending: true }),
    sb.from("quotes").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    sb.from("invoices").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    sb.from("message_log").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(40)
  ]).then(function (r) {
    S.client = check(r[0]); S.customers = check(r[1]) || []; S.quotes = check(r[2]) || []; S.invoices = check(r[3]) || []; S.log = check(r[4]) || [];
  });
}
function reload(what) { return loadAll().then(function () { render(); }); }

/* ---------- screens ---------- */
function render() {
  var c = S.client, t = S.tab;
  if (!c.onboarded) { $("#app").innerHTML = vOnboard(); return; }
  var tabs = [["today", "Today"], ["quotes", "Quotes"], ["invoices", "Invoices"], ["customers", "Customers"], ["more", "More"]];
  var premium = c.plan === "premium";
  if (premium) tabs.splice(1, 0, ["dash", "Dashboard"]);
  if (t === "dash" && !premium) t = S.tab = "today";
  var banner = "";
  var auto = c.plan === "premium";
  if (auto && c.paused) banner += '<div class="banner pause"><span><b>Paused.</b> Nothing is being sent.</span><button class="btn small" data-act="resume">Resume</button></div>';
  if (auto && c.test_mode) banner += '<div class="banner test"><b>Test mode.</b> Messages only go to you, never to your customers.</div>';
  var body = t === "dash" ? vDash() : t === "today" ? vToday() : t === "quotes" ? vQuotes() : t === "invoices" ? vInvoices() : t === "customers" ? vCustomers() : vMore();
  $("#app").innerHTML =
    '<header class="top"><div class="wrap">' + (c.logo ? logoImg("hlogo") : '<img src="sox-icon.svg" alt="">') + '<div class="name">' + esc(c.business_name) + '</div></div></header>' +
    '<main class="wrap' + (t === "dash" ? " full" : "") + '">' + banner + body + '</main>' +
    '<nav class="tabs" aria-label="Main"><div class="in" style="--n:' + tabs.length + '">' + tabs.map(function (x) {
      return '<button data-act="tab" data-v="' + x[0] + '"' + (t === x[0] ? ' aria-current="page"' : '') + '>' + ICON[x[0]] + x[1] + '</button>';
    }).join("") + '</div></nav>';
  if (t === "dash") startDash();
}
function overdueDays(i) { return i.status === "unpaid" && i.due ? daysBetween(i.due, today()) : -1; }
function vToday() {
  var td = today();
  var open = S.invoices.filter(function (i) { return i.status === "unpaid"; });
  var owed = open.reduce(function (a, i) { return a + Number(i.amount || 0); }, 0);
  var late = open.filter(function (i) { return overdueDays(i) > 0; }).sort(function (a, b) { return overdueDays(b) - overdueDays(a); });
  var lateSum = late.reduce(function (a, i) { return a + Number(i.amount || 0); }, 0);
  var waiting = S.quotes.filter(function (q) { return q.status === "sent" || q.status === "followup"; });
  var waitSum = waiting.reduce(function (a, q) { return a + Number(q.value || 0); }, 0);
  var h = '<div class="tiles">' +
    '<div class="tile wide"><div class="k">Owed to you</div><div class="v">' + money(owed) + '</div><div class="s">' + plural(open.length, "unpaid invoice") + '</div></div>' +
    '<div class="tile' + (late.length ? " bad" : "") + '"><div class="k">Overdue</div><div class="v">' + money(lateSum) + '</div><div class="s">' + plural(late.length, "invoice") + '</div></div>' +
    '<div class="tile"><div class="k">Quotes waiting</div><div class="v">' + waiting.length + '</div><div class="s">' + money(waitSum) + '</div></div></div>';
  h += '<h2>Needs you</h2>';
  var items = "";
  S.invoices.filter(function (i) { return i.status === "draft"; }).slice(0, 5).forEach(function (i) {
    items += '<div class="row"><div class="top-line"><div><div class="t">' + esc(i.customer || "Customer") + '</div><div class="m">Invoice ' + esc(i.number || "") + ' is waiting for your OK</div></div><div class="amt">' + money(i.amount) + '</div></div><div class="acts"><button class="btn pri small" data-act="inv-view" data-id="' + i.id + '">Review and approve</button></div></div>';
  });
  late.slice(0, 5).forEach(function (i) {
    items += '<div class="row"><div class="top-line"><div><div class="t">' + esc(i.customer || "Customer") + '</div><div class="m">Invoice ' + esc(i.number || "") + ' · ' + plural(overdueDays(i), "day") + ' overdue</div></div><div class="amt">' + money(i.amount) + '</div></div>' +
      '<div class="acts"><button class="btn pri small" data-act="inv-paid" data-id="' + i.id + '">Mark as paid</button></div></div>';
  });
  waiting.filter(function (q) { return q.sent && daysBetween(q.sent, td) >= 2; }).slice(0, 5).forEach(function (q) {
    items += '<div class="row"><div class="top-line"><div><div class="t">' + esc(q.customer || "Customer") + ' · ' + esc(q.job || "") + '</div><div class="m">Quote sent ' + plural(daysBetween(q.sent, td), "day") + ' ago, no answer yet</div></div><div class="amt">' + money(q.value) + '</div></div>' +
      '<div class="acts"><button class="btn pri small" data-act="q-approved" data-id="' + q.id + '">They said yes</button><button class="btn small" data-act="q-lost" data-id="' + q.id + '">Lost it</button></div></div>';
  });
  if (!items) items = S.quotes.length || S.invoices.length ? '<div class="empty">Nothing needs you right now.</div>'
    : '<div class="empty"><b>Welcome.</b><br>Start by adding a customer, then a quote.<br><br><button class="btn pri" data-act="new-quote">Add your first quote</button></div>';
  return h + items;
}
function qStatus(q) {
  var d = q.sent ? daysBetween(q.sent, today()) : 0;
  if (q.status === "draft") return ['Draft', 'grey'];
  if (q.status === "approved") return ['Approved', 'ok'];
  if (q.status === "lost") return ['Lost', 'bad'];
  if (q.status === "followup") return ['Following up · sent ' + plural(d, "day") + ' ago', 'amber'];
  return ['Sent ' + plural(d, "day") + ' ago', ''];
}
function vQuotes() {
  var f = S.qf, list = S.quotes.filter(function (q) { return f === "all" || (f === "open" ? (q.status === "sent" || q.status === "followup") : q.status === f); });
  var chips = [["all", "All"], ["draft", "Drafts"], ["open", "Waiting"], ["approved", "Approved"], ["lost", "Lost"]];
  var h = '<div class="head-row"><h2>Quotes</h2><button class="btn pri small" data-act="new-quote">+ New quote</button></div><div class="chips" role="group" aria-label="Filter">' +
    chips.map(function (c) { return '<button data-act="qf" data-v="' + c[0] + '" aria-pressed="' + (f === c[0]) + '">' + c[1] + '</button>'; }).join("") + '</div>';
  if (!list.length) return h + '<div class="empty">No quotes here yet.</div>';
  return h + list.map(function (q) {
    var st = qStatus(q), a = "";
    if (q.status === "draft") a = canSend() ? '<button class="btn pri small" data-act="q-send-ask" data-id="' + q.id + '">Send to customer</button><button class="btn small" data-act="q-sent" data-id="' + q.id + '">Mark as sent</button>' : '<button class="btn pri small" data-act="q-sent" data-id="' + q.id + '">Mark as sent</button>';
    if (q.status === "sent" || q.status === "followup") a = '<button class="btn pri small" data-act="q-approved" data-id="' + q.id + '">They said yes</button><button class="btn small" data-act="q-lost" data-id="' + q.id + '">Lost it</button>';
    if (q.status === "approved") { var ex = S.invoices.filter(function (x) { return x.quote_id === q.id && x.status !== "void"; })[0]; a = ex ? '<button class="btn pri small" data-act="inv-view" data-id="' + ex.id + '">View invoice</button>' : '<button class="btn pri small" data-act="q-invoice" data-id="' + q.id + '">Make invoice</button>'; }
    a = '<button class="btn small" data-act="q-view" data-id="' + q.id + '">View quote</button>' + a;
    a += '<button class="btn small ghost" data-act="q-copy" data-id="' + q.id + '">Copy message</button><button class="btn small ghost" data-act="q-edit" data-id="' + q.id + '">Edit</button>';
    return '<div class="row"><div class="top-line"><div><div class="t">' + esc(q.customer || "No customer") + '</div><div class="m">' + esc(q.job || "") + (q.number ? ' · #' + esc(q.number) : "") + '</div><span class="tag ' + st[1] + '">' + esc(st[0]) + '</span></div><div class="amt">' + money(q.value) + '</div></div><div class="acts">' + a + '</div></div>';
  }).join("");
}
function vInvoices() {
  var f = S.inf, list = S.invoices.filter(function (i) { return f === "all" || (f === "open" ? (i.status === "unpaid" || i.status === "draft") : i.status === f); });
  var chips = [["open", "Unpaid"], ["paid", "Paid"], ["all", "All"]];
  var h = '<div class="head-row"><h2>Invoices</h2><button class="btn pri small" data-act="new-invoice">+ New invoice</button></div><div class="chips" role="group" aria-label="Filter">' +
    chips.map(function (c) { return '<button data-act="inf" data-v="' + c[0] + '" aria-pressed="' + (f === c[0]) + '">' + c[1] + '</button>'; }).join("") + '</div>';
  if (!list.length) return h + '<div class="empty">No invoices here.</div>';
  return h + list.map(function (i) {
    var od = overdueDays(i), tag;
    if (i.status === "draft") tag = '<span class="tag amber">Draft · needs your approval</span>';
    else if (i.status === "paid") tag = '<span class="tag ok">Paid' + (i.paid_at ? ' ' + esc(fmtDate(i.paid_at)) : '') + '</span>';
    else if (i.status === "void") tag = '<span class="tag grey">Cancelled</span>';
    else if (od > 0) tag = '<span class="tag bad">' + plural(od, "day") + ' overdue</span>';
    else if (od === 0) tag = '<span class="tag amber">Due today</span>';
    else tag = '<span class="tag">Due in ' + plural(-od, "day") + '</span>';
    var a = i.status === "draft" ? '<button class="btn pri small" data-act="inv-view" data-id="' + i.id + '">Review and approve</button><button class="btn small ghost" data-act="inv-edit" data-id="' + i.id + '">Edit</button><button class="btn small ghost" data-act="inv-void" data-id="' + i.id + '">Delete draft</button>' : i.status === "unpaid" ? '<button class="btn small" data-act="inv-view" data-id="' + i.id + '">View invoice</button><button class="btn pri small" data-act="inv-paid" data-id="' + i.id + '">Mark as paid</button><button class="btn small ghost" data-act="inv-edit" data-id="' + i.id + '">Edit</button><button class="btn small ghost" data-act="inv-void" data-id="' + i.id + '">Cancel invoice</button>' : "";
    return '<div class="row"><div class="top-line"><div><div class="t">' + esc(i.customer || "No customer") + '</div><div class="m">Invoice ' + esc(i.number || "") + (i.due ? ' · due ' + esc(fmtDate(i.due)) : "") + '</div>' + tag + '</div><div class="amt">' + money(i.amount) + '</div></div>' + (a ? '<div class="acts">' + a + '</div>' : "") + '</div>';
  }).join("");
}
function vCustomers() {
  var h = '<div class="head-row"><h2>Customers</h2><button class="btn pri small" data-act="new-customer">+ Add</button></div>';
  if (!S.customers.length) return h + '<div class="empty">No customers yet.</div>';
  return h + S.customers.map(function (c) {
    return '<div class="row"><div class="top-line"><div><div class="t">' + esc(c.name) + '</div><div class="m">' + esc([c.phone, c.email].filter(Boolean).join(" · ") || "No contact details") + '</div>' + (c.opted_out ? '<span class="tag bad">Do not message</span>' : "") + '</div><button class="btn small ghost" data-act="cust-edit" data-id="' + c.id + '">Edit</button></div></div>';
  }).join("");
}
var KIND = { quote_followup: "Quote follow-up", invoice_chase: "Invoice reminder", safety_check: "Check with you" };

/* ---------- Premium dashboard: Command ---------- */
var GX = 160, GY = 168, GR = 132;
function gp(deg, r) { var t = deg * Math.PI / 180; return [GX + r * Math.cos(t), GY + r * Math.sin(t)]; }
function garc(a1, a2, r) { var p = gp(a1, r), q = gp(a2, r); return "M" + p[0].toFixed(1) + " " + p[1].toFixed(1) + " A" + r + " " + r + " 0 0 1 " + q[0].toFixed(1) + " " + q[1].toFixed(1); }
function dashData() {
  var td = today(), m = td.slice(0, 7), c = S.client;
  var inM = function (d) { return d && String(d).slice(0, 7) === m; };
  var sent = S.quotes.filter(function (q) { return q.status !== "draft" && inM(q.sent); });
  var won = S.quotes.filter(function (q) { return q.status === "approved" && inM(q.accepted_at || q.sent); });
  var paidInv = S.invoices.filter(function (i) { return i.status === "paid" && inM(i.paid_at); });
  var open = S.invoices.filter(function (i) { return i.status === "unpaid"; });
  var late = open.filter(function (i) { return overdueDays(i) > 0; });
  var sum = function (a, f) { return a.reduce(function (x, r) { return x + Number(f(r) || 0); }, 0); };
  var rev = sum(paidInv, function (i) { return i.amount; }), unpaid = sum(open, function (i) { return i.amount; }), lateSum = sum(late, function (i) { return i.amount; });
  var goal = Number(c.revenue_goal) || 10000, qt = Number(c.quotes_target) || 20;
  var feed = [];
  S.invoices.forEach(function (i) { if (i.status === "paid" && i.paid_at) feed.push([String(i.paid_at).slice(0, 10), "INVOICE PAID  " + money(i.amount)]); });
  S.quotes.forEach(function (q) { if (q.status !== "draft" && q.sent) feed.push([q.sent, "QUOTE SENT  #" + (q.number || "") + "  " + money(q.value)]); if (q.status === "approved") feed.push([String(q.accepted_at || q.sent).slice(0, 10), "JOB WON  " + (q.job || "")]); });
  feed.sort(function (a, b) { return a[0] < b[0] ? 1 : -1; });
  return { rev: rev, goal: goal, unpaid: unpaid, late: late.length, lateSum: lateSum, sent: sent.length, qt: qt, won: won.length, paidCount: paidInv.length, openCount: open.length,
    winPct: sent.length ? Math.round(won.length / sent.length * 100) : 0, feed: feed.slice(0, 6), month: new Date(td + "T00:00:00Z").toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }) };
}
function ring(f, tone) {
  f = Math.max(0, Math.min(1, f)); var C = 2 * Math.PI * 15;
  return '<svg class="ring ' + (tone || "") + '" viewBox="0 0 40 40" aria-hidden="true"><circle class="rt" cx="20" cy="20" r="15"/><circle class="rv" cx="20" cy="20" r="15" stroke-dasharray="' + (C * f).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 20 20)"/></svg>';
}
function drow(label, f, val, tone) {
  return '<div class="drow">' + ring(f, tone) + '<div class="dl"><div class="dk">' + esc(label) + '</div><div class="dp ' + (tone || "") + '">' + Math.round(Math.max(0, f) * 100) + '%</div></div><div class="dv">' + val + '</div></div>';
}
function vDash() {
  var d = dashData(), svg = "", i, f = Math.max(0, Math.min(1, d.rev / d.goal)), pct = Math.round(d.rev / d.goal * 100);
  svg += '<defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#1d5df0"/><stop offset="1" stop-color="#3fd0ff"/></linearGradient></defs>';
  svg += '<path class="gtrack" d="' + garc(180, 360, GR) + '"/>';
  for (i = 0; i <= 40; i++) { var a = 180 + 180 * i / 40, p1 = gp(a, GR - 16), p2 = gp(a, GR - (i % 10 ? 21 : 27)); svg += '<line class="gtk' + (i % 10 ? "" : " big") + '" x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) + '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) + '"/>'; }
  svg += '<path id="gval" class="gval" d="' + garc(180, 180.01, GR) + '"/>';
  return '<div class="dash"><div class="dh"><span class="eyebrow">COMMAND</span><span class="pill">' + esc(d.month) + '</span></div>' +
    '<div class="gwrap"><svg viewBox="0 0 320 190" role="img" aria-label="Revenue this month ' + money(d.rev) + ', ' + pct + ' percent of your ' + money(d.goal) + ' goal">' + svg + '</svg>' +
    '<div class="read"><div class="big" id="bigNum">' + money(0) + '</div><div class="cap">REVENUE · ' + pct + '% OF ' + money(d.goal) + ' GOAL</div></div></div>' +
    '<div class="drows">' + drow("QUOTES SENT", d.sent / d.qt, d.sent) + drow("JOBS WON", d.winPct / 100, d.won) + drow("INVOICES PAID", d.paidCount / Math.max(1, d.paidCount + d.openCount), d.paidCount) + drow("INVOICES UNPAID", d.unpaid ? d.lateSum / d.unpaid : 0, money(d.unpaid), d.late ? "hot" : "") + '</div>' +
    '<div class="ticker" aria-label="Recent activity"><span class="live">● LIVE</span><div class="tk-win"><div class="tk-run">' + (d.feed.length ? d.feed.map(function (x) { return esc(x[1]); }).join("     ·     ") : "NO ACTIVITY YET") + '</div></div></div>' +
    '<p class="dnote">Revenue is invoices marked paid this month. Your monthly goal is set up by SOX Management.</p></div>';
}
function startDash() {
  var d = dashData(), arc = $("#gval"), num = $("#bigNum"); if (!arc) return;
  var f = Math.max(0, Math.min(1, d.rev / d.goal)), run = ++startDash.id, peak = Math.min(1, f + 0.15);
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function set(x) { arc.setAttribute("d", garc(180, 180 + Math.max(180 * x, 0.01), GR)); num.textContent = money(f ? Math.round(d.rev * Math.min(x / f, 1)) : 0); }
  if (reduce) return set(f);
  set(0); var t0 = performance.now(), ease = function (k) { return 1 - Math.pow(1 - k, 3); };
  /* quick rev-up past the real value, then settle on it */
  function frame(now) {
    if (run !== startDash.id || !$("#gval")) return;
    var e = (now - t0) / 1000;
    if (e < 0.7) set(peak * ease(e / 0.7)); else if (e < 1.3) set(peak + (f - peak) * ease((e - 0.7) / 0.6)); else return set(f);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
startDash.id = 0;
function vMore() {
  var c = S.client, h = '<h2>More</h2>';
  var auto = c.plan === "premium";
  if (auto) h += '<div class="row"><div class="sw"><div><div class="t">Pause everything</div><div class="m">Stops all messages straight away.</div></div><button class="btn small ' + (c.paused ? "pri" : "danger") + '" data-act="' + (c.paused ? "resume" : "pause") + '">' + (c.paused ? "Resume" : "Pause") + '</button></div></div>';
  if (auto) h += '<div class="row"><div class="t">Your timing</div><div class="m">Quotes: we follow up on day ' + esc((c.quote_steps || []).join(", ")) + ' after you send. Invoices: day ' + esc((c.invoice_steps || []).join(", ")) + ' after the due date. To change this, ask us.</div></div>';
  h += '<div class="row"><div class="top-line"><div><div class="t">Your details</div><div class="m">' + esc([c.owner_name, c.phone, c.email].filter(Boolean).join(" · ")) + '</div></div><button class="btn small ghost" data-act="settings">Edit</button></div></div>';
  h += '<div class="row"><div class="top-line"><div><div class="t">Password</div><div class="m">Choose a new one any time.</div></div><button class="btn small ghost" data-act="change-pw">Change</button></div></div>';
  h += '<p class="hint" style="margin:10px 2px 0"><a href="terms.html" target="_blank" rel="noopener">Terms and conditions</a></p>';
  var ALLOW = { elevate: 100, premium: 300 };
  if (ALLOW[c.plan]) {
    var allow = ALLOW[c.plan], stop = c.text_cap != null ? c.text_cap : allow + 100;
    var used = c.texts_month === today().slice(0, 7) ? (c.texts_used || 0) : 0, pct = Math.min(100, Math.round(used / allow * 100));
    var warn = used >= Math.ceil(allow * 0.8);
    h += '<div class="row"><div class="top-line"><div class="t">Texts this month</div><div class="t">' + used + ' of ' + allow + '</div></div>' +
      '<div style="height:10px;border-radius:99px;background:rgba(255,255,255,.08);margin:10px 0;overflow:hidden"><div style="height:100%;width:' + pct + '%;border-radius:99px;background:' + (used >= stop ? "var(--bad,#ff5a5f)" : warn ? "var(--warn,#ffb020)" : "linear-gradient(90deg,#2A6BFF,#35B4FF)") + '"></div></div>' +
      '<div class="m">' + (used >= stop ? "You\'ve hit the limit, so texts are paused until next month. Emails still go. Get in touch if you need more." : warn ? "You\'re nearly out of included texts. Extra texts are 25 cents each, and we stop at " + stop + " a month." : "Extra texts are 25 cents each, added to your next bill. We stop at " + stop + " a month to keep your bill safe.") + '</div></div>';
  }
  var UP = { basic: ["Elevate", "$49/month", "Your quotes and invoices send themselves to your customer once you approve them, and you get about 100 texts a month."], elevate: ["Premium", "$99/month", "Adds automatic quote follow-ups, invoice reminders, the safety check, review texts after each paid job, and the Command dashboard."] };
  if (UP[c.plan]) h += '<div class="row" style="margin-top:20px"><div class="t">Upgrade to ' + UP[c.plan][0] + ' <span class="m">' + UP[c.plan][1] + '</span></div><div class="m" style="margin:4px 0 10px">' + UP[c.plan][2] + '</div><a class="btn pri block" style="text-align:center;text-decoration:none;padding-top:12px;padding-bottom:12px" href="mailto:scott@soxmanagement.com?subject=' + encodeURIComponent("Upgrade to " + UP[c.plan][0]) + '">Ask to upgrade</a></div>';
  h += '<div class="row" style="margin-top:20px"><div class="t">Get in touch</div><div class="m" style="margin:4px 0 10px">Questions, or want something changed? Call or email us.</div><div style="display:flex;gap:14px;flex-wrap:wrap"><a class="btn pri" style="flex:1 1 200px;text-align:center;text-decoration:none" href="tel:0426621310">Call us</a><a class="btn" style="flex:1 1 200px;text-align:center;text-decoration:none" href="mailto:scott@soxmanagement.com">Email us</a></div></div>';
  if (auto) {
  h += '<h3>What we\'ve sent</h3>';
  if (!S.log.length) h += '<div class="empty">Nothing yet.</div>';
  else h += S.log.map(function (l) {
    var st = l.status === "test" ? ['Test only, not sent', 'amber'] : l.status === "sent" ? ['Sent', 'ok'] : l.status === "failed" ? ['Failed', 'bad'] : [l.status, 'grey'];
    return '<div class="row"><div class="t">' + esc(KIND[l.kind] || l.kind) + '</div><div class="m">' + esc(fmtDate(l.created_at)) + ' · to ' + esc(l.to_address || "") + '</div><div class="m" style="margin-top:4px">' + esc(String(l.body || "").slice(0, 140)) + (String(l.body || "").length > 140 ? "…" : "") + '</div><span class="tag ' + st[1] + '">' + esc(st[0]) + '</span></div>';
  }).join("");
  }
  h += '<div style="margin-top:28px"><button class="btn block" data-act="signout">Sign out</button></div>';
  return h;
}

/* ---------- sheets ---------- */
function openSheet(html) { $("#sheet").innerHTML = html; $("#sheet-wrap").hidden = false; var f = $("#sheet input:not([type=hidden]),#sheet select,#sheet textarea"); if (f) setTimeout(function () { try { f.focus(); } catch (e) { } }, 30); }
function closeSheet() { $("#sheet-wrap").hidden = true; $("#sheet").innerHTML = ""; }
function sheetErr(msg) { var e = $("#sheet .err"); if (!e) { e = document.createElement("div"); e.className = "err"; e.setAttribute("role", "alert"); var b = $("#sheet .btns"); b.parentNode.insertBefore(e, b); } e.textContent = msg; }
function custPicker(sel) {
  return '<label>Customer<select name="customer_id" id="custSel"><option value="">Choose…</option>' + S.customers.map(function (c) { return '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + '>' + esc(c.name) + '</option>'; }).join("") + '<option value="__new">+ Add a new customer</option></select></label>' +
    '<div id="newCust" class="hidden"><label>Customer name<input type="text" name="n_name" autocomplete="off"></label><label>Mobile<input type="tel" name="n_phone"></label><label>Email<input type="email" name="n_email"></label></div>';
}
function customerForm(c) {
  openSheet('<form data-form="customer" data-id="' + (c ? c.id : "") + '"><h2>' + (c ? "Edit customer" : "New customer") + '</h2>' +
    '<label>Name<input type="text" name="name" value="' + esc(c ? c.name : "") + '" required autocomplete="off"></label>' +
    '<label>Mobile<input type="tel" name="phone" value="' + esc(c ? c.phone : "") + '"></label>' +
    '<label>Email<input type="email" name="email" value="' + esc(c ? c.email : "") + '"></label>' +
    '<label>Address<input type="text" name="address" value="' + esc(c ? c.address : "") + '"></label>' +
    '<label class="check"><input type="checkbox" name="opted_out"' + (c && c.opted_out ? " checked" : "") + '><span>Do not message this customer<br><span class="hint">Use this if they ask to stop. We will skip them.</span></span></label>' +
    '<div class="btns"><button class="btn pri" type="submit">Save</button><button class="btn ghost" type="button" data-act="close-sheet">Cancel</button></div>' +
    (c ? '<p style="margin-top:18px"><button class="btn danger small" type="button" data-act="cust-delete-ask" data-id="' + c.id + '">Delete this customer</button></p>' : "") + '</form>');
}
function askSheet(title, text, act, id, label) {
  openSheet('<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p><div class="btns"><button class="btn danger" data-act="' + act + '" data-id="' + id + '">' + esc(label) + '</button><button class="btn ghost" data-act="close-sheet">Keep it</button></div>');
}
function copySheet(q) {
  var cust = byId(S.customers, q.customer_id), c = S.client;
  var txt = "Hi " + firstName(cust ? cust.name : q.customer) + ", thanks for having us look at " + (q.job || "your job") + ". Our quote is " + money(q.value) + ". To go ahead, just reply \"Approved\". Cheers, " + (c.owner_name ? c.owner_name + " from " : "") + c.business_name;
  openSheet('<h2>Message for your customer</h2><p class="sub">Copy this and send it by text or email.</p><textarea class="copy" id="copyTxt" readonly>' + esc(txt) + '</textarea><div class="btns"><button class="btn pri" data-act="copy-do">Copy</button><button class="btn ghost" data-act="close-sheet">Close</button></div>');
}

function canSend() { return !!(S.client && (S.client.plan === "elevate" || S.client.plan === "premium")); }
function sendAsk(id) {
  var q = byId(S.quotes, id), cust = q && byId(S.customers, q.customer_id), c = S.client;
  if (!q) return;
  var via = cust ? (cust.phone ? "a text to " + cust.phone : cust.email ? "an email to " + cust.email : "") : "";
  if (!via) return openSheet('<h2>Add their contact first</h2><p>' + (cust ? esc(cust.name) + " has no mobile or email saved." : "This quote has no customer attached.") + ' Edit it and add one, then try again.</p><div class="btns"><button class="btn ghost" data-act="close-sheet">Close</button></div>');
  if (cust.opted_out) return openSheet('<h2>Can\'t send this one</h2><p>' + esc(cust.name) + ' asked us not to message them.</p><div class="btns"><button class="btn ghost" data-act="close-sheet">Close</button></div>');
  var note = c.test_mode ? '<p class="sub">Your account is in test mode, so this goes to you only, not ' + esc(cust.name) + '.</p>' : "";
  openSheet('<h2>Send this quote to ' + esc(cust.name) + '?</h2><p>We\'ll send ' + esc(via) + ' with a link to the quote. They can look it over and tap "Yes, go ahead".</p>' + note + '<div class="btns"><button class="btn pri" data-act="q-send-do" data-id="' + id + '">Send now</button><button class="btn ghost" data-act="close-sheet">Not yet</button></div>');
}
function doSend(id) {
  if (S.busy) return; S.busy = true;
  var btn = $("#sheet [data-act=q-send-do]"); if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
  sb.functions.invoke("send-to-customer", { body: { kind: "q", id: id } }).then(function (r) {
    if (r.error) {
      var ctx = r.error.context;
      return (ctx && ctx.json ? ctx.json().catch(function () { return null; }) : Promise.resolve(null)).then(function (j) { throw new Error((j && j.error) || "That didn't send. Please try again."); });
    }
    var m = (r.data && r.data.message) || "Sent.";
    closeSheet(); return reload().then(function () { toast(m); });
  }).catch(function (e) { if (btn) { btn.disabled = false; btn.textContent = "Send now"; } sheetErr(e.message); })
    .then(function () { S.busy = false; });
}
function invoiceCopy(i) {
  var cust = byId(S.customers, i.customer_id), c = S.client;
  var txt = "Hi " + firstName(cust ? cust.name : i.customer) + ", thanks for choosing " + c.business_name + ". Here is invoice " + (i.number || "") + " for " + money(i.amount) + " for " + (i.description || "the work") + ". It's due " + fmtDate(i.due) + "." + (c.pay_details ? " To pay: " + c.pay_details.replace(/\s*\n\s*/g, ", ") + "." : "") + " Cheers, " + (c.owner_name || c.business_name);
  openSheet('<h2>Message for your customer</h2><p class="sub">Copy this, then attach the invoice (use Print or save PDF) and send it by text or email.</p><textarea class="copy" id="copyTxt" readonly>' + esc(txt) + '</textarea><div class="btns"><button class="btn pri" data-act="copy-do">Copy</button><button class="btn" data-act="inv-view" data-id="' + i.id + '">Back to invoice</button><button class="btn ghost" data-act="close-sheet">Close</button></div>');
}

/* ---------- line items, logo, documents ---------- */
var DEFAULT_LINES = [{ d: "Labour", q: 1, p: "" }, { d: "Materials", q: 1, p: "" }, { d: "Call-out / travel", q: 1, p: "" }];
function lineHtml(l) {
  l = l || { d: "", q: 1, p: "" };
  return '<div class="line"><input type="text" name="it_d" value="' + esc(l.d) + '" placeholder="What is it? e.g. Labour, 6 hours" aria-label="Description">' +
    '<label class="mini">Qty<input type="number" name="it_q" inputmode="decimal" min="0" step="any" value="' + esc(l.q == null ? 1 : l.q) + '"></label>' +
    '<label class="mini">Price each ($)<input type="number" name="it_p" inputmode="decimal" min="0" step="0.01" value="' + esc(l.p) + '"></label>' +
    '<button class="btn small ghost x" type="button" data-act="rm-line" aria-label="Remove this line">✕</button></div>';
}
function itemsEditor(items, note) {
  var list = (items && items.length) ? items : DEFAULT_LINES;
  return '<h3>What\'s in it</h3><p class="hint" style="margin-top:0">' + esc(note) + '</p><div id="lines">' + list.map(lineHtml).join("") + '</div><p><button class="btn small" type="button" data-act="add-line">+ Add a line</button></p>';
}
function parseItems(fd) {
  var d = fd.getAll("it_d"), q = fd.getAll("it_q"), p = fd.getAll("it_p"), out = [], i;
  for (i = 0; i < d.length; i++) {
    var desc = String(d[i] || "").trim(), qty = Number(q[i]), price = Number(p[i]);
    if (p[i] === "" || !(price >= 0)) { if (desc && p[i] !== "") throw new Error("Check the price on \"" + desc + "\"."); continue; }
    if (!desc) desc = "Item";
    if (!(qty > 0)) throw new Error("Check the quantity on \"" + desc + "\".");
    out.push({ d: desc, q: qty, p: price });
  }
  if (!out.length) throw new Error("Add at least one line with a price.");
  return out;
}
function itemsTotal(items) { return Math.round((items || []).reduce(function (a, l) { return a + Number(l.q) * Number(l.p); }, 0) * 100) / 100; }
function itemsOf(row, descKey, totalKey) { return (row.items && row.items.length) ? row.items : [{ d: row[descKey] || "Work", q: 1, p: Number(row[totalKey] || 0) }]; }
function logoImg(cls) { return S.client && S.client.logo ? '<img class="' + cls + '" src="' + esc(S.client.logo) + '" alt="' + esc(S.client.business_name) + ' logo">' : ""; }
function processLogo(file) {
  return new Promise(function (res, rej) {
    if (!file || !/^image\//.test(file.type)) return rej(new Error("Choose a picture file (PNG or JPG)."));
    var r = new FileReader();
    r.onerror = function () { rej(new Error("Couldn't read that file.")); };
    r.onload = function () {
      var im = new Image();
      im.onerror = function () { rej(new Error("Couldn't open that picture.")); };
      im.onload = function () {
        var k = Math.min(1, 600 / (im.width || 600), 300 / (im.height || 300)), w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
        var cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(im, 0, 0, w, h);
        var url = cv.toDataURL("image/png"); if (url.length > 300000) { var c2 = document.createElement("canvas"); c2.width = w; c2.height = h; var x = c2.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h); url = c2.toDataURL("image/jpeg", 0.85); }
        if (url.length > 400000) return rej(new Error("That logo is too big. Try a smaller picture."));
        res(url);
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
function includedList(kind) {
  var c = S.client, rows = [["Your logo", !!c.logo], ["Business name and ABN", !!c.abn], [c.gst_registered ? "GST shown, titled Tax Invoice" : "Plain invoice, no GST (you are not registered)", true]];
  if (kind === "invoice") rows.push(["How to pay you", !!c.pay_details]);
  rows.push(["Your standard terms", !!c.default_terms]);
  var missing = rows.some(function (r) { return !r[1]; });
  return '<div class="incl noprint"><div class="pl">INCLUDED ON EVERY ' + (kind === "invoice" ? "INVOICE" : "QUOTE") + '</div><ul>' + rows.map(function (r) { return '<li class="' + (r[1] ? "ok" : "no") + '">' + (r[1] ? "✓ " : "✗ ") + esc(r[0]) + '</li>'; }).join("") + '</ul>' +
    (missing ? '<button class="btn small" data-act="settings">Add the missing details</button>' : "") + '</div>';
}
function paperItems(items, gst) {
  var rows = items.map(function (l) { return '<tr><td>' + esc(l.d) + (Number(l.q) !== 1 ? '<div class="pm">' + esc(l.q) + ' × ' + money(l.p) + '</div>' : "") + '</td><td class="r">' + money(Number(l.q) * Number(l.p)) + '</td></tr>'; }).join("");
  var amt = itemsTotal(items);
  return '<table class="ptab"><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>' + rows + '</tbody></table><div class="ptot">' +
    (gst ? '<div><span>GST (included)</span><span>' + money(Math.round(amt / 11 * 100) / 100) + '</span></div>' : "") + '<div class="tt"><span>Total' + (gst ? " (incl. GST)" : "") + '</span><span>' + money(amt) + '</span></div></div>';
}
function paperHead(title, number, rightHtml) {
  var c = S.client;
  return '<div class="ph"><div>' + logoImg("plogo") + '<div class="pb">' + esc(c.business_name) + '</div>' + (c.abn ? '<div class="pm">ABN ' + esc(c.abn) + '</div>' : '<div class="pm warnline noprint">ABN missing</div>') + (c.phone ? '<div class="pm">' + esc(c.phone) + '</div>' : "") + (c.email ? '<div class="pm">' + esc(c.email) + '</div>' : "") + '</div><div class="pt">' + title + '<div class="pm">No. ' + esc(number || "") + '</div></div></div>';
}
function quoteForm(q, pre) {
  var isNew = !q, cust = q ? byId(S.customers, q.customer_id) : null;
  openSheet('<form data-form="quote" data-id="' + (q ? q.id : "") + '"><h2>' + (isNew ? "New quote" : "Edit quote") + '</h2><p class="sub">Fill in the job. We build the quote for you to check, then you send it.</p>' +
    custPicker(q ? q.customer_id : "") +
    '<label>What is the job?<input type="text" name="job" value="' + esc(q ? q.job : "") + '" placeholder="e.g. 6 downlights in the lounge" required></label>' +
    '<label>Job address<input type="text" name="site" value="' + esc(q ? (q.site || "") : (cust && cust.address) || "") + '" placeholder="Where is the work?"></label>' +
    '<label>What\'s included in the work<textarea name="scope" rows="3" placeholder="e.g. Supply and install 6 LED downlights, test and tidy up.">' + esc(q ? (q.scope || "") : "") + '</textarea></label>' +
    itemsEditor(q ? itemsOf(q, "job", "value") : null, "Put a price on each line. Lines with no price are left off. Prices are what the customer pays" + (S.client.gst_registered ? ", including GST." : ".")) +
    '<label>Quote is good for<select name="valid_days">' + [14, 30, 60].map(function (n) { return '<option value="' + n + '"' + ((q ? q.valid_days || 30 : 30) === n ? " selected" : "") + '>' + n + ' days</option>'; }).join("") + '</select></label>' +
    '<label>Anything else to say<textarea name="notes" rows="2" placeholder="e.g. Deposit of 30% to book the job.">' + esc(q ? (q.notes || "") : "") + '</textarea></label>' +
    '<div class="btns"><button class="btn pri" type="submit">' + (isNew ? "Make the quote" : "Save") + '</button><button class="btn ghost" type="button" data-act="close-sheet">Cancel</button></div>' +
    (!isNew ? '<p style="margin-top:18px"><button class="btn danger small" type="button" data-act="q-delete-ask" data-id="' + q.id + '">Delete this quote</button></p>' : "") + '</form>');
}
function invoiceForm(i, pre) {
  var isNew = !i; pre = pre || {};
  var items = i ? itemsOf(i, "description", "amount") : (pre.items && pre.items.length ? pre.items : null);
  openSheet('<form data-form="invoice" data-id="' + (i ? i.id : "") + '" data-quote="' + esc(pre.quote_id || (i && i.quote_id) || "") + '"><h2>' + (isNew ? "New invoice" : "Edit invoice") + '</h2><p class="sub">Next you\'ll see the invoice and approve it. Reminders start the day after the due date, and we check with you first.</p>' +
    custPicker(i ? i.customer_id : pre.customer_id) +
    itemsEditor(items, "Everything you are charging for. Add a line for anything extra. Prices are what the customer pays" + (S.client.gst_registered ? ", including GST." : ".")) +
    '<label>Due date<input type="date" name="due" value="' + esc(i ? i.due : addDays(today(), 7)) + '" required></label>' +
    '<label>Anything else to say<textarea name="notes" rows="2" placeholder="e.g. Thanks for your business.">' + esc(i ? (i.notes || "") : "") + '</textarea></label>' +
    '<div class="btns"><button class="btn pri" type="submit">' + (isNew ? "Make the invoice" : "Save") + '</button><button class="btn ghost" type="button" data-act="close-sheet">Cancel</button></div></form>');
}
function quotePreview(id) {
  var q = byId(S.quotes, id); if (!q) return;
  var c = S.client, cust = byId(S.customers, q.customer_id), gst = !!c.gst_registered, items = itemsOf(q, "job", "value"), draft = q.status === "draft";
  var base = q.sent || String(q.created_at || "").slice(0, 10) || today(), until = addDays(base, Number(q.valid_days) || 30);
  var h = '<div class="paper" id="paper">' + (draft ? '<div class="stamp">DRAFT</div>' : "") + paperHead("QUOTE", q.number) +
    '<div class="pgrid"><div><div class="pl">PREPARED FOR</div><div>' + esc(q.customer || "") + '</div>' + (cust && cust.address ? '<div class="pm">' + esc(cust.address) + '</div>' : "") + '</div><div><div class="pl">DATE</div><div>' + esc(fmtDate(base)) + '</div><div class="pl" style="margin-top:8px">GOOD UNTIL</div><div>' + esc(fmtDate(until)) + '</div></div></div>' +
    '<div class="pjob"><b>' + esc(q.job || "") + '</b>' + (q.site ? '<div class="pm">' + esc(q.site) + '</div>' : "") + (q.scope ? '<div style="white-space:pre-line;margin-top:6px">' + esc(q.scope) + '</div>' : "") + '</div>' +
    paperItems(items, gst) + (q.notes ? '<div class="ppay"><div style="white-space:pre-line">' + esc(q.notes) + '</div></div>' : "") +
    (c.default_terms ? '<div class="pm" style="margin-top:12px;white-space:pre-line">' + esc(c.default_terms) + '</div>' : "") +
    '<div class="ppay"><b>To go ahead,</b> reply "Approved" or call ' + esc(c.phone || c.business_name) + '.</div></div>';
  var btns = (draft ? (canSend() ? '<button class="btn pri" data-act="q-send-ask" data-id="' + id + '">Send to customer</button><button class="btn" data-act="q-sent" data-id="' + id + '">Mark as sent</button>' : '<button class="btn pri" data-act="q-sent" data-id="' + id + '">Mark as sent</button>') : '') + '<button class="btn" data-act="q-copy" data-id="' + id + '">Copy message</button>' + (draft ? '<button class="btn" data-act="q-edit" data-id="' + id + '">Edit</button>' : '') + '<button class="btn ghost" data-act="inv-print">Print or save PDF</button><button class="btn ghost" data-act="close-sheet">Close</button>';
  openSheet((draft ? '<p class="sub"><b>Check it over.</b> ' + (canSend() ? 'Tap "Send to customer" and we text them a link to this quote. Already sent it yourself? Tap "Mark as sent".' : S.client.plan === "premium" ? 'Send it to your customer, then tap "Mark as sent" so we start the follow-ups.' : 'Send it to your customer, then tap "Mark as sent" to keep track of it.') + '</p>' : '') + h + includedList("quote") + '<div class="btns noprint">' + btns + '</div>');
}
function invoicePreview(id) {
  var i = byId(S.invoices, id); if (!i) return;
  var c = S.client, cust = byId(S.customers, i.customer_id), gst = !!c.gst_registered, items = itemsOf(i, "description", "amount"), draft = i.status === "draft";
  var h = '<div class="paper" id="paper">' + (draft ? '<div class="stamp">DRAFT</div>' : i.status === "paid" ? '<div class="stamp ok">PAID</div>' : "") + paperHead(gst ? "TAX INVOICE" : "INVOICE", i.number) +
    '<div class="pgrid"><div><div class="pl">BILL TO</div><div>' + esc(i.customer || "") + '</div>' + (cust && cust.address ? '<div class="pm">' + esc(cust.address) + '</div>' : "") + '</div><div><div class="pl">ISSUED</div><div>' + esc(fmtDate(i.issued || today())) + '</div><div class="pl" style="margin-top:8px">DUE</div><div>' + esc(fmtDate(i.due)) + '</div></div></div>' +
    paperItems(items, gst) + (i.notes ? '<div class="ppay"><div style="white-space:pre-line">' + esc(i.notes) + '</div></div>' : "") +
    (c.pay_details ? '<div class="ppay"><div class="pl">HOW TO PAY</div><div style="white-space:pre-line">' + esc(c.pay_details) + '</div></div>' : '<div class="ppay warnline noprint">Payment details missing.</div>') +
    (c.default_terms ? '<div class="pm" style="margin-top:12px;white-space:pre-line">' + esc(c.default_terms) + '</div>' : "") + '</div>';
  var btns = draft
    ? '<button class="btn pri" data-act="inv-approve" data-id="' + id + '">Approve invoice</button><button class="btn" data-act="inv-edit" data-id="' + id + '">Edit</button><button class="btn ghost" data-act="inv-print">Print or save PDF</button><button class="btn ghost" data-act="close-sheet">Close</button>'
    : '<button class="btn pri" data-act="inv-copy" data-id="' + id + '">Copy message to send</button><button class="btn" data-act="inv-print">Print or save PDF</button><button class="btn ghost" data-act="close-sheet">Close</button>';
  openSheet((draft ? '<p class="sub"><b>Check it over.</b> Nothing is sent and no reminders start until you approve it.</p>' : '') + h + includedList("invoice") + '<div class="btns noprint">' + btns + '</div>');
}
function settingsForm() {
  var c = S.client; S.pendingLogo = undefined;
  openSheet('<form data-form="settings"><h2>Your details</h2>' +
    '<div class="logobox"><div id="logoPrev">' + (c.logo ? logoImg("plogo") : '<span class="hint">No logo yet</span>') + '</div><label>Your logo<input type="file" name="logo" accept="image/*"><span class="hint">PNG or JPG. It goes on every quote and invoice and at the top of the app.</span></label>' + (c.logo ? '<label class="check"><input type="checkbox" name="remove_logo"><span>Remove my logo</span></label>' : "") + '</div>' +
    '<label>Business name<input type="text" name="business_name" value="' + esc(c.business_name) + '" required></label>' +
    '<label>Your name<input type="text" name="owner_name" value="' + esc(c.owner_name) + '"></label>' +
    '<label>Your mobile<input type="tel" name="phone" value="' + esc(c.phone) + '"><span class="hint">We text this number to check with you.</span></label>' +
    '<label>Your email<input type="email" name="email" value="' + esc(c.email) + '"></label>' +
    '<label>ABN<input type="text" name="abn" value="' + esc(c.abn) + '"></label>' +
    '<label class="check"><input type="checkbox" name="gst_registered"' + (c.gst_registered ? " checked" : "") + '><span>I am registered for GST<br><span class="hint">Your invoices will say "Tax invoice" and show the GST in the price.</span></span></label>' +
    '<label>How customers pay you<textarea name="pay_details" rows="3" placeholder="e.g. Bank: Example Bank&#10;BSB 000-000  Account 00000000&#10;Name: Your Business">' + esc(c.pay_details) + '</textarea><span class="hint">This goes at the bottom of every invoice.</span></label>' +
    '<label>Standard terms<textarea name="default_terms" rows="3" placeholder="e.g. Payment is due by the due date. Work is guaranteed for 12 months.">' + esc(c.default_terms) + '</textarea><span class="hint">Shown at the bottom of every quote and invoice.</span></label>' +
    (c.plan === "premium" ? '<label>Google review link<input type="url" name="review_url" value="' + esc(c.review_url) + '" placeholder="https://g.page/r/..."><span class="hint">After you mark an invoice paid, we text your customer a thank you with this link. Leave it empty to turn this off.</span></label>' : "") +
    (c.plan !== "premium" ? "" : '<label class="check"><input type="checkbox" name="safety_check"' + (c.safety_check ? " checked" : "") + '><span>Check with me before chasing an invoice<br><span class="hint">Recommended. It stops us chasing someone who already paid.</span></span></label>') +
    '<div class="btns"><button class="btn pri" type="submit">Save</button><button class="btn ghost" type="button" data-act="close-sheet">Cancel</button></div></form>');
}
function vOnboard() {
  var c = S.client;
  return '<div class="login"><form class="box" data-form="onboard"><img src="sox-icon.svg" alt=""><h1>Welcome' + (c.owner_name ? ", " + esc(firstName(c.owner_name)) : "") + '</h1><p>Add your logo. It goes on every quote and invoice, and at the top of the app.</p>' +
    '<div class="logobox"><div id="logoPrev"><span class="hint">Your logo shows here</span></div><label>Choose a picture<input type="file" name="logo" accept="image/*"></label></div><div class="err" id="onbErr" role="alert" hidden></div>' +
    '<div class="btns" style="margin-top:20px"><button class="btn pri block" type="submit">Save and continue</button></div><p style="text-align:center;margin:12px 0 0"><button class="btn ghost small" type="button" data-act="skip-logo">Skip for now</button></p></form></div>';
}
function saveQuote(form) {
  var fd = new FormData(form), id = form.dataset.id;
  var job = String(fd.get("job") || "").trim(); if (!job) return Promise.reject(new Error("Say what the job is."));
  var items; try { items = parseItems(fd); } catch (e) { return Promise.reject(e); }
  return resolveCustomer(fd).then(function (cust) {
    var row = { customer_id: cust.id, customer: cust.name, job: job, site: String(fd.get("site") || "").trim() || null, scope: String(fd.get("scope") || "").trim() || null, items: items, value: itemsTotal(items), valid_days: Number(fd.get("valid_days")) || 30, notes: String(fd.get("notes") || "").trim() || null };
    if (!id) { row.client_id = S.user.id; row.number = nextNumber(S.quotes); row.status = "draft"; return sb.from("quotes").insert(row).select("*").single().then(function (r) { var d = check(r); S.openQ = d && d.id; }); }
    return sb.from("quotes").update(row).eq("id", id).then(check);
  });
}
function saveInvoice(form) {
  var fd = new FormData(form), id = form.dataset.id, due = String(fd.get("due") || "");
  if (!/^\d{4}-\d\d-\d\d$/.test(due)) return Promise.reject(new Error("Choose a due date."));
  var items; try { items = parseItems(fd); } catch (e) { return Promise.reject(e); }
  return resolveCustomer(fd).then(function (cust) {
    var row = { customer_id: cust.id, customer: cust.name, amount: itemsTotal(items), due: due, items: items, description: items[0].d, notes: String(fd.get("notes") || "").trim() || null };
    if (!id) { row.client_id = S.user.id; row.number = nextNumber(S.invoices); row.issued = today(); row.status = "draft"; if (form.dataset.quote) row.quote_id = form.dataset.quote;
      return sb.from("invoices").insert(row).select("*").single().then(function (r) { var d = check(r); S.openInv = d && d.id; }); }
    return sb.from("invoices").update(row).eq("id", id).then(check);
  });
}
function saveSettings(form) {
  var fd = new FormData(form), bn = String(fd.get("business_name") || "").trim();
  if (!bn) return Promise.reject(new Error("Enter your business name."));
  var t = function (k) { return String(fd.get(k) || "").trim() || null; };
  var row = { business_name: bn, owner_name: t("owner_name"), phone: t("phone"), email: t("email"), abn: t("abn"), gst_registered: !!fd.get("gst_registered"), pay_details: t("pay_details"), default_terms: t("default_terms"), };
  if (S.client.plan === "premium") row.safety_check = !!fd.get("safety_check");
  if (S.client.plan === "premium") { var ru = t("review_url"); if (ru && !/^https:\/\//i.test(ru)) return Promise.reject(new Error("The review link should start with https://")); row.review_url = ru; }
  if (fd.get("remove_logo")) row.logo = null; else if (S.pendingLogo) row.logo = S.pendingLogo;
  return sb.from("clients").update(row).eq("id", S.user.id).then(check);
}

/* ---------- saving ---------- */
function resolveCustomer(fd) {
  var v = fd.get("customer_id");
  if (v === "__new") {
    var name = String(fd.get("n_name") || "").trim();
    if (!name) return Promise.reject(new Error("Type the new customer's name."));
    return sb.from("customers").insert({ client_id: S.user.id, name: name, phone: String(fd.get("n_phone") || "").trim() || null, email: String(fd.get("n_email") || "").trim() || null }).select("*").single().then(function (r) { return check(r); });
  }
  if (!v) return Promise.reject(new Error("Choose a customer."));
  var c = byId(S.customers, v); return c ? Promise.resolve(c) : Promise.reject(new Error("Customer not found."));
}
function saveCustomer(form) {
  var fd = new FormData(form), id = form.dataset.id, name = String(fd.get("name") || "").trim();
  if (!name) return Promise.reject(new Error("Enter a name."));
  var row = { name: name, phone: String(fd.get("phone") || "").trim() || null, email: String(fd.get("email") || "").trim() || null, address: String(fd.get("address") || "").trim() || null, opted_out: !!fd.get("opted_out") };
  if (!id) { row.client_id = S.user.id; return sb.from("customers").insert(row).then(check); }
  return sb.from("customers").update(row).eq("id", id).then(check);
}
/* ---------- events ---------- */
function run(promise, okMsg) {
  if (S.busy) return; S.busy = true;
  return promise.then(function () { closeSheet(); return reload(); }).then(function () { if (okMsg) toast(okMsg); })
    .catch(function (e) { if (!$("#sheet-wrap").hidden) sheetErr(e.message); else toast(e.message); })
    .then(function () { S.busy = false; });
}
function setStatus(table, id, patch, msg) { return run(sb.from(table).update(patch).eq("id", id).then(check), msg); }
document.addEventListener("submit", function (e) {
  var f = e.target; if (!f.dataset || !f.dataset.form) return; e.preventDefault();
  var k = f.dataset.form;
  if (k === "login") {
    var fd = new FormData(f); if (S.busy) return; S.busy = true;
    sb.auth.signInWithPassword({ email: String(fd.get("email")).trim(), password: String(fd.get("password")) }).then(function (r) {
      S.busy = false; if (r.error || !r.data || !r.data.user) return showLogin("That email or password isn't right.", String(fd.get("email"))); start(r.data.user);
    }).catch(function () { S.busy = false; showLogin("Couldn't connect. Try again.", String(fd.get("email"))); });
    return;
  }
  if (k === "forgot") {
    var fe = String(new FormData(f).get("email") || "").trim(); if (S.busy) return; S.busy = true;
    sb.auth.resetPasswordForEmail(fe, { redirectTo: location.origin + location.pathname }).then(function () { S.busy = false; showForgot("If that email has an account, a link is on its way. It can take a minute. Check your junk folder too.", fe); }, function () { S.busy = false; showForgot("Couldn't send that just now. Try again soon.", fe); });
    return;
  }
  if (k === "setpw") {
    var fd2 = new FormData(f), bad = pwCheck(fd2); if (bad) return showSetPassword(true, bad); if (S.busy) return; S.busy = true;
    sb.auth.updateUser({ password: String(fd2.get("pw")) }).then(function (r) {
      S.busy = false; if (r && r.error) return showSetPassword(true, r.error.message || "Couldn't save that. Try again.");
      try { history.replaceState(null, "", location.pathname); } catch (x) { }
      sb.auth.getSession().then(function (g) { var ss = g && g.data && g.data.session; if (ss) start(ss.user); else showLogin(); });
    }, function () { S.busy = false; showSetPassword(true, "Couldn't save that. Try again."); });
    return;
  }
  if (k === "changepw") {
    var fd3 = new FormData(f), bad3 = pwCheck(fd3); if (bad3) return sheetErr(bad3); if (S.busy) return; S.busy = true;
    sb.auth.updateUser({ password: String(fd3.get("pw")) }).then(function (r) { S.busy = false; if (r && r.error) return sheetErr(r.error.message || "Couldn't save that."); closeSheet(); toast("Password changed"); }, function () { S.busy = false; sheetErr("Couldn't save that. Try again."); });
    return;
  }
  var sub = e.submitter;
  if (k === "quote") { var qNew = !f.dataset.id; Promise.resolve(run(saveQuote(f), qNew ? "Quote made. Check it over." : "Saved")).then(function () { if (qNew && S.openQ) { var nq = S.openQ; S.openQ = null; quotePreview(nq); } }); }
  if (k === "onboard") { if (S.busy) return; var lg = S.pendingLogo; S.pendingLogo = undefined; run(sb.from("clients").update({ logo: lg || null, onboarded: true }).eq("id", S.user.id).then(check), lg ? "Logo saved" : ""); }
  if (k === "invoice") { var wasNew = !f.dataset.id; Promise.resolve(run(saveInvoice(f), wasNew ? "Invoice made. Check it, then approve." : "Saved")).then(function () { if (wasNew && S.openInv) { var nid = S.openInv; S.openInv = null; invoicePreview(nid); } }); }
  if (k === "customer") run(saveCustomer(f), "Saved");
  if (k === "settings") run(saveSettings(f), "Saved");
});
document.addEventListener("change", function (e) {
  if (e.target && e.target.name === "logo" && e.target.type === "file") {
    var fl = e.target.files && e.target.files[0]; if (!fl) return;
    processLogo(fl).then(function (u) { S.pendingLogo = u; var pv = $("#logoPrev"); if (pv) pv.innerHTML = '<img class="plogo" src="' + u + '" alt="Your logo">'; var er = $("#onbErr"); if (er) er.hidden = true; })
      .catch(function (x) { S.pendingLogo = undefined; var er = $("#onbErr"); if (er) { er.textContent = x.message; er.hidden = false; } else toast(x.message); });
  }
  if (e.target && e.target.id === "custSel") { var n = $("#newCust"); if (n) n.classList.toggle("hidden", e.target.value !== "__new"); }
});
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-act]"); if (!b) return;
  var a = b.dataset.act, id = b.dataset.id, v = b.dataset.v;
  if (a === "tab") { S.tab = v; render(); window.scrollTo(0, 0); }
  else if (a === "qf") { S.qf = v; render(); }
  else if (a === "inf") { S.inf = v; render(); }
  else if (a === "close-sheet") closeSheet();
  else if (a === "forgot") showForgot("", "");
  else if (a === "to-login") showLogin();
  else if (a === "change-pw") passwordForm();
  else if (a === "new-quote") quoteForm(null);
  else if (a === "q-edit") quoteForm(byId(S.quotes, id));
  else if (a === "callme") {
    var cc = S.client; b.disabled = true;
    sb.from("call_requests").insert({ name: cc.owner_name || cc.business_name, business: cc.business_name, email: cc.email || S.user.email || "n/a@n.a", phone: cc.phone || "unknown", note: "Existing client, " + cc.plan + " pack" }).then(function (r) {
      b.disabled = false; if (r && r.error) return toast("Couldn't send that. Please try again."); toast("Thanks. We'll call you back soon.");
    });
  }
  else if (a === "q-sent") setStatus("quotes", id, { status: "sent", sent: today() }, (S.client.plan === "premium" ? "Marked as sent. Follow-ups start from today." : "Marked as sent."));
  else if (a === "q-approved") setStatus("quotes", id, { status: "approved", accepted_at: new Date().toISOString() }, (S.client.plan === "premium" ? "Nice one. Follow-ups stopped." : "Nice one."));
  else if (a === "q-lost") setStatus("quotes", id, { status: "lost" }, (S.client.plan === "premium" ? "Marked as lost. Follow-ups stopped." : "Marked as lost."));
  else if (a === "q-copy") copySheet(byId(S.quotes, id));
  else if (a === "q-send-ask") sendAsk(id);
  else if (a === "q-send-do") doSend(id);
  else if (a === "copy-do") { var t = $("#copyTxt"); var done = function () { toast("Copied"); }; t.select(); try { navigator.clipboard.writeText(t.value).then(done, function () { document.execCommand("copy"); done(); }); } catch (x) { try { document.execCommand("copy"); done(); } catch (y) { } } }
  else if (a === "q-invoice") { var q = byId(S.quotes, id); invoiceForm(null, { customer_id: q.customer_id, items: (q.items && q.items.length) ? q.items : [{ d: q.job || "Work", q: 1, p: q.value }], quote_id: q.id }); }
  else if (a === "inv-view") invoicePreview(id);
  else if (a === "q-view") quotePreview(id);
  else if (a === "add-line") { var ln = document.createElement("div"); ln.innerHTML = lineHtml(); $("#lines").appendChild(ln.firstChild); var nf = $("#lines .line:last-child input"); if (nf) nf.focus(); }
  else if (a === "rm-line") { var all = document.querySelectorAll("#lines .line"); if (all.length > 1) b.closest(".line").remove(); else b.closest(".line").querySelectorAll("input").forEach(function (x, ix) { x.value = ix === 1 ? 1 : ""; }); }
  else if (a === "skip-logo") run(sb.from("clients").update({ onboarded: true }).eq("id", S.user.id).then(check), "");
  else if (a === "inv-approve") setStatus("invoices", id, { status: "unpaid", issued: today() }, "Approved. It's ready to send.");
  else if (a === "inv-copy") invoiceCopy(byId(S.invoices, id));
  else if (a === "inv-print") window.print();
  else if (a === "q-delete-ask") askSheet("Delete this quote?", "This can't be undone.", "q-delete", id, "Yes, delete");
  else if (a === "q-delete") run(sb.from("quotes").delete().eq("id", id).then(check), "Deleted");
  else if (a === "new-invoice") invoiceForm(null);
  else if (a === "inv-edit") invoiceForm(byId(S.invoices, id));
  else if (a === "inv-paid") setStatus("invoices", id, { status: "paid", paid_at: today() }, "Marked as paid. No more reminders.");
  else if (a === "inv-void") { var dv = byId(S.invoices, id); if (dv && dv.status === "draft") askSheet("Delete this draft?", "It hasn't been sent, so nothing else changes.", "inv-del-do", id, "Yes, delete it"); else askSheet("Cancel this invoice?", "We'll stop all reminders for it.", "inv-void-do", id, "Yes, cancel it"); }
  else if (a === "inv-del-do") run(sb.from("invoices").delete().eq("id", id).then(check), "Draft deleted");
  else if (a === "inv-void-do") setStatus("invoices", id, { status: "void" }, "Invoice cancelled");
  else if (a === "new-customer") customerForm(null);
  else if (a === "cust-edit") customerForm(byId(S.customers, id));
  else if (a === "cust-delete-ask") askSheet("Delete this customer?", "Their old quotes and invoices stay, but won't be linked to them.", "cust-delete", id, "Yes, delete");
  else if (a === "cust-delete") run(sb.from("customers").delete().eq("id", id).then(check), "Deleted");
  else if (a === "settings") settingsForm();
  else if (a === "pause") run(sb.from("clients").update({ paused: true }).eq("id", S.user.id).then(check), "Paused. Nothing will be sent.");
  else if (a === "resume") run(sb.from("clients").update({ paused: false }).eq("id", S.user.id).then(check), "Resumed");
  else if (a === "signout") { sb.auth.signOut().then(function () { S.user = null; S.client = null; closeSheet(); showLogin(); }); }
});
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#sheet-wrap").hidden) closeSheet(); });
init();
})();
