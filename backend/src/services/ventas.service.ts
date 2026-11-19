
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_DINERO = 9999999999.99;

interface DatosVenta {
  repuestoId: string;
  clienteId: string | null;
  cantidad: number;
}

interface RepuestoDB extends RowDataPacket {
  id: string;
  nombre: string;
  precioVenta: string | number;
  costoPromedioPMP: string | number;
  stockActual: number;
}

// ========================================
// REGISTRAR VENTA DE MOSTRADOR
// ========================================

export async function registrarVenta(
  datos: DatosVenta,
  usuarioId: string
) {
  if (!UUID.test(datos.repuestoId)) {
    throw new Error('REPUESTO_ID_INVALIDO');
  }

  if (!UUID.test(usuarioId)) {
    throw new Error('USUARIO_INVALIDO');
  }

  if (
    datos.clienteId !== null &&
    !UUID.test(datos.clienteId)
  ) {
    throw new Error('CLIENTE_ID_INVALIDO');
  }

  if (
    !Number.isInteger(datos.cantidad) ||
    datos.cantidad <= 0 ||
    datos.cantidad > 2147483647
  ) {
    throw new Error('CANTIDAD_INVALIDA');
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // ========================================
    // 1. CONSULTAR Y BLOQUEAR REPUESTO
    // ========================================

    const [repuestos] =
      await conexion.execute<RepuestoDB[]>(
        `SELECT
           id,
           nombre,
           precioVenta,
           costoPromedioPMP,
           stockActual
         FROM repuestos
         WHERE id = ?
         FOR UPDATE`,
        [datos.repuestoId]
      );

    if (repuestos.length === 0) {
      throw new Error('REPUESTO_NO_EXISTE');
    }

    const repuesto = repuestos[0];

    const stockAnterior =
      Number(repuesto.stockActual);

    const precioUnitario =
      Number(repuesto.precioVenta);

    const costoPMP =
      Number(repuesto.costoPromedioPMP);

    // ========================================
    // 2. VALIDAR EXISTENCIAS Y PRECIO
    // ========================================

    if (stockAnterior < datos.cantidad) {
      throw new Error('STOCK_INSUFICIENTE');
    }

    if (
      !Number.isFinite(precioUnitario) ||
      precioUnitario <= 0
    ) {
      throw new Error('PRECIO_NO_DISPONIBLE');
    }

    if (
      !Number.isFinite(costoPMP) ||
      costoPMP <= 0
    ) {
      throw new Error('PMP_NO_DISPONIBLE');
    }

    // ========================================
    // 3. VERIFICAR CLIENTE OPCIONAL
    // ========================================

    if (datos.clienteId !== null) {
      const [clientes] =
        await conexion.execute<RowDataPacket[]>(
          `SELECT id
           FROM clientes
           WHERE id = ?
           LIMIT 1`,
          [datos.clienteId]
        );

      if (clientes.length === 0) {
        throw new Error('CLIENTE_NO_EXISTE');
      }
    }

    // ========================================
    // 4. CALCULAR TOTAL DE LA VENTA
    // ========================================

    // Operar en centavos para evitar errores
    // de redondeo en las multiplicaciones.

    const totalCentavos =
      Math.round(precioUnitario * 100) *
      datos.cantidad;

    if (
      !Number.isSafeInteger(totalCentavos) ||
      totalCentavos > MAX_DINERO * 100
    ) {
      throw new Error('TOTAL_INVALIDO');
    }

    const total = totalCentavos / 100;

    const stockNuevo =
      stockAnterior - datos.cantidad;

    const ventaId = randomUUID();

    // ========================================
    // 5. REGISTRAR VENTA
    // ========================================

    await conexion.execute(
      `INSERT INTO ventas (
         id,
         repuestoId,
         clienteId,
         cantidad,
         precioUnitario,
         total,
         recepcionistaId
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        ventaId,
        repuesto.id,
        datos.clienteId,
        datos.cantidad,
        precioUnitario.toFixed(2),
        total.toFixed(2),
        usuarioId
      ]
    );

    // ========================================
    // 6. DESCONTAR EXISTENCIAS
    // ========================================

    await conexion.execute(
      `UPDATE repuestos
       SET stockActual = ?
       WHERE id = ?`,
      [
        stockNuevo,
        repuesto.id
      ]
    );

    // El precio y el PMP no se modifican
    // durante una venta normal.

    // ========================================
    // 7. REGISTRAR SALIDA EN KARDEX
    // ========================================

    await conexion.execute(
      `INSERT INTO inventario_pmp_kardex (
         id,
         repuestoId,
         tipoMovimiento,
         cantidad,
         costoUnitarioMovimiento,
         costoPMPResultante,
         stockAnterior,
         stockNuevo,
         referenciaOrigenId,
         usuarioId,
         observaciones
       )
       VALUES (
         ?, ?, 'SALIDA_VENTA_MOSTRADOR',
         ?, ?, ?, ?, ?, ?, ?, ?
       )`,
      [
        randomUUID(),
        repuesto.id,
        datos.cantidad,
        costoPMP.toFixed(2),
        costoPMP.toFixed(2),
        stockAnterior,
        stockNuevo,
        ventaId,
        usuarioId,
        'Salida por venta de mostrador'
      ]
    );

    await conexion.commit();

    return {
      id: ventaId,
      repuestoId: repuesto.id,
      repuestoNombre: repuesto.nombre,
      clienteId: datos.clienteId,
      cantidad: datos.cantidad,
      precioUnitario,
      total,
      stockAnterior,
      stockNuevo
    };

  } catch (error) {
    await conexion.rollback();
    throw error;

  } finally {
    conexion.release();
  }
}

// ========================================
// CONSULTAR HISTORIAL DE VENTAS
// ========================================

export async function obtenerVentas() {
  const [ventas] =
    await pool.query<RowDataPacket[]>(
      `SELECT
         v.id,
         v.repuestoId,
         r.nombre AS repuestoNombre,

         v.clienteId,
         c.nombre AS clienteNombre,

         v.cantidad,
         v.precioUnitario,
         v.total,

         v.recepcionistaId,
         u.name AS registradoPorNombre,

         DATE_FORMAT(
           v.created,
           '%Y-%m-%d %H:%i:%s'
         ) AS fechaVenta

       FROM ventas v

       INNER JOIN repuestos r
         ON r.id = v.repuestoId

       LEFT JOIN clientes c
         ON c.id = v.clienteId

       INNER JOIN users u
         ON u.id = v.recepcionistaId

       ORDER BY v.created DESC, v.id DESC
       LIMIT 500`
    );

  return ventas;
}
