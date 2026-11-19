
import type { Request, Response } from 'express';

import {
  obtenerAusencias,
  guardarAusencia,
  eliminarAusencia
} from '../services/ausencias.service.js';

// ========================================
// OBTENER ADMINISTRADOR AUTENTICADO
// ========================================

function obtenerAdministradorId(
  res: Response
): string | null {
  const usuario = res.locals.usuario as
    | { id?: unknown }
    | undefined;

  return typeof usuario?.id === 'string'
    ? usuario.id
    : null;
}

// ========================================
// RESPONDER ERRORES CONOCIDOS
// ========================================

function responderError(
  error: unknown,
  res: Response
) {
  const mensajes: Record<string, string> = {
    FECHAS_INVALIDAS:
      'Las fechas ingresadas no son válidas',

    PERIODO_INVALIDO:
      'La fecha de finalización debe ser posterior al inicio',

    MOTIVO_INVALIDO:
      'Ingresa un motivo de máximo 255 caracteres',

    TIPO_INVALIDO:
      'Selecciona un tipo de ausencia válido',

    MECANICO_INVALIDO:
      'Selecciona un mecánico activo',

    AUSENCIA_NO_EXISTE:
      'La ausencia solicitada no existe',

    AUSENCIA_SUPERPUESTA:
      'El mecánico ya tiene una ausencia en ese período'
  };

  if (
    error instanceof Error &&
    mensajes[error.message]
  ) {
    const codigo =
      error.message === 'AUSENCIA_NO_EXISTE'
        ? 404
        : 400;

    res.status(codigo).json({
      mensaje: mensajes[error.message]
    });

    return;
  }

  console.error('Error en ausencias:', error);

  res.status(500).json({
    mensaje: 'Error interno al administrar ausencias'
  });
}

// ========================================
// VALIDAR DATOS RECIBIDOS
// ========================================

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function leerDatos(req: Request) {
  const datos = req.body ?? {};

  if (
    typeof datos.mecanicoId !== 'string' ||
    !UUID.test(datos.mecanicoId) ||
    typeof datos.fechaInicio !== 'string' ||
    typeof datos.fechaFin !== 'string' ||
    typeof datos.motivo !== 'string' ||
    typeof datos.tipo !== 'string'
  ) {
    return null;
  }

  return {
    mecanicoId: datos.mecanicoId,
    fechaInicio: datos.fechaInicio.trim(),
    fechaFin: datos.fechaFin.trim(),
    motivo: datos.motivo.trim(),
    tipo: datos.tipo.trim().toUpperCase()
  };
}

// ========================================
// CONSULTAR AUSENCIAS
// ========================================

export async function listarAusencias(
  _req: Request,
  res: Response
) {
  try {
    const ausencias = await obtenerAusencias();

    res.status(200).json(ausencias);
  } catch (error) {
    responderError(error, res);
  }
}

// ========================================
// REGISTRAR AUSENCIA CON AUDITORÍA
// ========================================

export async function registrarAusencia(
  req: Request,
  res: Response
) {
  const datos = leerDatos(req);

  if (!datos) {
    res.status(400).json({
      mensaje: 'Los datos de la ausencia son inválidos'
    });

    return;
  }

  const administradorId = obtenerAdministradorId(res);

  if (!administradorId) {
    res.status(401).json({
      mensaje: 'Debes iniciar sesión'
    });

    return;
  }

  try {
    const ausencia = await guardarAusencia(
      datos,
      administradorId
    );

    res.status(201).json({
      mensaje: 'Ausencia registrada correctamente',
      ausencia
    });
  } catch (error) {
    responderError(error, res);
  }
}

// ========================================
// EDITAR AUSENCIA CON AUDITORÍA
// ========================================

export async function editarAusencia(
  req: Request,
  res: Response
) {
  const id = req.params.id;
  const datos = leerDatos(req);

  if (
    typeof id !== 'string' ||
    !UUID.test(id) ||
    !datos
  ) {
    res.status(400).json({
      mensaje: 'Los datos enviados no son válidos'
    });

    return;
  }

  const administradorId = obtenerAdministradorId(res);

  if (!administradorId) {
    res.status(401).json({
      mensaje: 'Debes iniciar sesión'
    });

    return;
  }

  try {
    const ausencia = await guardarAusencia(
      datos,
      administradorId,
      id
    );

    res.json({
      mensaje: 'Ausencia actualizada correctamente',
      ausencia
    });
  } catch (error) {
    responderError(error, res);
  }
}

// ========================================
// ELIMINAR AUSENCIA CON AUDITORÍA
// ========================================

export async function borrarAusencia(
  req: Request,
  res: Response
) {
  const id = req.params.id;

  if (
    typeof id !== 'string' ||
    !UUID.test(id)
  ) {
    res.status(400).json({
      mensaje: 'El ID de la ausencia no es válido'
    });

    return;
  }

  const administradorId = obtenerAdministradorId(res);

  if (!administradorId) {
    res.status(401).json({
      mensaje: 'Debes iniciar sesión'
    });

    return;
  }

  try {
    await eliminarAusencia(
      id,
      administradorId
    );

    res.json({
      mensaje: 'Ausencia eliminada correctamente'
    });
  } catch (error) {
    responderError(error, res);
  }
}
