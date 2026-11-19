
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  Wrench,
  Package,
  Search,
  Plus,
  RefreshCw
} from 'lucide-react';

import { obtenerToken } from '../services/auth';

import './DetalleEconomicoOrden.css';

const API = 'https://uraba-motors-fc.onrender.com/api';

// ========================================
// INTERFACES
// ========================================

interface Props {
  ordenId: string;
  estado: string;
  onTotalActualizado: (total: number) => void;
}

interface TipoServicio {
  id: string;
  nombre: string;
  precioManoObra: number | string;
  activo?: number | boolean | string;
}

interface Repuesto {
  id: string;
  nombre: string;
  stockActual: number;
  precioVenta: number | string;
}

interface TrabajoOrden {
  id: string;
  catalogoServicioId: string;
  servicioNombre: string;
  precioAplicado: number | string;
  estado: string;
}

interface RepuestoOrden {
  id: string;
  repuestoId: string;
  repuestoNombre: string;
  cantidad: number;
  precioUnitarioVenta: number | string;
  subtotal: number | string;
}

interface DetalleOrden {
  ordenId: string;
  estado: string;
  costo: number;
  trabajos: TrabajoOrden[];
  repuestos: RepuestoOrden[];

  totales: {
    totalManoObra: number;
    totalRepuestos: number;
    total: number;
  };
}

interface SolicitudConsumo {
  repuestoId: string;
  cantidad: number;
  solicitudId: string;
}

// ========================================
// FUNCIONES AUXILIARES
// ========================================

function dinero(valor: number | string) {
  return Number(valor).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2
  });
}

function normalizar(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function mensajeError(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Ocurrió un error inesperado';
}

function extraerLista<T>(
  datos: unknown,
  claves: string[]
): T[] {
  if (Array.isArray(datos)) {
    return datos as T[];
  }

  if (datos && typeof datos === 'object') {
    const objeto =
      datos as Record<string, unknown>;

    for (const clave of claves) {
      if (Array.isArray(objeto[clave])) {
        return objeto[clave] as T[];
      }
    }
  }

  throw new Error(
    'El servidor no devolvió una lista válida'
  );
}

// ========================================
// SOLICITUDES AL BACKEND
// ========================================

async function solicitar<T>(
  ruta: string,
  opciones: RequestInit = {}
): Promise<T> {

  const token = obtenerToken();

  if (!token) {
    throw new Error(
      'Tu sesión ha expirado. Inicia sesión nuevamente.'
    );
  }

  const respuesta = await fetch(
    `${API}${ruta}`,
    {
      ...opciones,

      headers: {
        Authorization: `Bearer ${token}`,

        ...(opciones.body
          ? {
              'Content-Type': 'application/json'
            }
          : {}),

        ...opciones.headers
      }
    }
  );

  const datos = await respuesta
    .json()
    .catch(() => null);

  if (!respuesta.ok) {
  const error = new Error(
    datos?.mensaje ||
    `Error del servidor (${respuesta.status})`
  );

  Object.assign(error, {
    codigo: datos?.codigo,
    status: respuesta.status
  });

  throw error;
}

  return datos as T;
}

// ========================================
// COMPONENTE PRINCIPAL
// ========================================

export default function DetalleEconomicoOrden({
  ordenId,
  estado,
  onTotalActualizado
}: Props) {

  const [detalle, setDetalle] =
    useState<DetalleOrden | null>(null);

  const [catalogo, setCatalogo] =
    useState<TipoServicio[]>([]);

  const [repuestos, setRepuestos] =
    useState<Repuesto[]>([]);

  const [servicioId, setServicioId] =
    useState('');
const [busquedaServicio, setBusquedaServicio] =
  useState('');
  const [repuestoId, setRepuestoId] =
    useState('');

  const [busqueda, setBusqueda] =
    useState('');

  const [cantidad, setCantidad] =
    useState('1');

  const [cargando, setCargando] =
    useState(true);

  const [guardando, setGuardando] =
    useState(false);

  const [error, setError] =
    useState('');

  const [errorCatalogo, setErrorCatalogo] =
    useState('');

  const [errorRepuestos, setErrorRepuestos] =
    useState('');

  const [mensaje, setMensaje] =
    useState('');

  const bloqueo = useRef(false);

  const solicitudPendiente =
    useRef<SolicitudConsumo | null>(null);

  // ========================================
  // ESTADO DE LA ORDEN
  // ========================================

  const editable =
    estado === 'EN_PROCESO' ||
    estado === 'PAUSADO';

  const clavePendiente =
    `uraba-consumo-pendiente-${ordenId}`;

  const [pendiente, setPendiente] =
    useState<SolicitudConsumo | null>(() => {
      try {
        const guardado =
          sessionStorage.getItem(
            clavePendiente
          );

        return guardado
          ? JSON.parse(guardado)
          : null;
      } catch {
        return null;
      }
    });

  // ========================================
  // CARGAR DETALLE Y CATÁLOGOS
  // ========================================

  async function cargarDatos(
    signal?: AbortSignal
  ) {
    setCargando(true);
    setError('');
    setErrorCatalogo('');
    setErrorRepuestos('');

    const resultados =
      await Promise.allSettled([
        solicitar<DetalleOrden>(
          `/ordenes/${ordenId}`,
          { signal }
        ),

        solicitar<unknown>(
          '/catalogo-servicios',
          { signal }
        ),

        solicitar<unknown>(
          '/repuestos',
          { signal }
        )
      ]);

    if (signal?.aborted) {
      return;
    }

    const [
      resultadoDetalle,
      resultadoCatalogo,
      resultadoRepuestos
    ] = resultados;

    if (
      resultadoDetalle.status === 'fulfilled'
    ) {
      setDetalle(resultadoDetalle.value);

      onTotalActualizado(
        resultadoDetalle.value.costo
      );
    } else {
      setError(
        mensajeError(
          resultadoDetalle.reason
        )
      );
    }

    if (
      resultadoCatalogo.status === 'fulfilled'
    ) {
      try {
        const servicios =
          extraerLista<TipoServicio>(
            resultadoCatalogo.value,
            ['servicios', 'catalogo', 'data']
          );

        setCatalogo(
          servicios.filter(servicio =>
            servicio.activo === undefined ||
            Number(servicio.activo) === 1
          )
        );

      } catch (error) {
        setErrorCatalogo(
          mensajeError(error)
        );
      }
    } else {
      setErrorCatalogo(
        mensajeError(
          resultadoCatalogo.reason
        )
      );
    }

    if (
      resultadoRepuestos.status === 'fulfilled'
    ) {
      try {
        setRepuestos(
          extraerLista<Repuesto>(
            resultadoRepuestos.value,
            ['repuestos', 'data']
          )
        );

      } catch (error) {
        setErrorRepuestos(
          mensajeError(error)
        );
      }
    } else {
      setErrorRepuestos(
        mensajeError(
          resultadoRepuestos.reason
        )
      );
    }

    setCargando(false);
  }

  useEffect(() => {
    const controlador =
      new AbortController();

    void cargarDatos(
      controlador.signal
    );

    return () => {
      controlador.abort();
    };
  }, [ordenId]);

  // ========================================
  // BUSCADOR DE REPUESTOS
  // ========================================

  const repuestosFiltrados = useMemo(() => {
    const termino = normalizar(busqueda);

    return repuestos
      .filter(repuesto =>
        normalizar(repuesto.nombre)
          .includes(termino)
      )
      .slice(0, 30);
  }, [repuestos, busqueda]);

  const repuestoSeleccionado =
    repuestos.find(
      repuesto => repuesto.id === repuestoId
    );

  const servicioSeleccionado =
    catalogo.find(
      servicio => servicio.id === servicioId
    );
    const serviciosFiltrados = useMemo(() => {
  const termino = normalizar(busquedaServicio);

  return catalogo
    .filter(servicio =>
      normalizar(servicio.nombre)
        .includes(termino)
    )
    .filter(servicio =>
      !detalle?.trabajos.some(
        trabajo =>
          trabajo.catalogoServicioId === servicio.id &&
          trabajo.estado !== 'CANCELADO'
      )
    )
    .slice(0, 30);

}, [catalogo, busquedaServicio, detalle]);

  const cantidadNumerica =
    Number(cantidad);

  const cantidadValida =
    Number.isInteger(cantidadNumerica) &&
    cantidadNumerica > 0 &&
    repuestoSeleccionado !== undefined &&
    cantidadNumerica <=
      Number(repuestoSeleccionado.stockActual);

  const subtotalEstimado =
    repuestoSeleccionado &&
    cantidadValida
      ? Number(
          repuestoSeleccionado.precioVenta
        ) * cantidadNumerica
      : 0;

  // ========================================
  // AGREGAR MANO DE OBRA
  // ========================================

  async function agregarTrabajo() {
    if (
      !editable ||
      !servicioSeleccionado ||
      !detalle ||
      bloqueo.current ||
      pendiente
    ) {
      return;
    }

    const confirmado = window.confirm(
      `¿Agregar ${servicioSeleccionado.nombre} ` +
      `por ${dinero(
        servicioSeleccionado.precioManoObra
      )} a esta orden?`
    );

    if (!confirmado) {
      return;
    }

    bloqueo.current = true;
    setGuardando(true);
    setError('');
    setMensaje('');

    try {
      const respuesta =
        await solicitar<{
          mensaje: string;
          trabajo: {
            totales: {
              total: number;
            };
          };
        }>(
          `/ordenes/${ordenId}/trabajos`,
          {
            method: 'POST',

            body: JSON.stringify({
              catalogoServicioId:
                servicioSeleccionado.id
            })
          }
        );

      onTotalActualizado(
        respuesta.trabajo.totales.total
      );

      setServicioId('');
setBusquedaServicio('');
      setMensaje(
        respuesta.mensaje
      );

      await cargarDatos();

    } catch (error) {
      setError(
        mensajeError(error)
      );

    } finally {
      bloqueo.current = false;
      setGuardando(false);
    }
  }

  // ========================================
  // REGISTRAR CONSUMO DE REPUESTOS
  // ========================================

  async function enviarConsumo(
    solicitud: SolicitudConsumo
  ) {
    if (bloqueo.current) {
      return;
    }

    bloqueo.current = true;
    setGuardando(true);
    setError('');
    setMensaje('');

    try {
      const respuesta =
        await solicitar<{
          mensaje: string;

          repuesto: {
            yaRegistrado: boolean;

            totales: {
              total: number;
            };
          };
        }>(
          `/ordenes/${ordenId}/repuestos`,
          {
            method: 'POST',

            body: JSON.stringify(
              solicitud
            )
          }
        );

      // Solo limpiar la solicitud después
      // de recibir confirmación del backend.

      solicitudPendiente.current = null;

      sessionStorage.removeItem(
        clavePendiente
      );

      setPendiente(null);
      setRepuestoId('');
      setBusqueda('');
      setCantidad('1');

      onTotalActualizado(
        respuesta.repuesto.totales.total
      );

      setMensaje(
        respuesta.mensaje
      );

      await cargarDatos();

   } catch (error) {
  const codigo =
    error instanceof Error &&
    'codigo' in error
      ? String(error.codigo)
      : '';

  const rechazosDefinitivos = [
    'STOCK_INSUFICIENTE',
    'REPUESTO_NO_EXISTE',
    'REPUESTO_ID_INVALIDO',
    'CANTIDAD_INVALIDA',
    'ORDEN_NO_EDITABLE',
    'PRECIO_INVALIDO',
    'TOTAL_ORDEN_INVALIDO',
    'SOLICITUD_ID_INVALIDO'
  ];

  if (
    rechazosDefinitivos.includes(codigo)
  ) {
    solicitudPendiente.current = null;

    sessionStorage.removeItem(
      clavePendiente
    );

    setPendiente(null);
  }

  setError(
    mensajeError(error)
  );

} finally {
  bloqueo.current = false;
  setGuardando(false);
}
  }

  async function agregarRepuesto() {
    if (
      !editable ||
      !detalle ||
      !repuestoSeleccionado ||
      !cantidadValida ||
      bloqueo.current ||
      pendiente
    ) {
      return;
    }

    const confirmado = window.confirm(
      `¿Registrar el consumo de ` +
      `${cantidadNumerica} unidad(es) de ` +
      `${repuestoSeleccionado.nombre}?\n\n` +
      `Se descontarán las existencias del inventario.`
    );

    if (!confirmado) {
      return;
    }

    const solicitud: SolicitudConsumo = {
      repuestoId:
        repuestoSeleccionado.id,

      cantidad:
        cantidadNumerica,

      solicitudId:
        crypto.randomUUID()
    };

    try {
      // Conservamos el identificador para
      // reintentar sin duplicar el consumo.

      sessionStorage.setItem(
        clavePendiente,
        JSON.stringify(solicitud)
      );

    } catch {
      setError(
        'No fue posible guardar la solicitud de forma segura.'
      );

      return;
    }

    solicitudPendiente.current =
      solicitud;

    setPendiente(solicitud);

    await enviarConsumo(solicitud);
  }

  // ========================================
  // INTERFAZ
  // ========================================

  return (
    <section className="deo-contenedor">

      <div className="deo-cabecera">
        <div>
          <h3>Trabajos y repuestos</h3>

          <p>
            Administra el costo de la orden
            y los consumos de inventario.
          </p>
        </div>

        <button
          type="button"
          className="deo-boton-secundario"
          onClick={() => void cargarDatos()}
          disabled={cargando || guardando}
          aria-label="Actualizar detalle"
        >
          <RefreshCw size={17} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="deo-error" role="alert">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="deo-exito" role="status">
          {mensaje}
        </div>
      )}

      {pendiente && (
        <div className="deo-aviso">
          <strong>
            Hay un consumo pendiente de confirmación
          </strong>

          <p>
            Reintenta la misma solicitud para
            comprobar que el consumo se registró
            sin descontar inventario dos veces.
          </p>

          <button
            type="button"
            className="deo-boton"
            disabled={guardando || cargando}
            onClick={() =>
              void enviarConsumo(pendiente)
            }
          >
            {guardando
              ? 'Verificando...'
              : 'Reintentar consumo'}
          </button>
        </div>
      )}

      {cargando && (
        <p className="deo-vacio">
          Consultando información...
        </p>
      )}

      {!cargando && detalle && (
        <>

          {/* ============================= */}
          {/* MANO DE OBRA */}
          {/* ============================= */}

          <div className="deo-panel">

            <h4>
              <Wrench size={19} />
              Mano de obra
            </h4>

            {detalle.trabajos.length === 0 ? (
              <p className="deo-vacio">
                No hay trabajos registrados.
                Selecciona el servicio correspondiente.
              </p>
            ) : (
              <div className="deo-listado">

                {detalle.trabajos.map(trabajo => (
                  <div
                    className="deo-fila"
                    key={trabajo.id}
                  >
                    <div>
                      <strong>
                        {trabajo.servicioNombre}
                      </strong>

                      <small>
                        {trabajo.estado.replace(
                          /_/g,
                          ' '
                        )}
                      </small>
                    </div>

                    <strong>
                      {dinero(
                        trabajo.precioAplicado
                      )}
                    </strong>
                  </div>
                ))}

              </div>
            )}

            {editable && (
              <div className="deo-formulario">

                {errorCatalogo && (
                  <p className="deo-error">
                    {errorCatalogo}
                  </p>
                )}

               
<label>
  Buscar trabajo del catálogo

  <div className="deo-buscador">
    <Search size={18} />

    <input
      type="search"
      value={busquedaServicio}
      placeholder="Buscar tipo de servicio..."
      disabled={
        guardando ||
        !!pendiente ||
        !!errorCatalogo
      }
      onChange={evento => {
        setBusquedaServicio(
          evento.target.value
        );

        setServicioId('');
      }}
    />
  </div>
</label>

{/* RESULTADOS DE LA BÚSQUEDA */}

{busquedaServicio.trim() &&
  !servicioSeleccionado &&
  !errorCatalogo && (

    <div className="deo-resultados">

      {serviciosFiltrados.length === 0 ? (
        <p>
          No se encontraron trabajos disponibles.
        </p>
      ) : (
        serviciosFiltrados.map(servicio => (

          <button
            type="button"
            key={servicio.id}
            disabled={
              guardando ||
              !!pendiente
            }
            onClick={() => {
              setServicioId(servicio.id);

              setBusquedaServicio(
                servicio.nombre
              );
            }}
          >
            <span>
              <strong>
                {servicio.nombre}
              </strong>

              <small>
                Mano de obra
              </small>
            </span>

            <strong>
              {dinero(
                servicio.precioManoObra
              )}
            </strong>
          </button>

        ))
      )}

    </div>
  )}

{/* TRABAJO SELECCIONADO */}

{servicioSeleccionado && (

  <div className="deo-seleccion">

    <strong>
      {servicioSeleccionado.nombre}
    </strong>

    <div className="deo-fila">
      <span>Precio de mano de obra</span>

      <strong>
        {dinero(
          servicioSeleccionado.precioManoObra
        )}
      </strong>
    </div>

    <button
      type="button"
      className="deo-boton-secundario"
      disabled={
        guardando ||
        !!pendiente
      }
      onClick={() => {
        setServicioId('');
        setBusquedaServicio('');
      }}
    >
      Cambiar trabajo
    </button>

  </div>
)}


                <button
                  type="button"
                  className="deo-boton"
                  onClick={() =>
                    void agregarTrabajo()
                  }
                  disabled={
                    !servicioSeleccionado ||
                    guardando ||
                    !!pendiente ||
                    !!errorCatalogo
                  }
                >
                  <Plus size={17} />
                  Agregar trabajo
                </button>
              </div>
            )}

          </div>

          {/* ============================= */}
          {/* REPUESTOS UTILIZADOS */}
          {/* ============================= */}

          <div className="deo-panel">

            <h4>
              <Package size={19} />
              Repuestos utilizados
            </h4>

            {detalle.repuestos.length === 0 ? (
              <p className="deo-vacio">
                Todavía no se han registrado repuestos.
              </p>
            ) : (
              <div className="deo-listado">

                {detalle.repuestos.map(repuesto => (
                  <div
                    className="deo-fila"
                    key={repuesto.id}
                  >
                    <div>
                      <strong>
                        {repuesto.repuestoNombre}
                      </strong>

                      <small>
                        {repuesto.cantidad}
                        {' × '}
                        {dinero(
                          repuesto.precioUnitarioVenta
                        )}
                      </small>
                    </div>

                    <strong>
                      {dinero(
                        repuesto.subtotal
                      )}
                    </strong>
                  </div>
                ))}

              </div>
            )}

            {editable && (
              <div className="deo-formulario">

                {errorRepuestos && (
                  <p className="deo-error">
                    {errorRepuestos}
                  </p>
                )}

                <label>
                  Buscar repuesto

                  <div className="deo-buscador">
                    <Search size={18} />

                    <input
                      type="search"
                      value={busqueda}
                      placeholder="Nombre del repuesto..."
                      disabled={
                        guardando ||
                        !!pendiente
                      }
                      onChange={evento => {
                        setBusqueda(
                          evento.target.value
                        );

                        setRepuestoId('');
                        setCantidad('1');
                      }}
                    />
                  </div>
                </label>

                {busqueda.trim() &&
                  !repuestoSeleccionado &&
                  !errorRepuestos && (
                    <div className="deo-resultados">

                      {repuestosFiltrados.length === 0 ? (
                        <p>
                          No se encontraron repuestos.
                        </p>
                      ) : (
                        repuestosFiltrados.map(
                          repuesto => (
                            <button
                              type="button"
                              key={repuesto.id}
                              disabled={
                                guardando ||
                                !!pendiente ||
                                Number(
                                  repuesto.stockActual
                                ) <= 0 ||
                                Number(
                                  repuesto.precioVenta
                                ) <= 0
                              }
                              onClick={() => {
                                setRepuestoId(
                                  repuesto.id
                                );

                                setBusqueda(
                                  repuesto.nombre
                                );

                                setCantidad('1');
                              }}
                            >
                              <span>
                                <strong>
                                  {repuesto.nombre}
                                </strong>

                                <small>
                                  Stock:
                                  {' '}
                                  {repuesto.stockActual}
                                </small>
                              </span>

                              <strong>
                                {dinero(
                                  repuesto.precioVenta
                                )}
                              </strong>
                            </button>
                          )
                        )
                      )}

                    </div>
                  )}

                {repuestoSeleccionado && (
                  <div className="deo-seleccion">

                    <strong>
                      {repuestoSeleccionado.nombre}
                    </strong>

                    <p>
                      Existencias disponibles:
                      {' '}
                      <b>
                        {repuestoSeleccionado.stockActual}
                      </b>
                    </p>

                    <p>
                      Precio unitario:
                      {' '}
                      <b>
                        {dinero(
                          repuestoSeleccionado.precioVenta
                        )}
                      </b>
                    </p>

                    <label>
                      Cantidad utilizada

                      <input
                        type="number"
                        min={1}
                        max={
                          repuestoSeleccionado.stockActual
                        }
                        step={1}
                        value={cantidad}
                        disabled={
                          guardando ||
                          !!pendiente
                        }
                        onChange={evento =>
                          setCantidad(
                            evento.target.value
                          )
                        }
                      />
                    </label>

                    <div className="deo-fila">
                      Subtotal estimado

                      <strong>
                        {dinero(
                          subtotalEstimado
                        )}
                      </strong>
                    </div>

                  </div>
                )}

                <button
                  type="button"
                  className="deo-boton"
                  onClick={() =>
                    void agregarRepuesto()
                  }
                  disabled={
                    !cantidadValida ||
                    guardando ||
                    !!pendiente ||
                    !!errorRepuestos ||
                    Number(
                      repuestoSeleccionado?.precioVenta
                      ?? 0
                    ) <= 0
                  }
                >
                  <Plus size={17} />

                  {guardando
                    ? 'Registrando...'
                    : 'Registrar repuesto utilizado'}
                </button>

              </div>
            )}

          </div>

          {/* ============================= */}
          {/* TOTAL DE LA ORDEN */}
          {/* ============================= */}

          <div className="deo-totales">

            <h4>Resumen económico</h4>

            <div className="deo-fila">
              <span>Mano de obra</span>

              <strong>
                {dinero(
                  detalle.totales.totalManoObra
                )}
              </strong>
            </div>

            <div className="deo-fila">
              <span>Repuestos utilizados</span>

              <strong>
                {dinero(
                  detalle.totales.totalRepuestos
                )}
              </strong>
            </div>

            <div className="deo-total-final">
              <span>Total de la orden</span>

              <strong>
                {dinero(
                  detalle.totales.total
                )}
              </strong>
            </div>

            {Number(detalle.costo) !==
              Number(detalle.totales.total) && (
                <p className="deo-error">
                  Esta orden tiene un total anterior
                  que no coincide con sus detalles.
                  Debe revisarse antes de modificarla.
                </p>
              )}

          </div>

          {!editable && (
            <p className="deo-aviso">
              Esta orden no permite agregar
              trabajos ni repuestos en su estado actual.
            </p>
          )}

        </>
      )}

    </section>
  );
}
