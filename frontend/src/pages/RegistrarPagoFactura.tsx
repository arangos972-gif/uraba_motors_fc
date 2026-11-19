
import { useRef, useState } from 'react';
import { obtenerToken } from '../services/auth';

const API = 'http://localhost:3000/api';

const medios = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'TARJETA',
  'NEQUI',
  'DAVIPLATA'
] as const;

type MedioPago = typeof medios[number];

interface Props {
  facturaId: string;
  saldoPendiente: number | string;
  onPagoRegistrado: () => Promise<void>;
}

function dinero(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP'
  }).format(valor);
}

export default function RegistrarPagoFactura({
  facturaId,
  saldoPendiente,
  onPagoRegistrado
}: Props) {
  const saldo = Number(saldoPendiente);

  const [monto, setMonto] = useState('');
  const [tipoPago, setTipoPago] =
    useState<MedioPago>('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [advertencia, setAdvertencia] = useState('');

  const enviando = useRef(false);
  const solicitudId = useRef(crypto.randomUUID());

  // Si hay un resultado incierto, no permitimos
  // cambiar los datos y reenviar otro pago.
  const [resultadoIncierto, setResultadoIncierto] =
    useState(false);

  async function registrar(
    evento: React.FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (enviando.current || resultadoIncierto) {
      return;
    }

    const numero = Number(monto);
    const centavos = Math.round(numero * 100);

    if (
      monto.trim() === '' ||
      !Number.isFinite(numero) ||
      numero <= 0 ||
      Math.abs(numero * 100 - centavos) > 0.0001
    ) {
      setError('Ingresa un monto válido.');
      return;
    }

    if (numero > saldo) {
      setError('El monto supera el saldo pendiente.');
      return;
    }

    const confirmado = window.confirm(
      `¿Confirmas que el taller YA RECIBIÓ este pago?\n\n` +
      `Monto: ${dinero(numero)}\n` +
      `Medio: ${tipoPago}\n\n` +
      'No confirmes transferencias que aún no aparezcan recibidas.'
    );

    if (!confirmado) return;

    const token = obtenerToken();

    if (!token) {
      setError('Debes iniciar sesión nuevamente.');
      return;
    }

    enviando.current = true;
    setGuardando(true);
    setError('');
    setAdvertencia('');

    try {
      const respuesta = await fetch(
        `${API}/facturas/${facturaId}/pagos`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            solicitudId: solicitudId.current,
            monto: numero,
            tipoPago,
            referencia: referencia.trim() || null
          })
        }
      );

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        // Respuesta explícita del servidor:
        // no se debe reutilizar un identificador
        // para intentar registrar un pago diferente.
        throw new Error(
          datos?.mensaje ||
          'No fue posible registrar el pago.'
        );
      }

      // A partir de aquí el pago está confirmado
      // en el servidor, aunque falle la recarga.
      solicitudId.current = crypto.randomUUID();

      setMonto('');
      setReferencia('');
      setResultadoIncierto(false);

      await onPagoRegistrado();

    } catch (fallo) {
      const mensaje =
        fallo instanceof Error
          ? fallo.message
          : 'No fue posible comprobar el pago.';

      if (
        fallo instanceof TypeError ||
        mensaje.includes('Failed to fetch')
      ) {
        setResultadoIncierto(true);
        setAdvertencia(
          'No se pudo confirmar el resultado. ' +
          'Consulta el historial antes de intentar otro pago.'
        );
      } else {
        setError(mensaje);
      }

    } finally {
      enviando.current = false;
      setGuardando(false);
    }
  }

  if (!Number.isFinite(saldo) || saldo <= 0) {
    return null;
  }

  return (
    <section className="facturacion-panel">
      <h3>Registrar pago o abono</h3>

      <p className="facturacion-vacio">
        Saldo disponible: <strong>{dinero(saldo)}</strong>
      </p>

      {advertencia && (
        <p className="facturacion-alerta" role="alert">
          {advertencia}
        </p>
      )}

      {error && (
        <p className="facturacion-alerta" role="alert">
          {error}
        </p>
      )}

      <form
        onSubmit={evento => void registrar(evento)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <label htmlFor="pago-monto">
          Monto recibido (COP)
        </label>

        <input
          id="pago-monto"
          type="number"
          min="0.01"
          max={saldo}
          step="0.01"
          required
          value={monto}
          disabled={guardando || resultadoIncierto}
          onChange={evento => setMonto(evento.target.value)}
        />

        <label htmlFor="pago-medio">
          Medio de pago
        </label>

        <select
          id="pago-medio"
          value={tipoPago}
          disabled={guardando || resultadoIncierto}
          onChange={evento =>
            setTipoPago(evento.target.value as MedioPago)
          }
        >
          {medios.map(medio => (
            <option key={medio} value={medio}>
              {medio}
            </option>
          ))}
        </select>

        <label htmlFor="pago-referencia">
          Referencia (opcional)
        </label>

        <input
          id="pago-referencia"
          type="text"
          maxLength={100}
          value={referencia}
          disabled={guardando || resultadoIncierto}
          onChange={evento =>
            setReferencia(evento.target.value)
          }
          placeholder="Número de comprobante"
        />

        <button
          type="submit"
          className="facturacion-crear"
          disabled={guardando || resultadoIncierto}
        >
          {guardando
            ? 'Registrando pago...'
            : 'Confirmar pago recibido'}
        </button>

        {resultadoIncierto && (
          <button
            type="button"
            className="facturacion-actualizar"
            onClick={() => void onPagoRegistrado()}
          >
            Actualizar y revisar pagos
          </button>
        )}
      </form>
    </section>
  );
}
