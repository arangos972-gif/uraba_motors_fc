import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { obtenerToken } from '../services/auth';
import './IngresosPorPeriodo.css';

const API = 'https://uraba-motors-fc.onrender.com/api/reportes/ingresos';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

interface Totales {
  totalFacturado: number;
  totalVentas: number;
  totalGenerado: number;
  manoObraFacturada: number;
  totalRepuestosVendidos: number;
  costoRepuestos: number | null;
  gananciaBrutaRepuestos: number | null;
  costosRepuestosCompletos: boolean;
  unidadesRepuestos: number;
  cantidadFacturas: number;
  cantidadVentas: number;
  cantidadDevoluciones: number;
}

interface IngresoMensual extends Totales {
  mes: number;
}

interface IngresoDiario extends Totales {
  fecha: string;
}

interface ReporteIngresos {
  anio: number;
  mes: number;
  resumen: Totales;
  meses: IngresoMensual[];
  dias: IngresoDiario[];
  productos: ProductoVendido[];
}

interface ProductoVendido {
  repuestoId: string;
  repuesto: string;
  cantidad: number;
  ingresos: number;
  costoRepuestos: number | null;
  gananciaBruta: number | null;
  costosCompletos: boolean;
}

function anioActualColombia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric'
  }).format(new Date());
}

function mesActualColombia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    month: '2-digit'
  }).format(new Date());
}

const FILTRO_INICIAL = {
  anio: anioActualColombia(),
  mes: mesActualColombia()
};

function moneda(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(valor);
}

async function solicitarReporte(
  anio: number,
  mes: number
): Promise<ReporteIngresos> {
  const token = obtenerToken();

  if (!token) {
    throw new Error(
      'La sesión ha expirado. Inicia sesión nuevamente.'
    );
  }

  const parametros = new URLSearchParams({
    anio: String(anio),
    mes: String(mes)
  });

  let respuesta: Response;

  try {
    respuesta = await fetch(`${API}?${parametros}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch {
    throw new Error(
      'No se pudo conectar al servidor. Comprueba que el backend esté iniciado.'
    );
  }

  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    throw new Error(
      datos?.mensaje ||
      `No fue posible consultar el reporte (${respuesta.status}).`
    );
  }

  if (
    !datos ||
    typeof datos.anio !== 'number' ||
    typeof datos.mes !== 'number' ||
    !Array.isArray(datos.meses) ||
    !Array.isArray(datos.dias) ||
    !Array.isArray(datos.productos) ||
    typeof datos.resumen?.totalGenerado !== 'number'
  ) {
    throw new Error(
      'La respuesta del reporte de ingresos no es válida.'
    );
  }

  return datos as ReporteIngresos;
}

function mensajeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No fue posible consultar el reporte de ingresos.';
}

function monedaDisponible(valor: number | null): string {
  return valor === null
    ? 'No disponible'
    : moneda(valor);
}

export default function IngresosPorPeriodo() {
  const [anio, setAnio] = useState(FILTRO_INICIAL.anio);
  const [mes, setMes] = useState(FILTRO_INICIAL.mes);
  const [reporte, setReporte] =
    useState<ReporteIngresos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function consultar() {
    const anioNumero = Number(anio);
    const mesNumero = Number(mes);

    if (
      !/^\d{4}$/.test(anio) ||
      anioNumero < 2000 ||
      anioNumero > 2100
    ) {
      setError('El año debe estar entre 2000 y 2100.');
      return;
    }

    if (!Number.isInteger(mesNumero) || mesNumero < 1 || mesNumero > 12) {
      setError('Selecciona un mes válido.');
      return;
    }

    setCargando(true);
    setError('');

    try {
      setReporte(await solicitarReporte(anioNumero, mesNumero));
    } catch (consultaError) {
      setError(mensajeError(consultaError));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    let cancelado = false;

    async function cargarInicial() {
      try {
        const resultado = await solicitarReporte(
          Number(FILTRO_INICIAL.anio),
          Number(FILTRO_INICIAL.mes)
        );

        if (!cancelado) {
          setReporte(resultado);
        }
      } catch (consultaError) {
        if (!cancelado) {
          setError(mensajeError(consultaError));
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    }

    void cargarInicial();

    return () => {
      cancelado = true;
    };
  }, []);

  const maximoMensual = Math.max(
    0,
    ...(reporte?.meses.map(item => item.totalGenerado) ?? [])
  );

  return (
    <section className="ip-reporte" aria-labelledby="ip-titulo">
      <header className="ip-encabezado">
        <div>
          <h2 id="ip-titulo">Ingresos generados por día y mes</h2>
          <p>Facturación y ventas de mostrador agrupadas por fecha.</p>
        </div>

        <button
          type="button"
          className="ip-boton"
          onClick={() => void consultar()}
          disabled={cargando}
        >
          <RefreshCw size={17} aria-hidden="true" />
          {cargando ? 'Consultando…' : 'Consultar'}
        </button>
      </header>

      <div className="ip-filtros">
        <label>
          Año
          <input
            type="number"
            min="2000"
            max="2100"
            value={anio}
            onChange={evento => setAnio(evento.target.value)}
          />
        </label>

        <label>
          Mes para el detalle diario
          <select
            value={mes}
            onChange={evento => setMes(evento.target.value)}
          >
            {MESES.map((nombre, indice) => (
              <option key={nombre} value={String(indice + 1)}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="ip-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="ip-boton ip-boton-error"
            onClick={() => void consultar()}
            disabled={cargando}
          >
            Reintentar
          </button>
        </div>
      )}

      {cargando && !reporte ? (
        <p className="ip-estado" role="status">
          Cargando ingresos…
        </p>
      ) : reporte ? (
        <>
          <p className="ip-nota">
            Se suman las facturas no anuladas —incluidas las pendientes—
            y las ventas de mostrador, descontando devoluciones de clientes.
            No se suman los pagos aparte para evitar duplicar facturas; el
            total no necesariamente representa el dinero recaudado.
            La ganancia es margen bruto de repuestos: no descuenta mano de obra,
            comisiones ni otros gastos. Si falta costo PMP histórico, se muestra
            como no disponible en lugar de estimarlo.
          </p>

          <div className="ip-resumen">
            <article className="ip-tarjeta">
              <span>Total generado neto en {reporte.anio}</span>
              <strong>{moneda(reporte.resumen.totalGenerado)}</strong>
            </article>
            <article className="ip-tarjeta">
              <span>Facturas no anuladas</span>
              <strong>{moneda(reporte.resumen.totalFacturado)}</strong>
              <small>{reporte.resumen.cantidadFacturas} facturas</small>
            </article>
            <article className="ip-tarjeta">
              <span>Ventas de mostrador</span>
              <strong>{moneda(reporte.resumen.totalVentas)}</strong>
              <small>{reporte.resumen.cantidadVentas} ventas</small>
            </article>
            <article className="ip-tarjeta">
              <span>Mano de obra facturada</span>
              <strong>{moneda(reporte.resumen.manoObraFacturada)}</strong>
            </article>
            <article className="ip-tarjeta">
              <span>Repuestos vendidos (neto)</span>
              <strong>{moneda(reporte.resumen.totalRepuestosVendidos)}</strong>
              <small>{reporte.resumen.unidadesRepuestos} unidades netas</small>
            </article>
            <article className="ip-tarjeta">
              <span>Costo PMP de repuestos</span>
              <strong>{monedaDisponible(reporte.resumen.costoRepuestos)}</strong>
            </article>
            <article className="ip-tarjeta">
              <span>Margen bruto de repuestos</span>
              <strong>{monedaDisponible(reporte.resumen.gananciaBrutaRepuestos)}</strong>
            </article>
          </div>

          <section className="ip-panel" aria-labelledby="ip-meses-titulo">
            <div className="ip-panel-titulo">
              <div>
                <h3 id="ip-meses-titulo">Totales por mes</h3>
                <p>Valores generados durante {reporte.anio}.</p>
              </div>
            </div>

            <div className="ip-grafica">
              {reporte.meses.map(item => {
                const alto =
                  maximoMensual > 0
                    ? (item.totalGenerado / maximoMensual) * 100
                    : 0;

                return (
                  <div
                    className={`ip-columna ${
                      item.mes === reporte.mes
                        ? 'ip-columna-seleccionada'
                        : ''
                    }`}
                    key={item.mes}
                    title={`${MESES[item.mes - 1]}: ${moneda(item.totalGenerado)}`}
                  >
                    <span className="ip-valor-mes">
                      {moneda(item.totalGenerado)}
                    </span>
                    <div className="ip-barra-contenedor">
                      <div
                        className="ip-barra"
                        style={{ height: `${alto}%` }}
                        role="img"
                        aria-label={`${MESES[item.mes - 1]}: ${moneda(item.totalGenerado)}`}
                      />
                    </div>
                    <span className="ip-mes-etiqueta">
                      {MESES[item.mes - 1].slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="ip-panel" aria-labelledby="ip-dias-titulo">
            <div className="ip-panel-titulo">
              <div>
                <h3 id="ip-dias-titulo">
                  Detalle diario · {MESES[reporte.mes - 1]} {reporte.anio}
                </h3>
                <p>Los días sin movimientos también aparecen con valor cero.</p>
              </div>
            </div>

            <div className="ip-tabla-contenedor">
              <table className="ip-tabla">
                <thead>
                  <tr>
                    <th scope="col">Día</th>
                    <th scope="col">Facturado</th>
                    <th scope="col">Venta mostrador</th>
                    <th scope="col">Mano de obra</th>
                    <th scope="col">Repuestos</th>
                    <th scope="col">Margen repuestos</th>
                    <th scope="col">Total generado</th>
                    <th scope="col">Operaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.dias.map(dia => (
                    <tr key={dia.fecha}>
                      <th scope="row">{Number(dia.fecha.slice(8, 10))}</th>
                      <td>{moneda(dia.totalFacturado)}</td>
                      <td>{moneda(dia.totalVentas)}</td>
                      <td>{moneda(dia.manoObraFacturada)}</td>
                      <td>{moneda(dia.totalRepuestosVendidos)}</td>
                      <td>{monedaDisponible(dia.gananciaBrutaRepuestos)}</td>
                      <td><strong>{moneda(dia.totalGenerado)}</strong></td>
                      <td>
                        {dia.cantidadFacturas +
                          dia.cantidadVentas +
                          dia.cantidadDevoluciones}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ip-panel" aria-labelledby="ip-productos-titulo">
            <div className="ip-panel-titulo">
              <div>
                <h3 id="ip-productos-titulo">
                  Repuestos vendidos · {MESES[reporte.mes - 1]} {reporte.anio}
                </h3>
                <p>
                  Incluye repuestos facturados y ventas de mostrador,
                  menos devoluciones de clientes.
                </p>
              </div>
            </div>

            {reporte.productos.length === 0 ? (
              <p className="ip-estado">
                No hay repuestos vendidos en este período.
              </p>
            ) : (
              <div className="ip-tabla-contenedor">
                <table className="ip-tabla">
                  <thead>
                    <tr>
                      <th scope="col">Repuesto</th>
                      <th scope="col">Unidades netas</th>
                      <th scope="col">Ingresos</th>
                      <th scope="col">Costo PMP</th>
                      <th scope="col">Margen bruto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.productos.map(producto => (
                      <tr key={producto.repuestoId}>
                        <th scope="row">{producto.repuesto}</th>
                        <td>{producto.cantidad}</td>
                        <td>{moneda(producto.ingresos)}</td>
                        <td>{monedaDisponible(producto.costoRepuestos)}</td>
                        <td>
                          <strong>
                            {monedaDisponible(producto.gananciaBruta)}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : !error ? (
        <p className="ip-estado">
          No hay datos disponibles para mostrar.
        </p>
      ) : null}
    </section>
  );
}
