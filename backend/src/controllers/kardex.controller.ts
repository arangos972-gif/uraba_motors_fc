
import type { Request, Response } from 'express';

import {
  obtenerKardex
} from '../services/kardex.service.js';

// ========================================
// CONSULTAR KARDEX
// ========================================

export async function listarKardex(
  req: Request,
  res: Response
) {
  try {
    const filtros = {
      repuestoId:
        typeof req.query.repuestoId === 'string'
          ? req.query.repuestoId
          : undefined,

      tipoMovimiento:
        typeof req.query.tipoMovimiento === 'string'
          ? req.query.tipoMovimiento
          : undefined,

      desde:
        typeof req.query.desde === 'string'
          ? req.query.desde
          : undefined,

      hasta:
        typeof req.query.hasta === 'string'
          ? req.query.hasta
          : undefined,

      busqueda:
        typeof req.query.busqueda === 'string'
          ? req.query.busqueda
          : undefined,

      pagina:
        typeof req.query.pagina === 'string'
          ? Number(req.query.pagina)
          : 1
    };

    const resultado = await obtenerKardex(filtros);

    res.status(200).json(resultado);

  } catch (error) {
    const mensajes: Record<string, string> = {
      REPUESTO_ID_INVALIDO:
        'El identificador del repuesto no es válido',

      TIPO_MOVIMIENTO_INVALIDO:
        'El tipo de movimiento no es válido',

      FECHA_INVALIDA:
        'La fecha seleccionada no es válida',

      RANGO_FECHAS_INVALIDO:
        'La fecha inicial no puede ser mayor a la final',

      PAGINA_INVALIDA:
        'La página solicitada no es válida'
    };

    if (
      error instanceof Error &&
      mensajes[error.message]
    ) {
      res.status(400).json({
        mensaje: mensajes[error.message]
      });

      return;
    }

    console.error(
      'Error al consultar Kardex:',
      error
    );

    res.status(500).json({
      mensaje:
        'No fue posible consultar los movimientos del inventario'
    });
  }
}
