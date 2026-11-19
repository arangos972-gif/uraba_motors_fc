
import type { Request, Response } from 'express';

import {
  obtenerRepuestos,
  obtenerCategorias,
  crearCategoria,
  crearRepuesto,
  actualizarRepuesto
} from '../services/repuestos.service.js';

// ========================================
// MANEJO DE ERRORES
// ========================================

function responderError(
  error: unknown,
  res: Response
) {
  const mensajes: Record<string, string> = {
    NOMBRE_CATEGORIA_INVALIDO:
      'El nombre de la categoría es obligatorio y debe tener máximo 100 caracteres',

    NOMBRE_REPUESTO_INVALIDO:
      'El nombre del repuesto es obligatorio y debe tener máximo 150 caracteres',

    GANANCIA_INVALIDA:
      'La ganancia debe estar entre 0% y 999.99%, con máximo dos decimales',

    PRECIO_INVALIDO:
      'El precio de venta calculado supera el valor permitido',

    CANTIDAD_MINIMA_INVALIDA:
      'La cantidad mínima debe ser un número entero mayor o igual a cero',

    DESCRIPCION_INVALIDA:
      'La descripción no es válida o es demasiado extensa',

    CATEGORIA_INVALIDA:
      'La categoría seleccionada no existe',

    REPUESTO_ID_INVALIDO:
      'El identificador del repuesto no es válido',

    REPUESTO_NO_EXISTE:
      'El repuesto no existe'
  };

  if (
    error instanceof Error &&
    mensajes[error.message]
  ) {
    res.status(
      error.message === 'REPUESTO_NO_EXISTE'
        ? 404
        : 400
    ).json({
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
      mensaje: 'Ya existe un registro con esos datos'
    });

    return;
  }

  console.error('Error en repuestos:', error);

  res.status(500).json({
    mensaje: 'Error interno al administrar repuestos'
  });
}

// ========================================
// LISTAR REPUESTOS
// ========================================

export async function listarRepuestos(
  _req: Request,
  res: Response
) {
  try {
    // Consulta general.
    // No muestra PMP ni porcentaje de ganancia.
    const repuestos = await obtenerRepuestos();

    res.status(200).json(repuestos);

  } catch (error) {
    responderError(error, res);
  }
}

// ========================================
// LISTAR INVENTARIO ADMINISTRATIVO
// ========================================

export async function listarInventarioRepuestos(
  _req: Request,
  res: Response
) {
  try {
    // Incluye PMP y porcentaje de ganancia.
    const repuestos = await obtenerRepuestos(true);

    res.status(200).json(repuestos);

  } catch (error) {
    responderError(error, res);
  }
}

// ========================================
// LISTAR CATEGORÍAS
// ========================================

export async function listarCategorias(
  _req: Request,
  res: Response
) {
  try {
    const categorias = await obtenerCategorias();

    res.status(200).json(categorias);

  } catch (error) {
    responderError(error, res);
  }
}

// ========================================
// REGISTRAR CATEGORÍA
// ========================================

export async function registrarCategoria(
  req: Request,
  res: Response
) {
  const datos = req.body ?? {};

  if (
    typeof datos.nombre !== 'string' ||
    (
      datos.descripcion !== undefined &&
      datos.descripcion !== null &&
      typeof datos.descripcion !== 'string'
    )
  ) {
    res.status(400).json({
      mensaje: 'Los datos de la categoría no son válidos'
    });

    return;
  }

  try {
    const categoria = await crearCategoria(
      datos.nombre,
      datos.descripcion ?? null
    );

    res.status(201).json({
      mensaje: 'Categoría registrada correctamente',
      categoria
    });

  } catch (error) {
    responderError(error, res);
  }
}

// ========================================
// VALIDAR FORMATO DE LOS DATOS
// ========================================

function datosRepuestoValidos(
  datos: Record<string, unknown>,
  permitirGananciaPredeterminada = false
) {
  const gananciaValida =
    typeof datos.porcentajeGanancia === 'number' ||
    (
      permitirGananciaPredeterminada &&
      datos.porcentajeGanancia === undefined
    );

  return (
    typeof datos.nombre === 'string' &&

    gananciaValida &&

    typeof datos.cantidadMinima === 'number' &&

    (
      datos.categoriaId === undefined ||
      datos.categoriaId === null ||
      typeof datos.categoriaId === 'string'
    ) &&

    (
      datos.descripcion === undefined ||
      datos.descripcion === null ||
      typeof datos.descripcion === 'string'
    )
  );
}

// ========================================
// REGISTRAR REPUESTO
// ========================================

export async function registrarRepuesto(
  req: Request,
  res: Response
) {
  const datos = req.body ?? {};

  if (!datosRepuestoValidos(datos, true)) {
    res.status(400).json({
      mensaje: 'Los datos del repuesto no son válidos'
    });

    return;
  }

  try {
    const repuesto = await crearRepuesto({
      nombre: datos.nombre,

      categoriaId:
        datos.categoriaId || null,

      descripcion:
        datos.descripcion ?? null,

      porcentajeGanancia:
        datos.porcentajeGanancia ?? 30,

      cantidadMinima:
        datos.cantidadMinima
    });

    res.status(201).json({
      mensaje:
        'Repuesto registrado correctamente. El precio se calculará con la primera compra.',
      repuesto
    });

  } catch (error) {
    responderError(error, res);
  }
}

// ========================================
// EDITAR REPUESTO
// ========================================

export async function editarRepuesto(
  req: Request,
  res: Response
) {
  const id = req.params.id;
  const datos = req.body ?? {};

  if (
    typeof id !== 'string' ||
    !datosRepuestoValidos(datos)
  ) {
    res.status(400).json({
      mensaje: 'Los datos del repuesto no son válidos'
    });

    return;
  }

  try {
    const repuesto = await actualizarRepuesto(
      id,
      {
        nombre: datos.nombre,

        categoriaId:
          datos.categoriaId || null,

        descripcion:
          datos.descripcion ?? null,

        porcentajeGanancia:
          datos.porcentajeGanancia,

        cantidadMinima:
          datos.cantidadMinima
      }
    );

    res.status(200).json({
      mensaje:
        'Repuesto actualizado correctamente',
      repuesto
    });

  } catch (error) {
    responderError(error, res);
  }
}
