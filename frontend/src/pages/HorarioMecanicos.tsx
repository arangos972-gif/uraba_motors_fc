import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Users } from 'lucide-react';

import { obtenerToken } from '../services/auth';
import './HorarioMecanicos.css';

const API =
  'http://localhost:3000/api/reportes/horarios-mecanicos';

interface Horario {
  id: string;
  diaSemana: number;
  horaInicioTurno: string;
  horaFinTurno: string;
  horaInicioAlmuerzo: string | null;
  horaFinAlmuerzo: string | null;
  activo: boolean;
}

interface Mecanico {
  mecanicoId: string;
  mecanico: string;
  horarios: Horario[];
}

const DIAS = [
  { numero: 1, nombre: 'Lunes' },
  { numero: 2, nombre: 'Martes' },
  { numero: 3, nombre: 'Miércoles' },
  { numero: 4, nombre: 'Jueves' },
  { numero: 5, nombre: 'Viernes' },
  { numero: 6, nombre: 'Sábado' },
  { numero: 7, nombre: 'Domingo' }
];

function horaCorta(hora: string | null): string {
  return hora ? hora.slice(0, 5) : '—';
}

function intervaloAlmuerzo(horario: Horario): string {
  if (
    horario.horaInicioAlmuerzo === null &&
    horario.horaFinAlmuerzo === null
  ) {
    return 'Sin almuerzo';
  }

  return `${horaCorta(horario.horaInicioAlmuerzo)} – ${horaCorta(horario.horaFinAlmuerzo)}`;
}

function minutosDesdeMedianoche(hora: string): number {
  const [horas, minutos] = hora.split(':').map(Number);
  return horas * 60 + minutos;
}

function minutosProgramados(horario: Horario): number {
  if (!horario.activo) {
    return 0;
  }

  const inicio = minutosDesdeMedianoche(
    horario.horaInicioTurno
  );
  const fin = minutosDesdeMedianoche(horario.horaFinTurno);

  const almuerzo =
    horario.horaInicioAlmuerzo !== null &&
    horario.horaFinAlmuerzo !== null
      ? minutosDesdeMedianoche(horario.horaFinAlmuerzo) -
        minutosDesdeMedianoche(horario.horaInicioAlmuerzo)
      : 0;

  return Math.max(0, fin - inicio - almuerzo);
}

function formatoDuracion(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;

  if (minutosRestantes === 0) {
    return `${horas} h`;
  }

  return `${horas} h ${minutosRestantes} min`;
}

async function solicitarReporte(): Promise<Mecanico[]> {
  const token = obtenerToken();

  if (!token) {
    throw new Error(
      'La sesión ha expirado. Inicia sesión nuevamente.'
    );
  }

  let respuesta: Response;

  try {
    respuesta = await fetch(API, {
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
      `No fue posible consultar los horarios (${respuesta.status}).`
    );
  }

  if (!Array.isArray(datos?.mecanicos)) {
    throw new Error(
      'La respuesta del reporte de horarios no es válida.'
    );
  }

  return datos.mecanicos as Mecanico[];
}

export default function HorarioMecanicos() {
  const [mecanicos, setMecanicos] = useState<Mecanico[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');

    try {
      setMecanicos(await solicitarReporte());
    } catch (consultaError) {
      setError(
        consultaError instanceof Error
          ? consultaError.message
          : 'No fue posible consultar los horarios de los mecánicos.'
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let cancelado = false;

    async function cargarInicial() {
      try {
        const resultado = await solicitarReporte();

        if (!cancelado) {
          setMecanicos(resultado);
        }
      } catch (consultaError) {
        if (!cancelado) {
          setError(
            consultaError instanceof Error
              ? consultaError.message
              : 'No fue posible consultar los horarios de los mecánicos.'
          );
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

  const mecanicosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es');

    if (!termino) {
      return mecanicos;
    }

    return mecanicos.filter(mecanico =>
      mecanico.mecanico.toLocaleLowerCase('es').includes(termino)
    );
  }, [busqueda, mecanicos]);

  const horariosActivos = mecanicos.reduce(
    (total, mecanico) =>
      total + mecanico.horarios.filter(horario => horario.activo).length,
    0
  );

  const horariosConfigurados = mecanicos.reduce(
    (total, mecanico) => total + mecanico.horarios.length,
    0
  );

  const minutosTotalesProgramados = mecanicos.reduce(
    (total, mecanico) =>
      total +
      mecanico.horarios.reduce(
        (subtotal, horario) =>
          subtotal + minutosProgramados(horario),
        0
      ),
    0
  );

  return (
    <section className="hm-reporte" aria-labelledby="hm-titulo">
      <header className="hm-encabezado">
        <div>
          <h2 id="hm-titulo">Horario de mecánicos</h2>
          <p>Consulta los turnos asignados para cada día de la semana.</p>
        </div>

        <button
          type="button"
          className="hm-boton"
          onClick={() => void cargar()}
          disabled={cargando}
        >
          <RefreshCw size={17} aria-hidden="true" />
          {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {error && (
        <div className="hm-alerta" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="hm-boton hm-boton-alerta"
            onClick={() => void cargar()}
            disabled={cargando}
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="hm-resumen" aria-label="Resumen de horarios">
        <article className="hm-resumen-tarjeta">
          <span>Mecánicos activos</span>
          <strong>{mecanicos.length}</strong>
        </article>
        <article className="hm-resumen-tarjeta">
          <span>Turnos configurados</span>
          <strong>{horariosConfigurados}</strong>
        </article>
        <article className="hm-resumen-tarjeta">
          <span>Turnos activos</span>
          <strong>{horariosActivos}</strong>
        </article>
        <article className="hm-resumen-tarjeta">
          <span>Horas semanales programadas</span>
          <strong>{formatoDuracion(minutosTotalesProgramados)}</strong>
        </article>
      </div>

      <p className="hm-nota">
        Las horas se calculan con base en los turnos activos y descuentan
        el tiempo de almuerzo registrado; no representan marcaciones reales.
      </p>

      <label className="hm-busqueda">
        <Search size={18} aria-hidden="true" />
        <span className="hm-oculto">Buscar mecánico</span>
        <input
          type="search"
          value={busqueda}
          onChange={evento => setBusqueda(evento.target.value)}
          placeholder="Buscar mecánico…"
        />
      </label>

      {cargando ? (
        <p className="hm-estado" role="status">
          Cargando horarios…
        </p>
      ) : mecanicos.length === 0 && !error ? (
        <div className="hm-estado">
          <Users size={24} aria-hidden="true" />
          <p>No hay mecánicos activos para mostrar.</p>
        </div>
      ) : mecanicosFiltrados.length === 0 && !error ? (
        <p className="hm-estado">
          No se encontraron mecánicos con ese nombre.
        </p>
      ) : (
        <div className="hm-lista">
          {mecanicosFiltrados.map(mecanico => {
            const horariosPorDia = new Map(
              mecanico.horarios.map(horario => [
                horario.diaSemana,
                horario
              ])
            );

            return (
              <article
                className="hm-mecanico"
                key={mecanico.mecanicoId}
              >
                <header className="hm-mecanico-encabezado">
                  <div className="hm-avatar" aria-hidden="true">
                    {mecanico.mecanico.charAt(0).toLocaleUpperCase('es')}
                  </div>
                  <div>
                    <h3>{mecanico.mecanico}</h3>
                    <p>
                      {mecanico.horarios.length === 0
                        ? 'Sin horarios registrados'
                        : `${mecanico.horarios.length} ${
                            mecanico.horarios.length === 1
                              ? 'día configurado'
                              : 'días configurados'
                          }`}
                    </p>
                  </div>
                </header>

                <div className="hm-tabla-contenedor">
                  <table className="hm-tabla">
                    <thead>
                      <tr>
                        <th scope="col">Día</th>
                        <th scope="col">Turno</th>
                        <th scope="col">Almuerzo</th>
                        <th scope="col">Horas programadas</th>
                        <th scope="col">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DIAS.map(dia => {
                        const horario = horariosPorDia.get(dia.numero);

                        return (
                          <tr key={dia.numero}>
                            <th scope="row">{dia.nombre}</th>
                            <td>
                              {horario
                                ? `${horaCorta(horario.horaInicioTurno)} – ${horaCorta(horario.horaFinTurno)}`
                                : '—'}
                            </td>
                            <td>
                              {horario
                                ? intervaloAlmuerzo(horario)
                                : '—'}
                            </td>
                            <td>
                              {horario?.activo
                                ? formatoDuracion(
                                    minutosProgramados(horario)
                                  )
                                : '—'}
                            </td>
                            <td>
                              {horario ? (
                                <span
                                  className={`hm-estado-turno ${
                                    horario.activo
                                      ? 'hm-turno-activo'
                                      : 'hm-turno-inactivo'
                                  }`}
                                >
                                  {horario.activo
                                    ? 'Activo'
                                    : 'Inactivo'}
                                </span>
                              ) : (
                                <span className="hm-sin-horario">
                                  Sin configurar
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
