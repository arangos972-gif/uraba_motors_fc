
import type { Request, Response } from 'express';

import {
  registrarPagoFactura,
  type TipoPago
} from '../services/pagos.service.js';

const tiposPago = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'TARJETA',
  'NEQUI',
  'DAVIPLATA'
] as const;

const errores: Record<
  string,
  { estado: number; mensaje: string }
> = {
  FACTURA_ID_INVALIDO: {
    estado: 400,
    mensaje: 'El identificador de la factura es inválido.'
  },
  FACTURA_NO_EXISTE: {
    estado: 404,
    mensaje: 'La factura no existe.'
  },
  PAGO_SIN_PERMISO: {
    estado: 403,
    mensaje: 'No tienes permiso para registrar pagos.'
  },
  SOLICITUD_PAGO_INVALIDA: {
    estado: 400,
    mensaje: 'La solicitud de pago no es válida.'
  },
  SOLICITUD_PAGO_YA_UTILIZADA: {
    estado: 409,
    mensaje: 'Este identificador ya se usó para otro pago.'
  },
  TIPO_PAGO_INVALIDO: {
    estado: 400,
    mensaje: 'Selecciona un medio de pago válido.'
  },
  MONTO_PAGO_INVALIDO: {
    estado: 400,
    mensaje: 'Ingresa un monto válido mayor que cero.'
  },
  REFERENCIA_PAGO_INVALIDA: {
    estado: 400,
    mensaje: 'La referencia no puede superar 100 caracteres.'
  },
  FACTURA_ANULADA: {
    estado: 409,
    mensaje: 'No se pueden registrar pagos en una factura anulada.'
  },
  ESTADO_FACTURA_INVALIDO: {
    estado: 409,
    mensaje: 'La factura tiene un estado no permitido.'
  },
  FACTURA_SIN_SALDO: {
    estado: 409,
    mensaje: 'La factura ya está completamente pagada.'
  },
  PAGO_SUPERA_SALDO: {
    estado: 409,
    mensaje: 'El pago supera el saldo pendiente de la factura.'
  },
  PAGOS_INCONSISTENTES: {
    estado: 409,
    mensaje: 'El estado o los pagos de la factura requieren revisión.'
  }
};

export async function crearPagoFactura(
  req: Request,
  res: Response
): Promise<void> {
  const usuario = res.locals.usuario as
    | { id?: string; roleId?: string }
    | undefined;

  if (
    !usuario ||
    typeof usuario.id !== 'string' ||
    typeof usuario.roleId !== 'string'
  ) {
    res.status(401).json({
      mensaje: 'Debes iniciar sesión.'
    });
    return;
  }

  const facturaId = req.params.id;

  if (typeof facturaId !== 'string') {
    res.status(400).json({
      mensaje: 'Debes indicar una factura válida.'
    });
    return;
  }

  const {
    solicitudId,
    monto,
    tipoPago,
    referencia
  } = req.body ?? {};

  if (
    typeof solicitudId !== 'string' ||
    typeof monto !== 'number' ||
    typeof tipoPago !== 'string' ||
    !tiposPago.some(tipo => tipo === tipoPago) ||
    (
      referencia !== undefined &&
      referencia !== null &&
      typeof referencia !== 'string'
    )
  ) {
    res.status(400).json({
      mensaje: 'Verifica los datos del pago.'
    });
    return;
  }

  try {
    const pago = await registrarPagoFactura(
      facturaId,
      {
        solicitudId,
        monto,
        tipoPago: tipoPago as TipoPago,
        referencia
      },
      usuario.roleId
    );

    res.status(pago.yaRegistrado ? 200 : 201).json({
      mensaje: pago.yaRegistrado
        ? 'Este pago ya estaba registrado.'
        : 'Pago registrado correctamente.',
      pago
    });

  } catch (error) {
    if (error instanceof Error) {
      const conocido = errores[error.message];

      if (conocido) {
        res.status(conocido.estado).json({
          mensaje: conocido.mensaje,
          codigo: error.message
        });
        return;
      }
    }

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ER_DUP_ENTRY'
    ) {
      res.status(409).json({
        mensaje: 'El pago ya existe. Actualiza la factura antes de repetirlo.',
        codigo: 'PAGO_DUPLICADO'
      });
      return;
    }

    console.error('Error registrando pago:', error);

    res.status(500).json({
      mensaje: 'No fue posible registrar el pago.'
    });
  }
}
