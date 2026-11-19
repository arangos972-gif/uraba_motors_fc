
import { Router } from 'express';

import {
  verificarToken
} from '../middlewares/auth.middleware.js';

import {
  verificarPermiso
} from '../middlewares/permissions.middleware.js';
import {
  registrarEntregaMotocicleta
} from '../controllers/entregas.controller.js';
import {
  iniciarOrden,
  listarOrdenes,
  actualizarEstadoOrden,
  consultarDetalleOrden,
  agregarTrabajo,
  agregarRepuesto,
  finalizarOrden
} from '../controllers/ordenes.controller.js';

const router = Router();

// ========================================
// AUTENTICACIÓN
// ========================================

router.use(verificarToken);

// ========================================
// LISTAR ÓRDENES
// ========================================

router.get(
  '/',
  verificarPermiso('servicios.ver'),
  listarOrdenes
);

// ========================================
// INICIAR ORDEN DESDE UNA CITA
// ========================================

router.post(
  '/desde-cita/:citaId/iniciar',
  verificarPermiso('servicios.crear'),
  iniciarOrden
);

// ========================================
// CONSULTAR DETALLE DE UNA ORDEN
// ========================================

router.get(
  '/:id',
  verificarPermiso('servicios.ver'),
  consultarDetalleOrden
);

// ========================================
// AGREGAR MANO DE OBRA
// ========================================

router.post(
  '/:id/trabajos',
  verificarPermiso(
    'servicios.crear',
    'servicios.editar',
    'servicios.actualizar_estado'
  ),
  agregarTrabajo
);

// ========================================
// AGREGAR REPUESTOS UTILIZADOS
// ========================================

router.post(
  '/:id/repuestos',
  verificarPermiso(
    'servicios.crear',
    'servicios.editar',
    'servicios.actualizar_estado'
  ),
  agregarRepuesto
);

// ========================================
// PAUSAR O REANUDAR
// ========================================

router.patch(
  '/:id/estado',
  verificarPermiso('servicios.actualizar_estado'),
  actualizarEstadoOrden
);

// ========================================
// FINALIZAR ORDEN DE TRABAJO
// ========================================

router.patch(
  '/:id/finalizar',
  verificarPermiso('servicios.actualizar_estado'),
  finalizarOrden
);

router.patch(
  '/:id/entregar',
  registrarEntregaMotocicleta
);

export default router;
