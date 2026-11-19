
import type { Request, Response } from 'express';

import {
  registrarAjuste,
  obtenerAjustes
} from '../services/ajustes.service.js';

// ========================================
// MANEJO DE ERRORES
// ========================================

function responderError(
  error: unknown,
  res: Response
) {
  const mensajes: Record<string, string> = {

    REPUESTO_ID_INVALIDO:
      'El identificador del repuesto no es válido',

    USUARIO_INVALIDO:
      'El usuario autenticado no es válido',

    TIPO_AJUSTE_INVALIDO:
      'Selecciona un tipo de ajuste válido',

    CANTIDAD_INVALIDA:
      'La cantidad debe ser un número entero mayor a cero',

    STOCK_INVALIDO:
      'El stock de referencia no es válido',

    MOTIVO_INVALIDO:
      'El motivo debe tener entre 5 y 200 caracteres',

    REPUESTO_NO_EXISTE:
      'El repuesto seleccionado no existe',

    STOCK_MODIFICADO:
      'Las existencias cambiaron. Actualiza la información y revisa el ajuste antes de continuar',

    PMP_NO_DISPONIBLE:
      'El repuesto no tiene un costo PMP válido',

    STOCK_INSUFICIENTE:
      'No hay suficientes existencias para realizar el ajuste',

    STOCK_MAXIMO_SUPERADO:
      'La cantidad supera el límite permitido'
  };

  if (
    error instanceof Error &&
    mensajes[error.message]
  ) {
    let estado = 400;

    if (error.message === 'REPUESTO_NO_EXISTE') {
      estado = 404;
    }

    if (
      error.message === 'STOCK_MODIFICADO' ||
      error.message === 'STOCK_INSUFICIENTE' ||
      error.message === 'PMP_NO_DISPONIBLE'
    ) {
      estado = 409;
    }

    res.status(estado).json({
      mensaje: mensajes[error.message]
    });

    return;
  }

  console.error('Error en ajustes:', error);

  res.status(500).json({
    mensaje:
      'No fue posible procesar el ajuste de inventario'
  });
}

// ========================================
// CREAR AJUSTE
// ========================================

export async function crearAjuste(
  req: Request,
  res: Response
) {
  const usuario = res.locals.usuario;

  if (!usuario?.id) {
    res.status(401).json({
      mensaje: 'Debes iniciar sesión'
    });

    return;
  }

  const datos = req.body ?? {};

  if (
    typeof datos.repuestoId !== 'string' ||
    typeof datos.cantidad !== 'number' ||
    typeof datos.motivo !== 'string' ||
    typeof datos.stockEsperado !== 'number' ||
    (
      datos.tipoAjuste !== 'SOBRANTE' &&
      datos.tipoAjuste !== 'FALTANTE' &&
      datos.tipoAjuste !== 'DANADO'
    )
  ) {
    res.status(400).json({
      mensaje: 'Los datos del ajuste no son válidos'
    });

    return;
  }

  try {

    const ajuste = await registrarAjuste(
      {
        repuestoId: datos.repuestoId,
        tipoAjuste: datos.tipoAjuste,
        cantidad: datos.cantidad,
        motivo: datos.motivo,
        stockEsperado: datos.stockEsperado
      },
      usuario.id
    );

    res.status(201).json({
      mensaje:
        'Ajuste registrado correctamente. Existencias y Kardex actualizados.',
      ajuste
    });

  } catch (error) {

    responderError(error, res);

  }
}

// ========================================
// LISTAR AJUSTES
// ========================================

export async function listarAjustes(
  _req: Request,
  res: Response
) {
  try {

    const ajustes = await obtenerAjustes();

    res.status(200).json(ajustes);

  } catch (error) {

    responderError(error, res);

  }
}
