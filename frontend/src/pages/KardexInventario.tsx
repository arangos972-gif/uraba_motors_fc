
import { useEffect, useState } from 'react';

import {
  History,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search
} from 'lucide-react';

import { obtenerToken } from '../services/auth';

import './Inventario.css';

const API = 'https://uraba-motors-fc.onrender.com/api';

interface Repuesto {
  id: string;
  nombre: string;
}

interface Movimiento {
  id: string;
  repuestoId: string;
  repuestoNombre: string;
  tipoMovimiento: string;
  cantidad: number;
  costoUnitarioMovimiento: string | number;
  costoPMPResultante: string | number;
  stockAnterior: number;
  stockNuevo: number;
  referenciaOrigenId: string | null;
  usuarioNombre: string;
  observaciones: string | null;
  numeroFacturaProveedor: string | null;
  proveedor: string | null;
  fechaMovimiento: string;
}

interface RespuestaKardex {
  movimientos: Movimiento[];

  resumen: {
    totalMovimientos: number;
    entradas: number;
    salidas: number;
  };

  paginacion: {
    pagina: number;
    limite: number;
    totalMovimientos: number;
    totalPaginas: number;
  };
}

const tiposMovimiento = [
  {
    valor: 'ENTRADA_COMPRA',
    nombre: 'Entrada por compra'
  },
  {
    valor: 'SALIDA_VENTA_MOSTRADOR',
    nombre: 'Venta de mostrador'
  },
  {
    valor: 'SALIDA_SERVICIO_MECANICO',
    nombre: 'Servicio mecánico'
  },
  {
    valor: 'AJUSTE_INVENTARIO',
    nombre: 'Ajuste de inventario'
  },
  {
    valor: 'DEVOLUCION',
    nombre: 'Devolución'
  }
];

const filtrosIniciales = {
  busqueda: '',
  repuestoId: '',
  tipoMovimiento: '',
  desde: '',
  hasta: ''
};

function dinero(valor: string | number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(valor));
}

function encabezados() {
  return {
    Authorization: `Bearer ${obtenerToken() ?? ''}`
  };
}

export default function KardexInventario() {

  const [repuestos, setRepuestos] =
    useState<Repuesto[]>([]);

  const [filtros, setFiltros] =
    useState({ ...filtrosIniciales });

  const [filtrosAplicados, setFiltrosAplicados] =
    useState({ ...filtrosIniciales });

  const [pagina, setPagina] = useState(1);
  const [version, setVersion] = useState(0);

  const [datos, setDatos] =
    useState<RespuestaKardex | null>(null);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [errorCatalogo, setErrorCatalogo] =
    useState('');

  // ========================================
  // CARGAR REPUESTOS PARA EL FILTRO
  // ========================================

  useEffect(() => {
    const controlador = new AbortController();

    async function cargarRepuestos() {
      try {
        const respuesta = await fetch(
          `${API}/repuestos`,
          {
            headers: encabezados(),
            signal: controlador.signal
          }
        );

        if (!respuesta.ok) {
          throw new Error(
            'No fue posible cargar los repuestos'
          );
        }

        const resultado = await respuesta.json();

        if (!Array.isArray(resultado)) {
          throw new Error('Catálogo no válido');
        }

        if (!controlador.signal.aborted) {
          setRepuestos(resultado);
          setErrorCatalogo('');
        }

      } catch (err) {
        if (controlador.signal.aborted) return;

        setErrorCatalogo(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar el catálogo'
        );
      }
    }

    void cargarRepuestos();

    return () => controlador.abort();
  }, []);

  // ========================================
  // CONSULTAR KARDEX
  // ========================================

  useEffect(() => {
    const controlador = new AbortController();

    async function cargarKardex() {
      setCargando(true);
      setError('');

      try {
        const parametros = new URLSearchParams();

        Object.entries(filtrosAplicados).forEach(
          ([clave, valor]) => {
            if (valor.trim()) {
              parametros.set(clave, valor.trim());
            }
          }
        );

        parametros.set('pagina', String(pagina));

        const respuesta = await fetch(
          `${API}/kardex?${parametros.toString()}`,
          {
            headers: encabezados(),
            signal: controlador.signal
          }
        );

        const resultado =
          await respuesta.json().catch(() => null);

        if (!respuesta.ok) {
          throw new Error(
            resultado?.mensaje ||
            `Error de consulta (${respuesta.status})`
          );
        }

        if (
          !resultado ||
          !Array.isArray(resultado.movimientos) ||
          !resultado.resumen ||
          !resultado.paginacion
        ) {
          throw new Error(
            'El servidor devolvió datos no válidos'
          );
        }

        if (!controlador.signal.aborted) {
          setDatos(resultado);
        }

      } catch (err) {
        if (controlador.signal.aborted) return;

        setDatos(null);

        setError(
          err instanceof Error
            ? err.message
            : 'No fue posible consultar Kardex'
        );

      } finally {
        if (!controlador.signal.aborted) {
          setCargando(false);
        }
      }
    }

    void cargarKardex();

    return () => controlador.abort();

  }, [filtrosAplicados, pagina, version]);

  // ========================================
  // FILTROS
  // ========================================

  function aplicarFiltros() {
    if (
      filtros.desde &&
      filtros.hasta &&
      filtros.desde > filtros.hasta
    ) {
      setError(
        'La fecha inicial no puede ser mayor a la final'
      );
      return;
    }

    setPagina(1);
    setFiltrosAplicados({ ...filtros });
  }

  function limpiarFiltros() {
    setFiltros({ ...filtrosIniciales });
    setFiltrosAplicados({ ...filtrosIniciales });
    setPagina(1);
    setError('');
  }

  const resumen = datos?.resumen;

  return (
    <div className="kardex-pagina">

      {/* ENCABEZADO */}

      <section className="inventario-panel">

        <div className="inventario-titulo">
          <div>
            <h2>Kardex PMP</h2>
            <p>
              Historial de entradas, salidas y costos
              del inventario.
            </p>
          </div>

          <button
            type="button"
            className="inventario-btn secundario"
            disabled={cargando}
            onClick={() =>
              setVersion(anterior => anterior + 1)
            }
          >
            <RefreshCw size={17} />
            Actualizar
          </button>
        </div>

        {/* INDICADORES */}

        <div className="kardex-resumen">

          <div className="kardex-indicador">
            <History size={22} />

            <span>Movimientos</span>

            <strong>
              {cargando
                ? '—'
                : resumen?.totalMovimientos ?? '—'}
            </strong>
          </div>

          <div className="kardex-indicador entrada">
            <ArrowDownLeft size={22} />

            <span>Unidades ingresadas</span>

            <strong>
              {cargando
                ? '—'
                : resumen?.entradas ?? '—'}
            </strong>
          </div>

          <div className="kardex-indicador salida">
            <ArrowUpRight size={22} />

            <span>Unidades retiradas</span>

            <strong>
              {cargando
                ? '—'
                : resumen?.salidas ?? '—'}
            </strong>
          </div>

        </div>

        {/* FILTROS */}

        <form
          className="kardex-filtros"
          onSubmit={evento => {
            evento.preventDefault();
            aplicarFiltros();
          }}
        >

          <div className="kardex-busqueda">
            <Search size={19} />

            <input
              type="search"
              placeholder="Buscar repuesto, factura o proveedor..."
              value={filtros.busqueda}
              onChange={evento =>
                setFiltros({
                  ...filtros,
                  busqueda: evento.target.value
                })
              }
            />
          </div>

          <div className="kardex-filtros-grid">

            <label>
              Repuesto

              <select
                value={filtros.repuestoId}
                onChange={evento =>
                  setFiltros({
                    ...filtros,
                    repuestoId: evento.target.value
                  })
                }
              >
                <option value="">
                  Todos los repuestos
                </option>

                {repuestos.map(repuesto => (
                  <option
                    key={repuesto.id}
                    value={repuesto.id}
                  >
                    {repuesto.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tipo de movimiento

              <select
                value={filtros.tipoMovimiento}
                onChange={evento =>
                  setFiltros({
                    ...filtros,
                    tipoMovimiento: evento.target.value
                  })
                }
              >
                <option value="">
                  Todos los movimientos
                </option>

                {tiposMovimiento.map(tipo => (
                  <option
                    key={tipo.valor}
                    value={tipo.valor}
                  >
                    {tipo.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Desde

              <input
                type="date"
                value={filtros.desde}
                onChange={evento =>
                  setFiltros({
                    ...filtros,
                    desde: evento.target.value
                  })
                }
              />
            </label>

            <label>
              Hasta

              <input
                type="date"
                value={filtros.hasta}
                onChange={evento =>
                  setFiltros({
                    ...filtros,
                    hasta: evento.target.value
                  })
                }
              />
            </label>

          </div>

          <div className="kardex-acciones">
            <button
              type="button"
              className="inventario-btn secundario"
              onClick={limpiarFiltros}
            >
              Limpiar filtros
            </button>

            <button
              type="submit"
              className="inventario-btn primario"
            >
              <Search size={17} />
              Buscar
            </button>
          </div>

        </form>

        {errorCatalogo && (
          <div className="inventario-mensaje aviso">
            {errorCatalogo}. Puedes utilizar los demás
            filtros.
          </div>
        )}

        {error && (
          <div
            className="inventario-mensaje error"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* TABLA DE MOVIMIENTOS */}

        {cargando ? (

          <div className="inventario-vacio">
            Cargando movimientos...
          </div>

        ) : !datos ? (

          <div className="inventario-vacio">
            No se pudo cargar el historial.
          </div>

        ) : datos.movimientos.length === 0 ? (

          <div className="inventario-vacio">
            <History size={40} />
            <h3>No hay movimientos registrados</h3>
            <p>
              Registra una compra o cambia los filtros
              para consultar el historial.
            </p>
          </div>

        ) : (

          <div className="inventario-tabla-scroll">

            <table className="inventario-tabla kardex-tabla">

              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Repuesto</th>
                  <th>Movimiento</th>
                  <th>Cantidad</th>
                  <th>Stock anterior</th>
                  <th>Stock nuevo</th>
                  <th>Costo unitario</th>
                  <th>PMP resultante</th>
                  <th>Referencia</th>
                  <th>Usuario</th>
                </tr>
              </thead>

              <tbody>
                {datos.movimientos.map(movimiento => {
                  const diferencia =
                    Number(movimiento.stockNuevo) -
                    Number(movimiento.stockAnterior);

                  const tipo = tiposMovimiento.find(
                    t => t.valor === movimiento.tipoMovimiento
                  );

                  return (
                    <tr key={movimiento.id}>

                      <td>
                        {movimiento.fechaMovimiento}
                      </td>

                      <td>
                        <strong>
                          {movimiento.repuestoNombre}
                        </strong>
                      </td>

                      <td>
                        <span
                          className={
                            `kardex-movimiento ${
                              diferencia > 0
                                ? 'entrada'
                                : diferencia < 0
                                  ? 'salida'
                                  : 'neutro'
                            }`
                          }
                        >
                          {tipo?.nombre ||
                            movimiento.tipoMovimiento}
                        </span>
                      </td>

                      <td
                        className={
                          diferencia > 0
                            ? 'kardex-positivo'
                            : diferencia < 0
                              ? 'kardex-negativo'
                              : ''
                        }
                      >
                        {diferencia > 0 ? '+' : ''}
                        {diferencia}
                      </td>

                      <td>
                        {movimiento.stockAnterior}
                      </td>

                      <td>
                        <strong>
                          {movimiento.stockNuevo}
                        </strong>
                      </td>

                      <td>
                        {dinero(
                          movimiento.costoUnitarioMovimiento
                        )}
                      </td>

                      <td>
                        <strong>
                          {dinero(
                            movimiento.costoPMPResultante
                          )}
                        </strong>
                      </td>

                      <td>
                        {movimiento.numeroFacturaProveedor
                          ? `Factura ${movimiento.numeroFacturaProveedor}`
                          : movimiento.referenciaOrigenId
                            ? `Ref. #${movimiento.referenciaOrigenId.slice(0, 8)}`
                            : '—'}

                        {movimiento.proveedor && (
                          <small>
                            {movimiento.proveedor}
                          </small>
                        )}

                        {movimiento.observaciones && (
                          <small
                            title={movimiento.observaciones}
                          >
                            {movimiento.observaciones}
                          </small>
                        )}
                      </td>

                      <td>
                        {movimiento.usuarioNombre}
                      </td>

                    </tr>
                  );
                })}
              </tbody>

            </table>

          </div>

        )}

        {/* PAGINACIÓN */}

        {datos && !cargando && (
          <div className="kardex-paginacion">

            <span>
              {datos.paginacion.totalMovimientos}
              {' '}movimientos · Página {pagina} de{' '}
              {datos.paginacion.totalPaginas}
            </span>

            <div className="kardex-acciones">

              <button
                type="button"
                className="inventario-btn secundario"
                disabled={pagina <= 1}
                onClick={() =>
                  setPagina(anterior => anterior - 1)
                }
              >
                <ChevronLeft size={17} />
                Anterior
              </button>

              <button
                type="button"
                className="inventario-btn secundario"
                disabled={
                  pagina >= datos.paginacion.totalPaginas
                }
                onClick={() =>
                  setPagina(anterior => anterior + 1)
                }
              >
                Siguiente
                <ChevronRight size={17} />
              </button>

            </div>
          </div>
        )}

      </section>
    </div>
  );
}
