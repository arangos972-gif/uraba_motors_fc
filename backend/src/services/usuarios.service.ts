
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { pool } from '../config/database.js';
import type { RowDataPacket } from 'mysql2';

interface UsuarioDB extends RowDataPacket {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  roleId: string;
  rol: string;
  active: number;
  created: Date;
}

interface RolDB extends RowDataPacket {
  id: string;
  nombre: string;
}

interface ExisteDB extends RowDataPacket {
  id: string;
}

interface UsuarioActualDB extends RowDataPacket {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  roleId: string;
  active: number;
}

export interface NuevoUsuario {
  nombre: string;
  email: string;
  telefono?: string;
  password: string;
  roleId: string;
}

export interface DatosEditarUsuario {
  nombre: string;
  email: string;
  telefono: string | null;
  roleId: string;
}

// ========================================
// REGISTRAR AUDITORÍA EN UNA TRANSACCIÓN
// ========================================

type Conexion = Awaited<ReturnType<typeof pool.getConnection>>;

async function registrarMovimiento(
  conexion: Conexion,
  usuarioId: string,
  accion: string,
  detalles: Record<string, unknown>
) {
  await conexion.execute(
    `INSERT INTO auditoria_logs (
       id,
       usuarioId,
       accion,
       modulo,
       detalles,
       ipAddress
     )
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      usuarioId,
      accion,
      'USUARIOS',
      JSON.stringify(detalles),
      null
    ]
  );
}

// ========================================
// CONSULTAR USUARIOS
// ========================================

export async function obtenerUsuarios() {
  const [usuarios] = await pool.execute<UsuarioDB[]>(
    `SELECT
       u.id,
       u.name AS nombre,
       u.email,
       u.phone AS telefono,
       u.roleId,
       r.nombre AS rol,
       u.active,
       u.created
     FROM users u
     INNER JOIN roles r
       ON r.id = u.roleId
     ORDER BY u.name ASC`
  );

  return usuarios;
}

// ========================================
// CONSULTAR ROLES
// ========================================

export async function obtenerRoles() {
  const [roles] = await pool.execute<RolDB[]>(
    `SELECT id, nombre
     FROM roles
     WHERE activo = 1
     ORDER BY nombre ASC`
  );

  return roles;
}

// ========================================
// CREAR USUARIO CON AUDITORÍA
// ========================================

export async function crearUsuario(
  datos: NuevoUsuario,
  administradorId: string
) {
  // Generar el hash antes de abrir la transacción.
  const passwordHash = await bcrypt.hash(
    datos.password,
    12
  );

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [existentes] = await conexion.execute<ExisteDB[]>(
      `SELECT id
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [datos.email]
    );

    if (existentes.length > 0) {
      throw new Error('EMAIL_DUPLICADO');
    }

    const [roles] = await conexion.execute<RolDB[]>(
      `SELECT id, nombre
       FROM roles
       WHERE id = ?
         AND activo = 1
       LIMIT 1`,
      [datos.roleId]
    );

    if (roles.length === 0) {
      throw new Error('ROL_INVALIDO');
    }

    const id = randomUUID();

    await conexion.execute(
      `INSERT INTO users (
         id,
         name,
         email,
         phone,
         password,
         roleId,
         active
       )
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        datos.nombre,
        datos.email,
        datos.telefono || null,
        passwordHash,
        datos.roleId
      ]
    );

    // Guardar el movimiento sin contraseña ni hash.
    await registrarMovimiento(
      conexion,
      administradorId,
      'CREAR_USUARIO',
      {
        usuarioAfectadoId: id,
        nombre: datos.nombre,
        email: datos.email,
        rol: roles[0].nombre
      }
    );

    await conexion.commit();

    return {
      id,
      nombre: datos.nombre,
      email: datos.email,
      telefono: datos.telefono || null,
      roleId: datos.roleId,
      rol: roles[0].nombre,
      active: 1
    };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// ========================================
// EDITAR USUARIO CON AUDITORÍA
// ========================================

export async function actualizarUsuario(
  id: string,
  datos: DatosEditarUsuario,
  administradorId: string
) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [usuarios] =
      await conexion.execute<UsuarioActualDB[]>(
        `SELECT
           id,
           name AS nombre,
           email,
           phone AS telefono,
           roleId,
           active
         FROM users
         WHERE id = ?
         FOR UPDATE`,
        [id]
      );

    if (usuarios.length === 0) {
      throw new Error('USUARIO_NO_EXISTE');
    }

    const anterior = usuarios[0];

    const [roles] = await conexion.execute<RolDB[]>(
      `SELECT id, nombre
       FROM roles
       WHERE id = ?
         AND activo = 1
       LIMIT 1`,
      [datos.roleId]
    );

    if (roles.length === 0) {
      throw new Error('ROL_INVALIDO');
    }

    // No permitir quitarse el rol Administrador.
    if (
      id === administradorId &&
      roles[0].nombre !== 'Administrador'
    ) {
      throw new Error('NO_CAMBIAR_ROL_PROPIO');
    }

    const [correos] = await conexion.execute<ExisteDB[]>(
      `SELECT id
       FROM users
       WHERE email = ?
         AND id <> ?
       LIMIT 1`,
      [datos.email, id]
    );

    if (correos.length > 0) {
      throw new Error('EMAIL_DUPLICADO');
    }

    await conexion.execute(
      `UPDATE users
       SET
         name = ?,
         email = ?,
         phone = ?,
         roleId = ?
       WHERE id = ?`,
      [
        datos.nombre,
        datos.email,
        datos.telefono,
        datos.roleId,
        id
      ]
    );

    await registrarMovimiento(
      conexion,
      administradorId,
      'EDITAR_USUARIO',
      {
        usuarioAfectadoId: id,
        anterior: {
          nombre: anterior.nombre,
          email: anterior.email,
          telefono: anterior.telefono,
          roleId: anterior.roleId
        },
        nuevo: {
          nombre: datos.nombre,
          email: datos.email,
          telefono: datos.telefono,
          roleId: datos.roleId
        }
      }
    );

    await conexion.commit();

    return {
      id,
      nombre: datos.nombre,
      email: datos.email,
      telefono: datos.telefono,
      roleId: datos.roleId,
      rol: roles[0].nombre,
      active: anterior.active
    };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// ========================================
// ACTIVAR O DESACTIVAR CON AUDITORÍA
// ========================================

export async function cambiarEstadoUsuario(
  id: string,
  activo: boolean,
  administradorId: string
) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [usuarios] =
      await conexion.execute<UsuarioActualDB[]>(
        `SELECT
           id,
           name AS nombre,
           email,
           phone AS telefono,
           roleId,
           active
         FROM users
         WHERE id = ?
         FOR UPDATE`,
        [id]
      );

    if (usuarios.length === 0) {
      throw new Error('USUARIO_NO_EXISTE');
    }

    // Proteger la cuenta del Administrador.
    if (id === administradorId && !activo) {
      throw new Error('NO_DESACTIVAR_PROPIO');
    }

    const estadoAnterior = Number(usuarios[0].active);
    const estadoNuevo = activo ? 1 : 0;

    // Evitar registrar movimientos inexistentes.
    if (estadoAnterior !== estadoNuevo) {
      await conexion.execute(
        `UPDATE users
         SET active = ?
         WHERE id = ?`,
        [estadoNuevo, id]
      );

      await registrarMovimiento(
        conexion,
        administradorId,
        activo
          ? 'ACTIVAR_USUARIO'
          : 'DESACTIVAR_USUARIO',
        {
          usuarioAfectadoId: id,
          nombre: usuarios[0].nombre,
          estadoAnterior,
          estadoNuevo
        }
      );
    }

    await conexion.commit();

    return {
      id,
      active: estadoNuevo
    };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}
