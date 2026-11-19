import type { Request, Response } from 'express';
import {
  iniciarSesion,
  obtenerPerfilUsuario
} from '../services/auth.service.js';

export async function login(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { email, password } = req.body ?? {};

    // Validar los datos recibidos
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      res.status(400).json({
        mensaje: 'Correo y contraseña son obligatorios'
      });
      return;
    }

    // Verificar credenciales en MySQL
    const resultado = await iniciarSesion(
      email.trim().toLowerCase(),
      password
    );

    if (!resultado) {
      res.status(401).json({
        mensaje: 'Credenciales inválidas'
      });
      return;
    }

    // Inicio de sesión exitoso
    res.status(200).json({
      mensaje: 'Inicio de sesión exitoso',
      ...resultado
    });

  } catch (error) {
    console.error('Error al iniciar sesión:', error);

    res.status(500).json({
      mensaje: 'Error interno del servidor'
    });
  }
}

export async function consultarSesion(
  _req: Request,
  res: Response
): Promise<void> {
  const usuario = res.locals.usuario as
    | { id?: unknown }
    | undefined;

  if (typeof usuario?.id !== 'string') {
    res.status(401).json({
      mensaje: 'Debes iniciar sesión.'
    });
    return;
  }

  try {
    const perfil = await obtenerPerfilUsuario(usuario.id);

    if (!perfil) {
      res.status(401).json({
        mensaje: 'La sesión ya no está activa.'
      });
      return;
    }

    res.json({
      mensaje: 'Usuario autenticado correctamente',
      usuario: perfil
    });
  } catch (error) {
    console.error('Error al consultar la sesión:', error);

    res.status(500).json({
      mensaje: 'No fue posible consultar la sesión.'
    });
  }
}