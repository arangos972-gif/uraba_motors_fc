import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';

import { obtenerToken } from '../services/auth';
import './TrabajosPorCliente.css';

const API =
  'http://localhost:3000/api/reportes/trabajos-cliente';

interface ClienteTrabajo {
  clienteId: string;
  nombre: string;
  activo: boolean;
  totalTrabajos: number;
  trabajosEnProceso: number;
  trabajosPausados: number;
  trabajosCompletados: number;
  trabajosCancelados: number;
}

interface ReporteTrabajosCliente {
  resumen: {
    totalClientes: number;
    clientesConTrabajos: number;
    totalTrabajos: number;
  };
  clientes: ClienteTrabajo[];
}

async function solicitarReporte(): Promise<ReporteTrabajosCliente> {
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
      `No fue posible consultar el reporte (${respuesta.status}).`
    );
  }

  if (
    !datos ||
    !Array.isArray(datos.clientes) ||
    typeof datos.resumen?.totalClientes !== 'number' ||
    typeof datos.resumen?.clientesConTrabajos !== 'number' ||
    typeof datos.resumen?.totalTrabajos !== 'number'
  ) {
    throw new Error(
      'La respuesta del reporte de trabajos por cliente no es válida.'
    );
  }

  return datos as ReporteTrabajosCliente;
}

function mensajeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No fue posible consultar los trabajos por cliente.';
}

export default function TrabajosPorCliente() {
  const [reporte, setReporte] =
    useState<ReporteTrabajosCliente | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function actualizar() {
    setCargando(true);
    setError('');

    try {
      setReporte(await solicitarReporte());
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
        const resultado = await solicitarReporte();

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

  const clientesFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es');

    if (!termino || !reporte) {
      return reporte?.clientes ?? [];
    }

    return reporte.clientes.filter(cliente =>
      cliente.nombre.toLocaleLowerCase('es').includes(termino)
    );
  }, [busqueda, reporte]);

  return (
    <section className="tc-reporte" aria-labelledby="tc-titulo">
      <header className="tc-encabezado">
        <div>
          <h2 id="tc-titulo">Trabajos por cliente</h2>
          <p>
            Órdenes asociadas a cada cliente, agrupadas por estado.
          </p>
        </div>

        <button
          type="button"
          className="tc-boton"
          onClick={() => void actualizar()}
          disabled={cargando}
        >
          <RefreshCw size={17} aria-hidden="true" />
          {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {error && (
        <div className="tc-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="tc-boton tc-boton-error"
            onClick={() => void actualizar()}
            disabled={cargando}
          >
            Reintentar
          </button>
        </div>
      )}

      {cargando && !reporte ? (
        <p className="tc-estado" role="status">
          Cargando trabajos por cliente…
        </p>
      ) : reporte ? (
        <>
          <div className="tc-resumen">
            <article className="tc-tarjeta">
              <span>Clientes registrados</span>
              <strong>{reporte.resumen.totalClientes}</strong>
            </article>
            <article className="tc-tarjeta">
              <span>Clientes con trabajos</span>
              <strong>{reporte.resumen.clientesConTrabajos}</strong>
            </article>
            <article className="tc-tarjeta">
              <span>Total de órdenes</span>
              <strong>{reporte.resumen.totalTrabajos}</strong>
            </article>
          </div>

          <label className="tc-busqueda">
            <Search size={18} aria-hidden="true" />
            <span className="tc-oculto">Buscar cliente</span>
            <input
              type="search"
              value={busqueda}
              onChange={evento => setBusqueda(evento.target.value)}
              placeholder="Buscar por nombre…"
            />
          </label>

          {clientesFiltrados.length === 0 ? (
            <p className="tc-estado">
              {reporte.clientes.length === 0
                ? 'No hay clientes registrados.'
                : 'No se encontraron clientes con ese nombre.'}
            </p>
          ) : (
            <div className="tc-tabla-contenedor">
              <table className="tc-tabla">
                <thead>
                  <tr>
                    <th scope="col">Cliente</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Total</th>
                    <th scope="col">En proceso</th>
                    <th scope="col">Pausados</th>
                    <th scope="col">Completados</th>
                    <th scope="col">Cancelados</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.map(cliente => (
                    <tr key={cliente.clienteId}>
                      <th scope="row">{cliente.nombre}</th>
                      <td>
                        <span
                          className={`tc-estado-cliente ${
                            cliente.activo
                              ? 'tc-cliente-activo'
                              : 'tc-cliente-archivado'
                          }`}
                        >
                          {cliente.activo ? 'Activo' : 'Archivado'}
                        </span>
                      </td>
                      <td><strong>{cliente.totalTrabajos}</strong></td>
                      <td>{cliente.trabajosEnProceso}</td>
                      <td>{cliente.trabajosPausados}</td>
                      <td>{cliente.trabajosCompletados}</td>
                      <td>{cliente.trabajosCancelados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : !error ? (
        <p className="tc-estado">
          No hay datos disponibles para mostrar.
        </p>
      ) : null}
    </section>
  );
}
