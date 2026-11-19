
import { randomUUID } from 'node:crypto';

import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

import { pool } from '../config/database.js';

// ========================================
// CONSTANTES
// ========================================

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_CENTAVOS = 999999999999;

// ========================================
// INTERFACES
// ========================================

interface OrdenFacturaDB extends RowDataPacket {
  id: string;
  citaId: string | null;
  motoId: string;
  estado: string;
  costo: string | number;
}

interface ClienteOrdenDB extends RowDataPacket {
  clienteId: string;
}

interface TrabajoFacturaDB extends RowDataPacket {
  id: string;
  descripcion: string;
  precioAplicado: string | number;
  estado: string;
}

interface RepuestoFacturaDB extends RowDataPacket {
  id: string;
  repuestoId: string;
  descripcion: string;
  cantidad: number;
  precioUnitarioVenta: string | number | null;
}

// ========================================
// VALIDAR VALORES MONETARIOS
// ========================================

function convertirCentavos(
  valor: string | number | null
): number {

  if (valor === null || valor === '') {
    throw new Error('PRECIO_FACTURA_INVALIDO');
  }

  const numero = Number(valor);

  const centavos = Math.round(numero * 100);

  if (
    !Number.isFinite(numero) ||
    numero < 0 ||
    !Number.isSafeInteger(centavos) ||
    centavos > MAX_CENTAVOS ||
    Math.abs(numero * 100 - centavos) > 0.0001
  ) {
    throw new Error('PRECIO_FACTURA_INVALIDO');
  }

  return centavos;
}

function validarTotal(centavos: number) {

  if (
    !Number.isSafeInteger(centavos) ||
    centavos < 0 ||
    centavos > MAX_CENTAVOS
  ) {
    throw new Error('TOTAL_FACTURA_INVALIDO');
  }
}

function dinero(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

// ========================================
// VALIDAR PERMISOS DE FACTURACIÓN
// ========================================

async function verificarPermisoFacturacion(
  conexion: PoolConnection,
  roleId: string,
  permisoRequerido: 'facturacion.ver' | 'facturacion.generar'
) {

  const [permisos] =
    await conexion.execute<RowDataPacket[]>(
      `SELECT 1 AS permitido

       FROM roles_permisos rp

       INNER JOIN permisos p
         ON p.id = rp.permisoId

       INNER JOIN roles r
         ON r.id = rp.roleId

       WHERE rp.roleId = ?
         AND r.activo = 1
         AND p.nombre = ?

       LIMIT 1`,
      [roleId, permisoRequerido]
    );

  if (permisos.length === 0) {
    throw new Error('FACTURA_SIN_PERMISO');
  }
}

// ========================================
// CONSULTAR ÓRDENES PENDIENTES DE FACTURAR
// ========================================

export async function obtenerOrdenesPendientesFacturar(
  roleId: string
) {

  const conexion = await pool.getConnection();

  try {

    await verificarPermisoFacturacion(
      conexion,
      roleId,
      'facturacion.generar'
    );

    const [ordenes] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           s.id,
           s.citaId,
           s.motoId,
           s.descripcion,
           s.estado,
           s.costo,
           s.tiempoFin,
           s.tiempoTrabajo,

           cl.id AS clienteId,
           cl.nombre AS clienteNombre,

           m.placa AS motoPlaca,
           m.marca AS motoMarca,
           m.modelo AS motoModelo,

           u.name AS mecanicoNombre

         FROM servicios s

         INNER JOIN motos m
           ON m.id = s.motoId

         LEFT JOIN citas c
           ON c.id = s.citaId

         INNER JOIN clientes cl
           ON cl.id = COALESCE(
             c.clienteId,
             m.clienteId
           )

         INNER JOIN users u
           ON u.id = s.mecanicoId

         WHERE s.estado = 'COMPLETADO'

           AND NOT EXISTS (
             SELECT 1
             FROM facturas f
             WHERE f.servicioId = s.id
           )

           AND NOT EXISTS (
             SELECT 1
             FROM factura_servicios fs
             WHERE fs.servicioId = s.id
           )

         ORDER BY s.tiempoFin DESC
         LIMIT 500`
      );

    return ordenes;

  } finally {
    conexion.release();
  }
}

// ========================================
// GENERAR FACTURA DESDE UNA ORDEN
// ========================================

export async function generarFacturaDesdeOrden(
  ordenId: string,
  roleId: string
) {

  if (!UUID.test(ordenId)) {
    throw new Error('ORDEN_ID_INVALIDO');
  }

  const conexion = await pool.getConnection();

  try {

    await conexion.beginTransaction();

    // 1. Validar permisos.

    await verificarPermisoFacturacion(
      conexion,
      roleId,
      'facturacion.generar'
    );

    // 2. Bloquear la orden de trabajo.

    const [ordenes] =
      await conexion.execute<OrdenFacturaDB[]>(
        `SELECT
           id,
           citaId,
           motoId,
           estado,
           costo

         FROM servicios

         WHERE id = ?
         FOR UPDATE`,
        [ordenId]
      );

    if (ordenes.length === 0) {
      throw new Error('ORDEN_NO_EXISTE');
    }

    const orden = ordenes[0];

    // 3. Comprobar que no tenga factura.

    const [facturasExistentes] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           id,
           numero,
           estado

         FROM facturas

         WHERE servicioId = ?
         LIMIT 1
         FOR UPDATE`,
        [ordenId]
      );

    if (facturasExistentes.length > 0) {
      throw new Error('ORDEN_YA_FACTURADA');
    }

    // Proteger órdenes facturadas antes
    // de agregar facturas.servicioId.

    const [detallesExistentes] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT id

         FROM factura_servicios

         WHERE servicioId = ?
         LIMIT 1
         FOR UPDATE`,
        [ordenId]
      );

    if (detallesExistentes.length > 0) {
      throw new Error('ORDEN_YA_FACTURADA');
    }

    // 4. Validar que esté completada.

    if (orden.estado !== 'COMPLETADO') {
      throw new Error('ORDEN_NO_FACTURABLE');
    }

    // 5. Obtener el cliente de la orden.
    // Preferir el cliente registrado en la cita.

    const [clientes] =
      await conexion.execute<ClienteOrdenDB[]>(
        `SELECT
           COALESCE(
             c.clienteId,
             m.clienteId
           ) AS clienteId

         FROM servicios s

         INNER JOIN motos m
           ON m.id = s.motoId

         LEFT JOIN citas c
           ON c.id = s.citaId

         WHERE s.id = ?`,
        [ordenId]
      );

    const clienteId = clientes[0]?.clienteId;

    if (!clienteId) {
      throw new Error('ORDEN_SIN_CLIENTE');
    }

    // 6. Obtener los trabajos registrados.

    const [trabajos] =
      await conexion.execute<TrabajoFacturaDB[]>(
        `SELECT
           sd.id,

           COALESCE(
             NULLIF(TRIM(sd.descripcion), ''),
             cs.nombre
           ) AS descripcion,

           sd.precioAplicado,
           sd.estado

         FROM servicios_detalles sd

         INNER JOIN catalogo_servicios cs
           ON cs.id = sd.catalogoServicioId

         WHERE sd.servicioId = ?
           AND sd.estado <> 'CANCELADO'

         ORDER BY sd.created ASC, sd.id ASC

         FOR UPDATE`,
        [ordenId]
      );

    if (trabajos.length === 0) {
      throw new Error('ORDEN_SIN_TRABAJOS');
    }

    if (
      trabajos.some(
        trabajo =>
          trabajo.estado !== 'COMPLETADO'
      )
    ) {
      throw new Error(
        'ORDEN_TRABAJOS_PENDIENTES'
      );
    }

    // 7. Obtener los repuestos utilizados.
    // Usar precio histórico, no precio actual.

    const [repuestos] =
      await conexion.execute<RepuestoFacturaDB[]>(
        `SELECT
           sr.id,
           sr.repuestoId,
           r.nombre AS descripcion,
           sr.cantidad,
           sr.precioUnitarioVenta

         FROM servicio_repuestos sr

         INNER JOIN repuestos r
           ON r.id = sr.repuestoId

         WHERE sr.servicioId = ?

         ORDER BY sr.created ASC, sr.id ASC

         FOR UPDATE`,
        [ordenId]
      );

    // ========================================
    // 8. CALCULAR MANO DE OBRA
    // ========================================

    let manoObraCentavos = 0;

    const detallesTrabajos = trabajos.map(
      trabajo => {

        const precioCentavos =
          convertirCentavos(
            trabajo.precioAplicado
          );

        manoObraCentavos += precioCentavos;

        validarTotal(manoObraCentavos);

        return {
          id: trabajo.id,

          descripcion:
            Array.from(trabajo.descripcion)
              .slice(0, 255)
              .join(''),

          costoAplicado:
            dinero(precioCentavos)
        };
      }
    );

    // ========================================
    // 9. CALCULAR REPUESTOS
    // ========================================

    let repuestosCentavos = 0;

    const detallesRepuestos = repuestos.map(
      repuesto => {

        if (
          repuesto.precioUnitarioVenta === null
        ) {
          throw new Error(
            'REPUESTOS_SIN_PRECIO_HISTORICO'
          );
        }

        const cantidad = Number(
          repuesto.cantidad
        );

        if (
          !Number.isInteger(cantidad) ||
          cantidad <= 0
        ) {
          throw new Error(
            'CANTIDAD_FACTURA_INVALIDA'
          );
        }

        const precioCentavos =
          convertirCentavos(
            repuesto.precioUnitarioVenta
          );

        const subtotalCentavos =
          precioCentavos * cantidad;

        validarTotal(subtotalCentavos);

        repuestosCentavos += subtotalCentavos;

        validarTotal(repuestosCentavos);

        return {
          repuestoId: repuesto.repuestoId,
          descripcion: repuesto.descripcion,
          cantidad,

          precioUnitario:
            dinero(precioCentavos),

          subtotal:
            dinero(subtotalCentavos)
        };
      }
    );

    // ========================================
    // 10. CALCULAR TOTAL DEFINITIVO
    // ========================================

    const subtotalCentavos =
      manoObraCentavos +
      repuestosCentavos;

    validarTotal(subtotalCentavos);

    // No inventar ni modificar precios
    // de una orden previamente completada.

    if (
      convertirCentavos(orden.costo) !==
      subtotalCentavos
    ) {
      throw new Error(
        'ORDEN_TOTAL_NO_COINCIDE'
      );
    }

    // Facturación interna.
    // Los impuestos quedan pendientes
    // de la configuración tributaria.

    const impuestoCentavos = 0;

    const totalCentavos =
      subtotalCentavos + impuestoCentavos;

    validarTotal(totalCentavos);

    // ========================================
    // 11. GENERAR IDENTIFICADORES
    // ========================================

    const facturaId = randomUUID();

    // Número interno único.
    // No es numeración fiscal autorizada.

    const numero =
      `INT-${facturaId.toUpperCase()}`;

    const estadoFactura =
      totalCentavos === 0
        ? 'PAGADO'
        : 'PENDIENTE';

    // ========================================
    // 12. CREAR FACTURA
    // ========================================

    await conexion.execute(
      `INSERT INTO facturas (
         id,
         numero,
         clienteId,
         motoId,
         servicioId,
         subtotal,
         impuesto,
         total,
         estado
       )

       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        facturaId,
        numero,
        clienteId,
        orden.motoId,
        ordenId,
        dinero(subtotalCentavos),
        dinero(impuestoCentavos),
        dinero(totalCentavos),
        estadoFactura
      ]
    );

    // ========================================
    // 13. GUARDAR MANO DE OBRA FACTURADA
    // ========================================

    for (const trabajo of detallesTrabajos) {

      await conexion.execute(
        `INSERT INTO factura_servicios (
           id,
           facturaId,
           servicioId,
           servicioDetalleId,
           descripcion,
           costoAplicado
         )

         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          facturaId,
          ordenId,
          trabajo.id,
          trabajo.descripcion,
          trabajo.costoAplicado
        ]
      );
    }

    // ========================================
    // 14. GUARDAR REPUESTOS FACTURADOS
    // ========================================

    for (
      const repuesto of detallesRepuestos
    ) {

      await conexion.execute(
        `INSERT INTO factura_repuestos (
           id,
           facturaId,
           repuestoId,
           descripcion,
           cantidad,
           precioUnitario,
           subtotal
         )

         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          facturaId,
          repuesto.repuestoId,
          repuesto.descripcion,
          repuesto.cantidad,
          repuesto.precioUnitario,
          repuesto.subtotal
        ]
      );
    }

    // NO descontar inventario.
    // NO registrar salidas adicionales.
    // NO cambiar la orden a ENTREGADO.

    // ========================================
    // 15. CONFIRMAR TRANSACCIÓN
    // ========================================

    await conexion.commit();

    return {
      id: facturaId,
      numero,
      clienteId,
      motoId: orden.motoId,
      servicioId: ordenId,
      estado: estadoFactura,

      totalManoObra:
        manoObraCentavos / 100,

      totalRepuestos:
        repuestosCentavos / 100,

      subtotal:
        subtotalCentavos / 100,

      impuesto:
        impuestoCentavos / 100,

      total:
        totalCentavos / 100,

      totalPagado: 0,

      saldoPendiente:
        totalCentavos / 100
    };

  } catch (error) {

    await conexion.rollback();

    throw error;

  } finally {

    conexion.release();
  }
}

// ========================================
// CONSULTAR HISTORIAL DE FACTURAS
// ========================================

export async function obtenerFacturas(
  roleId: string
) {

  const conexion = await pool.getConnection();

  try {

    await verificarPermisoFacturacion(
      conexion,
      roleId,
      'facturacion.ver'
    );

    const [facturas] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           f.id,
           f.numero,
           f.clienteId,
           f.motoId,
           f.servicioId,
           f.subtotal,
           f.impuesto,
           f.total,
           f.estado,
           f.created,

           cl.nombre AS clienteNombre,

           m.placa AS motoPlaca,
           m.marca AS motoMarca,
           m.modelo AS motoModelo,

           COALESCE(
             (
               SELECT SUM(p.monto)

               FROM pagos p

               WHERE p.facturaId = f.id
                 AND p.estado = 'APROBADO'
             ), 0
           ) AS totalPagado,

           CASE

             WHEN f.estado = 'ANULADO'
               THEN 0

             ELSE f.total - COALESCE(
               (
                 SELECT SUM(p.monto)

                 FROM pagos p

                 WHERE p.facturaId = f.id
                   AND p.estado = 'APROBADO'
               ), 0
             )

           END AS saldoPendiente

         FROM facturas f

         INNER JOIN clientes cl
           ON cl.id = f.clienteId

         LEFT JOIN motos m
           ON m.id = f.motoId

         ORDER BY f.created DESC
         LIMIT 500`
      );

    return facturas;

  } finally {
    conexion.release();
  }
}

// ========================================
// CONSULTAR DETALLE COMPLETO DE FACTURA
// ========================================

export async function obtenerDetalleFactura(
  facturaId: string,
  roleId: string
) {

  if (!UUID.test(facturaId)) {
    throw new Error('FACTURA_ID_INVALIDO');
  }

  const conexion = await pool.getConnection();

  try {

    await conexion.beginTransaction();

    await verificarPermisoFacturacion(
      conexion,
      roleId,
      'facturacion.ver'
    );

    // 1. Consultar encabezado de factura.

    const [facturas] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           f.id,
           f.numero,
           f.clienteId,
           f.motoId,
           f.servicioId,
           f.subtotal,
           f.impuesto,
           f.total,
           f.estado,
           f.created,

           cl.nombre AS clienteNombre,

           m.placa AS motoPlaca,
           m.marca AS motoMarca,
           m.modelo AS motoModelo

         FROM facturas f

         INNER JOIN clientes cl
           ON cl.id = f.clienteId

         LEFT JOIN motos m
           ON m.id = f.motoId

         WHERE f.id = ?`,
        [facturaId]
      );

    if (facturas.length === 0) {
      throw new Error('FACTURA_NO_EXISTE');
    }

    const factura = facturas[0];

    // 2. Consultar mano de obra facturada.

    const [trabajos] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           id,
           servicioId,
           servicioDetalleId,

           COALESCE(
             descripcion,
             'Servicio registrado anteriormente'
           ) AS descripcion,

           costoAplicado,

           created

         FROM factura_servicios

         WHERE facturaId = ?

         ORDER BY created ASC, id ASC`,
        [facturaId]
      );

    // 3. Consultar repuestos facturados.

    const [repuestos] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           fr.id,
           fr.repuestoId,

           COALESCE(
             fr.descripcion,
             r.nombre
           ) AS descripcion,

           fr.cantidad,
           fr.precioUnitario,
           fr.subtotal,
           fr.created

         FROM factura_repuestos fr

         INNER JOIN repuestos r
           ON r.id = fr.repuestoId

         WHERE fr.facturaId = ?

         ORDER BY fr.created ASC, fr.id ASC`,
        [facturaId]
      );

    // 4. Consultar pagos registrados.

    const [pagos] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           id,
           monto,
           tipoPago,
           referencia,
           estado,
           created

         FROM pagos

         WHERE facturaId = ?

         ORDER BY created DESC, id DESC`,
        [facturaId]
      );

    // ========================================
    // 5. CALCULAR PAGOS APROBADOS
    // ========================================

    const totalPagadoCentavos =
      pagos.reduce(
        (acumulado, pago) => {

          if (pago.estado !== 'APROBADO') {
            return acumulado;
          }

          return (
            acumulado +
            convertirCentavos(pago.monto)
          );
        },
        0
      );

    const totalFacturaCentavos =
      convertirCentavos(factura.total);

    const saldoCentavos =
      factura.estado === 'ANULADO'
        ? 0
        : totalFacturaCentavos -
          totalPagadoCentavos;

    await conexion.commit();

    return {
      ...factura,

      subtotal: Number(factura.subtotal),

      impuesto: Number(factura.impuesto),

      total: Number(factura.total),

      trabajos,
      repuestos,
      pagos,

      totalPagado:
        totalPagadoCentavos / 100,

      saldoPendiente:
        saldoCentavos / 100,

      requiereRevision:
        totalPagadoCentavos >
          totalFacturaCentavos ||
        (
          factura.estado === 'ANULADO' &&
          totalPagadoCentavos > 0
        )
    };

  } catch (error) {

    await conexion.rollback();

    throw error;

  } finally {

    conexion.release();
  }
}
