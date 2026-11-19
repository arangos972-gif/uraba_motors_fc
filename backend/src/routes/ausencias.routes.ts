
import { Router } from 'express';

import { verificarToken } from '../middlewares/auth.middleware.js';

import { verificarPermiso } from '../middlewares/permissions.middleware.js';

import {
  listarAusencias,
  registrarAusencia,
  editarAusencia,
  borrarAusencia
} from '../controllers/ausencias.controller.js';

const router = Router();

// Exigir autenticación
router.use(verificarToken);

// Administrar ausencias requiere permiso
// para gestionar los horarios de mecánicos.
router.use(
  verificarPermiso('mecanicos.gestionar_horarios')
);

router.get('/', listarAusencias);

router.post('/', registrarAusencia);

router.put('/:id', editarAusencia);

router.delete('/:id', borrarAusencia);

export default router;
