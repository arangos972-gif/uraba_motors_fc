
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  ClipboardList,
  History,
  RefreshCw,
  Save
} from 'lucide-react';

import BuscadorRepuestos from './BuscadorRepuestos';

import { obtenerToken } from '../services/auth';

import './Inventario.css';

const API = 'https://uraba-motors-fc.onrender.com/api';

type TipoAjuste =
  | 'SOBRANTE'
  | 'FALTANTE'
  | 'DANADO';

interface Repuesto {
  id: string;
  nombre: string;
  categoriaNombre: string | null;
  stockActual: number;
  costoPromedioPMP: string | number;
  precioVenta: string | number;
}

interface Ajuste {
  id: string;
  repuestoId: string;
  repuestoNombre: string;
  cantidad: number;
  stockAnterior: number;
  stockNuevo: number;
  costoUnitarioMovimiento: string | number;
  costoPMPResultante: string | number;
  observaciones: string | null;
  usuarioNombre: string;
  fechaAjuste: string;
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
      `Error de solicitud (${respuesta.status})`
    );
  }

  return datos;
}

function dinero(valor: string | number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(valor));
}

export default function AjustesInventario() {

  const [vista, setVista] =
    useState<'registrar' | 'historial'>('registrar');

  const [repuestos, setRepuestos] =
    useState<Repuesto[]>([]);

  const [ajustes, setAjustes] =
    useState<Ajuste[]>([]);

  const [repuestoId, setRepuestoId] =
    useState('');

  const [tipoAjuste, setTipoAjuste] =
    useState<TipoAjuste>('FALTANTE');

  const [cantidad, setCantidad] =
    useState('1');

  const [motivo, setMotivo] =
    useState('');

  const [stockEsperado, setStockEsperado] =
    useState<number | null>(null);

  const [busqueda, setBusqueda] =
    useState('');

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
  // CARGAR DATOS
  // ========================================

  async function cargarDatos() {
    setCargando(true);
    setError('');

    try {
      const [respuestaRepuestos, respuestaAjustes] =
        await Promise.all([

          fetch(`${API}/repuestos/inventario`, {
            headers: encabezados()
          }),

          fetch(`${API}/ajustes`, {
            headers: encabezados()
          })

        ]);

      if (
        respuestaRepuestos.status === 403 ||
        respuestaAjustes.status === 403
      ) {
        setSinPermiso(true);
        setRepuestos([]);
        setAjustes([]);
        return;
      }

      const datosRepuestos =
        await leerRespuesta(respuestaRepuestos);

      const datosAjustes =
        await leerRespuesta(respuestaAjustes);

      if (
        !Array.isArray(datosRepuestos) ||
        !Array.isArray(datosAjustes)
      ) {
        throw new Error(
          'El servidor devolvió datos no válidos'
        );
      }

      setRepuestos(datosRepuestos);
      setAjustes(datosAjustes);
      setSinPermiso(false);

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
  // SELECCIONAR REPUESTO
  // ========================================

  function seleccionarRepuesto(id: string) {
    const repuesto = repuestos.find(
      r => r.id === id
    );

    setRepuestoId(id);

    setStockEsperado(
      repuesto
        ? Number(repuesto.stockActual)
        : null
    );

    setError('');
  }

  const repuestoSeleccionado =
    repuestos.find(r => r.id === repuestoId);

  const cantidadNumerica = Number(cantidad);

  const cantidadValida =
    Number.isInteger(cantidadNumerica) &&
    cantidadNumerica > 0 &&
    cantidadNumerica <= 2147483647;

  const diferencia =
    tipoAjuste === 'SOBRANTE'
      ? cantidadNumerica
      : -cantidadNumerica;

  const stockNuevo =
    stockEsperado !== null && cantidadValida
      ? stockEsperado + diferencia
      : null;

  const costoPMP = Number(
    repuestoSeleccionado?.costoPromedioPMP ?? 0
  );

  const ajusteValido =
    Boolean(repuestoSeleccionado) &&
    cantidadValida &&
    stockEsperado !== null &&
    stockNuevo !== null &&
    stockNuevo >= 0 &&
    stockNuevo <= 2147483647 &&
    costoPMP > 0 &&
    motivo.trim().length >= 5 &&
    motivo.trim().length <= 200;

  // ========================================
  // REGISTRAR AJUSTE
  // ========================================

  async function guardarAjuste(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (guardando) return;

    setError('');
    setMensaje('');

    if (
      !ajusteValido ||
      !repuestoSeleccionado ||
      stockEsperado === null ||
      stockNuevo === null
    ) {
      setError(
        'Revisa el repuesto, cantidad y motivo del ajuste'
      );
      return;
    }

    const confirmar = window.confirm(
      `¿Confirmar ajuste de ${repuestoSeleccionado.nombre}? ` +
      `Stock anterior: ${stockEsperado}. ` +
      `Stock nuevo: ${stockNuevo}. ` +
      'El movimiento quedará registrado en Kardex.'
    );

    if (!confirmar) return;

    setGuardando(true);

    try {
      const respuesta = await fetch(
        `${API}/ajustes`,
        {
          method: 'POST',
          headers: encabezados(),

          body: JSON.stringify({
            repuestoId,
            tipoAjuste,
            cantidad: cantidadNumerica,
            motivo: motivo.trim(),
            stockEsperado
          })
        }
      );

      const datos =
        await leerRespuesta(respuesta);

      setMensaje(
        datos.mensaje ||
        'Ajuste registrado correctamente'
      );

      setRepuestoId('');
      setStockEsperado(null);
      setCantidad('1');
      setMotivo('');

      await cargarDatos();

      setVista('historial');

    } catch (err) {

      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible registrar el ajuste'
      );

    } finally {

      setGuardando(false);

    }
  }

  // Actualizar el catálogo y exigir que el
  // usuario seleccione nuevamente el repuesto.

  async function actualizarInventario() {
    setRepuestoId('');
    setStockEsperado(null);
    setCantidad('1');

    await cargarDatos();
  }

  // ========================================
  // FILTRAR HISTORIAL
  // ========================================

  const ajustesFiltrados = ajustes.filter(
    ajuste => {
      const texto = busqueda.trim().toLowerCase();

      return (
        ajuste.repuestoNombre
          .toLowerCase()
          .includes(texto) ||

        (ajuste.observaciones ?? '')
          .toLowerCase()
          .includes(texto) ||

        ajuste.usuarioNombre
          .toLowerCase()
          .includes(texto)
      );
    }
  );

  if (cargando) {
    return (
      <section className="inventario-panel">
        <p>Cargando ajustes de inventario...</p>
      </section>
    );
  }

  if (sinPermiso) {
    return (
      <section className="inventario-panel">
        <h2>Acceso restringido</h2>
        <p>
          No tienes permisos para registrar ajustes
          de inventario.
        </p>
      </section>
    );
  }

  return (
    <div className="ajustes-pagina">

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
          <ClipboardList size={18} />
          Registrar ajuste
        </button>

        <button
          type="button"
          className={
            vista === 'historial' ? 'activo' : ''
          }
          disabled={guardando}
          onClick={() => setVista('historial')}
        >
          <History size={18} />
          Historial de ajustes
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

      {vista === 'registrar' ? (

        /* FORMULARIO */

        <form
          className="inventario-panel"
          onSubmit={guardarAjuste}
        >

          <div className="inventario-titulo">
            <div>
              <h2>Ajustar existencias</h2>

              <p>
                Registra diferencias del inventario
                físico y justifica cada movimiento.
              </p>
            </div>

            <button
              type="button"
              className="inventario-btn secundario"
              disabled={guardando}
              onClick={() =>
                void actualizarInventario()
              }
            >
              <RefreshCw size={17} />
              Actualizar stock
            </button>
          </div>

          <fieldset disabled={guardando}>

            <div className="ajustes-form-grid">

              <div className="ajustes-selector">
                <label>Buscar repuesto *</label>

                <BuscadorRepuestos
                  repuestos={repuestos}
                  valor={repuestoId}
                  onSeleccionar={seleccionarRepuesto}
                  disabled={guardando}
                />
              </div>

              <label>
                Tipo de ajuste *

                <select
                  value={tipoAjuste}
                  onChange={e =>
                    setTipoAjuste(
                      e.target.value as TipoAjuste
                    )
                  }
                >
                  <option value="FALTANTE">
                    Faltante de inventario
                  </option>

                  <option value="SOBRANTE">
                    Sobrante de inventario
                  </option>

                  <option value="DANADO">
                    Producto dañado
                  </option>
                </select>
              </label>

              <label>
                Cantidad del ajuste *

                <input
                  type="number"
                  min="1"
                  max="2147483647"
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
                  <span>Stock actual</span>
                  <strong>
                    {stockEsperado} unidades
                  </strong>
                </div>

                <div>
                  <span>Costo PMP vigente</span>
                  <strong>
                    {dinero(costoPMP)}
                  </strong>
                </div>

                <div>
                  <span>Stock después del ajuste</span>

                  <strong>
                    {
                      stockNuevo !== null &&
                      stockNuevo >= 0
                        ? `${stockNuevo} unidades`
                        : '—'
                    }
                  </strong>
                </div>

              </div>

            )}

            {stockNuevo !== null && stockNuevo < 0 && (

              <div className="inventario-mensaje aviso">
                No puedes retirar más unidades de
                las disponibles en el inventario.
              </div>

            )}

            {repuestoSeleccionado && costoPMP <= 0 && (

              <div className="inventario-mensaje aviso">
                Este repuesto todavía no tiene un PMP
                válido. No es posible registrar el ajuste.
              </div>

            )}

            <label className="ajustes-motivo">
              Motivo del ajuste *

              <textarea
                rows={4}
                required
                minLength={5}
                maxLength={200}
                placeholder="Ej. Diferencia encontrada durante el conteo físico..."
                value={motivo}
                onChange={e =>
                  setMotivo(e.target.value)
                }
              />

              <small>
                {motivo.length}/200 caracteres
              </small>
            </label>

            <div className="inventario-nota">
              El ajuste modificará únicamente las
              existencias. El costo PMP y el precio
              de venta permanecerán sin cambios.
              El motivo y el usuario responsable
              quedarán registrados en Kardex.
            </div>

            <div className="inventario-form-footer">
              <button
                type="submit"
                className="inventario-btn primario"
                disabled={guardando || !ajusteValido}
              >
                <Save size={18} />

                {guardando
                  ? 'Registrando...'
                  : 'Registrar ajuste'}
              </button>
            </div>

          </fieldset>

        </form>

      ) : (

        /* HISTORIAL DE AJUSTES */

        <section className="inventario-panel">

          <div className="inventario-titulo">
            <div>
              <h2>Historial de ajustes</h2>
              <p>
                Consulta las correcciones registradas
                en el inventario.
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
            placeholder="Buscar repuesto, motivo o usuario..."
            value={busqueda}
            onChange={e =>
              setBusqueda(e.target.value)
            }
          />

          {ajustesFiltrados.length === 0 ? (

            <div className="inventario-vacio">
              <History size={40} />

              <h3>No hay ajustes para mostrar</h3>

              <p>
                Registra un ajuste o cambia la búsqueda.
              </p>
            </div>

          ) : (

            <div className="inventario-tabla-scroll">

              <table className="inventario-tabla kardex-tabla">

                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Repuesto</th>
                    <th>Ajuste</th>
                    <th>Stock anterior</th>
                    <th>Stock nuevo</th>
                    <th>PMP</th>
                    <th>Motivo</th>
                    <th>Usuario</th>
                  </tr>
                </thead>

                <tbody>
                  {ajustesFiltrados.map(ajuste => {

                    const cambio =
                      Number(ajuste.stockNuevo) -
                      Number(ajuste.stockAnterior);

                    return (

                      <tr key={ajuste.id}>

                        <td>{ajuste.fechaAjuste}</td>

                        <td>
                          <strong>
                            {ajuste.repuestoNombre}
                          </strong>
                        </td>

                        <td
                          className={
                            cambio > 0
                              ? 'kardex-positivo'
                              : 'kardex-negativo'
                          }
                        >
                          {cambio > 0 ? '+' : ''}
                          {cambio}
                        </td>

                        <td>{ajuste.stockAnterior}</td>

                        <td>{ajuste.stockNuevo}</td>

                        <td>
                          {dinero(
                            ajuste.costoPMPResultante
                          )}
                        </td>

                        <td className="ajustes-celda-motivo">
                          {ajuste.observaciones || '—'}
                        </td>

                        <td>{ajuste.usuarioNombre}</td>

                      </tr>

                    );
                  })}
                </tbody>

              </table>

            </div>

          )}

        </section>

      )}

    </div>
  );
}
