import type {
  Request,
  Response,
  NextFunction
} from 'express';

export function verificarAdministrador(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  const usuario = res.locals.usuario as
    | { id?: string; roleId?: string }
    | undefined;

  if (!usuario?.id || !usuario?.roleId) {
    res.status(401).json({
      mensaje: 'Debes iniciar sesión.'
    });
    return;
  }

  // Pendiente: validar el permiso real
  // 'roles.administrar' contra la base de datos.
  res.status(403).json({
    mensaje:
      'La validación de permisos administrativos aún no está configurada.'
  });
}