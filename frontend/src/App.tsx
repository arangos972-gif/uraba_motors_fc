
import { useEffect, useState } from 'react';

import Inicio from './pages/Inicio';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

import {
  obtenerToken,
  cerrarSesion,
  guardarSesion,
  type Usuario
} from './services/auth';

function DashboardProtegido() {
  const [estado, setEstado] = useState<
    'verificando' | 'autorizado' | 'denegado'
  >('verificando');

  useEffect(() => {
    let activo = true;

    async function verificarSesion() {
      const token = obtenerToken();

      if (!token) {
        if (activo) setEstado('denegado');
        return;
      }

      try {
        const respuesta = await fetch(
          'https://uraba-motors-fc.onrender.com/api/auth/me',
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!activo) return;

        const datos = await respuesta.json().catch(() => null);

        if (!respuesta.ok) {
          cerrarSesion();
          setEstado('denegado');
          return;
        }

        if (
          !datos?.usuario ||
          !Array.isArray(datos.usuario.permisos)
        ) {
          cerrarSesion();
          setEstado('denegado');
          return;
        }

        guardarSesion(token, datos.usuario as Usuario);
        setEstado('autorizado');

      } catch {
        if (activo) setEstado('denegado');
      }
    }

    verificarSesion();

    return () => {
      activo = false;
    };
  }, []);

  if (estado === 'verificando') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        color: '#2143b5'
      }}>
        Verificando sesión...
      </div>
    );
  }

  if (estado === 'denegado') {
    return (
      <main style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        padding: '24px'
      }}>
        <div>
          <h2>Acceso restringido</h2>
          <p>
            Debes iniciar sesión para acceder
            al panel administrativo.
          </p>
          <a href="/login">Ir al inicio de sesión</a>
        </div>
      </main>
    );
  }

  return <Dashboard />;
}

function App() {
  const ruta = window.location.pathname;

  if (ruta === '/login') {
    return <Login />;
  }

  if (ruta === '/dashboard') {
    return <DashboardProtegido />;
  }

  return <Inicio />;
}

export default App;
