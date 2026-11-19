
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  ShoppingCart,
  Receipt,
  RefreshCw
} from 'lucide-react';

import BuscadorRepuestos from './BuscadorRepuestos';

import { obtenerToken, tienePermiso } from '../services/auth';

import './Inventario.css';

const API = 'http://localhost:3000/api';

interface Repuesto {
  id: string;
  nombre: string;
  categoriaNombre: string | null;
  stockActual: number;
  precioVenta: number | string;
}

interface Venta {
  id: string;
  repuestoId: string;
  repuestoNombre: string;
  clienteNombre: string | null;
  cantidad: number;
  precioUnitario: number | string;
  total: number | string;
  registradoPorNombre: string;
  fechaVenta: string;
}

function dinero(valor: number | string) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(valor));
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
      `Error en la solicitud (${respuesta.status})`
    );
  }

  return datos;
}

export default function VentasInventario() {
  const puedeRegistrarVentas = tienePermiso('ventas.registrar');
  const puedeVerVentas = tienePermiso('ventas.ver');

  const [vista, setVista] =
    useState<'registrar' | 'historial'>(() =>
      puedeRegistrarVentas ? 'registrar' : 'historial'
    );

  const [repuestos, setRepuestos] =
    useState<Repuesto[]>([]);

  const [ventas, setVentas] =
    useState<Venta[]>([]);

  const [repuestoId, setRepuestoId] =
    useState('');

  const [cantidad, setCantidad] =
    useState('1');

  const [busqueda, setBusqueda] =
    useState('');

  const [cargando, setCargando] =
    useState(true);

  const [guardando, setGuardando] =
    useState(false);

  const [error, setError] =
    useState('');

  const [mensaje, setMensaje] =
    useState('');

  // ========================================
  // CARGAR REPUESTOS Y VENTAS
  // ========================================

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError('');

    try {
      const [respuestaRepuestos, respuestaVentas] =
        await Promise.all([
          puedeRegistrarVentas
            ? fetch(`${API}/repuestos`, {
                headers: encabezados()
              })
            : Promise.resolve(null),
          puedeVerVentas
            ? fetch(`${API}/ventas`, {
                headers: encabezados()
              })
            : Promise.resolve(null)
        ]);

      const datosRepuestos = respuestaRepuestos
        ? await leerRespuesta(respuestaRepuestos)
        : [];
      const datosVentas = respuestaVentas
        ? await leerRespuesta(respuestaVentas)
        : [];

      if (
        !Array.isArray(datosRepuestos) ||
        !Array.isArray(datosVentas)
      ) {
        throw new Error(
          'El servidor devolvió datos no válidos'
        );
      }

      setRepuestos(datosRepuestos);
      setVentas(datosVentas);

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible cargar las ventas'
      );

    } finally {
      setCargando(false);
    }
  }, [puedeRegistrarVentas, puedeVerVentas]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  // ========================================
  // CALCULAR PRECIO Y TOTAL
  // ========================================

  const repuestoSeleccionado =
    repuestos.find(r => r.id === repuestoId);

  const precioUnitario = Number(
    repuestoSeleccionado?.precioVenta ?? 0
  );

  const cantidadNumerica = Number(cantidad);

  const cantidadValida =
    cantidad.trim() !== '' &&
    Number.isInteger(cantidadNumerica) &&
    cantidadNumerica > 0 &&
    cantidadNumerica <= 2147483647;

  const stockDisponible =
    repuestoSeleccionado?.stockActual ?? 0;

  const total = cantidadValida
    ? Math.round(precioUnitario * 100) *
      cantidadNumerica / 100
    : 0;

  const ventaValida =
    Boolean(repuestoSeleccionado) &&
    cantidadValida &&
    cantidadNumerica <= stockDisponible &&
    precioUnitario > 0 &&
    Number.isFinite(total) &&
    total <= 9999999999.99;

  // ========================================
  // REGISTRAR VENTA
  // ========================================

  async function guardarVenta(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (guardando) return;

    setError('');
    setMensaje('');

    if (!repuestoSeleccionado) {
      setError('Selecciona un repuesto');
      return;
    }

    if (!cantidadValida) {
      setError('Ingresa una cantidad válida');
      return;
    }

    if (cantidadNumerica > stockDisponible) {
      setError('No hay suficientes existencias');
      return;
    }

    if (!ventaValida) {
      setError(
        'El precio o el total de la venta no es válido'
      );
      return;
    }

    const confirmar = window.confirm(
      `¿Registrar la venta de ${cantidadNumerica} ` +
      `unidad(es) de ${repuestoSeleccionado.nombre} ` +
      `por ${dinero(total)}?`
    );

    if (!confirmar) return;

    setGuardando(true);

    try {
      const respuesta = await fetch(
        `${API}/ventas`,
        {
          method: 'POST',
          headers: encabezados(),

          body: JSON.stringify({
            repuestoId,
            cantidad: cantidadNumerica,
            clienteId: null
          })
        }
      );

      const datos =
        await leerRespuesta(respuesta);

      setMensaje(
        `Venta registrada por ${
          dinero(datos.venta.total)
        }. Existencias actualizadas.`
      );

      setRepuestoId('');
      setCantidad('1');

      await cargarDatos();

      if (puedeVerVentas) setVista('historial');

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible registrar la venta'
      );

    } finally {
      setGuardando(false);
    }
  }

  // ========================================
  // BUSCAR VENTAS
  // ========================================

  const ventasFiltradas = ventas.filter(venta => {
    const texto = busqueda.trim().toLowerCase();

    return (
      venta.repuestoNombre
        .toLowerCase()
        .includes(texto) ||

      (venta.clienteNombre ?? '')
        .toLowerCase()
        .includes(texto) ||

      venta.id.toLowerCase().includes(texto)
    );
  });

  if (cargando) {
    return (
      <section className="inventario-panel">
        <p>Cargando ventas de mostrador...</p>
      </section>
    );
  }

  if (!puedeRegistrarVentas && !puedeVerVentas) {
    return (
      <section className="inventario-panel">
        <h2>Acceso restringido</h2>
        <p>
          No tienes permisos para registrar
          o consultar ventas.
        </p>
      </section>
    );
  }

  return (
    <div className="ventas-pagina">

      {/* NAVEGACIÓN */}

      <div className="inventario-tabs">

        {puedeRegistrarVentas && <button
          type="button"
          className={
            vista === 'registrar' ? 'activo' : ''
          }
          disabled={guardando}
          onClick={() => setVista('registrar')}
        >
          <ShoppingCart size={18} />
          Registrar venta
        </button>}

        {puedeVerVentas && <button
          type="button"
          className={
            vista === 'historial' ? 'activo' : ''
          }
          disabled={guardando}
          onClick={() => setVista('historial')}
        >
          <Receipt size={18} />
          Historial de ventas
        </button>}

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

      {vista === 'registrar' && puedeRegistrarVentas ? (

        /* REGISTRAR VENTA */

        <form
          className="inventario-panel"
          onSubmit={guardarVenta}
        >

          <div className="inventario-titulo">
            <div>
              <h2>Venta de mostrador</h2>

              <p>
                Registra la venta directa
                de repuestos del taller.
              </p>
            </div>

            <ShoppingCart size={30} />
          </div>

          <fieldset disabled={guardando}>

            <div className="ventas-form-grid">

              <div className="ventas-selector">

                <label>Buscar repuesto *</label>

                <BuscadorRepuestos
                  repuestos={repuestos}
                  valor={repuestoId}
                  onSeleccionar={setRepuestoId}
                  disabled={guardando}
                />

              </div>

              <label>
                Cantidad a vender *

                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={cantidad}
                  onChange={e =>
                    setCantidad(e.target.value)
                  }
                />
              </label>

            </div>

            {repuestoSeleccionado && (

              <div className="ventas-datos">

                <div>
                  <span>Stock disponible</span>
                  <strong>
                    {stockDisponible} unidades
                  </strong>
                </div>

                <div>
                  <span>Precio unitario</span>
                  <strong>
                    {dinero(precioUnitario)}
                  </strong>
                </div>

                <div>
                  <span>Stock después de la venta</span>
                  <strong>
                    {ventaValida
                      ? stockDisponible - cantidadNumerica
                      : '—'}
                  </strong>
                </div>

              </div>

            )}

            {repuestoSeleccionado &&
              cantidadNumerica > stockDisponible && (
                <div className="inventario-mensaje aviso">
                  No hay suficientes unidades disponibles.
                </div>
              )}

            {repuestoSeleccionado &&
              precioUnitario <= 0 && (
                <div className="inventario-mensaje aviso">
                  Este repuesto todavía no tiene
                  un precio de venta calculado.
                </div>
              )}

            <div className="inventario-nota">
              Cliente: venta de mostrador general.
              El precio se obtiene automáticamente
              del catálogo al registrar la venta.
            </div>

            <div className="inventario-total">
              <div>
                <span>Total de la venta</span>
                <small>
                  {repuestoSeleccionado?.nombre ||
                    'Selecciona un repuesto'}
                </small>
              </div>

              <strong>
                {dinero(total)}
              </strong>
            </div>

            <div className="inventario-form-footer">
              <button
                type="submit"
                className="inventario-btn primario"
                disabled={guardando || !ventaValida}
              >
                <ShoppingCart size={19} />

                {guardando
                  ? 'Registrando...'
                  : 'Registrar venta'}
              </button>
            </div>

          </fieldset>

        </form>

      ) : (

        /* HISTORIAL DE VENTAS */

        <section className="inventario-panel">

          <div className="inventario-titulo">
            <div>
              <h2>Historial de ventas</h2>

              <p>
                Consulta las ventas directas
                registradas en el taller.
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
            type="search"
            className="inventario-busqueda"
            placeholder="Buscar por repuesto, cliente o venta..."
            value={busqueda}
            onChange={e =>
              setBusqueda(e.target.value)
            }
          />

          {ventasFiltradas.length === 0 ? (

            <div className="inventario-vacio">
              <Receipt size={40} />

              <h3>No hay ventas para mostrar</h3>

              <p>
                Registra una venta o cambia la búsqueda.
              </p>
            </div>

          ) : (

            <div className="inventario-tabla-scroll">

              <table className="inventario-tabla">

                <thead>
                  <tr>
                    <th>Venta</th>
                    <th>Fecha</th>
                    <th>Repuesto</th>
                    <th>Cliente</th>
                    <th>Cantidad</th>
                    <th>Precio unitario</th>
                    <th>Total</th>
                    <th>Registrado por</th>
                  </tr>
                </thead>

                <tbody>
                  {ventasFiltradas.map(venta => (
                    <tr key={venta.id}>

                      <td>
                        #{venta.id.slice(0, 8)}
                      </td>

                      <td>{venta.fechaVenta}</td>

                      <td>
                        <strong>
                          {venta.repuestoNombre}
                        </strong>
                      </td>

                      <td>
                        {venta.clienteNombre ||
                          'Mostrador'}
                      </td>

                      <td>{venta.cantidad}</td>

                      <td>
                        {dinero(venta.precioUnitario)}
                      </td>

                      <td>
                        <strong>
                          {dinero(venta.total)}
                        </strong>
                      </td>

                      <td>
                        {venta.registradoPorNombre}
                      </td>

                    </tr>
                  ))}
                </tbody>

              </table>

            </div>

          )}

        </section>

      )}

    </div>
  );
}
