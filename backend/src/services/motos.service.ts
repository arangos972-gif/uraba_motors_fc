
import { randomUUID } from "node:crypto";
import { pool } from "../config/database";

export interface DatosMoto {
  clienteId: string;
  marca: string;
  modelo: string;
  anio: number;
  placa: string;
  color: string | null;
  tipoMotor: string | null;
}

// CONSULTAR MOTOCICLETAS Y SUS PROPIETARIOS
export async function obtenerMotos() {
  const [rows] = await pool.query(
    `SELECT
       m.id,
       m.clienteId,
       m.marca,
       m.modelo,
       m.anio,
       m.placa,
       m.color,
       m.tipoMotor,
       m.activo,
       m.created,
       m.updated,
       c.nombre AS propietario,
       c.telefono AS telefonoPropietario
     FROM motos AS m
     INNER JOIN clientes AS c
       ON c.id = m.clienteId
     ORDER BY m.created DESC`
  );

  return rows;
}

// COMPROBAR QUE EL CLIENTE EXISTE Y ESTÁ ACTIVO
export async function existeClienteActivo(clienteId: string) {
  const [rows] = await pool.execute(
    `SELECT id
     FROM clientes
     WHERE id = ?
       AND activo = 1
     LIMIT 1`,
    [clienteId]
  );

  return (rows as unknown[]).length > 0;
}

// CREAR MOTOCICLETA
export async function crearMoto(datos: DatosMoto) {
  const id = randomUUID();

  await pool.execute(
    `INSERT INTO motos
      (id, clienteId, marca, modelo, anio, placa, color, tipoMotor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      datos.clienteId,
      datos.marca,
      datos.modelo,
      datos.anio,
      datos.placa,
      datos.color,
      datos.tipoMotor
    ]
  );

  return {
    id,
    ...datos,
    activo: 1
  };
}

// EDITAR MOTOCICLETA
export async function actualizarMoto(
  id: string,
  datos: DatosMoto
) {
  const [resultado] = await pool.execute(
    `UPDATE motos
     SET clienteId = ?,
         marca = ?,
         modelo = ?,
         anio = ?,
         placa = ?,
         color = ?,
         tipoMotor = ?
     WHERE id = ?`,
    [
      datos.clienteId,
      datos.marca,
      datos.modelo,
      datos.anio,
      datos.placa,
      datos.color,
      datos.tipoMotor,
      id
    ]
  );

  return resultado;
}

// ARCHIVAR O REACTIVAR MOTOCICLETA
export async function cambiarEstadoMoto(
  id: string,
  activo: boolean
) {
  const [resultado] = await pool.execute(
    `UPDATE motos
     SET activo = ?
     WHERE id = ?`,
    [activo ? 1 : 0, id]
  );

  return resultado;
}
