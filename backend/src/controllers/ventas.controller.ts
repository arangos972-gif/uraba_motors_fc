
import type { Request, Response } from 'express';

import {
  registrarVenta,
  obtenerVentas
} from '../services/ventas.service.js';

// ========================================
// MANEJO DE ERRORES
// ========================================

function responderError(
  error: unknown,
  res: Response
) {
  const mensajes: Record<string, string> = {

    REPUESTO_ID_INVALIDO:
      'El identificador del repuesto no es válido',

    USUARIO_INVALIDO:
      'El usuario autenticado no es válido',

    CLIENTE_ID_INVALIDO:
      'El identificador del cliente no es válido',

    CANTIDAD_INVALIDA:
      'La cantidad debe ser un número entero mayor a cero',

    REPUESTO_NO_EXISTE:
      'El repuesto seleccionado no existe',

    CLIENTE_NO_EXISTE:
      'El cliente seleccionado no existe',

    STOCK_INSUFICIENTE:
      'No hay suficientes existencias para realizar la venta',

    PRECIO_NO_DISPONIBLE:
      'El repuesto todavía no tiene un precio de venta válido',

    PMP_NO_DISPONIBLE:
      'El repuesto no tiene un costo PMP válido. Revisa el inventario',

    TOTAL_INVALIDO:
      'El total de la venta supera el valor permitido'
  };

  if (
    error instanceof Error &&
    mensajes[error.message]
  ) {
    let estado = 400;

    if (
      error.message === 'REPUESTO_NO_EXISTE' ||
      error.message === 'CLIENTE_NO_EXISTE'
    ) {
      estado = 404;
    }

    if (
      error.message === 'STOCK_INSUFICIENTE' ||
      error.message === 'PRECIO_NO_DISPONIBLE' ||
      error.message === 'PMP_NO_DISPONIBLE'
    ) {
      estado = 409;
    }

    res.status(estado).json({
      mensaje: mensajes[error.message]
    });

    return;
  }

  console.error('Error en ventas:', error);

  res.status(500).json({
    mensaje: 'No fue posible procesar la venta'
  });
}

// ========================================
// CREAR VENTA
// ========================================

export async function crearVenta(
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
    typeof datos.repuestoId !== 'string' ||
    typeof datos.cantidad !== 'number' ||
    (
      datos.clienteId !== undefined &&
      datos.clienteId !== null &&
      typeof datos.clienteId !== 'string'
    )
  ) {
    res.status(400).json({
      mensaje: 'Los datos de la venta no son válidos'
    });

    return;
  }

  try {
    const venta = await registrarVenta(
      {
        repuestoId: datos.repuestoId,
        clienteId: datos.clienteId || null,
        cantidad: datos.cantidad
      },
      usuario.id
    );

    res.status(201).json({
      mensaje:
        'Venta registrada correctamente. Existencias y Kardex actualizados.',
      venta
    });

  } catch (error) {
    responderError(error, res);
  }
}

// ========================================
// LISTAR VENTAS
// ========================================

export async function listarVentas(
  _req: Request,
  res: Response
) {
  try {
    const ventas = await obtenerVentas();

    res.status(200).json(ventas);

  } catch (error) {
    responderError(error, res);
  }
}
