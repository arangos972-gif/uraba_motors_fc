import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';

interface TrabajosClienteDB extends RowDataPacket {
  clienteId: string;
  nombre: string;
  activo: number;
  totalTrabajos: number | string;
  trabajosEnProceso: number | string;
  trabajosPausados: number | string;
  trabajosCompletados: number | string;
  trabajosCancelados: number | string;
}

export async function obtenerTrabajosPorCliente() {
  const [filas] = await pool.execute<TrabajosClienteDB[]>(
    `SELECT
       cl.id AS clienteId,
       cl.nombre,
       cl.activo,
       COUNT(trabajo.id) AS totalTrabajos,
       COALESCE(
         SUM(
           CASE WHEN trabajo.estado = 'EN_PROCESO'
             THEN 1 ELSE 0 END
         ),
         0
       ) AS trabajosEnProceso,
       COALESCE(
         SUM(
           CASE WHEN trabajo.estado = 'PAUSADO'
             THEN 1 ELSE 0 END
         ),
         0
       ) AS trabajosPausados,
       COALESCE(
         SUM(
           CASE WHEN trabajo.estado IN ('COMPLETADO', 'ENTREGADO')
             THEN 1 ELSE 0 END
         ),
         0
       ) AS trabajosCompletados,
       COALESCE(
         SUM(
           CASE WHEN trabajo.estado = 'CANCELADO'
             THEN 1 ELSE 0 END
         ),
         0
       ) AS trabajosCancelados
     FROM clientes cl
     LEFT JOIN (
       SELECT
         s.id,
         COALESCE(c.clienteId, m.clienteId) AS clienteId,
         s.estado
       FROM servicios s
       INNER JOIN motos m
         ON m.id = s.motoId
       LEFT JOIN citas c
         ON c.id = s.citaId
     ) trabajo
       ON trabajo.clienteId = cl.id
     GROUP BY cl.id, cl.nombre, cl.activo
     ORDER BY totalTrabajos DESC, cl.nombre ASC`
  );

  const clientes = filas.map(fila => ({
    clienteId: fila.clienteId,
    nombre: fila.nombre,
    activo: Number(fila.activo) === 1,
    totalTrabajos: Number(fila.totalTrabajos),
    trabajosEnProceso: Number(fila.trabajosEnProceso),
    trabajosPausados: Number(fila.trabajosPausados),
    trabajosCompletados: Number(fila.trabajosCompletados),
    trabajosCancelados: Number(fila.trabajosCancelados)
  }));

  return {
    resumen: {
      totalClientes: clientes.length,
      clientesConTrabajos:
        clientes.filter(cliente => cliente.totalTrabajos > 0).length,
      totalTrabajos: clientes.reduce(
        (total, cliente) => total + cliente.totalTrabajos,
        0
      )
    },
    clientes
  };
}
