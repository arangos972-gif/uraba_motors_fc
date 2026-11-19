import { useEffect, useMemo, useState } from 'react';

import {
  ClipboardList,
  RefreshCw,
  Search,
  Wrench,
  Bike,
  UserRound,
  Clock3,
  CalendarDays,
  History
} from 'lucide-react';

import { obtenerToken, tienePermiso } from '../services/auth';

import './OrdenesTrabajo.css';
import DetalleEconomicoOrden
  from './DetalleEconomicoOrden';
import CronometroOrden from './CronometroOrden';
const API = 'https://uraba-motors-fc.onrender.com/api';

interface OrdenTrabajo {
  id: string;
  citaId: string | null;
  motoId: string;
  mecanicoId: string;
  descripcion: string;
  estado: string;
  tiempoInicio: string | null;
  tiempoFin: string | null;
  tiempoTrabajo: number | string | null;
  costo: number | string;
  created: string;
  tipoServicio: string | null;
  fechaCita: string | null;
  clienteNombre: string | null;
  motoPlaca: string | null;
  motoMarca: string | null;
  motoModelo: string | null;
  mecanicoNombre: string | null;
}

type VistaOrdenes = 'activas' | 'historial';

const ESTADOS_ACTIVOS = [
  'TODAS',
  'ASIGNADO',
  'EN_PROCESO',
  'PAUSADO'
];

const ESTADOS_HISTORIAL = [
  'TODAS',
  'COMPLETADO',
  'ENTREGADO'
];

const ESTADOS_EN_HISTORIAL = new Set([
  'COMPLETADO',
  'ENTREGADO'
]);

function mostrarEstado(estado: string): string {
  return estado.replace(/_/g, ' ');
}

function mostrarFecha(valor: string | null): string {
  if (!valor) return 'Sin registrar';

  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return valor;
  }

  return fecha.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function mostrarDinero(valor: number | string): string {
  const cantidad = Number(valor);

  if (!Number.isFinite(cantidad)) return '$0';

  return cantidad.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  });
}

export default function OrdenesTrabajo() {
  const puedeActualizarEstado =
    tienePermiso('servicios.actualizar_estado');

  const [ordenes, setOrdenes] =
    useState<OrdenTrabajo[]>([]);

  const [cargando, setCargando] = useState(true);

  const [error, setError] = useState('');

  const [busqueda, setBusqueda] = useState('');

  const [vista, setVista] = useState<VistaOrdenes>('activas');

  const [filtroEstado, setFiltroEstado] =
    useState('TODAS');
const [ordenAbiertaId, setOrdenAbiertaId] =
  useState<string | null>(null);

const [procesandoOrdenId, setProcesandoOrdenId] =
  useState<string | null>(null);

const [mensajeAccion, setMensajeAccion] = useState('');
  async function cargarOrdenes() {
    setCargando(true);
    setError('');

    try {
      const token = obtenerToken();

      if (!token) {
        throw new Error(
          'Tu sesión ha expirado. Inicia sesión nuevamente.'
        );
      }

      const respuesta = await fetch(`${API}/ordenes`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const datos: unknown = await respuesta
        .json()
        .catch(() => null);

      if (!respuesta.ok) {
        const mensaje =
          datos &&
          typeof datos === 'object' &&
          'mensaje' in datos
            ? String(datos.mensaje)
            : `Error del servidor (${respuesta.status})`;

        throw new Error(mensaje);
      }

      if (!Array.isArray(datos)) {
        throw new Error(
          'El servidor devolvió un formato inesperado.'
        );
      }

      setOrdenes(datos as OrdenTrabajo[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar las órdenes.'
      );
    } finally {
      setCargando(false);
    }
  }

async function cambiarEstado(
  orden: OrdenTrabajo,
  nuevoEstado: 'PAUSADO' | 'EN_PROCESO'
) {
  const accion =
    nuevoEstado === 'PAUSADO'
      ? 'pausar'
      : 'reanudar';

  const confirmado = window.confirm(
    `¿Deseas ${accion} esta orden de trabajo?\n\n` +
    `Orden: ${orden.id.slice(0, 8)}\n` +
    `Motocicleta: ${orden.motoPlaca || 'Sin placa'}`
  );

  if (!confirmado) return;

  setProcesandoOrdenId(orden.id);
  setError('');
  setMensajeAccion('');

  try {
    const token = obtenerToken();

    if (!token) {
      throw new Error(
        'Tu sesión ha expirado. Inicia sesión nuevamente.'
      );
    }

    const respuesta = await fetch(
      `${API}/ordenes/${orden.id}/estado`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          estado: nuevoEstado
        })
      }
    );

    const datos: unknown = await respuesta
      .json()
      .catch(() => null);

    if (!respuesta.ok) {
      const mensaje =
        datos &&
        typeof datos === 'object' &&
        'mensaje' in datos
          ? String(datos.mensaje)
          : `Error del servidor (${respuesta.status})`;

      throw new Error(mensaje);
    }

    // El servidor confirmó el cambio: reflejarlo inmediatamente
    // sin volver a cargar la lista y sobrescribir la respuesta.
    setOrdenes(anteriores =>
      anteriores.map(item =>
        item.id === orden.id
          ? { ...item, estado: nuevoEstado }
          : item
      )
    );

    setMensajeAccion(
      nuevoEstado === 'PAUSADO'
        ? 'La orden fue pausada correctamente.'
        : 'La orden fue reanudada correctamente.'
    );
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'No fue posible cambiar el estado de la orden.'
    );
  } finally {
    setProcesandoOrdenId(null);
  }
}


  // Finalizar el trabajo sin volver a descontar inventario.
  async function finalizarTrabajo(orden: OrdenTrabajo) {
    if (
      procesandoOrdenId !== null ||
      !['EN_PROCESO', 'PAUSADO'].includes(orden.estado)
    ) {
      return;
    }

    // Resolver primero cualquier consumo pendiente de confirmación.
    try {
      if (sessionStorage.getItem(`uraba-consumo-pendiente-${orden.id}`)) {
        setError(
          'Confirma el consumo pendiente de repuestos antes de finalizar la orden.'
        );
        return;
      }
    } catch {
      setError('No fue posible verificar los consumos pendientes.');
      return;
    }

    if (!window.confirm(
      '¿Confirmas que todos los trabajos de esta orden están terminados?\n\n' +
      'Al finalizar, no podrás agregar más trabajos ni repuestos.'
    )) {
      return;
    }

    setProcesandoOrdenId(orden.id);
    setError('');
    setMensajeAccion('');

    try {
      const token = obtenerToken();
      if (!token) {
        throw new Error('Tu sesión ha expirado. Inicia sesión nuevamente.');
      }

      const respuesta = await fetch(
        `${API}/ordenes/${orden.id}/finalizar`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const datos = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        throw new Error(
          datos?.mensaje || `Error del servidor (${respuesta.status})`
        );
      }

      if (
        !datos?.orden ||
        datos.orden.id !== orden.id ||
        datos.orden.estado !== 'COMPLETADO'
      ) {
        throw new Error(
          'El servidor devolvió una respuesta inesperada. Actualiza la lista para verificar el estado.'
        );
      }

      const finalizada = datos.orden;
      setOrdenes(anteriores =>
        anteriores.map(item =>
          item.id === orden.id
            ? {
                ...item,
                estado: finalizada.estado,
                tiempoFin: finalizada.tiempoFin,
                tiempoTrabajo: finalizada.tiempoTrabajo,
                costo: finalizada.costo
              }
            : item
        )
      );

      setMensajeAccion(
        datos.mensaje || 'Orden de trabajo finalizada correctamente.'
      );
      setOrdenAbiertaId(null);
      setVista('historial');
      setFiltroEstado('TODAS');
      setBusqueda('');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'No fue posible finalizar la orden.'
      );
    } finally {
      setProcesandoOrdenId(null);
    }
  }

  useEffect(() => {
    void cargarOrdenes();
  }, []);

  const resumen = useMemo(() => ({
    asignadas: ordenes.filter(
      orden => orden.estado === 'ASIGNADO'
    ).length,
    enProceso: ordenes.filter(
      orden => orden.estado === 'EN_PROCESO'
    ).length,
    pausadas: ordenes.filter(
      orden => orden.estado === 'PAUSADO'
    ).length,
    completadas: ordenes.filter(
      orden => orden.estado === 'COMPLETADO'
    ).length,
    entregadas: ordenes.filter(
      orden => orden.estado === 'ENTREGADO'
    ).length
  }), [ordenes]);

  const cantidadActivas =
    resumen.asignadas + resumen.enProceso + resumen.pausadas;

  const cantidadHistorial =
    resumen.completadas + resumen.entregadas;

  const estadosDisponibles = vista === 'activas'
    ? ESTADOS_ACTIVOS
    : ESTADOS_HISTORIAL;

  function cambiarVista(nuevaVista: VistaOrdenes) {
    setVista(nuevaVista);
    setBusqueda('');
    setFiltroEstado('TODAS');
    setOrdenAbiertaId(null);
    setError('');
  }

  const ordenesFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return ordenes.filter(orden => {
      const esHistorica = ESTADOS_EN_HISTORIAL.has(orden.estado);

      if (vista === 'historial' ? !esHistorica : esHistorica) {
        return false;
      }

      if (
        filtroEstado !== 'TODAS' &&
        orden.estado !== filtroEstado
      ) {
        return false;
      }

      const contenido = [
        orden.id,
        orden.clienteNombre,
        orden.motoPlaca,
        orden.motoMarca,
        orden.motoModelo,
        orden.mecanicoNombre,
        orden.tipoServicio,
        orden.descripcion
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return contenido.includes(termino);
    });
  }, [ordenes, vista, busqueda, filtroEstado]);

  return (
    <div className="ordenes-pagina">
      <div className="ordenes-encabezado">
        <div>
          <div className="ordenes-titulo">
            <ClipboardList size={29} />
            <h1>Órdenes de trabajo</h1>
          </div>

          <p>
            Consulta los trabajos realizados a las
            motocicletas en URABÁ MOTORS FC.
          </p>
        </div>

        <button
          type="button"
          className="ordenes-recargar"
          onClick={() => void cargarOrdenes()}
          disabled={cargando}
        >
          <RefreshCw size={17} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="ordenes-error" role="alert">
          {error}
        </div>
      )}
      {mensajeAccion && (
  <div className="ordenes-exito" role="status">
    {mensajeAccion}
  </div>
)}

      <div className="ordenes-resumen">
        <div>
          <strong>{resumen.asignadas}</strong>
          <span>Asignadas</span>
        </div>

        <div>
          <strong>{resumen.enProceso}</strong>
          <span>En proceso</span>
        </div>

        <div>
          <strong>{resumen.pausadas}</strong>
          <span>Pausadas</span>
        </div>

        <div>
          <strong>{resumen.completadas}</strong>
          <span>Completadas</span>
        </div>

        <div>
          <strong>{resumen.entregadas}</strong>
          <span>Entregadas</span>
        </div>
      </div>

      <div className="ordenes-pestanas" role="group" aria-label="Vistas de órdenes de trabajo">
        <button
          type="button"
          className={vista === 'activas' ? 'activa' : ''}
          aria-pressed={vista === 'activas'}
          onClick={() => cambiarVista('activas')}
        >
          <Wrench size={18} />
          Servicios activos ({cantidadActivas})
        </button>

        <button
          type="button"
          className={vista === 'historial' ? 'activa' : ''}
          aria-pressed={vista === 'historial'}
          onClick={() => cambiarVista('historial')}
        >
          <History size={18} />
          Historial de servicios ({cantidadHistorial})
        </button>
      </div>

      <div className="ordenes-filtros">
        <div className="ordenes-buscador">
          <Search size={18} />

          <input
            type="search"
            value={busqueda}
            onChange={evento =>
              setBusqueda(evento.target.value)
            }
            placeholder="Buscar cliente, placa, mecánico u orden..."
          />
        </div>

        <select
          value={filtroEstado}
          onChange={evento =>
            setFiltroEstado(evento.target.value)
          }
          aria-label="Filtrar órdenes por estado"
        >
          {estadosDisponibles.map(estado => (
            <option key={estado} value={estado}>
              {estado === 'TODAS'
                ? 'Todos los estados'
                : mostrarEstado(estado)}
            </option>
          ))}
        </select>
      </div>

      {cargando ? (
        <div className="ordenes-vacio">
          Consultando las órdenes de trabajo...
        </div>
      ) : ordenesFiltradas.length === 0 ? (
        <div className="ordenes-vacio">
          <ClipboardList size={34} />

          <h3>
            {vista === 'activas'
              ? 'No hay servicios activos que coincidan con la búsqueda'
              : 'No hay servicios en el historial que coincidan con la búsqueda'}
          </h3>

          <p>
            {vista === 'activas'
              ? 'Las órdenes nuevas iniciadas desde Citas aparecerán aquí.'
              : 'Al finalizar una orden, se guardará aquí sin eliminar sus datos.'}
          </p>
        </div>
      ) : (
        <div className="ordenes-listado">
          {ordenesFiltradas.map(orden => (
            <article
              className="ordenes-tarjeta"
              key={orden.id}
            >
              <div className="ordenes-tarjeta-cabecera">
                <div>
                  <small>
                    Orden #{orden.id.slice(0, 8)}
                  </small>

                  <h3>
                    {orden.tipoServicio ||
                      'Servicio de motocicleta'}
                  </h3>
                </div>

                <span
                  className={
                    `ordenes-estado estado-${orden.estado.toLowerCase()}`
                  }
                >
                  {mostrarEstado(orden.estado)}
                </span>
              </div>

              <div className="ordenes-datos">
                <p>
                  <UserRound size={16} />

                  <span>
                    {orden.clienteNombre ||
                      'Cliente no disponible'}
                  </span>
                </p>

                <p>
                  <Bike size={16} />

                  <span>
                    {[
                      orden.motoPlaca,
                      orden.motoMarca,
                      orden.motoModelo
                    ]
                      .filter(Boolean)
                      .join(' · ') ||
                      'Motocicleta no disponible'}
                  </span>
                </p>

                <p>
                  <Wrench size={16} />

                  <span>
                    {orden.mecanicoNombre ||
                      'Mecánico no disponible'}
                  </span>
                </p>

                <p>
                  <Clock3 size={16} />

                  <span>
                    Inicio: {mostrarFecha(orden.tiempoInicio)}
                  </span>
                </p>

                {orden.fechaCita && (
                  <p>
                    <CalendarDays size={16} />

                    <span>
                      Cita: {orden.fechaCita}
                    </span>
                  </p>
                )}
              </div>

              <div className="ordenes-descripcion">
                <strong>Descripción</strong>

                <p>{orden.descripcion}</p>
              </div>

              <div className="ordenes-pie">
                <span>
                  Costo registrado:
                  {' '}
                  <strong>
                    {mostrarDinero(orden.costo)}
                  </strong>
                </span>

                <span>
                  {orden.citaId
                    ? 'Orden vinculada a cita'
                    : 'Orden sin cita'}
                </span>
              </div>
              
<button
  type="button"
  className="ordenes-boton-gestionar"
  onClick={() =>
    setOrdenAbiertaId(
      ordenAbiertaId === orden.id
        ? null
        : orden.id
    )
  }
>
  <ClipboardList size={17} />

  {ordenAbiertaId === orden.id
    ? 'Cerrar detalles'
    : vista === 'historial' ? 'Ver detalles' : 'Gestionar orden'}
</button>

{ordenAbiertaId === orden.id && (
  <div className="ordenes-detalle">
    <h4>Detalles de la orden</h4>
    <CronometroOrden
  key={`cronometro-${orden.id}`}
  ordenId={orden.id}
  estado={orden.estado}
/>
    <DetalleEconomicoOrden
  key={orden.id}
  ordenId={orden.id}
  estado={orden.estado}
  onTotalActualizado={total =>
    setOrdenes(anteriores =>
      anteriores.map(item =>
        item.id === orden.id
          ? {
              ...item,
              costo: total
            }
          : item
      )
    )
  }
/>

    <p>
      <strong>Identificador:</strong> {orden.id}
    </p>

    <p>
      <strong>Estado:</strong>{' '}
      {mostrarEstado(orden.estado)}
    </p>

    <p>
      <strong>Descripción:</strong>{' '}
      {orden.descripcion}
    </p>

    <p>
      <strong>Fecha de inicio:</strong>{' '}
      {mostrarFecha(orden.tiempoInicio)}
    </p>

    <p>
      <strong>Fecha de finalización:</strong>{' '}
      {mostrarFecha(orden.tiempoFin)}
    </p>

    <div className="ordenes-detalle-acciones">
      {puedeActualizarEstado && orden.estado === 'EN_PROCESO' && (
        <button
          type="button"
          className="ordenes-boton-pausar"
          onClick={() =>
            void cambiarEstado(orden, 'PAUSADO')
          }
          disabled={procesandoOrdenId !== null}
        >
          {procesandoOrdenId === orden.id
            ? 'Procesando...'
            : 'Pausar trabajo'}
        </button>
      )}

      {puedeActualizarEstado && orden.estado === 'PAUSADO' && (
        <button
          type="button"
          className="ordenes-boton-reanudar"
          onClick={() =>
            void cambiarEstado(orden, 'EN_PROCESO')
          }
          disabled={procesandoOrdenId !== null}
        >
          {procesandoOrdenId === orden.id
            ? 'Procesando...'
            : 'Reanudar trabajo'}
        </button>
      )}

      {puedeActualizarEstado &&
        (orden.estado === 'EN_PROCESO' ||
        orden.estado === 'PAUSADO') && (
        <button
          type="button"
          className="ordenes-boton-finalizar"
          onClick={() => void finalizarTrabajo(orden)}
          disabled={procesandoOrdenId !== null}
        >
          {procesandoOrdenId === orden.id
            ? 'Procesando...'
            : 'Finalizar trabajo'}
        </button>
      )}

      {!puedeActualizarEstado ? (
        <p className="ordenes-sin-acciones">
          No tienes permiso para cambiar el estado de esta orden.
        </p>
      ) : orden.estado !== 'EN_PROCESO' &&
        orden.estado !== 'PAUSADO' && (
          <p className="ordenes-sin-acciones">
            Esta orden no tiene acciones disponibles
            en esta etapa.
          </p>
        )}
    </div>
  </div>
)}

            </article>
          ))}
        </div>
      )}
    </div>
  );
}