
import type { Request, Response } from 'express';

import {
  obtenerOrdenesPendientesFacturar,
  generarFacturaDesdeOrden,
  obtenerFacturas,
  obtenerDetalleFactura
} from '../services/facturas.service.js';

// ========================================
// USUARIO AUTENTICADO
// ========================================

interface UsuarioAutenticado {
  id: string;
  roleId: string;
}

// ========================================
// ERRORES CONOCIDOS
// ========================================

const erroresFactura: Record<
  string,
  { status: number; mensaje: string }
> = {
  FACTURA_SIN_PERMISO: {
    status: 403,
    mensaje: 'No tienes permiso para gestionar facturas.'
  },

  ORDEN_ID_INVALIDO: {
    status: 400,
    mensaje: 'El identificador de la orden no es válido.'
  },

  ORDEN_NO_EXISTE: {
    status: 404,
    mensaje: 'La orden de trabajo no existe.'
  },

  ORDEN_YA_FACTURADA: {
    status: 409,
    mensaje: 'Esta orden ya tiene una factura registrada.'
  },

  ORDEN_NO_FACTURABLE: {
    status: 409,
    mensaje: 'Solo se pueden facturar órdenes completadas.'
  },

  ORDEN_SIN_CLIENTE: {
    status: 409,
    mensaje: 'No se encontró el cliente de la orden.'
  },

  ORDEN_SIN_TRABAJOS: {
    status: 409,
    mensaje: 'La orden no tiene trabajos registrados.'
  },

  ORDEN_TRABAJOS_PENDIENTES: {
    status: 409,
    mensaje: 'La orden todavía tiene trabajos pendientes.'
  },

  ORDEN_TOTAL_NO_COINCIDE: {
    status: 409,
    mensaje:
      'El total de la orden no coincide con sus trabajos y repuestos.'
  },

  REPUESTOS_SIN_PRECIO_HISTORICO: {
    status: 409,
    mensaje:
      'La orden contiene repuestos sin precio histórico. Debe revisarse.'
  },

  PRECIO_FACTURA_INVALIDO: {
    status: 409,
    mensaje: 'Se encontró un precio inválido en la orden.'
  },

  TOTAL_FACTURA_INVALIDO: {
    status: 409,
    mensaje: 'El total calculado para la factura no es válido.'
  },

  CANTIDAD_FACTURA_INVALIDA: {
    status: 409,
    mensaje: 'La cantidad de uno de los repuestos es inválida.'
  },

  FACTURA_ID_INVALIDO: {
    status: 400,
    mensaje: 'El identificador de la factura no es válido.'
  },

  FACTURA_NO_EXISTE: {
    status: 404,
    mensaje: 'La factura solicitada no existe.'
  }
};

// ========================================
// OBTENER USUARIO
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
      mensaje: 'Debes iniciar sesión.'
    });

    return null;
  }

  return usuario;
}

// ========================================
// RESPONDER ERRORES
// ========================================

function responderError(
  res: Response,
  error: unknown,
  contexto: string
): void {

  if (error instanceof Error) {
    const conocido = erroresFactura[error.message];

    if (conocido) {
      res.status(conocido.status).json({
        mensaje: conocido.mensaje,
        codigo: error.message
      });

      return;
    }
  }

  // Una restricción UNIQUE también protege
  // contra solicitudes concurrentes.
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ER_DUP_ENTRY'
  ) {
    res.status(409).json({
      mensaje:
        'La factura ya fue registrada o su número está duplicado.',
      codigo: 'FACTURA_DUPLICADA'
    });

    return;
  }

  console.error(contexto, error);

  res.status(500).json({
    mensaje: 'Ocurrió un error interno en Facturación.'
  });
}

// ========================================
// ÓRDENES PENDIENTES DE FACTURAR
// ========================================

export async function listarOrdenesPendientesFacturar(
  _req: Request,
  res: Response
): Promise<void> {

  const usuario = obtenerUsuario(res);

  if (!usuario) return;

  try {
    const ordenes =
      await obtenerOrdenesPendientesFacturar(
        usuario.roleId
      );

    res.status(200).json(ordenes);

  } catch (error) {
    responderError(
      res,
      error,
      'Error consultando órdenes pendientes de facturar:'
    );
  }
}

// ========================================
// GENERAR FACTURA DESDE UNA ORDEN
// ========================================

export async function crearFacturaDesdeOrden(
  req: Request,
  res: Response
): Promise<void> {

  const usuario = obtenerUsuario(res);

  if (!usuario) return;

  const ordenId = req.params.ordenId;

  if (typeof ordenId !== 'string') {
    res.status(400).json({
      mensaje: 'Debes indicar una orden válida.'
    });

    return;
  }

  try {
    const factura =
      await generarFacturaDesdeOrden(
        ordenId,
        usuario.roleId
      );

    res.status(201).json({
      mensaje: 'Factura generada correctamente.',
      factura
    });

  } catch (error) {
    responderError(
      res,
      error,
      'Error generando factura desde orden:'
    );
  }
}

// ========================================
// HISTORIAL DE FACTURAS
// ========================================

export async function listarFacturas(
  _req: Request,
  res: Response
): Promise<void> {

  const usuario = obtenerUsuario(res);

  if (!usuario) return;

  try {
    const facturas =
      await obtenerFacturas(usuario.roleId);

    res.status(200).json(facturas);

  } catch (error) {
    responderError(
      res,
      error,
      'Error consultando historial de facturas:'
    );
  }
}

// ========================================
// DETALLE DE UNA FACTURA
// ========================================

export async function consultarFactura(
  req: Request,
  res: Response
): Promise<void> {

  const usuario = obtenerUsuario(res);

  if (!usuario) return;

  const facturaId = req.params.id;

  if (typeof facturaId !== 'string') {
    res.status(400).json({
      mensaje: 'Debes indicar una factura válida.'
    });

    return;
  }

  try {
    const factura =
      await obtenerDetalleFactura(
        facturaId,
        usuario.roleId
      );

    res.status(200).json(factura);

  } catch (error) {
    responderError(
      res,
      error,
      'Error consultando detalle de factura:'
    );
  }
}
