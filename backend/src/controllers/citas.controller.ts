
import type { Request, Response } from 'express';

import {
  obtenerCitas,
  crearCita
} from '../services/citas.service.js';

// ========================================
// VALIDACIÓN DE IDENTIFICADORES UUID
// Formato correcto: 8-4-4-4-12
// ========================================

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ========================================
// RESPONDER ERRORES CONOCIDOS
// ========================================

function responderError(
  error: unknown,
  res: Response
) {
  const mensajes: Record<string, string> = {
    IDENTIFICADORES_INVALIDOS:
      'Selecciona un cliente, una moto y un mecánico válidos',

    FECHA_HORA_INVALIDA:
      'Selecciona una fecha y hora válidas',

    DURACION_INVALIDA:
      'La duración debe estar entre 15 y 600 minutos',

    SERVICIO_INVALIDO:
      'Ingresa el servicio solicitado (máximo 100 caracteres)',

    DESCRIPCION_INVALIDA:
      'La descripción no es válida',

    CITA_FUERA_DEL_DIA:
      'La cita no puede terminar al día siguiente',

    CITA_EN_EL_PASADO:
      'No puedes registrar citas en fechas u horas pasadas',

    MECANICO_INVALIDO:
      'Selecciona un mecánico activo',

    MOTO_CLIENTE_INVALIDOS:
      'La moto seleccionada no pertenece al cliente',

    HORARIO_TALLER_NO_CONFIGURADO:
      'No está configurado el horario del taller para ese día',

    TALLER_CERRADO:
      'El taller permanece cerrado ese día',

    FUERA_HORARIO_TALLER:
      'La cita está fuera del horario del taller',

    MECANICO_NO_TRABAJA:
      'El mecánico no trabaja ese día',

    FUERA_TURNO_MECANICO:
      'La cita está fuera del turno del mecánico',

    CONFLICTO_ALMUERZO:
      'La cita coincide con el descanso del mecánico',

    MECANICO_AUSENTE:
      'El mecánico tiene una ausencia registrada',

    CITA_SUPERPUESTA:
      'El mecánico ya tiene otra cita en ese horario'
  };

  if (
    error instanceof Error &&
    mensajes[error.message]
  ) {
    const codigo =
      error.message === 'CITA_SUPERPUESTA'
        ? 409
        : 400;

    res.status(codigo).json({
      mensaje: mensajes[error.message]
    });

    return;
  }

  console.error('Error en citas:', error);

  res.status(500).json({
    mensaje: 'Error interno al administrar las citas'
  });
}

// ========================================
// CONSULTAR CITAS
// ========================================

export async function listarCitas(
  _req: Request,
  res: Response
) {
  try {
    const citas = await obtenerCitas();

    res.status(200).json(citas);
  } catch (error) {
    responderError(error, res);
  }
}

// ========================================
// REGISTRAR CITA
// ========================================

export async function registrarCita(
  req: Request,
  res: Response
) {
  const datos = req.body ?? {};

  // Validar los datos recibidos.
  if (
    typeof datos.clienteId !== 'string' ||
    !UUID.test(datos.clienteId) ||

    typeof datos.motoId !== 'string' ||
    !UUID.test(datos.motoId) ||

    typeof datos.mecanicoId !== 'string' ||
    !UUID.test(datos.mecanicoId) ||

    typeof datos.fecha !== 'string' ||
    typeof datos.hora !== 'string' ||
    typeof datos.tipoServicio !== 'string' ||

    (
      datos.descripcion !== undefined &&
      datos.descripcion !== null &&
      typeof datos.descripcion !== 'string'
    )
  ) {
    res.status(400).json({
      mensaje: 'Los datos de la cita son inválidos'
    });

    return;
  }

  // Duración predeterminada: 60 minutos.
  const duracionMinutos =
    datos.duracionMinutos === undefined
      ? 60
      : datos.duracionMinutos;

  if (
    typeof duracionMinutos !== 'number' ||
    !Number.isInteger(duracionMinutos)
  ) {
    res.status(400).json({
      mensaje:
        'La duración de la cita debe ser un número entero'
    });

    return;
  }

  try {
    // Las validaciones de disponibilidad se realizan
    // dentro del servicio de Citas.
    const cita = await crearCita({
      clienteId: datos.clienteId,
      motoId: datos.motoId,
      mecanicoId: datos.mecanicoId,
      fecha: datos.fecha,
      hora: datos.hora,
      duracionMinutos,
      tipoServicio: datos.tipoServicio,
      descripcion: datos.descripcion ?? null
    });

    res.status(201).json({
      mensaje: 'Cita registrada correctamente',
      cita
    });
  } catch (error) {
    responderError(error, res);
  }
}
