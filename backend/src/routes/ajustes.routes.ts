
import { Router } from 'express';

import {
  verificarToken
} from '../middlewares/auth.middleware.js';

import {
  verificarPermiso
} from '../middlewares/permissions.middleware.js';

import {
  crearAjuste,
  listarAjustes
} from '../controllers/ajustes.controller.js';

const router = Router();

// Requiere usuario autenticado.
router.use(verificarToken);

// Los ajustes modifican las existencias.
router.use(
  verificarPermiso('inventario.editar')
);

// Consultar historial de ajustes.
router.get('/', listarAjustes);

// Registrar nuevo ajuste.
router.post('/', crearAjuste);

export default router;
