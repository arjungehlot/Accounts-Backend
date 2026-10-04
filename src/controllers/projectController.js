import crypto from 'crypto';
import Project from '../models/Project.js';

const ALGO    = 'aes-256-cbc';
const KEY_HEX = process.env.VAULT_ENCRYPTION_KEY || '0'.repeat(64);
const KEY     = Buffer.from(KEY_HEX.padEnd(64, '0').slice(0, 64), 'hex');

function encryptStr(text) {
  if (!text) return '';
  const iv        = crypto.randomBytes(16);
  const cipher    = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptStr(cipherText) {
  if (!cipherText || !cipherText.includes(':')) return cipherText || '';
  try {
    const [ivHex, encHex] = cipherText.split(':');
    const iv              = Buffer.from(ivHex, 'hex');
    const encrypted       = Buffer.from(encHex, 'hex');
    const decipher        = crypto.createDecipheriv(ALGO, KEY, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function serializeProject(project) {
  const obj = typeof project.toObject === 'function' ? project.toObject() : { ...project };
  obj.credentials = (obj.credentials || []).map(c => ({
    _id:      c._id,
    label:    c.label    || '',
    username: c.username || '',
    email:    c.email    || '',
    password: decryptStr(c._password || ''),
    url:      c.url      || '',
    notes:    c.notes    || '',
  }));
  return obj;
}

function buildCredential(c) {
  return {
    label:     c.label    || 'Credential',
    username:  c.username || '',
    email:     c.email    || '',
    _password: encryptStr(c.password || ''),
    url:       c.url      || '',
    notes:     c.notes    || '',
  };
}

// ── GET /api/projects ─────────────────────────────────────────────────────────
export const getProjects = async (req, res, next) => {
  try {
    const { search, status, category } = req.query;
    const filter = {};
    if (status   && status   !== 'all') filter.status   = status;
    if (category && category !== 'all') filter.category = category;
    if (search) filter.$or = [
      { name:        { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tags:        { $regex: search, $options: 'i' } },
    ];

    const projects = await Project.find(filter).sort({ updatedAt: -1 });
    res.json({ success: true, data: projects.map(serializeProject), total: projects.length });
  } catch (err) { next(err); }
};

// ── GET /api/projects/:id ─────────────────────────────────────────────────────
export const getProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    res.json({ success: true, data: serializeProject(project) });
  } catch (err) { next(err); }
};

// ── POST /api/projects ────────────────────────────────────────────────────────
export const createProject = async (req, res, next) => {
  try {
    const { name, description, projectUrl, repoUrl, category, status, color, tags, credentials } = req.body;
    const project = await Project.create({
      name, description, projectUrl, repoUrl, category, status, color, tags,
      credentials: Array.isArray(credentials) ? credentials.map(buildCredential) : [],
    });
    res.status(201).json({ success: true, data: serializeProject(project) });
  } catch (err) { next(err); }
};

// ── PUT /api/projects/:id ─────────────────────────────────────────────────────
export const updateProject = async (req, res, next) => {
  try {
    const { credentials, ...rest } = req.body;
    const update = { ...rest };
    if (Array.isArray(credentials)) update.credentials = credentials.map(buildCredential);

    const project = await Project.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    res.json({ success: true, data: serializeProject(project) });
  } catch (err) { next(err); }
};

// ── DELETE /api/projects/:id ──────────────────────────────────────────────────
export const deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (err) { next(err); }
};
