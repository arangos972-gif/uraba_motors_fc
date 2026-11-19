import { useEffect, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';

import { obtenerToken } from '../services/auth';
import './CantidadClientes.css';

const API =
  'https://uraba-motors-fc.onrender.com/api/reportes/clientes';

interface ResumenClientes {
  totalClientes: number;
  clientesActivos: number;
  clientesArchivados: number;
}

async function solicitarReporte(): Promise<ResumenClientes> {
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
    typeof datos?.totalClientes !== 'number' ||
    typeof datos?.clientesActivos !== 'number' ||
    typeof datos?.clientesArchivados !== 'number'
  ) {
    throw new Error(
      'La respuesta del reporte de clientes no es válida.'
    );
  }

  return datos as ResumenClientes;
}

function mensajeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No fue posible consultar el reporte de clientes.';
}

export default function CantidadClientes() {
  const [resumen, setResumen] =
    useState<ResumenClientes | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function actualizar() {
    setCargando(true);
    setError('');

    try {
      setResumen(await solicitarReporte());
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
          setResumen(resultado);
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

  const porcentajeActivos =
    resumen && resumen.totalClientes > 0
      ? (resumen.clientesActivos / resumen.totalClientes) * 100
      : 0;

  return (
    <section className="cc-reporte" aria-labelledby="cc-titulo">
      <header className="cc-encabezado">
        <div>
          <h2 id="cc-titulo">Cantidad de clientes</h2>
          <p>Resumen de clientes registrados, activos y archivados.</p>
        </div>

        <button
          type="button"
          className="cc-boton"
          onClick={() => void actualizar()}
          disabled={cargando}
        >
          <RefreshCw size={17} aria-hidden="true" />
          {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {error && (
        <div className="cc-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="cc-boton cc-boton-error"
            onClick={() => void actualizar()}
            disabled={cargando}
          >
            Reintentar
          </button>
        </div>
      )}

      {cargando && !resumen ? (
        <p className="cc-estado" role="status">
          Cargando reporte de clientes…
        </p>
      ) : resumen ? (
        <>
          <div className="cc-tarjetas">
            <article className="cc-tarjeta cc-total">
              <span className="cc-icono">
                <Users size={20} aria-hidden="true" />
              </span>
              <span>Total registrados</span>
              <strong>{resumen.totalClientes}</strong>
            </article>

            <article className="cc-tarjeta">
              <span>Clientes activos</span>
              <strong>{resumen.clientesActivos}</strong>
              <small>
                {porcentajeActivos.toFixed(1)} % del total
              </small>
            </article>

            <article className="cc-tarjeta">
              <span>Clientes archivados</span>
              <strong>{resumen.clientesArchivados}</strong>
            </article>
          </div>

          <section className="cc-distribucion" aria-label="Distribución de clientes">
            <div className="cc-distribucion-texto">
              <h3>Estado de los registros</h3>
              <span>
                {resumen.clientesActivos} activos de {resumen.totalClientes}
              </span>
            </div>
            <div
              className="cc-barra-fondo"
              role="progressbar"
              aria-label="Porcentaje de clientes activos"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Number(porcentajeActivos.toFixed(1))}
            >
              <div
                className="cc-barra-activos"
                style={{ width: `${porcentajeActivos}%` }}
              />
            </div>
            {resumen.totalClientes === 0 && (
              <p className="cc-sin-registros">
                Aún no hay clientes registrados.
              </p>
            )}
          </section>
        </>
      ) : !error ? (
        <p className="cc-estado">
          No hay datos disponibles para mostrar.
        </p>
      ) : null}
    </section>
  );
}
