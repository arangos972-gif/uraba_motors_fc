
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_DINERO = 9999999999.99;
const MAX_STOCK = 2147483647;

type TipoDevolucion = 'CLIENTE' | 'PROVEEDOR';

interface DatosDevolucion {
  tipoDevolucion: TipoDevolucion;
  origenId: string;
  cantidad: number;
  motivo: string;
}

interface OrigenDB extends RowDataPacket {
  repuestoId: string;
  cantidad: number;
  valorUnitario: string | number;
}

interface RepuestoDB extends RowDataPacket {
  id: string;
  nombre: string;
  stockActual: number;
  costoPromedioPMP: string | number;
  porcentajeGanancia: string | number;
}

// ========================================
// REGISTRAR DEVOLUCIÓN
// ========================================

export async function registrarDevolucion(
  datos: DatosDevolucion,
  usuarioId: string
) {
  if (
    datos.tipoDevolucion !== 'CLIENTE' &&
    datos.tipoDevolucion !== 'PROVEEDOR'
  ) {
    throw new Error('TIPO_INVALIDO');
  }

  if (!UUID.test(datos.origenId)) {
    throw new Error('ORIGEN_INVALIDO');
  }

  if (!UUID.test(usuarioId)) {
    throw new Error('USUARIO_INVALIDO');
  }

  if (
    !Number.isInteger(datos.cantidad) ||
    datos.cantidad <= 0 ||
    datos.cantidad > MAX_STOCK
  ) {
    throw new Error('CANTIDAD_INVALIDA');
  }

  const motivo = datos.motivo.trim();

  if (motivo.length < 5 || motivo.length > 200) {
    throw new Error('MOTIVO_INVALIDO');
  }

  const esCliente =
    datos.tipoDevolucion === 'CLIENTE';

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // ========================================
    // 1. BLOQUEAR LA OPERACIÓN ORIGINAL
    // ========================================

    const [origenes] =
      await conexion.execute<OrigenDB[]>(
        esCliente
          ? `SELECT
               repuestoId,
               cantidad,
               precioUnitario AS valorUnitario
             FROM ventas
             WHERE id = ?
             FOR UPDATE`

          : `SELECT
               repuestoId,
               cantidad,
               costoUnitarioCompra AS valorUnitario
             FROM compras_detalles
             WHERE id = ?
             FOR UPDATE`,

        [datos.origenId]
      );

    if (origenes.length === 0) {
      throw new Error('ORIGEN_NO_EXISTE');
    }

    const origen = origenes[0];

    // ========================================
    // 2. VERIFICAR DEVOLUCIONES ANTERIORES
    // ========================================

    const [devueltas] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(cantidad), 0) AS total
         FROM devoluciones_inventario
         WHERE ${
           esCliente ? 'ventaId' : 'compraDetalleId'
         } = ?`,

        [datos.origenId]
      );

    const cantidadDevuelta =
      Number(devueltas[0].total);

    const cantidadDisponible =
      Number(origen.cantidad) - cantidadDevuelta;

    if (datos.cantidad > cantidadDisponible) {
      throw new Error('DEVOLUCION_EXCEDIDA');
    }

    const valorUnitario =
      Number(origen.valorUnitario);

    // ========================================
    // 3. OBTENER COSTO ORIGINAL
    // ========================================

    let costoOriginal = valorUnitario;

    if (esCliente) {
      const [movimientos] =
        await conexion.execute<RowDataPacket[]>(
          `SELECT costoUnitarioMovimiento
           FROM inventario_pmp_kardex
           WHERE referenciaOrigenId = ?
             AND repuestoId = ?
             AND tipoMovimiento =
                 'SALIDA_VENTA_MOSTRADOR'
           LIMIT 2`,
          [
            datos.origenId,
            origen.repuestoId
          ]
        );

      if (movimientos.length !== 1) {
        throw new Error('COSTO_ORIGINAL_NO_EXISTE');
      }

      costoOriginal = Number(
        movimientos[0].costoUnitarioMovimiento
      );
    }

    if (
      !Number.isFinite(costoOriginal) ||
      costoOriginal <= 0 ||
      !Number.isFinite(valorUnitario) ||
      valorUnitario <= 0
    ) {
      throw new Error('COSTO_ORIGINAL_NO_EXISTE');
    }

    // ========================================
    // 4. BLOQUEAR REPUESTO
    // ========================================

    const [repuestos] =
      await conexion.execute<RepuestoDB[]>(
        `SELECT
           id,
           nombre,
           stockActual,
           costoPromedioPMP,
           porcentajeGanancia
         FROM repuestos
         WHERE id = ?
         FOR UPDATE`,
        [origen.repuestoId]
      );

    if (repuestos.length === 0) {
      throw new Error('REPUESTO_NO_EXISTE');
    }

    const repuesto = repuestos[0];

    const stockAnterior =
      Number(repuesto.stockActual);

    const pmpAnterior =
      Number(repuesto.costoPromedioPMP);

    const porcentajeGanancia =
      Number(repuesto.porcentajeGanancia);

    if (
      stockAnterior < 0 ||
      pmpAnterior < 0 ||
      porcentajeGanancia < 0 ||
      (stockAnterior > 0 && pmpAnterior === 0)
    ) {
      throw new Error('INVENTARIO_INCONSISTENTE');
    }

    const stockNuevo = esCliente
      ? stockAnterior + datos.cantidad
      : stockAnterior - datos.cantidad;

    if (stockNuevo < 0) {
      throw new Error('STOCK_INSUFICIENTE');
    }

    if (stockNuevo > MAX_STOCK) {
      throw new Error('STOCK_MAXIMO_SUPERADO');
    }

    // ========================================
    // 5. CALCULAR VALOR Y NUEVO PMP
    // ========================================

    const totalCentavos =
      Math.round(valorUnitario * 100) *
      datos.cantidad;

    if (
      !Number.isSafeInteger(totalCentavos) ||
      totalCentavos > MAX_DINERO * 100
    ) {
      throw new Error('TOTAL_INVALIDO');
    }

    const totalDevolucion =
      totalCentavos / 100;

    const cantidadValorada = esCliente
      ? datos.cantidad
      : -datos.cantidad;

    // Calcular el valor resultante usando DECIMAL.

    const [valores] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           CAST(? AS DECIMAL(12,2))
             * CAST(? AS DECIMAL(12,0))
           +
           CAST(? AS DECIMAL(12,2))
             * CAST(? AS DECIMAL(12,0))
           AS valorResultante`,
        [
          pmpAnterior.toFixed(2),
          stockAnterior,
          costoOriginal.toFixed(2),
          cantidadValorada
        ]
      );

    const valorResultante = Number(
      valores[0].valorResultante
    );

    if (valorResultante < 0) {
      throw new Error('VALOR_INVENTARIO_INVALIDO');
    }

    // Si no quedan unidades pero existe valor
    // residual, se requiere revisión contable.

    if (
      stockNuevo === 0 &&
      valorResultante !== 0
    ) {
      throw new Error('VALOR_RESIDUAL');
    }

    let nuevoPMP = pmpAnterior;

    if (stockNuevo > 0) {

      const [calculos] =
        await conexion.execute<RowDataPacket[]>(
          `SELECT ROUND(
             CAST(
               ? AS DECIMAL(35,12)
             ) /
             CAST(? AS DECIMAL(12,0)),
             2
           ) AS nuevoPMP`,
          [
            valores[0].valorResultante,
            stockNuevo
          ]
        );

      nuevoPMP = Number(calculos[0].nuevoPMP);

      if (
        !Number.isFinite(nuevoPMP) ||
        nuevoPMP <= 0 ||
        nuevoPMP > MAX_DINERO
      ) {
        throw new Error('VALOR_INVENTARIO_INVALIDO');
      }
    }

    const [precios] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT ROUND(
           CAST(? AS DECIMAL(12,2)) *
           (
             1 +
             CAST(? AS DECIMAL(5,2)) / 100
           ),
           2
         ) AS precioVenta`,
        [
          nuevoPMP.toFixed(2),
          porcentajeGanancia
        ]
      );

    const nuevoPrecioVenta =
      Number(precios[0].precioVenta);

    if (
      !Number.isFinite(nuevoPrecioVenta) ||
      nuevoPrecioVenta > MAX_DINERO
    ) {
      throw new Error('PRECIO_INVALIDO');
    }

    // ========================================
    // 6. REGISTRAR DEVOLUCIÓN
    // ========================================

    const devolucionId = randomUUID();

    await conexion.execute(
      `INSERT INTO devoluciones_inventario (
         id,
         tipoDevolucion,
         ventaId,
         compraDetalleId,
         repuestoId,
         cantidad,
         valorUnitarioDevolucion,
         totalDevolucion,
         costoUnitarioInventario,
         motivo,
         usuarioId
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        devolucionId,
        datos.tipoDevolucion,
        esCliente ? datos.origenId : null,
        esCliente ? null : datos.origenId,
        repuesto.id,
        datos.cantidad,
        valorUnitario.toFixed(2),
        totalDevolucion.toFixed(2),
        costoOriginal.toFixed(2),
        motivo,
        usuarioId
      ]
    );

    // ========================================
    // 7. ACTUALIZAR INVENTARIO
    // ========================================

    await conexion.execute(
      `UPDATE repuestos
       SET
         stockActual = ?,
         costoPromedioPMP = ?,
         precioVenta = ?
       WHERE id = ?`,
      [
        stockNuevo,
        nuevoPMP.toFixed(2),
        nuevoPrecioVenta.toFixed(2),
        repuesto.id
      ]
    );

    // ========================================
    // 8. REGISTRAR EN KARDEX
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
         ?, ?, 'DEVOLUCION',
         ?, ?, ?, ?, ?, ?, ?, ?
       )`,
      [
        randomUUID(),
        repuesto.id,
        datos.cantidad,
        costoOriginal.toFixed(2),
        nuevoPMP.toFixed(2),
        stockAnterior,
        stockNuevo,
        devolucionId,
        usuarioId,
        `${
          esCliente
            ? 'Devolución de cliente'
            : 'Devolución a proveedor'
        }: ${motivo}`
      ]
    );

    await conexion.commit();

    return {
      id: devolucionId,
      tipoDevolucion: datos.tipoDevolucion,
      origenId: datos.origenId,
      repuestoId: repuesto.id,
      repuestoNombre: repuesto.nombre,
      cantidad: datos.cantidad,
      valorUnitarioDevolucion: valorUnitario,
      totalDevolucion,
      costoUnitarioInventario: costoOriginal,
      stockAnterior,
      stockNuevo,
      pmpAnterior,
      nuevoPMP,
      nuevoPrecioVenta,
      cantidadPendiente:
        cantidadDisponible - datos.cantidad
    };

  } catch (error) {

    await conexion.rollback();
    throw error;

  } finally {

    conexion.release();

  }
}

// ========================================
// HISTORIAL DE DEVOLUCIONES
// ========================================

export async function obtenerDevoluciones() {
  const [devoluciones] =
    await pool.query<RowDataPacket[]>(
      `SELECT
         d.id,
         d.tipoDevolucion,
         d.ventaId,
         d.compraDetalleId,
         d.repuestoId,
         r.nombre AS repuestoNombre,
         d.cantidad,
         d.valorUnitarioDevolucion,
         d.totalDevolucion,
         d.costoUnitarioInventario,
         d.motivo,
         u.name AS usuarioNombre,
         ci.numeroFacturaProveedor,
         ci.proveedor,
         DATE_FORMAT(
           d.created,
           '%Y-%m-%d %H:%i:%s'
         ) AS fechaDevolucion

       FROM devoluciones_inventario d

       INNER JOIN repuestos r
         ON r.id = d.repuestoId

       INNER JOIN users u
         ON u.id = d.usuarioId

       LEFT JOIN compras_detalles cd
         ON cd.id = d.compraDetalleId

       LEFT JOIN compras_inventario ci
         ON ci.id = cd.compraId

       ORDER BY d.created DESC, d.id DESC
       LIMIT 500`
    );

  return devoluciones;
}

// ========================================
// CONSULTAR VENTAS DEVOLVIBLES
// ========================================

export async function obtenerVentasDevolvibles() {
  const [ventas] =
    await pool.query<RowDataPacket[]>(
      `SELECT
         v.id,
         v.repuestoId,
         r.nombre AS repuestoNombre,
         v.cantidad,
         v.precioUnitario AS valorUnitario,

         v.cantidad - COALESCE(
           (
             SELECT SUM(d.cantidad)
             FROM devoluciones_inventario d
             WHERE d.ventaId = v.id
           ), 0
         ) AS cantidadDisponible,

         DATE_FORMAT(
           v.created,
           '%Y-%m-%d %H:%i:%s'
         ) AS fecha

       FROM ventas v

       INNER JOIN repuestos r
         ON r.id = v.repuestoId

       HAVING cantidadDisponible > 0

       ORDER BY v.created DESC
       LIMIT 500`
    );

  return ventas;
}

// ========================================
// CONSULTAR COMPRAS DEVOLVIBLES
// ========================================

export async function obtenerComprasDevolvibles() {
  const [compras] =
    await pool.query<RowDataPacket[]>(
      `SELECT
         cd.id,
         cd.compraId,
         cd.repuestoId,
         r.nombre AS repuestoNombre,

         ci.numeroFacturaProveedor,
         ci.proveedor,

         cd.cantidad,

         cd.costoUnitarioCompra AS valorUnitario,

         cd.cantidad - COALESCE(
           (
             SELECT SUM(d.cantidad)
             FROM devoluciones_inventario d
             WHERE d.compraDetalleId = cd.id
           ), 0
         ) AS cantidadDisponible,

         r.stockActual,

         DATE_FORMAT(
           ci.fechaCompra,
           '%Y-%m-%d'
         ) AS fecha

       FROM compras_detalles cd

       INNER JOIN compras_inventario ci
         ON ci.id = cd.compraId

       INNER JOIN repuestos r
         ON r.id = cd.repuestoId

       HAVING cantidadDisponible > 0

       ORDER BY ci.created DESC
       LIMIT 500`
    );

  return compras;
}
