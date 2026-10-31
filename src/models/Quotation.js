import mongoose from 'mongoose';

const historySchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // created | updated | status | invoiced | duplicated
    note:   { type: String, default: '' },
    byId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, default: '' },
    at:     { type: Date, default: Date.now },
  },
  { _id: false }
);

const personSchema = new mongoose.Schema(
  {
    id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name:  { type: String, default: '' },
    email: { type: String, default: '' },
  },
  { _id: false }
);

const invoicedSchema = new mongoose.Schema(
  {
    invoiceId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    invoiceNumber:  { type: String, default: '' },
    milestoneIndex: { type: Number, default: null }, // null => full quotation invoiced
    amount:         { type: Number, default: 0 },
  },
  { _id: false }
);

const quotationSchema = new mongoose.Schema(
  {
    quotNo:    { type: String, required: true, unique: true, trim: true },
    clientId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    title:     { type: String, default: '', trim: true },
    status:    { type: String, enum: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'], default: 'draft' },
    quotDate:  { type: String, required: true },   // YYYY-MM-DD
    validDays: { type: Number, default: 15 },
    validUntil:{ type: String, default: '' },      // YYYY-MM-DD (computed)

    // Denormalised totals so lists / dashboards never need the heavy `data` blob
    subtotal:   { type: Number, default: 0 },
    taxRate:    { type: Number, default: 0 },
    includeTax: { type: Boolean, default: false },
    taxAmount:  { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    milestoneCount: { type: Number, default: 0 },

    // Entire studio document (company, scope, price rows, milestones, terms, logo ...)
    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    createdBy: { type: personSchema, default: () => ({}) },
    updatedBy: { type: personSchema, default: () => ({}) },
    history:   { type: [historySchema], default: [] },

    invoiced:  { type: [invoicedSchema], default: [] },
  },
  { timestamps: true }
);

quotationSchema.index({ clientId: 1 });
quotationSchema.index({ status: 1 });
quotationSchema.index({ createdAt: -1 });

const Quotation = mongoose.model('Quotation', quotationSchema);
export default Quotation;
