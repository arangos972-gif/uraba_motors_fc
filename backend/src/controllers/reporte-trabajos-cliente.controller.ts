import type { Request, Response } from 'express';

import {
  obtenerTrabajosPorCliente
} from '../services/reporte-trabajos-cliente.service.js';

export async function obtenerReporteTrabajosCliente(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const reporte = await obtenerTrabajosPorCliente();
    res.json(reporte);
  } catch (error) {
    console.error(
      'Error consultando trabajos por cliente:',
      error
    );

    res.status(500).json({
      mensaje: 'No fue posible consultar los trabajos por cliente.'
    });
  }
}
