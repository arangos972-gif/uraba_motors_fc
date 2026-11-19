
import type { Request, Response } from 'express';

import {
  listarMecanicosActivos,
  listarHorariosMecanico,
  guardarHorarioMecanico
} from '../services/horarios-mecanicos.service.js';

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FORMATO_HORA =
  /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// Convierte una hora válida a HH:MM:SS
function normalizarHora(valor: unknown): string | null {
  if (typeof valor !== 'string') {
    return null;
  }

  const hora = valor.trim();

  if (!FORMATO_HORA.test(hora)) {
    return null;
  }

  return hora.length === 5 ? `${hora}:00` : hora;
}

// Respuestas para errores de validación
function responderError(
  error: unknown,
  res: Response
): void {
  const mensajes: Record<string, string> = {
    HORAS_INVALIDAS:
      'Las horas ingresadas no son válidas',

    TURNO_INVALIDO:
      'El inicio del turno debe ser anterior al cierre',

    ALMUERZO_INCOMPLETO:
      'Debes indicar el inicio y el fin del almuerzo',

    ALMUERZO_INVALIDO:
      'El almuerzo debe estar dentro del turno',

    MECANICO_INVALIDO:
      'El usuario no existe o no es un mecánico activo',

    HORARIO_TALLER_NO_CONFIGURADO:
      'Primero debes configurar el horario del taller',

    TALLER_CERRADO:
      'El taller no trabaja ese día',

    FUERA_HORARIO_TALLER:
      'El turno debe estar dentro del horario del taller',

    HORARIOS_DUPLICADOS:
      'Hay horarios duplicados para este mecánico y día'
  };

  if (error instanceof Error && mensajes[error.message]) {
    res.status(400).json({
      mensaje: mensajes[error.message]
    });
    return;
  }

  console.error('Error al administrar horarios:', error);

  res.status(500).json({
    mensaje: 'Error interno al administrar horarios'
  });
}

// GET /api/horarios-mecanicos/mecanicos
export async function obtenerMecanicos(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const mecanicos = await listarMecanicosActivos();

    res.json(mecanicos);
  } catch (error) {
    responderError(error, res);
  }
}

// GET /api/horarios-mecanicos/:mecanicoId
export async function obtenerHorarios(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const mecanicoId = req.params.mecanicoId;

    if (
      typeof mecanicoId !== 'string' ||
      !FORMATO_UUID.test(mecanicoId)
    ) {
      res.status(400).json({
        mensaje: 'El ID del mecánico no es válido'
      });
      return;
    }

    const horarios = await listarHorariosMecanico(
      mecanicoId
    );

    res.json(horarios);
  } catch (error) {
    responderError(error, res);
  }
}

// PUT /api/horarios-mecanicos/:mecanicoId/:diaSemana
export async function guardarHorario(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const mecanicoId = req.params.mecanicoId;
    const diaSemana = Number(req.params.diaSemana);

    if (
      typeof mecanicoId !== 'string' ||
      !FORMATO_UUID.test(mecanicoId)
    ) {
      res.status(400).json({
        mensaje: 'El ID del mecánico no es válido'
      });
      return;
    }

    if (
      !Number.isInteger(diaSemana) ||
      diaSemana < 1 ||
      diaSemana > 7
    ) {
      res.status(400).json({
        mensaje: 'El día debe estar entre 1 y 7'
      });
      return;
    }

    const cuerpo = req.body ?? {};

    if (typeof cuerpo.activo !== 'boolean') {
      res.status(400).json({
        mensaje: 'El campo activo debe ser true o false'
      });
      return;
    }

    const horaInicioTurno = normalizarHora(
      cuerpo.horaInicioTurno
    );

    const horaFinTurno = normalizarHora(
      cuerpo.horaFinTurno
    );

    if (!horaInicioTurno || !horaFinTurno) {
      res.status(400).json({
        mensaje: 'Debes indicar horas válidas para el turno'
      });
      return;
    }

    const inicioAlmuerzoVacio =
      cuerpo.horaInicioAlmuerzo === undefined ||
      cuerpo.horaInicioAlmuerzo === null ||
      cuerpo.horaInicioAlmuerzo === '';

    const finAlmuerzoVacio =
      cuerpo.horaFinAlmuerzo === undefined ||
      cuerpo.horaFinAlmuerzo === null ||
      cuerpo.horaFinAlmuerzo === '';

    if (inicioAlmuerzoVacio !== finAlmuerzoVacio) {
      res.status(400).json({
        mensaje: 'Completa las dos horas del almuerzo'
      });
      return;
    }

    const horaInicioAlmuerzo = inicioAlmuerzoVacio
      ? null
      : normalizarHora(cuerpo.horaInicioAlmuerzo);

    const horaFinAlmuerzo = finAlmuerzoVacio
      ? null
      : normalizarHora(cuerpo.horaFinAlmuerzo);

    if (
      (!inicioAlmuerzoVacio && !horaInicioAlmuerzo) ||
      (!finAlmuerzoVacio && !horaFinAlmuerzo)
    ) {
      res.status(400).json({
        mensaje: 'Las horas del almuerzo no son válidas'
      });
      return;
    }

    const horario = await guardarHorarioMecanico(
      mecanicoId,
      diaSemana,
      {
        horaInicioTurno,
        horaFinTurno,
        horaInicioAlmuerzo,
        horaFinAlmuerzo,
        activo: cuerpo.activo
      }
    );

    res.json({
      mensaje: 'Horario guardado correctamente',
      horario
    });
  } catch (error) {
    responderError(error, res);
  }
}
