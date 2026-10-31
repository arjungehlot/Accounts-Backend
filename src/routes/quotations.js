import { Router } from 'express';
import {
  getQuotations, getQuotation, getNextQuotationNumber, createQuotation, updateQuotation,
  updateQuotationStatus, duplicateQuotation, convertToInvoice, deleteQuotation,
} from '../controllers/quotationController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/next-number', getNextQuotationNumber); // must stay above /:id

router.route('/')
  .get(getQuotations)
  .post(createQuotation);

router.route('/:id')
  .get(getQuotation)
  .put(updateQuotation)
  .delete(deleteQuotation);

router.patch('/:id/status', updateQuotationStatus);
router.post('/:id/duplicate', duplicateQuotation);
router.post('/:id/convert', convertToInvoice);

export default router;
