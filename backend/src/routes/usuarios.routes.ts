
import { Router } from 'express';

import { verificarToken } from '../middlewares/auth.middleware.js';

import { verificarPermiso } from '../middlewares/permissions.middleware.js';

import {
  listarUsuarios,
  listarRoles,
  registrarUsuario,
  editarUsuario,
  cambiarEstado
} from '../controllers/usuarios.controller.js';

const router = Router();

// Exigir inicio de sesión
router.use(verificarToken);

// Consultar usuarios
router.get(
  '/',
  verificarPermiso('usuarios.ver'),
  listarUsuarios
);

// Consultar roles activos
router.get(
  '/roles',
  verificarPermiso('roles.ver'),
  listarRoles
);

// Registrar usuario
router.post(
  '/',
  verificarPermiso('usuarios.crear'),
  registrarUsuario
);

// Actualizar usuario
router.put(
  '/:id',
  verificarPermiso('usuarios.editar'),
  editarUsuario
);

// Activar o desactivar usuario
router.patch(
  '/:id/estado',
  verificarPermiso('usuarios.desactivar'),
  cambiarEstado
);

export default router;
