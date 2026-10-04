import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    // Company Info
    companyName:  { type: String, default: 'BuildSoftware' },
    logo:         { type: String, default: null },
    address:      { type: String, default: '' },
    city:         { type: String, default: '' },
    state:        { type: String, default: '' },
    country:      { type: String, default: 'India' },
    pincode:      { type: String, default: '' },
    phone:        { type: String, default: '' },
    email:        { type: String, default: '' },
    website:      { type: String, default: '' },
    gstin:        { type: String, default: '' },
    pan:          { type: String, default: '' },
    // Invoice Settings
    invoicePrefix:  { type: String, default: 'BS-INV' },
    startingNumber: { type: Number, default: 1 },
    defaultTax:     { type: Number, default: 18 },
    defaultCurrency: { type: String, default: 'INR' },
    paymentTerms:   { type: String, default: 'Net 30' },
    invoiceFooter:  { type: String, default: 'Thank you for choosing BuildSoftware.' },
    termsConditions: { type: String, default: '' },
    // Bank Details
    bankName:      { type: String, default: '' },
    accountHolder: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifsc:          { type: String, default: '' },
    upiId:         { type: String, default: '' },
  },
  { timestamps: true }
);

const Settings = mongoose.model('Settings', settingsSchema);
export default Settings;
