import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber:  { type: String, required: true, unique: true, trim: true },
    invoiceId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    clientId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    paymentDate:    { type: String, required: true }, // 'YYYY-MM-DD' to match frontend
    amount:         { type: Number, required: true, min: 0.01 },
    paymentMethod:  { type: String, enum: ['Cash', 'UPI', 'Bank Transfer', 'NEFT', 'RTGS', 'IMPS', 'Cheque', 'Card', 'Other'], required: true },
    referenceNumber: { type: String, default: '' },
    notes:          { type: String, default: '' },
  },
  { timestamps: true }
);

paymentSchema.index({ invoiceId: 1 });
paymentSchema.index({ clientId: 1 });
paymentSchema.index({ paymentDate: -1 });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
