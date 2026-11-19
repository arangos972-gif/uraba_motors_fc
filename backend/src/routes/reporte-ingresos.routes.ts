import { Router } from 'express';

import {
  obtenerReporteIngresosController
} from '../controllers/reporte-ingresos.controller.js';
import {
  verificarToken
} from '../middlewares/auth.middleware.js';
import {
  verificarPermiso
} from '../middlewares/permissions.middleware.js';

const router = Router();

router.use(verificarToken);
router.use(verificarPermiso('reportes.ver'));

router.get('/', obtenerReporteIngresosController);

export default router;
