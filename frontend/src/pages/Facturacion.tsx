
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import {
  Receipt,
  RefreshCw,
  ClipboardList,
  Eye,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Wallet,
  Download,
  Search
} from 'lucide-react';

import { obtenerToken, tienePermiso } from '../services/auth';
import RegistrarPagoFactura from './RegistrarPagoFactura';
import './facturacion.css';
import { descargarFacturaPDF } from './descargarFacturaPDF';
const API = 'https://uraba-motors-fc.onrender.com/api';

type EstadoFactura =
  | 'PENDIENTE'
  | 'PAGADO'
  | 'ANULADO';

type FiltroEstado = EstadoFactura | 'TODAS';
type Vista = 'pendientes' | 'historial';

interface OrdenPendiente {
  id: string;
  descripcion: string;
  estado: string;
  costo: string | number;
  clienteNombre: string;
  motoPlaca: string;
  motoMarca: string;
  motoModelo: string;
  mecanicoNombre: string;
  tiempoFin: string | null;
}

interface Factura {
  id: string;
  numero: string;
  clienteNombre: string;
  motoPlaca: string | null;
  total: string | number;
  estado: EstadoFactura;
  totalPagado: string | number;
  saldoPendiente: string | number;
  created: string;
}

interface TrabajoFacturado {
  id: string;
  descripcion: string;
  costoAplicado: string | number;
}

interface RepuestoFacturado {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: string | number;
  subtotal: string | number;
}

interface PagoRegistrado {
  id: string;
  monto: string | number;
  tipoPago: string;
  referencia: string | null;
  estado: string;
  created: string;
}

interface DetalleFactura extends Factura {
  subtotal: string | number;
  impuesto: string | number;
  servicioId: string | null;
  trabajos: TrabajoFacturado[];
  repuestos: RepuestoFacturado[];
  pagos: PagoRegistrado[];
  requiereRevision?: boolean;
}

function moneda(valor: number | string | null | undefined) {
  const numero = Number(valor ?? 0);

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2
  }).format(Number.isFinite(numero) ? numero : 0);
}

function fecha(valor: string | null | undefined) {
  if (!valor) return 'Sin fecha';

  const convertida = new Date(valor);

  if (Number.isNaN(convertida.getTime())) {
    return valor;
  }

  return convertida.toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

async function peticion<T>(
  ruta: string,
  opciones: RequestInit = {}
): Promise<T> {
  const token = obtenerToken();

  if (!token) {
    throw new Error(
      'Tu sesión no está disponible. Inicia sesión nuevamente.'
    );
  }

  const respuesta = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      ...opciones.headers
    }
  });

  const datos: unknown = await respuesta
    .json()
    .catch(() => null);

  if (!respuesta.ok) {
    const mensaje =
      datos &&
      typeof datos === 'object' &&
      'mensaje' in datos &&
      typeof datos.mensaje === 'string'
        ? datos.mensaje
        : `Error HTTP ${respuesta.status}`;

    throw new Error(mensaje);
  }

  return datos as T;
}

export default function Facturacion() {
  const puedeGenerarFacturas = tienePermiso('facturacion.generar');
  const puedeVerFacturas = tienePermiso('facturacion.ver');
  const puedeRegistrarPagos = tienePermiso('pagos.registrar');

  const [vista, setVista] =
    useState<Vista>(() =>
      puedeGenerarFacturas ? 'pendientes' : 'historial'
    );

  const [ordenes, setOrdenes] =
    useState<OrdenPendiente[]>([]);

  const [facturas, setFacturas] =
    useState<Factura[]>([]);

  const [detalle, setDetalle] =
    useState<DetalleFactura | null>(null);

  const [cargando, setCargando] =
    useState(true);

  const [generandoId, setGenerandoId] =
    useState<string | null>(null);

  const [abriendoId, setAbriendoId] =
    useState<string | null>(null);

  const [error, setError] =
    useState('');

  const [mensaje, setMensaje] =
    useState('');

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] =
    useState<FiltroEstado>('TODAS');

  // Evita solicitudes duplicadas al hacer doble clic.
  const generandoRef = useRef(false);

  // ========================================
  // CARGAR ÓRDENES Y FACTURAS
  // ========================================

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError('');

    try {
      const [pendientes, historial] = await Promise.all([
        puedeGenerarFacturas
          ? peticion<OrdenPendiente[]>('/facturas/pendientes')
          : Promise.resolve([] as OrdenPendiente[]),
        puedeVerFacturas
          ? peticion<Factura[]>('/facturas')
          : Promise.resolve([] as Factura[])
      ]);

      if (
        !Array.isArray(pendientes) ||
        !Array.isArray(historial)
      ) {
        throw new Error(
          'El servidor devolvió un formato inesperado.'
        );
      }

      setOrdenes(pendientes);
      setFacturas(historial);

    } catch (fallo) {
      setError(
        fallo instanceof Error
          ? fallo.message
          : 'No fue posible cargar Facturación.'
      );

    } finally {
      setCargando(false);
    }
  }, [puedeGenerarFacturas, puedeVerFacturas]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const terminoBusqueda = busqueda.trim().toLocaleLowerCase('es-CO');
  const ordenesFiltradas = ordenes.filter(orden =>
    [
      orden.descripcion,
      orden.clienteNombre,
      orden.motoPlaca,
      orden.motoMarca,
      orden.motoModelo,
      orden.mecanicoNombre
    ].some(valor =>
      valor.toLocaleLowerCase('es-CO').includes(terminoBusqueda)
    )
  );
  const facturasFiltradas = facturas.filter(factura =>
    (filtroEstado === 'TODAS' || factura.estado === filtroEstado) &&
    [
      factura.numero,
      factura.clienteNombre,
      factura.motoPlaca ?? ''
    ].some(valor =>
      valor.toLocaleLowerCase('es-CO').includes(terminoBusqueda)
    )
  );
  const facturasVigentes = facturas.filter(
    factura => factura.estado !== 'ANULADO'
  );
  const totalFacturado = facturasVigentes.reduce(
    (total, factura) => total + Number(factura.total || 0),
    0
  );
  const totalRecaudado = facturasVigentes.reduce(
    (total, factura) => total + Number(factura.totalPagado || 0),
    0
  );
  const saldoPorCobrar = facturasVigentes.reduce(
    (total, factura) => total + Number(factura.saldoPendiente || 0),
    0
  );

  // ========================================
  // GENERAR FACTURA
  // ========================================

  async function generarFactura(
    orden: OrdenPendiente
  ) {
    if (generandoRef.current) return;

    const confirmado = window.confirm(
      `¿Generar la factura de esta orden?\n\n` +
      `Cliente: ${orden.clienteNombre}\n` +
      `Motocicleta: ${orden.motoPlaca}\n` +
      `Total: ${moneda(orden.costo)}\n\n` +
      'Se guardará una factura interna. ' +
      'No se descontará nuevamente el inventario.'
    );

    if (!confirmado) return;

    generandoRef.current = true;
    setGenerandoId(orden.id);
    setError('');
    setMensaje('');

    try {
      const resultado = await peticion<{
        mensaje: string;
        factura: { id: string; numero: string };
      }>(
        `/facturas/desde-orden/${encodeURIComponent(
          orden.id
        )}`,
        { method: 'POST' }
      );

      setMensaje(
        `Factura ${resultado.factura.numero} ` +
        'generada correctamente.'
      );

      await cargarDatos();

      if (puedeVerFacturas) {
        setVista('historial');

        const factura = await peticion<DetalleFactura>(
          `/facturas/${encodeURIComponent(
            resultado.factura.id
          )}`
        );

        setDetalle(factura);
      }

    } catch (fallo) {
      setError(
        fallo instanceof Error
          ? fallo.message
          : 'No fue posible generar la factura.'
      );

      // Si hubo un fallo de red después de guardar,
      // refrescar antes de intentar nuevamente.
      try {
        await cargarDatos();
      } catch {
        // El mensaje original permanece visible.
      }

    } finally {
      generandoRef.current = false;
      setGenerandoId(null);
    }
  }

  // ========================================
  // ABRIR DETALLE DE FACTURA
  // ========================================

  async function abrirFactura(facturaId: string) {
    setAbriendoId(facturaId);
    setError('');
    setMensaje('');

    try {
      const resultado = await peticion<DetalleFactura>(
        `/facturas/${encodeURIComponent(facturaId)}`
      );

      setDetalle(resultado);

    } catch (fallo) {
      setError(
        fallo instanceof Error
          ? fallo.message
          : 'No fue posible consultar la factura.'
      );

    } finally {
      setAbriendoId(null);
    }
  }

  // ========================================
  // DETALLE DE UNA FACTURA
  // ========================================

  if (detalle) {
    return (
      <section className="facturacion-pagina">
        <button
          type="button"
          className="facturacion-volver"
          onClick={() => setDetalle(null)}
        >
          <ArrowLeft size={18} />
          Volver a Facturación
        </button>

        <div className="facturacion-titulo">
          <Receipt size={27} />
          <button
  type="button"
  className="facturacion-descargar"
  onClick={() => descargarFacturaPDF(detalle)}
>
  <Download size={19} />
  Descargar factura PDF
</button>
          <div>
            <h2>Factura {detalle.numero}</h2>
            <p>Comprobante interno de URABÁ MOTORS FC</p>
          </div>
        </div>

        <div className="facturacion-panel">
          <div className="facturacion-fila">
            <span>Cliente</span>
            <strong>{detalle.clienteNombre}</strong>
          </div>

          <div className="facturacion-fila">
            <span>Motocicleta</span>
            <strong>
              {detalle.motoPlaca || 'No asociada'}
            </strong>
          </div>

          <div className="facturacion-fila">
            <span>Fecha</span>
            <strong>{fecha(detalle.created)}</strong>
          </div>

          <div className="facturacion-fila">
            <span>Estado</span>
            <span
              className={`facturacion-estado ${detalle.estado.toLowerCase()}`}
            >
              {detalle.estado}
            </span>
          </div>
        </div>

        <div className="facturacion-panel">
          <h3>Mano de obra</h3>

          {detalle.trabajos.length === 0 ? (
            <p className="facturacion-vacio">
              No hay trabajos registrados.
            </p>
          ) : (
            detalle.trabajos.map(trabajo => (
              <div
                key={trabajo.id}
                className="facturacion-fila"
              >
                <span>{trabajo.descripcion}</span>
                <strong>
                  {moneda(trabajo.costoAplicado)}
                </strong>
              </div>
            ))
          )}
        </div>

        <div className="facturacion-panel">
          <h3>Repuestos</h3>

          {detalle.repuestos.length === 0 ? (
            <p className="facturacion-vacio">
              No se facturaron repuestos.
            </p>
          ) : (
            detalle.repuestos.map(repuesto => (
              <div
                key={repuesto.id}
                className="facturacion-fila"
              >
                <span>
                  {repuesto.descripcion} × {repuesto.cantidad}
                  <small>
                    {moneda(repuesto.precioUnitario)} c/u
                  </small>
                </span>

                <strong>
                  {moneda(repuesto.subtotal)}
                </strong>
              </div>
            ))
          )}
        </div>

        <div className="facturacion-panel">
          <h3>Resumen de la factura</h3>

          <div className="facturacion-fila">
            <span>Subtotal</span>
            <strong>{moneda(detalle.subtotal)}</strong>
          </div>

          <div className="facturacion-fila">
            <span>Impuesto registrado</span>
            <strong>{moneda(detalle.impuesto)}</strong>
          </div>

          <div className="facturacion-total">
            <span>Total</span>
            <strong>{moneda(detalle.total)}</strong>
          </div>

          <div className="facturacion-fila">
            <span>Total pagado</span>
            <strong>
              {moneda(detalle.totalPagado)}
            </strong>
          </div>

          <div className="facturacion-saldo">
            <span>Saldo pendiente</span>
            <strong>
              {moneda(detalle.saldoPendiente)}
            </strong>
          </div>

          {detalle.requiereRevision && (
            <p className="facturacion-alerta">
              <AlertCircle size={17} />
              Esta factura necesita una revisión de pagos.
            </p>
          )}
        </div>

        <div className="facturacion-panel">

{puedeRegistrarPagos &&
  detalle.estado === 'PENDIENTE' &&
  Number(detalle.saldoPendiente) > 0 && (
    <RegistrarPagoFactura
      key={detalle.id}
      facturaId={detalle.id}
      saldoPendiente={detalle.saldoPendiente}
      onPagoRegistrado={async () => {
        const actualizada =
          await peticion<DetalleFactura>(
            `/facturas/${encodeURIComponent(detalle.id)}`
          );

        setDetalle(actualizada);
        await cargarDatos();
      }}
    />
  )}

          <h3>
            <Wallet size={19} />
            Pagos registrados
          </h3>

          {detalle.pagos.length === 0 ? (
            <p className="facturacion-vacio">
              Todavía no hay pagos registrados.
            </p>
          ) : (
            detalle.pagos.map(pago => (
              <div
                key={pago.id}
                className="facturacion-fila"
              >
                <span>
                  {pago.tipoPago} — {pago.estado}
                  <small>{fecha(pago.created)}</small>
                  {pago.referencia && (
                    <small>
                      Referencia: {pago.referencia}
                    </small>
                  )}
                </span>

                <strong>{moneda(pago.monto)}</strong>
              </div>
            ))
          )}
        </div>

        <p className="facturacion-nota">
          Documento interno de control.
          No equivale a una factura electrónica
          validada por la DIAN.
        </p>
      </section>
    );
  }

  // ========================================
  // LISTAS PRINCIPALES
  // ========================================

  return (
    <section className="facturacion-pagina">
      <div className="facturacion-encabezado">
        <div className="facturacion-titulo">
          <Receipt size={29} />

          <div>
            <h2>Facturación</h2>
            <p>
              Órdenes pendientes e historial
              de comprobantes
            </p>
          </div>
        </div>

        <button
          type="button"
          className="facturacion-actualizar"
          onClick={() => void cargarDatos()}
          disabled={cargando || generandoId !== null}
        >
          <RefreshCw size={17} />
          Actualizar
        </button>
      </div>

      {error && (
        <div
          className="facturacion-alerta"
          role="alert"
        >
          <AlertCircle size={19} />
          {error}
        </div>
      )}

      {mensaje && (
        <div
          className="facturacion-exito"
          role="status"
        >
          <CheckCircle2 size={19} />
          {mensaje}
        </div>
      )}

      <div className="facturacion-resumen">
        {puedeGenerarFacturas && <div className="facturacion-indicador">
          <span>Órdenes pendientes</span>
          <strong>{ordenes.length}</strong>
        </div>}

        {puedeVerFacturas && <div className="facturacion-indicador">
          <span>Facturas registradas</span>
          <strong>{facturas.length}</strong>
        </div>}

        {puedeVerFacturas && <div className="facturacion-indicador">
          <span>Facturas pendientes de pago</span>
          <strong>
            {facturas.filter(
              factura =>
                factura.estado === 'PENDIENTE'
            ).length}
          </strong>
        </div>}

        {puedeVerFacturas && (
          <>
            <div className="facturacion-indicador facturacion-indicador-dinero">
              <span>Total facturado</span>
              <strong>{moneda(totalFacturado)}</strong>
            </div>

            <div className="facturacion-indicador facturacion-indicador-dinero">
              <span>Total recaudado</span>
              <strong>{moneda(totalRecaudado)}</strong>
            </div>

            <div className="facturacion-indicador facturacion-indicador-dinero">
              <span>Saldo por cobrar</span>
              <strong>{moneda(saldoPorCobrar)}</strong>
            </div>
          </>
        )}
      </div>

      {puedeVerFacturas && (
        <p className="facturacion-alcance-resumen">
          Totales calculados sobre las últimas 500 facturas cargadas, sin incluir las anuladas.
        </p>
      )}

      <div
        className="facturacion-pestanas"
        role="group"
        aria-label="Secciones de Facturación"
      >
        {puedeGenerarFacturas && <button
          type="button"
          className={
            vista === 'pendientes' ? 'seleccionada' : ''
          }
          onClick={() => setVista('pendientes')}
        >
          <ClipboardList size={18} />
          Pendientes de facturar
        </button>}

        {puedeVerFacturas && <button
          type="button"
          className={
            vista === 'historial' ? 'seleccionada' : ''
          }
          onClick={() => setVista('historial')}
        >
          <Receipt size={18} />
          Historial de facturas
        </button>}
      </div>

      {cargando ? (
        <div className="facturacion-panel">
          <p role="status">Consultando información...</p>
        </div>
      ) : vista === 'pendientes' && puedeGenerarFacturas ? (
        <div className="facturacion-lista">
          <div className="facturacion-filtros">
            <label className="facturacion-busqueda">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={busqueda}
                onChange={evento => setBusqueda(evento.target.value)}
                placeholder="Buscar por cliente, placa u orden"
                aria-label="Buscar órdenes pendientes"
              />
            </label>
            <span className="facturacion-resultados" aria-live="polite">
              {ordenesFiltradas.length} de {ordenes.length} órdenes
            </span>
          </div>

          {ordenes.length === 0 ? (
            <div className="facturacion-panel">
              <p className="facturacion-vacio">
                No hay órdenes completadas
                pendientes de facturar.
              </p>
            </div>
          ) : ordenesFiltradas.length === 0 ? (
            <div className="facturacion-panel">
              <p className="facturacion-vacio">
                No encontramos órdenes que coincidan con la búsqueda.
              </p>
            </div>
          ) : (
            ordenesFiltradas.map(orden => (
              <article
                key={orden.id}
                className="facturacion-panel"
              >
                <div className="facturacion-tarjeta-cabecera">
                  <h3>{orden.descripcion}</h3>
                  <span className="facturacion-estado completado">
                    COMPLETADO
                  </span>
                </div>

                <div className="facturacion-fila">
                  <span>Cliente</span>
                  <strong>
                    {orden.clienteNombre}
                  </strong>
                </div>

                <div className="facturacion-fila">
                  <span>Motocicleta</span>
                  <strong>
                    {orden.motoPlaca} — {orden.motoMarca}
                    {' '}{orden.motoModelo}
                  </strong>
                </div>

                <div className="facturacion-fila">
                  <span>Mecánico</span>
                  <strong>
                    {orden.mecanicoNombre}
                  </strong>
                </div>

                <div className="facturacion-fila">
                  <span>Finalizada</span>
                  <strong>{fecha(orden.tiempoFin)}</strong>
                </div>

                <div className="facturacion-total">
                  <span>Total de la orden</span>
                  <strong>{moneda(orden.costo)}</strong>
                </div>

                <button
                  type="button"
                  className="facturacion-crear"
                  disabled={
                    generandoId !== null ||
                    cargando
                  }
                  onClick={() =>
                    void generarFactura(orden)
                  }
                >
                  <Receipt size={18} />

                  {generandoId === orden.id
                    ? 'Generando factura...'
                    : 'Generar factura'}
                </button>
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="facturacion-lista">
          <div className="facturacion-filtros">
            <label className="facturacion-busqueda">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={busqueda}
                onChange={evento => setBusqueda(evento.target.value)}
                placeholder="Buscar por factura, cliente o placa"
                aria-label="Buscar en el historial de facturas"
              />
            </label>

            <label className="facturacion-filtro-estado">
              <span>Estado</span>
              <select
                value={filtroEstado}
                onChange={evento =>
                  setFiltroEstado(evento.target.value as FiltroEstado)
                }
                aria-label="Filtrar facturas por estado"
              >
                <option value="TODAS">Todos</option>
                <option value="PENDIENTE">Pendientes</option>
                <option value="PAGADO">Pagadas</option>
                <option value="ANULADO">Anuladas</option>
              </select>
            </label>

            <span className="facturacion-resultados" aria-live="polite">
              {facturasFiltradas.length} de {facturas.length} facturas
            </span>
          </div>

          {facturas.length === 0 ? (
            <div className="facturacion-panel">
              <p className="facturacion-vacio">
                Todavía no hay facturas registradas.
              </p>
            </div>
          ) : facturasFiltradas.length === 0 ? (
            <div className="facturacion-panel">
              <p className="facturacion-vacio">
                No encontramos facturas que coincidan con los filtros.
              </p>
            </div>
          ) : (
            facturasFiltradas.map(factura => (
              <article
                key={factura.id}
                className="facturacion-panel"
              >
                <div className="facturacion-tarjeta-cabecera">
                  <h3>{factura.numero}</h3>

                  <span
                    className={
                      `facturacion-estado ` +
                      factura.estado.toLowerCase()
                    }
                  >
                    {factura.estado}
                  </span>
                </div>

                <div className="facturacion-fila">
                  <span>Cliente</span>
                  <strong>
                    {factura.clienteNombre}
                  </strong>
                </div>

                <div className="facturacion-fila">
                  <span>Fecha</span>
                  <strong>
                    {fecha(factura.created)}
                  </strong>
                </div>

                <div className="facturacion-fila">
                  <span>Motocicleta</span>
                  <strong>
                    {factura.motoPlaca || 'No asociada'}
                  </strong>
                </div>

                <div className="facturacion-fila">
                  <span>Total</span>
                  <strong>
                    {moneda(factura.total)}
                  </strong>
                </div>

                <div className="facturacion-fila">
                  <span>Saldo pendiente</span>
                  <strong>
                    {moneda(factura.saldoPendiente)}
                  </strong>
                </div>

                <button
                  type="button"
                  className="facturacion-ver"
                  disabled={abriendoId !== null}
                  onClick={() =>
                    void abrirFactura(factura.id)
                  }
                >
                  <Eye size={18} />

                  {abriendoId === factura.id
                    ? 'Consultando...'
                    : 'Ver detalle'}
                </button>
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
