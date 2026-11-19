import type { Request, Response } from 'express';

import {
  obtenerResumenClientes
} from '../services/reporte-clientes.service.js';

export async function obtenerReporteClientes(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const resumen = await obtenerResumenClientes();
    res.json(resumen);
  } catch (error) {
    console.error(
      'Error consultando el reporte de clientes:',
      error
    );

    res.status(500).json({
      mensaje: 'No fue posible consultar el reporte de clientes.'
    });
  }
}
