import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import Client from '../models/Client.js';
import Activity from '../models/Activity.js';
import { generateReceiptNumber } from '../utils/helpers.js';

// GET /api/payments
export const getPayments = async (req, res, next) => {
  try {
    const { method, search, clientId, invoiceId, page = 1, limit = 100 } = req.query;
    const filter = {};

    if (method && method !== 'All Methods') filter.paymentMethod = method;
    if (clientId)  filter.clientId  = clientId;
    if (invoiceId) filter.invoiceId = invoiceId;

    const payments = await Payment.find(filter)
      .populate('clientId',  'clientName companyName')
      .populate('invoiceId', 'invoiceNumber projectName grandTotal')
      .sort({ createdAt: -1 })
      .lean();

    let result = payments.map(p => ({
      ...p,
      client:  p.clientId,
      invoice: p.invoiceId,
      clientId:  p.clientId?._id,
      invoiceId: p.invoiceId?._id,
    }));

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.paymentNumber?.toLowerCase().includes(q) ||
        p.client?.clientName?.toLowerCase().includes(q) ||
        p.invoice?.invoiceNumber?.toLowerCase().includes(q) ||
        p.referenceNumber?.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, data: result, total: result.length });
  } catch (error) {
    next(error);
  }
};

// GET /api/payments/:id
export const getPayment = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('clientId',  'clientName companyName email phone')
      .populate('invoiceId', 'invoiceNumber grandTotal invoiceDate dueDate')
      .lean();

    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, data: { ...payment, client: payment.clientId, invoice: payment.invoiceId } });
  } catch (error) {
    next(error);
  }
};

// POST /api/payments
export const createPayment = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.body.invoiceId);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const existing = await Payment.find({}, 'paymentNumber').lean();
    const paymentNumber = generateReceiptNumber(existing.map(p => p.paymentNumber));

    const payment = await Payment.create({ ...req.body, paymentNumber });

    // Update invoice status based on total paid
    const allPayments   = await Payment.find({ invoiceId: invoice._id }).lean();
    const totalPaid     = allPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const today         = new Date().toISOString().slice(0, 10);
    let newStatus       = 'sent';
    if (totalPaid >= invoice.grandTotal) newStatus = 'paid';
    else if (totalPaid > 0) newStatus = 'partial';
    else if (invoice.dueDate && invoice.dueDate < today) newStatus = 'overdue';
    await Invoice.findByIdAndUpdate(invoice._id, { status: newStatus });

    const client = await Client.findById(payment.clientId).lean();
    await Activity.create({
      text: `₹${Number(payment.amount).toLocaleString('en-IN')} payment received from ${client?.clientName || ''}`,
      type: 'payment',
      color: '#16A34A',
      refId: payment._id.toString(),
    });

    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

// PUT /api/payments/:id
export const updatePayment = async (req, res, next) => {
  try {
    const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    // Recalculate invoice status
    const invoice = await Invoice.findById(payment.invoiceId);
    if (invoice) {
      const allPayments = await Payment.find({ invoiceId: invoice._id }).lean();
      const totalPaid   = allPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const today       = new Date().toISOString().slice(0, 10);
      let newStatus     = 'sent';
      if (totalPaid >= invoice.grandTotal) newStatus = 'paid';
      else if (totalPaid > 0) newStatus = 'partial';
      else if (invoice.dueDate && invoice.dueDate < today) newStatus = 'overdue';
      await Invoice.findByIdAndUpdate(invoice._id, { status: newStatus });
    }

    res.json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/payments/:id
export const deletePayment = async (req, res, next) => {
  try {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    // Recalculate invoice status after deletion
    const invoice = await Invoice.findById(payment.invoiceId);
    if (invoice && invoice.status !== 'cancelled') {
      const allPayments = await Payment.find({ invoiceId: invoice._id }).lean();
      const totalPaid   = allPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const today       = new Date().toISOString().slice(0, 10);
      let newStatus     = 'sent';
      if (totalPaid >= invoice.grandTotal) newStatus = 'paid';
      else if (totalPaid > 0) newStatus = 'partial';
      else if (invoice.dueDate && invoice.dueDate < today) newStatus = 'overdue';
      await Invoice.findByIdAndUpdate(invoice._id, { status: newStatus });
    }

    res.json({ success: true, message: 'Payment deleted' });
  } catch (error) {
    next(error);
  }
};
