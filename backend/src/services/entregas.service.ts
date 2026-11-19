
import type {
  RowDataPacket,
  ResultSetHeader
} from 'mysql2';

import { pool } from '../config/database.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_CENTAVOS = 999999999999;

interface OrdenDB extends RowDataPacket {
  id: string;
  estado: string;
  fechaEntrega: Date | string | null;
  entregadoPorId: string | null;
}

interface FacturaDB extends RowDataPacket {
  id: string;
  numero: string;
  estado: string;
  total: string | number;
}

interface PagoDB extends RowDataPacket {
  monto: string | number;
}

function aCentavos(valor: string | number): number {
  const numero = Number(valor);
  const resultado = Math.round(numero * 100);

  if (
    !Number.isFinite(numero) ||
    numero < 0 ||
    !Number.isSafeInteger(resultado) ||
    resultado > MAX_CENTAVOS ||
    Math.abs(numero * 100 - resultado) > 0.0001
  ) {
    throw new Error('ENTREGA_VALORES_INVALIDOS');
  }

  return resultado;
}

// ========================================
// ENTREGAR MOTOCICLETA
// ========================================

export async function entregarMotocicleta(
  ordenId: string,
  usuarioId: string,
  roleId: string
) {
  if (!UUID.test(ordenId)) {
    throw new Error('ORDEN_ID_INVALIDO');
  }

  if (!UUID.test(usuarioId)) {
    throw new Error('USUARIO_INVALIDO');
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // ========================================
    // 1. VALIDAR PERMISOS
    // ========================================

    const [permisos] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT 1 AS permitido
         FROM roles_permisos rp
         INNER JOIN roles r
           ON r.id = rp.roleId
         INNER JOIN permisos p
           ON p.id = rp.permisoId
         WHERE rp.roleId = ?
           AND r.activo = 1
           AND p.nombre = 'roles.administrar'
         LIMIT 1`,
        [roleId]
      );

    if (permisos.length === 0) {
      throw new Error('ENTREGA_SIN_PERMISO');
    }

    // ========================================
    // 2. BLOQUEAR LA ORDEN
    // ========================================

    const [ordenes] =
      await conexion.execute<OrdenDB[]>(
        `SELECT
           id,
           estado,
           fechaEntrega,
           entregadoPorId
         FROM servicios
         WHERE id = ?
         FOR UPDATE`,
        [ordenId]
      );

    if (ordenes.length === 0) {
      throw new Error('ORDEN_NO_EXISTE');
    }

    const orden = ordenes[0];

    if (
      orden.estado === 'ENTREGADO' ||
      orden.fechaEntrega !== null ||
      orden.entregadoPorId !== null
    ) {
      throw new Error('ORDEN_YA_ENTREGADA');
    }

    if (orden.estado !== 'COMPLETADO') {
      throw new Error('ORDEN_NO_COMPLETADA');
    }

    // ========================================
    // 3. BLOQUEAR FACTURA ASOCIADA
    // ========================================

    const [facturas] =
      await conexion.execute<FacturaDB[]>(
        `SELECT
           id,
           numero,
           estado,
           total
         FROM facturas
         WHERE servicioId = ?
         FOR UPDATE`,
        [ordenId]
      );

    if (facturas.length === 0) {
      throw new Error('ORDEN_SIN_FACTURA');
    }

    if (facturas.length !== 1) {
      throw new Error('FACTURA_ENTREGA_INCONSISTENTE');
    }

    const factura = facturas[0];

    if (factura.estado !== 'PAGADO') {
      throw new Error('FACTURA_NO_PAGADA');
    }

    // ========================================
    // 4. COMPROBAR LOS PAGOS APROBADOS
    // ========================================

    const [pagos] =
      await conexion.execute<PagoDB[]>(
        `SELECT monto
         FROM pagos
         WHERE facturaId = ?
           AND estado = 'APROBADO'`,
        [factura.id]
      );

    let totalPagadoCentavos = 0;

    for (const pago of pagos) {
      totalPagadoCentavos += aCentavos(pago.monto);

      if (
        !Number.isSafeInteger(totalPagadoCentavos) ||
        totalPagadoCentavos > MAX_CENTAVOS
      ) {
        throw new Error('ENTREGA_VALORES_INVALIDOS');
      }
    }

    const totalFacturaCentavos =
      aCentavos(factura.total);

    if (totalPagadoCentavos !== totalFacturaCentavos) {
      throw new Error('FACTURA_SALDO_INCONSISTENTE');
    }

    // ========================================
    // 5. REGISTRAR ENTREGA
    // ========================================

    const [actualizacion] =
      await conexion.execute<ResultSetHeader>(
        `UPDATE servicios
         SET
           estado = 'ENTREGADO',
           fechaEntrega = NOW(),
           entregadoPorId = ?
         WHERE id = ?
           AND estado = 'COMPLETADO'
           AND fechaEntrega IS NULL
           AND entregadoPorId IS NULL`,
        [usuarioId, ordenId]
      );

    if (actualizacion.affectedRows !== 1) {
      throw new Error('ENTREGA_NO_CONFIRMADA');
    }

    // ========================================
    // 6. CONSULTAR RESULTADO
    // ========================================

    const [resultado] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           id,
           estado,
           fechaEntrega,
           entregadoPorId
         FROM servicios
         WHERE id = ?`,
        [ordenId]
      );

    await conexion.commit();

    return {
      ...resultado[0],
      facturaId: factura.id,
      facturaNumero: factura.numero,
      totalFactura: totalFacturaCentavos / 100,
      totalPagado: totalPagadoCentavos / 100,
      saldoPendiente: 0
    };

  } catch (error) {
    await conexion.rollback();
    throw error;

  } finally {
    conexion.release();
  }
}
