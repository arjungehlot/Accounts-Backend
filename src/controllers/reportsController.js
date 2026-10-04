import Invoice  from '../models/Invoice.js';
import Payment  from '../models/Payment.js';
import Expense  from '../models/Expense.js';
import Client   from '../models/Client.js';
import { subMonths, subQuarters, startOfYear, format } from 'date-fns';

// ── helpers ───────────────────────────────────────────────────────────────────
function getDateBounds(period) {
  const now   = new Date();
  const today = format(now, 'yyyy-MM-dd');

  if (period === 'this_month') {
    const start = format(now, 'yyyy-MM') + '-01';
    const end   = today;
    return { start, end };
  }
  if (period === 'last_month') {
    const d = subMonths(now, 1);
    const start = format(d, 'yyyy-MM') + '-01';
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start, end: format(lastDay, 'yyyy-MM-dd') };
  }
  if (period === 'this_quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const start = format(new Date(now.getFullYear(), q * 3, 1), 'yyyy-MM-dd');
    return { start, end: today };
  }
  if (period === 'this_year') {
    const start = format(startOfYear(now), 'yyyy-MM-dd');
    return { start, end: today };
  }
  // 'all_time' — no filter
  return { start: '2000-01-01', end: '2099-12-31' };
}

function inBounds(dateStr, start, end) {
  if (!dateStr) return false;
  const d = (dateStr || '').slice(0, 10);
  return d >= start && d <= end;
}

function formatRupee(n) {
  return Number(n || 0);
}

// ── GET /api/reports/summary?period=this_month ────────────────────────────────
export const getReportSummary = async (req, res, next) => {
  try {
    const { period = 'this_month' } = req.query;
    const { start, end } = getDateBounds(period);
    const { start: prevStart, end: prevEnd } = getDateBounds(
      period === 'this_month' ? 'last_month' : 'all_time'
    );

    const [allInvoices, allPayments, allExpenses] = await Promise.all([
      Invoice.find({ status: { $ne: 'cancelled' } }).lean(),
      Payment.find().lean(),
      Expense.find().lean(),
    ]);

    const fInvoices = allInvoices.filter(i => inBounds(i.invoiceDate, start, end));
    const fPayments = allPayments.filter(p => inBounds(p.paymentDate, start, end));
    const fExpenses = allExpenses.filter(e => inBounds(e.date, start, end));

    const pInvoices = allInvoices.filter(i => inBounds(i.invoiceDate, prevStart, prevEnd));
    const pPayments = allPayments.filter(p => inBounds(p.paymentDate, prevStart, prevEnd));
    const pExpenses = allExpenses.filter(e => inBounds(e.date, prevStart, prevEnd));

    const totalInvoiced    = fInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
    const totalReceived    = fPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const totalExpenses    = fExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const netIncome        = totalReceived - totalExpenses;

    // Compute outstanding properly
    const paidMap = {};
    allPayments.forEach(p => {
      const id = p.invoiceId?.toString();
      if (id) paidMap[id] = (paidMap[id] || 0) + (p.amount || 0);
    });
    const outstanding = fInvoices.reduce((s, inv) => {
      const paid = paidMap[inv._id.toString()] || 0;
      return s + Math.max(0, (inv.grandTotal || 0) - paid);
    }, 0);

    // Trends vs prev period
    const prevInvoiced  = pInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
    const prevReceived  = pPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const prevExpenses  = pExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const prevNet       = prevReceived - prevExpenses;

    const pct = (cur, prev) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

    res.json({
      success: true,
      data: {
        invoiced:   { value: totalInvoiced,  count: fInvoices.length,  trend: pct(totalInvoiced, prevInvoiced) },
        received:   { value: totalReceived,  count: fPayments.length,  trend: pct(totalReceived, prevReceived) },
        outstanding:{ value: outstanding,    count: fInvoices.filter(i => (paidMap[i._id.toString()] || 0) < i.grandTotal).length, trend: 0 },
        expenses:   { value: totalExpenses,  count: fExpenses.length,  trend: pct(totalExpenses, prevExpenses) },
        netIncome:  { value: netIncome,      trend: pct(netIncome, prevNet) },
      },
    });
  } catch (err) { next(err); }
};

// ── GET /api/reports/monthly?months=12 ───────────────────────────────────────
export const getMonthlyChart = async (req, res, next) => {
  try {
    const numMonths = Math.min(24, parseInt(req.query.months || 12, 10));
    const [allInvoices, allPayments, allExpenses] = await Promise.all([
      Invoice.find({ status: { $ne: 'cancelled' } }).lean(),
      Payment.find().lean(),
      Expense.find().lean(),
    ]);

    const data = [];
    for (let i = numMonths - 1; i >= 0; i--) {
      const d   = subMonths(new Date(), i);
      const mon = format(d, 'yyyy-MM');
      const income   = allPayments.filter(p => (p.paymentDate || '').startsWith(mon)).reduce((s, p) => s + (p.amount || 0), 0);
      const expenses = allExpenses.filter(e => (e.date || '').startsWith(mon)).reduce((s, e) => s + (e.amount || 0), 0);
      data.push({
        month:    format(d, 'MMM'),
        fullMonth: format(d, 'MMM yyyy'),
        income,
        expenses,
        netIncome: income - expenses,
      });
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ── GET /api/reports/expense-categories?period=this_month ────────────────────
export const getExpenseCategories = async (req, res, next) => {
  try {
    const { period = 'this_month' } = req.query;
    const { start, end } = getDateBounds(period);

    const expenses = await Expense.find({
      date: { $gte: start, $lte: end },
    }).lean();

    const catMap = {};
    const total  = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    expenses.forEach(e => {
      catMap[e.category] = (catMap[e.category] || 0) + (e.amount || 0);
    });

    const categories = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({
        name,
        amount,
        pct: total > 0 ? Math.round((amount / total) * 100) : 0,
      }));

    res.json({ success: true, data: { categories, total } });
  } catch (err) { next(err); }
};

// ── GET /api/reports/recent-transactions?period=this_month&limit=10 ──────────
export const getRecentTransactions = async (req, res, next) => {
  try {
    const { period = 'this_month', limit = 10 } = req.query;
    const { start, end } = getDateBounds(period);

    const [payments, expenses] = await Promise.all([
      Payment.find({ paymentDate: { $gte: start, $lte: end } })
        .populate('clientId', 'clientName')
        .populate('invoiceId', 'invoiceNumber')
        .sort({ paymentDate: -1 })
        .limit(Number(limit))
        .lean(),
      Expense.find({ date: { $gte: start, $lte: end } })
        .sort({ date: -1 })
        .limit(Number(limit))
        .lean(),
    ]);

    const txns = [
      ...payments.map(p => ({
        id:       p._id,
        type:     'payment',
        title:    'Payment Received',
        subtitle: p.clientId?.clientName || 'Client Payment',
        amount:   p.amount,
        date:     p.paymentDate,
        positive: true,
      })),
      ...expenses.map(e => ({
        id:       e._id,
        type:     'expense',
        title:    e.category + ' Expense',
        subtitle: e.description || e.category,
        amount:   e.amount,
        date:     e.date,
        positive: false,
      })),
    ]
      .sort((a, b) => (b.date > a.date ? 1 : -1))
      .slice(0, Number(limit));

    res.json({ success: true, data: txns });
  } catch (err) { next(err); }
};

// ── GET /api/reports/client-report?period=this_month ─────────────────────────
export const getClientReport = async (req, res, next) => {
  try {
    const { period = 'this_month' } = req.query;
    const { start, end } = getDateBounds(period);

    const [allClients, allInvoices, allPayments] = await Promise.all([
      Client.find().lean(),
      Invoice.find({ status: { $ne: 'cancelled' } }).lean(),
      Payment.find().lean(),
    ]);

    const paidMap = {};
    allPayments.forEach(p => {
      const id = p.invoiceId?.toString();
      if (id) paidMap[id] = (paidMap[id] || 0) + (p.amount || 0);
    });

    const fInvoices = allInvoices.filter(i => inBounds(i.invoiceDate, start, end));
    const fPayments = allPayments.filter(p => inBounds(p.paymentDate, start, end));

    const report = allClients.map(c => {
      const cid = c._id.toString();
      const invs = fInvoices.filter(i => i.clientId?.toString() === cid);
      const pays = fPayments.filter(p => p.clientId?.toString() === cid);
      const invoiced   = invs.reduce((s, i) => s + (i.grandTotal || 0), 0);
      const received   = pays.reduce((s, p) => s + (p.amount || 0), 0);
      const outstanding = Math.max(0, invoiced - received);
      const rate = invoiced > 0 ? Math.round((received / invoiced) * 100) : 0;
      return { id: cid, name: c.clientName, company: c.companyName || '', invoiced, received, outstanding, rate };
    }).filter(c => c.invoiced > 0 || c.received > 0).sort((a, b) => b.invoiced - a.invoiced);

    res.json({ success: true, data: report });
  } catch (err) { next(err); }
};

// ── GET /api/reports/invoice-summary?period=this_month ───────────────────────
export const getInvoiceSummary = async (req, res, next) => {
  try {
    const { period = 'this_month' } = req.query;
    const { start, end } = getDateBounds(period);

    const [allInvoices, allPayments, allClients] = await Promise.all([
      Invoice.find({ status: { $ne: 'cancelled' }, invoiceDate: { $gte: start, $lte: end } }).lean(),
      Payment.find().lean(),
      Client.find().lean(),
    ]);

    const paidMap = {};
    allPayments.forEach(p => {
      const id = p.invoiceId?.toString();
      if (id) paidMap[id] = (paidMap[id] || 0) + (p.amount || 0);
    });

    const today = format(new Date(), 'yyyy-MM-dd');
    const invoices = allInvoices.map(inv => {
      const paid = paidMap[inv._id.toString()] || 0;
      const client = allClients.find(c => c._id.toString() === inv.clientId?.toString());
      let status = inv.status;
      if (status !== 'draft') {
        if (paid >= inv.grandTotal) status = 'paid';
        else if (paid > 0) status = 'partial';
        else if (inv.dueDate && inv.dueDate < today) status = 'overdue';
        else status = 'sent';
      }
      return {
        id:            inv._id,
        invoiceNumber: inv.invoiceNumber,
        clientName:    client?.clientName || '—',
        date:          inv.invoiceDate,
        dueDate:       inv.dueDate,
        total:         inv.grandTotal || 0,
        paid,
        balance:       Math.max(0, (inv.grandTotal || 0) - paid),
        status,
      };
    });

    // Status distribution
    const statusDist = {};
    invoices.forEach(i => { statusDist[i.status] = (statusDist[i.status] || 0) + 1; });

    res.json({ success: true, data: { invoices, statusDist } });
  } catch (err) { next(err); }
};
