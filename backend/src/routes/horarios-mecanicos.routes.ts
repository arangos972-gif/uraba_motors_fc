
import { Router } from 'express';

import { verificarToken } from '../middlewares/auth.middleware.js';

import { verificarPermiso } from '../middlewares/permissions.middleware.js';

import {
  obtenerMecanicos,
  obtenerHorarios,
  guardarHorario
} from '../controllers/horarios-mecanicos.controller.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(verificarToken);

// La lista de mecánicos se usa para consultar y crear citas.
router.get(
  '/mecanicos',
  verificarPermiso('citas.ver'),
  obtenerMecanicos
);

// Consultar los horarios de un mecánico
router.get(
  '/:mecanicoId',
  verificarPermiso('mecanicos.gestionar_horarios'),
  obtenerHorarios
);

// Crear o actualizar el horario de un día
router.put(
  '/:mecanicoId/:diaSemana',
  verificarPermiso('mecanicos.gestionar_horarios'),
  guardarHorario
);

export default router;
