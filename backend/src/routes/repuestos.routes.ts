
import { Router } from 'express';

import {
  verificarToken
} from '../middlewares/auth.middleware.js';

import {
  verificarPermiso
} from '../middlewares/permissions.middleware.js';

import {
  listarRepuestos,
  listarInventarioRepuestos,
  listarCategorias,
  registrarCategoria,
  registrarRepuesto,
  editarRepuesto
} from '../controllers/repuestos.controller.js';

const router = Router();

// ========================================
// AUTENTICACIÓN
// ========================================

// Todas las rutas requieren iniciar sesión.
router.use(verificarToken);

// ========================================
// CONSULTAS GENERALES
// ========================================

// Consultar repuestos, precios de venta
// y existencias.
router.get(
  '/',
  verificarPermiso('inventario.ver'),
  listarRepuestos
);

// Consultar categorías de repuestos.
router.get(
  '/categorias',
  verificarPermiso('inventario.ver'),
  listarCategorias
);

// ========================================
// CONSULTAS COMPLETAS DE INVENTARIO
// ========================================

// Consultar inventario con costo PMP
// y porcentaje de ganancia.
router.get(
  '/inventario',
  verificarPermiso('inventario.ver'),
  listarInventarioRepuestos
);

// ========================================
// ADMINISTRACIÓN DE CATEGORÍAS
// ========================================

// Registrar una nueva categoría.
router.post(
  '/categorias',
  verificarPermiso('inventario.crear'),
  registrarCategoria
);

// ========================================
// ADMINISTRACIÓN DE REPUESTOS
// ========================================

// Registrar un nuevo repuesto.
// El precio de venta se calculará
// automáticamente con la primera compra.
router.post(
  '/',
  verificarPermiso('inventario.crear'),
  registrarRepuesto
);

// Editar repuesto y porcentaje de ganancia.
// El precio se recalcula mediante PMP.
router.put(
  '/:id',
  verificarPermiso('inventario.editar'),
  editarRepuesto
);

export default router;
