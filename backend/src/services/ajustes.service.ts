
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_STOCK = 2147483647;

const TIPOS_AJUSTE = [
  'SOBRANTE',
  'FALTANTE',
  'DANADO'
] as const;

type TipoAjuste = typeof TIPOS_AJUSTE[number];

interface DatosAjuste {
  repuestoId: string;
  tipoAjuste: TipoAjuste;
  cantidad: number;
  motivo: string;
  stockEsperado: number;
}

interface RepuestoDB extends RowDataPacket {
  id: string;
  nombre: string;
  stockActual: number;
  costoPromedioPMP: string | number;
  precioVenta: string | number;
}

const nombresAjuste: Record<TipoAjuste, string> = {
  SOBRANTE: 'Sobrante de inventario',
  FALTANTE: 'Faltante de inventario',
  DANADO: 'Producto dañado'
};

// ========================================
// REGISTRAR AJUSTE
// ========================================

export async function registrarAjuste(
  datos: DatosAjuste,
  usuarioId: string
) {

  // VALIDAR DATOS

  if (!UUID.test(datos.repuestoId)) {
    throw new Error('REPUESTO_ID_INVALIDO');
  }

  if (!UUID.test(usuarioId)) {
    throw new Error('USUARIO_INVALIDO');
  }

  if (!TIPOS_AJUSTE.includes(datos.tipoAjuste)) {
    throw new Error('TIPO_AJUSTE_INVALIDO');
  }

  if (
    !Number.isInteger(datos.cantidad) ||
    datos.cantidad <= 0 ||
    datos.cantidad > MAX_STOCK
  ) {
    throw new Error('CANTIDAD_INVALIDA');
  }

  if (
    !Number.isInteger(datos.stockEsperado) ||
    datos.stockEsperado < 0 ||
    datos.stockEsperado > MAX_STOCK
  ) {
    throw new Error('STOCK_INVALIDO');
  }

  const motivo = datos.motivo.trim();

  if (
    motivo.length < 5 ||
    motivo.length > 200
  ) {
    throw new Error('MOTIVO_INVALIDO');
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // ========================================
    // 1. BLOQUEAR EL REPUESTO
    // ========================================

    const [repuestos] =
      await conexion.execute<RepuestoDB[]>(
        `SELECT
           id,
           nombre,
           stockActual,
           costoPromedioPMP,
           precioVenta
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

    const costoPMP =
      Number(repuesto.costoPromedioPMP);

    // Comprobar que el stock no haya cambiado
    // mientras el usuario preparaba el ajuste.

    if (stockAnterior !== datos.stockEsperado) {
      throw new Error('STOCK_MODIFICADO');
    }

    // No ajustar mercancía sin una valoración
    // válida dentro del inventario.

    if (
      !Number.isFinite(costoPMP) ||
      costoPMP <= 0
    ) {
      throw new Error('PMP_NO_DISPONIBLE');
    }

    // ========================================
    // 2. CALCULAR NUEVAS EXISTENCIAS
    // ========================================

    const esEntrada =
      datos.tipoAjuste === 'SOBRANTE';

    const diferencia = esEntrada
      ? datos.cantidad
      : -datos.cantidad;

    const stockNuevo =
      stockAnterior + diferencia;

    if (stockNuevo < 0) {
      throw new Error('STOCK_INSUFICIENTE');
    }

    if (stockNuevo > MAX_STOCK) {
      throw new Error('STOCK_MAXIMO_SUPERADO');
    }

    // ========================================
    // 3. ACTUALIZAR EXISTENCIAS
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

    // El costo PMP y el precio de venta
    // permanecen sin cambios.

    // ========================================
    // 4. REGISTRAR AJUSTE EN KARDEX
    // ========================================

    const ajusteId = randomUUID();

    const observaciones =
      `${nombresAjuste[datos.tipoAjuste]}: ${motivo}`;

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
         ?, ?, 'AJUSTE_INVENTARIO',
         ?, ?, ?, ?, ?, NULL, ?, ?
       )`,
      [
        ajusteId,
        repuesto.id,
        datos.cantidad,
        costoPMP.toFixed(2),
        costoPMP.toFixed(2),
        stockAnterior,
        stockNuevo,
        usuarioId,
        observaciones
      ]
    );

    // ========================================
    // 5. CONFIRMAR TRANSACCIÓN
    // ========================================

    await conexion.commit();

    return {
      id: ajusteId,
      repuestoId: repuesto.id,
      repuestoNombre: repuesto.nombre,
      tipoAjuste: datos.tipoAjuste,
      cantidad: datos.cantidad,
      diferencia,
      motivo,
      stockAnterior,
      stockNuevo,
      costoPMP,
      precioVenta: Number(repuesto.precioVenta)
    };

  } catch (error) {

    await conexion.rollback();
    throw error;

  } finally {

    conexion.release();

  }
}

// ========================================
// HISTORIAL DE AJUSTES
// ========================================

export async function obtenerAjustes() {
  const [ajustes] =
    await pool.query<RowDataPacket[]>(
      `SELECT
         k.id,
         k.repuestoId,
         r.nombre AS repuestoNombre,
         k.tipoMovimiento,
         k.cantidad,
         k.stockAnterior,
         k.stockNuevo,
         k.costoUnitarioMovimiento,
         k.costoPMPResultante,
         k.observaciones,
         k.usuarioId,
         u.name AS usuarioNombre,
         DATE_FORMAT(
           k.created,
           '%Y-%m-%d %H:%i:%s'
         ) AS fechaAjuste

       FROM inventario_pmp_kardex k

       INNER JOIN repuestos r
         ON r.id = k.repuestoId

       INNER JOIN users u
         ON u.id = k.usuarioId

       WHERE k.tipoMovimiento = 'AJUSTE_INVENTARIO'

       ORDER BY k.created DESC, k.id DESC
       LIMIT 500`
    );

  return ajustes;
}
