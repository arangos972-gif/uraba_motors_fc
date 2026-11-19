
import type { Request, Response } from 'express';

import {
  registrarCompraInventario,
  obtenerCompras,
  obtenerCompraPorId
} from '../services/compras.service.js';

// ========================================
// MANEJO DE ERRORES
// ========================================

function responderError(
  error: unknown,
  res: Response
) {
  const mensajes: Record<string, string> = {

    FACTURA_INVALIDA:
      'Ingresa un número de factura válido',

    PROVEEDOR_INVALIDO:
      'Ingresa el nombre del proveedor',

    FECHA_INVALIDA:
      'La fecha de compra no es válida',

    DETALLES_INVALIDOS:
      'La compra debe tener entre 1 y 200 productos',

    REPUESTO_ID_INVALIDO:
      'El identificador del repuesto no es válido',

    REPUESTO_DUPLICADO:
      'Un repuesto no puede aparecer más de una vez en la misma compra',

    CANTIDAD_INVALIDA:
      'Las cantidades deben ser números enteros mayores a cero',

    COSTO_INVALIDO:
      'El costo unitario debe ser mayor a cero y tener máximo dos decimales',

    TOTAL_INVALIDO:
      'El total de la compra supera el valor permitido',

    USUARIO_INVALIDO:
      'El usuario autenticado no es válido',

    FACTURA_DUPLICADA:
      'Ya existe una compra registrada con esa factura y proveedor',

    REPUESTO_NO_EXISTE:
      'Uno de los repuestos seleccionados no existe',

    INVENTARIO_INCONSISTENTE:
      'El repuesto tiene existencias o costos inconsistentes. Revisa su inventario antes de continuar',

    STOCK_MAXIMO_SUPERADO:
      'La cantidad supera el límite de existencias permitido',

    PRECIO_CALCULADO_INVALIDO:
      'El costo o el precio calculado supera el valor permitido',

    COMPRA_ID_INVALIDO:
      'El identificador de la compra no es válido',

    COMPRA_NO_EXISTE:
      'La compra no existe'
  };

  if (
    error instanceof Error &&
    mensajes[error.message]
  ) {
    let estado = 400;

    if (
      error.message === 'COMPRA_NO_EXISTE' ||
      error.message === 'REPUESTO_NO_EXISTE'
    ) {
      estado = 404;
    }

    if (
      error.message === 'FACTURA_DUPLICADA' ||
      error.message === 'INVENTARIO_INCONSISTENTE'
    ) {
      estado = 409;
    }

    res.status(estado).json({
      mensaje: mensajes[error.message]
    });

    return;
  }

  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ER_DUP_ENTRY'
  ) {
    res.status(409).json({
      mensaje:
        'La factura o uno de sus registros ya existe'
    });

    return;
  }

  console.error('Error en compras:', error);

  res.status(500).json({
    mensaje:
      'No fue posible procesar la compra de inventario'
  });
}

// ========================================
// REGISTRAR COMPRA
// ========================================

export async function crearCompra(
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
    typeof datos.numeroFacturaProveedor !== 'string' ||
    typeof datos.proveedor !== 'string' ||
    typeof datos.fechaCompra !== 'string' ||
    !Array.isArray(datos.detalles)
  ) {
    res.status(400).json({
      mensaje: 'Los datos de la compra no son válidos'
    });

    return;
  }

  const detallesValidos =
    datos.detalles.every(
      (detalle: unknown) => {

        if (
          !detalle ||
          typeof detalle !== 'object'
        ) {
          return false;
        }

        const item =
          detalle as Record<string, unknown>;

        return (
          typeof item.repuestoId === 'string' &&
          typeof item.cantidad === 'number' &&
          typeof item.costoUnitarioCompra === 'number'
        );
      }
    );

  if (!detallesValidos) {
    res.status(400).json({
      mensaje:
        'Los productos de la compra no contienen datos válidos'
    });

    return;
  }

  try {
    const compra =
      await registrarCompraInventario(
        {
          numeroFacturaProveedor:
            datos.numeroFacturaProveedor,

          proveedor:
            datos.proveedor,

          fechaCompra:
            datos.fechaCompra,

          detalles:
            datos.detalles.map(
              (detalle: {
                repuestoId: string;
                cantidad: number;
                costoUnitarioCompra: number;
              }) => ({
                repuestoId: detalle.repuestoId,
                cantidad: detalle.cantidad,
                costoUnitarioCompra:
                  detalle.costoUnitarioCompra
              })
            )
        },
        usuario.id
      );

    res.status(201).json({
      mensaje:
        'Compra registrada correctamente. Inventario, PMP y precios actualizados.',
      compra
    });

  } catch (error) {
    responderError(error, res);
  }
}

// ========================================
// LISTAR HISTORIAL DE COMPRAS
// ========================================

export async function listarCompras(
  _req: Request,
  res: Response
) {
  try {
    const compras = await obtenerCompras();

    res.status(200).json(compras);

  } catch (error) {
    responderError(error, res);
  }
}

// ========================================
// CONSULTAR COMPRA POR ID
// ========================================

export async function consultarCompra(
  req: Request,
  res: Response
) {
  const id = req.params.id;

  if (typeof id !== 'string') {
    res.status(400).json({
      mensaje: 'Identificador de compra inválido'
    });

    return;
  }

  try {
    const compra =
      await obtenerCompraPorId(id);

    res.status(200).json(compra);

  } catch (error) {
    responderError(error, res);
  }
}
