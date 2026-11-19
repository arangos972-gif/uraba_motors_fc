
import type { Request, Response } from 'express';

import {
  registrarDevolucion,
  obtenerDevoluciones,
  obtenerVentasDevolvibles,
  obtenerComprasDevolvibles
} from '../services/devoluciones.service.js';

// ========================================
// MANEJO DE ERRORES
// ========================================

function responderError(
  error: unknown,
  res: Response
) {
  const mensajes: Record<string, string> = {

    TIPO_INVALIDO:
      'Selecciona un tipo de devolución válido',

    ORIGEN_INVALIDO:
      'La operación original no es válida',

    USUARIO_INVALIDO:
      'El usuario autenticado no es válido',

    CANTIDAD_INVALIDA:
      'La cantidad debe ser un número entero mayor a cero',

    MOTIVO_INVALIDO:
      'El motivo debe tener entre 5 y 200 caracteres',

    ORIGEN_NO_EXISTE:
      'La compra o venta original no existe',

    DEVOLUCION_EXCEDIDA:
      'La cantidad supera las unidades pendientes de devolución',

    COSTO_ORIGINAL_NO_EXISTE:
      'No se encontró un costo original válido para esta operación',

    REPUESTO_NO_EXISTE:
      'El repuesto seleccionado no existe',

    INVENTARIO_INCONSISTENTE:
      'El inventario presenta inconsistencias que deben revisarse',

    STOCK_INSUFICIENTE:
      'No hay suficientes unidades para devolver al proveedor',

    STOCK_MAXIMO_SUPERADO:
      'Se supera el límite de existencias permitido',

    TOTAL_INVALIDO:
      'El importe de la devolución supera el límite permitido',

    VALOR_INVENTARIO_INVALIDO:
      'La devolución produciría una valoración de inventario incorrecta. Requiere revisión contable',

    VALOR_RESIDUAL:
      'La devolución dejaría un valor de inventario sin existencias. Requiere revisión contable',

    PRECIO_INVALIDO:
      'El nuevo precio calculado supera el límite permitido'
  };

  if (
    error instanceof Error &&
    mensajes[error.message]
  ) {

    let estado = 400;

    if (
      error.message === 'ORIGEN_NO_EXISTE' ||
      error.message === 'REPUESTO_NO_EXISTE'
    ) {
      estado = 404;
    }

    if (
      error.message === 'DEVOLUCION_EXCEDIDA' ||
      error.message === 'STOCK_INSUFICIENTE' ||
      error.message === 'INVENTARIO_INCONSISTENTE' ||
      error.message === 'COSTO_ORIGINAL_NO_EXISTE' ||
      error.message === 'VALOR_INVENTARIO_INVALIDO' ||
      error.message === 'VALOR_RESIDUAL'
    ) {
      estado = 409;
    }

    res.status(estado).json({
      mensaje: mensajes[error.message]
    });

    return;
  }

  console.error(
    'Error en devoluciones:',
    error
  );

  res.status(500).json({
    mensaje: 'No fue posible procesar la devolución'
  });
}

// ========================================
// REGISTRAR DEVOLUCIÓN
// ========================================

export async function crearDevolucion(
  req: Request,
  res: Response
) {
  const usuario = res.locals.usuario;

  if (!usuario?.id) {
    res.status(401).json({
      mensaje: 'Debes iniciar sesión'
    });

    return;
  }

  const datos = req.body ?? {};

  if (
    (
      datos.tipoDevolucion !== 'CLIENTE' &&
      datos.tipoDevolucion !== 'PROVEEDOR'
    ) ||
    typeof datos.origenId !== 'string' ||
    typeof datos.cantidad !== 'number' ||
    typeof datos.motivo !== 'string'
  ) {
    res.status(400).json({
      mensaje: 'Los datos de la devolución no son válidos'
    });

    return;
  }

  try {

    const devolucion =
      await registrarDevolucion(
        {
          tipoDevolucion: datos.tipoDevolucion,
          origenId: datos.origenId,
          cantidad: datos.cantidad,
          motivo: datos.motivo
        },
        usuario.id
      );

    res.status(201).json({
      mensaje:
        'Devolución registrada correctamente. Inventario y Kardex actualizados.',
      devolucion
    });

  } catch (error) {

    responderError(error, res);

  }
}

// ========================================
// HISTORIAL DE DEVOLUCIONES
// ========================================

export async function listarDevoluciones(
  _req: Request,
  res: Response
) {
  try {

    const devoluciones =
      await obtenerDevoluciones();

    res.status(200).json(devoluciones);

  } catch (error) {

    responderError(error, res);

  }
}

// ========================================
// VENTAS DISPONIBLES PARA DEVOLUCIÓN
// ========================================

export async function listarVentasDevolvibles(
  _req: Request,
  res: Response
) {
  try {

    const ventas =
      await obtenerVentasDevolvibles();

    res.status(200).json(ventas);

  } catch (error) {

    responderError(error, res);

  }
}

// ========================================
// COMPRAS DISPONIBLES PARA DEVOLUCIÓN
// ========================================

export async function listarComprasDevolvibles(
  _req: Request,
  res: Response
) {
  try {

    const compras =
      await obtenerComprasDevolvibles();

    res.status(200).json(compras);

  } catch (error) {

    responderError(error, res);

  }
}
