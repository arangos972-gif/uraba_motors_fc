
import { Router } from "express";

import {
  listarMotos,
  registrarMoto,
  editarMoto,
  actualizarEstadoMoto
} from "../controllers/motos.controller";

import { verificarToken } from "../middlewares/auth.middleware";
import { verificarPermiso } from "../middlewares/permissions.middleware";

const router = Router();

// CONSULTAR MOTOCICLETAS
router.get(
  "/",
  verificarToken,
  verificarPermiso("motos.ver"),
  listarMotos
);

// CREAR MOTOCICLETA
router.post(
  "/",
  verificarToken,
  verificarPermiso("motos.crear"),
  registrarMoto
);

// EDITAR MOTOCICLETA
router.put(
  "/:id",
  verificarToken,
  verificarPermiso("motos.editar"),
  editarMoto
);

// ARCHIVAR O REACTIVAR
router.patch(
  "/:id/estado",
  verificarToken,
  verificarPermiso("motos.editar"),
  actualizarEstadoMoto
);

export default router;
