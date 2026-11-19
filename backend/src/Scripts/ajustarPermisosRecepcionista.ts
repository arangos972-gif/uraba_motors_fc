import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

interface Registro extends RowDataPacket {
  id: string;
}

async function ajustarPermisosRecepcionista() {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [roles] = await conexion.execute<Registro[]>(
      `SELECT id
       FROM roles
       WHERE nombre = 'Recepcionista'
         AND activo = 1
       LIMIT 1`
    );

    if (roles.length === 0) {
      throw new Error('No existe el rol Recepcionista activo');
    }

    const permisos = [
      'inventario.crear',
      'inventario.editar',
      'compras.registrar',
      'compras.ver'
    ];

    for (const nombrePermiso of permisos) {
      const [permiso] = await conexion.execute<Registro[]>(
        `SELECT id
         FROM permisos
         WHERE nombre = ?
         LIMIT 1`,
        [nombrePermiso]
      );

      if (permiso.length === 0) {
        throw new Error(`No existe el permiso ${nombrePermiso}`);
      }

      await conexion.execute(
        `INSERT INTO roles_permisos
         (id, roleId, permisoId)
         SELECT ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1
           FROM roles_permisos
           WHERE roleId = ?
             AND permisoId = ?
         )`,
        [
          randomUUID(),
          roles[0].id,
          permiso[0].id,
          roles[0].id,
          permiso[0].id
        ]
      );
    }

    await conexion.commit();
    console.log(
      'Permisos de inventario y compras asignados al Recepcionista.'
    );
  } catch (error) {
    await conexion.rollback();
    console.error(
      'Error al ajustar los permisos del Recepcionista:',
      error
    );
    process.exitCode = 1;
  } finally {
    conexion.release();
    await pool.end();
  }
}

void ajustarPermisosRecepcionista();
