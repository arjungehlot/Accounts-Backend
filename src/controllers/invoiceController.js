import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Client from '../models/Client.js';
import Activity from '../models/Activity.js';
import { generateInvoiceNumber } from '../utils/helpers.js';

// GET /api/invoices
export const getInvoices = async (req, res, next) => {
  try {
    const { status, search, clientId, page = 1, limit = 100 } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      if (['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'].includes(status)) {
        filter.status = status;
      }
    }
    if (clientId) filter.clientId = clientId;

    const invoices = await Invoice.find(filter)
      .populate('clientId', 'clientName companyName email phone gstin billingAddress city state')
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with real-time payment data
    const enriched = await Promise.all(
      invoices.map(async (inv) => {
        const payments = await Payment.find({ invoiceId: inv._id }).lean();
        const paid     = payments.reduce((s, p) => s + (p.amount || 0), 0);
        const balance  = Math.max(0, (inv.grandTotal || 0) - paid);
        const today    = new Date().toISOString().slice(0, 10);

        let computedStatus = inv.status;
        if (inv.status !== 'cancelled' && inv.status !== 'draft') {
          if (paid >= inv.grandTotal) computedStatus = 'paid';
          else if (paid > 0) computedStatus = 'partial';
          else if (inv.dueDate && inv.dueDate < today) computedStatus = 'overdue';
          else computedStatus = 'sent';
        }

        return {
          ...inv,
          client: inv.clientId,
          clientId: inv.clientId?._id,
          paid,
          balance,
          status: computedStatus,
          payments,
        };
      })
    );

    // Filter by search
    let result = enriched;
    if (search) {
      const q = search.toLowerCase();
      result = enriched.filter(inv =>
        inv.invoiceNumber?.toLowerCase().includes(q) ||
        inv.client?.clientName?.toLowerCase().includes(q) ||
        inv.projectName?.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, data: result, total: result.length });
  } catch (error) {
    next(error);
  }
};

// GET /api/invoices/:id
export const getInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('clientId', 'clientName companyName email phone gstin pan billingAddress city state country pincode')
      .lean();

    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const payments = await Payment.find({ invoiceId: invoice._id }).sort({ paymentDate: -1 }).lean();
    const paid     = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const balance  = Math.max(0, (invoice.grandTotal || 0) - paid);

    res.json({ success: true, data: { ...invoice, client: invoice.clientId, clientId: invoice.clientId?._id, paid, balance, payments } });
  } catch (error) {
    next(error);
  }
};

// POST /api/invoices
export const createInvoice = async (req, res, next) => {
  try {
    const existing = await Invoice.find({}, 'invoiceNumber').lean();
    const invoiceNumber = generateInvoiceNumber(existing.map(i => i.invoiceNumber));

    const invoice = await Invoice.create({ ...req.body, invoiceNumber });
    const client  = await Client.findById(invoice.clientId).lean();

    await Activity.create({
      text: `Invoice ${invoice.invoiceNumber} created for ${client?.clientName || ''}`,
      type: 'invoice',
      color: '#2563EB',
      refId: invoice._id.toString(),
    });

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

// PUT /api/invoices/:id
export const updateInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    Object.assign(invoice, req.body);
    await invoice.save(); // triggers pre-save hook to recalculate totals

    await Activity.create({ text: `Invoice ${invoice.invoiceNumber} updated`, type: 'invoice', color: '#2563EB', refId: invoice._id.toString() });

    res.json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/invoices/:id
export const deleteInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    // Also delete related payments
    await Payment.deleteMany({ invoiceId: req.params.id });

    res.json({ success: true, message: 'Invoice and related payments deleted' });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/invoices/:id/cancel
export const cancelInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(req.params.id, { status: 'cancelled' }, { new: true });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};
