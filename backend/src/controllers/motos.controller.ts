
import { Request, Response } from "express";
import type { ResultSetHeader } from "mysql2";

import {
  obtenerMotos,
  existeClienteActivo,
  crearMoto,
  actualizarMoto,
  cambiarEstadoMoto
} from "../services/motos.service";

// VALIDAR IDENTIFICADORES UUID
function esUUID(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      valor
    )
  );
}

// VALIDAR LOS DATOS DE UNA MOTOCICLETA
function validarMoto(datos: unknown) {
  if (
    typeof datos !== "object" ||
    datos === null ||
    Array.isArray(datos)
  ) {
    return null;
  }

  const campos = datos as Record<string, unknown>;

  const {
    clienteId,
    marca,
    modelo,
    anio,
    placa,
    color,
    tipoMotor
  } = campos;

  if (
    !esUUID(clienteId) ||
    typeof marca !== "string" ||
    !marca.trim() ||
    marca.trim().length > 50 ||
    typeof modelo !== "string" ||
    !modelo.trim() ||
    modelo.trim().length > 50 ||
    typeof anio !== "number" ||
    !Number.isInteger(anio) ||
    anio < 1900 ||
    anio > 2100 ||
    typeof placa !== "string" ||
    !placa.trim() ||
    placa.trim().length > 15
  ) {
    return null;
  }

  if (
    (color != null && typeof color !== "string") ||
    (tipoMotor != null && typeof tipoMotor !== "string")
  ) {
    return null;
  }

  const colorLimpio =
    typeof color === "string" ? color.trim() : "";

  const motorLimpio =
    typeof tipoMotor === "string" ? tipoMotor.trim() : "";

  if (
    colorLimpio.length > 30 ||
    motorLimpio.length > 50
  ) {
    return null;
  }

  return {
    clienteId,
    marca: marca.trim(),
    modelo: modelo.trim(),
    anio,
    placa: placa.trim().toUpperCase(),
    color: colorLimpio || null,
    tipoMotor: motorLimpio || null
  };
}

// CONSULTAR MOTOCICLETAS
export async function listarMotos(
  _req: Request,
  res: Response
) {
  try {
    const motos = await obtenerMotos();

    return res.status(200).json({
      ok: true,
      motos
    });
  } catch (error) {
    console.error("Error al consultar motos:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudieron consultar las motocicletas"
    });
  }
}

// REGISTRAR MOTOCICLETA
export async function registrarMoto(
  req: Request,
  res: Response
) {
  const datos = validarMoto(req.body);

  if (!datos) {
    return res.status(400).json({
      ok: false,
      mensaje: "Verifica los datos de la motocicleta"
    });
  }

  try {
    const clienteValido = await existeClienteActivo(
      datos.clienteId
    );

    if (!clienteValido) {
      return res.status(400).json({
        ok: false,
        mensaje: "Selecciona un cliente activo"
      });
    }

    const moto = await crearMoto(datos);

    return res.status(201).json({
      ok: true,
      mensaje: "Motocicleta registrada correctamente",
      moto
    });
  } catch (error: unknown) {
    if (
      (error as { code?: string }).code ===
      "ER_DUP_ENTRY"
    ) {
      return res.status(409).json({
        ok: false,
        mensaje: "Ya existe una motocicleta con esa placa"
      });
    }

    console.error("Error al registrar moto:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo registrar la motocicleta"
    });
  }
}

// EDITAR MOTOCICLETA
export async function editarMoto(
  req: Request,
  res: Response
) {
  const id = req.params.id;
  const datos = validarMoto(req.body);

  if (!esUUID(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: "Identificador de motocicleta inválido"
    });
  }

  if (!datos) {
    return res.status(400).json({
      ok: false,
      mensaje: "Verifica los datos de la motocicleta"
    });
  }

  try {
    const clienteValido = await existeClienteActivo(
      datos.clienteId
    );

    if (!clienteValido) {
      return res.status(400).json({
        ok: false,
        mensaje: "Selecciona un cliente activo"
      });
    }

    const resultado = await actualizarMoto(
      id,
      datos
    ) as ResultSetHeader;

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Motocicleta no encontrada"
      });
    }

    return res.status(200).json({
      ok: true,
      mensaje: "Motocicleta actualizada correctamente"
    });
  } catch (error: unknown) {
    if (
      (error as { code?: string }).code ===
      "ER_DUP_ENTRY"
    ) {
      return res.status(409).json({
        ok: false,
        mensaje: "La placa ya está registrada"
      });
    }

    console.error("Error al editar moto:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo actualizar la motocicleta"
    });
  }
}

// ARCHIVAR O REACTIVAR MOTOCICLETA
export async function actualizarEstadoMoto(
  req: Request,
  res: Response
) {
  const id = req.params.id;
  const { activo } = req.body ?? {};

  if (!esUUID(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: "Identificador de motocicleta inválido"
    });
  }

  if (typeof activo !== "boolean") {
    return res.status(400).json({
      ok: false,
      mensaje: "El estado debe ser verdadero o falso"
    });
  }

  try {
    const resultado = await cambiarEstadoMoto(
      id,
      activo
    ) as ResultSetHeader;

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Motocicleta no encontrada"
      });
    }

    return res.status(200).json({
      ok: true,
      mensaje: activo
        ? "Motocicleta reactivada correctamente"
        : "Motocicleta archivada correctamente"
    });
  } catch (error) {
    console.error(
      "Error al cambiar estado de moto:",
      error
    );

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo cambiar el estado"
    });
  }
}
