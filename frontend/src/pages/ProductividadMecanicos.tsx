
import { useEffect, useState } from 'react';
import { obtenerToken } from '../services/auth';

type Mecanico = {
  mecanicoId: string;
  mecanico: string;
  ordenesCompletadas: number;
  manoObraRealizada: number;
  horasEfectivas: number;
};

type Reporte = {
  desde: string;
  hasta: string;
  mecanicos: Mecanico[];
  resumen: {
    ordenesCompletadas: number;
    manoObraRealizada: number;
    horasEfectivas: number;
  };
};

function fechaLocal() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const valor = (tipo: string) =>
    partes.find(p => p.type === tipo)?.value ?? '';

  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

const hoy = fechaLocal();
const inicioMes = `${hoy.slice(0, 7)}-01`;

const moneda = (valor: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2
  }).format(valor);

export default function ProductividadMecanicos() {
  const [desde, setDesde] = useState(inicioMes);
  const [hasta, setHasta] = useState(hoy);

  const [reporte, setReporte] =
    useState<Reporte | null>(null);

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function consultarReporte() {
    setCargando(true);
    setError('');
    setReporte(null);

    try {
      if (desde > hasta) {
        throw new Error(
          'La fecha inicial no puede superar la final.'
        );
      }

      const token = obtenerToken();

      const parametros = new URLSearchParams({
        desde,
        hasta
      });

      const respuesta = await fetch(
        `http://localhost:3000/api/reportes/mecanicos/productividad?${parametros}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.mensaje ||
          'Error consultando el reporte.'
        );
      }

      setReporte(datos);

    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Error desconocido.'
      );

    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void consultarReporte();
    // Consulta inicial con los filtros predeterminados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      style={{
        padding: 20,
        border: '1px solid #64748b55',
        borderRadius: 12,
        marginBottom: 24,
        color: 'inherit'
      }}
    >
      <h2>Productividad de mecánicos</h2>

      <p>
        Órdenes terminadas, mano de obra y horas
        efectivas. No depende de las comisiones.
      </p>

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'end',
          marginBottom: 20
        }}
      >
        <label>
          Desde
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            style={{
              display: 'block',
              padding: 8,
              color: '#111827',
              background: '#ffffff'
            }}
          />
        </label>

        <label>
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            style={{
              display: 'block',
              padding: 8,
              color: '#111827',
              background: '#ffffff'
            }}
          />
        </label>

        <button
          type="button"
          onClick={() => void consultarReporte()}
          disabled={cargando}
          style={{
            padding: '10px 18px',
            cursor: 'pointer'
          }}
        >
          {cargando
            ? 'Consultando...'
            : 'Consultar productividad'}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: '#dc2626' }}>
          {error}
        </p>
      )}

      {reporte && (
        <>
          <div style={{ marginBottom: 18 }}>
            <p>
              <strong>Órdenes completadas: </strong>
              {reporte.resumen.ordenesCompletadas}
            </p>
            <p>
              <strong>Mano de obra total: </strong>
              {moneda(
                reporte.resumen.manoObraRealizada
              )}
            </p>
            <p>
              <strong>Horas efectivas: </strong>
              {reporte.resumen.horasEfectivas.toFixed(2)}
            </p>
          </div>

          {reporte.mecanicos.length === 0 ? (
            <p>
              No hay órdenes completadas en este período.
              Puedes consultar otras fechas.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse'
                }}
              >
                <thead>
                  <tr>
                    <th style={{ padding: 10, textAlign: 'left' }}>
                      Mecánico
                    </th>
                    <th style={{ padding: 10 }}>
                      Órdenes
                    </th>
                    <th style={{ padding: 10 }}>
                      Mano de obra
                    </th>
                    <th style={{ padding: 10 }}>
                      Horas
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {reporte.mecanicos.map(m => (
                    <tr key={m.mecanicoId}>
                      <td style={{ padding: 10 }}>
                        {m.mecanico}
                      </td>
                      <td
                        style={{
                          padding: 10,
                          textAlign: 'center'
                        }}
                      >
                        {m.ordenesCompletadas}
                      </td>
                      <td style={{ padding: 10 }}>
                        {moneda(m.manoObraRealizada)}
                      </td>
                      <td style={{ padding: 10 }}>
                        {m.horasEfectivas.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
