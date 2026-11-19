import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';

interface ResumenMecanicosDB extends RowDataPacket {
  totalMecanicos: number | string;
  mecanicosActivos: number | string;
}

export async function obtenerResumenMecanicos() {
  const [filas] = await pool.execute<ResumenMecanicosDB[]>(
    `SELECT
       COUNT(DISTINCT u.id) AS totalMecanicos,
       COUNT(
         DISTINCT CASE
           WHEN u.active = 1 AND r.activo = 1 THEN u.id
         END
       ) AS mecanicosActivos
     FROM users u
     INNER JOIN roles r
       ON r.id = u.roleId
     WHERE r.nombre = 'Mecánico'`
  );

  const totalMecanicos = Number(filas[0].totalMecanicos);
  const mecanicosActivos = Number(filas[0].mecanicosActivos);

  return {
    totalMecanicos,
    mecanicosActivos,
    mecanicosInactivos: totalMecanicos - mecanicosActivos
  };
}
