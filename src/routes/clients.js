import { Router } from 'express';
import { getClients, getClient, createClient, updateClient, deleteClient, manageShare } from '../controllers/clientController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.route('/')
  .get(getClients)
  .post(createClient);

router.post('/:id/share', manageShare);

router.route('/:id')
  .get(getClient)
  .put(updateClient)
  .delete(deleteClient);

export default router;
