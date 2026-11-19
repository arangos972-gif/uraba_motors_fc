
import type { Request, Response } from 'express';

import {
  obtenerUsuarios,
  obtenerRoles,
  crearUsuario,
  actualizarUsuario,
  cambiarEstadoUsuario
} from '../services/usuarios.service.js';

export async function listarUsuarios(
  _req: Request,
  res: Response
) {
  try {
    const usuarios = await obtenerUsuarios();

    res.json(usuarios);
  } catch (error) {
    console.error('Error al listar usuarios:', error);

    res.status(500).json({
      mensaje: 'Error al consultar los usuarios'
    });
  }
}

export async function listarRoles(
  _req: Request,
  res: Response
) {
  try {
    const roles = await obtenerRoles();

    res.json(roles);
  } catch (error) {
    console.error('Error al listar roles:', error);

    res.status(500).json({
      mensaje: 'Error al consultar los roles'
    });
  }
}

export async function registrarUsuario(
  req: Request,
  res: Response
) {
  try {
    const {
      nombre,
      email,
      telefono,
      password,
      roleId
    } = req.body ?? {};

    if (
      typeof nombre !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof roleId !== 'string'
    ) {
      res.status(400).json({
        mensaje: 'Los datos del usuario son inválidos'
      });
      return;
    }

    const nombreLimpio = nombre.trim();
    const emailLimpio = email.trim().toLowerCase();

    if (
      !nombreLimpio ||
      !emailLimpio ||
      !roleId.trim() ||
      nombreLimpio.length > 100 ||
      emailLimpio.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)
    ) {
      res.status(400).json({
        mensaje: 'Verifica el nombre, correo y rol'
      });
      return;
    }

    if (
      password.length < 8 ||
      password.length > 128
    ) {
      res.status(400).json({
        mensaje: 'La contraseña debe tener entre 8 y 128 caracteres'
      });
      return;
    }

    if (
      telefono !== undefined &&
      telefono !== null &&
      typeof telefono !== 'string'
    ) {
      res.status(400).json({
        mensaje: 'El teléfono es inválido'
      });
      return;
    }

    const telefonoLimpio =
      typeof telefono === 'string'
        ? telefono.trim()
        : '';

    if (telefonoLimpio.length > 20) {
      res.status(400).json({
        mensaje: 'El teléfono no puede superar 20 caracteres'
      });
      return;
    }

    const administrador = res.locals.usuario as
  | { id: string }
  | undefined;

if (!administrador?.id) {
  res.status(401).json({
    mensaje: 'Debes iniciar sesión'
  });
  return;
}

const usuario = await crearUsuario(
  {
    nombre: nombreLimpio,
    email: emailLimpio,
    telefono: telefonoLimpio,
    password,
    roleId: roleId.trim()
  },
  administrador.id
);

    res.status(201).json({
      mensaje: 'Usuario registrado correctamente',
      usuario
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'EMAIL_DUPLICADO'
    ) {
      res.status(409).json({
        mensaje: 'Este correo ya está registrado'
      });
      return;
    }

    if (
      error instanceof Error &&
      error.message === 'ROL_INVALIDO'
    ) {
      res.status(400).json({
        mensaje: 'El rol seleccionado no está disponible'
      });
      return;
    }

    // Protección adicional contra registros simultáneos
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ER_DUP_ENTRY'
    ) {
      res.status(409).json({
        mensaje: 'El correo ya está registrado'
      });
      return;
    }

    console.error('Error al registrar usuario:', error);

    res.status(500).json({
      mensaje: 'Error al registrar el usuario'
    });
  }
}

// Responder errores conocidos de administración
function responderErrorUsuario(
  error: unknown,
  res: Response
) {
  const mensajes: Record<string, string> = {
    USUARIO_NO_EXISTE: 'El usuario no existe',
    ROL_INVALIDO: 'El rol seleccionado no está disponible',
    EMAIL_DUPLICADO: 'Este correo ya está registrado',
    NO_CAMBIAR_ROL_PROPIO:
      'No puedes quitarte tu propio rol de Administrador',
    NO_DESACTIVAR_PROPIO:
      'No puedes desactivar tu propia cuenta'
  };

  if (error instanceof Error && mensajes[error.message]) {
    const codigo = error.message === 'USUARIO_NO_EXISTE'
      ? 404
      : error.message === 'EMAIL_DUPLICADO'
        ? 409
        : 400;

    res.status(codigo).json({
      mensaje: mensajes[error.message]
    });

    return;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ER_DUP_ENTRY'
  ) {
    res.status(409).json({
      mensaje: 'Este correo ya está registrado'
    });
    return;
  }

  console.error('Error al administrar usuario:', error);

  res.status(500).json({
    mensaje: 'Error interno al administrar el usuario'
  });
}

// Editar información y rol
export async function editarUsuario(
  req: Request,
  res: Response
) {
  try {
    const id = req.params.id;

    const {
      nombre,
      email,
      telefono,
      roleId
    } = req.body ?? {};

    const administrador = res.locals.usuario as
      | { id: string }
      | undefined;

    if (!administrador) {
      res.status(401).json({
        mensaje: 'Debes iniciar sesión'
      });
      return;
    }

    if (
      typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      typeof nombre !== 'string' ||
      typeof email !== 'string' ||
      typeof roleId !== 'string' ||
      (
        telefono !== undefined &&
        telefono !== null &&
        typeof telefono !== 'string'
      )
    ) {
      res.status(400).json({
        mensaje: 'Los datos enviados no son válidos'
      });
      return;
    }

    const nombreLimpio = nombre.trim();
    const emailLimpio = email.trim().toLowerCase();
    const telefonoLimpio =
      typeof telefono === 'string'
        ? telefono.trim()
        : '';

    if (
      nombreLimpio.length === 0 ||
      nombreLimpio.length > 100 ||
      emailLimpio.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio) ||
      telefonoLimpio.length > 20 ||
      !roleId.trim()
    ) {
      res.status(400).json({
        mensaje: 'Verifica el nombre, correo, teléfono y rol'
      });
      return;
    }

    const usuario = await actualizarUsuario(
      id,
      {
        nombre: nombreLimpio,
        email: emailLimpio,
        telefono: telefonoLimpio || null,
        roleId: roleId.trim()
      },
      administrador.id
    );

    res.json({
      mensaje: 'Usuario actualizado correctamente',
      usuario
    });
  } catch (error) {
    responderErrorUsuario(error, res);
  }
}

// Activar o desactivar una cuenta
export async function cambiarEstado(
  req: Request,
  res: Response
) {
  try {
    const id = req.params.id;
    const { activo } = req.body ?? {};

    const administrador = res.locals.usuario as
      | { id: string }
      | undefined;

    if (!administrador) {
      res.status(401).json({
        mensaje: 'Debes iniciar sesión'
      });
      return;
    }

    if (
      typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      res.status(400).json({
        mensaje: 'El ID del usuario no es válido'
      });
      return;
    }

    if (typeof activo !== 'boolean') {
      res.status(400).json({
        mensaje: 'El campo activo debe ser true o false'
      });
      return;
    }

    const resultado = await cambiarEstadoUsuario(
      id,
      activo,
      administrador.id
    );

    res.json({
      mensaje: activo
        ? 'Usuario activado correctamente'
        : 'Usuario desactivado correctamente',
      usuario: resultado
    });
  } catch (error) {
    responderErrorUsuario(error, res);
  }
}
