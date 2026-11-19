
import { Router } from 'express';

import {
  verificarToken
} from '../middlewares/auth.middleware.js';

import {
  verificarPermiso
} from '../middlewares/permissions.middleware.js';

import {
  crearVenta,
  listarVentas
} from '../controllers/ventas.controller.js';

const router = Router();

// Todas las ventas requieren autenticación.
router.use(verificarToken);

// Consultar historial de ventas.
router.get(
  '/',
  verificarPermiso('ventas.ver'),
  listarVentas
);

// Registrar venta de mostrador.
router.post(
  '/',
  verificarPermiso('ventas.registrar'),
  crearVenta
);

export default router;
