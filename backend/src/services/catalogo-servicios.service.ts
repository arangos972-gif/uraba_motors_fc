
import { randomUUID } from "node:crypto";
import { pool } from "../config/database";

export async function obtenerCatalogoServicios() {
  const [rows] = await pool.query(
    `SELECT
       id,
       codigo,
       nombre,
       descripcion,
       precioManoObra,
       activo
     FROM catalogo_servicios
     ORDER BY nombre ASC`
  );

  return rows;
}

interface NuevoTipoServicio {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  precioManoObra: number;
}

export async function crearTipoServicio(
  datos: NuevoTipoServicio
) {
  const id = randomUUID();

  await pool.execute(
    `INSERT INTO catalogo_servicios
      (id, codigo, nombre, descripcion, precioManoObra)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      datos.codigo,
      datos.nombre,
      datos.descripcion,
      datos.precioManoObra
    ]
  );

  return {
    id,
    ...datos,
    activo: 1
  };
}

interface DatosEditarTipoServicio {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  precioManoObra: number;
}

export async function actualizarTipoServicio(
  id: string,
  datos: DatosEditarTipoServicio
) {
  const [resultado] = await pool.execute(
    `UPDATE catalogo_servicios
     SET codigo = ?,
         nombre = ?,
         descripcion = ?,
         precioManoObra = ?
     WHERE id = ?`,
    [
      datos.codigo,
      datos.nombre,
      datos.descripcion,
      datos.precioManoObra,
      id
    ]
  );

  return resultado;
}

export async function cambiarEstadoTipoServicio(
  id: string,
  activo: boolean
) {
  const [resultado] = await pool.execute(
    `UPDATE catalogo_servicios
     SET activo = ?
     WHERE id = ?`,
    [activo ? 1 : 0, id]
  );

  return resultado;
}
