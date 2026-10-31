import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import connectDB from './config/db.js';
import errorHandler from './middleware/errorHandler.js';

import authRoutes      from './routes/auth.js';
import clientRoutes    from './routes/clients.js';
import invoiceRoutes   from './routes/invoices.js';
import paymentRoutes   from './routes/payments.js';
import expenseRoutes   from './routes/expenses.js';
import itemRoutes      from './routes/items.js';
import settingsRoutes  from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import projectRoutes  from './routes/projects.js';
import reportsRoutes  from './routes/reports.js';
import quotationRoutes from './routes/quotations.js';

// Connect to MongoDB
await connectDB();

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/clients',   clientRoutes);
app.use('/api/invoices',  invoiceRoutes);
app.use('/api/payments',  paymentRoutes);
app.use('/api/expenses',  expenseRoutes);
app.use('/api/items',     itemRoutes);
app.use('/api/settings',  settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/projects',  projectRoutes);
app.use('/api/reports',   reportsRoutes);
app.use('/api/quotations', quotationRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'BuildSoftware Accounts API is running 🚀', timestamp: new Date().toISOString() });
});

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 BuildSoftware Accounts API`);
  console.log(`   Running at: http://localhost:${PORT}`);
  console.log(`   Env:        ${process.env.NODE_ENV}`);
  console.log(`   Health:     http://localhost:${PORT}/api/health\n`);
});
