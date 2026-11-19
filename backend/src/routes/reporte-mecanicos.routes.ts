import { Router } from 'express';

import {
  obtenerReporteMecanicos
} from '../controllers/reporte-mecanicos.controller.js';
import {
  verificarToken
} from '../middlewares/auth.middleware.js';
import {
  verificarPermiso
} from '../middlewares/permissions.middleware.js';

const router = Router();

router.use(verificarToken);
router.use(verificarPermiso('reportes.ver'));

router.get('/', obtenerReporteMecanicos);

export default router;
