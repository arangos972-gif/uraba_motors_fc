
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  Users,
  Search,
  Plus,
  Pencil,
  UserCheck,
  UserX,
  ArrowLeft,
  Save,
  RefreshCw,
  Clock,
  CalendarOff,
  History
} from 'lucide-react';

import { obtenerToken, obtenerUsuario } from '../services/auth';
import HorariosLaborales from './HorariosLaborales';
import './Usuarios.css';
import Ausencias from './Ausencias';
import Auditoria from './Auditoria';


const API = 'https://uraba-motors-fc.onrender.com/api/usuarios';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  roleId: string;
  rol: string;
  active: number;
  created?: string;
}

interface Rol {
  id: string;
  nombre: string;
}

interface FormularioUsuario {
  nombre: string;
  email: string;
  telefono: string;
  roleId: string;
  password: string;
}

const formularioInicial: FormularioUsuario = {
  nombre: '',
  email: '',
  telefono: '',
  roleId: '',
  password: ''
};

type Filtro = 'activos' | 'inactivos' | 'todos';

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('activos');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);

  const [formulario, setFormulario] =
    useState<FormularioUsuario>(formularioInicial);

  // NUEVO: controlar la pantalla de horarios laborales
  const [mostrarHorarios, setMostrarHorarios] = useState(false);
const [mostrarAusencias, setMostrarAusencias] = useState(false);

const [mostrarAuditoria, setMostrarAuditoria] = useState(false);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const usuarioActual = obtenerUsuario();
  const idUsuarioActual = usuarioActual?.id;

  // ========================================
  // SOLICITUDES AL BACKEND
  // ========================================

  async function solicitar(
    url: string,
    opciones: RequestInit = {}
  ) {
    const token = obtenerToken();

    if (!token) {
      throw new Error(
        'Tu sesión no está disponible. Inicia sesión nuevamente.'
      );
    }

    const respuesta = await fetch(url, {
      ...opciones,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opciones.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...opciones.headers
      }
    });

    const datos = await respuesta.json().catch(() => null);

    if (!respuesta.ok) {
      throw new Error(
        datos?.mensaje ||
        `Error del servidor (${respuesta.status})`
      );
    }

    return datos;
  }

  // ========================================
  // CONSULTAR USUARIOS Y ROLES
  // ========================================

  async function cargarUsuarios() {
    setCargando(true);
    setError('');

    try {
      const [listaUsuarios, listaRoles] = await Promise.all([
        solicitar(API),
        solicitar(`${API}/roles`)
      ]);

      setUsuarios(listaUsuarios);
      setRoles(listaRoles);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible cargar los usuarios.'
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargarUsuarios();
  }, []);

  // ========================================
  // FORMULARIO DE USUARIOS
  // ========================================

  function actualizarCampo(
    campo: keyof FormularioUsuario,
    valor: string
  ) {
    setFormulario(anterior => ({
      ...anterior,
      [campo]: valor
    }));
  }

  function abrirNuevo() {
    setUsuarioEditando(null);
    setFormulario(formularioInicial);
    setError('');
    setMensaje('');
    setMostrarFormulario(true);
  }

  function abrirEditar(usuario: Usuario) {
    setUsuarioEditando(usuario);

    setFormulario({
      nombre: usuario.nombre,
      email: usuario.email,
      telefono: usuario.telefono || '',
      roleId: usuario.roleId,
      password: ''
    });

    setError('');
    setMensaje('');
    setMostrarFormulario(true);
  }

  function cerrarFormulario() {
    setMostrarFormulario(false);
    setUsuarioEditando(null);
    setFormulario(formularioInicial);
    setError('');
  }

  // ========================================
  // REGISTRAR O EDITAR USUARIO
  // ========================================

  async function guardarUsuario(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();
    setError('');
    setMensaje('');

    if (!formulario.nombre.trim()) {
      setError('Debes ingresar el nombre del usuario.');
      return;
    }

    if (!formulario.email.trim() || !formulario.roleId) {
      setError('Debes indicar el correo y seleccionar un rol.');
      return;
    }

    if (
      !usuarioEditando &&
      formulario.password.length < 8
    ) {
      setError(
        'La contraseña debe tener al menos 8 caracteres.'
      );
      return;
    }

    setGuardando(true);

    try {
      const datosBase = {
        nombre: formulario.nombre.trim(),
        email: formulario.email.trim().toLowerCase(),
        telefono: formulario.telefono.trim(),
        roleId: formulario.roleId
      };

      if (usuarioEditando) {
        await solicitar(
          `${API}/${usuarioEditando.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(datosBase)
          }
        );
      } else {
        await solicitar(API, {
          method: 'POST',
          body: JSON.stringify({
            ...datosBase,
            password: formulario.password
          })
        });
      }

      const fueEdicion = Boolean(usuarioEditando);

      cerrarFormulario();
      await cargarUsuarios();

      setMensaje(
        fueEdicion
          ? 'Usuario actualizado correctamente.'
          : 'Usuario registrado correctamente.'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible guardar el usuario.'
      );
    } finally {
      setGuardando(false);
    }
  }

  // ========================================
  // ACTIVAR O DESACTIVAR USUARIO
  // ========================================

  async function cambiarEstado(usuario: Usuario) {
    setError('');
    setMensaje('');

    if (
      usuario.id === idUsuarioActual &&
      usuario.active === 1
    ) {
      setError(
        'No puedes desactivar tu propia cuenta.'
      );
      return;
    }

    const activar = usuario.active !== 1;

    const confirmado = window.confirm(
      activar
        ? `¿Quieres reactivar la cuenta de ${usuario.nombre}?`
        : `¿Quieres desactivar la cuenta de ${usuario.nombre}?`
    );

    if (!confirmado) return;

    try {
      await solicitar(
        `${API}/${usuario.id}/estado`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            activo: activar
          })
        }
      );

      await cargarUsuarios();

      setMensaje(
        activar
          ? 'Usuario reactivado correctamente.'
          : 'Usuario desactivado correctamente.'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible cambiar el estado.'
      );
    }
  }

  // ========================================
  // BUSCADOR Y FILTROS
  // ========================================

  const usuariosFiltrados = usuarios.filter(usuario => {
    const termino = busqueda.trim().toLowerCase();

    const coincideBusqueda =
      usuario.nombre.toLowerCase().includes(termino) ||
      usuario.email.toLowerCase().includes(termino) ||
      (usuario.telefono || '')
        .toLowerCase()
        .includes(termino) ||
      usuario.rol.toLowerCase().includes(termino);

    const coincideEstado =
      filtro === 'todos' ||
      (filtro === 'activos' && usuario.active === 1) ||
      (filtro === 'inactivos' && usuario.active !== 1);

    return coincideBusqueda && coincideEstado;
  });

  // ========================================
  // NUEVO: PANTALLA DE HORARIOS LABORALES
  // ========================================

  if (mostrarHorarios) {
    return (
      <HorariosLaborales
        onVolver={() => setMostrarHorarios(false)}
      />
    );
  }
if (mostrarAusencias) {
  return (
    <Ausencias
      onVolver={() => setMostrarAusencias(false)}
    />
  );
}
if (mostrarAuditoria) {
  return (
    <Auditoria
      onVolver={() => setMostrarAuditoria(false)}
    />
  );
}


  // ========================================
  // PANTALLA PRINCIPAL DE USUARIOS
  // ========================================

  return (
    <div className="usuarios-pagina">
      <div className="usuarios-encabezado">
        <div>
          <div className="usuarios-titulo">
            <Users size={28} />

            <h1>Gestión de Usuarios</h1>
          </div>

          <p>
            Administra las cuentas y el personal de
            URABÁ MOTORS FC.
          </p>
        </div>

        {!mostrarFormulario && (
          <button
            className="usuarios-boton-primario"
            onClick={abrirNuevo}
            type="button"
          >
            <Plus size={18} />
            Nuevo usuario
          </button>
        )}
      </div>

      {/* ===================================
          APARTADOS DEL MÓDULO USUARIOS
         =================================== */}

      <div className="usuarios-secciones-futuras">
        <div
          className="
            usuarios-seccion-futura
            usuarios-seccion-activa
          "
        >
          <Users size={20} />
          <span>Usuarios</span>
        </div>

        {/* NUEVO: BOTÓN FUNCIONAL DE HORARIOS */}

        <button
          type="button"
          className="usuarios-seccion-futura"
          onClick={() => setMostrarHorarios(true)}
        >
          <Clock size={20} />
          <span>Horarios laborales</span>
          <small>Configurar turnos</small>
        </button>

       <button
  type="button"
  className="usuarios-seccion-futura"
  onClick={() => setMostrarAusencias(true)}
>
  <CalendarOff size={20} />
  <span>Ausencias</span>
  <small>Gestionar bloqueos</small>
</button>

        <button
  type="button"
  className="usuarios-seccion-futura"
  onClick={() => setMostrarAuditoria(true)}
>
  <History size={20} />
  <span>Auditoría</span>
  <small>Consultar historial</small>
</button>
      </div>

      {/* ===================================
          MENSAJES
         =================================== */}

      {mensaje && (
        <div className="usuarios-mensaje-exito">
          {mensaje}
        </div>
      )}

      {error && (
        <div className="usuarios-mensaje-error">
          {error}
        </div>
      )}

      {/* ===================================
          FORMULARIO DE REGISTRO Y EDICIÓN
         =================================== */}

      {mostrarFormulario ? (
        <div className="usuarios-panel">
          <button
            className="usuarios-volver"
            onClick={cerrarFormulario}
            type="button"
          >
            <ArrowLeft size={18} />
            Volver a usuarios
          </button>

          <h2>
            {usuarioEditando
              ? 'Editar usuario'
              : 'Registrar usuario'}
          </h2>

          <p className="usuarios-descripcion-formulario">
            {usuarioEditando
              ? 'Actualiza la información y el rol de la cuenta.'
              : 'Registra una nueva cuenta para el personal del taller.'}
          </p>

          <form onSubmit={guardarUsuario}>
            <div className="usuarios-formulario-grid">

              <label className="usuarios-campo">
                <span>Nombre completo *</span>

                <input
                  value={formulario.nombre}
                  onChange={e =>
                    actualizarCampo(
                      'nombre',
                      e.target.value
                    )
                  }
                  maxLength={100}
                  required
                />
              </label>

              <label className="usuarios-campo">
                <span>Correo electrónico *</span>

                <input
                  type="email"
                  value={formulario.email}
                  onChange={e =>
                    actualizarCampo(
                      'email',
                      e.target.value
                    )
                  }
                  maxLength={150}
                  required
                />
              </label>

              <label className="usuarios-campo">
                <span>Teléfono</span>

                <input
                  type="tel"
                  value={formulario.telefono}
                  onChange={e =>
                    actualizarCampo(
                      'telefono',
                      e.target.value
                    )
                  }
                  maxLength={20}
                />
              </label>

              <label className="usuarios-campo">
                <span>Rol *</span>

                <select
                  value={formulario.roleId}
                  onChange={e =>
                    actualizarCampo(
                      'roleId',
                      e.target.value
                    )
                  }
                  required
                >
                  <option value="">
                    Selecciona un rol
                  </option>

                  {roles.map(rol => (
                    <option
                      key={rol.id}
                      value={rol.id}
                    >
                      {rol.nombre}
                    </option>
                  ))}
                </select>
              </label>

              {!usuarioEditando && (
                <label className="usuarios-campo">
                  <span>Contraseña inicial *</span>

                  <input
                    type="password"
                    value={formulario.password}
                    onChange={e =>
                      actualizarCampo(
                        'password',
                        e.target.value
                      )
                    }
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    required
                  />

                  <small>
                    Mínimo 8 caracteres. Compártela
                    de forma privada con el usuario.
                  </small>
                </label>
              )}
            </div>

            <div className="usuarios-acciones-formulario">
              <button
                type="button"
                className="usuarios-boton-secundario"
                onClick={cerrarFormulario}
                disabled={guardando}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="usuarios-boton-primario"
                disabled={guardando}
              >
                <Save size={18} />

                {guardando
                  ? 'Guardando...'
                  : usuarioEditando
                    ? 'Guardar cambios'
                    : 'Registrar usuario'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          {/* ===============================
              BUSCADOR Y FILTROS
             =============================== */}

          <div className="usuarios-herramientas">
            <div className="usuarios-busqueda">
              <Search size={19} />

              <input
                type="search"
                placeholder="Buscar por nombre, correo, teléfono o rol..."
                value={busqueda}
                onChange={e =>
                  setBusqueda(e.target.value)
                }
              />
            </div>

            <div className="usuarios-filtros">
              <button
                type="button"
                className={
                  filtro === 'activos'
                    ? 'seleccionado'
                    : ''
                }
                onClick={() => setFiltro('activos')}
              >
                Activos
              </button>

              <button
                type="button"
                className={
                  filtro === 'inactivos'
                    ? 'seleccionado'
                    : ''
                }
                onClick={() => setFiltro('inactivos')}
              >
                Inactivos
              </button>

              <button
                type="button"
                className={
                  filtro === 'todos'
                    ? 'seleccionado'
                    : ''
                }
                onClick={() => setFiltro('todos')}
              >
                Todos
              </button>
            </div>

            <button
              type="button"
              className="usuarios-boton-recargar"
              onClick={() => void cargarUsuarios()}
              title="Actualizar listado"
              disabled={cargando}
            >
              <RefreshCw size={19} />
            </button>
          </div>

          <div className="usuarios-total">
            {usuariosFiltrados.length} usuario(s)
            encontrado(s)
          </div>

          {/* ===============================
              LISTADO DE USUARIOS
             =============================== */}

          {cargando ? (
            <div className="usuarios-vacio">
              Cargando usuarios...
            </div>
          ) : usuariosFiltrados.length === 0 ? (
            <div className="usuarios-vacio">
              No se encontraron usuarios con esos filtros.
            </div>
          ) : (
            <div className="usuarios-grid">
              {usuariosFiltrados.map(usuario => (
                <div
                  className="usuarios-tarjeta"
                  key={usuario.id}
                >
                  <div className="usuarios-tarjeta-superior">
                    <div className="usuarios-avatar">
                      {usuario.nombre
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <span
                      className={
                        usuario.active === 1
                          ? 'usuarios-estado activo'
                          : 'usuarios-estado inactivo'
                      }
                    >
                      {usuario.active === 1
                        ? 'Activo'
                        : 'Inactivo'}
                    </span>
                  </div>

                  <h3>{usuario.nombre}</h3>

                  <span className="usuarios-rol">
                    {usuario.rol}
                  </span>

                  <div className="usuarios-detalles">
                    <p>
                      <strong>Correo:</strong>{' '}
                      {usuario.email}
                    </p>

                    <p>
                      <strong>Teléfono:</strong>{' '}
                      {usuario.telefono ||
                        'No registrado'}
                    </p>
                  </div>

                  <div className="usuarios-tarjeta-acciones">
                    <button
                      type="button"
                      className="usuarios-boton-editar"
                      onClick={() =>
                        abrirEditar(usuario)
                      }
                    >
                      <Pencil size={16} />
                      Editar
                    </button>

                    <button
                      type="button"
                      className={
                        usuario.active === 1
                          ? 'usuarios-boton-desactivar'
                          : 'usuarios-boton-activar'
                      }
                      onClick={() =>
                        void cambiarEstado(usuario)
                      }
                      disabled={
                        usuario.active === 1 &&
                        usuario.id ===
                          idUsuarioActual
                      }
                      title={
                        usuario.active === 1 &&
                        usuario.id === idUsuarioActual
                          ? 'No puedes desactivar tu propia cuenta'
                          : undefined
                      }
                    >
                      {usuario.active === 1 ? (
                        <>
                          <UserX size={16} />
                          Desactivar
                        </>
                      ) : (
                        <>
                          <UserCheck size={16} />
                          Reactivar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
