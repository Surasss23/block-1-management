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

function withTimeout(promise, ms, message = 'The server is taking too long to respond. Please try again.') {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), ms); })]).finally(() => window.clearTimeout(timer));
}

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
  const [paymentReference, setPaymentReference] = useState('');
  const [upiPayLink, setUpiPayLink] = useState('');
  const [qr, setQr] = useState('');
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedDue, setSelectedDue] = useState(null);
  const [residentRoom, setResidentRoom] = useState('');
  const [residentName, setResidentName] = useState('');
  const [residentPhone, setResidentPhone] = useState('');
  const [residentPassword, setResidentPassword] = useState('');
  const [residentBusy, setResidentBusy] = useState(false);
  const [dueTitle, setDueTitle] = useState('Monthly maintenance');
  const [dueDescription, setDueDescription] = useState('');
  const [dueAmount, setDueAmount] = useState('500');
  const [dueMonth, setDueMonth] = useState(new Date().toISOString().slice(0, 7) + '-01');
  const [dueScope, setDueScope] = useState('all');
  const [dueRooms, setDueRooms] = useState('');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeDescription, setNoticeDescription] = useState('');
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [monthlyFee, setMonthlyFee] = useState('500');
  const [upiId, setUpiId] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [communitySummary, setCommunitySummary] = useState(null);
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactKind, setContactKind] = useState('general');
  const [offlineDueId, setOfflineDueId] = useState('');
  const [offlineAmount, setOfflineAmount] = useState('');
  const [offlineMode, setOfflineMode] = useState('cash');
  const [offlineNote, setOfflineNote] = useState('');
  const [liveClock, setLiveClock] = useState(new Date());
  const [liveLastUpdated, setLiveLastUpdated] = useState(new Date());


  const configured = !!supabase;
  async function createResident(e) {
  e.preventDefault();
  setResidentBusy(true);
  setError('');
  setNotice('');

  try {
    const { data: result, error } = await supabase.functions.invoke(
      'admin-create-resident',
      {
        body: {
          room_number: residentRoom.trim(),
          full_name: residentName.trim(),
          phone: residentPhone.trim(),
          password: residentPassword
        }
      }
    );

    if (error) throw error;
    if (result?.error) throw new Error(result.error);

    setNotice('Resident account created successfully.');

    setResidentRoom('');
    setResidentName('');
    setResidentPhone('');
    setResidentPassword('');

    await load();
  } catch (e) {
    setError(e.message || 'Unable to create resident.');
  } finally {
    setResidentBusy(false);
  }
}



  async function resetResidentPassword(roomNumber) {
    const nextPassword = window.prompt('Enter a new password (minimum 8 characters) for room ' + roomNumber + ':');
    if (nextPassword === null) return;
    if (nextPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setActionBusy(true); setError(''); setNotice('');
    try {
      const { data: result, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { room_number: String(roomNumber), password: nextPassword }
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setNotice('Password reset for room ' + roomNumber + '. Share the new password securely with the resident.');
    } catch (e) { setError(e.message || 'Unable to reset password.'); }
    finally { setActionBusy(false); }
  }

  async function generateMonthlyDues() {
    setActionBusy(true); setError(''); setNotice('');
    try {
      const { data: count, error } = await supabase.rpc('generate_monthly_maintenance_for_admin', {
        target_month: dueMonth
      });
      if (error) throw error;
      setNotice('Monthly maintenance dues generated. ' + Number(count || 0) + ' new resident charge(s) added.');
      await load();
    } catch (e) { setError(e.message || 'Unable to generate monthly dues.'); }
    finally { setActionBusy(false); }
  }

  async function createDues(e) {
    e.preventDefault();
    setActionBusy(true); setError(''); setNotice('');
    try {
      let rooms = dueScope === 'custom'
        ? dueRooms.split(/[\\s,;]+/).map(x => x.trim()).filter(Boolean)
        : data.residents.filter(r => r.role === 'resident' && r.active).map(r => String(r.room_number));
      rooms = [...new Set(rooms)];
      if (!rooms.length) throw new Error('No active resident accounts found. Add resident accounts before creating dues.');
      const activeRooms = new Set(data.residents.filter(r => r.role === 'resident' && r.active).map(r => String(r.room_number)));
      const invalidRooms = rooms.filter(room => !activeRooms.has(String(room)));
      if (invalidRooms.length) throw new Error('These rooms do not have active resident accounts: ' + invalidRooms.join(', '));
      const amount = Number(dueAmount);
      if (!dueTitle.trim() || !Number.isFinite(amount) || amount <= 0) throw new Error('Enter a title and a valid amount.');
      const monthStart = dueMonth.slice(0, 7) + '-01';
      const rows = rooms.map(room_number => ({
        room_number: String(room_number), title: dueTitle.trim(),
        description: dueDescription.trim() || 'Maintenance charge',
        amount, due_month: monthStart, status: 'unpaid'
      }));
      const { data: savedRows, error } = await supabase
        .from('dues')
        .upsert(rows, { onConflict: 'room_number,title,due_month', ignoreDuplicates: false })
        .select('id,room_number,status,amount,due_month');
      if (error) throw error;
      if (!savedRows || savedRows.length !== rows.length) {
        throw new Error('The database saved ' + (savedRows?.length || 0) + ' of ' + rows.length + ' charges. Please refresh and check the dues table.');
      }
      await load();
      setNotice('Successfully published ' + savedRows.length + ' charge(s) for rooms ' + rooms.join(', ') + '. Residents can see them in My dues after refreshing their account.');
    } catch (e) {
      setError(e.message || 'Unable to create dues.');
    } finally {
      setActionBusy(false);
    }
  }

  async function createNotice(e) {
    e.preventDefault(); setActionBusy(true); setError(''); setNotice('');
    try {
      const { error } = await supabase.from('notices').insert({ title: noticeTitle.trim(), description: noticeDescription.trim(), published: true, created_by: session.user.id });
      if (error) throw error;
      setNoticeTitle(''); setNoticeDescription(''); setNotice('Notice published successfully.'); await load();
    } catch (e) { setError(e.message || 'Unable to publish notice.'); }
    finally { setActionBusy(false); }
  }

  async function deleteNotice(id) {
    if (!window.confirm('Delete this notice?')) return;
    const { error } = await supabase.from('notices').delete().eq('id', id);
    if (error) setError(error.message); else { setNotice('Notice deleted.'); await load(); }
  }

  async function createExpense(e) {
    e.preventDefault(); setActionBusy(true); setError(''); setNotice('');
    try {
      const amount = Number(expenseAmount);
      if (!expenseTitle.trim() || !Number.isFinite(amount) || amount <= 0) throw new Error('Enter expense name and a valid amount.');
      const { error } = await supabase.from('expenses').insert({ title: expenseTitle.trim(), description: expenseDescription.trim(), amount, expense_date: expenseDate, created_by: session.user.id });
      if (error) throw error;
      setExpenseTitle(''); setExpenseDescription(''); setExpenseAmount(''); setNotice('Expense recorded successfully.'); await load();
    } catch (e) { setError(e.message || 'Unable to record expense.'); }
    finally { setActionBusy(false); }
  }

  async function createContact(e) {
    e.preventDefault(); setActionBusy(true); setError(''); setNotice('');
    try {
      const phone = contactPhone.replace(/[^0-9+]/g, '');
      if (!contactName.trim() || !contactRole.trim() || !phone) throw new Error('Enter contact name, role and phone.');
      const { error } = await supabase.from('contacts').insert({
        name: contactName.trim(), role_label: contactRole.trim(), phone,
        kind: contactKind, sort_order: data.contacts.length, active: true
      });
      if (error) throw error;
      setContactName(''); setContactRole(''); setContactPhone('');
      setNotice('Contact added successfully.'); await load();
    } catch (e) { setError(e.message || 'Unable to add contact.'); }
    finally { setActionBusy(false); }
  }

  async function deleteContact(id) {
    if (!window.confirm('Remove this contact from the resident directory?')) return;
    const { error } = await supabase.from('contacts').update({ active: false }).eq('id', id);
    if (error) setError(error.message); else { setNotice('Contact removed.'); await load(); }
  }

  async function saveSettings(e) {
    e.preventDefault(); setActionBusy(true); setError(''); setNotice('');
    try {
      const fee = Number(monthlyFee);
      if (!Number.isFinite(fee) || fee <= 0) throw new Error('Enter a valid monthly maintenance amount.');
      for (const [key, value] of [['monthly_maintenance', fee], ['upi_id', upiId.replace(/[\s,;]+/g, '').replace(/^['\"]+|['\"]+$/g, '').trim()]]) {
        const { error } = await supabase.from('settings').upsert({ key, value });
        if (error) throw error;
      }
      setNotice('Settings saved. New dues will use the updated maintenance amount.'); await load();
    } catch (e) { setError(e.message || 'Unable to save settings.'); }
    finally { setActionBusy(false); }
  }

  useEffect(() => {
    if (page !== 'live-tv' || !isAdmin) return;
    const clockTimer = window.setInterval(() => setLiveClock(new Date()), 1000);
    const refreshTimer = window.setInterval(async () => {
      await load({ silent: true });
      setLiveLastUpdated(new Date());
    }, 30000);
    return () => { window.clearInterval(clockTimer); window.clearInterval(refreshTimer); };
  }, [page, profile?.role, session]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (active) setSession(currentSession);
    });
    withTimeout(supabase.auth.getSession(), 12000, 'Could not connect to the sign-in service. Check your internet connection and refresh.')
      .then(({ data }) => { if (active) setSession(data.session); })
      .catch((e) => { if (active) { setError(e.message || 'Unable to check your sign-in session.'); setLoading(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session) {
      load();
    } else {
      setProfile(null);
      setLoading(false);
    }
  }, [session]);

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError('');

    try {
      if (!session?.user?.id) throw new Error('Your sign-in session expired. Please sign in again.');
      const { data: p, error: profileError } = await withTimeout(supabase.from('profiles').select('*').eq('id', session.user.id).single(), 15000);

      if (profileError) throw profileError;
      setProfile(p);

      const [d, pa, n, e, c, s, ct] = await withTimeout(Promise.all([
        supabase.from('dues').select('*')
          .order('created_at', { ascending: false }),
        supabase.from('payments').select('*')
          .order('created_at', { ascending: false }),
        supabase.from('notices').select('*')
          .eq('published', true)
          .order('created_at', { ascending: false }),
        p.role === 'admin'
          ? supabase.from('expenses').select('*').order('expense_date', { ascending: false })
          : Promise.resolve({ data: [] }),
        p.role === 'admin'
          ? supabase.from('profiles').select('*').order('room_number')
          : Promise.resolve({ data: [] }),
        supabase.from('settings').select('*'),
        supabase.from('contacts').select('*')
          .eq('active', true).order('sort_order')
      ]), 20000);

      for (const result of [d, pa, n, e, c, s, ct]) {
        if (result.error) throw result.error;
      }

      const summaryResult = await supabase.rpc('get_community_payment_summary', { target_month: new Date().toISOString().slice(0, 7) + '-01' });
      if (!summaryResult.error && summaryResult.data) setCommunitySummary(summaryResult.data);
      const settingsMap = Object.fromEntries((s.data || []).map(x => [x.key, x.value]));
      setMonthlyFee(String(settingsMap.monthly_maintenance ?? 500));
      setUpiId(String(settingsMap.upi_id ?? '').replace(/^['\"]+|['\"]+$/g, '').replace(/[\s,;]+/g, '').trim());
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
  const ownPaidTotal = data.dues.filter(x => x.room_number === profile?.room_number && x.status === 'paid').reduce((a, x) => a + Number(x.amount), 0);
  const pendingDueIds = new Set(data.payments.filter(p => p.status === 'pending').map(p => p.due_id));

  const currentMonth = new Date().toISOString().slice(0, 7);
  const paidRooms = new Set(
    data.payments
      .filter(x => x.status === 'approved' && x.created_at?.slice(0, 7) === currentMonth)
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

  function buildUpiLink(appScheme = 'upi://pay') {
    const params = new URLSearchParams({
      pa: String((import.meta.env.VITE_UPI_ID || data.settings.upi_id || '')).replace(/[\s,;]+/g, ''),
      pn: String(import.meta.env.VITE_UPI_NAME || 'Block 1 Management'),
      am: Number(selectedDue?.amount || 0).toFixed(2),
      cu: 'INR',
      tn: paymentReference,
      tr: paymentReference
    });
    return appScheme + '?' + params.toString();
  }

  async function createPayment(due) {
    setSelectedDue(due);
    setError('');
    const rawUpi = data.settings.upi_id || import.meta.env.VITE_UPI_ID || '';
    const upi = String(rawUpi).replace(/^['\"]+|['\"]+$/g, '').replace(/[\s,;]+/g, '').trim();
    const name = import.meta.env.VITE_UPI_NAME || 'Block 1 Management';

    if (!upi) {
      setError('Admin has not configured the UPI ID yet.');
      return;
    }
    if (!/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(upi)) {
      setError('The configured UPI ID appears invalid. Please ask the administrator to check the UPI ID in Settings.');
      return;
    }

    if (pendingDueIds.has(due.id)) {
      setError('Your payment is already submitted and awaiting admin approval. Please allow up to 12 hours.');
      return;
    }
    const monthDate = new Date(String(due.due_month).slice(0, 10) + 'T00:00:00');
    const monthLabelShort = monthDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    const monthCode = String(due.due_month).slice(0, 7).replace('-', '');
    const reference = 'B1-R' + profile.room_number + '-' + monthCode;
    const note = 'Block 1 Room ' + profile.room_number + ' ' + monthLabelShort + ' ' + reference;
    setPaymentReference(reference);

    const params = new URLSearchParams({
      pa: upi, pn: name, am: Number(due.amount).toFixed(2),
      cu: 'INR', tn: note, tr: reference
    });
    const genericLink = 'upi://pay?' + params.toString();
    setUpiPayLink(genericLink);

    try {
      setQr(await QRCode.toDataURL(genericLink, { width: 280, margin: 2, errorCorrectionLevel: 'M' }));
      setNotice('Pay ' + money(due.amount) + '. Include reference ' + reference + ' in your payment details if your UPI app allows it.');
    } catch {
      setError('Could not generate payment QR code.');
    }
  }

  function openUpiApp(scheme) {
    if (!selectedDue || !upiPayLink) return;
    const params = new URLSearchParams(upiPayLink.split('?')[1] || '');
    const appLinks = {
      gpay: 'tez://upi/pay?' + params.toString(),
      phonepe: 'phonepe://pay?' + params.toString(),
      paytm: 'paytmmp://pay?' + params.toString(),
      bhim: 'bhim://upi/pay?' + params.toString(),
      other: upiPayLink
    };
    window.location.href = appLinks[scheme] || upiPayLink;
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
        reference: paymentReference,
        status: 'pending'
      });

      if (error) throw error;

      setUtr('');
      setQr('');
      setSelectedDue(null);
      setUpiPayLink('');
      setPaymentReference('');
      setNotice('Payment submitted successfully. Approval is pending; please allow up to 12 hours. You cannot submit another payment for this due while it is pending.');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function recordOfflinePayment(e) {
    e.preventDefault();
    const due = data.dues.find(d => d.id === offlineDueId);
    if (!due) { setError('Select an outstanding due first.'); return; }
    const amount = Number(offlineAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter the amount actually received.'); return; }
    const receiptRef = 'B1-OFF-' + due.room_number + '-' + Date.now().toString().slice(-8);
    setActionBusy(true); setError(''); setNotice('');
    try {
      const { error } = await supabase.rpc('admin_record_offline_payment', {
        target_due_id: due.id, received_amount: amount, payment_mode: offlineMode,
        receipt_ref: receiptRef, note: offlineNote.trim() || null
      });
      if (error) throw error;
      const doc = new jsPDF({ unit: 'mm', format: 'a5' });
      doc.setFillColor(252, 239, 246); doc.rect(0, 0, 148, 34, 'F');
      doc.setTextColor(190, 55, 119); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
      doc.text('BLOCK 1', 14, 15); doc.setTextColor(45, 39, 51); doc.setFontSize(11); doc.text('PAYMENT RECEIPT', 14, 24);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      const lines = [
        ['Receipt number', receiptRef],
        ['Resident / room', (data.residents.find(r => r.room_number === due.room_number)?.full_name || 'Resident') + ' / ' + due.room_number],
        ['For', due.title + ' · ' + monthLabel(due.due_month)],
        ['Amount received', money(amount)],
        ['Payment mode', offlineMode.replace('_',' ').toUpperCase()],
        ['Date', new Date().toLocaleString('en-IN')],
        ['Admin note', offlineNote.trim() || '—']
      ];
      let y=48;
      lines.forEach(([label,value])=>{doc.setTextColor(120,105,117);doc.text(label,14,y);doc.setTextColor(45,39,51);doc.text(String(value),65,y);y+=12;});
      doc.setDrawColor(232,222,230);doc.line(14,y+2,134,y+2);
      doc.setFontSize(8);doc.setTextColor(120,105,117);doc.text('Computer-generated receipt · Block 1 Management',14,y+11);
      doc.save('Block1-Receipt-'+receiptRef+'.pdf');
      setOfflineDueId(''); setOfflineAmount(''); setOfflineNote('');
      setNotice('Offline payment recorded and approved. Receipt ' + receiptRef + ' downloaded.');
      await load({ silent: true });
    } catch (e) { setError(e.message || 'Unable to record offline payment.'); }
    finally { setActionBusy(false); }
  }

  async function deletePayment(payment) {
    const ok = window.confirm('Delete payment ' + (payment.utr || payment.id) + ' for Room ' + payment.room_number + '? The linked due will be recalculated. This cannot be undone.');
    if (!ok) return;
    setActionBusy(true); setError(''); setNotice('');
    try {
      const { error } = await supabase.rpc('admin_delete_payment', { target_payment_id: payment.id });
      if (error) throw error;
      setNotice('Payment record deleted. The linked due status was recalculated.');
      await load();
    } catch (e) { setError(e.message || 'Unable to delete payment record.'); }
    finally { setActionBusy(false); }
  }

  function openLiveFullscreen() {
    const root = document.getElementById('block1-live-screen');
    if (root?.requestFullscreen) root.requestFullscreen();
  }

  async function correctReceivedAmount(payment) {
    const entered = window.prompt('Enter the correct amount actually received for room ' + payment.room_number + ':', String(payment.amount));
    if (entered === null) return;
    const amount = Number(entered);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid received amount greater than zero.'); return; }
    setActionBusy(true); setError(''); setNotice('');
    try {
      const { error } = await supabase.rpc('admin_correct_payment_amount', {
        payment_id: payment.id,
        corrected_amount: amount
      });
      if (error) throw error;
      setNotice('Received amount corrected to ' + money(amount) + '. The linked due status has been recalculated.');
      await load();
    } catch (e) { setError(e.message || 'Unable to correct received amount.'); }
    finally { setActionBusy(false); }
  }

  async function deleteResident(roomNumber) {
    const resident = data.residents.find(r => String(r.room_number) === String(roomNumber));
    if (!resident) return;
    const confirmed = window.confirm(
      'Permanently delete the account for Room ' + roomNumber + '? This also deletes its dues and payment records. This cannot be undone.'
    );
    if (!confirmed) return;
    setActionBusy(true); setError(''); setNotice('');
    try {
      const { data: result, error } = await supabase.functions.invoke('admin-delete-resident', {
        body: { room_number: String(roomNumber) }
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setNotice('Resident account for Room ' + roomNumber + ' was deleted.');
      await load();
    } catch (e) { setError(e.message || 'Unable to delete resident.'); }
    finally { setActionBusy(false); }
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
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 13;
    const usable = W - M * 2;
    const month = new Date().toISOString().slice(0, 7);
    const monthDate = month + '-01';
    const monthText = monthLabel(monthDate);
    const generated = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    const dues = data.dues.filter(x => String(x.due_month).slice(0, 7) === month);
    const payments = data.payments.filter(x => String(x.created_at || '').slice(0, 7) === month);
    const expenses = data.expenses.filter(x => String(x.expense_date || '').slice(0, 7) === month);
    const fmt = n => 'INR ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const billed = dues.reduce((a, x) => a + Number(x.amount || 0), 0);
    const collected = payments.filter(x => x.status === 'approved').reduce((a, x) => a + Number(x.amount || 0), 0);
    const outstanding = dues.filter(x => x.status !== 'paid').reduce((a, x) => a + Number(x.amount || 0), 0);
    const expenseTotal = expenses.reduce((a, x) => a + Number(x.amount || 0), 0);
    const palette = { ink: [45, 39, 51], muted: [120, 105, 117], pink: [190, 55, 119], pale: [252, 240, 247], line: [232, 222, 230], head: [247, 241, 245], white: [255, 255, 255] };

    function header(section) {
      doc.setFillColor(...palette.pale);
      doc.rect(0, 0, W, 29, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.setTextColor(...palette.pink);
      doc.text('BLOCK 1', M, 13);
      doc.setFontSize(11);
      doc.setTextColor(...palette.ink);
      doc.text('MANAGEMENT', M + 27, 13);
      doc.setFontSize(14);
      doc.text(section, M, 23);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...palette.muted);
      doc.text(monthText + '  |  Generated ' + generated, W - M, 23, { align: 'right' });
      doc.setDrawColor(...palette.line);
      doc.line(M, 31, W - M, 31);
    }

    function footer() {
      const count = doc.internal.getNumberOfPages();
      for (let i = 1; i <= count; i++) {
        doc.setPage(i);
        doc.setDrawColor(...palette.line);
        doc.line(M, H - 9, W - M, H - 9);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...palette.muted);
        doc.text('Block 1 Management  |  Community financial statement', M, H - 4);
        doc.text('Page ' + i + ' of ' + count, W - M, H - 4, { align: 'right' });
      }
    }

    function tableHead(y, columns) {
      doc.setFillColor(...palette.head);
      doc.rect(M, y, usable, 9, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...palette.muted);
      columns.forEach(c => doc.text(c.label, c.x + 2, y + 6));
      return y + 9;
    }

    function tableRow(y, columns, values, index, rowHeight = 8) {
      if (index % 2 === 1) {
        doc.setFillColor(253, 250, 252);
        doc.rect(M, y, usable, rowHeight, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...palette.ink);
      columns.forEach((c, i) => {
        const text = String(values[i] ?? '-');
        if (c.align === 'right') doc.text(text, c.x + c.w - 2, y + 5.5, { align: 'right' });
        else doc.text(doc.splitTextToSize(text, c.w - 4)[0] || '-', c.x + 2, y + 5.5);
      });
      doc.setDrawColor(...palette.line);
      doc.line(M, y + rowHeight, W - M, y + rowHeight);
      return y + rowHeight;
    }

    header('Monthly collection and dues report');
    let y = 39;
    const cards = [
      ['TOTAL BILLED', fmt(billed)],
      ['APPROVED COLLECTION', fmt(collected)],
      ['OUTSTANDING', fmt(outstanding)],
      ['EXPENSES', fmt(expenseTotal)]
    ];
    const gap = 5;
    const cardW = (usable - gap * 3) / 4;
    cards.forEach((c, i) => {
      const x = M + i * (cardW + gap);
      doc.setFillColor(...palette.white);
      doc.setDrawColor(...palette.line);
      doc.roundedRect(x, y, cardW, 19, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...palette.muted);
      doc.text(c[0], x + 4, y + 7);
      doc.setFontSize(11);
      doc.setTextColor(...palette.ink);
      doc.text(c[1], x + 4, y + 14);
    });
    y += 27;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...palette.ink);
    doc.text('Resident-wise monthly ledger', M, y);
    y += 5;

    const colWidths = [23, 57, 42, 42, 48, usable - 212];
    let cursor = M;
    const cols = ['ROOM', 'RESIDENT', 'BILLED', 'PAID', 'BALANCE', 'STATUS'].map((label, i) => {
      const col = { label, x: cursor, w: colWidths[i], align: i >= 2 && i <= 4 ? 'right' : 'left' };
      cursor += colWidths[i];
      return col;
    });
    y = tableHead(y, cols);
    const residents = data.residents.filter(r => r.role === 'resident')
      .sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true }));
    if (!residents.length) {
      y = tableRow(y, cols, ['-', 'No resident accounts', '-', '-', '-', '-'], 0);
    }
    residents.forEach((r, i) => {
      if (y > H - 19) {
        doc.addPage(); header('Resident ledger - continued'); y = 39; y = tableHead(y, cols);
      }
      const rd = dues.filter(d => d.room_number === r.room_number);
      const bill = rd.reduce((a, d) => a + Number(d.amount || 0), 0);
      const paid = rd.filter(d => d.status === 'paid').reduce((a, d) => a + Number(d.amount || 0), 0);
      const balance = rd.filter(d => d.status !== 'paid').reduce((a, d) => a + Number(d.amount || 0), 0);
      const status = !rd.length ? 'No charge' : balance === 0 ? 'Paid' : paid ? 'Part paid' : 'Unpaid';
      y = tableRow(y, cols, [r.room_number, r.full_name || '-', fmt(bill), fmt(paid), fmt(balance), status], i);
    });

    doc.addPage();
    header('Payment verification and expense register');
    y = 40;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...palette.ink);
    doc.text('Payment requests for ' + monthText, M, y);
    y += 5;
    const payCols = [
      { label: 'ROOM', x: M, w: 24 },
      { label: 'UTR / REFERENCE', x: M + 24, w: 110 },
      { label: 'AMOUNT', x: M + 134, w: 55, align: 'right' },
      { label: 'STATUS', x: M + 189, w: usable - 189 }
    ];
    y = tableHead(y, payCols);
    if (!payments.length) y = tableRow(y, payCols, ['-', 'No payment requests this month', '-', '-'], 0);
    payments.forEach((p, i) => {
      if (y > H - 19) { doc.addPage(); header('Payment requests - continued'); y = 40; y = tableHead(y, payCols); }
      y = tableRow(y, payCols, [p.room_number, (p.utr || '-') + (p.reference ? ' / ' + p.reference : ''), fmt(p.amount), String(p.status || '').toUpperCase()], i);
    });

    y += 10;
    if (y > H - 40) { doc.addPage(); header('Expense register - continued'); y = 40; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...palette.ink);
    doc.text('Expense register', M, y);
    y += 5;
    const expCols = [
      { label: 'DATE', x: M, w: 35 },
      { label: 'EXPENSE / DETAILS', x: M + 35, w: usable - 95 },
      { label: 'AMOUNT', x: W - M - 60, w: 60, align: 'right' }
    ];
    y = tableHead(y, expCols);
    if (!expenses.length) y = tableRow(y, expCols, ['-', 'No expenses recorded this month', '-'], 0);
    expenses.forEach((e, i) => {
      if (y > H - 19) { doc.addPage(); header('Expense register - continued'); y = 40; y = tableHead(y, expCols); }
      y = tableRow(y, expCols, [e.expense_date, (e.title || 'Expense') + (e.description ? ' - ' + e.description : ''), fmt(e.amount)], i);
    });
    footer();
    doc.save('block-1-monthly-report-' + month + '.pdf');
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
      ['live-tv', 'Block 1 Live Updates', CalendarDays],
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
                      onEditAmount={correctReceivedAmount}
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
                    <span className="eyebrow">YOUR OUTSTANDING BALANCE</span>
                    <h1>{money(ownTotal)}</h1>
                    <p>
                      {ownDues.length
                        ? `${ownDues.length} unpaid item(s) need your attention.`
                        : 'You are all caught up. Thank you!'}
                    </p>
                  </div>
                  <Wallet size={38} />
                </div>
                <div className="stats-grid resident-community-stats">
                  <Stat icon={Users} label="Total rooms" value={communitySummary?.total_rooms ?? 108} />
                  <Stat icon={CheckCircle2} label="Rooms paid this month" value={communitySummary?.paid_rooms ?? 0} tone="green" />
                  <Stat icon={Clock3} label="Rooms not yet paid" value={communitySummary?.unpaid_rooms ?? 108} tone="amber" />
                  <Stat icon={IndianRupee} label="Community amount collected" value={money(communitySummary?.amount_collected ?? 0)} tone="pink" />
                  <Stat icon={Wallet} label="Your paid amount" value={money(ownPaidTotal)} tone="rose" />
                </div>

                <div className="content-grid">
                  <section className="panel">
                    <PanelTitle title="Your pending dues" action={() => setPage('dues')} />
                    <DueList dues={ownDues.slice(0, 5)} onPay={createPayment} pendingDueIds={pendingDueIds} />
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
              <>
                <form onSubmit={createDues} className="admin-form">
                  <h3>Create charges for residents</h3>
                  <div className="form-grid">
                    <div><label>Charge title</label><input value={dueTitle} onChange={e => setDueTitle(e.target.value)} required /></div>
                    <div><label>Amount (₹)</label><input type="number" min="1" step="0.01" value={dueAmount} onChange={e => setDueAmount(e.target.value)} required /></div>
                    <div><label>Month</label><input type="date" value={dueMonth} onChange={e => setDueMonth(e.target.value)} required /></div>
                    <div><label>Apply to</label><select value={dueScope} onChange={e => setDueScope(e.target.value)}><option value="all">All active residents</option><option value="custom">Specific rooms</option></select></div>
                    {dueScope === 'custom' && <div className="wide"><label>Room numbers (comma or space separated)</label><textarea value={dueRooms} onChange={e => setDueRooms(e.target.value)} placeholder="101, 102, 201" required /></div>}
                    <div className="wide"><label>Description</label><input value={dueDescription} onChange={e => setDueDescription(e.target.value)} placeholder="Optional details" /></div>
                  </div>
                  <div className="form-actions">
                    <button className="primary" disabled={actionBusy}>{actionBusy ? 'Creating…' : 'Create dues'}</button>
                    <button type="button" className="secondary" disabled={actionBusy} onClick={generateMonthlyDues}>Generate monthly maintenance</button>
                  </div>
                </form>
                <h3>All dues ({data.dues.length})</h3>
                <div className="table-wrap"><table><thead><tr><th>Room</th><th>Charge</th><th>Month</th><th>Amount</th><th>Status</th></tr></thead><tbody>
                  {data.dues.map(d => <tr key={d.id}><td>{d.room_number}</td><td>{d.title}</td><td>{monthLabel(d.due_month)}</td><td>{money(d.amount)}</td><td><span className={`status ${d.status}`}>{d.status}</span></td></tr>)}
                </tbody></table></div>
              </>
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
                    {pendingDueIds.has(d.id) ? (
                      <span className="status pending">Approval pending · up to 12h</span>
                    ) : (
                      <button className="primary compact" onClick={() => createPayment(d)}>Pay now</button>
                    )}
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
                    <h3>Pay maintenance</h3>
                    <div className="payment-amount">{money(selectedDue?.amount)}</div>
                    <p className="payment-reference">Reference: <b>{paymentReference}</b></p>
                    <div className="upi-app-buttons">
                      <button type="button" className="upi-app gpay" onClick={() => openUpiApp('gpay')}>Google Pay</button>
                      <button type="button" className="upi-app phonepe" onClick={() => openUpiApp('phonepe')}>PhonePe</button>
                      <button type="button" className="upi-app paytm" onClick={() => openUpiApp('paytm')}>Paytm</button>
                      <button type="button" className="upi-app other" onClick={() => openUpiApp('other')}>Other UPI apps</button>
                    </div>
                    <p className="muted">Or scan this QR code with any UPI app.</p>
                    <img src={qr} alt="UPI payment QR code" />
                    <p className="tiny muted">The reference is included in the UPI payment request. If your app does not carry it across, enter the UTR below after paying.</p>
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
            {isAdmin && <form onSubmit={createNotice} className="admin-form">
              <h3>Publish a notice</h3>
              <label>Title</label><input value={noticeTitle} onChange={e => setNoticeTitle(e.target.value)} required />
              <label>Description</label><textarea value={noticeDescription} onChange={e => setNoticeDescription(e.target.value)} required />
              <button className="primary" disabled={actionBusy}>{actionBusy ? 'Publishing…' : 'Publish notice'}</button>
            </form>}
            {data.notices.map(n => <div key={n.id} className="notice-admin-row"><NoticeList notices={[n]} />{isAdmin && <button className="reject" onClick={() => deleteNotice(n.id)}>Delete</button>}</div>)}
            {!data.notices.length && <Empty text="No notices have been published yet." />}
            {!data.notices.length && <Empty text="No notices have been published yet." />}
          </section>
        )}

        {page === 'contacts' && (
          <section className="panel">
            <PanelTitle title="Important contacts" />
            {isAdmin && <form onSubmit={createContact} className="admin-form">
              <h3>Add an important contact</h3>
              <div className="form-grid">
                <div><label>Contact name</label><input value={contactName} onChange={e => setContactName(e.target.value)} required placeholder="Lift Emergency" /></div>
                <div><label>Role / description</label><input value={contactRole} onChange={e => setContactRole(e.target.value)} required placeholder="Emergency support" /></div>
                <div><label>Phone number</label><input value={contactPhone} onChange={e => setContactPhone(e.target.value)} required placeholder="+91…" /></div>
                <div><label>Category</label><select value={contactKind} onChange={e => setContactKind(e.target.value)}><option value="general">General</option><option value="admin">Admin</option><option value="emergency">Emergency</option><option value="complaint">Complaint</option></select></div>
              </div>
              <button className="primary" disabled={actionBusy}>{actionBusy ? 'Saving…' : 'Add contact'}</button>
            </form>}
            <div className="contact-grid">
              {(data.contacts.length ? data.contacts : [
                { name: 'Block Administrator', role: 'Admin', phone: '', kind: 'admin' },
                { name: 'Lift Emergency', role: 'Emergency support', phone: '', kind: 'emergency' },
                { name: 'Maintenance Complaint', role: 'Complaints', phone: '', kind: 'complaint' }
              ]).map(c => (
                <div className="contact-card" key={c.id || c.kind}>
                  <div className="contact-icon"><Phone /></div>
                  <b>{c.name}</b>
                  <small>{c.role_label || c.role}</small>
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
                  {isAdmin && c.id && <button className="reject" onClick={() => deleteContact(c.id)}>Remove contact</button>}
                </div>
              ))}
            </div>
          </section>
        )}

        {page === 'payments' && isAdmin && (
          <section className="panel">
            <PanelTitle title="Payment verification" />
            <p className="muted">Verify UTRs against the actual account statement. Offline receipts are recorded as approved payments.</p>
            <form className="admin-form" onSubmit={recordOfflinePayment}>
              <h3>Record an offline payment / issue receipt</h3>
              <div className="form-grid">
                <div className="wide"><label>Outstanding resident due</label><select value={offlineDueId} onChange={e=>{const d=data.dues.find(x=>x.id===e.target.value);setOfflineDueId(e.target.value);setOfflineAmount(d?String(d.amount):'');}} required>
                  <option value="">Select room and due</option>
                  {data.dues.filter(d=>d.status!=='paid').map(d=><option key={d.id} value={d.id}>Room {d.room_number} · {d.title} · {monthLabel(d.due_month)} · {money(d.amount)}</option>)}
                </select></div>
                <div><label>Amount actually received (₹)</label><input type="number" min="0.01" step="0.01" value={offlineAmount} onChange={e=>setOfflineAmount(e.target.value)} required /></div>
                <div><label>Payment method</label><select value={offlineMode} onChange={e=>setOfflineMode(e.target.value)}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="upi">UPI received by admin</option><option value="cheque">Cheque</option><option value="other">Other</option></select></div>
                <div className="wide"><label>Notes (optional)</label><input value={offlineNote} onChange={e=>setOfflineNote(e.target.value)} placeholder="Collected in person / transaction detail" /></div>
              </div>
              <button className="primary" disabled={actionBusy}>{actionBusy?'Recording…':'Record payment & download receipt'}</button>
            </form>
            <PaymentList payments={data.payments} admin onDecision={decidePayment} onEditAmount={correctReceivedAmount} onDelete={deletePayment} />
          </section>
        )}

        {page === 'residents' && isAdmin && (
          <section className="panel">
            <PanelTitle title="Residents" />
            <form onSubmit={createResident} style={{
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: '12px',
  padding: '18px',
  marginBottom: '20px',
  background: '#fff8fb',
  border: '1px solid #f1e5eb',
  borderRadius: '12px'
}}>
  <div>
    <label>Room number</label>
    <input
      value={residentRoom}
      onChange={e => setResidentRoom(e.target.value)}
      placeholder="e.g. 101"
      required
    />
  </div>

  <div>
    <label>Resident name</label>
    <input
      value={residentName}
      onChange={e => setResidentName(e.target.value)}
      placeholder="Full name"
      required
    />
  </div>

  <div>
    <label>Mobile number</label>
    <input
      type="tel"
      value={residentPhone}
      onChange={e => setResidentPhone(e.target.value)}
      placeholder="10-digit mobile number"
      required
    />
  </div>

  <div>
    <label>Initial password</label>
    <input
      type="password"
      value={residentPassword}
      onChange={e => setResidentPassword(e.target.value)}
      placeholder="Minimum 8 characters"
      minLength={8}
      required
    />
  </div>

  <div style={{ gridColumn: '1 / -1' }}>
    <button
      className="primary"
      type="submit"
      disabled={residentBusy}
    >
      {residentBusy ? 'Creating account...' : '+ Add Resident'}
    </button>
  </div>
</form>

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
                    <th>Room</th><th>Resident</th><th>Mobile</th><th>Role</th><th>Status</th><th>Account</th>
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
                        <td><span className={`status ${r.active ? 'paid' : 'rejected'}`}>{r.active ? 'Active' : 'Inactive'}</span></td>
                        <td>{r.role === 'resident' && <div className="resident-actions"><button className="secondary" disabled={actionBusy} onClick={() => resetResidentPassword(r.room_number)}>Reset password</button><button className="danger-outline" disabled={actionBusy} onClick={() => deleteResident(r.room_number)}>Delete</button></div>}</td>
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

        {page === 'live-tv' && isAdmin && (
          <section className="live-tv-shell" id="block1-live-screen">
            <div className="live-tv-top">
              <div><span className="live-kicker">BLOCK 1 RESIDENTIAL COMMUNITY</span><h1>Block 1 Live Updates</h1><p>Community payment and notice board</p></div>
              <div className="live-clock"><b>{liveClock.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</b><span>{liveClock.toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</span><button className="secondary" onClick={openLiveFullscreen}>⛶ Full screen</button></div>
            </div>
            <div className="live-stats">
              <div><span>Total rooms</span><b>{communitySummary?.total_rooms ?? 108}</b></div>
              <div><span>Paid rooms</span><b>{communitySummary?.paid_rooms ?? 0}</b></div>
              <div><span>Unpaid rooms</span><b>{communitySummary?.unpaid_rooms ?? 108}</b></div>
              <div><span>Collected this month</span><b>{money(communitySummary?.amount_collected ?? 0)}</b></div>
              <div><span>Pending approvals</span><b>{data.payments.filter(p=>p.status==='pending').length}</b></div>
            </div>
            <div className="live-tv-grid">
              <section className="live-tv-card"><h2>Recent payments</h2>
                {data.payments.filter(p=>p.status==='approved').slice(0,8).map(p=><div className="live-feed-row" key={p.id}><b>Room {p.room_number}</b><span>{money(p.amount)}</span><small>{p.payment_method ? p.payment_method.replace('_',' ') : 'UPI'} · {new Date(p.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</small></div>)}
                {!data.payments.some(p=>p.status==='approved')&&<p className="muted">No approved payments yet.</p>}
              </section>
              <section className="live-tv-card"><h2>Awaiting verification</h2>
                {data.payments.filter(p=>p.status==='pending').slice(0,8).map(p=><div className="live-feed-row pending-feed" key={p.id}><b>Room {p.room_number}</b><span>{money(p.amount)}</span><small>Submitted {new Date(p.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</small></div>)}
                {!data.payments.some(p=>p.status==='pending')&&<p className="muted">No pending approvals.</p>}
              </section>
              <section className="live-tv-card live-notices"><h2>Community notices</h2>
                {data.notices.slice(0,5).map(n=><div className="live-notice-row" key={n.id}><b>{n.title}</b><p>{n.description}</p></div>)}
                {!data.notices.length&&<p className="muted">No active notices.</p>}
              </section>
            </div>
            <div className="live-tv-bottom"><span>LIVE · Auto refresh every 30 seconds</span><span>Last updated {liveLastUpdated.toLocaleTimeString('en-IN')}</span><button className="secondary" onClick={()=>load({silent:true})}>Refresh now</button></div>
          </section>
        )}

        {page === 'expenses' && isAdmin && (
          <section className="panel">
            <PanelTitle title="Block expenses" />
            <form onSubmit={createExpense} className="admin-form">
              <h3>Record a new expense</h3>
              <div className="form-grid">
                <div><label>Expense name</label><input value={expenseTitle} onChange={e => setExpenseTitle(e.target.value)} required /></div>
                <div><label>Amount (₹)</label><input type="number" min="0.01" step="0.01" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} required /></div>
                <div><label>Date</label><input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required /></div>
                <div><label>Description</label><input value={expenseDescription} onChange={e => setExpenseDescription(e.target.value)} /></div>
              </div>
              <button className="primary" disabled={actionBusy}>{actionBusy ? 'Saving…' : 'Add expense'}</button>
            </form>
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
            <form onSubmit={saveSettings} className="admin-form">
              <h3>Payment and maintenance settings</h3>
              <label>Monthly maintenance (₹)</label><input type="number" min="1" step="0.01" value={monthlyFee} onChange={e => setMonthlyFee(e.target.value)} required />
              <label>UPI ID / VPA</label><input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="name@bank" />
              <button className="primary" disabled={actionBusy}>{actionBusy ? 'Saving…' : 'Save settings'}</button>
            </form>
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

function DueList({ dues, onPay, pendingDueIds = new Set() }) {
  return dues.length
    ? dues.map(d => (
      <div className="due-row" key={d.id}>
        <div>
          <b>{d.title}</b>
          <small>{monthLabel(d.due_month)}</small>
        </div>
        <strong>{money(d.amount)}</strong>
        {pendingDueIds.has(d.id)
          ? <span className="status pending">Approval pending · up to 12h</span>
          : <button className="primary compact" onClick={() => onPay(d)}>Pay now</button>}
      </div>
    ))
    : <Empty text="No pending dues." />;
}

function PaymentList({ payments, admin, onDecision, onEditAmount, onDelete }) {
  return payments.length
    ? payments.map(p => (
      <div className="payment-row" key={p.id}>
        <div className="payment-avatar">{String(p.room_number).slice(-2)}</div>
        <div className="payment-info">
          <b>Room {p.room_number} · {money(p.amount)}</b>
          <small>
            UTR: {p.utr} · {new Date(p.created_at).toLocaleString('en-IN')}
            {p.reference ? ` · Ref: ${p.reference}` : ''}
          </small>
        </div>
        <span className={`status ${p.status}`}>{p.status}</span>
        {admin && <div className="decision">
          <button className="secondary" onClick={() => onEditAmount(p)}>Edit amount</button>
          {p.status === 'pending' && <>
            <button className="approve" onClick={() => onDecision(p, 'approved')}>Approve</button>
            <button className="reject" onClick={() => onDecision(p, 'rejected')}>Reject</button>
          </>}
          {onDelete && <button className="danger-outline" onClick={() => onDelete(p)}>Delete</button>}
        </div>}
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

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('Block 1 render error:', error); }
  render() {
    if (this.state.error) return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Block 1 <span>Management</span></h1>
          <p className="error">The app encountered an error while opening.</p>
          <p className="tiny muted">{String(this.state.error?.message || this.state.error)}</p>
          <button className="primary full" onClick={() => window.location.reload()}>Reload application</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary><App /></AppErrorBoundary>
);
