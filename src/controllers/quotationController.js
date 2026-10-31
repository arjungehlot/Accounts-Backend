import mongoose from 'mongoose';
import Quotation from '../models/Quotation.js';
import Invoice from '../models/Invoice.js';
import Client from '../models/Client.js';
import Activity from '../models/Activity.js';
import { generateInvoiceNumber } from '../utils/helpers.js';

const STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'];
const todayStr = () => new Date().toISOString().slice(0, 10);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const addDays = (dateStr, days) => {
  const d = new Date((dateStr || todayStr()) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
};

const actor = (req) => ({
  id: req.user?._id || null,
  name: req.user?.name || 'Unknown',
  email: req.user?.email || '',
});

const hist = (req, action, note = '') => ({
  action, note, byId: req.user?._id || null, byName: req.user?.name || 'Unknown', at: new Date(),
});

const validId = (id) => mongoose.Types.ObjectId.isValid(id);

// Compute totals from the studio payload (single source of truth = server)
const computeTotals = (data = {}) => {
  const rows = Array.isArray(data.priceRows) ? data.priceRows : [];
  const subtotal = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const includeTax = !!data.includeTax;
  const taxRate = Number(data.taxRate) || 0;
  const taxAmount = includeTax ? (subtotal * taxRate) / 100 : 0;
  return {
    subtotal: round2(subtotal),
    taxRate,
    includeTax,
    taxAmount: round2(taxAmount),
    grandTotal: round2(subtotal + taxAmount),
    milestoneCount: Array.isArray(data.milestones) ? data.milestones.length : 0,
  };
};

// quotation numbers: BS/Q/YYYY/MM-NN  (sequence resets every month)
const buildNextNumber = async (dateStr) => {
  const d = dateStr && /^\d{4}-\d{2}/.test(dateStr) ? dateStr : todayStr();
  const prefix = `BS/Q/${d.slice(0, 4)}/${d.slice(5, 7)}-`;
  const existing = await Quotation.find({ quotNo: new RegExp('^' + prefix.replace(/\//g, '\\/')) }, 'quotNo').lean();
  const max = existing.reduce((m, q) => Math.max(m, parseInt(q.quotNo.split('-').pop(), 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
};

// effective status (auto-expire un-actioned quotations after validity)
const effectiveStatus = (q) => {
  if ((q.status === 'draft' || q.status === 'sent') && q.validUntil && q.validUntil < todayStr()) return 'expired';
  return q.status;
};

const shape = (q) => {
  const invoicedAmount = (q.invoiced || []).reduce((s, i) => s + (i.amount || 0), 0);
  return {
    ...q,
    client: q.clientId && q.clientId._id ? q.clientId : null,
    clientId: q.clientId?._id || q.clientId || null,
    status: effectiveStatus(q),
    storedStatus: q.status,
    invoicedAmount,
  };
};

// ── GET /api/quotations
export const getQuotations = async (req, res, next) => {
  try {
    const { status, clientId, search } = req.query;
    const filter = {};
    if (clientId && validId(clientId)) filter.clientId = clientId;

    const docs = await Quotation.find(filter)
      .select('-data') // keep list light; the studio fetches the full doc by id
      .populate('clientId', 'clientName companyName email phone')
      .sort({ createdAt: -1 })
      .lean();

    let result = docs.map(shape);
    if (status && status !== 'all') result = result.filter((q) => q.status === status);
    if (search) {
      const s = String(search).toLowerCase();
      result = result.filter((q) =>
        [q.quotNo, q.title, q.client?.clientName, q.client?.companyName, q.createdBy?.name]
          .some((f) => f?.toLowerCase().includes(s)));
    }
    res.json({ success: true, data: result, total: result.length });
  } catch (error) { next(error); }
};

// ── GET /api/quotations/next-number
export const getNextQuotationNumber = async (req, res, next) => {
  try {
    res.json({ success: true, data: { quotNo: await buildNextNumber(req.query.date) } });
  } catch (error) { next(error); }
};

// ── GET /api/quotations/:id
export const getQuotation = async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ success: false, message: 'Quotation not found' });
    const q = await Quotation.findById(req.params.id)
      .populate('clientId', 'clientName companyName email phone')
      .lean();
    if (!q) return res.status(404).json({ success: false, message: 'Quotation not found' });
    res.json({ success: true, data: shape(q) });
  } catch (error) { next(error); }
};

// ── POST /api/quotations
export const createQuotation = async (req, res, next) => {
  try {
    const { data = {}, clientId, status } = req.body;
    const quotDate = data.quotDate || todayStr();
    const validDays = Number(data.validDays) || 15;

    // numbering is server-owned; retry on the (rare) duplicate-key race
    let quotation;
    for (let attempt = 0; attempt < 4 && !quotation; attempt++) {
      const quotNo = await buildNextNumber(quotDate);
      try {
        quotation = await Quotation.create({
          quotNo,
          clientId: clientId && validId(clientId) ? clientId : null,
          title: data.title || '',
          status: STATUSES.includes(status) && status !== 'converted' ? status : 'draft',
          quotDate,
          validDays,
          validUntil: addDays(quotDate, validDays),
          ...computeTotals(data),
          data: { ...data, quotNo },
          createdBy: actor(req),
          updatedBy: actor(req),
          history: [hist(req, 'created', `Quotation ${quotNo} created`)],
        });
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
    if (!quotation) return res.status(409).json({ success: false, message: 'Could not allocate a quotation number, try again' });

    await Activity.create({
      text: `Quotation ${quotation.quotNo} created by ${req.user?.name || 'user'}${data.clientCompany ? ' for ' + data.clientCompany : ''}`,
      type: 'quotation', color: '#0284C7', refId: quotation._id.toString(),
    });
    res.status(201).json({ success: true, data: quotation });
  } catch (error) { next(error); }
};

// ── PUT /api/quotations/:id
export const updateQuotation = async (req, res, next) => {
  try {
    const q = await Quotation.findById(req.params.id);
    if (!q) return res.status(404).json({ success: false, message: 'Quotation not found' });
    if (q.invoiced.length) {
      return res.status(409).json({ success: false, message: 'This quotation already has invoice(s) — it is locked so the billed amounts never drift from the document.' });
    }

    const { data = {}, clientId, status } = req.body;
    const quotDate = data.quotDate || q.quotDate;
    const validDays = Number(data.validDays) || q.validDays;

    q.clientId = clientId && validId(clientId) ? clientId : null;
    q.title = data.title ?? q.title;
    q.quotDate = quotDate;
    q.validDays = validDays;
    q.validUntil = addDays(quotDate, validDays);
    Object.assign(q, computeTotals(data));
    q.data = { ...data, quotNo: q.quotNo }; // number can't be changed by client
    q.markModified('data');
    if (STATUSES.includes(status) && status !== 'converted' && q.status !== 'converted') q.status = status;
    q.updatedBy = actor(req);
    q.history.push(hist(req, 'updated', 'Quotation edited'));
    await q.save();

    await Activity.create({ text: `Quotation ${q.quotNo} updated by ${req.user?.name || 'user'}`, type: 'quotation', color: '#0284C7', refId: q._id.toString() });
    res.json({ success: true, data: q });
  } catch (error) { next(error); }
};

// ── PATCH /api/quotations/:id/status
export const updateQuotationStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['draft', 'sent', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const q = await Quotation.findById(req.params.id);
    if (!q) return res.status(404).json({ success: false, message: 'Quotation not found' });
    if (q.status === 'converted') {
      return res.status(400).json({ success: false, message: 'A converted quotation can no longer change status' });
    }
    q.status = status;
    q.updatedBy = actor(req);
    q.history.push(hist(req, 'status', `Marked as ${status}`));
    await q.save();
    await Activity.create({
      text: `Quotation ${q.quotNo} marked ${status}`,
      type: 'quotation', color: status === 'accepted' ? '#16A34A' : status === 'rejected' ? '#DC2626' : '#0284C7', refId: q._id.toString(),
    });
    res.json({ success: true, data: q });
  } catch (error) { next(error); }
};

// ── POST /api/quotations/:id/duplicate
export const duplicateQuotation = async (req, res, next) => {
  try {
    const src = await Quotation.findById(req.params.id).lean();
    if (!src) return res.status(404).json({ success: false, message: 'Quotation not found' });
    const quotDate = todayStr();
    const quotNo = await buildNextNumber(quotDate);
    const data = { ...(src.data || {}), quotNo, quotDate };
    const copy = await Quotation.create({
      quotNo, clientId: src.clientId, title: src.title, status: 'draft',
      quotDate, validDays: src.validDays, validUntil: addDays(quotDate, src.validDays),
      ...computeTotals(data), data,
      createdBy: actor(req), updatedBy: actor(req),
      history: [hist(req, 'duplicated', `Duplicated from ${src.quotNo}`)],
    });
    await Activity.create({ text: `Quotation ${copy.quotNo} duplicated from ${src.quotNo}`, type: 'quotation', color: '#0284C7', refId: copy._id.toString() });
    res.status(201).json({ success: true, data: copy });
  } catch (error) { next(error); }
};

// ── POST /api/quotations/:id/convert  { mode: 'full' | 'milestone', milestoneIndex, clientId, dueDate }
export const convertToInvoice = async (req, res, next) => {
  try {
    const q = await Quotation.findById(req.params.id);
    if (!q) return res.status(404).json({ success: false, message: 'Quotation not found' });
    if (q.status === 'rejected') return res.status(400).json({ success: false, message: 'A rejected quotation cannot be invoiced' });

    const { mode = 'full', milestoneIndex, dueDate } = req.body;
    let clientId = q.clientId || (req.body.clientId && validId(req.body.clientId) ? req.body.clientId : null);
    if (!clientId) return res.status(400).json({ success: false, message: 'Link a client to this quotation before creating an invoice' });
    const client = await Client.findById(clientId).lean();
    if (!client) return res.status(400).json({ success: false, message: 'Linked client no longer exists' });

    const data = q.data || {};
    const rows = Array.isArray(data.priceRows) ? data.priceRows : [];
    const taxPct = data.includeTax ? Number(data.taxRate) || 0 : 0;
    let items; let amount; let milestoneIdx = null;
    const projectName = q.title || data.title || '';

    if (mode === 'milestone') {
      const ms = Array.isArray(data.milestones) ? data.milestones : [];
      milestoneIdx = Number(milestoneIndex);
      const m = ms[milestoneIdx];
      if (!Number.isInteger(milestoneIdx) || !m) return res.status(400).json({ success: false, message: 'Milestone not found' });
      if (q.invoiced.some((i) => i.milestoneIndex === null)) return res.status(400).json({ success: false, message: 'Full quotation is already invoiced' });
      if (q.invoiced.some((i) => i.milestoneIndex === milestoneIdx)) return res.status(400).json({ success: false, message: `Milestone "${m.stage}" is already invoiced` });
      const pct = Number(m.pct) || 0;
      const base = round2((q.subtotal * pct) / 100);
      items = [{ item: `${m.stage} — ${pct}% milestone`, description: `${projectName}${m.desc ? ' · ' + m.desc : ''}`.trim(), qty: 1, rate: base, discount: 0, tax: taxPct }];
      amount = round2(base + (base * taxPct) / 100);
    } else {
      if (q.invoiced.length) return res.status(400).json({ success: false, message: 'This quotation already has invoice(s) linked' });
      items = rows.map((r) => ({ item: r.desc || 'Item', description: r.details || '', qty: 1, rate: Number(r.amount) || 0, discount: 0, tax: taxPct }));
      if (!items.length) return res.status(400).json({ success: false, message: 'Quotation has no pricing rows' });
      amount = q.grandTotal;
    }

    const invoiceDate = todayStr();
    const existing = await Invoice.find({}, 'invoiceNumber').lean();
    const invoiceNumber = generateInvoiceNumber(existing.map((i) => i.invoiceNumber));
    const invoice = await Invoice.create({
      invoiceNumber, clientId, projectName, invoiceDate,
      dueDate: dueDate || addDays(invoiceDate, 15),
      items, status: 'sent',
      notes: `Created from quotation ${q.quotNo}${milestoneIdx !== null ? ` (milestone ${milestoneIdx + 1})` : ''}.`,
      quotationId: q._id, quotationNumber: q.quotNo,
    });

    q.clientId = clientId;
    q.invoiced.push({ invoiceId: invoice._id, invoiceNumber, milestoneIndex: milestoneIdx, amount: invoice.grandTotal });
    const msTotal = Array.isArray(data.milestones) ? data.milestones.length : 0;
    const allDone = q.invoiced.some((i) => i.milestoneIndex === null) ||
      (msTotal > 0 && new Set(q.invoiced.map((i) => i.milestoneIndex)).size >= msTotal);
    q.status = allDone ? 'converted' : 'accepted';
    q.updatedBy = actor(req);
    q.history.push(hist(req, 'invoiced', `Invoice ${invoiceNumber} created${milestoneIdx !== null ? ` for milestone ${milestoneIdx + 1}` : ''}`));
    await q.save();

    await Activity.create({ text: `Invoice ${invoiceNumber} created from quotation ${q.quotNo}`, type: 'invoice', color: '#2563EB', refId: invoice._id.toString() });
    res.status(201).json({ success: true, data: { quotation: q, invoice } });
  } catch (error) { next(error); }
};

// ── DELETE /api/quotations/:id
export const deleteQuotation = async (req, res, next) => {
  try {
    const q = await Quotation.findById(req.params.id);
    if (!q) return res.status(404).json({ success: false, message: 'Quotation not found' });
    if (q.invoiced.length) {
      return res.status(409).json({ success: false, message: `Cannot delete — ${q.invoiced.length} invoice(s) were created from this quotation. Delete those invoices first.` });
    }
    await q.deleteOne();
    await Activity.create({ text: `Quotation ${q.quotNo} deleted by ${req.user?.name || 'user'}`, type: 'quotation', color: '#6B7280' });
    res.json({ success: true, message: 'Quotation deleted' });
  } catch (error) { next(error); }
};

// Used by invoice deletion: unlink + recompute quotation status
export const unlinkInvoiceFromQuotation = async (invoice) => {
  if (!invoice?.quotationId) return;
  const q = await Quotation.findById(invoice.quotationId);
  if (!q) return;
  q.invoiced = q.invoiced.filter((i) => String(i.invoiceId) !== String(invoice._id));
  if (q.status === 'converted' || q.status === 'accepted') {
    if (q.invoiced.length === 0) q.status = 'accepted';
    else {
      const msTotal = Array.isArray(q.data?.milestones) ? q.data.milestones.length : 0;
      const full = q.invoiced.some((i) => i.milestoneIndex === null);
      q.status = full || (msTotal > 0 && new Set(q.invoiced.map((i) => i.milestoneIndex)).size >= msTotal) ? 'converted' : 'accepted';
    }
  }
  q.history.push({ action: 'updated', note: `Invoice ${invoice.invoiceNumber} removed`, byName: 'System', at: new Date() });
  await q.save();
};
