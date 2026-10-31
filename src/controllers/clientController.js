import Client from '../models/Client.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Activity from '../models/Activity.js';
import Quotation from '../models/Quotation.js';

// GET /api/clients
export const getClients = async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 100 } = req.query;
    const filter = {};

    if (status && status !== 'all') filter.status = status;
    if (search) filter.$text = { $search: search };

    const clients = await Client.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with financial summary
    const enriched = await Promise.all(
      clients.map(async (client) => {
        const invoices  = await Invoice.find({ clientId: client._id, status: { $ne: 'cancelled' } }).lean();
        const payments  = await Payment.find({ clientId: client._id }).lean();
        const lastPay   = await Payment.findOne({ clientId: client._id }).sort({ paymentDate: -1 }).lean();
        const totalInvoiced  = invoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
        const totalReceived  = payments.reduce((s, p) => s + (p.amount || 0), 0);
        const outstanding    = Math.max(0, totalInvoiced - totalReceived);
        return { ...client, totalInvoiced, totalReceived, outstanding, lastPayment: lastPay };
      })
    );

    let result = enriched;
    if (req.query.status === 'outstanding') result = enriched.filter(c => c.outstanding > 0);
    if (req.query.status === 'paid') result = enriched.filter(c => c.outstanding === 0 && c.totalInvoiced > 0);

    res.json({ success: true, data: result, total: result.length });
  } catch (error) {
    next(error);
  }
};

// GET /api/clients/:id
export const getClient = async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });

    const invoices = await Invoice.find({ clientId: client._id }).sort({ invoiceDate: -1 }).lean();
    const payments = await Payment.find({ clientId: client._id }).sort({ paymentDate: -1 }).lean();

    const totalInvoiced = invoices.filter(i => i.status !== 'cancelled').reduce((s, i) => s + (i.grandTotal || 0), 0);
    const totalReceived = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const outstanding   = Math.max(0, totalInvoiced - totalReceived);

    res.json({ success: true, data: { ...client, invoices, payments, totalInvoiced, totalReceived, outstanding } });
  } catch (error) {
    next(error);
  }
};

// POST /api/clients
export const createClient = async (req, res, next) => {
  try {
    const client = await Client.create(req.body);
    await Activity.create({ text: `Client ${client.clientName} added`, type: 'client', color: '#7C3AED', refId: client._id.toString() });
    res.status(201).json({ success: true, data: client });
  } catch (error) {
    next(error);
  }
};

// PUT /api/clients/:id
export const updateClient = async (req, res, next) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
    res.json({ success: true, data: client });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/clients/:id
export const deleteClient = async (req, res, next) => {
  try {
    const [invCount, quoCount] = await Promise.all([
      Invoice.countDocuments({ clientId: req.params.id }),
      Quotation.countDocuments({ clientId: req.params.id }),
    ]);
    if (invCount || quoCount) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete — client has ${invCount} invoice(s) and ${quoCount} quotation(s). Remove those first or mark the client inactive.`,
      });
    }
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
    res.json({ success: true, message: 'Client deleted' });
  } catch (error) {
    next(error);
  }
};
