
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';

// ========================================
// TIPOS DE DATOS
// ========================================

interface CitaDB extends RowDataPacket {
  id: string;
  clienteId: string;
  clienteNombre: string;
  motoId: string;
  motoPlaca: string;
  motoMarca: string;
  motoModelo: string;
  mecanicoId: string;
  mecanicoNombre: string;
  fecha: string;
  hora: string;
  duracionMinutos: number;
  tipoServicio: string;
  descripcion: string | null;
  estado: string;
}

interface MecanicoDB extends RowDataPacket {
  id: string;
}

interface MotoDB extends RowDataPacket {
  id: string;
}

interface HorarioTallerDB extends RowDataPacket {
  horaApertura: string;
  horaCierre: string;
  esLaborable: number;
}

interface HorarioMecanicoDB extends RowDataPacket {
  horaInicioTurno: string;
  horaFinTurno: string;
  horaInicioAlmuerzo: string | null;
  horaFinAlmuerzo: string | null;
  activo: number;
}

interface ConflictoDB extends RowDataPacket {
  id: string;
}

export interface NuevaCita {
  clienteId: string;
  motoId: string;
  mecanicoId: string;
  fecha: string;
  hora: string;
  duracionMinutos: number;
  tipoServicio: string;
  descripcion?: string | null;
}

// ========================================
// FUNCIONES DE FECHAS Y HORAS
// ========================================

function fechaValida(fecha: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);

  if (!partes) return false;

  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);

  if (anio < 1900 || anio > 2100) return false;

  const comprobacion = new Date(
    Date.UTC(anio, mes - 1, dia)
  );

  return (
    comprobacion.getUTCFullYear() === anio &&
    comprobacion.getUTCMonth() === mes - 1 &&
    comprobacion.getUTCDate() === dia
  );
}

function horaValida(hora: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
}

function minutos(hora: string): number {
  const [horas, mins] = hora.split(':').map(Number);

  return horas * 60 + mins;
}

function formatearFechaHora(
  fecha: string,
  totalMinutos: number
): string {
  const hora = Math.floor(totalMinutos / 60)
    .toString()
    .padStart(2, '0');

  const minuto = (totalMinutos % 60)
    .toString()
    .padStart(2, '0');

  return `${fecha} ${hora}:${minuto}:00`;
}

function diaSemana(fecha: string): number {
  // getUTCDay(): domingo = 0.
  // Nuestra base de datos: lunes = 1, domingo = 7.
  const fechaUTC = new Date(`${fecha}T12:00:00Z`);
  const dia = fechaUTC.getUTCDay();

  return dia === 0 ? 7 : dia;
}

function seSuperponen(
  inicioA: number,
  finA: number,
  inicioB: number,
  finB: number
): boolean {
  return inicioA < finB && finA > inicioB;
}

// ========================================
// VALIDAR DATOS DE LA CITA
// ========================================

export function validarDatosCita(datos: NuevaCita) {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (
    !uuid.test(datos.clienteId) ||
    !uuid.test(datos.motoId) ||
    !uuid.test(datos.mecanicoId)
  ) {
    throw new Error('IDENTIFICADORES_INVALIDOS');
  }

  if (
    !fechaValida(datos.fecha) ||
    !horaValida(datos.hora)
  ) {
    throw new Error('FECHA_HORA_INVALIDA');
  }

  if (
    !Number.isInteger(datos.duracionMinutos) ||
    datos.duracionMinutos < 15 ||
    datos.duracionMinutos > 600
  ) {
    throw new Error('DURACION_INVALIDA');
  }

  if (
    !datos.tipoServicio.trim() ||
    datos.tipoServicio.length > 100
  ) {
    throw new Error('SERVICIO_INVALIDO');
  }

  if (
    datos.descripcion != null &&
    typeof datos.descripcion !== 'string'
  ) {
    throw new Error('DESCRIPCION_INVALIDA');
  }

  const inicio = minutos(datos.hora);
  const fin = inicio + datos.duracionMinutos;

  if (fin > 24 * 60) {
    throw new Error('CITA_FUERA_DEL_DIA');
  }

  // Evitar programar citas en fechas pasadas.
  // Se interpreta la hora local del taller (Colombia).
  const ahora = new Date();

  const [anio, mes, dia] = datos.fecha.split('-').map(Number);
  const [hora, minuto] = datos.hora.split(':').map(Number);

  const inicioUTC = Date.UTC(
    anio,
    mes - 1,
    dia,
    hora + 5,
    minuto
  );

  if (inicioUTC <= ahora.getTime()) {
    throw new Error('CITA_EN_EL_PASADO');
  }
}

// ========================================
// LISTAR CITAS
// ========================================

export async function obtenerCitas() {
  const [citas] = await pool.execute<CitaDB[]>(
    `SELECT
       c.id,
       c.clienteId,
       cl.nombre AS clienteNombre,
       c.motoId,
       m.placa AS motoPlaca,
       m.marca AS motoMarca,
       m.modelo AS motoModelo,
       c.mecanicoId,
       u.name AS mecanicoNombre,
       DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
       TIME_FORMAT(c.hora, '%H:%i') AS hora,
       c.duracionMinutos,
       c.tipoServicio,
       c.descripcion,
       c.estado
     FROM citas c
     INNER JOIN clientes cl ON cl.id = c.clienteId
     INNER JOIN motos m ON m.id = c.motoId
     INNER JOIN users u ON u.id = c.mecanicoId
     ORDER BY c.fecha DESC, c.hora DESC
     LIMIT 500`
  );

  return citas;
}

// ========================================
// CREAR CITA CON VALIDACIONES
// ========================================

export async function crearCita(datos: NuevaCita) {
  validarDatosCita(datos);

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // 1. Verificar mecánico activo.
    // FOR UPDATE serializa reservas simultáneas
    // para el mismo mecánico.
    const [mecanicos] =
      await conexion.execute<MecanicoDB[]>(
        `SELECT u.id
         FROM users u
         INNER JOIN roles r ON r.id = u.roleId
         WHERE u.id = ?
           AND u.active = 1
           AND r.nombre = 'Mecánico'
           AND r.activo = 1
         FOR UPDATE`,
        [datos.mecanicoId]
      );

    if (mecanicos.length === 0) {
      throw new Error('MECANICO_INVALIDO');
    }

    // 2. Comprobar que la moto pertenece al cliente.
    const [motos] = await conexion.execute<MotoDB[]>(
      `SELECT m.id
       FROM motos m
       INNER JOIN clientes c
         ON c.id = m.clienteId
       WHERE m.id = ?
         AND c.id = ?
       LIMIT 1`,
      [datos.motoId, datos.clienteId]
    );

    if (motos.length === 0) {
      throw new Error('MOTO_CLIENTE_INVALIDOS');
    }

    const dia = diaSemana(datos.fecha);

    const inicio = minutos(datos.hora);
    const fin = inicio + datos.duracionMinutos;

    // 3. Comprobar horario general del taller.
    const [horariosTaller] =
      await conexion.execute<HorarioTallerDB[]>(
        `SELECT
           horaApertura,
           horaCierre,
           esLaborable
         FROM horarios_taller
         WHERE diaSemana = ?
         LIMIT 1`,
        [dia]
      );

    if (horariosTaller.length === 0) {
      throw new Error('HORARIO_TALLER_NO_CONFIGURADO');
    }

    const taller = horariosTaller[0];

    if (Number(taller.esLaborable) !== 1) {
      throw new Error('TALLER_CERRADO');
    }

    if (
      inicio < minutos(taller.horaApertura) ||
      fin > minutos(taller.horaCierre)
    ) {
      throw new Error('FUERA_HORARIO_TALLER');
    }

    // 4. Consultar turno del mecánico.
    const [horariosMecanico] =
      await conexion.execute<HorarioMecanicoDB[]>(
        `SELECT
           horaInicioTurno,
           horaFinTurno,
           horaInicioAlmuerzo,
           horaFinAlmuerzo,
           activo
         FROM horarios_mecanicos
         WHERE mecanicoId = ?
           AND diaSemana = ?
         LIMIT 1`,
        [datos.mecanicoId, dia]
      );

    if (
      horariosMecanico.length === 0 ||
      Number(horariosMecanico[0].activo) !== 1
    ) {
      throw new Error('MECANICO_NO_TRABAJA');
    }

    const turno = horariosMecanico[0];

    if (
      inicio < minutos(turno.horaInicioTurno) ||
      fin > minutos(turno.horaFinTurno)
    ) {
      throw new Error('FUERA_TURNO_MECANICO');
    }

    // 5. Impedir citas durante el almuerzo.
    if (
      turno.horaInicioAlmuerzo &&
      turno.horaFinAlmuerzo
    ) {
      const inicioAlmuerzo =
        minutos(turno.horaInicioAlmuerzo);

      const finAlmuerzo =
        minutos(turno.horaFinAlmuerzo);

      if (
        seSuperponen(
          inicio,
          fin,
          inicioAlmuerzo,
          finAlmuerzo
        )
      ) {
        throw new Error('CONFLICTO_ALMUERZO');
      }
    }

    // 6. Verificar ausencias y bloqueos.
    const fechaHoraInicio = formatearFechaHora(
      datos.fecha,
      inicio
    );

    const fechaHoraFin = formatearFechaHora(
      datos.fecha,
      fin
    );

    const [bloqueos] =
      await conexion.execute<ConflictoDB[]>(
        `SELECT id
         FROM bloqueos_horarios
         WHERE mecanicoId = ?
           AND fechaInicio < ?
           AND fechaFin > ?
         LIMIT 1`,
        [
          datos.mecanicoId,
          fechaHoraFin,
          fechaHoraInicio
        ]
      );

    if (bloqueos.length > 0) {
      throw new Error('MECANICO_AUSENTE');
    }

    // 7. Comprobar citas superpuestas.
    // Las canceladas y finalizadas no bloquean
    // nuevos horarios.
    const [conflictos] =
      await conexion.execute<ConflictoDB[]>(
        `SELECT id
         FROM citas
         WHERE mecanicoId = ?
           AND fecha = ?
           AND estado IN (
             'PENDIENTE',
             'CONFIRMADA',
             'EN_PROCESO'
           )
           AND TIME_TO_SEC(hora) < ?
           AND (
             TIME_TO_SEC(hora) +
             duracionMinutos * 60
           ) > ?
         LIMIT 1`,
        [
          datos.mecanicoId,
          datos.fecha,
          fin * 60,
          inicio * 60
        ]
      );

    if (conflictos.length > 0) {
      throw new Error('CITA_SUPERPUESTA');
    }

    // 8. Guardar la cita.
    const id = randomUUID();

    await conexion.execute(
      `INSERT INTO citas (
         id,
         clienteId,
         motoId,
         fecha,
         hora,
         duracionMinutos,
         tipoServicio,
         descripcion,
         mecanicoId,
         estado
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
      [
        id,
        datos.clienteId,
        datos.motoId,
        datos.fecha,
        `${datos.hora}:00`,
        datos.duracionMinutos,
        datos.tipoServicio.trim(),
        datos.descripcion?.trim() || null,
        datos.mecanicoId
      ]
    );

    await conexion.commit();

    return {
      id,
      ...datos,
      estado: 'PENDIENTE'
    };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}
