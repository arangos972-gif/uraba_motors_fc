
import { Router } from 'express';

import { verificarToken } from '../middlewares/auth.middleware.js';

import {
  listarOrdenesPendientesFacturar,
  crearFacturaDesdeOrden,
  listarFacturas,
  consultarFactura
} from '../controllers/facturas.controller.js';
import {
  crearPagoFactura
} from '../controllers/pagos.controller.js';
const router = Router();

// Todas las rutas requieren autenticación.
router.use(verificarToken);

// Consultar órdenes que pueden facturarse.
router.get(
  '/pendientes',
  listarOrdenesPendientesFacturar
);

// Generar una factura desde una orden completada.
router.post(
  '/desde-orden/:ordenId',
  crearFacturaDesdeOrden
);

// Consultar historial de facturas.
router.get(
  '/',
  listarFacturas
);

// Consultar una factura individual.
// Debe permanecer después de /pendientes.
router.get(
  '/:id',
  consultarFactura
);
router.post(
  '/:id/pagos',
  crearPagoFactura
);
export default router;
