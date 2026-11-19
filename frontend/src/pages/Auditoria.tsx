
import { useEffect, useState } from 'react';

import {
  ArrowLeft,
  History,
  Search,
  RefreshCw,
  UserRound,
  CalendarDays,
  ShieldCheck,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

import { obtenerToken } from '../services/auth';
import './Auditoria.css';

const API = 'http://localhost:3000/api/auditoria';

interface RegistroAuditoria {
  id: string;
  usuarioId: string;
  usuario: string | null;
  accion: string;
  modulo: string;
  detalles: string | null;
  ipAddress: string | null;
  created: string;
}

interface Props {
  onVolver: () => void;
}

function formatearFecha(valor: string): string {
  if (!valor) return 'Fecha desconocida';

  const [fecha, hora] = valor.split('T');

  if (!fecha || !hora) return valor;

  const [anio, mes, dia] = fecha.split('-');

  return `${dia}/${mes}/${anio} · ${hora.slice(0, 8)}`;
}

function mostrarDetalles(valor: string | null): string {
  if (!valor) return 'Sin detalles adicionales.';

  try {
    const datos = JSON.parse(valor);
    return JSON.stringify(datos, null, 2);
  } catch {
    return valor;
  }
}

export default function Auditoria({ onVolver }: Props) {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroModulo, setFiltroModulo] = useState('TODOS');

  const [registroAbierto, setRegistroAbierto] =
    useState<string | null>(null);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function cargarAuditoria() {
    setCargando(true);
    setError('');

    try {
      const token = obtenerToken();

      if (!token) {
        throw new Error(
          'Tu sesión no está disponible. Inicia sesión nuevamente.'
        );
      }

      const respuesta = await fetch(API, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const datos = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        throw new Error(
          datos?.mensaje ||
          `Error al consultar auditoría (${respuesta.status})`
        );
      }

      if (!Array.isArray(datos)) {
        throw new Error(
          'El servidor devolvió una respuesta inesperada.'
        );
      }

      setRegistros(datos);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo consultar el historial.'
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargarAuditoria();
  }, []);

  const modulos = Array.from(
    new Set(registros.map(registro => registro.modulo))
  ).sort();

  const registrosFiltrados = registros.filter(registro => {
    const termino = busqueda.trim().toLowerCase();

    const coincideBusqueda = [
      registro.usuario || '',
      registro.accion,
      registro.modulo,
      registro.detalles || '',
      registro.ipAddress || ''
    ].some(valor =>
      valor.toLowerCase().includes(termino)
    );

    const coincideModulo =
      filtroModulo === 'TODOS' ||
      registro.modulo === filtroModulo;

    return coincideBusqueda && coincideModulo;
  });

  return (
    <div className="auditoria-pagina">
      <button
        type="button"
        className="auditoria-volver"
        onClick={onVolver}
      >
        <ArrowLeft size={18} />
        Volver a Usuarios
      </button>

      <div className="auditoria-encabezado">
        <div>
          <div className="auditoria-titulo">
            <History size={28} />
            <h1>Historial de auditoría</h1>
          </div>

          <p>
            Consulta los movimientos administrativos
            registrados en URABÁ MOTORS FC.
          </p>
        </div>

        <button
          type="button"
          className="auditoria-recargar"
          onClick={() => void cargarAuditoria()}
          disabled={cargando}
        >
          <RefreshCw size={17} />
          Actualizar
        </button>
      </div>

      <div className="auditoria-aviso">
        <ShieldCheck size={22} />

        <div>
          <strong>Historial de solo lectura</strong>
          <p>
            Esta sección permite consultar los eventos
            registrados. No permite modificarlos ni eliminarlos.
          </p>
        </div>
      </div>

      {error && (
        <div className="auditoria-error" role="alert">
          {error}
        </div>
      )}

      <div className="auditoria-herramientas">
        <div className="auditoria-busqueda">
          <Search size={19} />

          <input
            type="search"
            value={busqueda}
            onChange={evento =>
              setBusqueda(evento.target.value)
            }
            placeholder="Buscar usuario, acción o detalle..."
            aria-label="Buscar registros de auditoría"
          />
        </div>

        <select
          value={filtroModulo}
          onChange={evento =>
            setFiltroModulo(evento.target.value)
          }
          aria-label="Filtrar por módulo"
        >
          <option value="TODOS">Todos los módulos</option>

          {modulos.map(modulo => (
            <option key={modulo} value={modulo}>
              {modulo}
            </option>
          ))}
        </select>
      </div>

      <div className="auditoria-resumen">
        <span>
          {registrosFiltrados.length} registro(s) encontrado(s)
        </span>

        <span>
          Se consultan los últimos 100 eventos registrados.
        </span>
      </div>

      {cargando ? (
        <div className="auditoria-vacio">
          Cargando historial de auditoría...
        </div>
      ) : registrosFiltrados.length === 0 ? (
        <div className="auditoria-vacio">
          <History size={32} />

          <p>
            {registros.length === 0
              ? 'Todavía no hay eventos registrados.'
              : 'No se encontraron eventos con estos filtros.'}
          </p>
        </div>
      ) : (
        <div className="auditoria-lista">
          {registrosFiltrados.map(registro => {
            const abierto = registroAbierto === registro.id;

            return (
              <article
                className="auditoria-tarjeta"
                key={registro.id}
              >
                <div className="auditoria-tarjeta-superior">
                  <div>
                    <span className="auditoria-modulo">
                      {registro.modulo}
                    </span>

                    <h3>{registro.accion}</h3>
                  </div>

                  <div className="auditoria-fecha">
                    <CalendarDays size={16} />
                    {formatearFecha(registro.created)}
                  </div>
                </div>

                <div className="auditoria-usuario">
                  <UserRound size={17} />

                  <span>
                    <strong>Realizado por:</strong>{' '}
                    {registro.usuario || registro.usuarioId}
                  </span>
                </div>

                <button
                  type="button"
                  className="auditoria-ver-detalles"
                  onClick={() =>
                    setRegistroAbierto(
                      abierto ? null : registro.id
                    )
                  }
                  aria-expanded={abierto}
                >
                  {abierto ? (
                    <>
                      <ChevronUp size={17} />
                      Ocultar detalles
                    </>
                  ) : (
                    <>
                      <ChevronDown size={17} />
                      Ver detalles
                    </>
                  )}
                </button>

                {abierto && (
                  <div className="auditoria-detalles">
                    <p>
                      <strong>Identificador del evento:</strong>
                      {' '}
                      {registro.id}
                    </p>

                    <p>
                      <strong>ID del usuario:</strong>
                      {' '}
                      {registro.usuarioId}
                    </p>

                    <p>
                      <strong>Dirección IP:</strong>
                      {' '}
                      {registro.ipAddress || 'No registrada'}
                    </p>

                    <strong>Descripción del evento:</strong>

                    <pre>
                      {mostrarDetalles(registro.detalles)}
                    </pre>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
