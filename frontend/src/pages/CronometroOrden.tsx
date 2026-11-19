
import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';

import { obtenerToken } from '../services/auth';

import './CronometroOrden.css';

const API = 'https://uraba-motors-fc.onrender.com/api';

interface Props {
  ordenId: string;
  estado: string;
}

interface IntervaloTrabajo {
  id: string;
  inicio: string;
  fin: string | null;
  motivoFin: 'PAUSA' | 'FINALIZACION' | null;
  duracionSegundos: number | string;
}

interface DatosTiempo {
  estado: string;
  tiempoEfectivoSegundos: number | null;
  intervalos: IntervaloTrabajo[];
}

interface ReferenciaTiempo {
  segundos: number;
  momentoConsulta: number;
  activo: boolean;
}

function formatearTiempo(segundos: number): string {
  const total = Math.max(
    0,
    Math.floor(segundos)
  );

  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundosRestantes = total % 60;

  return [
    horas,
    minutos,
    segundosRestantes
  ]
    .map(valor => String(valor).padStart(2, '0'))
    .join(':');
}

export default function CronometroOrden({
  ordenId,
  estado
}: Props) {

  const [referencia, setReferencia] =
    useState<ReferenciaTiempo | null>(null);

  const [intervalos, setIntervalos] =
    useState<IntervaloTrabajo[]>([]);

  const [ahora, setAhora] =
    useState(() => performance.now());

  const [cargando, setCargando] =
    useState(true);

  const [error, setError] =
    useState('');

  // ========================================
  // CONSULTAR TIEMPOS GUARDADOS EN MYSQL
  // ========================================

  useEffect(() => {
    const controlador = new AbortController();

    let consultando = false;
    let primeraConsulta = true;

    setReferencia(null);
    setCargando(true);
    setError('');

    async function cargarTiempo() {
      if (consultando) return;

      consultando = true;

      try {
        const token = obtenerToken();

        if (!token) {
          throw new Error(
            'Debes iniciar sesión nuevamente.'
          );
        }

        const respuesta = await fetch(
          `${API}/ordenes/${ordenId}`,
          {
            signal: controlador.signal,
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const datos = await respuesta
          .json()
          .catch(() => null);

        if (!respuesta.ok) {
          throw new Error(
            datos?.mensaje ||
            'No fue posible consultar el tiempo'
          );
        }

        const tiempo = datos as DatosTiempo;

        if (
          !tiempo ||
          !Array.isArray(tiempo.intervalos)
        ) {
          throw new Error(
            'El servidor no devolvió los intervalos de trabajo'
          );
        }

        if (controlador.signal.aborted) {
          return;
        }

        setIntervalos(tiempo.intervalos);

        if (
          tiempo.tiempoEfectivoSegundos === null
        ) {
          // Orden anterior a la implementación
          // del control de tiempos.
          setReferencia(null);
        } else {
          const segundos = Number(
            tiempo.tiempoEfectivoSegundos
          );

          if (
            !Number.isFinite(segundos) ||
            segundos < 0
          ) {
            throw new Error(
              'El tiempo registrado no es válido'
            );
          }

          const momento = performance.now();

          const activo =
            tiempo.estado === 'EN_PROCESO' &&
            tiempo.intervalos.some(
              intervalo => intervalo.fin === null
            );

          setReferencia({
            segundos,
            momentoConsulta: momento,
            activo
          });

          setAhora(momento);
        }

        setError('');

      } catch (error) {
        if (controlador.signal.aborted) {
          return;
        }

        setError(
          error instanceof Error
            ? error.message
            : 'No fue posible consultar los tiempos'
        );

      } finally {
        consultando = false;

        if (
          !controlador.signal.aborted &&
          primeraConsulta
        ) {
          primeraConsulta = false;
          setCargando(false);
        }
      }
    }

    void cargarTiempo();

    // Sincronizar periódicamente con el servidor,
    // incluso si otro usuario modifica la orden.

    const sincronizacion = window.setInterval(
      () => void cargarTiempo(),
      15000
    );

    return () => {
      controlador.abort();
      window.clearInterval(sincronizacion);
    };

  }, [ordenId, estado]);

  // ========================================
  // ACTUALIZAR CRONÓMETRO CADA SEGUNDO
  // ========================================

  useEffect(() => {
    if (
      estado !== 'EN_PROCESO' ||
      !referencia?.activo
    ) {
      return;
    }

    const reloj = window.setInterval(() => {
      setAhora(performance.now());
    }, 1000);

    return () => {
      window.clearInterval(reloj);
    };

  }, [estado, referencia]);

  // ========================================
  // CALCULAR TIEMPO PARA MOSTRAR
  // ========================================

  const activo =
    estado === 'EN_PROCESO' &&
    referencia?.activo === true;

  const segundosTranscurridos =
    activo && referencia
      ? Math.max(
          0,
          (ahora - referencia.momentoConsulta) /
            1000
        )
      : 0;

  const segundosTotales =
    (referencia?.segundos ?? 0) +
    segundosTranscurridos;

  const intervalosCerrados =
    intervalos.filter(
      intervalo => intervalo.fin !== null
    );

  // ========================================
  // INTERFAZ
  // ========================================

  return (
    <section className="cronometro-orden">

      <div className="cronometro-cabecera">
        <Clock3 size={21} />

        <h4>Tiempo efectivo de trabajo</h4>
      </div>

      {error && (
        <p
          className="cronometro-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {cargando ? (
        <p>Consultando tiempo de trabajo...</p>

      ) : referencia === null ? (
        <p className="cronometro-sin-registro">
          Esta orden no tiene intervalos
          de trabajo registrados.
        </p>

      ) : (
        <>
          <div
            className={[
              'cronometro-reloj',
              activo ? 'activo' : 'detenido'
            ].join(' ')}
          >
            {formatearTiempo(segundosTotales)}
          </div>

          <div className="cronometro-estado">
            <span
              className={[
                'cronometro-indicador',
                activo ? 'activo' : ''
              ].join(' ')}
            />

            {error
              ? 'Sin sincronización'
              : activo
                ? 'Trabajo en curso'
                : estado === 'PAUSADO'
                  ? 'Trabajo pausado'
                  : estado === 'COMPLETADO' ||
                    estado === 'ENTREGADO'
                    ? 'Trabajo finalizado'
                    : 'Cronómetro detenido'}
          </div>

          <div className="cronometro-resumen">
            <span>
              Intervalos registrados
            </span>

            <strong>
              {intervalos.length}
            </strong>
          </div>

          <div className="cronometro-resumen">
            <span>
              Intervalos completados
            </span>

            <strong>
              {intervalosCerrados.length}
            </strong>
          </div>
        </>
      )}

    </section>
  );
}
