
import type { Request, Response } from 'express';

import {
  entregarMotocicleta
} from '../services/entregas.service.js';

const errores: Record<
  string,
  { estado: number; mensaje: string }
> = {
  ORDEN_ID_INVALIDO: {
    estado: 400,
    mensaje: 'El identificador de la orden es inválido.'
  },

  USUARIO_INVALIDO: {
    estado: 401,
    mensaje: 'El usuario autenticado no es válido.'
  },

  ENTREGA_SIN_PERMISO: {
    estado: 403,
    mensaje: 'No tienes permiso para entregar motocicletas.'
  },

  ORDEN_NO_EXISTE: {
    estado: 404,
    mensaje: 'La orden no existe.'
  },

  ORDEN_YA_ENTREGADA: {
    estado: 409,
    mensaje: 'Esta motocicleta ya fue entregada.'
  },

  ORDEN_NO_COMPLETADA: {
    estado: 409,
    mensaje: 'Primero debes completar la orden de trabajo.'
  },

  ORDEN_SIN_FACTURA: {
    estado: 409,
    mensaje: 'Debes generar la factura antes de entregar la motocicleta.'
  },

  FACTURA_NO_PAGADA: {
    estado: 409,
    mensaje: 'La factura debe estar completamente pagada.'
  },

  FACTURA_SALDO_INCONSISTENTE: {
    estado: 409,
    mensaje:
      'Los pagos aprobados no coinciden con el total de la factura.'
  },

  FACTURA_ENTREGA_INCONSISTENTE: {
    estado: 409,
    mensaje: 'La relación entre la orden y su factura necesita revisión.'
  },

  ENTREGA_VALORES_INVALIDOS: {
    estado: 409,
    mensaje: 'Los valores de la factura o de los pagos necesitan revisión.'
  },

  ENTREGA_NO_CONFIRMADA: {
    estado: 409,
    mensaje: 'No fue posible confirmar la entrega. Actualiza la orden.'
  }
};

export async function registrarEntregaMotocicleta(
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

  const ordenId = req.params.id;

  if (typeof ordenId !== 'string') {
    res.status(400).json({
      mensaje: 'Debes indicar una orden válida.'
    });
    return;
  }

  try {
    const orden = await entregarMotocicleta(
      ordenId,
      usuario.id,
      usuario.roleId
    );

    res.status(200).json({
      mensaje: 'Motocicleta entregada correctamente.',
      orden
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

    console.error(
      'Error registrando entrega de motocicleta:',
      error
    );

    res.status(500).json({
      mensaje: 'No fue posible registrar la entrega.'
    });
  }
}
