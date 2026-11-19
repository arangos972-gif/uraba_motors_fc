import type { Request, Response } from 'express';

import {
  obtenerReporteIngresos
} from '../services/reporte-ingresos.service.js';

export async function obtenerReporteIngresosController(
  req: Request,
  res: Response
): Promise<void> {
  const anioTexto = req.query.anio;
  const mesTexto = req.query.mes;

  if (
    typeof anioTexto !== 'string' ||
    !/^\d{4}$/.test(anioTexto)
  ) {
    res.status(400).json({
      mensaje: 'Indica un año válido entre 2000 y 2100.'
    });
    return;
  }

  if (
    typeof mesTexto !== 'string' ||
    !/^\d{1,2}$/.test(mesTexto)
  ) {
    res.status(400).json({
      mensaje: 'Indica un mes válido entre 1 y 12.'
    });
    return;
  }

  const anio = Number(anioTexto);
  const mes = Number(mesTexto);

  if (anio < 2000 || anio > 2100) {
    res.status(400).json({
      mensaje: 'El año debe estar entre 2000 y 2100.'
    });
    return;
  }

  if (mes < 1 || mes > 12) {
    res.status(400).json({
      mensaje: 'El mes debe estar entre 1 y 12.'
    });
    return;
  }

  try {
    const reporte = await obtenerReporteIngresos(anio, mes);
    res.json(reporte);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'PERIODO_CON_DEMASIADOS_REPUESTOS'
    ) {
      res.status(422).json({
        mensaje:
          'El período contiene demasiados repuestos. Reduce el intervalo.'
      });
      return;
    }

    console.error(
      'Error consultando el reporte de ingresos:',
      error
    );

    res.status(500).json({
      mensaje: 'No fue posible consultar el reporte de ingresos.'
    });
  }
}
