
import type { Request, Response } from 'express';

import {
  iniciarOrdenDesdeCita,
  obtenerOrdenesTrabajo,
  cambiarEstadoOrden,
  obtenerDetalleOrden,
  agregarTrabajoOrden,
  agregarRepuestoOrden,
  finalizarOrdenTrabajo
} from '../services/ordenes.service.js';

// ========================================
// INTERFACES
// ========================================

interface UsuarioAutenticado {
  id: string;
  roleId: string;
}

interface ErrorOrden {
  codigo: number;
  mensaje: string;
}

// ========================================
// OBTENER USUARIO AUTENTICADO
// ========================================

function obtenerUsuario(
  res: Response
): UsuarioAutenticado | null {

  const usuario = res.locals.usuario as
    | UsuarioAutenticado
    | undefined;

  if (
    !usuario ||
    typeof usuario.id !== 'string' ||
    typeof usuario.roleId !== 'string'
  ) {
    res.status(401).json({
      mensaje: 'Debes iniciar sesión'
    });

    return null;
  }

  return usuario;
}

// ========================================
// MENSAJES DE ERROR
// ========================================

const erroresOrden: Record<string, ErrorOrden> = {

  // ERRORES DE CITAS

  CITA_ID_INVALIDO: {
    codigo: 400,
    mensaje:
      'El identificador de la cita es inválido'
  },

  CITA_NO_EXISTE: {
    codigo: 404,
    mensaje:
      'La cita no existe'
  },

  ESTADO_CITA_INVALIDO: {
    codigo: 409,
    mensaje:
      'Esta cita no se puede iniciar en su estado actual'
  },

  CITA_FUTURA: {
    codigo: 400,
    mensaje:
      'La cita está programada para una fecha futura'
  },

  ORDEN_YA_EXISTE: {
    codigo: 409,
    mensaje:
      'Esta cita ya tiene una orden de servicio'
  },

  // ERRORES DE ÓRDENES

  ORDEN_ID_INVALIDO: {
    codigo: 400,
    mensaje:
      'El identificador de la orden es inválido'
  },

  ORDEN_NO_EXISTE: {
    codigo: 404,
    mensaje:
      'La orden de trabajo no existe'
  },

  ORDEN_SIN_PERMISO: {
    codigo: 403,
    mensaje:
      'No tienes permiso para acceder o modificar esta orden'
  },

  ORDEN_NO_EDITABLE: {
    codigo: 409,
    mensaje:
      'Esta orden no permite agregar trabajos o repuestos en su estado actual'
  },

  ESTADO_INVALIDO: {
    codigo: 400,
    mensaje:
      'El estado de la orden es inválido'
  },

  TRANSICION_INVALIDA: {
    codigo: 409,
    mensaje:
      'La orden ya cambió de estado o no admite esta acción'
  },

  // ERRORES DE MANO DE OBRA

  SERVICIO_CATALOGO_ID_INVALIDO: {
    codigo: 400,
    mensaje:
      'Debes seleccionar un servicio válido del catálogo'
  },

  SERVICIO_CATALOGO_NO_EXISTE: {
    codigo: 404,
    mensaje:
      'El tipo de servicio no existe o no está activo en el catálogo'
  },

  SERVICIO_CATALOGO_AMBIGUO: {
    codigo: 409,
    mensaje:
      'Existen varios servicios con el mismo nombre. Revisa el catálogo de servicios'
  },

  TRABAJO_YA_REGISTRADO: {
    codigo: 409,
    mensaje:
      'Este trabajo ya está registrado en la orden'
  },

  // ERRORES DE REPUESTOS

  REPUESTO_ID_INVALIDO: {
    codigo: 400,
    mensaje:
      'Debes seleccionar un repuesto válido'
  },

  REPUESTO_NO_EXISTE: {
    codigo: 404,
    mensaje:
      'El repuesto seleccionado no existe'
  },

  CANTIDAD_INVALIDA: {
    codigo: 400,
    mensaje:
      'La cantidad debe ser un número entero mayor que cero'
  },

  STOCK_INSUFICIENTE: {
    codigo: 409,
    mensaje:
      'No hay existencias suficientes para utilizar este repuesto'
  },

  SOLICITUD_ID_INVALIDO: {
    codigo: 400,
    mensaje:
      'El identificador de la solicitud es inválido'
  },

  SOLICITUD_YA_UTILIZADA: {
    codigo: 409,
    mensaje:
      'Esta solicitud ya fue utilizada para otro consumo de inventario'
  },

  // ERRORES DE PRECIOS Y TOTALES

  PRECIO_INVALIDO: {
    codigo: 409,
    mensaje:
      'El precio o costo del servicio o repuesto no es válido. Revisa el catálogo correspondiente'
  },

  TOTAL_ORDEN_INVALIDO: {
    codigo: 409,
    mensaje:
      'El total de la orden supera el valor permitido'
  },

  REPUESTOS_SIN_PRECIO_HISTORICO: {
    codigo: 409,
    mensaje:
      'Esta orden contiene repuestos antiguos sin precio de venta registrado. Debe revisarse antes de continuar'
  },

  ORDEN_REQUIERE_REVISION_TOTAL: {
    codigo: 409,
    mensaje:
      'El total registrado en esta orden no coincide con sus detalles. Debe revisarse antes de modificarla'
  },

  // ERRORES DE CONTROL DE TIEMPOS

  TIEMPOS_INCONSISTENTES: {
    codigo: 409,
    mensaje:
      'El historial de tiempos de esta orden no es consistente. Revisa sus intervalos antes de continuar'
  },

  // ERRORES DE FINALIZACIÓN

  ORDEN_NO_FINALIZABLE: {
    codigo: 409,
    mensaje:
      'Esta orden no se puede finalizar en su estado actual'
  },

  ORDEN_SIN_TRABAJOS: {
    codigo: 409,
    mensaje:
      'Debes registrar al menos un trabajo antes de finalizar la orden'
  }
};

// ========================================
// MANEJO CENTRALIZADO DE ERRORES
// ========================================

function responderErrorOrden(
  error: unknown,
  res: Response,
  contexto: string,
  mensajeGeneral: string
) {

  if (
    error instanceof Error &&
    Object.prototype.hasOwnProperty.call(
      erroresOrden,
      error.message
    )
  ) {
    const detalle =
      erroresOrden[error.message];

    res.status(detalle.codigo).json({
      mensaje: detalle.mensaje,
      codigo: error.message
    });

    return;
  }

  console.error(contexto, error);

  res.status(500).json({
    mensaje: mensajeGeneral
  });
}

// ========================================
// INICIAR ORDEN DESDE UNA CITA
// ========================================

export async function iniciarOrden(
  req: Request,
  res: Response
) {

  const usuario = obtenerUsuario(res);

  if (!usuario) {
    return;
  }

  const citaId = req.params.citaId;

  if (typeof citaId !== 'string') {
    res.status(400).json({
      mensaje: 'Debes indicar una cita válida'
    });

    return;
  }

  try {

    // NUEVO:
    // Enviar el usuario que inicia la orden
    // para registrar el primer intervalo.

    const orden =
      await iniciarOrdenDesdeCita(
        citaId,
        usuario.id
      );

    res.status(201).json({
      mensaje:
        'Orden de servicio iniciada correctamente',
      orden
    });

  } catch (error) {

    // El índice UNIQUE de citaId evita que
    // una cita tenga dos órdenes de trabajo.

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ER_DUP_ENTRY'
    ) {
      res.status(409).json({
        mensaje:
          'Esta cita ya tiene una orden de servicio'
      });

      return;
    }

    responderErrorOrden(
      error,
      res,
      'Error al iniciar orden:',
      'No fue posible iniciar la orden de servicio'
    );
  }
}

// ========================================
// LISTAR ÓRDENES SEGÚN EL USUARIO
// ========================================

export async function listarOrdenes(
  _req: Request,
  res: Response
) {

  const usuario = obtenerUsuario(res);

  if (!usuario) {
    return;
  }

  try {

    const ordenes =
      await obtenerOrdenesTrabajo(
        usuario.id,
        usuario.roleId
      );

    res.status(200).json(ordenes);

  } catch (error) {

    responderErrorOrden(
      error,
      res,
      'Error al consultar órdenes de trabajo:',
      'No fue posible consultar las órdenes de trabajo'
    );
  }
}

// ========================================
// CONSULTAR DETALLE DE UNA ORDEN
// ========================================

export async function consultarDetalleOrden(
  req: Request,
  res: Response
) {

  const usuario = obtenerUsuario(res);

  if (!usuario) {
    return;
  }

  const ordenId = req.params.id;

  if (typeof ordenId !== 'string') {
    res.status(400).json({
      mensaje:
        'El identificador de la orden es inválido'
    });

    return;
  }

  try {

    const detalle =
      await obtenerDetalleOrden(
        ordenId,
        usuario.id,
        usuario.roleId
      );

    res.status(200).json(detalle);

  } catch (error) {

    responderErrorOrden(
      error,
      res,
      'Error al consultar detalle de orden:',
      'No fue posible consultar el detalle de la orden'
    );
  }
}

// ========================================
// AGREGAR TRABAJO DE MANO DE OBRA
// ========================================

export async function agregarTrabajo(
  req: Request,
  res: Response
) {

  const usuario = obtenerUsuario(res);

  if (!usuario) {
    return;
  }

  const ordenId = req.params.id;

  const catalogoServicioId =
    req.body?.catalogoServicioId;

  // Validar identificador de la orden.

  if (typeof ordenId !== 'string') {
    res.status(400).json({
      mensaje:
        'El identificador de la orden es inválido'
    });

    return;
  }

  // Validar servicio seleccionado.

  if (
    typeof catalogoServicioId !== 'string' ||
    catalogoServicioId.trim() === ''
  ) {
    res.status(400).json({
      mensaje:
        'Debes seleccionar un trabajo del catálogo de servicios'
    });

    return;
  }

  try {

    // El servicio comprueba permisos,
    // estado de la orden y precio vigente.

    const trabajo =
      await agregarTrabajoOrden(
        ordenId,
        catalogoServicioId.trim(),
        usuario.id,
        usuario.roleId
      );

    res.status(201).json({
      mensaje:
        'Trabajo agregado correctamente a la orden',
      trabajo
    });

  } catch (error) {

    responderErrorOrden(
      error,
      res,
      'Error al agregar trabajo a la orden:',
      'No fue posible agregar el trabajo a la orden'
    );
  }
}

// ========================================
// REGISTRAR REPUESTO UTILIZADO
// ========================================

export async function agregarRepuesto(
  req: Request,
  res: Response
) {

  const usuario = obtenerUsuario(res);

  if (!usuario) {
    return;
  }

  const ordenId = req.params.id;

  const repuestoId =
    req.body?.repuestoId;

  const cantidad =
    req.body?.cantidad;

  const solicitudId =
    req.body?.solicitudId;

  // ========================================
  // VALIDAR ORDEN
  // ========================================

  if (typeof ordenId !== 'string') {
    res.status(400).json({
      mensaje:
        'El identificador de la orden es inválido'
    });

    return;
  }

  // ========================================
  // VALIDAR REPUESTO
  // ========================================

  if (
    typeof repuestoId !== 'string' ||
    repuestoId.trim() === ''
  ) {
    res.status(400).json({
      mensaje:
        'Debes seleccionar un repuesto válido'
    });

    return;
  }

  // ========================================
  // VALIDAR CANTIDAD
  // ========================================

  if (
    typeof cantidad !== 'number' ||
    !Number.isInteger(cantidad) ||
    cantidad <= 0
  ) {
    res.status(400).json({
      mensaje:
        'La cantidad debe ser un número entero mayor que cero'
    });

    return;
  }

  // ========================================
  // VALIDAR IDENTIFICADOR DE SOLICITUD
  // ========================================

  if (
    typeof solicitudId !== 'string' ||
    solicitudId.trim() === ''
  ) {
    res.status(400).json({
      mensaje:
        'El identificador de la solicitud es obligatorio'
    });

    return;
  }

  try {

    // El servicio se encarga de:
    // 1. Autorizar acceso a la orden.
    // 2. Validar existencias disponibles.
    // 3. Consultar precio y PMP vigentes.
    // 4. Registrar el repuesto utilizado.
    // 5. Descontar las existencias.
    // 6. Registrar la salida en Kardex.
    // 7. Actualizar el total de la orden.
    // 8. Evitar consumos duplicados.

    const repuesto =
      await agregarRepuestoOrden(
        ordenId,
        {
          repuestoId: repuestoId.trim(),
          cantidad,
          solicitudId: solicitudId.trim()
        },
        usuario.id,
        usuario.roleId
      );

    const codigoRespuesta =
      repuesto.yaRegistrado ? 200 : 201;

    res.status(codigoRespuesta).json({
      mensaje:
        repuesto.yaRegistrado
          ? 'Este consumo ya estaba registrado. No se descontaron existencias adicionales'
          : 'Repuesto registrado correctamente. Inventario y orden actualizados',

      repuesto
    });

  } catch (error) {

    responderErrorOrden(
      error,
      res,
      'Error al registrar repuesto en orden:',
      'No fue posible registrar el repuesto utilizado'
    );
  }
}

// ========================================
// PAUSAR O REANUDAR UNA ORDEN
// ========================================

export async function actualizarEstadoOrden(
  req: Request,
  res: Response
) {

  const usuario = obtenerUsuario(res);

  if (!usuario) {
    return;
  }

  const ordenId = req.params.id;

  const nuevoEstado = req.body?.estado;

  // Validar identificador.

  if (typeof ordenId !== 'string') {
    res.status(400).json({
      mensaje:
        'Identificador de orden inválido'
    });

    return;
  }

  // Conservar los estados implementados.

  if (
    nuevoEstado !== 'PAUSADO' &&
    nuevoEstado !== 'EN_PROCESO'
  ) {
    res.status(400).json({
      mensaje:
        'Solo se permite pausar o reanudar una orden'
    });

    return;
  }

  try {

    // El servicio ahora también registra
    // el cierre o inicio del intervalo.

    const orden =
      await cambiarEstadoOrden(
        ordenId,
        nuevoEstado,
        usuario.id,
        usuario.roleId
      );

    res.status(200).json({
      mensaje:
        nuevoEstado === 'PAUSADO'
          ? 'Orden pausada correctamente'
          : 'Orden reanudada correctamente',

      orden
    });

  } catch (error) {

    responderErrorOrden(
      error,
      res,
      'Error al actualizar estado de orden:',
      'No fue posible actualizar el estado de la orden'
    );
  }
}

// ========================================
// FINALIZAR ORDEN DE TRABAJO
// ========================================

export async function finalizarOrden(
  req: Request,
  res: Response
) {

  const usuario = obtenerUsuario(res);

  if (!usuario) {
    return;
  }

  const ordenId = req.params.id;

  if (typeof ordenId !== 'string') {
    res.status(400).json({
      mensaje:
        'El identificador de la orden es inválido'
    });

    return;
  }

  try {

    // El servicio finaliza la orden,
    // calcula el tiempo efectivo,
    // actualiza los trabajos y
    // sincroniza la cita asociada.

    const orden =
      await finalizarOrdenTrabajo(
        ordenId,
        usuario.id,
        usuario.roleId
      );

    res.status(200).json({
      mensaje:
        'Orden de trabajo finalizada correctamente',
      orden
    });

  } catch (error) {

    responderErrorOrden(
      error,
      res,
      'Error al finalizar orden:',
      'No fue posible finalizar la orden de trabajo'
    );
  }
}
