
import { Router } from 'express';

import {
  verificarToken
} from '../middlewares/auth.middleware.js';

import {
  verificarPermiso
} from '../middlewares/permissions.middleware.js';

import {
  crearCompra,
  listarCompras,
  consultarCompra
} from '../controllers/compras.controller.js';

const router = Router();

// ========================================
// AUTENTICACIÓN Y PERMISOS
// ========================================

router.use(verificarToken);

// ========================================
// HISTORIAL DE COMPRAS
// ========================================

router.get(
  '/',
  verificarPermiso('compras.ver'),
  listarCompras
);

// ========================================
// CONSULTAR DETALLE DE UNA COMPRA
// ========================================

router.get(
  '/:id',
  verificarPermiso('compras.ver'),
  consultarCompra
);

// ========================================
// REGISTRAR NUEVA COMPRA
// ========================================

router.post(
  '/',
  verificarPermiso('compras.registrar'),
  crearCompra
);

export default router;
