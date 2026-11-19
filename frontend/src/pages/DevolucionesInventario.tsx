
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  Undo2,
  Truck,
  History,
  Search,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';

import { obtenerToken } from '../services/auth';

import './Inventario.css';

const API = 'http://localhost:3000/api';

type TipoDevolucion = 'CLIENTE' | 'PROVEEDOR';

type Vista =
  | 'cliente'
  | 'proveedor'
  | 'historial';

interface Props {
  vistaInicial?: Vista;
}

interface Operacion {
  id: string;
  repuestoId: string;
  repuestoNombre: string;
  cantidad: number;
  cantidadDisponible: number | string;
  valorUnitario: number | string;
  fecha: string;
  stockActual?: number;
  compraId?: string;
  numeroFacturaProveedor?: string;
  proveedor?: string;
}

interface Devolucion {
  id: string;
  tipoDevolucion: TipoDevolucion;
  ventaId: string | null;
  compraDetalleId: string | null;
  repuestoId: string;
  repuestoNombre: string;
  cantidad: number;
  valorUnitarioDevolucion: number | string;
  totalDevolucion: number | string;
  costoUnitarioInventario: number | string;
  motivo: string;
  usuarioNombre: string;
  numeroFacturaProveedor: string | null;
  proveedor: string | null;
  fechaDevolucion: string;
}

function dinero(valor: number | string) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(valor));
}

function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function encabezados() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${obtenerToken() ?? ''}`
  };
}

async function leerRespuesta(
  respuesta: Response
) {
  const datos =
    await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    throw new Error(
      datos?.mensaje ||
      `Error en la solicitud (${respuesta.status})`
    );
  }

  return datos;
}

export default function DevolucionesInventario({
  vistaInicial = 'cliente'
}: Props) {

  const [vista, setVista] =
    useState<Vista>(vistaInicial);

  const [ventas, setVentas] =
    useState<Operacion[]>([]);

  const [compras, setCompras] =
    useState<Operacion[]>([]);

  const [devoluciones, setDevoluciones] =
    useState<Devolucion[]>([]);

  const [operacionId, setOperacionId] =
    useState('');

  const [busqueda, setBusqueda] =
    useState('');

  const [cantidad, setCantidad] =
    useState('1');

  const [motivo, setMotivo] =
    useState('');

  const [aptoParaVenta, setAptoParaVenta] =
    useState(false);

  const [cargando, setCargando] =
    useState(true);

  const [guardando, setGuardando] =
    useState(false);

  const [sinPermiso, setSinPermiso] =
    useState(false);

  const [error, setError] =
    useState('');

  const [mensaje, setMensaje] =
    useState('');

  // ========================================
  // CARGAR OPERACIONES Y DEVOLUCIONES
  // ========================================

  async function cargarDatos(
    signal?: AbortSignal
  ) {
    setCargando(true);
    setError('');

    try {
      const [
        respuestaVentas,
        respuestaCompras,
        respuestaHistorial
      ] = await Promise.all([

        fetch(
          `${API}/devoluciones/ventas-disponibles`,
          {
            headers: encabezados(),
            signal
          }
        ),

        fetch(
          `${API}/devoluciones/compras-disponibles`,
          {
            headers: encabezados(),
            signal
          }
        ),

        fetch(
          `${API}/devoluciones`,
          {
            headers: encabezados(),
            signal
          }
        )

      ]);

      if (
        respuestaVentas.status === 403 ||
        respuestaCompras.status === 403 ||
        respuestaHistorial.status === 403
      ) {
        setSinPermiso(true);
        setVentas([]);
        setCompras([]);
        setDevoluciones([]);
        return;
      }

      const datosVentas =
        await leerRespuesta(respuestaVentas);

      const datosCompras =
        await leerRespuesta(respuestaCompras);

      const datosHistorial =
        await leerRespuesta(respuestaHistorial);

      if (
        !Array.isArray(datosVentas) ||
        !Array.isArray(datosCompras) ||
        !Array.isArray(datosHistorial)
      ) {
        throw new Error(
          'El servidor devolvió datos no válidos'
        );
      }

      if (signal?.aborted) return;

      setVentas(datosVentas);
      setCompras(datosCompras);
      setDevoluciones(datosHistorial);
      setSinPermiso(false);

    } catch (err) {

      if (signal?.aborted) return;

      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible cargar las devoluciones'
      );

      setVentas([]);
      setCompras([]);
      setDevoluciones([]);

    } finally {

      if (!signal?.aborted) {
        setCargando(false);
      }

    }
  }

  useEffect(() => {
    const controlador = new AbortController();

    void cargarDatos(controlador.signal);

    return () => controlador.abort();
  }, []);

  // ========================================
  // CAMBIAR VISTA
  // ========================================

  function limpiarFormulario() {
    setOperacionId('');
    setCantidad('1');
    setMotivo('');
    setAptoParaVenta(false);
    setBusqueda('');
  }

  function cambiarVista(nuevaVista: Vista) {
    limpiarFormulario();
    setVista(nuevaVista);
    setError('');
    setMensaje('');
  }

  function seleccionarOperacion(id: string) {
    setOperacionId(id);
    setCantidad('1');
    setAptoParaVenta(false);
    setError('');
    setMensaje('');
  }

  // ========================================
  // BUSCAR OPERACIÓN ORIGINAL
  // ========================================

  const esCliente = vista === 'cliente';

  const operaciones = esCliente
    ? ventas
    : compras;

  const textoBusqueda =
    normalizar(busqueda.trim());

  const operacionesFiltradas =
    operaciones.filter(operacion => {

      const texto = normalizar(
        [
          operacion.repuestoNombre,
          operacion.id,
          operacion.fecha,
          operacion.numeroFacturaProveedor ?? '',
          operacion.proveedor ?? ''
        ].join(' ')
      );

      return texto.includes(textoBusqueda);
    });

  const operacionSeleccionada =
    operaciones.find(
      operacion => operacion.id === operacionId
    );

  // ========================================
  // CALCULAR CANTIDADES E IMPORTES
  // ========================================

  const cantidadDisponible = Number(
    operacionSeleccionada?.cantidadDisponible ?? 0
  );

  const stockDisponible = Number(
    operacionSeleccionada?.stockActual ?? 0
  );

  // Para devolver al proveedor también debemos
  // disponer físicamente de la mercancía.

  const cantidadMaxima = esCliente
    ? cantidadDisponible
    : Math.min(
        cantidadDisponible,
        stockDisponible
      );

  const cantidadNumerica = Number(cantidad);

  const cantidadValida =
    Number.isInteger(cantidadNumerica) &&
    cantidadNumerica > 0 &&
    cantidadNumerica <= cantidadMaxima;

  const valorUnitario = Number(
    operacionSeleccionada?.valorUnitario ?? 0
  );

  const totalCentavos = cantidadValida
    ? Math.round(valorUnitario * 100) *
      cantidadNumerica
    : 0;

  const total = totalCentavos / 100;

  const devolucionValida =
    Boolean(operacionSeleccionada) &&
    cantidadValida &&
    motivo.trim().length >= 5 &&
    motivo.trim().length <= 200 &&
    valorUnitario > 0 &&
    Number.isSafeInteger(totalCentavos) &&
    total <= 9999999999.99 &&
    (!esCliente || aptoParaVenta);

  // ========================================
  // REGISTRAR DEVOLUCIÓN
  // ========================================

  async function guardarDevolucion(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (guardando) return;

    setError('');
    setMensaje('');

    if (
      !devolucionValida ||
      !operacionSeleccionada
    ) {
      setError(
        'Revisa la operación, cantidad y motivo de la devolución'
      );
      return;
    }

    const confirmar = window.confirm(
      `¿Registrar la devolución de ` +
      `${cantidadNumerica} unidad(es) de ` +
      `${operacionSeleccionada.repuestoNombre}? ` +
      `Importe: ${dinero(total)}. ` +
      'El inventario y el Kardex se actualizarán.'
    );

    if (!confirmar) return;

    setGuardando(true);

    try {
      const respuesta = await fetch(
        `${API}/devoluciones`,
        {
          method: 'POST',
          headers: encabezados(),

          body: JSON.stringify({

            tipoDevolucion:
              esCliente
                ? 'CLIENTE'
                : 'PROVEEDOR',

            origenId: operacionId,

            cantidad: cantidadNumerica,

            motivo: motivo.trim()

          })
        }
      );

      const datos =
        await leerRespuesta(respuesta);

      setMensaje(
        datos.mensaje ||
        'Devolución registrada correctamente'
      );

      limpiarFormulario();

      setVista('historial');

      await cargarDatos();

    } catch (err) {

      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible registrar la devolución'
      );

    } finally {

      setGuardando(false);

    }
  }

  // ========================================
  // FILTRAR HISTORIAL
  // ========================================

  const devolucionesFiltradas =
    devoluciones.filter(devolucion => {

      const texto = normalizar(
        [
          devolucion.repuestoNombre,
          devolucion.tipoDevolucion,
          devolucion.motivo,
          devolucion.usuarioNombre,
          devolucion.numeroFacturaProveedor ?? '',
          devolucion.proveedor ?? '',
          devolucion.ventaId ?? '',
          devolucion.id
        ].join(' ')
      );

      return texto.includes(textoBusqueda);
    });

  // ========================================
  // ESTADOS DE CARGA Y PERMISOS
  // ========================================

  if (cargando) {
    return (
      <section className="inventario-panel">
        <p>Cargando devoluciones de inventario...</p>
      </section>
    );
  }

  if (sinPermiso) {
    return (
      <section className="inventario-panel">
        <h2>Acceso restringido</h2>

        <p>
          No tienes permisos para registrar
          o consultar devoluciones.
        </p>
      </section>
    );
  }

  return (
    <div className="devoluciones-pagina">

      {/* PESTAÑAS */}

      <div className="inventario-tabs">

        <button
          type="button"
          disabled={guardando}
          className={
            vista === 'cliente' ? 'activo' : ''
          }
          onClick={() => cambiarVista('cliente')}
        >
          <Undo2 size={18} />
          Devolución de cliente
        </button>

        <button
          type="button"
          disabled={guardando}
          className={
            vista === 'proveedor' ? 'activo' : ''
          }
          onClick={() => cambiarVista('proveedor')}
        >
          <Truck size={18} />
          Devolución a proveedor
        </button>

        <button
          type="button"
          disabled={guardando}
          className={
            vista === 'historial' ? 'activo' : ''
          }
          onClick={() => cambiarVista('historial')}
        >
          <History size={18} />
          Historial
        </button>

      </div>

      {error && (
        <div
          className="inventario-mensaje error"
          role="alert"
        >
          {error}
        </div>
      )}

      {mensaje && (
        <div className="inventario-mensaje exito">
          {mensaje}
        </div>
      )}

      {vista !== 'historial' ? (

        /* FORMULARIO DE DEVOLUCIÓN */

        <form
          className="inventario-panel"
          onSubmit={guardarDevolucion}
        >

          <div className="inventario-titulo">

            <div>
              <h2>
                {esCliente
                  ? 'Registrar devolución de cliente'
                  : 'Registrar devolución a proveedor'}
              </h2>

              <p>
                {esCliente
                  ? 'Selecciona una venta de mostrador.'
                  : 'Selecciona un producto de una compra.'}
              </p>
            </div>

            <button
              type="button"
              className="inventario-btn secundario"
              disabled={guardando}
              onClick={() => {
                limpiarFormulario();
                void cargarDatos();
              }}
            >
              <RefreshCw size={17} />
              Actualizar
            </button>

          </div>

          <fieldset disabled={guardando}>

            {/* BUSCADOR */}

            <label className="devoluciones-etiqueta">

              {esCliente
                ? 'Buscar venta original'
                : 'Buscar compra original'}

            </label>

            <div className="kardex-busqueda">
              <Search size={19} />

              <input
                type="search"
                placeholder={
                  esCliente
                    ? 'Buscar repuesto, venta o fecha...'
                    : 'Buscar repuesto, factura o proveedor...'
                }
                value={busqueda}
                onChange={e =>
                  setBusqueda(e.target.value)
                }
              />
            </div>

            {/* RESULTADOS */}

            <div className="devoluciones-resultados">

              {operacionesFiltradas.length === 0 ? (

                <div className="inventario-vacio">
                  <Search size={32} />

                  <h3>
                    No hay operaciones disponibles
                  </h3>

                  <p>
                    No hay compras o ventas pendientes
                    de devolución que coincidan
                    con la búsqueda.
                  </p>
                </div>

              ) : (

                operacionesFiltradas.map(operacion => {

                  const seleccionado =
                    operacion.id === operacionId;

                  return (

                    <button
                      key={operacion.id}
                      type="button"
                      aria-pressed={seleccionado}
                      className={
                        `devoluciones-operacion ${
                          seleccionado
                            ? 'seleccionada'
                            : ''
                        }`
                      }
                      onClick={() =>
                        seleccionarOperacion(
                          operacion.id
                        )
                      }
                    >

                      <div>
                        <strong>
                          {operacion.repuestoNombre}
                        </strong>

                        <small>
                          {esCliente
                            ? `Venta #${operacion.id.slice(0, 8)}`
                            : `Factura ${operacion.numeroFacturaProveedor}`}
                          {' · '}
                          {operacion.fecha}
                        </small>

                        {!esCliente && (
                          <small>
                            {operacion.proveedor}
                          </small>
                        )}
                      </div>

                      <div className="devoluciones-operacion-datos">

                        <strong>
                          {dinero(operacion.valorUnitario)}
                        </strong>

                        <small>
                          Pendientes:{' '}
                          {operacion.cantidadDisponible}
                        </small>

                      </div>

                      {seleccionado && (
                        <CheckCircle2 size={20} />
                      )}

                    </button>

                  );
                })

              )}

            </div>

            {/* OPERACIÓN SELECCIONADA */}

            {operacionSeleccionada && (

              <>

                <div className="inventario-titulo detalle">
                  <div>
                    <h3>
                      Detalle de la devolución
                    </h3>

                    <p>
                      {operacionSeleccionada.repuestoNombre}
                    </p>
                  </div>
                </div>

                <div className="ventas-datos">

                  <div>
                    <span>
                      {esCliente
                        ? 'Cantidad vendida'
                        : 'Cantidad comprada'}
                    </span>

                    <strong>
                      {operacionSeleccionada.cantidad}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Pendientes de devolución
                    </span>

                    <strong>
                      {cantidadDisponible}
                    </strong>
                  </div>

                  <div>
                    <span>
                      {esCliente
                        ? 'Precio unitario original'
                        : 'Costo unitario original'}
                    </span>

                    <strong>
                      {dinero(valorUnitario)}
                    </strong>
                  </div>

                </div>

                {!esCliente && (

                  <div className="inventario-nota">
                    Existencias actuales: {stockDisponible}.
                    {' '}
                    Máximo disponible para devolver:{' '}
                    {cantidadMaxima} unidad(es).
                  </div>

                )}

                <div className="devoluciones-form-grid">

                  <label>
                    Cantidad a devolver *

                    <input
                      type="number"
                      min="1"
                      max={cantidadMaxima}
                      step="1"
                      required
                      value={cantidad}
                      onChange={e =>
                        setCantidad(e.target.value)
                      }
                    />

                    <small>
                      Máximo: {cantidadMaxima} unidades
                    </small>

                  </label>

                  <label>
                    Importe de la devolución

                    <input
                      type="text"
                      readOnly
                      value={dinero(total)}
                    />
                  </label>

                </div>

                {cantidadNumerica > cantidadMaxima && (

                  <div className="inventario-mensaje aviso">
                    La cantidad supera las unidades
                    disponibles para devolver.
                  </div>

                )}

                <label className="ajustes-motivo">
                  Motivo de la devolución *

                  <textarea
                    rows={3}
                    required
                    minLength={5}
                    maxLength={200}
                    placeholder="Describe el motivo de la devolución..."
                    value={motivo}
                    onChange={e =>
                      setMotivo(e.target.value)
                    }
                  />

                  <small>
                    {motivo.length}/200 caracteres
                  </small>

                </label>

                {esCliente && (

                  <label className="devoluciones-confirmacion">

                    <input
                      type="checkbox"
                      checked={aptoParaVenta}
                      onChange={e =>
                        setAptoParaVenta(
                          e.target.checked
                        )
                      }
                    />

                    <span>
                      Confirmo que la mercancía está en
                      buen estado y puede regresar al
                      inventario disponible para la venta.
                    </span>

                  </label>

                )}

                <div className="inventario-total">

                  <div>
                    <span>Total de la devolución</span>

                    <small>
                      {esCliente
                        ? 'Valor a devolver al cliente'
                        : 'Valor de mercancía devuelta al proveedor'}
                    </small>
                  </div>

                  <strong>{dinero(total)}</strong>

                </div>

                <div className="inventario-nota">
                  El servidor verificará las cantidades
                  pendientes, actualizará el stock,
                  calculará el PMP correspondiente
                  y registrará el movimiento en Kardex.
                  Esta operación no realiza pagos
                  ni reembolsos de dinero.
                </div>

              </>

            )}

            <div className="inventario-form-footer">

              <button
                type="submit"
                className="inventario-btn primario"
                disabled={
                  guardando || !devolucionValida
                }
              >

                <Undo2 size={18} />

                {guardando
                  ? 'Registrando...'
                  : 'Registrar devolución'}

              </button>

            </div>

          </fieldset>

        </form>

      ) : (

        /* HISTORIAL DE DEVOLUCIONES */

        <section className="inventario-panel">

          <div className="inventario-titulo">

            <div>
              <h2>Historial de devoluciones</h2>

              <p>
                Consulta devoluciones de clientes
                y proveedores.
              </p>
            </div>

            <button
              type="button"
              className="inventario-btn secundario"
              disabled={guardando}
              onClick={() => void cargarDatos()}
            >
              <RefreshCw size={17} />
              Actualizar
            </button>

          </div>

          <input
            type="search"
            className="inventario-busqueda"
            placeholder="Buscar repuesto, factura, motivo..."
            value={busqueda}
            onChange={e =>
              setBusqueda(e.target.value)
            }
          />

          {devolucionesFiltradas.length === 0 ? (

            <div className="inventario-vacio">

              <History size={40} />

              <h3>No hay devoluciones para mostrar</h3>

              <p>
                Registra una devolución
                o cambia la búsqueda.
              </p>

            </div>

          ) : (

            <div className="inventario-tabla-scroll">

              <table className="inventario-tabla">

                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Repuesto</th>
                    <th>Origen</th>
                    <th>Cantidad</th>
                    <th>Importe</th>
                    <th>Motivo</th>
                    <th>Usuario</th>
                  </tr>
                </thead>

                <tbody>

                  {devolucionesFiltradas.map(
                    devolucion => (

                      <tr key={devolucion.id}>

                        <td>
                          {devolucion.fechaDevolucion}
                        </td>

                        <td>
                          <span
                            className={
                              `kardex-movimiento ${
                                devolucion.tipoDevolucion === 'CLIENTE'
                                  ? 'entrada'
                                  : 'salida'
                              }`
                            }
                          >
                            {
                              devolucion.tipoDevolucion === 'CLIENTE'
                                ? 'Cliente'
                                : 'Proveedor'
                            }
                          </span>
                        </td>

                        <td>
                          <strong>
                            {devolucion.repuestoNombre}
                          </strong>
                        </td>

                        <td>
                          {devolucion.tipoDevolucion === 'CLIENTE'
                            ? `Venta #${devolucion.ventaId?.slice(0, 8) ?? '—'}`
                            : `Factura ${devolucion.numeroFacturaProveedor ?? '—'}`}
                        </td>

                        <td
                          className={
                            devolucion.tipoDevolucion === 'CLIENTE'
                              ? 'kardex-positivo'
                              : 'kardex-negativo'
                          }
                        >
                          {
                            devolucion.tipoDevolucion === 'CLIENTE'
                              ? '+'
                              : '−'
                          }
                          {devolucion.cantidad}
                        </td>

                        <td>
                          <strong>
                            {dinero(
                              devolucion.totalDevolucion
                            )}
                          </strong>
                        </td>

                        <td className="ajustes-celda-motivo">
                          {devolucion.motivo}
                        </td>

                        <td>
                          {devolucion.usuarioNombre}
                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

        </section>

      )}

    </div>
  );
}
