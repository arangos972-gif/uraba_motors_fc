import { useEffect, useState } from 'react';
import { RefreshCw, Wrench } from 'lucide-react';

import { obtenerToken } from '../services/auth';
import './CantidadMecanicos.css';

const API =
  'https://uraba-motors-fc.onrender.com/api/reportes/cantidad-mecanicos';

interface ResumenMecanicos {
  totalMecanicos: number;
  mecanicosActivos: number;
  mecanicosInactivos: number;
}

async function solicitarReporte(): Promise<ResumenMecanicos> {
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
    typeof datos?.totalMecanicos !== 'number' ||
    typeof datos?.mecanicosActivos !== 'number' ||
    typeof datos?.mecanicosInactivos !== 'number'
  ) {
    throw new Error(
      'La respuesta del reporte de mecánicos no es válida.'
    );
  }

  return datos as ResumenMecanicos;
}

function mensajeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No fue posible consultar el reporte de mecánicos.';
}

export default function CantidadMecanicos() {
  const [resumen, setResumen] =
    useState<ResumenMecanicos | null>(null);
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
    resumen && resumen.totalMecanicos > 0
      ? (resumen.mecanicosActivos / resumen.totalMecanicos) * 100
      : 0;

  return (
    <section className="cm-reporte" aria-labelledby="cm-titulo">
      <header className="cm-encabezado">
        <div>
          <h2 id="cm-titulo">Cantidad de mecánicos</h2>
          <p>Resumen de mecánicos registrados y disponibles.</p>
        </div>

        <button
          type="button"
          className="cm-boton"
          onClick={() => void actualizar()}
          disabled={cargando}
        >
          <RefreshCw size={17} aria-hidden="true" />
          {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {error && (
        <div className="cm-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="cm-boton cm-boton-error"
            onClick={() => void actualizar()}
            disabled={cargando}
          >
            Reintentar
          </button>
        </div>
      )}

      {cargando && !resumen ? (
        <p className="cm-estado" role="status">
          Cargando reporte de mecánicos…
        </p>
      ) : resumen ? (
        <>
          <div className="cm-tarjetas">
            <article className="cm-tarjeta cm-total">
              <span className="cm-icono">
                <Wrench size={20} aria-hidden="true" />
              </span>
              <span>Total de mecánicos</span>
              <strong>{resumen.totalMecanicos}</strong>
            </article>

            <article className="cm-tarjeta">
              <span>Mecánicos activos</span>
              <strong>{resumen.mecanicosActivos}</strong>
              <small>{porcentajeActivos.toFixed(1)} % del total</small>
            </article>

            <article className="cm-tarjeta">
              <span>Mecánicos inactivos</span>
              <strong>{resumen.mecanicosInactivos}</strong>
            </article>
          </div>

          <section
            className="cm-distribucion"
            aria-label="Disponibilidad de mecánicos"
          >
            <div className="cm-distribucion-texto">
              <h3>Disponibilidad</h3>
              <span>
                {resumen.mecanicosActivos} activos de {resumen.totalMecanicos}
              </span>
            </div>
            <div
              className="cm-barra-fondo"
              role="progressbar"
              aria-label="Porcentaje de mecánicos activos"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Number(porcentajeActivos.toFixed(1))}
            >
              <div
                className="cm-barra-activos"
                style={{ width: `${porcentajeActivos}%` }}
              />
            </div>
            {resumen.totalMecanicos === 0 && (
              <p className="cm-sin-registros">
                No hay mecánicos registrados.
              </p>
            )}
          </section>
        </>
      ) : !error ? (
        <p className="cm-estado">
          No hay datos disponibles para mostrar.
        </p>
      ) : null}
    </section>
  );
}
