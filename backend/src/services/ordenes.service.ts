
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

import { pool } from '../config/database.js';
import { generarComisionesOrden } from './comisiones-generacion.service.js';


const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_DINERO = 9999999999.99;
const MAX_CANTIDAD = 2147483647;

// ========================================
// INTERFACES
// ========================================

interface CitaDB extends RowDataPacket {
  id: string;
  motoId: string;
  mecanicoId: string;
  fecha: string;
  tipoServicio: string;
  descripcion: string | null;
  estado: string;
}

interface OrdenDB extends RowDataPacket {
  id: string;
}

interface OrdenEstadoDB extends RowDataPacket {
  id: string;
  mecanicoId: string;
  estado: string;
  costo: string | number;
}

interface PermisoOrdenDB extends RowDataPacket {
  permiso: string;
}

interface CatalogoDB extends RowDataPacket {
  id: string;
  nombre: string;
  descripcion: string | null;
  precioManoObra: string | number;
}

interface RepuestoDB extends RowDataPacket {
  id: string;
  nombre: string;
  stockActual: number;
  costoPromedioPMP: string | number;
  precioVenta: string | number;
}

interface TotalesDB extends RowDataPacket {
  totalManoObra: string | number;
  totalRepuestos: string | number;
  totalCostoPMP: string | number;
  repuestosSinPrecio: number;
}

interface DatosRepuestoOrden {
  repuestoId: string;
  cantidad: number;
  solicitudId: string;
}

// ========================================
// FECHA ACTUAL EN COLOMBIA
// ========================================

function hoyColombia(): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const obtener = (tipo: string) =>
    partes.find(
      parte => parte.type === tipo
    )?.value ?? '';

  return [
    obtener('year'),
    obtener('month'),
    obtener('day')
  ].join('-');
}

// ========================================
// VALIDAR PRECIO
// ========================================

function validarPrecio(
  valor: string | number,
  permitirCero = true
) {
  const precio = Number(valor);

  if (
    !Number.isFinite(precio) ||
    precio < 0 ||
    precio > MAX_DINERO ||
    (!permitirCero && precio === 0)
  ) {
    throw new Error('PRECIO_INVALIDO');
  }

  return precio;
}

// ========================================
// AUTORIZAR ACCESO A UNA ORDEN
// ========================================

async function obtenerOrdenAutorizada(
  conexion: PoolConnection,
  ordenId: string,
  usuarioId: string,
  roleId: string
) {
  if (!UUID.test(ordenId)) {
    throw new Error('ORDEN_ID_INVALIDO');
  }

  const [ordenes] =
    await conexion.execute<OrdenEstadoDB[]>(
      `SELECT id, mecanicoId, estado, costo
       FROM servicios
       WHERE id = ?
       FOR UPDATE`,
      [ordenId]
    );

  if (ordenes.length === 0) {
    throw new Error('ORDEN_NO_EXISTE');
  }

  const orden = ordenes[0];

  const [permisos] =
    await conexion.execute<PermisoOrdenDB[]>(
      `SELECT p.nombre AS permiso
       FROM roles_permisos rp
       INNER JOIN permisos p
         ON p.id = rp.permisoId
       INNER JOIN roles r
         ON r.id = rp.roleId
       WHERE rp.roleId = ?
         AND p.nombre IN (
           'roles.administrar',
           'servicios.crear',
           'servicios.editar'
         )
         AND r.activo = 1
       GROUP BY p.nombre`,
      [roleId]
    );

  const nombresPermisos = new Set(
    permisos.map(fila => fila.permiso)
  );
  const esAdministrador =
    nombresPermisos.has('roles.administrar');
  const puedeConsultarTodas =
    esAdministrador ||
    nombresPermisos.has('servicios.crear') ||
    nombresPermisos.has('servicios.editar');

  const esMecanicoAsignado =
    orden.mecanicoId === usuarioId;

  if (!puedeConsultarTodas && !esMecanicoAsignado) {
    throw new Error('ORDEN_SIN_PERMISO');
  }

  return {
    orden,
    esAdministrador
  };
}

// ========================================
// VALIDAR ESTADO PARA MODIFICAR ORDEN
// ========================================

function validarOrdenEditable(estado: string) {
  if (
    estado !== 'EN_PROCESO' &&
    estado !== 'PAUSADO'
  ) {
    throw new Error('ORDEN_NO_EDITABLE');
  }
}

// ========================================
// CALCULAR TOTALES DE UNA ORDEN
// ========================================

async function calcularTotalesOrden(
  conexion: PoolConnection,
  ordenId: string
) {
  const [filas] =
    await conexion.execute<TotalesDB[]>(
      `SELECT

         COALESCE(
           (
             SELECT SUM(sd.precioAplicado)
             FROM servicios_detalles sd
             WHERE sd.servicioId = ?
               AND sd.estado <> 'CANCELADO'
           ), 0
         ) AS totalManoObra,

         COALESCE(
           (
             SELECT SUM(
               sr.cantidad *
               sr.precioUnitarioVenta
             )
             FROM servicio_repuestos sr
             WHERE sr.servicioId = ?
           ), 0
         ) AS totalRepuestos,

         COALESCE(
           (
             SELECT SUM(
               sr.cantidad *
               sr.costoUnitarioPMP
             )
             FROM servicio_repuestos sr
             WHERE sr.servicioId = ?
           ), 0
         ) AS totalCostoPMP,

         (
           SELECT COUNT(*)
           FROM servicio_repuestos sr
           WHERE sr.servicioId = ?
             AND sr.precioUnitarioVenta IS NULL
         ) AS repuestosSinPrecio`,

      [
        ordenId,
        ordenId,
        ordenId,
        ordenId
      ]
    );

  const fila = filas[0];

  // No inventar precios históricos para
  // repuestos registrados antes de la integración.
  if (Number(fila.repuestosSinPrecio) > 0) {
    throw new Error(
      'REPUESTOS_SIN_PRECIO_HISTORICO'
    );
  }

  const totalManoObra =
    validarPrecio(fila.totalManoObra);

  const totalRepuestos =
    validarPrecio(fila.totalRepuestos);

  const totalCostoPMP =
    Number(fila.totalCostoPMP);

  const totalCentavos =
    Math.round(totalManoObra * 100) +
    Math.round(totalRepuestos * 100);

  const total = totalCentavos / 100;

  if (
    !Number.isSafeInteger(totalCentavos) ||
    total > MAX_DINERO
  ) {
    throw new Error('TOTAL_ORDEN_INVALIDO');
  }

  return {
    totalManoObra,
    totalRepuestos,
    totalCostoPMP,
    total
  };
}

// ========================================
// ACTUALIZAR TOTAL DE LA ORDEN
// ========================================

async function actualizarTotalOrden(
  conexion: PoolConnection,
  ordenId: string
) {
  const totales =
    await calcularTotalesOrden(
      conexion,
      ordenId
    );

  await conexion.execute(
    `UPDATE servicios
     SET costo = ?
     WHERE id = ?`,
    [
      totales.total.toFixed(2),
      ordenId
    ]
  );

  return totales;
}

// ========================================
// PROTEGER ÓRDENES ANTIGUAS
// ========================================

async function validarTotalAnterior(
  conexion: PoolConnection,
  orden: OrdenEstadoDB
) {
  const totales = await calcularTotalesOrden(
    conexion,
    orden.id
  );

  // Evitar reemplazar un valor antiguo
  // que todavía no está desglosado.
  if (
    Math.round(Number(orden.costo) * 100) !==
    Math.round(totales.total * 100)
  ) {
    throw new Error(
      'ORDEN_REQUIERE_REVISION_TOTAL'
    );
  }
}

// ========================================
// INICIAR ORDEN DESDE UNA CITA
// ========================================

export async function iniciarOrdenDesdeCita(
  citaId: string,
  usuarioId: string
) {
  if (!UUID.test(usuarioId)) {
    throw new Error('ORDEN_SIN_PERMISO');
  }

  if (!UUID.test(citaId)) {
    throw new Error('CITA_ID_INVALIDO');
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // 1. Bloquear la cita.

    const [citas] =
      await conexion.execute<CitaDB[]>(
        `SELECT
           id,
           motoId,
           mecanicoId,
           DATE_FORMAT(
             fecha,
             '%Y-%m-%d'
           ) AS fecha,
           tipoServicio,
           descripcion,
           estado
         FROM citas
         WHERE id = ?
         FOR UPDATE`,
        [citaId]
      );

    if (citas.length === 0) {
      throw new Error('CITA_NO_EXISTE');
    }

    const cita = citas[0];

    if (
      cita.estado !== 'PENDIENTE' &&
      cita.estado !== 'CONFIRMADA'
    ) {
      throw new Error(
        'ESTADO_CITA_INVALIDO'
      );
    }

    if (cita.fecha > hoyColombia()) {
      throw new Error('CITA_FUTURA');
    }

    // 2. Evitar órdenes duplicadas.

    const [ordenes] =
      await conexion.execute<OrdenDB[]>(
        `SELECT id
         FROM servicios
         WHERE citaId = ?
         LIMIT 1`,
        [citaId]
      );

    if (ordenes.length > 0) {
      throw new Error('ORDEN_YA_EXISTE');
    }

    // ========================================
    // 3. BUSCAR SERVICIO DEL CATÁLOGO
    // ========================================

    const [catalogo] =
      await conexion.execute<CatalogoDB[]>(
        `SELECT
           id,
           nombre,
           descripcion,
           precioManoObra
         FROM catalogo_servicios
         WHERE nombre = ?
           AND activo = 1
         LIMIT 2
         FOR UPDATE`,
        [cita.tipoServicio.trim()]
      );

    if (catalogo.length === 0) {
      throw new Error(
        'SERVICIO_CATALOGO_NO_EXISTE'
      );
    }

    if (catalogo.length > 1) {
      throw new Error(
        'SERVICIO_CATALOGO_AMBIGUO'
      );
    }

    const tipoServicio = catalogo[0];

    const precioManoObra = validarPrecio(
      tipoServicio.precioManoObra
    );

    // ========================================
    // 4. CREAR ORDEN DE TRABAJO
    // ========================================

    const ordenId = randomUUID();

    const descripcion = [
      cita.tipoServicio,
      cita.descripcion?.trim()
    ].filter(Boolean).join(' - ');

    await conexion.execute(
      `INSERT INTO servicios (
         id,
         citaId,
         motoId,
         mecanicoId,
         descripcion,
         estado,
         tiempoInicio,
         costo
       )
       VALUES (
         ?, ?, ?, ?, ?,
         'EN_PROCESO',
         NOW(),
         ?
       )`,
      [
        ordenId,
        cita.id,
        cita.motoId,
        cita.mecanicoId,
        descripcion,
        precioManoObra.toFixed(2)
      ]
    );

    // ========================================
    // 5. REGISTRAR MANO DE OBRA INICIAL
    // ========================================

    await conexion.execute(
      `INSERT INTO servicios_detalles (
         id,
         servicioId,
         catalogoServicioId,
         descripcion,
         precioAplicado,
         estado
       )
       VALUES (
         ?, ?, ?, ?, ?,
         'EN_PROCESO'
       )`,
      [
        randomUUID(),
        ordenId,
        tipoServicio.id,
        descripcion,
        precioManoObra.toFixed(2)
      ]
    );

    // Registrar el intervalo inicial con la misma fecha de la orden.
    await conexion.execute(
      `INSERT INTO servicios_tiempos (id, servicioId, inicio, creadoPorId)
       SELECT ?, id, tiempoInicio, ? FROM servicios WHERE id = ?`,
      [randomUUID(), usuarioId, ordenId]
    );
    await conexion.execute(
      `UPDATE servicios SET tiempoTrabajo = 0.00 WHERE id = ?`,
      [ordenId]
    );

    // ========================================
    // 6. ACTUALIZAR CITA
    // ========================================

    await conexion.execute(
      `UPDATE citas
       SET estado = 'EN_PROCESO'
       WHERE id = ?`,
      [cita.id]
    );

    await conexion.commit();

    return {
      id: ordenId,
      citaId: cita.id,
      motoId: cita.motoId,
      mecanicoId: cita.mecanicoId,
      descripcion,
      estado: 'EN_PROCESO',
      costo: precioManoObra,
      totalManoObra: precioManoObra,
      totalRepuestos: 0,
      tiempoTrabajo: 0
    };

  } catch (error) {
    await conexion.rollback();
    throw error;

  } finally {
    conexion.release();
  }
}

// ========================================
// CONSULTAR ÓRDENES SEGÚN EL USUARIO
// ========================================

export async function obtenerOrdenesTrabajo(
  usuarioId: string,
  roleId: string
) {
  const [permisos] =
    await pool.execute<PermisoOrdenDB[]>(
      `SELECT p.nombre AS permiso
       FROM roles_permisos rp
       INNER JOIN permisos p
         ON p.id = rp.permisoId
       INNER JOIN roles r
         ON r.id = rp.roleId
       WHERE rp.roleId = ?
         AND r.activo = 1
         AND p.nombre IN (
           'roles.administrar',
           'servicios.crear',
           'servicios.editar'
         )
       GROUP BY p.nombre`,
      [roleId]
    );

  const puedeConsultarTodas = permisos.some(
    permiso =>
      permiso.permiso === 'roles.administrar' ||
      permiso.permiso === 'servicios.crear' ||
      permiso.permiso === 'servicios.editar'
  );

  const [filas] =
    await pool.execute<RowDataPacket[]>(
      `SELECT
         s.id,
         s.citaId,
         s.motoId,
         s.mecanicoId,
         s.descripcion,
         s.estado,
         s.tiempoInicio,
         s.tiempoFin,
         s.tiempoTrabajo,
         s.costo,
         s.created,

         c.tipoServicio,

         DATE_FORMAT(
           c.fecha,
           '%Y-%m-%d'
         ) AS fechaCita,

         cl.nombre AS clienteNombre,
         m.placa AS motoPlaca,
         m.marca AS motoMarca,
         m.modelo AS motoModelo,
         u.name AS mecanicoNombre

       FROM servicios s

       LEFT JOIN citas c
         ON c.id = s.citaId

       INNER JOIN motos m
         ON m.id = s.motoId

       LEFT JOIN clientes cl
         ON cl.id = m.clienteId

       INNER JOIN users u
         ON u.id = s.mecanicoId

       WHERE s.mecanicoId = ?
         OR ? = 1

       ORDER BY s.created DESC
       LIMIT 500`,
      [usuarioId, puedeConsultarTodas ? 1 : 0]
    );

  return filas;
}

// ========================================
// CONSULTAR DETALLE COMPLETO DE UNA ORDEN
// ========================================

export async function obtenerDetalleOrden(
  ordenId: string,
  usuarioId: string,
  roleId: string
) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const { orden, esAdministrador } =
      await obtenerOrdenAutorizada(
        conexion,
        ordenId,
        usuarioId,
        roleId
      );

    // 1. Consultar trabajos de mano de obra.

    const [trabajos] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           sd.id,
           sd.catalogoServicioId,
           cs.nombre AS servicioNombre,
           sd.descripcion,
           sd.precioAplicado,
           sd.estado,
           sd.created

         FROM servicios_detalles sd

         INNER JOIN catalogo_servicios cs
           ON cs.id = sd.catalogoServicioId

         WHERE sd.servicioId = ?

         ORDER BY sd.created ASC, sd.id ASC`,
        [ordenId]
      );

    // 2. Consultar repuestos utilizados.
    // Los costos internos solo se muestran
    // a los administradores.

    const [repuestos] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           sr.id,
           sr.repuestoId,
           r.nombre AS repuestoNombre,
           sr.cantidad,
           sr.precioUnitarioVenta,

           (
             sr.cantidad *
             sr.precioUnitarioVenta
           ) AS subtotal,

           ${
             esAdministrador
               ? 'sr.costoUnitarioPMP,'
               : ''
           }

           sr.created

         FROM servicio_repuestos sr

         INNER JOIN repuestos r
           ON r.id = sr.repuestoId

         WHERE sr.servicioId = ?

         ORDER BY sr.created ASC, sr.id ASC`,
        [ordenId]
      );

    // Historial y duración exacta en segundos (incluye intervalo activo).
    const [intervalos] = await conexion.execute<RowDataPacket[]>(
      `SELECT id, inicio, fin, motivoFin, creadoPorId, cerradoPorId,
              TIMESTAMPDIFF(SECOND, inicio, COALESCE(fin, NOW())) AS duracionSegundos
       FROM servicios_tiempos WHERE servicioId = ? ORDER BY inicio, id`,
      [ordenId]
    );
    const tiempoEfectivoSegundos = intervalos.length
      ? intervalos.reduce((total, intervalo) => total + Number(intervalo.duracionSegundos), 0)
      : null;

    // 3. Consultar totales.

    const totales =
      await calcularTotalesOrden(
        conexion,
        ordenId
      );

    await conexion.commit();

    return {
      ordenId: orden.id,
      estado: orden.estado,
      costo: Number(orden.costo),

      trabajos,
      repuestos,
      intervalos,
      tiempoEfectivoSegundos,

      totales: {
        totalManoObra:
          totales.totalManoObra,

        totalRepuestos:
          totales.totalRepuestos,

        total: totales.total,

        ...(esAdministrador
          ? {
              totalCostoPMP:
                totales.totalCostoPMP
            }
          : {})
      }
    };

  } catch (error) {
    await conexion.rollback();
    throw error;

  } finally {
    conexion.release();
  }
}

// ========================================
// AGREGAR TRABAJO ADICIONAL A UNA ORDEN
// ========================================

export async function agregarTrabajoOrden(
  ordenId: string,
  catalogoServicioId: string,
  usuarioId: string,
  roleId: string
) {
  if (!UUID.test(catalogoServicioId)) {
    throw new Error(
      'SERVICIO_CATALOGO_ID_INVALIDO'
    );
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const { orden } =
      await obtenerOrdenAutorizada(
        conexion,
        ordenId,
        usuarioId,
        roleId
      );

    validarOrdenEditable(orden.estado);

    await validarTotalAnterior(
      conexion,
      orden
    );

    // Consultar el servicio y su precio.

    const [catalogo] =
      await conexion.execute<CatalogoDB[]>(
        `SELECT
           id,
           nombre,
           descripcion,
           precioManoObra
         FROM catalogo_servicios
         WHERE id = ?
           AND activo = 1
         FOR UPDATE`,
        [catalogoServicioId]
      );

    if (catalogo.length === 0) {
      throw new Error(
        'SERVICIO_CATALOGO_NO_EXISTE'
      );
    }

    const servicio = catalogo[0];

    // Evitar repetir accidentalmente un trabajo
    // que ya está registrado y no fue cancelado.

    const [existentes] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT id
         FROM servicios_detalles
         WHERE servicioId = ?
           AND catalogoServicioId = ?
           AND estado <> 'CANCELADO'
         LIMIT 1`,
        [
          ordenId,
          catalogoServicioId
        ]
      );

    if (existentes.length > 0) {
      throw new Error(
        'TRABAJO_YA_REGISTRADO'
      );
    }

    const precio = validarPrecio(
      servicio.precioManoObra
    );

    const detalleId = randomUUID();

    await conexion.execute(
      `INSERT INTO servicios_detalles (
         id,
         servicioId,
         catalogoServicioId,
         descripcion,
         precioAplicado,
         estado
       )
       VALUES (
         ?, ?, ?, ?, ?,
         'PENDIENTE'
       )`,
      [
        detalleId,
        ordenId,
        servicio.id,
        servicio.nombre,
        precio.toFixed(2)
      ]
    );

    const totales =
      await actualizarTotalOrden(
        conexion,
        ordenId
      );

    await conexion.commit();

    return {
      id: detalleId,
      ordenId,
      catalogoServicioId: servicio.id,
      servicioNombre: servicio.nombre,
      precioAplicado: precio,
      estado: 'PENDIENTE',

      totales: {
        totalManoObra:
          totales.totalManoObra,

        totalRepuestos:
          totales.totalRepuestos,

        total: totales.total
      }
    };

  } catch (error) {
    await conexion.rollback();
    throw error;

  } finally {
    conexion.release();
  }
}

// ========================================
// AGREGAR REPUESTO UTILIZADO A UNA ORDEN
// ========================================

export async function agregarRepuestoOrden(
  ordenId: string,
  datos: DatosRepuestoOrden,
  usuarioId: string,
  roleId: string
) {
  if (!UUID.test(datos.repuestoId)) {
    throw new Error('REPUESTO_ID_INVALIDO');
  }

  if (!UUID.test(datos.solicitudId)) {
    throw new Error('SOLICITUD_ID_INVALIDO');
  }

  if (
    !Number.isInteger(datos.cantidad) ||
    datos.cantidad <= 0 ||
    datos.cantidad > MAX_CANTIDAD
  ) {
    throw new Error('CANTIDAD_INVALIDA');
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // ========================================
    // 1. BLOQUEAR Y AUTORIZAR LA ORDEN
    // ========================================

    const { orden } =
      await obtenerOrdenAutorizada(
        conexion,
        ordenId,
        usuarioId,
        roleId
      );

    // ========================================
    // 2. EVITAR PROCESAR DOS VECES
    //    LA MISMA SOLICITUD
    // ========================================

    const [existentes] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           id,
           servicioId,
           repuestoId,
           cantidad,
           precioUnitarioVenta
         FROM servicio_repuestos
         WHERE id = ?
         LIMIT 1`,
        [datos.solicitudId]
      );

    if (existentes.length > 0) {
      const existente = existentes[0];

      if (
        existente.servicioId !== ordenId ||
        existente.repuestoId !== datos.repuestoId ||
        Number(existente.cantidad) !== datos.cantidad
      ) {
        throw new Error(
          'SOLICITUD_YA_UTILIZADA'
        );
      }

      const totales =
        await calcularTotalesOrden(
          conexion,
          ordenId
        );

      await conexion.commit();

      return {
        id: existente.id,
        ordenId,
        repuestoId: existente.repuestoId,
        cantidad: existente.cantidad,

        precioUnitarioVenta:
          Number(
            existente.precioUnitarioVenta
          ),

        yaRegistrado: true,

        totales: {
          totalManoObra:
            totales.totalManoObra,

          totalRepuestos:
            totales.totalRepuestos,

          total: totales.total
        }
      };
    }

    validarOrdenEditable(orden.estado);

    await validarTotalAnterior(
      conexion,
      orden
    );

    // ========================================
    // 3. BLOQUEAR EL REPUESTO
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

    if (
      !Number.isInteger(stockAnterior) ||
      stockAnterior < datos.cantidad
    ) {
      throw new Error('STOCK_INSUFICIENTE');
    }

    const costoUnitarioPMP = validarPrecio(
      repuesto.costoPromedioPMP,
      false
    );

    const precioUnitarioVenta = validarPrecio(
      repuesto.precioVenta,
      false
    );

    const subtotalCentavos =
      Math.round(
        precioUnitarioVenta * 100
      ) * datos.cantidad;

    if (
      !Number.isSafeInteger(
        subtotalCentavos
      ) ||
      subtotalCentavos / 100 > MAX_DINERO
    ) {
      throw new Error('TOTAL_ORDEN_INVALIDO');
    }

    const subtotal =
      subtotalCentavos / 100;

    const stockNuevo =
      stockAnterior - datos.cantidad;

    // ========================================
    // 4. REGISTRAR REPUESTO UTILIZADO
    // ========================================

    const detalleId = datos.solicitudId;

    await conexion.execute(
      `INSERT INTO servicio_repuestos (
         id,
         servicioId,
         repuestoId,
         cantidad,
         costoUnitarioPMP,
         precioUnitarioVenta
       )
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        detalleId,
        ordenId,
        repuesto.id,
        datos.cantidad,
        costoUnitarioPMP.toFixed(2),
        precioUnitarioVenta.toFixed(2)
      ]
    );

    // ========================================
    // 5. DESCONTAR EXISTENCIAS
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

    // El PMP y el precio del catálogo
    // permanecen sin cambios.

    // ========================================
    // 6. REGISTRAR SALIDA EN KARDEX
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
         ?, ?,
         'SALIDA_SERVICIO_MECANICO',
         ?, ?, ?, ?, ?, ?, ?, ?
       )`,
      [
        randomUUID(),
        repuesto.id,
        datos.cantidad,
        costoUnitarioPMP.toFixed(2),
        costoUnitarioPMP.toFixed(2),
        stockAnterior,
        stockNuevo,
        detalleId,
        usuarioId,
        `Consumo de repuesto en orden ${ordenId}`
      ]
    );

    // ========================================
    // 7. RECALCULAR TOTAL DE LA ORDEN
    // ========================================

    const totales =
      await actualizarTotalOrden(
        conexion,
        ordenId
      );

    // ========================================
    // 8. CONFIRMAR TRANSACCIÓN
    // ========================================

    await conexion.commit();

    return {
      id: detalleId,
      ordenId,

      repuestoId: repuesto.id,
      repuestoNombre: repuesto.nombre,

      cantidad: datos.cantidad,
      precioUnitarioVenta,
      subtotal,

      stockAnterior,
      stockNuevo,

      yaRegistrado: false,

      totales: {
        totalManoObra:
          totales.totalManoObra,

        totalRepuestos:
          totales.totalRepuestos,

        total: totales.total
      }
    };

  } catch (error) {
    await conexion.rollback();
    throw error;

  } finally {
    conexion.release();
  }
}

// ========================================
// CONTROL DE INTERVALOS DE TRABAJO
// ========================================

// Todas estas funciones se ejecutan con la orden bloqueada FOR UPDATE.
async function verificarIntervalos(
  conexion: PoolConnection,
  ordenId: string,
  estado: string
) {
  const [filas] = await conexion.execute<RowDataPacket[]>(
    `SELECT id, fin IS NULL AS abierto
     FROM servicios_tiempos
     WHERE servicioId = ? FOR UPDATE`,
    [ordenId]
  );
  const abiertos = filas.filter(fila => Number(fila.abierto) === 1);
  if (!filas.length || abiertos.length !== (estado === 'EN_PROCESO' ? 1 : 0)) {
    throw new Error('TIEMPOS_INCONSISTENTES');
  }
  return abiertos;
}

async function cerrarIntervalo(
  conexion: PoolConnection,
  intervaloId: string,
  usuarioId: string,
  motivo: 'PAUSA' | 'FINALIZACION'
) {
  await conexion.execute(
    `UPDATE servicios_tiempos
     SET fin = NOW(), motivoFin = ?, cerradoPorId = ?
     WHERE id = ? AND fin IS NULL`,
    [motivo, usuarioId, intervaloId]
  );
}

async function actualizarTiempoTrabajo(
  conexion: PoolConnection,
  ordenId: string
) {
  // Sumar segundos antes de redondear evita acumular errores de redondeo.
  const [filas] = await conexion.execute<RowDataPacket[]>(
    `SELECT ROUND(COALESCE(SUM(TIMESTAMPDIFF(SECOND, inicio, fin)), 0) / 3600, 2) AS horas
     FROM servicios_tiempos WHERE servicioId = ? AND fin IS NOT NULL`,
    [ordenId]
  );
  const horas = Number(filas[0].horas);
  if (!Number.isFinite(horas) || horas < 0 || horas > 999999.99) {
    throw new Error('TIEMPOS_INCONSISTENTES');
  }
  await conexion.execute(
    `UPDATE servicios SET tiempoTrabajo = ? WHERE id = ?`,
    [horas.toFixed(2), ordenId]
  );
  return horas;
}

// ========================================
// PAUSAR Y REANUDAR ÓRDENES DE TRABAJO
// ========================================

export async function cambiarEstadoOrden(
  ordenId: string,
  nuevoEstado: 'PAUSADO' | 'EN_PROCESO',
  usuarioId: string,
  roleId: string
) {
  if (!UUID.test(ordenId)) {
    throw new Error('ORDEN_ID_INVALIDO');
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const { orden } =
      await obtenerOrdenAutorizada(
        conexion,
        ordenId,
        usuarioId,
        roleId
      );

    // Conservar las transiciones anteriores.

    const transicionValida =
      (
        orden.estado === 'EN_PROCESO' &&
        nuevoEstado === 'PAUSADO'
      ) ||
      (
        orden.estado === 'PAUSADO' &&
        nuevoEstado === 'EN_PROCESO'
      );

    if (!transicionValida) {
      throw new Error(
        'TRANSICION_INVALIDA'
      );
    }

    const abiertos = await verificarIntervalos(conexion, ordenId, orden.estado);

    if (nuevoEstado === 'PAUSADO') {
      await cerrarIntervalo(conexion, abiertos[0].id, usuarioId, 'PAUSA');
    } else {
      await conexion.execute(
        `INSERT INTO servicios_tiempos (id, servicioId, inicio, creadoPorId)
         VALUES (?, ?, NOW(), ?)`,
        [randomUUID(), ordenId, usuarioId]
      );
    }

    const tiempoTrabajo = await actualizarTiempoTrabajo(conexion, ordenId);

    await conexion.execute(
      `UPDATE servicios
       SET estado = ?
       WHERE id = ?`,
      [
        nuevoEstado,
        ordenId
      ]
    );

    await conexion.commit();

    return {
      id: ordenId,
      estado: nuevoEstado,
      tiempoTrabajo
    };

  } catch (error) {
    await conexion.rollback();
    throw error;

  } finally {
    conexion.release();
  }
}

// ========================================
// FINALIZAR ORDEN DE TRABAJO
// ========================================

export async function finalizarOrdenTrabajo(
  ordenId: string,
  usuarioId: string,
  roleId: string
) {
  if (!UUID.test(ordenId)) {
    throw new Error('ORDEN_ID_INVALIDO');
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // 1. Buscar, bloquear y autorizar la orden.

    const { orden } =
      await obtenerOrdenAutorizada(
        conexion,
        ordenId,
        usuarioId,
        roleId
      );

    // 2. Verificar estado.

    if (
      orden.estado !== 'EN_PROCESO' &&
      orden.estado !== 'PAUSADO'
    ) {
      throw new Error(
        'ORDEN_NO_FINALIZABLE'
      );
    }

    // 3. Comprobar que existan trabajos
    // registrados y no cancelados.

    const [trabajos] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT id
         FROM servicios_detalles
         WHERE servicioId = ?
           AND estado <> 'CANCELADO'
         FOR UPDATE`,
        [ordenId]
      );

    if (trabajos.length === 0) {
      throw new Error(
        'ORDEN_SIN_TRABAJOS'
      );
    }

    // 4. Verificar que el total anterior
    // coincida con sus detalles.

    await validarTotalAnterior(
      conexion,
      orden
    );

    // 5. Recalcular el total definitivo.

    const totales =
      await actualizarTotalOrden(
        conexion,
        ordenId
      );

    // 6. Completar los trabajos activos.

    await conexion.execute(
      `UPDATE servicios_detalles
       SET estado = 'COMPLETADO'
       WHERE servicioId = ?
         AND estado IN (
           'PENDIENTE',
           'EN_PROCESO'
         )`,
      [ordenId]
    );

    // Cerrar el intervalo activo, si existe. Una orden pausada no acumula más tiempo.
    const abiertos = await verificarIntervalos(conexion, ordenId, orden.estado);
    if (orden.estado === 'EN_PROCESO') {
      await cerrarIntervalo(conexion, abiertos[0].id, usuarioId, 'FINALIZACION');
    }
    await actualizarTiempoTrabajo(conexion, ordenId);

    // 7. Finalizar la orden.

    await conexion.execute(
      `UPDATE servicios
       SET
         estado = 'COMPLETADO',
         tiempoFin = NOW()
       WHERE id = ?`,
      [ordenId]
    );

    // 7.1. Generar comisiones dentro de la transacción actual.
    // Ante cualquier fallo se revierte la finalización completa.
    const comisiones = await generarComisionesOrden(
      conexion,
      ordenId,
      orden.mecanicoId,
      trabajos.length
    );

// 7.2. Finalizar la cita asociada.

await conexion.execute(
  `UPDATE citas c
   INNER JOIN servicios s
     ON s.citaId = c.id
   SET c.estado = 'FINALIZADA'
   WHERE s.id = ?
     AND c.estado = 'EN_PROCESO'`,
  [ordenId]
);

    // 8. Obtener fecha de finalización.

    const [resultado] =
      await conexion.execute<RowDataPacket[]>(
        `SELECT
           id,
           estado,
           tiempoInicio,
           tiempoFin,
           tiempoTrabajo,
           costo
         FROM servicios
         WHERE id = ?`,
        [ordenId]
      );

    await conexion.commit();

    return {
      ...resultado[0],
      comisiones,

      totales: {
        totalManoObra:
          totales.totalManoObra,

        totalRepuestos:
          totales.totalRepuestos,

        total: totales.total
      }
    };

  } catch (error) {
    await conexion.rollback();
    throw error;

  } finally {
    conexion.release();
  }
}
