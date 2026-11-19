
import { useState } from 'react';
import { obtenerToken } from '../services/auth';
import './ReportesMecanicos.css';
import './DetalleProductividadMecanicos.css';

type Trabajo = {
  id: string;
  descripcion: string;
  valorManoObra: number;
  comisionGenerada: number | null;
};

type RepuestoOrden = {
  repuestoId: string;
  repuesto: string;
  cantidad: number;
  ingresos: number | null;
  costoTotalPMP: number;
  margenBruto: number | null;
};

type Orden = {
  ordenId: string;
  mecanico: string;
  placa: string;
  fechaFinalizacion: string;
  horasEfectivas: number;
  totalManoObra: number;
  totalComisionRegistrada: number;
  totalIngresosRepuestos: number | null;
  totalCostoRepuestos: number;
  margenBrutoRepuestos: number | null;
  unidadesRepuestos: number;
  trabajos: Trabajo[];
  repuestos: RepuestoOrden[];
};

const moneda = (valor: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2
  }).format(valor);

const monedaDisponible = (valor: number | null) =>
  valor === null
    ? 'No disponible'
    : moneda(valor);

function fechaColombia(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const valor = (tipo: string) =>
    partes.find(p => p.type === tipo)?.value ?? '';

  return [
    valor('year'),
    valor('month'),
    valor('day')
  ].join('-');
}

export default function DetalleProductividadMecanicos() {
  const hoy = fechaColombia();

  const [desde, setDesde] = useState(
    `${hoy.slice(0, 7)}-01`
  );

  const [hasta, setHasta] = useState(hoy);

  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [consultado, setConsultado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const [expandido, setExpandido] =
    useState<string | null>(null);

  const ordenesFiltradas = ordenes.filter(orden => {
    const termino = busqueda.trim().toLocaleLowerCase('es');

    if (!termino) {
      return true;
    }

    return [
      orden.mecanico,
      orden.placa,
      orden.ordenId,
      ...orden.trabajos.map(trabajo => trabajo.descripcion),
      ...orden.repuestos.map(repuesto => repuesto.repuesto)
    ].some(valor => valor.toLocaleLowerCase('es').includes(termino));
  });

  const repuestosCompletos = ordenesFiltradas.every(
    orden => orden.totalIngresosRepuestos !== null
  );
  const margenCompleto = ordenesFiltradas.every(
    orden => orden.margenBrutoRepuestos !== null
  );
  const valorRepuestos = repuestosCompletos
    ? ordenesFiltradas.reduce(
        (total, orden) =>
          total + (orden.totalIngresosRepuestos ?? 0),
        0
      )
    : null;
  const costoRepuestos = ordenesFiltradas.reduce(
    (total, orden) => total + orden.totalCostoRepuestos,
    0
  );
  const margenRepuestos = margenCompleto
    ? ordenesFiltradas.reduce(
        (total, orden) =>
          total + (orden.margenBrutoRepuestos ?? 0),
        0
      )
    : null;
  const unidadesRepuestos = ordenesFiltradas.reduce(
    (total, orden) => total + orden.unidadesRepuestos,
    0
  );

  async function consultar() {
    setError('');

    if (!desde || !hasta || desde > hasta) {
      setError('Selecciona un período válido.');
      return;
    }

    setCargando(true);
    setConsultado(false);
    setOrdenes([]);
    setExpandido(null);

    try {
      const token = obtenerToken();

      if (!token) {
        throw new Error(
          'Tu sesión ha expirado.'
        );
      }

      const parametros = new URLSearchParams({
        desde,
        hasta
      });

      const respuesta = await fetch(
        `https://uraba-motors-fc.onrender.com/api/reportes/mecanicos/detalle?${parametros}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.mensaje ||
          `Error HTTP ${respuesta.status}`
        );
      }

      setOrdenes(datos.ordenes ?? []);
      setConsultado(true);

    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Error al consultar el detalle.'
      );

    } finally {
      setCargando(false);
    }
  }

  return (
    <section className="rm-panel">

      <h3>Detalle de servicio por mecánico</h3>

      <p className="rm-aviso">
        Consulta tareas y repuestos usados en órdenes finalizadas. El margen
        es bruto de repuestos (valor de venta menos costo PMP) y no descuenta
        comisiones ni otros gastos. Si falta un precio histórico, el valor y
        el margen aparecen como no disponibles.
      </p>

      <div className="rm-filtros">

        <label>
          Desde
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
          />
        </label>

        <label>
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
          />
        </label>

        <button
          type="button"
          className="rm-boton"
          disabled={cargando}
          onClick={() => void consultar()}
        >
          {cargando
            ? 'Consultando…'
            : 'Consultar servicios'}
        </button>

      </div>

      {error && (
        <p role="alert" className="rm-alerta rm-error">
          {error}
        </p>
      )}

      {consultado && ordenes.length === 0 && (
        <p>
          No hay órdenes finalizadas en este período.
        </p>
      )}

      {consultado && ordenes.length > 0 && (
        <>

          <label className="dpm-busqueda">
            <span>Buscar por mecánico, placa, orden, tarea o repuesto</span>
            <input
              type="search"
              value={busqueda}
              onChange={evento => setBusqueda(evento.target.value)}
              placeholder="Escribe un nombre, placa, ID o tarea…"
            />
          </label>

          {ordenesFiltradas.length === 0 ? (
            <p className="rm-vacio">
              No hay órdenes que coincidan con la búsqueda.
            </p>
          ) : (
            <>
          <p className="rm-aviso">
            {ordenesFiltradas.length} de {ordenes.length} órdenes ·
            {' '}Mano de obra:{' '}
            <strong>
              {moneda(
                ordenesFiltradas.reduce(
                  (suma, orden) =>
                    suma + orden.totalManoObra,
                  0
                )
              )}
            </strong>
            {' '}· Repuestos:{' '}
            <strong>{monedaDisponible(valorRepuestos)}</strong>
            {' '}· Costo PMP:{' '}
            <strong>{moneda(costoRepuestos)}</strong>
            {' '}· Margen bruto repuestos:{' '}
            <strong>{monedaDisponible(margenRepuestos)}</strong>
            {' '}· Unidades:{' '}
            <strong>{unidadesRepuestos}</strong>
          </p>

          <div className="rm-tabla-contenedor">
            <table className="rm-tabla">

              <thead>
                <tr>
                  <th>Mecánico</th>
                  <th>Placa</th>
                  <th>Finalización</th>
                  <th>Trabajos</th>
                  <th>Mano de obra</th>
                  <th>Repuestos (unid.)</th>
                  <th>Valor repuestos</th>
                  <th>Margen repuestos</th>
                  <th>Horas</th>
                  <th>Acción</th>
                </tr>
              </thead>

              <tbody>
                {ordenesFiltradas.map(orden => (
                  <tr key={orden.ordenId}>

                    <td>{orden.mecanico}</td>
                    <td>{orden.placa}</td>

                    <td>
                      {orden.fechaFinalizacion}
                    </td>

                    <td>
                      {orden.trabajos.length}
                    </td>

                    <td>
                      {moneda(orden.totalManoObra)}
                    </td>

                    <td>{orden.unidadesRepuestos}</td>
                    <td>
                      {monedaDisponible(
                        orden.totalIngresosRepuestos
                      )}
                    </td>
                    <td>
                      {monedaDisponible(
                        orden.margenBrutoRepuestos
                      )}
                    </td>

                    <td>
                      {orden.horasEfectivas.toFixed(2)}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="rm-boton rm-secundario"
                        aria-expanded={
                          expandido === orden.ordenId
                        }
                        onClick={() =>
                          setExpandido(
                            expandido === orden.ordenId
                              ? null
                              : orden.ordenId
                          )
                        }
                      >
                        {expandido === orden.ordenId
                          ? 'Ocultar'
                          : 'Ver detalle'}
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>

            </table>
          </div>

          {ordenesFiltradas
            .filter(
              orden => orden.ordenId === expandido
            )
            .map(orden => (
              <div
                key={orden.ordenId}
                className="rm-panel"
              >

                <h4>
                  Orden <code className="rm-id">{orden.ordenId}</code>
                  {' · '}{orden.placa} · {orden.mecanico}
                </h4>

                <div className="rm-tabla-contenedor">
                  <table className="rm-tabla">

                    <thead>
                      <tr>
                        <th>Trabajo realizado</th>
                        <th>Mano de obra</th>
                        <th>Comisión registrada</th>
                      </tr>
                    </thead>

                    <tbody>
                      {orden.trabajos.map(trabajo => (
                        <tr key={trabajo.id}>

                          <td>
                            {trabajo.descripcion}
                          </td>

                          <td>
                            {moneda(trabajo.valorManoObra)}
                          </td>

                          <td>
                            {trabajo.comisionGenerada === null
                              ? 'Sin generar'
                              : moneda(
                                  trabajo.comisionGenerada
                                )}
                          </td>

                        </tr>
                      ))}
                    </tbody>

                  </table>
                </div>

                <h4>Repuestos utilizados</h4>

                {orden.repuestos.length === 0 ? (
                  <p>No se registraron repuestos para esta orden.</p>
                ) : (
                  <div className="rm-tabla-contenedor">
                    <table className="rm-tabla">
                      <thead>
                        <tr>
                          <th>Repuesto</th>
                          <th>Cantidad</th>
                          <th>Valor de venta</th>
                          <th>Costo PMP total</th>
                          <th>Margen bruto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orden.repuestos.map(repuesto => (
                          <tr key={repuesto.repuestoId}>
                            <td>{repuesto.repuesto}</td>
                            <td>{repuesto.cantidad}</td>
                            <td>{monedaDisponible(repuesto.ingresos)}</td>
                            <td>{moneda(repuesto.costoTotalPMP)}</td>
                            <td>{monedaDisponible(repuesto.margenBruto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p>
                  <strong>Total mano de obra:</strong>
                  {' '}
                  {moneda(orden.totalManoObra)}
                  {' · '}
                  <strong>Valor de repuestos:</strong>
                  {' '}
                  {monedaDisponible(
                    orden.totalIngresosRepuestos
                  )}
                  {' · '}
                  <strong>Costo PMP:</strong>
                  {' '}
                  {moneda(orden.totalCostoRepuestos)}
                  {' · '}
                  <strong>Margen bruto repuestos:</strong>
                  {' '}
                  {monedaDisponible(
                    orden.margenBrutoRepuestos
                  )}
                  {' · '}
                  <strong>Comisiones registradas:</strong>
                  {' '}
                  {moneda(orden.totalComisionRegistrada)}
                </p>

              </div>
            ))}

            </>
          )}
        </>
      )}

    </section>
  );
}
