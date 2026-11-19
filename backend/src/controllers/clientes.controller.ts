
import { Request, Response } from "express";
import type { ResultSetHeader } from "mysql2";

import {
  obtenerClientes,
  crearCliente,
  actualizarCliente,
  cambiarEstadoCliente
} from "../services/clientes.service";

// VALIDAR INFORMACIÓN DEL CLIENTE
function validarCliente(datos: unknown) {
  if (
    typeof datos !== "object" ||
    datos === null ||
    Array.isArray(datos)
  ) {
    return null;
  }

  const campos = datos as Record<string, unknown>;

  const { nombre, telefono, email, direccion, ciudad } = campos;

  if (
    typeof nombre !== "string" ||
    !nombre.trim() ||
    nombre.trim().length > 100 ||
    typeof telefono !== "string" ||
    !telefono.trim() ||
    telefono.trim().length > 20
  ) {
    return null;
  }

  const opcionales = [email, direccion, ciudad];

  if (
    opcionales.some(
      (campo) =>
        campo !== null &&
        campo !== undefined &&
        typeof campo !== "string"
    )
  ) {
    return null;
  }

  const correo = typeof email === "string" ? email.trim() : "";

  if (
    correo &&
    (correo.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
  ) {
    return null;
  }

  const direccionLimpia =
    typeof direccion === "string" ? direccion.trim() : "";

  const ciudadLimpia =
    typeof ciudad === "string" ? ciudad.trim() : "";

  if (
    direccionLimpia.length > 255 ||
    ciudadLimpia.length > 100
  ) {
    return null;
  }

  return {
    nombre: nombre.trim(),
    telefono: telefono.trim(),
    email: correo || null,
    direccion: direccionLimpia || null,
    ciudad: ciudadLimpia || null
  };
}

// CONSULTAR CLIENTES
export async function listarClientes(
  _req: Request,
  res: Response
) {
  try {
    const clientes = await obtenerClientes();

    return res.status(200).json({
      ok: true,
      clientes
    });
  } catch (error) {
    console.error("Error al consultar clientes:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo consultar los clientes"
    });
  }
}

// CREAR CLIENTE
export async function registrarCliente(
  req: Request,
  res: Response
) {
  const datos = validarCliente(req.body);

  if (!datos) {
    return res.status(400).json({
      ok: false,
      mensaje: "Verifica los datos del cliente"
    });
  }

  try {
    const cliente = await crearCliente(datos);

    return res.status(201).json({
      ok: true,
      mensaje: "Cliente registrado correctamente",
      cliente
    });
  } catch (error) {
    console.error("Error al crear cliente:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo registrar el cliente"
    });
  }
}

// EDITAR CLIENTE
export async function editarCliente(
  req: Request,
  res: Response
) {
  const id = req.params.id;

  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return res.status(400).json({
      ok: false,
      mensaje: "Identificador de cliente inválido"
    });
  }

  const datos = validarCliente(req.body);

  if (!datos) {
    return res.status(400).json({
      ok: false,
      mensaje: "Verifica los datos del cliente"
    });
  }

  try {
    const resultado = await actualizarCliente(
      id,
      datos
    ) as ResultSetHeader;

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Cliente no encontrado"
      });
    }

    return res.status(200).json({
      ok: true,
      mensaje: "Cliente actualizado correctamente"
    });
  } catch (error) {
    console.error("Error al editar cliente:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo actualizar el cliente"
    });
  }
}

// ARCHIVAR O REACTIVAR CLIENTE
export async function actualizarEstadoCliente(
  req: Request,
  res: Response
) {
  const id = req.params.id;
  const { activo } = req.body ?? {};

  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return res.status(400).json({
      ok: false,
      mensaje: "Identificador de cliente inválido"
    });
  }

  if (typeof activo !== "boolean") {
    return res.status(400).json({
      ok: false,
      mensaje: "El estado debe ser verdadero o falso"
    });
  }

  try {
    const resultado = await cambiarEstadoCliente(
      id,
      activo
    ) as ResultSetHeader;

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Cliente no encontrado"
      });
    }

    return res.status(200).json({
      ok: true,
      mensaje: activo
        ? "Cliente reactivado correctamente"
        : "Cliente archivado correctamente"
    });
  } catch (error) {
    console.error(
      "Error al cambiar estado del cliente:",
      error
    );

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo cambiar el estado del cliente"
    });
  }
}
