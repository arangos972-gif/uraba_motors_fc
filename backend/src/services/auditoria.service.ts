
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';

interface AuditoriaDB extends RowDataPacket {
  id: string;
  usuarioId: string;
  usuario: string | null;
  accion: string;
  modulo: string;
  detalles: string | null;
  ipAddress: string | null;
  created: string;
}

interface DatosAuditoria {
  usuarioId: string;
  accion: string;
  modulo: string;
  detalles?: string | null;
  ipAddress?: string | null;
}

// ========================================
// CONSULTAR EL HISTORIAL
// ========================================

export async function listarAuditoria() {
  const [registros] = await pool.execute<AuditoriaDB[]>(
    `SELECT
       a.id,
       a.usuarioId,
       u.name AS usuario,
       a.accion,
       a.modulo,
       a.detalles,
       a.ipAddress,
       DATE_FORMAT(
         a.created,
         '%Y-%m-%dT%H:%i:%s'
       ) AS created
     FROM auditoria_logs a
     LEFT JOIN users u
       ON u.id = a.usuarioId
     ORDER BY a.created DESC, a.id DESC
     LIMIT 100`
  );

  return registros;
}

// ========================================
// REGISTRAR UNA ACCIÓN
// ========================================

export async function registrarAuditoria(
  datos: DatosAuditoria
) {
  if (
    !datos.usuarioId ||
    !datos.accion ||
    !datos.modulo
  ) {
    throw new Error('DATOS_AUDITORIA_INVALIDOS');
  }

  await pool.execute(
    `INSERT INTO auditoria_logs (
       id,
       usuarioId,
       accion,
       modulo,
       detalles,
       ipAddress
     )
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      datos.usuarioId,
      datos.accion.slice(0, 100),
      datos.modulo.slice(0, 50),
      datos.detalles ?? null,
      datos.ipAddress?.slice(0, 45) ?? null
    ]
  );
}
