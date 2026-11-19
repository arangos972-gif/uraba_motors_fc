
import type {
  Request,
  Response,
  NextFunction
} from 'express';

import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

interface UsuarioDB extends RowDataPacket {
  id: string;
  roleId: string;
}

export async function verificarToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {

  const autorizacion = req.headers.authorization;

  if (!autorizacion?.startsWith('Bearer ')) {
    res.status(401).json({
      mensaje: 'Debes iniciar sesión'
    });
    return;
  }

  const token = autorizacion.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({
      mensaje: 'Error de configuración del servidor'
    });
    return;
  }

  let usuarioId: string;

  try {
    const datos = jwt.verify(token, secret);

    if (
      typeof datos === 'string' ||
      typeof datos.sub !== 'string'
    ) {
      res.status(401).json({
        mensaje: 'Token inválido'
      });
      return;
    }

    usuarioId = datos.sub;

  } catch {
    res.status(401).json({
      mensaje: 'Token inválido o expirado'
    });
    return;
  }

  try {
    const [usuarios] = await pool.execute<UsuarioDB[]>(
      `SELECT u.id, u.roleId
       FROM users u
       INNER JOIN roles r ON r.id = u.roleId
       WHERE u.id = ?
         AND u.active = 1
         AND r.activo = 1
       LIMIT 1`,
      [usuarioId]
    );

    if (usuarios.length === 0) {
      res.status(401).json({
        mensaje: 'Usuario no autorizado'
      });
      return;
    }

    res.locals.usuario = {
      id: usuarios[0].id,
      roleId: usuarios[0].roleId
    };

    next();

  } catch (error) {
    console.error('Error al verificar usuario:', error);

    res.status(500).json({
      mensaje: 'Error interno del servidor'
    });
  }
}
