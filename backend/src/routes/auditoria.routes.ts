
import { Router } from 'express';

import { verificarToken } from '../middlewares/auth.middleware.js';

import { verificarPermiso } from '../middlewares/permissions.middleware.js';

import {
  obtenerAuditoria
} from '../controllers/auditoria.controller.js';

const router = Router();

// Solo usuarios autenticados
router.use(verificarToken);

// Solo personal autorizado para administrar usuarios
router.use(
  verificarPermiso('roles.administrar')
);

// Consultar historial
router.get('/', obtenerAuditoria);

export default router;
