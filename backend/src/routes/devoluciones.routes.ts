
import { Router } from 'express';

import {
  verificarToken
} from '../middlewares/auth.middleware.js';

import {
  verificarPermiso
} from '../middlewares/permissions.middleware.js';

import {
  crearDevolucion,
  listarDevoluciones,
  listarVentasDevolvibles,
  listarComprasDevolvibles
} from '../controllers/devoluciones.controller.js';

const router = Router();

// AUTENTICACIÓN

router.use(verificarToken);

// PERMISOS

router.use(
  verificarPermiso('inventario.editar')
);

// HISTORIAL

router.get('/', listarDevoluciones);

// VENTAS QUE PUEDEN DEVOLVERSE

router.get(
  '/ventas-disponibles',
  listarVentasDevolvibles
);

// COMPRAS QUE PUEDEN DEVOLVERSE

router.get(
  '/compras-disponibles',
  listarComprasDevolvibles
);

// REGISTRAR DEVOLUCIÓN

router.post('/', crearDevolucion);

export default router;
