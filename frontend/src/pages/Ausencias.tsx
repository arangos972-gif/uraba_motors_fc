
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  ArrowLeft,
  CalendarOff,
  Plus,
  Search,
  Pencil,
  Trash2,
  Save,
  RefreshCw,
  X
} from 'lucide-react';

import { obtenerToken } from '../services/auth';
import './Ausencias.css';

const API = 'https://uraba-motors-fc.onrender.com/api/ausencias';
const API_MECANICOS =
  'https://uraba-motors-fc.onrender.com/api/horarios-mecanicos/mecanicos';

interface Mecanico {
  id: string;
  nombre: string;
}

interface Ausencia {
  id: string;
  mecanicoId: string;
  mecanico: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  tipo: string;
}

interface Formulario {
  mecanicoId: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  tipo: string;
}

interface Props {
  onVolver: () => void;
}

const formularioInicial: Formulario = {
  mecanicoId: '',
  fechaInicio: '',
  fechaFin: '',
  motivo: '',
  tipo: 'PERMISO'
};

const TIPOS = [
  { valor: 'VACACIONES', nombre: 'Vacaciones' },
  { valor: 'PERMISO', nombre: 'Permiso' },
  { valor: 'INCAPACIDAD', nombre: 'Incapacidad' },
  { valor: 'OTRO', nombre: 'Otro' }
];

function fechaLegible(valor: string) {
  const [fecha, hora] = valor.split('T');

  if (!fecha || !hora) return valor;

  const [anio, mes, dia] = fecha.split('-');

  return `${dia}/${mes}/${anio} · ${hora.slice(0, 5)}`;
}

export default function Ausencias({ onVolver }: Props) {
  const [mecanicos, setMecanicos] = useState<Mecanico[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);

  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('TODOS');

  const [mostrarFormulario, setMostrarFormulario] =
    useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(
    null
  );

  const [formulario, setFormulario] =
    useState<Formulario>(formularioInicial);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] =
    useState<string | null>(null);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  async function solicitar(
    url: string,
    opciones: RequestInit = {}
  ) {
    const token = obtenerToken();

    if (!token) {
      throw new Error(
        'Tu sesión ha terminado. Inicia sesión nuevamente.'
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

  async function cargarDatos() {
    setCargando(true);
    setError('');

    try {
      const [listaAusencias, listaMecanicos] =
        await Promise.all([
          solicitar(API),
          solicitar(API_MECANICOS)
        ]);

      if (
        !Array.isArray(listaAusencias) ||
        !Array.isArray(listaMecanicos)
      ) {
        throw new Error(
          'El servidor devolvió datos inesperados.'
        );
      }

      setAusencias(listaAusencias);
      setMecanicos(listaMecanicos);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible cargar las ausencias.'
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargarDatos();
  }, []);

  function actualizarCampo(
    campo: keyof Formulario,
    valor: string
  ) {
    setFormulario(anterior => ({
      ...anterior,
      [campo]: valor
    }));

    setError('');
  }

  function abrirNuevo() {
    setEditandoId(null);
    setFormulario(formularioInicial);
    setMensaje('');
    setError('');
    setMostrarFormulario(true);
  }

  function abrirEditar(ausencia: Ausencia) {
    setEditandoId(ausencia.id);

    setFormulario({
      mecanicoId: ausencia.mecanicoId,
      fechaInicio: ausencia.fechaInicio.slice(0, 16),
      fechaFin: ausencia.fechaFin.slice(0, 16),
      motivo: ausencia.motivo,
      tipo: ausencia.tipo
    });

    setMensaje('');
    setError('');
    setMostrarFormulario(true);
  }

  function cerrarFormulario() {
    setMostrarFormulario(false);
    setEditandoId(null);
    setFormulario(formularioInicial);
    setError('');
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError('');
    setMensaje('');

    if (!formulario.mecanicoId) {
      setError('Selecciona un mecánico.');
      return;
    }

    if (
      !formulario.fechaInicio ||
      !formulario.fechaFin
    ) {
      setError('Selecciona las fechas de inicio y fin.');
      return;
    }

    if (formulario.fechaInicio >= formulario.fechaFin) {
      setError(
        'La fecha final debe ser posterior a la inicial.'
      );
      return;
    }

    if (!formulario.motivo.trim()) {
      setError('Escribe el motivo de la ausencia.');
      return;
    }

    setGuardando(true);

    const eraEdicion = editandoId !== null;

    try {
      await solicitar(
        eraEdicion ? `${API}/${editandoId}` : API,
        {
          method: eraEdicion ? 'PUT' : 'POST',
          body: JSON.stringify({
            mecanicoId: formulario.mecanicoId,
            fechaInicio: formulario.fechaInicio,
            fechaFin: formulario.fechaFin,
            motivo: formulario.motivo.trim(),
            tipo: formulario.tipo
          })
        }
      );

      cerrarFormulario();
      await cargarDatos();

      setMensaje(
        eraEdicion
          ? 'Ausencia actualizada correctamente.'
          : 'Ausencia registrada correctamente.'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la ausencia.'
      );
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(ausencia: Ausencia) {
    setError('');
    setMensaje('');

    const confirmado = window.confirm(
      `¿Eliminar definitivamente la ausencia de ${ausencia.mecanico}?\n\n` +
      `Motivo: ${ausencia.motivo}\n\n` +
      'Esta acción no se puede deshacer.'
    );

    if (!confirmado) return;

    setEliminandoId(ausencia.id);

    try {
      await solicitar(`${API}/${ausencia.id}`, {
        method: 'DELETE'
      });

      await cargarDatos();
      setMensaje('Ausencia eliminada correctamente.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible eliminar la ausencia.'
      );
    } finally {
      setEliminandoId(null);
    }
  }

  const ausenciasFiltradas = ausencias.filter(ausencia => {
    const termino = busqueda.trim().toLowerCase();

    const coincideBusqueda = [
      ausencia.mecanico,
      ausencia.motivo,
      ausencia.tipo,
      ausencia.fechaInicio.slice(0, 10)
    ].some(valor =>
      valor.toLowerCase().includes(termino)
    );

    const coincideTipo =
      filtroTipo === 'TODOS' ||
      ausencia.tipo === filtroTipo;

    return coincideBusqueda && coincideTipo;
  });

  return (
    <div className="ausencias-pagina">
      <button
        type="button"
        className="ausencias-volver"
        onClick={onVolver}
      >
        <ArrowLeft size={18} />
        Volver a Usuarios
      </button>

      <div className="ausencias-encabezado">
        <div>
          <div className="ausencias-titulo">
            <CalendarOff size={28} />
            <h1>Ausencias y bloqueos</h1>
          </div>

          <p>
            Gestiona los períodos en los que los
            mecánicos no pueden recibir citas.
          </p>
        </div>

        {!mostrarFormulario && (
          <button
            type="button"
            className="ausencias-boton-primario"
            onClick={abrirNuevo}
          >
            <Plus size={18} />
            Nueva ausencia
          </button>
        )}
      </div>

      {error && (
        <div className="ausencias-error" role="alert">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="ausencias-exito" role="status">
          {mensaje}
        </div>
      )}

      {mostrarFormulario ? (
        <section className="ausencias-panel">
          <div className="ausencias-panel-titulo">
            <h2>
              {editandoId
                ? 'Editar ausencia'
                : 'Registrar ausencia'}
            </h2>

            <button
              type="button"
              className="ausencias-cerrar"
              onClick={cerrarFormulario}
              aria-label="Cerrar formulario"
            >
              <X size={19} />
            </button>
          </div>

          <form onSubmit={guardar}>
            <div className="ausencias-form-grid">
              <label className="ausencias-campo">
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

              <label className="ausencias-campo">
                <span>Tipo de ausencia *</span>
                <select
                  value={formulario.tipo}
                  onChange={e =>
                    actualizarCampo('tipo', e.target.value)
                  }
                  required
                >
                  {TIPOS.map(tipo => (
                    <option
                      key={tipo.valor}
                      value={tipo.valor}
                    >
                      {tipo.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ausencias-campo">
                <span>Fecha y hora de inicio *</span>
                <input
                  type="datetime-local"
                  value={formulario.fechaInicio}
                  onChange={e =>
                    actualizarCampo(
                      'fechaInicio',
                      e.target.value
                    )
                  }
                  required
                />
              </label>

              <label className="ausencias-campo">
                <span>Fecha y hora de finalización *</span>
                <input
                  type="datetime-local"
                  value={formulario.fechaFin}
                  onChange={e =>
                    actualizarCampo(
                      'fechaFin',
                      e.target.value
                    )
                  }
                  required
                />
              </label>

              <label className="ausencias-campo ausencias-ancho-completo">
                <span>Motivo *</span>
                <textarea
                  value={formulario.motivo}
                  onChange={e =>
                    actualizarCampo(
                      'motivo',
                      e.target.value
                    )
                  }
                  maxLength={255}
                  rows={3}
                  placeholder="Explica el motivo de la ausencia..."
                  required
                />
              </label>
            </div>

            <div className="ausencias-acciones">
              <button
                type="button"
                className="ausencias-boton-secundario"
                onClick={cerrarFormulario}
                disabled={guardando}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="ausencias-boton-primario"
                disabled={guardando}
              >
                <Save size={17} />
                {guardando
                  ? 'Guardando...'
                  : editandoId
                    ? 'Guardar cambios'
                    : 'Registrar ausencia'}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <>
          <div className="ausencias-herramientas">
            <div className="ausencias-busqueda">
              <Search size={19} />

              <input
                type="search"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar mecánico, motivo, tipo o fecha..."
              />
            </div>

            <select
              className="ausencias-filtro-tipo"
              value={filtroTipo}
              onChange={e =>
                setFiltroTipo(e.target.value)
              }
              aria-label="Filtrar por tipo"
            >
              <option value="TODOS">Todos los tipos</option>

              {TIPOS.map(tipo => (
                <option
                  key={tipo.valor}
                  value={tipo.valor}
                >
                  {tipo.nombre}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="ausencias-recargar"
              onClick={() => void cargarDatos()}
              disabled={cargando}
              title="Actualizar listado"
            >
              <RefreshCw size={18} />
            </button>
          </div>

          <p className="ausencias-total">
            {ausenciasFiltradas.length} ausencia(s)
            encontrada(s)
          </p>

          {cargando ? (
            <div className="ausencias-vacio">
              Cargando ausencias...
            </div>
          ) : ausenciasFiltradas.length === 0 ? (
            <div className="ausencias-vacio">
              No hay ausencias con estos filtros.
            </div>
          ) : (
            <div className="ausencias-lista">
              {ausenciasFiltradas.map(ausencia => (
                <article
                  className="ausencias-tarjeta"
                  key={ausencia.id}
                >
                  <div className="ausencias-tarjeta-cabecera">
                    <h3>{ausencia.mecanico}</h3>

                    <span className="ausencias-etiqueta">
                      {TIPOS.find(
                        tipo => tipo.valor === ausencia.tipo
                      )?.nombre || ausencia.tipo}
                    </span>
                  </div>

                  <div className="ausencias-detalles">
                    <p>
                      <strong>Desde:</strong>{' '}
                      {fechaLegible(ausencia.fechaInicio)}
                    </p>

                    <p>
                      <strong>Hasta:</strong>{' '}
                      {fechaLegible(ausencia.fechaFin)}
                    </p>

                    <p>
                      <strong>Motivo:</strong>{' '}
                      {ausencia.motivo}
                    </p>
                  </div>

                  <div className="ausencias-tarjeta-acciones">
                    <button
                      type="button"
                      className="ausencias-editar"
                      onClick={() => abrirEditar(ausencia)}
                    >
                      <Pencil size={16} />
                      Editar
                    </button>

                    <button
                      type="button"
                      className="ausencias-eliminar"
                      onClick={() =>
                        void eliminar(ausencia)
                      }
                      disabled={eliminandoId !== null}
                    >
                      <Trash2 size={16} />
                      {eliminandoId === ausencia.id
                        ? 'Eliminando...'
                        : 'Eliminar'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
