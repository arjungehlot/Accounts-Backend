import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema(
  {
    text:  { type: String, required: true },
    type:  { type: String, enum: ['invoice', 'payment', 'client', 'expense', 'quotation', 'system'], required: true },
    color: { type: String, default: '#2563EB' },
    refId: { type: String, default: null }, // optional reference id
  },
  { timestamps: true }
);

activitySchema.index({ createdAt: -1 });

const Activity = mongoose.model('Activity', activitySchema);
export default Activity;
