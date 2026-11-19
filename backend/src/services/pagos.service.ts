
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_CENTAVOS = 999999999999;

const TIPOS_PAGO = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'TARJETA',
  'NEQUI',
  'DAVIPLATA'
] as const;

export type TipoPago = typeof TIPOS_PAGO[number];

export interface DatosPago {
  solicitudId: string;
  monto: number;
  tipoPago: TipoPago;
  referencia?: string | null;
}

interface FacturaDB extends RowDataPacket {
  id: string;
  clienteId: string;
  total: string | number;
  estado: string;
}

interface PagoDB extends RowDataPacket {
  id: string;
  facturaId: string;
  clienteId: string;
  monto: string | number;
  tipoPago: string;
  referencia: string | null;
  estado: string;
}

interface MontoDB extends RowDataPacket {
  monto: string | number;
}

function centavos(valor: string | number): number {
  const numero = Number(valor);
  const resultado = Math.round(numero * 100);

  if (
    !Number.isFinite(numero) ||
    numero < 0 ||
    !Number.isSafeInteger(resultado) ||
    resultado > MAX_CENTAVOS ||
    Math.abs(numero * 100 - resultado) > 0.0001
  ) {
    throw new Error('MONTO_PAGO_INVALIDO');
  }

  return resultado;
}

function dinero(valorCentavos: number): string {
  return (valorCentavos / 100).toFixed(2);
}

function sumarCentavos(valores: MontoDB[]): number {
  let total = 0;

  for (const valor of valores) {
    total += centavos(valor.monto);

    if (
      !Number.isSafeInteger(total) ||
      total > MAX_CENTAVOS
    ) {
      throw new Error('PAGOS_INCONSISTENTES');
    }
  }

  return total;
}

// ========================================
// REGISTRAR PAGO O ABONO
// ========================================

export async function registrarPagoFactura(
  facturaId: string,
  datos: DatosPago,
  roleId: string
) {
  if (!UUID.test(facturaId)) {
    throw new Error('FACTURA_ID_INVALIDO');
  }

  if (!datos || !UUID.test(datos.solicitudId)) {
    throw new Error('SOLICITUD_PAGO_INVALIDA');
  }

  if (!TIPOS_PAGO.includes(datos.tipoPago)) {
    throw new Error('TIPO_PAGO_INVALIDO');
  }

  if (
    typeof datos.monto !== 'number' ||
    !Number.isFinite(datos.monto)
  ) {
    throw new Error('MONTO_PAGO_INVALIDO');
  }

  const montoCentavos = centavos(datos.monto);

  if (montoCentavos === 0) {
    throw new Error('MONTO_PAGO_INVALIDO');
  }

  const referencia =
    typeof datos.referencia === 'string'
      ? datos.referencia.trim() || null
      : datos.referencia ?? null;

  if (
    referencia !== null &&
    (
      typeof referencia !== 'string' ||
      referencia.length > 100
    )
  ) {
    throw new Error('REFERENCIA_PAGO_INVALIDA');
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // 1. Autorizar al administrador.
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
           AND p.nombre = 'pagos.registrar'
         LIMIT 1`,
        [roleId]
      );

    if (permisos.length === 0) {
      throw new Error('PAGO_SIN_PERMISO');
    }

    // 2. Bloquear factura para impedir
    // pagos simultáneos que superen el saldo.
    const [facturas] =
      await conexion.execute<FacturaDB[]>(
        `SELECT id, clienteId, total, estado
         FROM facturas
         WHERE id = ?
         FOR UPDATE`,
        [facturaId]
      );

    if (facturas.length === 0) {
      throw new Error('FACTURA_NO_EXISTE');
    }

    const factura = facturas[0];
    const totalCentavos = centavos(factura.total);

    // 3. Comprobar si la misma solicitud
    // ya fue procesada anteriormente.
    const [anteriores] =
      await conexion.execute<PagoDB[]>(
        `SELECT
           id, facturaId, clienteId, monto,
           tipoPago, referencia, estado
         FROM pagos
         WHERE id = ?
         FOR UPDATE`,
        [datos.solicitudId]
      );

    const [pagosAprobados] =
      await conexion.execute<MontoDB[]>(
        `SELECT monto
         FROM pagos
         WHERE facturaId = ?
           AND estado = 'APROBADO'`,
        [facturaId]
      );

    const pagadoCentavos =
      sumarCentavos(pagosAprobados);

    if (pagadoCentavos > totalCentavos) {
      throw new Error('PAGOS_INCONSISTENTES');
    }

    if (anteriores.length > 0) {
      const anterior = anteriores[0];

      const mismaSolicitud =
        anterior.facturaId === facturaId &&
        anterior.clienteId === factura.clienteId &&
        centavos(anterior.monto) === montoCentavos &&
        anterior.tipoPago === datos.tipoPago &&
        anterior.referencia === referencia &&
        anterior.estado === 'APROBADO';

      if (!mismaSolicitud) {
        throw new Error('SOLICITUD_PAGO_YA_UTILIZADA');
      }

      await conexion.commit();

      return {
        id: anterior.id,
        facturaId,
        monto: montoCentavos / 100,
        tipoPago: anterior.tipoPago,
        estado: anterior.estado,
        yaRegistrado: true,
        totalPagado: pagadoCentavos / 100,
        saldoPendiente:
          (totalCentavos - pagadoCentavos) / 100,
        estadoFactura: factura.estado
      };
    }

    // 4. Validar estado y saldo.
    if (factura.estado === 'ANULADO') {
      throw new Error('FACTURA_ANULADA');
    }

    if (
      factura.estado !== 'PENDIENTE' &&
      factura.estado !== 'PAGADO'
    ) {
      throw new Error('ESTADO_FACTURA_INVALIDO');
    }

    const saldoCentavos =
      totalCentavos - pagadoCentavos;

    if (saldoCentavos === 0) {
      throw new Error('FACTURA_SIN_SALDO');
    }

    if (factura.estado === 'PAGADO') {
      throw new Error('PAGOS_INCONSISTENTES');
    }

    if (montoCentavos > saldoCentavos) {
      throw new Error('PAGO_SUPERA_SALDO');
    }

    // 5. Registrar únicamente pagos recibidos
    // y verificados por quien opera el sistema.
    await conexion.execute(
      `INSERT INTO pagos (
         id,
         facturaId,
         clienteId,
         monto,
         tipoPago,
         referencia,
         estado
       )
       VALUES (?, ?, ?, ?, ?, ?, 'APROBADO')`,
      [
        datos.solicitudId,
        facturaId,
        factura.clienteId,
        dinero(montoCentavos),
        datos.tipoPago,
        referencia
      ]
    );

    // 6. Actualizar el estado de la factura.
    const nuevoPagado =
      pagadoCentavos + montoCentavos;

    const nuevoSaldo =
      totalCentavos - nuevoPagado;

    const estadoFactura =
      nuevoSaldo === 0 ? 'PAGADO' : 'PENDIENTE';

    await conexion.execute(
      `UPDATE facturas
       SET estado = ?
       WHERE id = ?`,
      [estadoFactura, facturaId]
    );

    await conexion.commit();

    return {
      id: datos.solicitudId,
      facturaId,
      monto: montoCentavos / 100,
      tipoPago: datos.tipoPago,
      referencia,
      estado: 'APROBADO',
      yaRegistrado: false,
      totalPagado: nuevoPagado / 100,
      saldoPendiente: nuevoSaldo / 100,
      estadoFactura
    };

  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}
