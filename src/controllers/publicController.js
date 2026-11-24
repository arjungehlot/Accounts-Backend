import Client from '../models/Client.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Settings from '../models/Settings.js';

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const todayStr = () => new Date().toISOString().slice(0, 10);

// GET /api/public/client/:token
// Public (no login). Returns ONLY the payment statement of the one client that owns the token.
export const getClientStatement = async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!/^[a-f0-9]{48}$/.test(token || '')) {
      return res.status(404).json({ success: false, message: 'This link is not valid.' });
    }

    const client = await Client.findOne({ shareToken: token, shareEnabled: true }).lean();
    if (!client) {
      return res.status(404).json({ success: false, message: 'This link is not valid or has been disabled.' });
    }

    const [invoicesRaw, paymentsRaw, settings] = await Promise.all([
      Invoice.find({ clientId: client._id, status: { $nin: ['cancelled', 'draft'] } }).sort({ invoiceDate: 1 }).lean(),
      Payment.find({ clientId: client._id }).sort({ paymentDate: -1, createdAt: -1 }).lean(),
      Settings.findOne().lean(),
    ]);

    const invById = new Map(invoicesRaw.map((i) => [String(i._id), i]));
    const paidByInv = new Map();
    // only count payments whose invoice is still part of the statement
    const payments = paymentsRaw.filter((p) => invById.has(String(p.invoiceId)));
    payments.forEach((p) => paidByInv.set(String(p.invoiceId), (paidByInv.get(String(p.invoiceId)) || 0) + (p.amount || 0)));

    const today = todayStr();
    const invoices = invoicesRaw.map((inv) => {
      const total = round(inv.grandTotal);
      const paid = round(Math.min(paidByInv.get(String(inv._id)) || 0, Number.MAX_SAFE_INTEGER));
      const balance = round(Math.max(0, total - paid));
      let status = 'pending';
      if (balance <= 0) status = 'paid';
      else if (inv.dueDate && inv.dueDate < today) status = 'overdue';
      else if (paid > 0) status = 'partial';
      return {
        invoiceNumber: inv.invoiceNumber,
        projectName: inv.projectName || '',
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        subtotal: round(inv.subtotal),
        taxAmount: round(inv.taxAmount),
        total, paid, balance, status,
        grossTotal: round((inv.items || []).reduce((a, it) => a + (it.qty || 0) * (it.rate || 0), 0)),
        discountTotal: round((inv.items || []).reduce((a, it) => a + (it.qty || 0) * (it.rate || 0) * ((it.discount || 0) / 100), 0)),
        items: (inv.items || []).map((it) => {
          const gross = (it.qty || 0) * (it.rate || 0);
          const discountAmount = gross * ((it.discount || 0) / 100);
          const taxable = gross - discountAmount;
          const taxAmount = taxable * ((it.tax || 0) / 100);
          return {
            item: it.item,
            description: it.description || '',
            qty: it.qty,
            rate: it.rate,
            discount: it.discount || 0,
            tax: it.tax || 0,
            gross: round(gross),
            discountAmount: round(discountAmount),
            taxable: round(taxable),
            taxAmount: round(taxAmount),
            amount: round(taxable + taxAmount),
          };
        }),
      };
    });

    const totalBilled = round(invoices.reduce((s, i) => s + i.total, 0));
    const totalReceived = round(invoices.reduce((s, i) => s + i.paid, 0));
    const pending = round(Math.max(0, totalBilled - totalReceived));
    const overdue = round(invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.balance, 0));
    const nextDue = invoices.filter((i) => i.balance > 0 && i.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null;

    const payOut = payments.map((p) => ({
      paymentNumber: p.paymentNumber,
      paymentDate: p.paymentDate,
      amount: round(p.amount),
      method: p.paymentMethod,
      reference: p.referenceNumber || '',
      invoiceNumber: invById.get(String(p.invoiceId))?.invoiceNumber || '',
      projectName: invById.get(String(p.invoiceId))?.projectName || '',
    }));

    const s = settings || {};
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        company: {
          name: s.companyName || 'BuildSoftware', phone: s.phone || '', email: s.email || '', website: s.website || '',
          address: [s.address, s.city, s.state].filter(Boolean).join(', '),
          bank: { bankName: s.bankName || '', accountHolder: s.accountHolder || '', accountNumber: s.accountNumber || '', ifsc: s.ifsc || '', upiId: s.upiId || '' },
        },
        client: { name: client.clientName, company: client.companyName || '' },
        summary: {
          totalBilled, totalReceived, pending, overdue,
          percentPaid: totalBilled > 0 ? Math.min(100, Math.round((totalReceived / totalBilled) * 100)) : 0,
          invoiceCount: invoices.length,
          paymentCount: payOut.length,
          lastPaymentDate: payOut[0]?.paymentDate || null,
          nextDue: nextDue ? { invoiceNumber: nextDue.invoiceNumber, dueDate: nextDue.dueDate, balance: nextDue.balance } : null,
        },
        invoices: invoices.slice().reverse(),
        payments: payOut,
      },
    });
  } catch (error) {
    next(error);
  }
};
