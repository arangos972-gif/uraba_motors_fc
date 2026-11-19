
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_DINERO = 9999999999.99;
const MAX_STOCK = 2147483647;

// ========================================
// INTERFACES
// ========================================

interface DetalleCompra {
  repuestoId: string;
  cantidad: number;
  costoUnitarioCompra: number;
}

interface DatosCompra {
  numeroFacturaProveedor: string;
  proveedor: string;
  fechaCompra: string;
  detalles: DetalleCompra[];
}

interface RepuestoDB extends RowDataPacket {
  id: string;
  nombre: string;
  stockActual: number;
  costoPromedioPMP: string | number;
  porcentajeGanancia: string | number;
}

interface CalculoDB extends RowDataPacket {
  nuevoPMP: string | number;
  nuevoPrecioVenta: string | number;
}

// ========================================
// VALIDAR FECHA
// ========================================

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
// VALIDAR COSTOS MONETARIOS
// ========================================

function costoValido(costo: number) {
  return (
    Number.isFinite(costo) &&
    costo > 0 &&
    costo <= MAX_DINERO &&
    Math.abs(
      costo * 100 -
      Math.round(costo * 100)
    ) < 0.001
  );
}

// ========================================
// VALIDAR DATOS DE LA COMPRA
// ========================================

function validarCompra(datos: DatosCompra) {
  if (
    !datos.numeroFacturaProveedor.trim() ||
    datos.numeroFacturaProveedor.trim().length > 100
  ) {
    throw new Error('FACTURA_INVALIDA');
  }

  if (
    !datos.proveedor.trim() ||
    datos.proveedor.trim().length > 150
  ) {
    throw new Error('PROVEEDOR_INVALIDO');
  }

  if (!fechaValida(datos.fechaCompra)) {
    throw new Error('FECHA_INVALIDA');
  }

  if (
    !Array.isArray(datos.detalles) ||
    datos.detalles.length === 0 ||
    datos.detalles.length > 200
  ) {
    throw new Error('DETALLES_INVALIDOS');
  }

  const repuestosRegistrados = new Set<string>();

  let totalCentavos = 0;

  for (const detalle of datos.detalles) {

    if (!UUID.test(detalle.repuestoId)) {
      throw new Error('REPUESTO_ID_INVALIDO');
    }

    if (
      repuestosRegistrados.has(
        detalle.repuestoId.toLowerCase()
      )
    ) {
      throw new Error('REPUESTO_DUPLICADO');
    }

    repuestosRegistrados.add(
      detalle.repuestoId.toLowerCase()
    );

    if (
      !Number.isInteger(detalle.cantidad) ||
      detalle.cantidad <= 0 ||
      detalle.cantidad > MAX_STOCK
    ) {
      throw new Error('CANTIDAD_INVALIDA');
    }

    if (!costoValido(detalle.costoUnitarioCompra)) {
      throw new Error('COSTO_INVALIDO');
    }

    // Trabajar en centavos para calcular
    // los subtotales y el total de la factura.
    const subtotalCentavos =
      Math.round(detalle.costoUnitarioCompra * 100) *
      detalle.cantidad;

    if (
      !Number.isSafeInteger(subtotalCentavos) ||
      subtotalCentavos > MAX_DINERO * 100
    ) {
      throw new Error('TOTAL_INVALIDO');
    }

    totalCentavos += subtotalCentavos;

    if (totalCentavos > MAX_DINERO * 100) {
      throw new Error('TOTAL_INVALIDO');
    }
  }

  return totalCentavos / 100;
}

// ========================================
// REGISTRAR COMPRA DE INVENTARIO
// ========================================

export async function registrarCompraInventario(
  datos: DatosCompra,
  usuarioId: string
) {
  const totalCompra = validarCompra(datos);

  if (!UUID.test(usuarioId)) {
    throw new Error('USUARIO_INVALIDO');
  }

  const compraId = randomUUID();

  const factura =
    datos.numeroFacturaProveedor.trim();

  const proveedor = datos.proveedor.trim();

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // ========================================
    // 1. VERIFICAR FACTURA EXISTENTE
    // ========================================

    const [facturas] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT id
         FROM compras_inventario
         WHERE numeroFacturaProveedor = ?
           AND proveedor = ?
         LIMIT 1`,
        [factura, proveedor]
      );

    if (facturas.length > 0) {
      throw new Error('FACTURA_DUPLICADA');
    }

    // ========================================
    // 2. REGISTRAR ENCABEZADO DE LA COMPRA
    // ========================================

    await conexion.execute(
      `INSERT INTO compras_inventario (
         id,
         numeroFacturaProveedor,
         proveedor,
         fechaCompra,
         totalCompra,
         registradoPorId
       )
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        compraId,
        factura,
        proveedor,
        `${datos.fechaCompra} 00:00:00`,
        totalCompra.toFixed(2),
        usuarioId
      ]
    );

    const resultados = [];

    // Ordenar los repuestos por ID ayuda a
    // reducir conflictos entre compras simultáneas.
    const detallesOrdenados =
      [...datos.detalles].sort(
        (a, b) =>
          a.repuestoId.localeCompare(b.repuestoId)
      );

    // ========================================
    // 3. PROCESAR PRODUCTOS DE LA FACTURA
    // ========================================

    for (const detalle of detallesOrdenados) {

      // Bloquear el repuesto mientras se actualizan
      // sus existencias, PMP y precio de venta.
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
          [detalle.repuestoId]
        );

      if (repuestos.length === 0) {
        throw new Error('REPUESTO_NO_EXISTE');
      }

      const repuesto = repuestos[0];

      const stockAnterior =
        Number(repuesto.stockActual);

      const pmpAnterior =
        Number(repuesto.costoPromedioPMP);

      const ganancia =
        Number(repuesto.porcentajeGanancia);

      if (
        stockAnterior < 0 ||
        pmpAnterior < 0 ||
        ganancia < 0 ||
        (stockAnterior > 0 && pmpAnterior === 0)
      ) {
        throw new Error('INVENTARIO_INCONSISTENTE');
      }

      const stockNuevo =
        stockAnterior + detalle.cantidad;

      if (stockNuevo > MAX_STOCK) {
        throw new Error('STOCK_MAXIMO_SUPERADO');
      }

      // ========================================
      // 4. CALCULAR PMP Y PRECIO DE VENTA
      // ========================================

      // MySQL realiza los cálculos monetarios
      // utilizando DECIMAL y redondeo a 2 decimales.
      const [calculos] =
        await conexion.execute<CalculoDB[]>(
          `SELECT
             calculo.nuevoPMP,
             ROUND(
               calculo.nuevoPMP *
               (
                 1 +
                 CAST(? AS DECIMAL(5,2)) / 100
               ),
               2
             ) AS nuevoPrecioVenta
           FROM (
             SELECT ROUND(
               CAST(
                 (
                   CAST(? AS DECIMAL(12,2)) * ?
                   +
                   CAST(? AS DECIMAL(12,2)) * ?
                 ) AS DECIMAL(35,12)
               ) / ?,
               2
             ) AS nuevoPMP
           ) AS calculo`,
          [
            ganancia,
            pmpAnterior.toFixed(2),
            stockAnterior,
            detalle.costoUnitarioCompra.toFixed(2),
            detalle.cantidad,
            stockNuevo
          ]
        );

      const nuevoPMP =
        Number(calculos[0].nuevoPMP);

      const nuevoPrecioVenta =
        Number(calculos[0].nuevoPrecioVenta);

      if (
        !Number.isFinite(nuevoPMP) ||
        nuevoPMP <= 0 ||
        nuevoPMP > MAX_DINERO ||
        !Number.isFinite(nuevoPrecioVenta) ||
        nuevoPrecioVenta > MAX_DINERO
      ) {
        throw new Error('PRECIO_CALCULADO_INVALIDO');
      }

      const subtotal =
        (
          Math.round(
            detalle.costoUnitarioCompra * 100
          ) * detalle.cantidad
        ) / 100;

      // ========================================
      // 5. GUARDAR DETALLE DE LA COMPRA
      // ========================================

      const detalleId = randomUUID();

      await conexion.execute(
        `INSERT INTO compras_detalles (
           id,
           compraId,
           repuestoId,
           cantidad,
           costoUnitarioCompra,
           subtotal
         )
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          detalleId,
          compraId,
          repuesto.id,
          detalle.cantidad,
          detalle.costoUnitarioCompra.toFixed(2),
          subtotal.toFixed(2)
        ]
      );

      // ========================================
      // 6. ACTUALIZAR REPUESTO
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
      // 7. REGISTRAR ENTRADA EN KARDEX
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
           ?, ?, 'ENTRADA_COMPRA',
           ?, ?, ?, ?, ?, ?, ?, ?
         )`,
        [
          randomUUID(),
          repuesto.id,
          detalle.cantidad,
          detalle.costoUnitarioCompra.toFixed(2),
          nuevoPMP.toFixed(2),
          stockAnterior,
          stockNuevo,
          compraId,
          usuarioId,
          `Entrada por factura ${factura}`
        ]
      );

      resultados.push({
        repuestoId: repuesto.id,
        nombre: repuesto.nombre,
        cantidadComprada: detalle.cantidad,
        stockAnterior,
        stockNuevo,
        pmpAnterior,
        nuevoPMP,
        porcentajeGanancia: ganancia,
        nuevoPrecioVenta,
        subtotal
      });
    }

    // Si todos los productos se registraron
    // correctamente, confirmar la transacción.
    await conexion.commit();

    return {
      id: compraId,
      numeroFacturaProveedor: factura,
      proveedor,
      fechaCompra: datos.fechaCompra,
      totalCompra,
      detalles: resultados
    };

  } catch (error) {

    // Si algo falla, revertir toda la compra.
    await conexion.rollback();
    throw error;

  } finally {

    conexion.release();

  }
}

// ========================================
// CONSULTAR HISTORIAL DE COMPRAS
// ========================================

export async function obtenerCompras() {
  const [compras] =
    await pool.query<RowDataPacket[]>(
      `SELECT
         ci.id,
         ci.numeroFacturaProveedor,
         ci.proveedor,
         DATE_FORMAT(
           ci.fechaCompra,
           '%Y-%m-%d'
         ) AS fechaCompra,
         ci.totalCompra,
         ci.registradoPorId,
         u.name AS registradoPorNombre,
         ci.created,
         (
           SELECT COUNT(*)
           FROM compras_detalles cd
           WHERE cd.compraId = ci.id
         ) AS cantidadProductos
       FROM compras_inventario ci
       INNER JOIN users u
         ON u.id = ci.registradoPorId
       ORDER BY ci.created DESC
       LIMIT 500`
    );

  return compras;
}

// ========================================
// CONSULTAR DETALLE DE UNA COMPRA
// ========================================

export async function obtenerCompraPorId(
  id: string
) {
  if (!UUID.test(id)) {
    throw new Error('COMPRA_ID_INVALIDO');
  }

  const [compras] =
    await pool.execute<RowDataPacket[]>(
      `SELECT
         ci.id,
         ci.numeroFacturaProveedor,
         ci.proveedor,
         DATE_FORMAT(
           ci.fechaCompra,
           '%Y-%m-%d'
         ) AS fechaCompra,
         ci.totalCompra,
         ci.registradoPorId,
         u.name AS registradoPorNombre,
         ci.created
       FROM compras_inventario ci
       INNER JOIN users u
         ON u.id = ci.registradoPorId
       WHERE ci.id = ?
       LIMIT 1`,
      [id]
    );

  if (compras.length === 0) {
    throw new Error('COMPRA_NO_EXISTE');
  }

  const [detalles] =
    await pool.execute<RowDataPacket[]>(
      `SELECT
         cd.id,
         cd.repuestoId,
         r.nombre AS repuestoNombre,
         cd.cantidad,
         cd.costoUnitarioCompra,
         cd.subtotal
       FROM compras_detalles cd
       INNER JOIN repuestos r
         ON r.id = cd.repuestoId
       WHERE cd.compraId = ?
       ORDER BY r.nombre ASC`,
      [id]
    );

  return {
    ...compras[0],
    detalles
  };
}
