import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';

interface HorarioMecanicoDB extends RowDataPacket {
  mecanicoId: string;
  mecanico: string;
  horarioId: string | null;
  diaSemana: number | null;
  horaInicioTurno: string | null;
  horaFinTurno: string | null;
  horaInicioAlmuerzo: string | null;
  horaFinAlmuerzo: string | null;
  horarioActivo: number | null;
}

export async function obtenerReporteHorariosMecanicos() {
  const [filas] = await pool.execute<HorarioMecanicoDB[]>(
    `SELECT
       u.id AS mecanicoId,
       u.name AS mecanico,
       h.id AS horarioId,
       h.diaSemana,
       TIME_FORMAT(h.horaInicioTurno, '%H:%i:%s')
         AS horaInicioTurno,
       TIME_FORMAT(h.horaFinTurno, '%H:%i:%s')
         AS horaFinTurno,
       TIME_FORMAT(h.horaInicioAlmuerzo, '%H:%i:%s')
         AS horaInicioAlmuerzo,
       TIME_FORMAT(h.horaFinAlmuerzo, '%H:%i:%s')
         AS horaFinAlmuerzo,
       h.activo AS horarioActivo
     FROM users u
     INNER JOIN roles r
       ON r.id = u.roleId
     LEFT JOIN horarios_mecanicos h
       ON h.mecanicoId = u.id
     WHERE r.nombre = 'Mecánico'
       AND r.activo = 1
       AND u.active = 1
     ORDER BY u.name, h.diaSemana`
  );

  const mecanicos = new Map<
    string,
    {
      mecanicoId: string;
      mecanico: string;
      horarios: {
        id: string;
        diaSemana: number;
        horaInicioTurno: string;
        horaFinTurno: string;
        horaInicioAlmuerzo: string | null;
        horaFinAlmuerzo: string | null;
        activo: boolean;
      }[];
    }
  >();

  for (const fila of filas) {
    let mecanico = mecanicos.get(fila.mecanicoId);

    if (!mecanico) {
      mecanico = {
        mecanicoId: fila.mecanicoId,
        mecanico: fila.mecanico,
        horarios: []
      };
      mecanicos.set(fila.mecanicoId, mecanico);
    }

    if (
      fila.horarioId !== null &&
      fila.diaSemana !== null &&
      fila.horaInicioTurno !== null &&
      fila.horaFinTurno !== null &&
      fila.horarioActivo !== null
    ) {
      mecanico.horarios.push({
        id: fila.horarioId,
        diaSemana: Number(fila.diaSemana),
        horaInicioTurno: fila.horaInicioTurno,
        horaFinTurno: fila.horaFinTurno,
        horaInicioAlmuerzo: fila.horaInicioAlmuerzo,
        horaFinAlmuerzo: fila.horaFinAlmuerzo,
        activo: Number(fila.horarioActivo) === 1
      });
    }
  }

  return [...mecanicos.values()];
}
