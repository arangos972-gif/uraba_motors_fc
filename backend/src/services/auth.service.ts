
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import type { RowDataPacket } from 'mysql2';

interface PerfilUsuarioDB extends RowDataPacket {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  permiso: string | null;
}

interface UsuarioDB extends RowDataPacket {
  id: string;
  email: string;
  password: string;
  name: string;
  roleId: string;
  rol: string;
  active: number;
}

export async function obtenerPerfilUsuario(usuarioId: string) {
  const [filas] = await pool.execute<PerfilUsuarioDB[]>(
    `SELECT
       u.id,
       u.email,
       u.name AS nombre,
       r.nombre AS rol,
       p.nombre AS permiso
     FROM users u
     INNER JOIN roles r
       ON r.id = u.roleId
     LEFT JOIN roles_permisos rp
       ON rp.roleId = r.id
     LEFT JOIN permisos p
       ON p.id = rp.permisoId
     WHERE u.id = ?
       AND u.active = 1
       AND r.activo = 1
     ORDER BY p.nombre`,
    [usuarioId]
  );

  if (filas.length === 0) {
    return null;
  }

  return {
    id: filas[0].id,
    nombre: filas[0].nombre,
    email: filas[0].email,
    rol: filas[0].rol,
    permisos: [...new Set(
      filas
        .map(fila => fila.permiso)
        .filter((permiso): permiso is string => permiso !== null)
    )]
  };
}

export async function iniciarSesion(
  email: string,
  password: string
) {
  const [rows] = await pool.execute<UsuarioDB[]>(
    `SELECT
       u.id,
       u.email,
       u.password,
       u.name,
       u.roleId,
       u.active,
       r.nombre AS rol
     FROM users u
     INNER JOIN roles r ON u.roleId = r.id
     WHERE u.email = ?
       AND r.activo = 1
     LIMIT 1`,
    [email]
  );

  const usuario = rows[0];

  if (!usuario || usuario.active !== 1) {
    return null;
  }

  // Comprobar la contraseña
  const passwordCorrecta = await bcrypt.compare(
    password,
    usuario.password
  );

  if (!passwordCorrecta) {
    return null;
  }

  // Obtener clave secreta
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET no está configurado correctamente'
    );
  }

  // Crear token JWT
  const token = jwt.sign(
    {
      sub: usuario.id,
      roleId: usuario.roleId
    },
    secret,
    { expiresIn: '2h' }
  );

  const perfil = await obtenerPerfilUsuario(usuario.id);

  if (!perfil) {
    return null;
  }

  return {
    token,
    usuario: perfil
  };
}
