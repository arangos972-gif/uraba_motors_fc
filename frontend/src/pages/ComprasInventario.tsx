
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import BuscadorRepuestos from './BuscadorRepuestos';
import {
  Plus,
  Trash2,
  ShoppingCart,
  Receipt,
  RefreshCw,
  Eye,
  X
} from 'lucide-react';

import { obtenerToken } from '../services/auth';

import './Inventario.css';

const API = 'https://uraba-motors-fc.onrender.com/api';

interface Repuesto {
  id: string;
  nombre: string;
  categoriaNombre: string | null;
  stockActual: number;
  costoPromedioPMP: string | number;
  porcentajeGanancia: string | number;
  precioVenta: string | number;
}

interface LineaCompra {
  id: string;
  repuestoId: string;
  cantidad: string;
  costoUnitarioCompra: string;
}

interface Compra {
  id: string;
  numeroFacturaProveedor: string;
  proveedor: string;
  fechaCompra: string;
  totalCompra: number | string;
  registradoPorNombre: string;
  cantidadProductos?: number;
}

interface DetalleCompra {
  id: string;
  repuestoId: string;
  repuestoNombre: string;
  cantidad: number;
  costoUnitarioCompra: number | string;
  subtotal: number | string;
}

interface CompraCompleta extends Compra {
  detalles: DetalleCompra[];
}

interface Props {
  vistaInicial?: 'registrar' | 'historial';
}

function hoyColombia() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const anio = partes.find(p => p.type === 'year')?.value;
  const mes = partes.find(p => p.type === 'month')?.value;
  const dia = partes.find(p => p.type === 'day')?.value;

  return `${anio}-${mes}-${dia}`;
}

function dinero(valor: number | string) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2
  }).format(Number(valor));
}

function nuevaLinea(): LineaCompra {
  return {
    id: crypto.randomUUID(),
    repuestoId: '',
    cantidad: '1',
    costoUnitarioCompra: ''
  };
}

function encabezados() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${obtenerToken() ?? ''}`
  };
}

async function leerRespuesta(respuesta: Response) {
  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    throw new Error(
      datos?.mensaje ||
      `Error de solicitud (${respuesta.status})`
    );
  }

  return datos;
}

export default function ComprasInventario({
  vistaInicial = 'registrar'
}: Props) {
  const [vista, setVista] = useState(vistaInicial);

  const [repuestos, setRepuestos] =
    useState<Repuesto[]>([]);

  const [compras, setCompras] =
    useState<Compra[]>([]);

  const [compraSeleccionada, setCompraSeleccionada] =
    useState<CompraCompleta | null>(null);

  const [numeroFacturaProveedor, setNumeroFactura] =
    useState('');

  const [proveedor, setProveedor] = useState('');

  const [fechaCompra, setFechaCompra] =
    useState(hoyColombia());

  const [lineas, setLineas] = useState<LineaCompra[]>(
    () => [nuevaLinea()]
  );

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [sinPermiso, setSinPermiso] = useState(false);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [busqueda, setBusqueda] = useState('');

  // ========================================
  // CARGAR CATÁLOGO E HISTORIAL
  // ========================================

  async function cargarDatos() {
    setCargando(true);
    setError('');

    try {
      const [respuestaRepuestos, respuestaCompras] =
        await Promise.all([
          fetch(`${API}/repuestos/inventario`, {
            headers: encabezados()
          }),
          fetch(`${API}/compras`, {
            headers: encabezados()
          })
        ]);

      if (
        respuestaRepuestos.status === 403 ||
        respuestaCompras.status === 403
      ) {
        setSinPermiso(true);
        setRepuestos([]);
        setCompras([]);
        return;
      }

      const datosRepuestos =
        await leerRespuesta(respuestaRepuestos);

      const datosCompras =
        await leerRespuesta(respuestaCompras);

      if (
        !Array.isArray(datosRepuestos) ||
        !Array.isArray(datosCompras)
      ) {
        throw new Error(
          'El servidor devolvió datos no válidos'
        );
      }

      setSinPermiso(false);
      setRepuestos(datosRepuestos);
      setCompras(datosCompras);

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible cargar el inventario'
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargarDatos();
  }, []);

  // ========================================
  // GESTIONAR LÍNEAS DE LA FACTURA
  // ========================================

  function cambiarLinea(
    id: string,
    campo: keyof Omit<LineaCompra, 'id'>,
    valor: string
  ) {
    setLineas(anteriores =>
      anteriores.map(linea =>
        linea.id === id
          ? { ...linea, [campo]: valor }
          : linea
      )
    );
  }

  function agregarLinea() {
    if (lineas.length >= 200) {
      setError(
        'La factura admite máximo 200 productos'
      );
      return;
    }

    setLineas(anteriores => [
      ...anteriores,
      nuevaLinea()
    ]);
  }

  function eliminarLinea(id: string) {
    setLineas(anteriores =>
      anteriores.length > 1
        ? anteriores.filter(linea => linea.id !== id)
        : anteriores
    );
  }

  function subtotalLinea(linea: LineaCompra) {
    const cantidad = Number(linea.cantidad);
    const costo = Number(linea.costoUnitarioCompra);

    if (
      !Number.isInteger(cantidad) ||
      cantidad <= 0 ||
      !Number.isFinite(costo) ||
      costo <= 0
    ) {
      return 0;
    }

    return Math.round(costo * 100) * cantidad / 100;
  }

  const totalCompra =
    lineas.reduce(
      (total, linea) =>
        total + subtotalLinea(linea),
      0
    );

  // ========================================
  // GUARDAR COMPRA
  // ========================================

  async function guardarCompra(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (guardando) return;

    setError('');
    setMensaje('');

    if (
      !numeroFacturaProveedor.trim() ||
      !proveedor.trim() ||
      !fechaCompra
    ) {
      setError(
        'Completa los datos de la factura'
      );
      return;
    }

    const ids = new Set<string>();

    for (const linea of lineas) {
      const cantidad = Number(linea.cantidad);
      const costo = Number(linea.costoUnitarioCompra);

      if (!linea.repuestoId) {
        setError(
          'Selecciona un repuesto en cada línea'
        );
        return;
      }

      if (ids.has(linea.repuestoId)) {
        setError(
          'No puedes repetir un repuesto en la misma factura'
        );
        return;
      }

      ids.add(linea.repuestoId);

      if (
        !Number.isInteger(cantidad) ||
        cantidad <= 0 ||
        cantidad > 2147483647
      ) {
        setError(
          'Ingresa cantidades enteras mayores a cero'
        );
        return;
      }

      if (
        !Number.isFinite(costo) ||
        costo <= 0 ||
        costo > 9999999999.99 ||
        Math.abs(
          costo * 100 - Math.round(costo * 100)
        ) > 0.001
      ) {
        setError(
          'Ingresa costos válidos con máximo dos decimales'
        );
        return;
      }
    }

    if (
      !Number.isFinite(totalCompra) ||
      totalCompra > 9999999999.99
    ) {
      setError('El total supera el valor permitido');
      return;
    }

    const confirmar = window.confirm(
      `¿Registrar la factura ${numeroFacturaProveedor} ` +
      `por ${dinero(totalCompra)}? ` +
      'Esta compra actualizará el inventario, PMP y precios.'
    );

    if (!confirmar) return;

    setGuardando(true);

    try {
      const respuesta = await fetch(
        `${API}/compras`,
        {
          method: 'POST',
          headers: encabezados(),
          body: JSON.stringify({
            numeroFacturaProveedor:
              numeroFacturaProveedor.trim(),

            proveedor: proveedor.trim(),

            fechaCompra,

            detalles: lineas.map(linea => ({
              repuestoId: linea.repuestoId,

              cantidad: Number(linea.cantidad),

              costoUnitarioCompra:
                Number(linea.costoUnitarioCompra)
            }))
          })
        }
      );

      const datos = await leerRespuesta(respuesta);

      setMensaje(
        datos.mensaje ||
        'Compra registrada correctamente'
      );

      setNumeroFactura('');
      setProveedor('');
      setFechaCompra(hoyColombia());
      setLineas([nuevaLinea()]);

      await cargarDatos();

      setVista('historial');

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible registrar la compra'
      );
    } finally {
      setGuardando(false);
    }
  }

  // ========================================
  // CONSULTAR DETALLE DE COMPRA
  // ========================================

  async function verCompra(id: string) {
    setError('');

    try {
      const respuesta = await fetch(
        `${API}/compras/${id}`,
        { headers: encabezados() }
      );

      const datos = await leerRespuesta(respuesta);

      setCompraSeleccionada(datos);

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible consultar la factura'
      );
    }
  }

  const comprasFiltradas = compras.filter(compra => {
    const texto = busqueda.trim().toLowerCase();

    return (
      compra.proveedor.toLowerCase().includes(texto) ||
      compra.numeroFacturaProveedor
        .toLowerCase()
        .includes(texto)
    );
  });

  // ========================================
  // ESTADOS DE CARGA Y PERMISOS
  // ========================================

  if (cargando) {
    return (
      <section className="inventario-panel">
        <p>Cargando datos de compras...</p>
      </section>
    );
  }

  if (sinPermiso) {
    return (
      <section className="inventario-panel">
        <h2>Acceso restringido</h2>
        <p>
          No tienes permisos para consultar
          los costos o registrar compras.
        </p>
      </section>
    );
  }

  return (
    <div className="inventario-compras">

      {/* NAVEGACIÓN */}

      <div className="inventario-tabs">
        <button
          type="button"
          className={
            vista === 'registrar' ? 'activo' : ''
          }
          disabled={guardando}
          onClick={() => setVista('registrar')}
        >
          <ShoppingCart size={18} />
          Registrar compra
        </button>

        <button
          type="button"
          className={
            vista === 'historial' ? 'activo' : ''
          }
          disabled={guardando}
          onClick={() => setVista('historial')}
        >
          <Receipt size={18} />
          Historial de compras
        </button>
      </div>

      {error && (
        <div className="inventario-mensaje error">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="inventario-mensaje exito">
          {mensaje}
        </div>
      )}

      {/* REGISTRAR FACTURA */}

      {vista === 'registrar' ? (

        <form
          className="inventario-panel"
          onSubmit={guardarCompra}
        >
          <div className="inventario-titulo">
            <div>
              <h2>Registrar compra de repuestos</h2>
              <p>
                Ingresa la factura recibida del proveedor.
              </p>
            </div>

            <ShoppingCart size={30} />
          </div>

          <fieldset disabled={guardando}>
            <div className="inventario-form-grid">

              <label>
                Número de factura *

                <input
                  type="text"
                  required
                  maxLength={100}
                  placeholder="Ej. FC-001"
                  value={numeroFacturaProveedor}
                  onChange={e =>
                    setNumeroFactura(e.target.value)
                  }
                />
              </label>

              <label>
                Proveedor *

                <input
                  type="text"
                  required
                  maxLength={150}
                  placeholder="Nombre del proveedor"
                  value={proveedor}
                  onChange={e =>
                    setProveedor(e.target.value)
                  }
                />
              </label>

              <label>
                Fecha de compra *

                <input
                  type="date"
                  required
                  value={fechaCompra}
                  onChange={e =>
                    setFechaCompra(e.target.value)
                  }
                />
              </label>

            </div>

            {/* PRODUCTOS DE LA FACTURA */}

            <div className="inventario-titulo detalle">
              <div>
                <h3>Productos comprados</h3>
                <p>
                  Selecciona los repuestos del catálogo.
                </p>
              </div>

              <button
                type="button"
                className="inventario-btn secundario"
                onClick={agregarLinea}
              >
                <Plus size={18} />
                Agregar producto
              </button>
            </div>

            {repuestos.length === 0 && (
              <div className="inventario-mensaje aviso">
                Primero registra un repuesto desde
                el módulo Repuestos para poder comprarlo.
              </div>
            )}

            <div className="inventario-tabla-scroll">
              <table className="inventario-tabla">
                <thead>
                  <tr>
                    <th>Repuesto</th>
                    <th>Stock actual</th>
                    <th>Cantidad</th>
                    <th>Costo unitario</th>
                    <th>Subtotal</th>
                    <th>Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {lineas.map(linea => {
                    const repuesto = repuestos.find(
                      r => r.id === linea.repuestoId
                    );

                    return (
                      <tr key={linea.id}>
                        <td>
                        <BuscadorRepuestos
  repuestos={repuestos}
  valor={linea.repuestoId}
  disabled={guardando}
  idsOcupados={lineas
    .filter(otra => otra.id !== linea.id)
    .map(otra => otra.repuestoId)}
  onSeleccionar={id =>
    cambiarLinea(
      linea.id,
      'repuestoId',
      id
    )
  }
/>
                        </td>

                        <td>
                          {repuesto?.stockActual ?? '—'}
                        </td>

                        <td>
                          <input
                            className="inventario-cantidad"
                            type="number"
                            min="1"
                            max="2147483647"
                            step="1"
                            required
                            aria-label="Cantidad comprada"
                            value={linea.cantidad}
                            onChange={e =>
                              cambiarLinea(
                                linea.id,
                                'cantidad',
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td>
                          <input
                            className="inventario-costo"
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            aria-label="Costo unitario"
                            placeholder="0"
                            value={
                              linea.costoUnitarioCompra
                            }
                            onChange={e =>
                              cambiarLinea(
                                linea.id,
                                'costoUnitarioCompra',
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td>
                          <strong>
                            {dinero(subtotalLinea(linea))}
                          </strong>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="inventario-btn eliminar"
                            aria-label="Eliminar producto"
                            disabled={lineas.length === 1}
                            onClick={() =>
                              eliminarLinea(linea.id)
                            }
                          >
                            <Trash2 size={17} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* RESUMEN AUTOMÁTICO */}

            <div className="inventario-total">
              <div>
                <span>Total de la factura</span>
                <small>
                  {lineas.length} línea(s) de compra
                </small>
              </div>

              <strong>{dinero(totalCompra)}</strong>
            </div>

            <div className="inventario-nota">
              Al guardar la compra, el servidor
              actualizará las existencias, calculará
              el nuevo PMP y el precio de venta,
              y registrará la entrada en Kardex.
            </div>

            <div className="inventario-form-footer">
              <button
                type="submit"
                className="inventario-btn primario"
                disabled={
                  guardando || repuestos.length === 0
                }
              >
                <ShoppingCart size={19} />

                {guardando
                  ? 'Registrando compra...'
                  : 'Registrar compra'}
              </button>
            </div>
          </fieldset>
        </form>

      ) : (

        /* HISTORIAL DE COMPRAS */

        <section className="inventario-panel">
          <div className="inventario-titulo">
            <div>
              <h2>Historial de compras</h2>
              <p>
                Consulta las facturas de proveedores.
              </p>
            </div>

            <button
              type="button"
              className="inventario-btn secundario"
              onClick={() => void cargarDatos()}
            >
              <RefreshCw size={17} />
              Actualizar
            </button>
          </div>

          <input
            className="inventario-busqueda"
            type="search"
            placeholder="Buscar por factura o proveedor..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />

          {comprasFiltradas.length === 0 ? (
            <div className="inventario-vacio">
              <Receipt size={40} />
              <h3>No hay compras para mostrar</h3>
              <p>
                Registra una compra o cambia la búsqueda.
              </p>
            </div>
          ) : (
            <div className="inventario-tabla-scroll">
              <table className="inventario-tabla">
                <thead>
                  <tr>
                    <th>Factura</th>
                    <th>Proveedor</th>
                    <th>Fecha</th>
                    <th>Productos</th>
                    <th>Total</th>
                    <th>Registrado por</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {comprasFiltradas.map(compra => (
                    <tr key={compra.id}>
                      <td>
                        <strong>
                          {compra.numeroFacturaProveedor}
                        </strong>
                      </td>

                      <td>{compra.proveedor}</td>
                      <td>{compra.fechaCompra}</td>
                      <td>{compra.cantidadProductos ?? '—'}</td>
                      <td>{dinero(compra.totalCompra)}</td>
                      <td>{compra.registradoPorNombre}</td>

                      <td>
                        <button
                          type="button"
                          className="inventario-btn secundario"
                          onClick={() =>
                            void verCompra(compra.id)
                          }
                        >
                          <Eye size={16} />
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* DETALLE DE FACTURA */}

      {compraSeleccionada && (
        <div
          className="inventario-modal-fondo"
          onClick={() => setCompraSeleccionada(null)}
        >
          <section
            className="inventario-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de compra"
            onClick={e => e.stopPropagation()}
          >
            <div className="inventario-titulo">
              <div>
                <h2>
                  Factura{' '}
                  {compraSeleccionada.numeroFacturaProveedor}
                </h2>

                <p>{compraSeleccionada.proveedor}</p>
              </div>

              <button
                type="button"
                className="inventario-btn secundario"
                aria-label="Cerrar detalle"
                onClick={() =>
                  setCompraSeleccionada(null)
                }
              >
                <X size={20} />
              </button>
            </div>

            <div className="inventario-datos-factura">
              <p>
                <strong>Fecha:</strong>{' '}
                {compraSeleccionada.fechaCompra}
              </p>

              <p>
                <strong>Registrado por:</strong>{' '}
                {compraSeleccionada.registradoPorNombre}
              </p>
            </div>

            <div className="inventario-tabla-scroll">
              <table className="inventario-tabla">
                <thead>
                  <tr>
                    <th>Repuesto</th>
                    <th>Cantidad</th>
                    <th>Costo unitario</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>

                <tbody>
                  {compraSeleccionada.detalles.map(
                    detalle => (
                      <tr key={detalle.id}>
                        <td>{detalle.repuestoNombre}</td>
                        <td>{detalle.cantidad}</td>

                        <td>
                          {dinero(detalle.costoUnitarioCompra)}
                        </td>

                        <td>{dinero(detalle.subtotal)}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>

            <div className="inventario-total">
              <span>Total de la compra</span>
              <strong>
                {dinero(compraSeleccionada.totalCompra)}
              </strong>
            </div>

            <div className="inventario-form-footer">
              <button
                type="button"
                className="inventario-btn secundario"
                onClick={() =>
                  setCompraSeleccionada(null)
                }
              >
                Cerrar
              </button>
            </div>
          </section>
        </div>
      )}

    </div>
  );
}
