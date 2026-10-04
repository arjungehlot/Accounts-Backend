import mongoose from 'mongoose';

const credentialSchema = new mongoose.Schema({
  label:     { type: String, required: true, default: 'Credential' },
  username:  { type: String, default: '' },
  email:     { type: String, default: '' },
  _password: { type: String, default: '' },   // stored AES-256 encrypted by controller
  url:       { type: String, default: '' },
  notes:     { type: String, default: '' },
}, { _id: true });

const projectSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    projectUrl:  { type: String, default: '' },
    repoUrl:     { type: String, default: '' },
    category: {
      type: String,
      enum: ['web', 'mobile', 'desktop', 'api', 'database', 'devops', 'other'],
      default: 'web',
    },
    status: {
      type: String,
      enum: ['active', 'development', 'maintenance', 'archived'],
      default: 'active',
    },
    color:       { type: String, default: '#6366F1' },
    tags:        [{ type: String, trim: true }],
    credentials: [credentialSchema],
  },
  { timestamps: true }
);

const Project = mongoose.model('Project', projectSchema);
export default Project;
