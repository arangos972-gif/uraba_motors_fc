
import { useState } from 'react';
import {
  Wrench,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';

import './Login.css';
import { guardarSesion } from '../services/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [usuario, setUsuario] = useState<{
    nombre: string;
    rol: string;
  } | null>(null);

  async function iniciarSesion(
    evento: React.SubmitEvent<HTMLFormElement>
  ) {
    evento.preventDefault();
    setMensaje('');
    setCargando(true);

    try {
      const respuesta = await fetch(
        'https://uraba-motors-fc.onrender.com/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: email.trim(),
            password
          })
        }
      );

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        setMensaje(
          datos.mensaje || 'No fue posible iniciar sesión.'
        );
        return;
      }

      guardarSesion(datos.token, datos.usuario);
      setUsuario(datos.usuario);
      setPassword('');
      window.location.replace('/dashboard');

    } catch {
      setMensaje(
        'No se pudo conectar con el servidor. Comprueba que el backend esté encendido.'
      );
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-pagina">
      <header className="login-header">
        <a href="/" className="login-marca">
          <Wrench size={30} strokeWidth={2.5} />
          <span>URABÁ MOTORS FC</span>
        </a>

        <a href="/" className="login-volver">
          <ArrowLeft size={18} />
          Volver al inicio
        </a>
      </header>

      <main className="login-principal">
        <div className="login-contenedor">

          <section className="login-imagen">
            <div className="login-imagen-contenido">
              <span className="login-etiqueta">
                GESTIÓN DE TALLER
              </span>

              <h1>
                Potencia tu taller.
              </h1>

              <p>
                Gestiona clientes, motocicletas,
                citas y servicios desde un solo lugar.
              </p>

              <span className="login-pie-marca">
                URABÁ MOTORS FC
              </span>
            </div>
          </section>

          <section className="login-formulario-panel">

            {usuario ? (
              <div className="login-exito">
                <div className="login-icono">
                  <Wrench size={28} />
                </div>

                <h2>¡Bienvenido!</h2>

                <p>
                  Inicio de sesión exitoso.
                </p>

                <strong>{usuario.nombre}</strong>

                <p>Rol: {usuario.rol}</p>

                <p className="login-nota">
                  El panel administrativo se conectará
                  en la siguiente etapa.
                </p>
              </div>
            ) : (
              <>
                <div className="login-icono">
                  <LockKeyhole size={26} />
                </div>

                <h2>Bienvenido de nuevo</h2>

                <p className="login-subtitulo">
                  Ingresa tus credenciales para
                  acceder al sistema.
                </p>

                <form onSubmit={iniciarSesion}>

                  <label htmlFor="login-email">
                    Correo electrónico
                  </label>

                  <div className="login-campo">
                    <Mail size={20} />
                    <input
                      id="login-email"
                      type="email"
                      placeholder="Correo electrónico"
                      value={email}
                      onChange={(e) =>
                        setEmail(e.target.value)
                      }
                      autoComplete="username"
                      required
                    />
                  </div>

                  <label htmlFor="login-password">
                    Contraseña
                  </label>

                  <div className="login-campo">
                    <LockKeyhole size={20} />

                    <input
                      id="login-password"
                      type={
                        mostrarPassword
                          ? 'text'
                          : 'password'
                      }
                      placeholder="Ingresa tu contraseña"
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value)
                      }
                      autoComplete="current-password"
                      required
                    />

                    <button
                      className="login-ver"
                      type="button"
                      onClick={() =>
                        setMostrarPassword(!mostrarPassword)
                      }
                      aria-label={
                        mostrarPassword
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                    >
                      {mostrarPassword
                        ? <EyeOff size={20} />
                        : <Eye size={20} />
                      }
                    </button>
                  </div>

                  {mensaje && (
                    <p className="login-error" role="alert">
                      {mensaje}
                    </p>
                  )}

                  <button
                    className="login-boton"
                    type="submit"
                    disabled={cargando}
                  >
                    {cargando
                      ? 'Verificando...'
                      : 'Iniciar sesión'
                    }

                    {!cargando && (
                      <ArrowRight size={20} />
                    )}
                  </button>

                </form>

                <p className="login-ayuda">
                  Acceso exclusivo para personal autorizado.
                </p>
              </>
            )}

          </section>
        </div>
      </main>

      <footer className="login-footer">
        © URABÁ MOTORS FC — Todos los derechos reservados
      </footer>
    </div>
  );
}
