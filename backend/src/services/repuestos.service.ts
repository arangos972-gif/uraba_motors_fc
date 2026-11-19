
import { randomUUID } from 'node:crypto';

import type {
  RowDataPacket,
  ResultSetHeader
} from 'mysql2';

import { pool } from '../config/database.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DatosRepuesto {
  nombre: string;
  categoriaId: string | null;
  descripcion: string | null;
  porcentajeGanancia: number;
  cantidadMinima: number;
}

// ========================================
// CONSULTAR REPUESTOS
// ========================================

export async function obtenerRepuestos(
  incluirCosto = false
) {
  const [filas] = await pool.query<RowDataPacket[]>(
    `SELECT
       r.id,
       r.categoriaId,
       r.nombre,
       r.descripcion,
       r.precioVenta,
       ${incluirCosto
         ? 'r.costoPromedioPMP, r.porcentajeGanancia,'
         : ''}
       r.stockActual,
       r.cantidadMinima,
       r.created,
       r.updated,
       c.nombre AS categoriaNombre
     FROM repuestos r
     LEFT JOIN categorias_repuestos c
       ON c.id = r.categoriaId
     ORDER BY r.nombre ASC`
  );

  return filas;
}

// ========================================
// CONSULTAR CATEGORÍAS
// ========================================

export async function obtenerCategorias() {
  const [filas] = await pool.query<RowDataPacket[]>(
    `SELECT
       id,
       nombre,
       descripcion,
       created
     FROM categorias_repuestos
     ORDER BY nombre ASC`
  );

  return filas;
}

// ========================================
// CREAR CATEGORÍA
// ========================================

export async function crearCategoria(
  nombre: string,
  descripcion: string | null
) {
  const nombreLimpio = nombre.trim();

  if (
    !nombreLimpio ||
    nombreLimpio.length > 100
  ) {
    throw new Error('NOMBRE_CATEGORIA_INVALIDO');
  }

  if (
    descripcion !== null &&
    descripcion.length > 255
  ) {
    throw new Error('DESCRIPCION_INVALIDA');
  }

  const id = randomUUID();

  await pool.execute(
    `INSERT INTO categorias_repuestos (
       id,
       nombre,
       descripcion
     )
     VALUES (?, ?, ?)`,
    [
      id,
      nombreLimpio,
      descripcion?.trim() || null
    ]
  );

  return {
    id,
    nombre: nombreLimpio,
    descripcion: descripcion?.trim() || null
  };
}

// ========================================
// VALIDAR DATOS DEL REPUESTO
// ========================================

async function validarRepuesto(
  datos: DatosRepuesto
) {
  const nombre = datos.nombre.trim();

  if (!nombre || nombre.length > 150) {
    throw new Error('NOMBRE_REPUESTO_INVALIDO');
  }

  // El porcentaje puede contener hasta
  // dos decimales: por ejemplo, 30.50%.
  if (
    !Number.isFinite(datos.porcentajeGanancia) ||
    datos.porcentajeGanancia < 0 ||
    datos.porcentajeGanancia > 999.99 ||
    Math.abs(
      datos.porcentajeGanancia * 100 -
      Math.round(datos.porcentajeGanancia * 100)
    ) > 0.0001
  ) {
    throw new Error('GANANCIA_INVALIDA');
  }

  if (
    !Number.isInteger(datos.cantidadMinima) ||
    datos.cantidadMinima < 0 ||
    datos.cantidadMinima > 2147483647
  ) {
    throw new Error('CANTIDAD_MINIMA_INVALIDA');
  }

  if (
    datos.descripcion !== null &&
    datos.descripcion.length > 10000
  ) {
    throw new Error('DESCRIPCION_INVALIDA');
  }

  if (datos.categoriaId !== null) {
    if (!UUID.test(datos.categoriaId)) {
      throw new Error('CATEGORIA_INVALIDA');
    }

    const [categorias] =
      await pool.execute<RowDataPacket[]>(
        `SELECT id
         FROM categorias_repuestos
         WHERE id = ?
         LIMIT 1`,
        [datos.categoriaId]
      );

    if (categorias.length === 0) {
      throw new Error('CATEGORIA_INVALIDA');
    }
  }
}

// ========================================
// REGISTRAR NUEVO REPUESTO
// ========================================

export async function crearRepuesto(
  datos: DatosRepuesto
) {
  await validarRepuesto(datos);

  const id = randomUUID();

  // El precio, el PMP y el stock comienzan
  // en cero hasta registrar la primera compra.
  await pool.execute(
    `INSERT INTO repuestos (
       id,
       categoriaId,
       nombre,
       descripcion,
       precioVenta,
       costoPromedioPMP,
       porcentajeGanancia,
       stockActual,
       cantidadMinima
     )
     VALUES (?, ?, ?, ?, 0.00, 0.00, ?, 0, ?)`,
    [
      id,
      datos.categoriaId,
      datos.nombre.trim(),
      datos.descripcion?.trim() || null,
      datos.porcentajeGanancia,
      datos.cantidadMinima
    ]
  );

  return {
    id,
    precioVenta: 0,
    costoPromedioPMP: 0,
    porcentajeGanancia: datos.porcentajeGanancia,
    stockActual: 0
  };
}

// ========================================
// EDITAR REPUESTO Y RECALCULAR PRECIO
// ========================================

export async function actualizarRepuesto(
  id: string,
  datos: DatosRepuesto
) {
  if (!UUID.test(id)) {
    throw new Error('REPUESTO_ID_INVALIDO');
  }

  await validarRepuesto(datos);

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // Bloquear el repuesto para evitar que
    // una compra cambie simultáneamente su PMP.
    const [repuestos] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           id,
           costoPromedioPMP,
           precioVenta,
           ROUND(
             costoPromedioPMP *
             (1 + CAST(? AS DECIMAL(5,2)) / 100),
             2
           ) AS precioCalculado
         FROM repuestos
         WHERE id = ?
         FOR UPDATE`,
        [datos.porcentajeGanancia, id]
      );

    if (repuestos.length === 0) {
      throw new Error('REPUESTO_NO_EXISTE');
    }

    const repuesto = repuestos[0];

    const costoPMP =
      Number(repuesto.costoPromedioPMP);

    // Si todavía no hay un costo de adquisición,
    // conservar el precio existente.
    const precioVenta =
      costoPMP > 0
        ? Number(repuesto.precioCalculado)
        : Number(repuesto.precioVenta);

    if (
      !Number.isFinite(precioVenta) ||
      precioVenta < 0 ||
      precioVenta > 9999999999.99
    ) {
      throw new Error('PRECIO_INVALIDO');
    }

    const [resultado] =
      await conexion.execute<ResultSetHeader>(
        `UPDATE repuestos
         SET
           categoriaId = ?,
           nombre = ?,
           descripcion = ?,
           porcentajeGanancia = ?,
           cantidadMinima = ?,
           precioVenta = ?
         WHERE id = ?`,
        [
          datos.categoriaId,
          datos.nombre.trim(),
          datos.descripcion?.trim() || null,
          datos.porcentajeGanancia,
          datos.cantidadMinima,
          precioVenta.toFixed(2),
          id
        ]
      );

    if (resultado.affectedRows === 0) {
      // La fila ya fue comprobada.
      // Puede que los datos no hayan cambiado.
    }

    await conexion.commit();

    return {
      id,
      precioVenta,
      costoPromedioPMP: costoPMP,
      porcentajeGanancia: datos.porcentajeGanancia
    };

  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}
