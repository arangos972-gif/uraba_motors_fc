
import { Router } from "express";

import {
  listarClientes,
  registrarCliente,
  editarCliente,
  actualizarEstadoCliente
} from "../controllers/clientes.controller";

import { verificarToken } from "../middlewares/auth.middleware";
import { verificarPermiso } from "../middlewares/permissions.middleware";

const router = Router();

// Consultar clientes
router.get(
  "/",
  verificarToken,
  verificarPermiso("clientes.ver"),
  listarClientes
);

// Crear cliente
router.post(
  "/",
  verificarToken,
  verificarPermiso("clientes.crear"),
  registrarCliente
);

// Editar cliente
router.put(
  "/:id",
  verificarToken,
  verificarPermiso("clientes.editar"),
  editarCliente
);

// Archivar o reactivar cliente
router.patch(
  "/:id/estado",
  verificarToken,
  verificarPermiso("clientes.editar"),
  actualizarEstadoCliente
);

export default router;
