import type { Request, Response } from 'express';

import {
  obtenerResumenMecanicos
} from '../services/reporte-mecanicos.service.js';

export async function obtenerReporteMecanicos(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const resumen = await obtenerResumenMecanicos();
    res.json(resumen);
  } catch (error) {
    console.error(
      'Error consultando el reporte de mecánicos:',
      error
    );

    res.status(500).json({
      mensaje: 'No fue posible consultar el reporte de mecánicos.'
    });
  }
}
