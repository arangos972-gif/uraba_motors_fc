
import { randomUUID } from 'node:crypto';
import { pool } from '../config/database.js';
import type { RowDataPacket } from 'mysql2';

interface MecanicoDB extends RowDataPacket {
  id: string;
  nombre: string;
}

interface HorarioDB extends RowDataPacket {
  id: string;
  mecanicoId: string;
  diaSemana: number;
  horaInicioTurno: string;
  horaFinTurno: string;
  horaInicioAlmuerzo: string | null;
  horaFinAlmuerzo: string | null;
  activo: number;
}

interface TallerDB extends RowDataPacket {
  diaSemana: number;
  horaApertura: string;
  horaCierre: string;
  esLaborable: number;
}

export interface DatosHorario {
  horaInicioTurno: string;
  horaFinTurno: string;
  horaInicioAlmuerzo: string | null;
  horaFinAlmuerzo: string | null;
  activo: boolean;
}

// Obtener los mecánicos activos.
export async function listarMecanicosActivos() {
  const [rows] = await pool.execute<MecanicoDB[]>(
    `SELECT
       u.id,
       u.name AS nombre
     FROM users u
     INNER JOIN roles r ON r.id = u.roleId
     WHERE r.nombre = 'Mecánico'
       AND r.activo = 1
       AND u.active = 1
     ORDER BY u.name`
  );

  return rows;
}

// Obtener los horarios de un mecánico.
export async function listarHorariosMecanico(
  mecanicoId: string
) {
  const [rows] = await pool.execute<HorarioDB[]>(
    `SELECT
       id,
       mecanicoId,
       diaSemana,
       horaInicioTurno,
       horaFinTurno,
       horaInicioAlmuerzo,
       horaFinAlmuerzo,
       activo
     FROM horarios_mecanicos
     WHERE mecanicoId = ?
     ORDER BY diaSemana`,
    [mecanicoId]
  );

  return rows;
}

// Convertir una hora a minutos.
function minutos(hora: string): number {
  const partes = hora.split(':').map(Number);
  return partes[0] * 60 + partes[1];
}

// Validar las horas del turno y del almuerzo.
export function validarDatosHorario(datos: DatosHorario) {
  const formato =
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

  if (
    !formato.test(datos.horaInicioTurno) ||
    !formato.test(datos.horaFinTurno)
  ) {
    throw new Error('HORAS_INVALIDAS');
  }

  const inicio = minutos(datos.horaInicioTurno);
  const fin = minutos(datos.horaFinTurno);

  if (inicio >= fin) {
    throw new Error('TURNO_INVALIDO');
  }

  const inicioAlmuerzo = datos.horaInicioAlmuerzo;
  const finAlmuerzo = datos.horaFinAlmuerzo;

  if ((inicioAlmuerzo === null) !== (finAlmuerzo === null)) {
    throw new Error('ALMUERZO_INCOMPLETO');
  }

  if (inicioAlmuerzo !== null && finAlmuerzo !== null) {
    if (
      !formato.test(inicioAlmuerzo) ||
      !formato.test(finAlmuerzo)
    ) {
      throw new Error('HORAS_INVALIDAS');
    }

    if (
      minutos(inicioAlmuerzo) < inicio ||
      minutos(finAlmuerzo) > fin ||
      minutos(inicioAlmuerzo) >= minutos(finAlmuerzo)
    ) {
      throw new Error('ALMUERZO_INVALIDO');
    }
  }
}

// Crear o actualizar el horario de un día.
export async function guardarHorarioMecanico(
  mecanicoId: string,
  diaSemana: number,
  datos: DatosHorario
) {
  validarDatosHorario(datos);

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [mecanicos] = await conexion.execute<MecanicoDB[]>(
      `SELECT u.id, u.name AS nombre
       FROM users u
       INNER JOIN roles r ON r.id = u.roleId
       WHERE u.id = ?
         AND u.active = 1
         AND r.nombre = 'Mecánico'
         AND r.activo = 1
       FOR UPDATE`,
      [mecanicoId]
    );

    if (mecanicos.length === 0) {
      throw new Error('MECANICO_INVALIDO');
    }

    const [horariosTaller] =
      await conexion.execute<TallerDB[]>(
        `SELECT
           diaSemana,
           horaApertura,
           horaCierre,
           esLaborable
         FROM horarios_taller
         WHERE diaSemana = ?`,
        [diaSemana]
      );

    if (horariosTaller.length !== 1) {
      throw new Error('HORARIO_TALLER_NO_CONFIGURADO');
    }

    const taller = horariosTaller[0];

    if (datos.activo) {
      if (taller.esLaborable !== 1) {
        throw new Error('TALLER_CERRADO');
      }

      if (
        minutos(datos.horaInicioTurno) <
          minutos(taller.horaApertura) ||
        minutos(datos.horaFinTurno) >
          minutos(taller.horaCierre)
      ) {
        throw new Error('FUERA_HORARIO_TALLER');
      }
    }

    const [existentes] =
      await conexion.execute<HorarioDB[]>(
        `SELECT id
         FROM horarios_mecanicos
         WHERE mecanicoId = ?
           AND diaSemana = ?
         FOR UPDATE`,
        [mecanicoId, diaSemana]
      );

    if (existentes.length > 1) {
      throw new Error('HORARIOS_DUPLICADOS');
    }

    const valores = [
      datos.horaInicioTurno,
      datos.horaFinTurno,
      datos.horaInicioAlmuerzo,
      datos.horaFinAlmuerzo,
      datos.activo ? 1 : 0
    ];

    let id: string;

    if (existentes.length === 1) {
      id = existentes[0].id;

      await conexion.execute(
        `UPDATE horarios_mecanicos
         SET
           horaInicioTurno = ?,
           horaFinTurno = ?,
           horaInicioAlmuerzo = ?,
           horaFinAlmuerzo = ?,
           activo = ?
         WHERE id = ?`,
        [...valores, id]
      );
    } else {
      id = randomUUID();

      await conexion.execute(
        `INSERT INTO horarios_mecanicos
         (
           id,
           mecanicoId,
           diaSemana,
           horaInicioTurno,
           horaFinTurno,
           horaInicioAlmuerzo,
           horaFinAlmuerzo,
           activo
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, mecanicoId, diaSemana, ...valores]
      );
    }

    await conexion.commit();

    return {
      id,
      mecanicoId,
      diaSemana,
      ...datos
    };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}
