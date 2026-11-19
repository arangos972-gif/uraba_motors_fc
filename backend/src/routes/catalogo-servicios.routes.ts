
import { Router } from "express";

import {
  listarCatalogoServicios,
  registrarTipoServicio,
  editarTipoServicio,
  actualizarEstadoTipoServicio
} from "../controllers/catalogo-servicios.controller";

import { verificarToken } from "../middlewares/auth.middleware";
import { verificarPermiso } from "../middlewares/permissions.middleware";

const router = Router();

// Consultar catálogo
router.get(
  "/",
  verificarToken,
  verificarPermiso("servicios.ver"),
  listarCatalogoServicios
);

// Crear un tipo de servicio
router.post(
  "/",
  verificarToken,
  verificarPermiso("servicios.crear"),
  registrarTipoServicio
);

// Editar un tipo de servicio
router.put(
  "/:id",
  verificarToken,
  verificarPermiso("servicios.editar"),
  editarTipoServicio
);

// Activar o desactivar
router.patch(
  "/:id/estado",
  verificarToken,
  verificarPermiso("servicios.editar"),
  actualizarEstadoTipoServicio
);

export default router;
