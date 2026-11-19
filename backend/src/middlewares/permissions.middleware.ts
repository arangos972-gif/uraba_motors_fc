
import type {
  Request,
  Response,
  NextFunction
} from 'express';

import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

interface PermisoDB extends RowDataPacket {
  id: string;
}

export function verificarPermiso(
  nombrePermiso: string,
  ...otrosPermisos: string[]
) {
  const permisosRequeridos = [nombrePermiso, ...otrosPermisos];

  return async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {

    const usuario = res.locals.usuario as
      | { id: string; roleId: string }
      | undefined;

    if (!usuario) {
      res.status(401).json({
        mensaje: 'Debes iniciar sesión'
      });
      return;
    }

    try {
      const placeholders = permisosRequeridos
        .map(() => '?')
        .join(', ');

      const [permisos] = await pool.execute<PermisoDB[]>(
        `SELECT p.id
         FROM roles_permisos rp
         INNER JOIN permisos p
           ON p.id = rp.permisoId
         INNER JOIN roles r
           ON r.id = rp.roleId
         WHERE rp.roleId = ?
           AND p.nombre IN (${placeholders})
           AND r.activo = 1
         LIMIT 1`,
        [usuario.roleId, ...permisosRequeridos]
      );

      if (permisos.length === 0) {
        res.status(403).json({
          mensaje: 'No tienes permiso para realizar esta acción'
        });
        return;
      }

      next();

    } catch (error) {
      console.error('Error al verificar permisos:', error);

      res.status(500).json({
        mensaje: 'Error al verificar los permisos'
      });
    }
  };
}
//esto es para que Cuando un usuario intenta acceder a una función del taller:
//Comprueba que haya iniciado sesión.
//Consulta en MySQL los permisos asignados a su rol.
//Si tiene el permiso solicitado, permite continuar.
// Si no lo tiene, devuelve 403 Forbidden.