import { Router } from 'express';
import { getPayments, getPayment, createPayment, updatePayment, deletePayment } from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.route('/').get(getPayments).post(createPayment);
router.route('/:id').get(getPayment).put(updatePayment).delete(deletePayment);

export default router;
