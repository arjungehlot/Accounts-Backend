import { Router } from 'express';
import { getInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice, cancelInvoice } from '../controllers/invoiceController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.route('/')
  .get(getInvoices)
  .post(createInvoice);

router.route('/:id')
  .get(getInvoice)
  .put(updateInvoice)
  .delete(deleteInvoice);

router.patch('/:id/cancel', cancelInvoice);

export default router;
