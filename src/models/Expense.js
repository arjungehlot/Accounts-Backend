import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    expenseNumber: { type: String, required: true, unique: true, trim: true },
    date:          { type: String, required: true }, // 'YYYY-MM-DD'
    category:      {
      type: String,
      enum: ['Software', 'Hosting', 'AWS', 'Domain', 'Office', 'Marketing', 'Travel', 'Salary', 'Hardware', 'Internet', 'Utilities', 'Equipment', 'Other'],
      required: true,
    },
    description:   { type: String, required: true, trim: true },
    amount:        { type: Number, required: true, min: 0.01 },
    paymentMethod: { type: String, enum: ['Cash', 'UPI', 'Bank Transfer', 'NEFT', 'RTGS', 'IMPS', 'Card', 'Cheque', 'Other'], required: true },
    vendor:        { type: String, default: '' },
    reference:     { type: String, default: '' },
    notes:         { type: String, default: '' },
  },
  { timestamps: true }
);

expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });

const Expense = mongoose.model('Expense', expenseSchema);
export default Expense;
