import { useCallback, useEffect, useState } from 'react';
import { obtenerToken } from '../services/auth';
import './ReportesMecanicos.css';
import ProductividadMecanicos from './ProductividadMecanicos';
import DetalleProductividadMecanicos from './DetalleProductividadMecanicos';
import HorarioMecanicos from './HorarioMecanicos';
import CantidadClientes from './CantidadClientes';
import CantidadMecanicos from './CantidadMecanicos';
import TrabajosPorCliente from './TrabajosPorCliente';
import IngresosPorPeriodo from './IngresosPorPeriodo';



const API = 'http://localhost:3000/api';

type VistaReporte = 'productividad' | 'detalle' | 'liquidaciones' | 'horarios' | 'clientes' | 'mecanicos' | 'trabajos-cliente' | 'ingresos';

type Estado = 'CALCULADA' | 'APROBADA' | 'PAGADA';
type Mecanico = { id: string; name: string; email: string; totalOrdenes: number; porcentajeActual: string | number | null };
type Liquidacion = {
  id: string; mecanicoId: string; mecanico: string; periodoInicio: string;
  periodoFin: string; totalManoObra: string | number;
  totalComisiones: string | number; estado: Estado;
  fechaAprobacion?: string | null; fechaPago?: string | null;
};
type Detalle = {
  id: string; servicioId: string; trabajo: string; fechaReconocimiento: string;
  valorManoObra: string | number; porcentajeAplicado: string | number;
  valorComision: string | number;
};
type Pago = { id: string; monto: string | number; medioPago: string; referencia: string | null; fechaPago: string };
type DetalleRespuesta = { liquidacion: Liquidacion; detalles: Detalle[]; pagos: Pago[] };
type MedioPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA' | 'OTRO';

function moneda(valor: number | string | null | undefined): string {
  const numero = Number(valor ?? 0);
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(numero);
}

function fecha(valor: string | null | undefined): string {
  if (!valor) return '—';
  return String(valor).slice(0, 10);
}

async function solicitar<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const token = obtenerToken();
  if (!token) throw new Error('La sesión ha expirado. Inicia sesión nuevamente.');
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API}${ruta}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers
      }
    });
  } catch {
    throw new Error('No se pudo conectar al servidor. Comprueba que el backend esté iniciado.');
  }
  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(json.mensaje || `Error HTTP ${respuesta.status}`);
  return json as T;
}

export default function ReportesMecanicos() {
  const hoy = new Date();
  const [vista, setVista] = useState<VistaReporte>('productividad');
  const [mecanicos, setMecanicos] = useState<Mecanico[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [mecanicoId, setMecanicoId] = useState('');
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [quincena, setQuincena] = useState<1 | 2>(1);
  const [detalle, setDetalle] = useState<DetalleRespuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [medioPago, setMedioPago] = useState<MedioPago>('TRANSFERENCIA');
  const [referencia, setReferencia] = useState('');
  const [confirmarPago, setConfirmarPago] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [m, l] = await Promise.all([
        solicitar<{ mecanicos: Mecanico[] }>('/comisiones/mecanicos'),
        solicitar<{ liquidaciones: Liquidacion[] }>('/liquidaciones')
      ]);
      setMecanicos(m.mecanicos || []);
      setLiquidaciones(l.liquidaciones || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los reportes.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function verDetalle(id: string) {
    setError('');
    setMensaje('');
    setConfirmarPago(false);
    setProcesando(true);
    try {
      setDetalle(await solicitar<DetalleRespuesta>(`/liquidaciones/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible consultar el detalle.');
    } finally { setProcesando(false); }
  }

  async function calcular() {
    if (!mecanicoId) { setError('Selecciona primero un mecánico.'); return; }
    if (!window.confirm('¿Deseas calcular esta quincena? Se incluirán las comisiones ya generadas.')) return;
    setError(''); setMensaje(''); setProcesando(true);
    try {
      const resultado = await solicitar<{ id: string; mensaje: string }>('/liquidaciones/calcular', {
        method: 'POST', body: JSON.stringify({ mecanicoId, anio, mes, quincena })
      });
      await cargar();
      await verDetalle(resultado.id);
      setMensaje(resultado.mensaje);
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible calcular.'); }
    finally { setProcesando(false); }
  }

  async function aprobar() {
    if (!detalle || !window.confirm('¿Confirmas que revisaste los trabajos y apruebas esta liquidación?')) return;
    const id = detalle.liquidacion.id;
    setError(''); setMensaje(''); setProcesando(true);
    try {
      const r = await solicitar<{ mensaje: string }>(`/liquidaciones/${id}/aprobar`, { method: 'PATCH' });
      await Promise.all([cargar(), verDetalle(id)]);
      setMensaje(r.mensaje);
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible aprobar.'); }
    finally { setProcesando(false); }
  }

  async function pagar() {
    if (!detalle || !confirmarPago) return;
    const id = detalle.liquidacion.id;
    setError(''); setMensaje(''); setProcesando(true);
    try {
      const r = await solicitar<{ mensaje: string }>(`/liquidaciones/${id}/pagar`, {
        method: 'POST', body: JSON.stringify({ medioPago, referencia: referencia.trim() || null })
      });
      await Promise.all([cargar(), verDetalle(id)]);
      setReferencia(''); setConfirmarPago(false);
      setMensaje(r.mensaje);
    } catch (e) {
      setError((e instanceof Error ? e.message : 'No se pudo confirmar el pago.') + ' Antes de reintentar, consulta el estado de la liquidación para evitar registrar un pago duplicado.');
    } finally { setProcesando(false); }
  }

  const filtradas = liquidaciones.filter(l => !mecanicoId || l.mecanicoId === mecanicoId);
  const totalCalculado = filtradas.reduce((s, l) => s + Number(l.totalComisiones), 0);
  const totalPagado = filtradas.filter(l => l.estado === 'PAGADA').reduce((s, l) => s + Number(l.totalComisiones), 0);

  return (
    <section className="rm-root">
      <header className="rm-cabecera">
        <div>
          <h2>Reportes y liquidaciones de mecánicos</h2>
          <p>Comisiones individuales sobre mano de obra · Reconocimiento al completar la orden · Quincenas</p>
        </div>
        <button type="button" className="rm-boton rm-secundario" disabled={cargando || procesando} onClick={() => { void cargar(); }}>
          {cargando ? 'Actualizando…' : 'Actualizar datos'}
        </button>
      </header>

      {error && <div className="rm-alerta rm-error" role="alert">{error}</div>}
      {mensaje && <div className="rm-alerta rm-exito" role="status">{mensaje}</div>}

      {/* Productividad independiente de las comisiones */}
      {/* Mostrar una sola sección a la vez */}
      <nav className="rm-navegacion" aria-label="Secciones de reportes">
        <button
          type="button"
          className={`rm-pestana ${vista === 'productividad' ? 'rm-pestana-activa' : ''}`}
          aria-pressed={vista === 'productividad'}
          onClick={() => setVista('productividad')}
        >
          Productividad
        </button>
        <button
          type="button"
          className={`rm-pestana ${vista === 'detalle' ? 'rm-pestana-activa' : ''}`}
          aria-pressed={vista === 'detalle'}
          onClick={() => setVista('detalle')}
        >
          Detalle de servicios por mecánico
        </button>
        <button
          type="button"
          className={`rm-pestana ${vista === 'liquidaciones' ? 'rm-pestana-activa' : ''}`}
          aria-pressed={vista === 'liquidaciones'}
          onClick={() => setVista('liquidaciones')}
        >
          Liquidaciones y pagos
        </button>
        <button
          type="button"
          className={`rm-pestana ${vista === 'horarios' ? 'rm-pestana-activa' : ''}`}
          aria-pressed={vista === 'horarios'}
          onClick={() => setVista('horarios')}
        >
          Horario de mecánicos
        </button>
        <button
          type="button"
          className={`rm-pestana ${vista === 'clientes' ? 'rm-pestana-activa' : ''}`}
          aria-pressed={vista === 'clientes'}
          onClick={() => setVista('clientes')}
        >
          Cantidad de clientes
        </button>
        <button
          type="button"
          className={`rm-pestana ${vista === 'mecanicos' ? 'rm-pestana-activa' : ''}`}
          aria-pressed={vista === 'mecanicos'}
          onClick={() => setVista('mecanicos')}
        >
          Cantidad de mecánicos
        </button>
        <button
          type="button"
          className={`rm-pestana ${vista === 'trabajos-cliente' ? 'rm-pestana-activa' : ''}`}
          aria-pressed={vista === 'trabajos-cliente'}
          onClick={() => setVista('trabajos-cliente')}
        >
          Trabajos por cliente
        </button>
        <button
          type="button"
          className={`rm-pestana ${vista === 'ingresos' ? 'rm-pestana-activa' : ''}`}
          aria-pressed={vista === 'ingresos'}
          onClick={() => setVista('ingresos')}
        >
          Ingresos por día y mes
        </button>
      </nav>

      {vista === 'productividad' && <ProductividadMecanicos />}
      {vista === 'detalle' && <DetalleProductividadMecanicos />}
      {vista === 'horarios' && <HorarioMecanicos />}
      {vista === 'clientes' && <CantidadClientes />}
      {vista === 'mecanicos' && <CantidadMecanicos />}
      {vista === 'trabajos-cliente' && <TrabajosPorCliente />}
      {vista === 'ingresos' && <IngresosPorPeriodo />}

      {vista === 'liquidaciones' && (
        <>
      <div className="rm-tarjetas">
        <div className="rm-tarjeta"><span>Mecánicos registrados en comisiones</span><strong>{mecanicos.length}</strong></div>
        <div className="rm-tarjeta"><span>Liquidaciones consultadas</span><strong>{filtradas.length}</strong></div>
        <div className="rm-tarjeta"><span>Comisiones liquidadas</span><strong>{moneda(totalCalculado)}</strong></div>
        <div className="rm-tarjeta"><span>Liquidaciones pagadas</span><strong>{moneda(totalPagado)}</strong></div>
      </div>
      <p className="rm-aviso">Estos totales corresponden a las liquidaciones registradas, no al total de ingresos del taller ni a una nómina completa.</p>

      <div className="rm-panel">
        <h3>Consultar mecánico y calcular quincena</h3>
        <div className="rm-filtros">
          <label>Mecánico
            <select value={mecanicoId} onChange={e => { setMecanicoId(e.target.value); setDetalle(null); }}>
              <option value="">Todos (para consultar)</option>
              {mecanicos.map(m => <option key={m.id} value={m.id}>{m.name} — {m.porcentajeActual == null ? 'Sin porcentaje' : `${Number(m.porcentajeActual)} %`}</option>)}
            </select>
          </label>
          <label>Año
            <input type="number" min="2000" max="2100" value={anio} onChange={e => setAnio(Number(e.target.value))} />
          </label>
          <label>Mes
            <select value={mes} onChange={e => setMes(Number(e.target.value))}>
              {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((n,i) => <option key={n} value={i+1}>{n}</option>)}
            </select>
          </label>
          <label>Quincena
            <select value={quincena} onChange={e => setQuincena(Number(e.target.value) as 1 | 2)}>
              <option value={1}>1 al 15</option>
              <option value={2}>16 al fin de mes</option>
            </select>
          </label>
        </div>
        <button className="rm-boton" type="button" onClick={() => { void calcular(); }} disabled={procesando || cargando || !mecanicoId}>
          {procesando ? 'Procesando…' : 'Calcular liquidación de esta quincena'}
        </button>
        <p className="rm-aviso">Solo pueden calcularse quincenas terminadas que tengan comisiones generadas y aún no liquidadas.</p>
      </div>

      <div className="rm-panel">
        <h3>Historial de liquidaciones</h3>
        <div className="rm-tabla-contenedor"><table className="rm-tabla"><thead><tr>
          <th>Mecánico</th><th>Desde</th><th>Hasta</th><th>Mano de obra</th><th>Comisión</th><th>Estado</th><th>Detalle</th>
        </tr></thead><tbody>
          {filtradas.length === 0 ? <tr><td colSpan={7} className="rm-vacio">No hay liquidaciones registradas con estos filtros.</td></tr> : filtradas.map(l => <tr key={l.id}>
            <td>{l.mecanico}</td><td>{fecha(l.periodoInicio)}</td><td>{fecha(l.periodoFin)}</td>
            <td>{moneda(l.totalManoObra)}</td><td>{moneda(l.totalComisiones)}</td>
            <td><span className={`rm-estado rm-${l.estado.toLowerCase()}`}>{l.estado}</span></td>
            <td><button className="rm-boton rm-secundario" type="button" disabled={procesando} onClick={() => { void verDetalle(l.id); }}>Ver</button></td>
          </tr>)}
        </tbody></table></div>
      </div>

      {detalle && <div className="rm-panel" id="detalle-liquidacion">
        <div className="rm-titulo-detalle"><div><h3>Detalle de liquidación</h3>
          <p>{detalle.liquidacion.mecanico} · {fecha(detalle.liquidacion.periodoInicio)} a {fecha(detalle.liquidacion.periodoFin)}</p></div>
          <span className={`rm-estado rm-${detalle.liquidacion.estado.toLowerCase()}`}>{detalle.liquidacion.estado}</span>
        </div>
        <div className="rm-tabla-contenedor"><table className="rm-tabla"><thead><tr>
          <th>Trabajo</th><th>Orden</th><th>Fecha</th><th>Mano de obra</th><th>Porcentaje</th><th>Comisión</th>
        </tr></thead><tbody>
          {detalle.detalles.map(d => <tr key={d.id}><td>{d.trabajo}</td><td className="rm-id">{d.servicioId.slice(0, 8)}…</td>
            <td>{fecha(d.fechaReconocimiento)}</td><td>{moneda(d.valorManoObra)}</td><td>{Number(d.porcentajeAplicado)} %</td><td>{moneda(d.valorComision)}</td></tr>)}
        </tbody></table></div>
        <div className="rm-totales"><span>Mano de obra: <b>{moneda(detalle.liquidacion.totalManoObra)}</b></span>
          <span>Comisión total: <b>{moneda(detalle.liquidacion.totalComisiones)}</b></span></div>
        {detalle.liquidacion.estado === 'CALCULADA' && <div className="rm-acciones"><button type="button" className="rm-boton" disabled={procesando} onClick={() => { void aprobar(); }}>Aprobar liquidación revisada</button></div>}
        {detalle.liquidacion.estado === 'APROBADA' && <div className="rm-pago">
          <h4>Registrar pago completo</h4>
          <p>Confirma que el dinero fue entregado realmente al mecánico. Este registro no envía una transferencia.</p>
          <div className="rm-filtros"><label>Medio de pago
            <select value={medioPago} onChange={e => setMedioPago(e.target.value as MedioPago)}>
              <option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option>
              <option value="NEQUI">Nequi</option><option value="DAVIPLATA">Daviplata</option><option value="OTRO">Otro</option>
            </select></label><label>Referencia o comprobante
              <input value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={150} placeholder="Opcional" />
            </label></div>
          <label className="rm-confirmacion"><input type="checkbox" checked={confirmarPago} onChange={e => setConfirmarPago(e.target.checked)} /> Confirmo que ya se realizó el pago completo de {moneda(detalle.liquidacion.totalComisiones)}.</label>
          <button type="button" className="rm-boton" disabled={!confirmarPago || procesando} onClick={() => { void pagar(); }}>Registrar pago realizado</button>
        </div>}
        {detalle.pagos.length > 0 && <div className="rm-comprobantes"><h4>Comprobante de pago</h4>{detalle.pagos.map(p =>
          <p key={p.id}>{fecha(p.fechaPago)} · {p.medioPago} · {moneda(p.monto)}{p.referencia ? ` · Ref. ${p.referencia}` : ''}</p>)}</div>}
      </div>}
        </>
      )}
    </section>
  );
}
