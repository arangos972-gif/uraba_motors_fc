
import { Router } from 'express';
import {
  login,
  consultarSesion
} from '../controllers/auth.controller.js';
import { verificarToken } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/login', login);

router.get('/me', verificarToken, consultarSesion);

export default router;