import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';

interface ResumenClientesDB extends RowDataPacket {
  totalClientes: number | string;
  clientesActivos: number | string;
  clientesArchivados: number | string;
}

export async function obtenerResumenClientes() {
  const [filas] = await pool.execute<ResumenClientesDB[]>(
    `SELECT
       COUNT(*) AS totalClientes,
       COALESCE(
         SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END),
         0
       ) AS clientesActivos,
       COALESCE(
         SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END),
         0
       ) AS clientesArchivados
     FROM clientes`
  );

  const resumen = filas[0];

  return {
    totalClientes: Number(resumen.totalClientes),
    clientesActivos: Number(resumen.clientesActivos),
    clientesArchivados: Number(resumen.clientesArchivados)
  };
}
