
import type { Request, Response } from 'express';

import {
  listarAuditoria
} from '../services/auditoria.service.js';

// ========================================
// CONSULTAR HISTORIAL DE AUDITORÍA
// ========================================

export async function obtenerAuditoria(
  _req: Request,
  res: Response
) {
  try {
    const registros = await listarAuditoria();

    res.status(200).json(registros);
  } catch (error) {
    console.error(
      'Error al consultar auditoría:',
      error
    );

    res.status(500).json({
      mensaje:
        'No fue posible consultar el historial de auditoría.'
    });
  }
}
