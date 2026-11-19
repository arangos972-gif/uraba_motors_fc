
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

interface ConfiguracionDB extends RowDataPacket {
  id: string;
  porcentaje: string | number;
}

interface TrabajoDB extends RowDataPacket {
  id: string;
  precioAplicado: string | number;
}

interface TotalDB extends RowDataPacket {
  totalComisiones: string | number;
}

/**
 * Se ejecuta dentro de la transacción de finalizarOrdenTrabajo.
 * NO realiza commit ni rollback.
 */
export async function generarComisionesOrden(
  conexion: PoolConnection,
  ordenId: string,
  mecanicoId: string,
  trabajosEsperados: number
) {
  // 1. Buscar el porcentaje vigente en el momento
  // exacto en que se completó la orden.
  const [configuraciones] =
    await conexion.execute<ConfiguracionDB[]>(
      `SELECT mc.id, mc.porcentaje
       FROM mecanicos_comisiones mc
       INNER JOIN servicios s
         ON s.mecanicoId = mc.mecanicoId
       WHERE s.id = ?
         AND s.estado = 'COMPLETADO'
         AND s.tiempoFin IS NOT NULL
         AND mc.vigenteDesde <= s.tiempoFin
         AND (
           mc.vigenteHasta IS NULL
           OR mc.vigenteHasta > s.tiempoFin
         )
       FOR UPDATE`,
      [ordenId]
    );

  if (configuraciones.length === 0) {
    throw new Error(
      'COMISION_PORCENTAJE_NO_CONFIGURADO'
    );
  }

  if (configuraciones.length !== 1) {
    throw new Error(
      'COMISION_PORCENTAJES_SUPERPUESTOS'
    );
  }

  const configuracion = configuraciones[0];
  const porcentaje =
    Number(configuracion.porcentaje);

  if (
    !Number.isFinite(porcentaje) ||
    porcentaje < 0 ||
    porcentaje > 100 ||
    Math.round(porcentaje * 100) !==
      porcentaje * 100
  ) {
    throw new Error(
      'COMISION_PORCENTAJE_INVALIDO'
    );
  }

  // 2. Buscar únicamente los trabajos completados.
  // Los repuestos y los trabajos cancelados no participan.
  const [trabajos] =
    await conexion.execute<TrabajoDB[]>(
      `SELECT id, precioAplicado
       FROM servicios_detalles
       WHERE servicioId = ?
         AND estado = 'COMPLETADO'
       ORDER BY id
       FOR UPDATE`,
      [ordenId]
    );

  if (
    trabajos.length === 0 ||
    trabajos.length !== trabajosEsperados
  ) {
    throw new Error(
      'COMISION_TRABAJOS_INCONSISTENTES'
    );
  }

  // 3. Guardar una comisión histórica por cada trabajo.
  for (const trabajo of trabajos) {
    const precio =
      Number(trabajo.precioAplicado);

    if (
      !Number.isFinite(precio) ||
      precio < 0 ||
      precio > 9999999999.99
    ) {
      throw new Error(
        'COMISION_MANO_OBRA_INVALIDA'
      );
    }

    await conexion.execute(
      `INSERT INTO comisiones_generadas (
         id,
         servicioId,
         servicioDetalleId,
         mecanicoId,
         configuracionComisionId,
         valorManoObra,
         porcentajeAplicado,
         valorComision,
         fechaReconocimiento
       )
       SELECT
         ?, s.id, ?, ?, ?, ?, ?,
         ROUND(
           CAST(? AS DECIMAL(12,2)) *
           CAST(? AS DECIMAL(5,2)) / 100,
           2
         ),
         s.tiempoFin
       FROM servicios s
       WHERE s.id = ?
         AND s.mecanicoId = ?
         AND s.estado = 'COMPLETADO'
         AND s.tiempoFin IS NOT NULL`,
      [
        randomUUID(),
        trabajo.id,
        mecanicoId,
        configuracion.id,
        precio.toFixed(2),
        porcentaje.toFixed(2),
        precio.toFixed(2),
        porcentaje.toFixed(2),
        ordenId,
        mecanicoId
      ]
    );
  }

  // 4. Calcular el total registrado para esa orden.
  const [sumas] =
    await conexion.execute<TotalDB[]>(
      `SELECT
         COALESCE(SUM(valorComision), 0)
           AS totalComisiones
       FROM comisiones_generadas
       WHERE servicioId = ?`,
      [ordenId]
    );

  return {
    cantidadTrabajos: trabajos.length,
    porcentajeAplicado: porcentaje,
    totalComisiones:
      Number(sumas[0].totalComisiones)
  };
}
