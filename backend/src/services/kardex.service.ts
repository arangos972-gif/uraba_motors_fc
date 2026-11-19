
import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';

interface FiltrosKardex {
  repuestoId?: string;
  tipoMovimiento?: string;
  desde?: string;
  hasta?: string;
  busqueda?: string;
  pagina: number;
}

const TIPOS_MOVIMIENTO = [
  'ENTRADA_COMPRA',
  'SALIDA_VENTA_MOSTRADOR',
  'SALIDA_SERVICIO_MECANICO',
  'AJUSTE_INVENTARIO',
  'DEVOLUCION'
];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fechaValida(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }

  const fechaJS = new Date(
    `${fecha}T00:00:00.000Z`
  );

  return (
    !Number.isNaN(fechaJS.getTime()) &&
    fechaJS.toISOString().slice(0, 10) === fecha &&
    Number(fecha.slice(0, 4)) >= 1000
  );
}

// ========================================
// CONSULTAR MOVIMIENTOS KARDEX
// ========================================

export async function obtenerKardex(
  filtros: FiltrosKardex
) {
  const condiciones: string[] = [];
  const parametros: (string | number)[] = [];

  const limite = 50;

  if (
    !Number.isInteger(filtros.pagina) ||
    filtros.pagina < 1 ||
    filtros.pagina > 1000000
  ) {
    throw new Error('PAGINA_INVALIDA');
  }

  const offset = (filtros.pagina - 1) * limite;

  // FILTRAR POR REPUESTO

  if (filtros.repuestoId) {
    if (!UUID.test(filtros.repuestoId)) {
      throw new Error('REPUESTO_ID_INVALIDO');
    }

    condiciones.push('k.repuestoId = ?');
    parametros.push(filtros.repuestoId);
  }

  // FILTRAR POR TIPO DE MOVIMIENTO

  if (filtros.tipoMovimiento) {
    if (
      !TIPOS_MOVIMIENTO.includes(
        filtros.tipoMovimiento
      )
    ) {
      throw new Error('TIPO_MOVIMIENTO_INVALIDO');
    }

    condiciones.push('k.tipoMovimiento = ?');
    parametros.push(filtros.tipoMovimiento);
  }

  // FILTRAR POR FECHAS

  if (filtros.desde) {
    if (!fechaValida(filtros.desde)) {
      throw new Error('FECHA_INVALIDA');
    }

    condiciones.push('k.created >= ?');

    parametros.push(
      `${filtros.desde} 00:00:00`
    );
  }

  if (filtros.hasta) {
    if (!fechaValida(filtros.hasta)) {
      throw new Error('FECHA_INVALIDA');
    }

    condiciones.push(
      'k.created < DATE_ADD(?, INTERVAL 1 DAY)'
    );

    parametros.push(filtros.hasta);
  }

  if (
    filtros.desde &&
    filtros.hasta &&
    filtros.desde > filtros.hasta
  ) {
    throw new Error('RANGO_FECHAS_INVALIDO');
  }

  // BUSCAR PRODUCTO, FACTURA O PROVEEDOR

  if (filtros.busqueda?.trim()) {
    const texto =
      `%${filtros.busqueda.trim().slice(0, 150)}%`;

    condiciones.push(
      `(
        r.nombre LIKE ?
        OR ci.numeroFacturaProveedor LIKE ?
        OR ci.proveedor LIKE ?
      )`
    );

    parametros.push(texto, texto, texto);
  }

  const relaciones = `
    FROM inventario_pmp_kardex k

    INNER JOIN repuestos r
      ON r.id = k.repuestoId

    INNER JOIN users u
      ON u.id = k.usuarioId

    LEFT JOIN compras_inventario ci
      ON ci.id = k.referenciaOrigenId
      AND k.tipoMovimiento = 'ENTRADA_COMPRA'
  `;

  const where = condiciones.length > 0
    ? `WHERE ${condiciones.join(' AND ')}`
    : '';

  // ========================================
  // CONSULTAR RESUMEN DE MOVIMIENTOS
  // ========================================

  const [resumen] =
    await pool.execute<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS totalMovimientos,

         COALESCE(SUM(
           CASE
             WHEN k.stockNuevo > k.stockAnterior
             THEN k.stockNuevo - k.stockAnterior
             ELSE 0
           END
         ), 0) AS entradas,

         COALESCE(SUM(
           CASE
             WHEN k.stockNuevo < k.stockAnterior
             THEN k.stockAnterior - k.stockNuevo
             ELSE 0
           END
         ), 0) AS salidas

       ${relaciones}
       ${where}`,
      parametros
    );

  // ========================================
  // CONSULTAR HISTORIAL PAGINADO
  // ========================================

  const [movimientos] =
    await pool.execute<RowDataPacket[]>(
      `SELECT
         k.id,
         k.repuestoId,
         r.nombre AS repuestoNombre,

         k.tipoMovimiento,
         k.cantidad,
         k.costoUnitarioMovimiento,
         k.costoPMPResultante,

         k.stockAnterior,
         k.stockNuevo,

         k.referenciaOrigenId,
         k.usuarioId,
         u.name AS usuarioNombre,

         k.observaciones,

         ci.numeroFacturaProveedor,
         ci.proveedor,

         DATE_FORMAT(
           k.created,
           '%Y-%m-%d %H:%i:%s'
         ) AS fechaMovimiento

       ${relaciones}
       ${where}

       ORDER BY k.created DESC, k.id DESC
       LIMIT ? OFFSET ?`,
      [...parametros, limite, offset]
    );

  const totalMovimientos =
    Number(resumen[0].totalMovimientos);

  return {
    movimientos,

    resumen: {
      totalMovimientos,
      entradas: Number(resumen[0].entradas),
      salidas: Number(resumen[0].salidas)
    },

    paginacion: {
      pagina: filtros.pagina,
      limite,
      totalMovimientos,
      totalPaginas: Math.max(
        1,
        Math.ceil(totalMovimientos / limite)
      )
    }
  };
}
