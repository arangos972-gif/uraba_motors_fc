
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Clock3,
  Save,
  RefreshCw,
  CalendarDays,
  CheckCircle2
} from 'lucide-react';

import { obtenerToken } from '../services/auth';
import './HorariosLaborales.css';

const API = 'http://localhost:3000/api/horarios-mecanicos';

interface Mecanico {
  id: string;
  nombre: string;
}

interface HorarioDB {
  id: string;
  mecanicoId: string;
  diaSemana: number;
  horaInicioTurno: string;
  horaFinTurno: string;
  horaInicioAlmuerzo: string | null;
  horaFinAlmuerzo: string | null;
  activo: number;
}

interface HorarioFormulario {
  activo: boolean;
  horaInicioTurno: string;
  horaFinTurno: string;
  horaInicioAlmuerzo: string;
  horaFinAlmuerzo: string;
}

interface Props {
  onVolver: () => void;
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

function horarioInicial(): HorarioFormulario {
  return {
    activo: false,
    horaInicioTurno: '08:00',
    horaFinTurno: '18:00',
    horaInicioAlmuerzo: '',
    horaFinAlmuerzo: ''
  };
}

function crearSemana(): Record<number, HorarioFormulario> {
  const semana: Record<number, HorarioFormulario> = {};

  DIAS.forEach(dia => {
    semana[dia.numero] = horarioInicial();
  });

  return semana;
}

function horaCorta(hora: string | null): string {
  return hora ? hora.slice(0, 5) : '';
}

function convertirMinutos(hora: string): number {
  const [horas, minutos] = hora.split(':').map(Number);
  return horas * 60 + minutos;
}

export default function HorariosLaborales({ onVolver }: Props) {
  const [mecanicos, setMecanicos] = useState<Mecanico[]>([]);
  const [mecanicoId, setMecanicoId] = useState('');

  const [horarios, setHorarios] =
    useState<Record<number, HorarioFormulario>>(crearSemana);

  const [diasRegistrados, setDiasRegistrados] =
    useState<number[]>([]);

  const [cargandoMecanicos, setCargandoMecanicos] = useState(true);
  const [cargandoHorarios, setCargandoHorarios] = useState(false);
  const [guardandoDia, setGuardandoDia] = useState<number | null>(null);

  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  async function solicitar(
    url: string,
    opciones: RequestInit = {}
  ) {
    const token = obtenerToken();

    if (!token) {
      throw new Error(
        'No hay una sesión activa. Inicia sesión nuevamente.'
      );
    }

    const respuesta = await fetch(url, {
      ...opciones,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opciones.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...opciones.headers
      }
    });

    const datos = await respuesta.json().catch(() => null);

    if (!respuesta.ok) {
      throw new Error(
        datos?.mensaje ||
        `Error del servidor (${respuesta.status})`
      );
    }

    return datos;
  }

  async function cargarMecanicos() {
    setCargandoMecanicos(true);
    setError('');

    try {
      const datos = await solicitar(`${API}/mecanicos`);

      if (!Array.isArray(datos)) {
        throw new Error('La respuesta de mecánicos es inválida.');
      }

      setMecanicos(datos);

      setMecanicoId(anterior => {
        const sigueExistiendo = datos.some(
          (m: Mecanico) => m.id === anterior
        );

        return sigueExistiendo
          ? anterior
          : (datos[0]?.id || '');
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible consultar los mecánicos.'
      );
    } finally {
      setCargandoMecanicos(false);
    }
  }

  useEffect(() => {
    void cargarMecanicos();
  }, []);

  useEffect(() => {
    let cancelado = false;

    if (!mecanicoId) {
      setHorarios(crearSemana());
      setDiasRegistrados([]);
      return;
    }

    async function consultarHorarios() {
      setCargandoHorarios(true);
      setError('');
      setMensaje('');
      setHorarios(crearSemana());
      setDiasRegistrados([]);

      try {
        const datos = await solicitar(`${API}/${mecanicoId}`);

        if (!Array.isArray(datos)) {
          throw new Error('La respuesta de horarios es inválida.');
        }

        if (cancelado) return;

        const semana = crearSemana();
        const registrados: number[] = [];

        (datos as HorarioDB[]).forEach(horario => {
          if (
            horario.diaSemana < 1 ||
            horario.diaSemana > 7
          ) {
            return;
          }

          semana[horario.diaSemana] = {
            activo: Number(horario.activo) === 1,
            horaInicioTurno: horaCorta(
              horario.horaInicioTurno
            ),
            horaFinTurno: horaCorta(
              horario.horaFinTurno
            ),
            horaInicioAlmuerzo: horaCorta(
              horario.horaInicioAlmuerzo
            ),
            horaFinAlmuerzo: horaCorta(
              horario.horaFinAlmuerzo
            )
          };

          registrados.push(horario.diaSemana);
        });

        setHorarios(semana);
        setDiasRegistrados(registrados);
      } catch (err) {
        if (!cancelado) {
          setError(
            err instanceof Error
              ? err.message
              : 'No fue posible cargar los horarios.'
          );
        }
      } finally {
        if (!cancelado) {
          setCargandoHorarios(false);
        }
      }
    }

    void consultarHorarios();

    return () => {
      cancelado = true;
    };
  }, [mecanicoId]);

  function actualizarCampo(
    dia: number,
    campo: keyof HorarioFormulario,
    valor: string | boolean
  ) {
    setHorarios(anterior => ({
      ...anterior,
      [dia]: {
        ...anterior[dia],
        [campo]: valor
      }
    }));

    setMensaje('');
    setError('');
  }

  async function guardarDia(dia: number) {
    const horario = horarios[dia];

    setError('');
    setMensaje('');

    if (!mecanicoId || !horario) {
      setError('Debes seleccionar un mecánico.');
      return;
    }

    if (
      !horario.horaInicioTurno ||
      !horario.horaFinTurno ||
      convertirMinutos(horario.horaInicioTurno) >=
        convertirMinutos(horario.horaFinTurno)
    ) {
      setError('La hora de entrada debe ser anterior a la salida.');
      return;
    }

    const tieneInicio = Boolean(horario.horaInicioAlmuerzo);
    const tieneFin = Boolean(horario.horaFinAlmuerzo);

    if (tieneInicio !== tieneFin) {
      setError(
        'Debes indicar tanto el inicio como el fin del almuerzo.'
      );
      return;
    }

    if (tieneInicio && tieneFin) {
      const inicio = convertirMinutos(
        horario.horaInicioAlmuerzo
      );

      const fin = convertirMinutos(
        horario.horaFinAlmuerzo
      );

      if (
        inicio < convertirMinutos(horario.horaInicioTurno) ||
        fin > convertirMinutos(horario.horaFinTurno) ||
        inicio >= fin
      ) {
        setError(
          'El almuerzo debe estar dentro del turno y tener una duración válida.'
        );
        return;
      }
    }

    setGuardandoDia(dia);

    try {
      await solicitar(`${API}/${mecanicoId}/${dia}`, {
        method: 'PUT',
        body: JSON.stringify({
          activo: horario.activo,
          horaInicioTurno: horario.horaInicioTurno,
          horaFinTurno: horario.horaFinTurno,
          horaInicioAlmuerzo:
            horario.horaInicioAlmuerzo || null,
          horaFinAlmuerzo:
            horario.horaFinAlmuerzo || null
        })
      });

      setDiasRegistrados(anterior =>
        anterior.includes(dia)
          ? anterior
          : [...anterior, dia]
      );

      const nombreDia = DIAS.find(
        item => item.numero === dia
      )?.nombre;

      setMensaje(
        `Horario del ${nombreDia} guardado correctamente.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar el horario.'
      );
    } finally {
      setGuardandoDia(null);
    }
  }

  const mecanicoSeleccionado = mecanicos.find(
    mecanico => mecanico.id === mecanicoId
  );

  return (
    <div className="horarios-pagina">
      <button
        type="button"
        className="horarios-volver"
        onClick={onVolver}
      >
        <ArrowLeft size={18} />
        Volver a Usuarios
      </button>

      <div className="horarios-encabezado">
        <div>
          <div className="horarios-titulo">
            <Clock3 size={27} />
            <h1>Horarios laborales</h1>
          </div>

          <p>
            Configura los turnos y descansos de los mecánicos.
          </p>
        </div>

        <button
          type="button"
          className="horarios-recargar"
          onClick={() => void cargarMecanicos()}
          disabled={cargandoMecanicos || guardandoDia !== null}
        >
          <RefreshCw size={17} />
          Actualizar mecánicos
        </button>
      </div>

      <div className="horarios-info-taller">
        <CalendarDays size={22} />

        <div>
          <strong>Horario general del taller</strong>
          <p>
            Lunes a sábado: 08:00–18:00.
            Domingo: cerrado.
          </p>
        </div>
      </div>

      <div className="horarios-selector-panel">
        <label htmlFor="seleccionar-mecanico">
          Seleccionar mecánico
        </label>

        <select
          id="seleccionar-mecanico"
          value={mecanicoId}
          onChange={evento =>
            setMecanicoId(evento.target.value)
          }
          disabled={
            cargandoMecanicos ||
            guardandoDia !== null
          }
        >
          <option value="">
            Selecciona un mecánico
          </option>

          {mecanicos.map(mecanico => (
            <option key={mecanico.id} value={mecanico.id}>
              {mecanico.nombre}
            </option>
          ))}
        </select>

        {mecanicos.length === 0 && !cargandoMecanicos && (
          <p className="horarios-aviso">
            No hay mecánicos activos disponibles.
            Puedes registrarlos desde Usuarios.
          </p>
        )}
      </div>

      {error && (
        <div className="horarios-error" role="alert">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="horarios-exito" role="status">
          <CheckCircle2 size={18} />
          {mensaje}
        </div>
      )}

      {mecanicoId && (
        <>
          <div className="horarios-subtitulo">
            <div>
              <h2>Configuración semanal</h2>
              <p>
                Mecánico: {mecanicoSeleccionado?.nombre}
              </p>
            </div>
          </div>

          {cargandoHorarios ? (
            <div className="horarios-cargando">
              Cargando horarios...
            </div>
          ) : (
            <div className="horarios-lista">
              {DIAS.map(dia => {
                const horario = horarios[dia.numero];
                const esDomingo = dia.numero === 7;
                const registrado = diasRegistrados.includes(
                  dia.numero
                );

                return (
                  <div
                    className="horarios-tarjeta"
                    key={dia.numero}
                  >
                    <div className="horarios-tarjeta-cabecera">
                      <div>
                        <h3>{dia.nombre}</h3>

                        <span className={
                          esDomingo
                            ? 'horarios-etiqueta cerrado'
                            : horario.activo
                              ? 'horarios-etiqueta activo'
                              : 'horarios-etiqueta inactivo'
                        }>
                          {esDomingo
                            ? 'Taller cerrado'
                            : horario.activo
                              ? 'Laborable'
                              : 'No laborable'}
                        </span>
                      </div>

                      {!esDomingo && (
                        <label className="horarios-interruptor">
                          <input
                            type="checkbox"
                            checked={horario.activo}
                            onChange={evento =>
                              actualizarCampo(
                                dia.numero,
                                'activo',
                                evento.target.checked
                              )
                            }
                          />
                          <span>Trabaja este día</span>
                        </label>
                      )}
                    </div>

                    {esDomingo ? (
                      <p className="horarios-domingo">
                        El taller permanece cerrado los domingos.
                      </p>
                    ) : (
                      <>
                        <div className="horarios-campos">
                          <label>
                            <span>Hora de entrada</span>
                            <input
                              type="time"
                              value={horario.horaInicioTurno}
                              onChange={evento =>
                                actualizarCampo(
                                  dia.numero,
                                  'horaInicioTurno',
                                  evento.target.value
                                )
                              }
                              disabled={!horario.activo}
                            />
                          </label>

                          <label>
                            <span>Hora de salida</span>
                            <input
                              type="time"
                              value={horario.horaFinTurno}
                              onChange={evento =>
                                actualizarCampo(
                                  dia.numero,
                                  'horaFinTurno',
                                  evento.target.value
                                )
                              }
                              disabled={!horario.activo}
                            />
                          </label>

                          <label>
                            <span>Inicio del almuerzo</span>
                            <input
                              type="time"
                              value={horario.horaInicioAlmuerzo}
                              onChange={evento =>
                                actualizarCampo(
                                  dia.numero,
                                  'horaInicioAlmuerzo',
                                  evento.target.value
                                )
                              }
                              disabled={!horario.activo}
                            />
                          </label>

                          <label>
                            <span>Fin del almuerzo</span>
                            <input
                              type="time"
                              value={horario.horaFinAlmuerzo}
                              onChange={evento =>
                                actualizarCampo(
                                  dia.numero,
                                  'horaFinAlmuerzo',
                                  evento.target.value
                                )
                              }
                              disabled={!horario.activo}
                            />
                          </label>
                        </div>

                        <div className="horarios-tarjeta-pie">
                          <span>
                            {registrado
                              ? 'Horario registrado'
                              : 'Horario sin registrar'}
                          </span>

                          <button
                            type="button"
                            className="horarios-boton-guardar"
                            onClick={() =>
                              void guardarDia(dia.numero)
                            }
                            disabled={guardandoDia !== null}
                          >
                            <Save size={16} />
                            {guardandoDia === dia.numero
                              ? 'Guardando...'
                              : 'Guardar día'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
