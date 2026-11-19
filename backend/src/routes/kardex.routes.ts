
import { Router } from 'express';

import {
  verificarToken
} from '../middlewares/auth.middleware.js';

import {
  verificarPermiso
} from '../middlewares/permissions.middleware.js';

import {
  listarKardex
} from '../controllers/kardex.controller.js';

const router = Router();

// Requiere iniciar sesión.
router.use(verificarToken);

// Consultar movimientos y costos de inventario.
router.use(
  verificarPermiso('inventario.ver')
);

// Consultar movimientos y sus filtros.
router.get('/', listarKardex);

export default router;
