import type { Request, Response } from 'express';

import {
  obtenerReporteHorariosMecanicos
} from '../services/reporte-horarios-mecanicos.service.js';

export async function obtenerHorariosMecanicos(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const mecanicos =
      await obtenerReporteHorariosMecanicos();

    res.json({ mecanicos });
  } catch (error) {
    console.error(
      'Error consultando el reporte de horarios de mecánicos:',
      error
    );

    res.status(500).json({
      mensaje:
        'No fue posible consultar los horarios de los mecánicos.'
    });
  }
}
