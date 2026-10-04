import { Router } from 'express';
import {
  getReportSummary,
  getMonthlyChart,
  getExpenseCategories,
  getRecentTransactions,
  getClientReport,
  getInvoiceSummary,
} from '../controllers/reportsController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/summary',             getReportSummary);
router.get('/monthly',             getMonthlyChart);
router.get('/expense-categories',  getExpenseCategories);
router.get('/recent-transactions', getRecentTransactions);
router.get('/client-report',       getClientReport);
router.get('/invoice-summary',     getInvoiceSummary);

export default router;
