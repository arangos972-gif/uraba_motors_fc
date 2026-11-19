import { Router } from 'express';

import {
  obtenerReporteTrabajosCliente
} from '../controllers/reporte-trabajos-cliente.controller.js';
import {
  verificarToken
} from '../middlewares/auth.middleware.js';
import {
  verificarPermiso
} from '../middlewares/permissions.middleware.js';

const router = Router();

router.use(verificarToken);
router.use(verificarPermiso('reportes.ver'));

router.get('/', obtenerReporteTrabajosCliente);

export default router;
