
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Clock3,
  UserRound,
  Bike,
  Wrench,
  RefreshCw,
  X,
  Save,
  CheckCircle2
} from 'lucide-react';

import { obtenerToken, tienePermiso } from '../services/auth';
import './Citas.css';

const API = 'http://localhost:3000/api';

interface Cliente {
  id: string;
  nombre?: string;
  apellidos?: string;
  telefono?: string | null;
  phone?: string | null;
  active?: number | boolean;
  activo?: number | boolean;
}

interface Moto {
  id: string;
  clienteId: string;
  placa?: string;
  marca?: string;
  modelo?: string;
  referencia?: string;
  active?: number | boolean;
  activo?: number | boolean;
}

interface Mecanico {
  id: string;
  nombre: string;
}

interface TipoServicio {
  id: string;
  nombre: string;
  activo?: number | boolean;
  active?: number | boolean;
}

interface Cita {
  id: string;
  clienteId: string;
  clienteNombre?: string;
  motoId: string;
  motoPlaca?: string;
  motoMarca?: string;
  motoModelo?: string;
  mecanicoId: string;
  mecanicoNombre?: string;
  fecha: string;
  hora: string;
  duracionMinutos: number;
  tipoServicio: string;
  descripcion: string | null;
  estado: string;
}

interface FormularioCita {
  clienteId: string;
  motoId: string;
  mecanicoId: string;
  hora: string;
  duracionMinutos: number;
  tipoServicio: string;
  descripcion: string;
}

const formularioInicial: FormularioCita = {
  clienteId: '',
  motoId: '',
  mecanicoId: '',
  hora: '08:00',
  duracionMinutos: 60,
  tipoServicio: '',
  descripcion: ''
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril',
  'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const ESTADOS_ACTIVOS = [
  'PENDIENTE',
  'CONFIRMADA',
  'EN_PROCESO'
];

// Obtener la fecha actual en Colombia.
function fechaHoyColombia(): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const valor = (tipo: string) =>
    partes.find(parte => parte.type === tipo)?.value || '';

  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

function fechaISO(
  anio: number,
  mes: number,
  dia: number
): string {
  return [
    anio,
    String(mes + 1).padStart(2, '0'),
    String(dia).padStart(2, '0')
  ].join('-');
}

function nombreCliente(cliente: Cliente): string {
  return [
    cliente.nombre || '',
    cliente.apellidos || ''
  ].filter(Boolean).join(' ').trim() || 'Cliente sin nombre';
}

function nombreMoto(moto: Moto): string {
  const descripcion = [
    moto.marca,
    moto.modelo || moto.referencia
  ].filter(Boolean).join(' ');

  return [
    moto.placa || 'Sin placa',
    descripcion
  ].filter(Boolean).join(' · ');
}

function fechaBonita(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

function mensajeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Ocurrió un error inesperado.';
}

// Admite listas directas o respuestas con contenedores.
function extraerLista<T>(
  datos: unknown,
  claves: string[]
): T[] {
  if (Array.isArray(datos)) {
    return datos as T[];
  }

  if (datos && typeof datos === 'object') {
    const objeto = datos as Record<string, unknown>;

    for (const clave of claves) {
      if (Array.isArray(objeto[clave])) {
        return objeto[clave] as T[];
      }
    }
  }

  throw new Error(
    'El servidor devolvió una lista con formato inesperado.'
  );
}

async function solicitar(
  ruta: string,
  opciones: RequestInit = {}
): Promise<unknown> {
  const token = obtenerToken();

  if (!token) {
    throw new Error(
      'Tu sesión no está disponible. Inicia sesión nuevamente.'
    );
  }

  const respuesta = await fetch(`${API}${ruta}`, {
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
    const mensaje =
      datos &&
      typeof datos === 'object' &&
      'mensaje' in datos
        ? String(datos.mensaje)
        : `Error del servidor (${respuesta.status})`;

    throw new Error(mensaje);
  }

  return datos;
}

export default function Citas() {
  const puedeCrearCita = tienePermiso('citas.crear');
  const puedeIniciarOrden = tienePermiso('servicios.crear');
  const hoy = useMemo(() => fechaHoyColombia(), []);

  const [fechaSeleccionada, setFechaSeleccionada] =
    useState(hoy);

  const [anioVista, setAnioVista] =
    useState(Number(hoy.slice(0, 4)));

  const [mesVista, setMesVista] =
    useState(Number(hoy.slice(5, 7)) - 1);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [motos, setMotos] = useState<Moto[]>([]);
  const [mecanicos, setMecanicos] = useState<Mecanico[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);

  const [tiposServicios, setTiposServicios] =
  useState<TipoServicio[]>([]);

const [busquedaServicio, setBusquedaServicio] = useState('');

const [mostrarOpcionesServicio, setMostrarOpcionesServicio] =
  useState(false);

const [cargandoServicios, setCargandoServicios] =
  useState(true);

const [errorServicios, setErrorServicios] = useState('');

  const [mostrarFormulario, setMostrarFormulario] =
    useState(false);

  const [formulario, setFormulario] =
    useState<FormularioCita>(formularioInicial);

  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [busquedaMoto, setBusquedaMoto] = useState('');

  const [vistaCitas, setVistaCitas] =
    useState<'activas' | 'historial'>('activas');

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [iniciandoOrdenId, setIniciandoOrdenId] =
  useState<string | null>(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  
async function cargarTiposServicios() {
  setCargandoServicios(true);
  setErrorServicios('');

  try {
    const respuesta = await solicitar('/catalogo-servicios');

    const lista = extraerLista<Record<string, unknown>>(
      respuesta,
      ['servicios', 'catalogo', 'data']
    );

    const serviciosNormalizados: TipoServicio[] = lista
      .map(servicio => ({
        id: String(servicio.id ?? ''),
        nombre: String(
          servicio.nombre ??
          servicio.nombreServicio ??
          servicio.name ??
          ''
        ),
        activo: servicio.activo as number | boolean | undefined,
        active: servicio.active as number | boolean | undefined
      }))
      .filter(servicio =>
        servicio.id &&
        servicio.nombre &&
        servicio.activo !== 0 &&
        servicio.activo !== false &&
        servicio.active !== 0 &&
        servicio.active !== false
      );

    setTiposServicios(serviciosNormalizados);
  } catch (err) {
    setErrorServicios(
      err instanceof Error
        ? err.message
        : 'No se pudo cargar el catálogo de servicios.'
    );
  } finally {
    setCargandoServicios(false);
  }
}


  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError('');

    try {
      const solicitudes = [
        solicitar('/citas'),
        solicitar('/horarios-mecanicos/mecanicos')
      ];

      if (puedeCrearCita) {
        solicitudes.push(solicitar('/clientes'), solicitar('/motos'));
      }

      const respuestas = await Promise.all(solicitudes);
      const [respuestaCitas, respuestaMecanicos] = respuestas;

      setCitas(
        extraerLista<Cita>(respuestaCitas, ['citas', 'data'])
      );

      if (puedeCrearCita) {
        setClientes(
          extraerLista<Cliente>(
            respuestas[2],
            ['clientes', 'data']
          )
        );

        setMotos(
          extraerLista<Moto>(
            respuestas[3],
            ['motos', 'data']
          )
        );
      }

      setMecanicos(
        extraerLista<Mecanico>(
          respuestaMecanicos,
          ['mecanicos', 'data']
        )
      );
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, [puedeCrearCita]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    void cargarTiposServicios();
  }, []);

  function cambiarMes(diferencia: number) {
    const fecha = new Date(
      Date.UTC(anioVista, mesVista + diferencia, 1)
    );

    setAnioVista(fecha.getUTCFullYear());
    setMesVista(fecha.getUTCMonth());
  }

  const diasCalendario = useMemo(() => {
    const primero = new Date(
      Date.UTC(anioVista, mesVista, 1)
    );

    // Lunes = 0, domingo = 6
    const desplazamiento =
      (primero.getUTCDay() + 6) % 7;

    const calendario: {
      fecha: string;
      dia: number;
      mesActual: boolean;
      domingo: boolean;
    }[] = [];

    for (let indice = 0; indice < 42; indice++) {
      const fecha = new Date(
        Date.UTC(
          anioVista,
          mesVista,
          indice - desplazamiento + 1
        )
      );

      calendario.push({
        fecha: fechaISO(
          fecha.getUTCFullYear(),
          fecha.getUTCMonth(),
          fecha.getUTCDate()
        ),
        dia: fecha.getUTCDate(),
        mesActual: fecha.getUTCMonth() === mesVista,
        domingo: fecha.getUTCDay() === 0
      });
    }

    return calendario;
  }, [anioVista, mesVista]);

  const conteoPorDia = useMemo(() => {
    const conteos: Record<string, number> = {};

    citas.forEach(cita => {
      if (ESTADOS_ACTIVOS.includes(cita.estado)) {
        conteos[cita.fecha] =
          (conteos[cita.fecha] || 0) + 1;
      }
    });

    return conteos;
  }, [citas]);

  const citasDelDia = citas
    .filter(cita => {
      if (cita.fecha !== fechaSeleccionada) {
        return false;
      }

      return vistaCitas === 'activas'
        ? ESTADOS_ACTIVOS.includes(cita.estado)
        : !ESTADOS_ACTIVOS.includes(cita.estado);
    })
    .sort((a, b) => a.hora.localeCompare(b.hora));

  const clienteSeleccionado = clientes.find(
    cliente => cliente.id === formulario.clienteId
  );

  const motoSeleccionada = motos.find(
    moto => moto.id === formulario.motoId
  );

  const clientesFiltrados = clientes.filter(cliente => {
    if (cliente.active === 0 || cliente.activo === 0) {
      return false;
    }

    const termino = busquedaCliente.trim().toLowerCase();

    if (!termino) return true;

    const coincideCliente = [
      nombreCliente(cliente),
      cliente.telefono || cliente.phone || ''
    ].some(valor =>
      valor.toLowerCase().includes(termino)
    );

    const coincidePlaca = motos.some(moto =>
      moto.clienteId === cliente.id &&
      (moto.placa || '').toLowerCase().includes(termino)
    );

    return coincideCliente || coincidePlaca;
  });

  const motosDelCliente = motos.filter(moto => {
    if (moto.clienteId !== formulario.clienteId) {
      return false;
    }

    if (moto.active === 0 || moto.activo === 0) {
      return false;
    }

    const termino = busquedaMoto.trim().toLowerCase();

    return nombreMoto(moto)
      .toLowerCase()
      .includes(termino);
  });


const serviciosFiltrados = tiposServicios.filter(servicio =>
  servicio.nombre
    .toLowerCase()
    .includes(busquedaServicio.trim().toLowerCase())
);

function seleccionarTipoServicio(servicio: TipoServicio) {
  setFormulario(anterior => ({
    ...anterior,
    tipoServicio: servicio.nombre
  }));

  setBusquedaServicio(servicio.nombre);
  setMostrarOpcionesServicio(false);
  setError('');
}

function buscarTipoServicio(valor: string) {
  setBusquedaServicio(valor);
  setMostrarOpcionesServicio(true);

  // La selección anterior deja de ser válida
  // cuando el usuario vuelve a escribir.
  setFormulario(anterior => ({
    ...anterior,
    tipoServicio: ''
  }));

  setError('');
}


  function actualizarCampo(
    campo: keyof FormularioCita,
    valor: string | number
  ) {
    setFormulario(anterior => ({
      ...anterior,
      [campo]: valor
    }));

    setError('');
    setMensaje('');
  }

  function seleccionarCliente(id: string) {
    setFormulario(anterior => ({
      ...anterior,
      clienteId: id,
      motoId: ''
    }));

    setBusquedaMoto('');
    setError('');
  }

  function abrirFormulario() {
    setFormulario(formularioInicial);
    setBusquedaServicio('');
setMostrarOpcionesServicio(false);
    setBusquedaCliente('');
    setBusquedaMoto('');
    setMensaje('');
    setError('');
    setMostrarFormulario(true);
  }

  function cerrarFormulario() {
    setMostrarFormulario(false);
    setFormulario(formularioInicial);
    setError('');
  }

  async function guardarCita(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();
    setError('');
    setMensaje('');

    if (!formulario.clienteId) {
      setError('Selecciona un cliente.');
      return;
    }

    if (!formulario.motoId) {
      setError('Selecciona una moto del cliente.');
      return;
    }

    if (!formulario.mecanicoId) {
      setError('Selecciona un mecánico.');
      return;
    }

   const servicioValido = tiposServicios.some(
  servicio => servicio.nombre === formulario.tipoServicio
);

if (!servicioValido) {
  setError('Selecciona un servicio del catálogo.');
  return;
}

    if (fechaSeleccionada < hoy) {
      setError('No puedes registrar citas en días pasados.');
      return;
    }

    setGuardando(true);

    try {
      await solicitar('/citas', {
        method: 'POST',
        body: JSON.stringify({
          clienteId: formulario.clienteId,
          motoId: formulario.motoId,
          mecanicoId: formulario.mecanicoId,
          fecha: fechaSeleccionada,
          hora: formulario.hora,
          duracionMinutos: formulario.duracionMinutos,
          tipoServicio: formulario.tipoServicio.trim(),
          descripcion: formulario.descripcion.trim() || null
        })
      });

      setMostrarFormulario(false);
      setFormulario(formularioInicial);
      setVistaCitas('activas');

      await cargarDatos();

      setMensaje('Cita registrada correctamente.');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  // Iniciar una orden de servicio asociada a una cita existente.
  async function iniciarOrden(cita: Cita) {
    if (iniciandoOrdenId !== null) return;

    setError('');
    setMensaje('');

    if (cita.estado !== 'PENDIENTE' && cita.estado !== 'CONFIRMADA') {
      setError('Solo puedes iniciar citas pendientes o confirmadas.');
      return;
    }

   

    const confirmado = window.confirm(
      `¿Iniciar la orden de servicio?\n\n` +
      `Cliente: ${obtenerNombreCliente(cita.clienteId)}\n` +
      `Moto: ${obtenerNombreMoto(cita.motoId)}\n` +
      `Servicio: ${cita.tipoServicio}\n` +
      `Mecánico: ${obtenerNombreMecanico(cita.mecanicoId)}\n\n` +
      'La cita pasará a EN PROCESO.'
    );

    if (!confirmado) return;

    setIniciandoOrdenId(cita.id);

    try {
      await solicitar(`/ordenes/desde-cita/${cita.id}/iniciar`, {
        method: 'POST'
      });

      await cargarDatos();
      setMensaje('Orden iniciada correctamente. La cita está EN PROCESO.');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setIniciandoOrdenId(null);
    }
  }

  function obtenerNombreCliente(id: string) {
    const cita = citas.find(item => item.clienteId === id);
    if (cita?.clienteNombre) return cita.clienteNombre;

    const cliente = clientes.find(item => item.id === id);
    return cliente ? nombreCliente(cliente) : 'Cliente no disponible';
  }

  function obtenerNombreMoto(id: string) {
    const cita = citas.find(item => item.motoId === id);
    if (cita?.motoPlaca) {
      return [
        cita.motoPlaca,
        [cita.motoMarca, cita.motoModelo]
          .filter(Boolean)
          .join(' ')
      ].filter(Boolean).join(' · ');
    }

    const moto = motos.find(item => item.id === id);
    return moto ? nombreMoto(moto) : 'Moto no disponible';
  }

  function obtenerNombreMecanico(id: string) {
    const cita = citas.find(item => item.mecanicoId === id);
    if (cita?.mecanicoNombre) return cita.mecanicoNombre;

    const mecanico = mecanicos.find(item => item.id === id);
    return mecanico?.nombre || 'Mecánico no disponible';
  }

  const fechaEsDomingo =
    new Date(`${fechaSeleccionada}T12:00:00Z`)
      .getUTCDay() === 0;

  const fechaAdmiteCitas =
    fechaSeleccionada >= hoy && !fechaEsDomingo;

  return (
    <div className="citas-pagina">
      <div className="citas-encabezado">
        <div>
          <div className="citas-titulo">
            <CalendarDays size={29} />
            <h1>Gestión de Citas</h1>
          </div>

          <p>
            Agenda los servicios y consulta la disponibilidad
            de los mecánicos de URABÁ MOTORS FC.
          </p>
        </div>

        <button
          type="button"
          className="citas-recargar"
          onClick={() => void cargarDatos()}
          disabled={cargando}
        >
          <RefreshCw size={17} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="citas-error" role="alert">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="citas-exito" role="status">
          <CheckCircle2 size={18} />
          {mensaje}
        </div>
      )}

      {cargando && (
        <p className="citas-cargando">
          Consultando información del taller...
        </p>
      )}

      <div className="citas-distribucion">
        <section className="citas-panel-calendario">
          <div className="citas-calendario-cabecera">
            <h2>
              {MESES[mesVista]} {anioVista}
            </h2>

            <div className="citas-navegacion-mes">
              <button
                type="button"
                onClick={() => cambiarMes(-1)}
                aria-label="Mes anterior"
              >
                <ChevronLeft size={20} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setFechaSeleccionada(hoy);
                  setAnioVista(Number(hoy.slice(0, 4)));
                  setMesVista(Number(hoy.slice(5, 7)) - 1);
                }}
              >
                Hoy
              </button>

              <button
                type="button"
                onClick={() => cambiarMes(1)}
                aria-label="Mes siguiente"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="citas-calendario-grid">
            {DIAS.map(dia => (
              <span
                className="citas-nombre-dia"
                key={dia}
              >
                {dia}
              </span>
            ))}

            {diasCalendario.map(dia => {
              const cantidad =
                conteoPorDia[dia.fecha] || 0;

              return (
                <button
                  type="button"
                  key={dia.fecha}
                  onClick={() =>
                    setFechaSeleccionada(dia.fecha)
                  }
                  className={[
                    'citas-dia',
                    !dia.mesActual ? 'otro-mes' : '',
                    dia.fecha === hoy ? 'hoy' : '',
                    dia.fecha === fechaSeleccionada
                      ? 'seleccionado'
                      : '',
                    dia.domingo ? 'domingo' : ''
                  ].filter(Boolean).join(' ')}
                  aria-pressed={
                    dia.fecha === fechaSeleccionada
                  }
                  title={
                    dia.domingo
                      ? 'Domingo: taller cerrado'
                      : `${cantidad} cita(s) activa(s)`
                  }
                >
                  <span>{dia.dia}</span>

                  {cantidad > 0 && (
                    <small>{cantidad}</small>
                  )}
                </button>
              );
            })}
          </div>

          <div className="citas-leyenda">
            <span>
              <i className="citas-punto-ocupado" />
              Día con citas activas
            </span>

            <span>
              <i className="citas-punto-cerrado" />
              Domingo cerrado
            </span>
          </div>
        </section>

        <section className="citas-panel-agenda">
          <div className="citas-agenda-cabecera">
            <div>
              <h2>Agenda del día</h2>
              <p>{fechaBonita(fechaSeleccionada)}</p>
            </div>

            {puedeCrearCita && <button
              type="button"
              className="citas-boton-primario"
              onClick={abrirFormulario}
              disabled={!fechaAdmiteCitas || cargando}
              title={
                fechaAdmiteCitas
                  ? 'Registrar una cita'
                  : 'No se pueden registrar citas en esta fecha'
              }
            >
              <Plus size={17} />
              Nueva cita
            </button>}
          </div>

          {fechaEsDomingo && (
            <div className="citas-aviso">
              El taller permanece cerrado los domingos.
            </div>
          )}

          <div className="citas-pestanas">
            <button
              type="button"
              className={
                vistaCitas === 'activas'
                  ? 'seleccionado'
                  : ''
              }
              onClick={() => setVistaCitas('activas')}
            >
              Activas
            </button>

            <button
              type="button"
              className={
                vistaCitas === 'historial'
                  ? 'seleccionado'
                  : ''
              }
              onClick={() => setVistaCitas('historial')}
            >
              Historial
            </button>
          </div>

          {citasDelDia.length === 0 ? (
            <div className="citas-vacio">
              <CalendarDays size={30} />

              <p>
                {vistaCitas === 'activas'
                  ? 'No hay citas activas para este día.'
                  : 'No hay citas finalizadas o canceladas para este día.'}
              </p>
            </div>
          ) : (
            <div className="citas-listado">
              {citasDelDia.map(cita => (
                <article
                  key={cita.id}
                  className="citas-tarjeta"
                >
                  <div className="citas-tarjeta-superior">
                    <strong>
                      <Clock3 size={16} />
                      {cita.hora.slice(0, 5)}
                    </strong>

                    <span className={
                      `citas-estado estado-${cita.estado.toLowerCase()}`
                    }>
                      {cita.estado.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <h3>{cita.tipoServicio}</h3>

                  <p>
                    <UserRound size={15} />
                    {obtenerNombreCliente(cita.clienteId)}
                  </p>

                  <p>
                    <Bike size={15} />
                    {obtenerNombreMoto(cita.motoId)}
                  </p>

                  <p>
                    <Wrench size={15} />
                    {obtenerNombreMecanico(cita.mecanicoId)}
                  </p>

                  <p>
                    <Clock3 size={15} />
                    {cita.duracionMinutos} minutos
                  </p>

                  {cita.descripcion && (
                    <p className="citas-descripcion">
                      {cita.descripcion}
                    </p>
                  )}

                  {puedeIniciarOrden &&
                    (cita.estado === 'PENDIENTE' ||
                    cita.estado === 'CONFIRMADA') && (
                    <button
                      type="button"
                      className="citas-boton-iniciar"
                      onClick={() => void iniciarOrden(cita)}
                      disabled={iniciandoOrdenId !== null}
                      title={
                        cita.fecha > fechaHoyColombia()
                          ? 'Podrás iniciar la orden el día de la cita'
                          : 'Iniciar orden de servicio'
                      }
                    >
                      <Wrench size={17} />
                      {iniciandoOrdenId === cita.id
                        ? 'Iniciando orden...'
                        : 'Iniciar orden de servicio'}
                    </button>
                  )}
                  
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {mostrarFormulario && (
        <div className="citas-modal-fondo">
          <section
            className="citas-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="citas-form-titulo"
          >
            <div className="citas-modal-cabecera">
              <div>
                <h2 id="citas-form-titulo">
                  Registrar nueva cita
                </h2>
                <p>
                  Fecha: {fechaBonita(fechaSeleccionada)}
                </p>
              </div>

              <button
                type="button"
                className="citas-cerrar"
                onClick={cerrarFormulario}
                disabled={guardando}
                aria-label="Cerrar formulario"
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="citas-error" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={guardarCita}>
              <div className="citas-form-grid">
                <div className="citas-campo citas-ancho-completo">
                  <label htmlFor="citas-buscar-cliente">
                    Buscar cliente por nombre, teléfono o placa
                  </label>

                  <div className="citas-input-icono">
                    <Search size={17} />
                    <input
                      id="citas-buscar-cliente"
                      value={busquedaCliente}
                      onChange={e =>
                        setBusquedaCliente(e.target.value)
                      }
                      placeholder="Escribe para buscar..."
                    />
                  </div>

                  <div className="citas-resultados">
                    {clientesFiltrados.length === 0 ? (
                      <p>No se encontraron clientes.</p>
                    ) : (
                      clientesFiltrados.slice(0, 30).map(
                        cliente => (
                          <button
                            key={cliente.id}
                            type="button"
                            className={
                              formulario.clienteId === cliente.id
                                ? 'seleccionado'
                                : ''
                            }
                            onClick={() =>
                              seleccionarCliente(cliente.id)
                            }
                          >
                            <strong>
                              {nombreCliente(cliente)}
                            </strong>

                            <small>
                              {cliente.telefono ||
                                cliente.phone ||
                                'Sin teléfono'}
                            </small>
                          </button>
                        )
                      )
                    )}
                  </div>

                  {clienteSeleccionado && (
                    <p className="citas-seleccion">
                      <CheckCircle2 size={16} />
                      Cliente: {nombreCliente(clienteSeleccionado)}
                    </p>
                  )}
                </div>

                {formulario.clienteId && (
                  <div className="citas-campo citas-ancho-completo">
                    <label htmlFor="citas-buscar-moto">
                      Seleccionar moto del cliente
                    </label>

                    <div className="citas-input-icono">
                      <Bike size={17} />
                      <input
                        id="citas-buscar-moto"
                        value={busquedaMoto}
                        onChange={e =>
                          setBusquedaMoto(e.target.value)
                        }
                        placeholder="Buscar por placa, marca o modelo..."
                      />
                    </div>

                    <div className="citas-resultados">
                      {motosDelCliente.length === 0 ? (
                        <p>
                          No se encontraron motos para este cliente.
                        </p>
                      ) : (
                        motosDelCliente.map(moto => (
                          <button
                            type="button"
                            key={moto.id}
                            className={
                              formulario.motoId === moto.id
                                ? 'seleccionado'
                                : ''
                            }
                            onClick={() =>
                              actualizarCampo('motoId', moto.id)
                            }
                          >
                            <strong>{nombreMoto(moto)}</strong>
                          </button>
                        ))
                      )}
                    </div>

                    {motoSeleccionada && (
                      <p className="citas-seleccion">
                        <CheckCircle2 size={16} />
                        Moto: {nombreMoto(motoSeleccionada)}
                      </p>
                    )}
                  </div>
                )}

                
<div className="citas-campo citas-servicio-contenedor">
  <label htmlFor="citas-tipo-servicio">
    Tipo de servicio *
  </label>

  <div className="citas-servicio-buscador">
    <Search size={18} />

    <input
      id="citas-tipo-servicio"
      type="search"
      value={busquedaServicio}
      onChange={e =>
        buscarTipoServicio(e.target.value)
      }
      onFocus={() =>
        setMostrarOpcionesServicio(true)
      }
      placeholder="Buscar tipo de servicio..."
      autoComplete="off"
      required
      aria-expanded={mostrarOpcionesServicio}
      aria-controls="citas-lista-servicios"
    />
  </div>

  {mostrarOpcionesServicio && (
    <div
      className="citas-servicio-opciones"
      id="citas-lista-servicios"
    >
      {cargandoServicios ? (
        <p>Cargando servicios...</p>
      ) : errorServicios ? (
        <p>{errorServicios}</p>
      ) : serviciosFiltrados.length === 0 ? (
        <p>No se encontraron servicios.</p>
      ) : (
        serviciosFiltrados.map(servicio => (
          <button
            key={servicio.id}
            type="button"
            onClick={() =>
              seleccionarTipoServicio(servicio)
            }
          >
            <Wrench size={16} />
            <span>{servicio.nombre}</span>
          </button>
        ))
      )}
    </div>
  )}

  {formulario.tipoServicio && (
    <p className="citas-servicio-seleccionado">
      <CheckCircle2 size={16} />
      Servicio seleccionado: {formulario.tipoServicio}
    </p>
  )}
</div>


                <label className="citas-campo">
                  <span>Mecánico *</span>

                  <select
                    value={formulario.mecanicoId}
                    onChange={e =>
                      actualizarCampo(
                        'mecanicoId',
                        e.target.value
                      )
                    }
                    required
                  >
                    <option value="">
                      Selecciona un mecánico
                    </option>

                    {mecanicos.map(mecanico => (
                      <option
                        key={mecanico.id}
                        value={mecanico.id}
                      >
                        {mecanico.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="citas-campo">
                  <span>Hora de inicio *</span>

                  <input
                    type="time"
                    min="08:00"
                    max="18:00"
                    value={formulario.hora}
                    onChange={e =>
                      actualizarCampo('hora', e.target.value)
                    }
                    required
                  />
                </label>

                <label className="citas-campo">
                  <span>Duración *</span>

                  <select
                    value={formulario.duracionMinutos}
                    onChange={e =>
                      actualizarCampo(
                        'duracionMinutos',
                        Number(e.target.value)
                      )
                    }
                  >
                    <option value={30}>30 minutos</option>
                    <option value={60}>1 hora</option>
                    <option value={90}>1 hora y 30 minutos</option>
                    <option value={120}>2 horas</option>
                    <option value={180}>3 horas</option>
                    <option value={240}>4 horas</option>
                  </select>
                </label>

                <label className="citas-campo citas-ancho-completo">
                  <span>Descripción (opcional)</span>

                  <textarea
                    rows={3}
                    value={formulario.descripcion}
                    onChange={e =>
                      actualizarCampo(
                        'descripcion',
                        e.target.value
                      )
                    }
                    placeholder="Observaciones del cliente..."
                  />
                </label>
              </div>

              <div className="citas-form-acciones">
                <button
                  type="button"
                  className="citas-boton-secundario"
                  onClick={cerrarFormulario}
                  disabled={guardando}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="citas-boton-primario"
                  disabled={guardando}
                >
                  <Save size={17} />

                  {guardando
                    ? 'Guardando...'
                    : 'Registrar cita'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
