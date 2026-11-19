
import { randomUUID } from "node:crypto";
import { pool } from "../config/database";

export interface DatosCliente {
  nombre: string;
  telefono: string;
  email: string | null;
  direccion: string | null;
  ciudad: string | null;
}

// CONSULTAR TODOS LOS CLIENTES
export async function obtenerClientes() {
  const [rows] = await pool.query(
    `SELECT
       id,
       nombre,
       telefono,
       email,
       direccion,
       ciudad,
       activo,
       created,
       updated
     FROM clientes
     ORDER BY created DESC`
  );

  return rows;
}

// CREAR CLIENTE
export async function crearCliente(datos: DatosCliente) {
  const id = randomUUID();

  await pool.execute(
    `INSERT INTO clientes
      (id, nombre, telefono, email, direccion, ciudad)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      datos.nombre,
      datos.telefono,
      datos.email,
      datos.direccion,
      datos.ciudad
    ]
  );

  return { id, ...datos, activo: 1 };
}

// ACTUALIZAR CLIENTE
export async function actualizarCliente(
  id: string,
  datos: DatosCliente
) {
  const [resultado] = await pool.execute(
    `UPDATE clientes
     SET nombre = ?,
         telefono = ?,
         email = ?,
         direccion = ?,
         ciudad = ?
     WHERE id = ?`,
    [
      datos.nombre,
      datos.telefono,
      datos.email,
      datos.direccion,
      datos.ciudad,
      id
    ]
  );

  return resultado;
}

// ARCHIVAR O REACTIVAR CLIENTE
export async function cambiarEstadoCliente(
  id: string,
  activo: boolean
) {
  const [resultado] = await pool.execute(
    `UPDATE clientes
     SET activo = ?
     WHERE id = ?`,
    [activo ? 1 : 0, id]
  );

  return resultado;
}
