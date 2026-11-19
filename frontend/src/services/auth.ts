
export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  permisos: string[];
}

const TOKEN_KEY = 'uraba_token';
const USUARIO_KEY = 'uraba_usuario';

export function guardarSesion(
  token: string,
  usuario: Usuario
): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(
    USUARIO_KEY,
    JSON.stringify(usuario)
  );
}

export function obtenerToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function obtenerUsuario(): Usuario | null {
  const datos = sessionStorage.getItem(USUARIO_KEY);

  if (!datos) {
    return null;
  }

  try {
    return JSON.parse(datos) as Usuario;
  } catch {
    return null;
  }
}

export function tienePermiso(nombre: string): boolean {
  return obtenerUsuario()?.permisos.includes(nombre) ?? false;
}

export function cerrarSesion(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USUARIO_KEY);
}
