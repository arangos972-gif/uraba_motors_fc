
import { Router } from 'express';

import {
  verificarToken
} from '../middlewares/auth.middleware.js';

import {
  verificarPermiso
} from '../middlewares/permissions.middleware.js';

import {
  listarCitas,
  registrarCita
} from '../controllers/citas.controller.js';

const router = Router();

router.use(verificarToken);

// Permiso administrativo temporal.
// Antes de habilitar Citas para Recepción,
// configuraremos permisos específicos.
router.get(
  '/',
  verificarPermiso('citas.ver'),
  listarCitas
);
router.post(
  '/',
  verificarPermiso('citas.crear'),
  registrarCita
);

export default router;
