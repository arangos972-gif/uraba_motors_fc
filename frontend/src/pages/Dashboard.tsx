
import { useEffect, useState } from 'react';

import CatalogoServicios from './CatalogoServicios';
import Clientes from './Clientes';
import Motocicletas from './Motocicletas';
import Usuarios from './Usuarios';
import Citas from './Citas';
import OrdenesTrabajo from './OrdenesTrabajo';
import Repuestos from './Repuestos';
import Inventario from './Inventario';
import Facturacion from './Facturacion';
import ReportesMecanicos from './ReportesMecanicos';
import {
  LayoutDashboard,
  Users,
  Bike,
  CalendarDays,
  Wrench,
  Package,
  Boxes,
  UserCog,
  LogOut,
  ChevronRight,
  ArrowLeft,
  ShieldCheck,
  ListChecks,
  ClipboardList,
  Receipt,
  ChartNoAxesCombined,
  Moon,
  Sun
} from 'lucide-react';

import {
  cerrarSesion,
  obtenerUsuario,
  tienePermiso
} from '../services/auth';

import './Dashboard.css';
import './ModoOscuro.css';

// ========================================
// MENÚ PRINCIPAL
// ========================================

const opcionesMenu = [
  { nombre: 'Inicio', icono: LayoutDashboard },
  { nombre: 'Clientes', icono: Users, permiso: 'clientes.ver' },
  { nombre: 'Motocicletas', icono: Bike, permiso: 'motos.ver' },
  { nombre: 'Citas', icono: CalendarDays, permiso: 'citas.ver' },
  { nombre: 'Servicios', icono: Wrench, permiso: 'servicios.ver' },
  { nombre: 'Repuestos', icono: Package, permiso: 'inventario.ver' },
  { nombre: 'Inventario', icono: Boxes, permiso: 'inventario.ver' },
  {
    nombre: 'Facturación',
    icono: Receipt,
    permiso: ['facturacion.ver', 'facturacion.generar']
  },
  {
    nombre: 'Reportes',
    icono: ChartNoAxesCombined,
    permiso: 'reportes.ver'
  },
  { nombre: 'Usuarios', icono: UserCog, permiso: 'usuarios.ver' }
];

// ========================================
// ACCESOS RÁPIDOS DEL INICIO
// ========================================

const resumen = [
  { titulo: 'Clientes', icono: Users, permiso: 'clientes.ver' },
  { titulo: 'Motocicletas', icono: Bike, permiso: 'motos.ver' },
  { titulo: 'Citas', icono: CalendarDays, permiso: 'citas.ver' },
  { titulo: 'Servicios', icono: Wrench, permiso: 'servicios.ver' },
  { titulo: 'Repuestos', icono: Package, permiso: 'inventario.ver' },
  { titulo: 'Inventario', icono: Boxes, permiso: 'inventario.ver' },
  {
    titulo: 'Facturación',
    icono: Receipt,
    permiso: ['facturacion.ver', 'facturacion.generar']
  },
  {
    titulo: 'Reportes',
    icono: ChartNoAxesCombined,
    permiso: 'reportes.ver'
  }
];

function tieneAcceso(permiso?: string | string[]): boolean {
  if (!permiso) return true;

  const requeridos = Array.isArray(permiso)
    ? permiso
    : [permiso];

  return requeridos.some(tienePermiso);
}

export default function Dashboard() {

  const [modoOscuro, setModoOscuro] = useState<boolean>(() => {
    try {
      return localStorage.getItem('uraba-modo-oscuro') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('uraba-modo-oscuro', String(modoOscuro));
    } catch {
      // La preferencia funcionará durante la sesión aunque
      // el navegador no permita guardar datos locales.
    }
  }, [modoOscuro]);

  const [seccion, setSeccion] = useState('Inicio');

  const [mostrarCatalogo, setMostrarCatalogo] =
    useState(false);

  const [mostrarOrdenes, setMostrarOrdenes] =
    useState(false);

  const usuario = obtenerUsuario();

  // ========================================
  // CERRAR SESIÓN
  // ========================================

  function salir() {
    cerrarSesion();
    window.location.replace('/login');
  }

  // ========================================
  // CAMBIAR SECCIÓN
  // ========================================

  function cambiarSeccion(nombre: string) {
    setSeccion(nombre);
    setMostrarCatalogo(false);
    setMostrarOrdenes(false);
  }

  const nombre = usuario?.nombre || 'Usuario';
  const rol = usuario?.rol || 'Sin rol';

  const opcionActual = opcionesMenu.find(
    (opcion) => opcion.nombre === seccion
  );

  const IconoActual =
    opcionActual?.icono || LayoutDashboard;

  return (
    <div className={`dashboard${modoOscuro ? ' tema-oscuro' : ''}`}>

      {/* ========================================
          MENÚ LATERAL
      ======================================== */}

      <aside className="dashboard-sidebar">

        <div className="dashboard-logo">
          <Wrench size={28} />
          <span>URABÁ MOTORS FC</span>
        </div>

        <div className="dashboard-menu-titulo">
          MENÚ PRINCIPAL
        </div>

        <nav className="dashboard-menu">

          {opcionesMenu.filter(opcion =>
            tieneAcceso(opcion.permiso)
          ).map((opcion) => {

            const Icono = opcion.icono;

            return (
              <button
                key={opcion.nombre}
                type="button"
                onClick={() =>
                  cambiarSeccion(opcion.nombre)
                }
                className={
                  seccion === opcion.nombre
                    ? 'dashboard-menu-item activo'
                    : 'dashboard-menu-item'
                }
                aria-current={
                  seccion === opcion.nombre
                    ? 'page'
                    : undefined
                }
              >
                <Icono size={21} />
                <span>{opcion.nombre}</span>
              </button>
            );
          })}

        </nav>

        <div className="dashboard-sidebar-inferior">

          <button
            className="dashboard-cerrar-sesion"
            type="button"
            onClick={salir}
          >
            <LogOut size={20} />
            Cerrar sesión
          </button>

          <span>URABÁ MOTORS FC</span>

        </div>

      </aside>

      {/* ========================================
          CONTENIDO PRINCIPAL
      ======================================== */}

      <div className="dashboard-contenido">

        {/* ENCABEZADO */}

        <header className="dashboard-header">

          <div className="dashboard-header-izquierda">
            <div>

              <h2>
                {seccion === 'Inicio'
                  ? 'Panel de control'
                  : seccion === 'Servicios' &&
                    mostrarCatalogo
                    ? 'Catálogo de servicios'
                    : seccion === 'Servicios' &&
                      mostrarOrdenes
                      ? 'Órdenes de trabajo'
                      : seccion}
              </h2>

              <p>Gestión general del taller</p>

            </div>
          </div>

          <div className="dashboard-header-derecha">

            <button
              type="button"
              className="dashboard-tema-boton"
              onClick={() => setModoOscuro(actual => !actual)}
              aria-label={modoOscuro ? 'Activar modo claro' : 'Activar modo oscuro'}
              aria-pressed={modoOscuro}
              title={modoOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {modoOscuro ? <Sun size={19} /> : <Moon size={19} />}
              <span>{modoOscuro ? 'Modo claro' : 'Modo oscuro'}</span>
            </button>

            <div className="dashboard-usuario">

              <div className="dashboard-avatar">
                {nombre.charAt(0).toUpperCase()}
              </div>

              <div>
                <strong>{nombre}</strong>
                <span>{rol}</span>
              </div>

            </div>

          </div>

        </header>

        {/* ========================================
            CONTENIDO DE LOS MÓDULOS
        ======================================== */}

        <main className="dashboard-main">

          {seccion === 'Inicio' ? (

            <>

              {/* BIENVENIDA */}

              <section className="dashboard-bienvenida">

                <div>

                  <span className="dashboard-etiqueta">
                    PANEL DE GESTIÓN
                  </span>

                  <h1>Bienvenido, {nombre}</h1>

                  <p>
                    Administra tu taller desde un solo
                    lugar. Selecciona un módulo para
                    comenzar.
                  </p>

                </div>

                <Wrench size={70} />

              </section>

              {/* RESUMEN GENERAL */}

              <div className="dashboard-seccion-titulo">

                <div>
                  <h2>Resumen general</h2>
                  <p>Accesos a los principales módulos</p>
                </div>

              </div>

              <section className="dashboard-tarjetas">

                {resumen.filter(elemento =>
                  tieneAcceso(elemento.permiso)
                ).map((elemento) => {

                  const Icono = elemento.icono;

                  return (
                    <button
                      key={elemento.titulo}
                      type="button"
                      className="dashboard-tarjeta dashboard-tarjeta-boton"
                      onClick={() =>
                        cambiarSeccion(elemento.titulo)
                      }
                    >

                      <div className="dashboard-tarjeta-icono">
                        <Icono size={27} />
                      </div>

                      <h3>{elemento.titulo}</h3>

                      <p>
                        {elemento.titulo === 'Repuestos'
                          ? 'Consultar repuestos y precios'
                          : elemento.titulo === 'Inventario'
                            ? 'Control de existencias PMP'
                            : 'Módulo de gestión'}
                      </p>

                      <div className="dashboard-tarjeta-pie">

                        <span>
                          {elemento.titulo === 'Repuestos'
                            ? 'Consultar repuestos'
                            : 'Ver módulo'}
                        </span>

                        <ChevronRight size={18} />

                      </div>

                    </button>
                  );
                })}

              </section>

              {/* ACTIVIDAD DEL TALLER */}

              <section className="dashboard-actividad">

                <div>

                  <h2>Gestión del taller</h2>

                  <p>
                    Aquí mostraremos las citas próximas,
                    los servicios en proceso y los
                    movimientos recientes cuando
                    conectemos los módulos a MySQL.
                  </p>

                </div>

                <div className="dashboard-actividad-icono">
                  <CalendarDays size={38} />
                </div>

              </section>

            </>

          ) : seccion === 'Clientes' ? (

            <Clientes />

          ) : seccion === 'Motocicletas' ? (

            <Motocicletas />

          ) : seccion === 'Citas' ? (

            <Citas />

          ) : seccion === 'Usuarios' ? (

            <Usuarios />

          ) : seccion === 'Repuestos' ? (

  <Repuestos />

) : seccion === 'Inventario' ? (

  <Inventario />

) : seccion === 'Reportes' ? (

  <ReportesMecanicos />

) : seccion === 'Facturación' ? (

  <Facturacion />

) : seccion === 'Servicios' ? (
            /* ========================================
               MÓDULO SERVICIOS
            ======================================== */

            mostrarCatalogo ? (

              <section className="dashboard-vista-catalogo">

                <button
                  type="button"
                  className="dashboard-volver"
                  onClick={() =>
                    setMostrarCatalogo(false)
                  }
                >
                  <ArrowLeft size={18} />
                  Volver a Servicios
                </button>

                <CatalogoServicios />

              </section>

            ) : mostrarOrdenes ? (

              <section className="dashboard-vista-catalogo">

                <button
                  type="button"
                  className="dashboard-volver"
                  onClick={() =>
                    setMostrarOrdenes(false)
                  }
                >
                  <ArrowLeft size={18} />
                  Volver a Servicios
                </button>

                <OrdenesTrabajo />

              </section>

            ) : (

              <section className="dashboard-modulo">

                <div className="dashboard-modulo-icono">
                  <Wrench size={42} />
                </div>

                <span className="dashboard-modulo-etiqueta">
                  GESTIÓN DEL TALLER
                </span>

                <h1>Gestión de Servicios</h1>

                <p>
                  Administra los trabajos realizados
                  a las motocicletas y consulta
                  los tipos de mantenimiento que
                  ofrece el taller.
                </p>

                <div className="dashboard-servicios-acciones">

                  {/* ÓRDENES DE TRABAJO */}

                  <button
                    type="button"
                    className="dashboard-servicio-accion"
                    onClick={() =>
                      setMostrarOrdenes(true)
                    }
                  >
                    <ClipboardList size={22} />
                    <span>
                      Gestionar órdenes de trabajo
                    </span>
                    <ChevronRight size={18} />
                  </button>

                  {/* CATÁLOGO DE SERVICIOS */}

                  <button
                    type="button"
                    className="dashboard-servicio-accion"
                    onClick={() =>
                      setMostrarCatalogo(true)
                    }
                  >
                    <ListChecks size={22} />
                    <span>
                      Gestionar tipos de servicios
                    </span>
                    <ChevronRight size={18} />
                  </button>

                </div>

                <button
                  type="button"
                  className="dashboard-volver"
                  onClick={() =>
                    cambiarSeccion('Inicio')
                  }
                >
                  <ArrowLeft size={18} />
                  Volver al inicio
                </button>

              </section>

            )

          ) : (

            /* ========================================
               RESTO DE MÓDULOS
            ======================================== */

            <section className="dashboard-modulo">

              <div className="dashboard-modulo-icono">
                <IconoActual size={42} />
              </div>

              <span className="dashboard-modulo-etiqueta">
                MÓDULO EN PREPARACIÓN
              </span>

              <h1>Gestión de {seccion}</h1>

              <p>
                {seccion === 'Inventario'
                  ? 'Controla las compras, existencias y movimientos de repuestos mediante el método PMP.'
                  : 'Módulo de gestión del taller.'}
              </p>

              {seccion === 'Inventario' && (

                <div className="dashboard-servicios-acciones">

                  <button
                    type="button"
                    className="dashboard-servicio-accion"
                    onClick={() =>
                      cambiarSeccion('Repuestos')
                    }
                  >
                    <Package size={22} />
                    <span>Consultar repuestos</span>
                    <ChevronRight size={18} />
                  </button>

                </div>

              )}

              {seccion === 'Usuarios' && (

                <div className="dashboard-modulo-info">

                  <ShieldCheck size={22} />

                  <span>
                    Aquí implementaremos el registro
                    de empleados, asignación de roles,
                    contraseñas temporales e
                    invitaciones por correo.
                  </span>

                </div>

              )}

              <button
                type="button"
                className="dashboard-volver"
                onClick={() =>
                  cambiarSeccion('Inicio')
                }
              >
                <ArrowLeft size={18} />
                Volver al inicio
              </button>

            </section>

          )}

        </main>

        {/* PIE DE PÁGINA */}

        <footer className="dashboard-footer">
          <span>© URABÁ MOTORS FC</span>
          <span>Sistema de gestión del taller</span>
        </footer>

      </div>

    </div>
  );
}
