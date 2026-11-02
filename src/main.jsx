import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import {
  Home, Wallet, Phone, Bell, Users, ReceiptText, Settings,
  LogOut, CheckCircle2, Clock3, AlertCircle, Plus, Search,
  FileDown, ShieldCheck, Menu, X, ArrowUpRight, IndianRupee,
  CalendarDays
} from 'lucide-react';
import './style.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const money = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const monthLabel = d => new Date(d).toLocaleString('en-IN', {
  month: 'long',
  year: 'numeric'
});

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [page, setPage] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const [data, setData] = useState({
    dues: [],
    payments: [],
    notices: [],
    expenses: [],
    residents: [],
    contacts: [],
    settings: {}
  });

  const [utr, setUtr] = useState('');
  const [qr, setQr] = useState('');
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedDue, setSelectedDue] = useState(null);

  const configured = !!supabase;

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      load();
    } else {
      setProfile(null);
      setLoading(false);
    }
  }, [session]);

  async function load() {
    setLoading(true);
    setError('');

    try {
      const { data: p, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profileError) throw profileError;
      setProfile(p);

      const [d, pa, n, e, c, s, ct] = await Promise.all([
        supabase.from('dues').select('*')
          .order('created_at', { ascending: false }),
        supabase.from('payments').select('*')
          .order('created_at', { ascending: false }),
        supabase.from('notices').select('*')
          .eq('published', true)
          .order('created_at', { ascending: false }),
        supabase.from('expenses').select('*')
          .order('expense_date', { ascending: false }),
        p.role === 'admin'
          ? supabase.from('profiles').select('*').order('room_number')
          : Promise.resolve({ data: [] }),
        supabase.from('settings').select('*'),
        supabase.from('contacts').select('*')
          .eq('active', true).order('sort_order')
      ]);

      for (const result of [d, pa, n, e, c, s, ct]) {
        if (result.error) throw result.error;
      }

      setData({
        dues: d.data || [],
        payments: pa.data || [],
        notices: n.data || [],
        expenses: e.data || [],
        residents: c.data || [],
        contacts: ct.data || [],
        settings: Object.fromEntries(
          (s.data || []).map(x => [x.key, x.value])
        )
      });
    } catch (e) {
      setError(e.message || 'Unable to load account data');
    } finally {
      setLoading(false);
    }
  }

  // MOBILE NUMBER + PASSWORD LOGIN
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      let normalizedMobile = mobile.replace(/\D/g, '');

      // Accept 10-digit Indian numbers, +91 numbers and 0-prefixed numbers.
      if (normalizedMobile.startsWith('91') && normalizedMobile.length === 12) {
        normalizedMobile = normalizedMobile.slice(2);
      } else if (normalizedMobile.startsWith('0') && normalizedMobile.length === 11) {
        normalizedMobile = normalizedMobile.slice(1);
      }

      if (!/^[6-9]\d{9}$/.test(normalizedMobile)) {
        throw new Error('Enter a valid 10-digit Indian mobile number.');
      }

      const loginEmail = `${normalizedMobile}@block1.example`;

      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password
      });

      if (error) throw error;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setPage('overview');
  }

  const isAdmin = profile?.role === 'admin';

  const ownDues = data.dues.filter(
    x => x.room_number === profile?.room_number && x.status !== 'paid'
  );

  const ownTotal = ownDues.reduce((a, x) => a + Number(x.amount), 0);

  const paidRooms = new Set(
    data.payments
      .filter(x => x.status === 'approved')
      .map(x => x.room_number)
  );

  const totalRooms = 108;
  const paidCount = paidRooms.size;

  const collected = data.payments
    .filter(x => x.status === 'approved')
    .reduce((a, x) => a + Number(x.amount), 0);

  const outstanding = data.dues
    .filter(x => x.status !== 'paid')
    .reduce((a, x) => a + Number(x.amount), 0);

  async function createPayment(due) {
    setSelectedDue(due);

    const upi = import.meta.env.VITE_UPI_ID || data.settings.upi_id;
    const name = import.meta.env.VITE_UPI_NAME || 'Block 1 Management';

    if (!upi) {
      setError('Admin has not configured the UPI ID yet.');
      return;
    }

    const note = `${profile.room_number} ${monthLabel(due.due_month)} ${due.amount}`;

    const link = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(name)}&am=${Number(due.amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;

    try {
      setQr(await QRCode.toDataURL(link, { width: 260, margin: 2 }));
      setNotice(`Pay ${money(due.amount)} with the QR, then submit your UTR below. Reference: ${note}`);
    } catch {
      setError('Could not generate QR code');
    }
  }

  async function submitUtr(due) {
    if (!utr.trim()) {
      setError('Enter the UTR/reference number first.');
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.from('payments').insert({
        room_number: profile.room_number,
        due_id: due.id,
        amount: due.amount,
        utr: utr.trim(),
        status: 'pending'
      });

      if (error) throw error;

      setUtr('');
      setQr('');
      setSelectedDue(null);
      setNotice('Payment submitted for admin verification.');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function decidePayment(p, status) {
    const { error } = await supabase
      .from('payments')
      .update({
        status,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', p.id);

    if (error) {
      setError(error.message);
      return;
    }

    await load();
  }

  function exportPdf() {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Block 1 Management', 14, 18);
    doc.setFontSize(11);
    doc.text(`Monthly report · ${monthLabel(new Date())}`, 14, 26);

    let y = 38;

    const rows = data.residents.map(r => {
      const dues = data.dues.filter(d => d.room_number === r.room_number);
      const payments = data.payments.filter(
        p => p.room_number === r.room_number && p.status === 'approved'
      );

      return [
        r.room_number,
        r.full_name || '-',
        payments.length ? 'Paid' : 'Not paid',
        money(dues.filter(d => d.status !== 'paid')
          .reduce((a, d) => a + Number(d.amount), 0))
      ];
    });

    doc.text('Room     Resident     Status     Outstanding', 14, y);
    y += 8;

    rows.forEach(r => {
      if (y > 275) {
        doc.addPage();
        y = 18;
      }

      doc.text(`${r[0]}     ${r[1]}     ${r[2]}     ${r[3]}`, 14, y);
      y += 7;
    });

    y += 8;
    doc.text(`Approved collection: ${money(collected)}`, 14, y);
    y += 7;
    doc.text(`Outstanding dues: ${money(outstanding)}`, 14, y);
    y += 7;

    doc.text(
      `Recorded expenses: ${money(data.expenses.reduce((a, x) => a + Number(x.amount), 0))}`,
      14,
      y
    );

    doc.save(`block-1-report-${new Date().toISOString().slice(0, 7)}.pdf`);
  }

  if (!configured) return <Setup />;

  if (loading) {
    return (
      <div className="center">
        <div className="spinner" />
        <p>Loading Block 1 Management…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="brand-mark"><Home /></div>
          <p className="eyebrow">RESIDENT & ADMIN PORTAL</p>
          <h1>Block 1 <span>Management</span></h1>
          <p className="muted">Your home. Your community. One simple place.</p>

          <form onSubmit={login}>
            <label>Mobile number</label>
            <input
              value={mobile}
              onChange={e => setMobile(e.target.value)}
              placeholder="+91 98765 43210"
              autoComplete="tel"
              required
            />

            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />

            <button className="primary full" disabled={busy}>
              {busy ? 'Signing in…' : 'Secure sign in'}
            </button>
          </form>

          {error && <p className="error">{error}</p>}

          <p className="tiny muted">
            Your login credentials are provided by the block administrator.
          </p>
        </div>
      </div>
    );
  }

  const nav = [
    ['overview', 'Overview', Home],
    ['dues', 'My dues', Wallet],
    ['notices', 'Notice board', Bell],
    ['contacts', 'Contacts', Phone],
    ...(isAdmin ? [
      ['residents', 'Residents', Users],
      ['payments', 'Payment approvals', ShieldCheck],
      ['expenses', 'Expenses', ReceiptText],
      ['reports', 'Reports', FileDown],
      ['settings', 'Settings', Settings]
    ] : [])
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="side-brand">
          <div className="brand-mark small"><Home /></div>
          <div><b>Block 1</b><small>Management</small></div>
          <button className="icon-btn mobile-close" onClick={() => setMenu(false)}>
            <X />
          </button>
        </div>

        <div className="side-label">MENU</div>

        {nav.map(([id, label, Icon]) => (
          <button
            key={id}
            className={`nav-item ${page === id ? 'active' : ''}`}
            onClick={() => {
              setPage(id);
              setMenu(false);
            }}
          >
            <Icon size={18} />
            {label}
            {id === 'payments' &&
              data.payments.filter(p => p.status === 'pending').length > 0 &&
              <i>{data.payments.filter(p => p.status === 'pending').length}</i>
            }
          </button>
        ))}

        <div className="side-bottom">
          <div className="user-mini">
            <div className="avatar">
              {(profile?.full_name || 'R').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <b>{profile?.full_name || 'Resident'}</b>
              <small>
                Room {profile?.room_number} · {isAdmin ? 'Administrator' : 'Resident'}
              </small>
            </div>
          </div>

          <button className="nav-item" onClick={logout}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setMenu(true)}>
            <Menu />
          </button>

          <div>
            <p className="eyebrow">BLOCK 1 RESIDENTIAL COMMUNITY</p>
            <h2>{nav.find(x => x[0] === page)?.[1] || 'Overview'}</h2>
          </div>

          <div className="top-right">
            <span className="date-chip">
              <CalendarDays size={15} />
              {new Date().toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })}
            </span>
            <div className="avatar">
              {(profile?.full_name || 'R').slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        {error && (
          <div className="alert error-box">
            <AlertCircle size={17} /> {error}
            <button onClick={() => setError('')}>×</button>
          </div>
        )}

        {notice && (
          <div className="alert success-box">
            <CheckCircle2 size={17} /> {notice}
            <button onClick={() => setNotice('')}>×</button>
          </div>
        )}

        {page === 'overview' && (
          <>
            {isAdmin ? (
              <>
                <div className="welcome">
                  <div>
                    <p className="eyebrow">ADMINISTRATOR DASHBOARD</p>
                    <h1>Good day, {profile?.full_name?.split(' ')[0] || 'Admin'}.</h1>
                    <p className="muted">Here’s what’s happening in your community.</p>
                  </div>
                  <button className="secondary" onClick={exportPdf}>
                    <FileDown size={16} /> Export report
                  </button>
                </div>

                <div className="stats-grid">
                  <Stat icon={Users} label="Total rooms" value={totalRooms} />
                  <Stat icon={CheckCircle2} label="Rooms with approved payments" value={paidCount} tone="green" />
                  <Stat icon={Clock3} label="Rooms with pending dues" value={Math.max(0, totalRooms - paidCount)} tone="amber" />
                  <Stat icon={IndianRupee} label="Approved collection" value={money(collected)} tone="pink" />
                  <Stat icon={Wallet} label="Outstanding dues" value={money(outstanding)} tone="rose" />
                </div>

                <div className="content-grid">
                  <section className="panel">
                    <PanelTitle title="Recent payment requests" action={() => setPage('payments')} />
                    <PaymentList
                      payments={data.payments.filter(p => p.status === 'pending').slice(0, 5)}
                      admin
                      onDecision={decidePayment}
                    />
                  </section>

                  <section className="panel">
                    <PanelTitle title="Latest notices" action={() => setPage('notices')} />
                    <NoticeList notices={data.notices.slice(0, 4)} />
                  </section>
                </div>
              </>
            ) : (
              <>
                <div className="welcome">
                  <div>
                    <p className="eyebrow">RESIDENT DASHBOARD · ROOM {profile?.room_number}</p>
                    <h1>Hello, {profile?.full_name?.split(' ')[0] || 'there'}.</h1>
                    <p className="muted">Here’s your maintenance overview.</p>
                  </div>
                  <span className="room-pill">Room {profile?.room_number}</span>
                </div>

                <div className="resident-highlight">
                  <div>
                    <span className="eyebrow">TOTAL OUTSTANDING</span>
                    <h1>{money(ownTotal)}</h1>
                    <p>
                      {ownDues.length
                        ? `${ownDues.length} unpaid item(s) need your attention.`
                        : 'You are all caught up. Thank you!'}
                    </p>
                  </div>
                  <Wallet size={38} />
                </div>

                <div className="content-grid">
                  <section className="panel">
                    <PanelTitle title="Your pending dues" action={() => setPage('dues')} />
                    <DueList dues={ownDues.slice(0, 5)} onPay={createPayment} />
                  </section>

                  <section className="panel">
                    <PanelTitle title="Community notices" action={() => setPage('notices')} />
                    <NoticeList notices={data.notices.slice(0, 4)} />
                  </section>
                </div>
              </>
            )}
          </>
        )}

        {page === 'dues' && (
          <section className="panel">
            <PanelTitle title={isAdmin ? 'All outstanding dues' : 'Your dues'} />

            {isAdmin ? (
              <p className="muted">
                Residents can only see their own dues. Use the admin tools to manage charges.
              </p>
            ) : (
              <>
                <div className="due-total">
                  <span>Total to pay</span><b>{money(ownTotal)}</b>
                </div>

                {ownDues.length ? ownDues.map(d => (
                  <div className="due-row" key={d.id}>
                    <div>
                      <b>{d.title}</b>
                      <small>{monthLabel(d.due_month)} · {d.description || 'Maintenance charge'}</small>
                    </div>
                    <strong>{money(d.amount)}</strong>
                    <button className="primary compact" onClick={() => createPayment(d)}>
                      Pay now
                    </button>
                  </div>
                )) : (
                  <div className="empty">
                    <CheckCircle2 />
                    <b>No outstanding dues</b>
                    <p>You have no pending payments right now.</p>
                  </div>
                )}

                {qr && (
                  <div className="qr-box">
                    <h3>Scan to pay</h3>
                    <img src={qr} alt="UPI payment QR code" />
                    <p className="muted">
                      After completing the payment, enter the UTR/reference number.
                    </p>
                    <input
                      value={utr}
                      onChange={e => setUtr(e.target.value)}
                      placeholder="Enter 12-digit UTR / reference"
                    />
                    <button
                      className="primary"
                      onClick={() => {
                        if (selectedDue) submitUtr(selectedDue);
                      }}
                      disabled={busy}
                    >
                      Submit payment for verification
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {page === 'notices' && (
          <section className="panel">
            <PanelTitle title="Notice board" />
            <NoticeList notices={data.notices} />
            {!data.notices.length && <Empty text="No notices have been published yet." />}
          </section>
        )}

        {page === 'contacts' && (
          <section className="panel">
            <PanelTitle title="Important contacts" />
            <div className="contact-grid">
              {(data.contacts.length ? data.contacts : [
                { name: 'Block Administrator', role: 'Admin', phone: '', kind: 'admin' },
                { name: 'Lift Emergency', role: 'Emergency support', phone: '', kind: 'emergency' },
                { name: 'Maintenance Complaint', role: 'Complaints', phone: '', kind: 'complaint' }
              ]).map(c => (
                <div className="contact-card" key={c.kind}>
                  <div className="contact-icon"><Phone /></div>
                  <b>{c.name}</b>
                  <small>{c.role}</small>
                  <div className="contact-actions">
                    <a className="secondary" href={c.phone ? `tel:${c.phone}` : undefined}>Call</a>
                    <a
                      className="secondary"
                      href={c.phone ? `https://wa.me/${c.phone.replace(/\D/g, '')}` : undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === 'payments' && isAdmin && (
          <section className="panel">
            <PanelTitle title="Payment verification" />
            <p className="muted">
              Verify each UTR against the actual receiving account before approving.
            </p>
            <PaymentList payments={data.payments} admin onDecision={decidePayment} />
          </section>
        )}

        {page === 'residents' && isAdmin && (
          <section className="panel">
            <PanelTitle title="Residents" />
            <div className="toolbar">
              <div className="search">
                <Search size={16} />
                <input
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder="Search room or resident"
                />
              </div>
              <span className="muted">{data.residents.length} profiles</span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Room</th><th>Resident</th><th>Mobile</th><th>Role</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.residents
                    .filter(r => `${r.room_number} ${r.full_name} ${r.phone}`
                      .toLowerCase().includes(filter.toLowerCase()))
                    .map(r => (
                      <tr key={r.id}>
                        <td><b>{r.room_number}</b></td>
                        <td>{r.full_name || '—'}</td>
                        <td>{r.phone}</td>
                        <td>{r.role}</td>
                        <td><span className="status paid">Active</span></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <p className="tiny muted">
              Resident creation and password resets require secured admin functions.
            </p>
          </section>
        )}

        {page === 'expenses' && isAdmin && (
          <section className="panel">
            <PanelTitle title="Block expenses" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Expense</th><th>Details</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  {data.expenses.map(e => (
                    <tr key={e.id}>
                      <td>{e.expense_date}</td>
                      <td>{e.title}</td>
                      <td>{e.description || '—'}</td>
                      <td><b>{money(e.amount)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="due-total">
              <span>Total recorded expenses</span>
              <b>{money(data.expenses.reduce((a, x) => a + Number(x.amount), 0))}</b>
            </div>
          </section>
        )}

        {page === 'reports' && isAdmin && (
          <section className="panel">
            <PanelTitle title="Monthly reports" />
            <p className="muted">
              Download a summary of residents, paid status, dues, collection and recorded expenses.
            </p>
            <button className="primary" onClick={exportPdf}>
              <FileDown size={17} /> Download monthly PDF
            </button>
          </section>
        )}

        {page === 'settings' && isAdmin && (
          <section className="panel">
            <PanelTitle title="System settings" />
            <div className="settings-list">
              <div>
                <b>Monthly maintenance</b>
                <small>Default monthly charge per active room</small>
              </div>
              <strong>{money(data.settings.monthly_maintenance || 500)}</strong>
            </div>
            <div className="settings-list">
              <div>
                <b>UPI payment ID</b>
                <small>Configured in Supabase settings</small>
              </div>
              <strong>
                {data.settings.upi_id || import.meta.env.VITE_UPI_ID || 'Not configured'}
              </strong>
            </div>
            <p className="tiny muted">
              Never expose the Supabase service-role key in this website.
            </p>
          </section>
        )}

        <footer>
          Block 1 Management <span>·</span> Built for a simpler community
        </footer>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone = '' }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={19} /></div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function PanelTitle({ title, action }) {
  return (
    <div className="panel-title">
      <h3>{title}</h3>
      {action && (
        <button className="text-btn" onClick={action}>
          View all <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}

function DueList({ dues, onPay }) {
  return dues.length
    ? dues.map(d => (
      <div className="due-row" key={d.id}>
        <div>
          <b>{d.title}</b>
          <small>{monthLabel(d.due_month)}</small>
        </div>
        <strong>{money(d.amount)}</strong>
        <button className="primary compact" onClick={() => onPay(d)}>Pay now</button>
      </div>
    ))
    : <Empty text="No pending dues." />;
}

function PaymentList({ payments, admin, onDecision }) {
  return payments.length
    ? payments.map(p => (
      <div className="payment-row" key={p.id}>
        <div className="payment-avatar">{String(p.room_number).slice(-2)}</div>
        <div className="payment-info">
          <b>Room {p.room_number} · {money(p.amount)}</b>
          <small>
            UTR: {p.utr} · {new Date(p.created_at).toLocaleString('en-IN')}
          </small>
        </div>
        <span className={`status ${p.status}`}>{p.status}</span>
        {admin && p.status === 'pending' && (
          <div className="decision">
            <button className="approve" onClick={() => onDecision(p, 'approved')}>Approve</button>
            <button className="reject" onClick={() => onDecision(p, 'rejected')}>Reject</button>
          </div>
        )}
      </div>
    ))
    : <Empty text="No payment requests to show." />;
}

function NoticeList({ notices }) {
  return notices.map(n => (
    <div className="notice-row" key={n.id}>
      <div className="notice-icon"><Bell size={17} /></div>
      <div>
        <b>{n.title}</b>
        <p>{n.description}</p>
        <small>
          {new Date(n.created_at).toLocaleDateString('en-IN')}
          {n.amount ? ` · ${money(n.amount)}` : ''}
        </small>
        {n.image_url && (
          <img className="notice-image" src={n.image_url} alt="Notice attachment" />
        )}
      </div>
    </div>
  ));
}

function Empty({ text }) {
  return (
    <div className="empty">
      <Bell />
      <p>{text}</p>
    </div>
  );
}

function Setup() {
  return (
    <div className="login-wrap">
      <div className="login-card setup-card">
        <div className="brand-mark"><Home /></div>
        <p className="eyebrow">PROJECT SETUP REQUIRED</p>
        <h1>Block 1 <span>Management</span></h1>
        <p className="muted">
          The application is ready, but it needs your Supabase project credentials.
        </p>
        <ol>
          <li>Create a Supabase project.</li>
          <li>Run the SQL migration in <code>supabase/migrations/001_initial_schema.sql</code>.</li>
          <li>Copy <code>.env.example</code> to <code>.env</code> and add your project URL and publishable key.</li>
          <li>Run <code>npm install</code> and <code>npm run dev</code>.</li>
        </ol>
        <p className="tiny muted">
          See README.md for deployment, security and monthly billing instructions.
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
