import mongoose from 'mongoose';

const invoiceItemSchema = new mongoose.Schema(
  {
    item:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    qty:         { type: Number, required: true, min: 0 },
    rate:        { type: Number, required: true, min: 0 },
    discount:    { type: Number, default: 0, min: 0, max: 100 },
    tax:         { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    clientId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    projectName:   { type: String, default: '' },
    invoiceDate:   { type: String, required: true }, // 'YYYY-MM-DD' string to match frontend
    dueDate:       { type: String, required: true },
    currency:      { type: String, default: 'INR' },
    items:         { type: [invoiceItemSchema], required: true },
    subtotal:      { type: Number, default: 0 },
    taxAmount:     { type: Number, default: 0 },
    grandTotal:    { type: Number, default: 0 },
    status:        { type: String, enum: ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'], default: 'sent' },
    notes:         { type: String, default: '' },
    termsConditions: { type: String, default: '' },
    // link back to the quotation this invoice was generated from (if any)
    quotationId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', default: null },
    quotationNumber: { type: String, default: '' },
  },
  { timestamps: true }
);

// Auto-compute totals before save
invoiceSchema.pre('save', async function () {
  let subtotal = 0;
  let taxAmount = 0;
  this.items.forEach(item => {
    const lineTotal = (item.qty || 0) * (item.rate || 0);
    const discAmt   = lineTotal * ((item.discount || 0) / 100);
    const taxable   = lineTotal - discAmt;
    subtotal  += taxable;
    taxAmount += taxable * ((item.tax || 0) / 100);
  });
  this.subtotal   = Math.round(subtotal * 100) / 100;
  this.taxAmount  = Math.round(taxAmount * 100) / 100;
  this.grandTotal = Math.round((subtotal + taxAmount) * 100) / 100;
});


invoiceSchema.index({ clientId: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ invoiceDate: -1 });

const Invoice = mongoose.model('Invoice', invoiceSchema);
export default Invoice;
