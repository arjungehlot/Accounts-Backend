import mongoose from 'mongoose';

const itemMasterSchema = new mongoose.Schema(
  {
    code:        { type: String, required: true, unique: true, trim: true },
    category:    { type: String, required: true, trim: true },
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    rate:        { type: Number, required: true, min: 0 },
    tax:         { type: Number, default: 18, min: 0 },
    unit:        { type: String, enum: ['Monthly', 'Annual', 'Project', 'Service', 'Per Unit', 'Hourly'], default: 'Monthly' },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

itemMasterSchema.index({ category: 1 });

const ItemMaster = mongoose.model('ItemMaster', itemMasterSchema);
export default ItemMaster;
