import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Expense from '../models/Expense.js';
import Client from '../models/Client.js';
import Activity from '../models/Activity.js';
import Quotation from '../models/Quotation.js';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

// GET /api/dashboard
export const getDashboard = async (req, res, next) => {
  try {
    const today     = new Date().toISOString().slice(0, 10);
    const thisMonth = format(new Date(), 'yyyy-MM');

    const [allInvoices, allPayments, allExpenses, allClients, allQuotations] = await Promise.all([
      Invoice.find({ status: { $ne: 'cancelled' } }).lean(),
      Payment.find().lean(),
      Expense.find().lean(),
      Client.find().lean(),
      Quotation.find().select('-data').populate('clientId', 'clientName companyName').sort({ createdAt: -1 }).lean(),
    ]);

    // Totals
    const totalInvoiced  = allInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
    const totalReceived  = allPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const totalExpenses  = allExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const paidFor        = (id) => allPayments.filter(p => p.invoiceId?.toString() === id.toString()).reduce((s, p) => s + (p.amount || 0), 0);
    const outstanding    = allInvoices
      .filter(inv => inv.status !== 'draft')
      .reduce((s, inv) => s + Math.max(0, (inv.grandTotal || 0) - paidFor(inv._id)), 0);
    const netIncome      = totalReceived - totalExpenses;

    // Overdue
    const overdueAmount  = allInvoices
      .filter(inv => inv.dueDate && inv.dueDate < today)
      .reduce((s, inv) => {
        const paid = allPayments.filter(p => p.invoiceId?.toString() === inv._id.toString()).reduce((ps, p) => ps + p.amount, 0);
        return s + Math.max(0, (inv.grandTotal || 0) - paid);
      }, 0);

    // This month
    const thisMonthInvoiced = allInvoices
      .filter(i => (i.invoiceDate || '').startsWith(thisMonth))
      .reduce((s, i) => s + (i.grandTotal || 0), 0);
    const thisMonthReceived = allPayments
      .filter(p => (p.paymentDate || '').startsWith(thisMonth))
      .reduce((s, p) => s + (p.amount || 0), 0);

    // Status counts
    const statusCounts = { draft: 0, sent: 0, partial: 0, paid: 0, overdue: 0, cancelled: 0 };
    for (const inv of allInvoices) {
      const paid = allPayments.filter(p => p.invoiceId?.toString() === inv._id.toString()).reduce((s, p) => s + p.amount, 0);
      let status = inv.status;
      if (status !== 'cancelled' && status !== 'draft') {
        if (paid >= inv.grandTotal) status = 'paid';
        else if (inv.dueDate && inv.dueDate < today) status = 'overdue';
        else if (paid > 0) status = 'partial';
        else status = 'sent';
      }
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    // Monthly revenue for chart (last 6 months)
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const d   = subMonths(new Date(), i);
      const mon = format(d, 'yyyy-MM');
      const label = format(d, 'MMM yyyy');
      const invoiced = allInvoices.filter(inv => (inv.invoiceDate || '').startsWith(mon)).reduce((s, inv) => s + (inv.grandTotal || 0), 0);
      const received = allPayments.filter(p => (p.paymentDate || '').startsWith(mon)).reduce((s, p) => s + (p.amount || 0), 0);
      const expenses = allExpenses.filter(e => (e.date || '').startsWith(mon)).reduce((s, e) => s + (e.amount || 0), 0);
      monthlyData.push({ month: label, invoiced, received, expenses });
    }

    // Top clients by revenue
    const clientTotals = {};
    allPayments.forEach(p => {
      const cid = p.clientId?.toString();
      if (cid) clientTotals[cid] = (clientTotals[cid] || 0) + (p.amount || 0);
    });
    const topClients = Object.entries(clientTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([clientId, amount]) => {
        const client = allClients.find(c => c._id.toString() === clientId);
        return { clientId, name: client?.clientName || 'Unknown', company: client?.companyName || '', amount };
      });

    // Quotation pipeline
    const qStatus = (q) => ((q.status === 'draft' || q.status === 'sent') && q.validUntil && q.validUntil < today) ? 'expired' : q.status;
    const quotationStats = { total: allQuotations.length, draft: 0, sent: 0, accepted: 0, rejected: 0, expired: 0, converted: 0, totalValue: 0, openValue: 0, wonValue: 0 };
    allQuotations.forEach(q => {
      const st = qStatus(q);
      quotationStats[st] = (quotationStats[st] || 0) + 1;
      quotationStats.totalValue += q.grandTotal || 0;
      if (st === 'draft' || st === 'sent') quotationStats.openValue += q.grandTotal || 0;
      if (st === 'accepted' || st === 'converted') quotationStats.wonValue += q.grandTotal || 0;
    });
    const recentQuotations = allQuotations.slice(0, 5).map(q => ({
      _id: q._id, quotNo: q.quotNo, title: q.title, grandTotal: q.grandTotal, status: qStatus(q),
      clientName: q.clientId?.clientName || '', createdBy: q.createdBy?.name || '', createdAt: q.createdAt,
    }));

    // Recent activity
    const recentActivity = await Activity.find().sort({ createdAt: -1 }).limit(20).lean();

    // Upcoming due invoices (due in next 7 days)
    const next7 = new Date(); next7.setDate(next7.getDate() + 7);
    const upcomingDue = allInvoices
      .filter(inv => inv.dueDate && inv.dueDate >= today && inv.dueDate <= next7.toISOString().slice(0, 10) && inv.status !== 'paid')
      .map(inv => {
        const paid = allPayments.filter(p => p.invoiceId?.toString() === inv._id.toString()).reduce((s, p) => s + p.amount, 0);
        const client = allClients.find(c => c._id.toString() === inv.clientId?.toString());
        return { ...inv, paid, balance: Math.max(0, inv.grandTotal - paid), clientName: client?.clientName || '—' };
      });

    // Expense by category
    const expenseByCategory = {};
    allExpenses.forEach(e => {
      expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + (e.amount || 0);
    });

    res.json({
      success: true,
      data: {
        summary: { totalInvoiced, totalReceived, outstanding, overdueAmount, netIncome, totalExpenses, thisMonthInvoiced, thisMonthReceived },
        counts: {
          clients: allClients.length,
          invoices: allInvoices.length,
          payments: allPayments.length,
          expenses: allExpenses.length,
          statusCounts,
        },
        quotationStats,
        recentQuotations,
        monthlyData,
        topClients,
        recentActivity,
        upcomingDue,
        expenseByCategory,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/dashboard/activity
export const getActivity = async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;
    const activity = await Activity.find().sort({ createdAt: -1 }).limit(Number(limit)).lean();
    res.json({ success: true, data: activity });
  } catch (error) {
    next(error);
  }
};

// GET /api/dashboard/reports
export const getReports = async (req, res, next) => {
  try {
    const { from, to, type = 'all' } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = from;
    if (to)   dateFilter.$lte = to;

    const invoiceFilter = {};
    const payFilter     = {};
    const expFilter     = {};
    if (from || to) {
      if (from || to) {
        invoiceFilter.invoiceDate = dateFilter;
        payFilter.paymentDate     = dateFilter;
        expFilter.date            = dateFilter;
      }
    }

    const [invoices, payments, expenses] = await Promise.all([
      Invoice.find(invoiceFilter).populate('clientId', 'clientName companyName').lean(),
      Payment.find(payFilter).populate('clientId', 'clientName').populate('invoiceId', 'invoiceNumber').lean(),
      Expense.find(expFilter).lean(),
    ]);

    const totalInvoiced = invoices.filter(i => i.status !== 'cancelled').reduce((s, i) => s + (i.grandTotal || 0), 0);
    const totalReceived = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const netProfit     = totalReceived - totalExpenses;

    const expenseByCategory = {};
    expenses.forEach(e => { expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount; });

    res.json({
      success: true,
      data: { invoices, payments, expenses, totalInvoiced, totalReceived, totalExpenses, netProfit, expenseByCategory },
    });
  } catch (error) {
    next(error);
  }
};
