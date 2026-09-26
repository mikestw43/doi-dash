import { Router, Request, Response } from 'express';
import { receiveMT5Push, receiveMT5Ack } from '../controllers/mt5Controller';

const router = Router();

// No JWT auth here — EA uses API key in body instead
router.post('/push', (req: Request, res: Response) => {
  receiveMT5Push(req, res);
});

// The EA reports back here after it has run (or refused) a command.
router.post('/ack', (req: Request, res: Response) => {
  void receiveMT5Ack(req, res);
});

export default router;
