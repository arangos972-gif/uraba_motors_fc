
import { Request, Response } from "express";

import {
  obtenerCatalogoServicios,
  crearTipoServicio,
  actualizarTipoServicio,
  cambiarEstadoTipoServicio
} from "../services/catalogo-servicios.service";

export async function listarCatalogoServicios(
  _req: Request,
  res: Response
) {
  try {
    const servicios = await obtenerCatalogoServicios();

    return res.status(200).json({
      ok: true,
      servicios
    });
  } catch (error) {
    console.error(
      "Error al consultar el catálogo:",
      error
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al consultar el catálogo"
    });
  }
}

export async function registrarTipoServicio(
  req: Request,
  res: Response
) {
  try {
    const {
      codigo,
      nombre,
      descripcion,
      precioManoObra
    } = req.body ?? {};

    if (
      typeof codigo !== "string" ||
      !codigo.trim() ||
      codigo.trim().length > 30 ||
      typeof nombre !== "string" ||
      !nombre.trim() ||
      nombre.trim().length > 120
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "Código o nombre inválido"
      });
    }

    if (
      descripcion != null &&
      typeof descripcion !== "string"
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "La descripción debe ser texto"
      });
    }

    if (
      typeof precioManoObra !== "number" ||
      !Number.isFinite(precioManoObra) ||
      precioManoObra < 0 ||
      precioManoObra > 9999999999.99 ||
      Math.round(precioManoObra * 100) / 100 !==
        precioManoObra
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "El precio de mano de obra es inválido"
      });
    }

    const nuevoServicio = await crearTipoServicio({
      codigo: codigo.trim().toUpperCase(),
      nombre: nombre.trim(),
      descripcion: descripcion?.trim() || null,
      precioManoObra
    });

    return res.status(201).json({
      ok: true,
      mensaje: "Tipo de servicio creado correctamente",
      servicio: nuevoServicio
    });
  } catch (error: unknown) {
    const errorMySQL = error as {
      code?: string;
    };

    if (errorMySQL.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        ok: false,
        mensaje: "Ya existe un servicio con ese código"
      });
    }

    console.error(
      "Error al registrar tipo de servicio:",
      error
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error al registrar el tipo de servicio"
    });
  }
}

function validarDatosServicio(datos: any) {
  const {
    codigo,
    nombre,
    descripcion,
    precioManoObra
  } = datos ?? {};

  if (
    typeof codigo !== "string" ||
    !codigo.trim() ||
    codigo.trim().length > 30 ||
    typeof nombre !== "string" ||
    !nombre.trim() ||
    nombre.trim().length > 120 ||
    (descripcion != null &&
      typeof descripcion !== "string") ||
    typeof precioManoObra !== "number" ||
    !Number.isFinite(precioManoObra) ||
    precioManoObra < 0 ||
    precioManoObra > 9999999999.99 ||
    Math.round(precioManoObra * 100) / 100 !==
      precioManoObra
  ) {
    return null;
  }

  return {
    codigo: codigo.trim().toUpperCase(),
    nombre: nombre.trim(),
    descripcion: descripcion?.trim() || null,
    precioManoObra
  };
}

export async function editarTipoServicio(
  req: Request,
  res: Response
) {
  const id = req.params.id;

  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: "Identificador inválido"
    });
  }

  const datos = validarDatosServicio(req.body);

  if (!datos) {
    return res.status(400).json({
      ok: false,
      mensaje: "Verifica los datos del servicio"
    });
  }

  try {
    const resultado = await actualizarTipoServicio(
      id,
      datos
    ) as { affectedRows: number };

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Tipo de servicio no encontrado"
      });
    }

    return res.status(200).json({
      ok: true,
      mensaje: "Tipo de servicio actualizado correctamente"
    });
  } catch (error: unknown) {
    if (
      (error as { code?: string }).code ===
      "ER_DUP_ENTRY"
    ) {
      return res.status(409).json({
        ok: false,
        mensaje: "Ese código ya está registrado"
      });
    }

    console.error("Error al editar servicio:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo actualizar el servicio"
    });
  }
}

export async function actualizarEstadoTipoServicio(
  req: Request,
  res: Response
) {
  const id = req.params.id;
  const { activo } = req.body ?? {};

  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: "Identificador inválido"
    });
  }

  if (typeof activo !== "boolean") {
    return res.status(400).json({
      ok: false,
      mensaje: "El estado debe ser verdadero o falso"
    });
  }

  try {
    const resultado = await cambiarEstadoTipoServicio(
      id,
      activo
    ) as { affectedRows: number };

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Tipo de servicio no encontrado"
      });
    }

    return res.status(200).json({
      ok: true,
      mensaje: activo
        ? "Tipo de servicio reactivado"
        : "Tipo de servicio desactivado"
    });
  } catch (error) {
    console.error(
      "Error al cambiar estado del servicio:",
      error
    );

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo cambiar el estado"
    });
  }
}
