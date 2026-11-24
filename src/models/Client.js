import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema(
  {
    clientName:     { type: String, required: true, trim: true },
    companyName:    { type: String, trim: true, default: '' },
    email:          { type: String, trim: true, lowercase: true, default: '' },
    phone:          { type: String, trim: true, default: '' },
    alternatePhone: { type: String, trim: true, default: '' },
    billingAddress: { type: String, default: '' },
    city:           { type: String, default: '' },
    state:          { type: String, default: '' },
    country:        { type: String, default: 'India' },
    pincode:        { type: String, default: '' },
    gstin:          { type: String, uppercase: true, default: '' },
    pan:            { type: String, uppercase: true, default: '' },
    clientType:     { type: String, enum: ['Individual', 'Company', 'Agency', 'Startup', 'NGO', 'Government', 'Other'], default: 'Company' },
    industry:       { type: String, default: '' },
    notes:          { type: String, default: '' },
    status:         { type: String, enum: ['active', 'inactive'], default: 'active' },
    // public read-only payment statement link (/#/share/<token>)
    shareToken:     { type: String, default: null, index: true, sparse: true },
    shareEnabled:   { type: Boolean, default: false },
    shareCreatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Text indexes for search
clientSchema.index({ clientName: 'text', companyName: 'text', email: 'text', phone: 'text' });

const Client = mongoose.model('Client', clientSchema);
export default Client;
