
import { randomUUID } from 'node:crypto';
import { pool } from '../config/database.js';
import type { RowDataPacket } from 'mysql2';

interface MecanicoDB extends RowDataPacket {
  id: string;
}

interface BloqueoDB extends RowDataPacket {
  id: string;
  mecanicoId: string;
  mecanico: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  tipo: string;
}

interface IdDB extends RowDataPacket {
  id: string;
}

export interface DatosAusencia {
  mecanicoId: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  tipo: string;
}

type ConexionAusencias =
  Awaited<ReturnType<typeof pool.getConnection>>;

// Registrar un movimiento de ausencias dentro
// de la misma transacción de MySQL.
async function registrarAuditoriaAusencia(
  conexion: ConexionAusencias,
  administradorId: string,
  accion: string,
  detalles: Record<string, unknown>
) {
  await conexion.execute(
    `INSERT INTO auditoria_logs (
       id,
       usuarioId,
       accion,
       modulo,
       detalles,
       ipAddress
     )
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      administradorId,
      accion,
      'AUSENCIAS',
      JSON.stringify(detalles),
      null
    ]
  );
}

// Consultar las ausencias registradas.
// DATE_FORMAT evita cambios de hora por zona horaria.
export async function obtenerAusencias() {
  const [rows] = await pool.execute<BloqueoDB[]>(
    `SELECT
       b.id,
       b.mecanicoId,
       u.name AS mecanico,
       DATE_FORMAT(
         b.fechaInicio, '%Y-%m-%dT%H:%i'
       ) AS fechaInicio,
       DATE_FORMAT(
         b.fechaFin, '%Y-%m-%dT%H:%i'
       ) AS fechaFin,
       b.motivo,
       b.tipo
     FROM bloqueos_horarios b
     INNER JOIN users u ON u.id = b.mecanicoId
     ORDER BY b.fechaInicio DESC`
  );

  return rows;
}

// Comprobar que las fechas son reales y tienen
// el formato YYYY-MM-DDTHH:mm.
function fechaValida(fecha: string): boolean {
  const coincidencia =
    /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/
      .exec(fecha);

  if (!coincidencia) return false;

  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const dia = Number(coincidencia[3]);

  const comprobacion = new Date(
    Date.UTC(anio, mes - 1, dia)
  );

  return (
    anio >= 1900 &&
    anio <= 2100 &&
    comprobacion.getUTCFullYear() === anio &&
    comprobacion.getUTCMonth() === mes - 1 &&
    comprobacion.getUTCDate() === dia
  );
}

export function validarAusencia(datos: DatosAusencia) {
  if (
    !fechaValida(datos.fechaInicio) ||
    !fechaValida(datos.fechaFin)
  ) {
    throw new Error('FECHAS_INVALIDAS');
  }

  // Al tener el mismo formato, las cadenas
  // se pueden comparar cronológicamente.
  if (datos.fechaInicio >= datos.fechaFin) {
    throw new Error('PERIODO_INVALIDO');
  }

  if (
    !datos.motivo.trim() ||
    datos.motivo.length > 255
  ) {
    throw new Error('MOTIVO_INVALIDO');
  }

  const tiposPermitidos = [
    'VACACIONES',
    'PERMISO',
    'INCAPACIDAD',
    'OTRO'
  ];

  if (!tiposPermitidos.includes(datos.tipo)) {
    throw new Error('TIPO_INVALIDO');
  }
}

// Convertir al formato DATETIME de MySQL.
function fechaMySQL(fecha: string) {
  return `${fecha.replace('T', ' ')}:00`;
}

// Registrar o modificar una ausencia.
export async function guardarAusencia(
  datos: DatosAusencia,
  administradorId: string,
  id?: string
) {
  validarAusencia(datos);

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // Bloquear la fila del mecánico para coordinar
    // cambios simultáneos de sus ausencias.
    const [mecanicos] = await conexion.execute<MecanicoDB[]>(
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

    if (id) {
      const [actuales] = await conexion.execute<IdDB[]>(
        `SELECT id
         FROM bloqueos_horarios
         WHERE id = ?
         FOR UPDATE`,
        [id]
      );

      if (actuales.length === 0) {
        throw new Error('AUSENCIA_NO_EXISTE');
      }
    }

    const inicio = fechaMySQL(datos.fechaInicio);
    const fin = fechaMySQL(datos.fechaFin);

    // Evitar dos bloqueos superpuestos
    // para el mismo mecánico.
    const [conflictos] = await conexion.execute<IdDB[]>(
      `SELECT id
       FROM bloqueos_horarios
       WHERE mecanicoId = ?
         AND fechaInicio < ?
         AND fechaFin > ?
         AND (? IS NULL OR id <> ?)
       LIMIT 1`,
      [
        datos.mecanicoId,
        fin,
        inicio,
        id ?? null,
        id ?? null
      ]
    );

    if (conflictos.length > 0) {
      throw new Error('AUSENCIA_SUPERPUESTA');
    }

    const ausenciaId = id ?? randomUUID();

    if (id) {
      await conexion.execute(
        `UPDATE bloqueos_horarios
         SET
           mecanicoId = ?,
           fechaInicio = ?,
           fechaFin = ?,
           motivo = ?,
           tipo = ?
         WHERE id = ?`,
        [
          datos.mecanicoId,
          inicio,
          fin,
          datos.motivo,
          datos.tipo,
          ausenciaId
        ]
      );
    } else {
      await conexion.execute(
        `INSERT INTO bloqueos_horarios
         (
           id,
           mecanicoId,
           fechaInicio,
           fechaFin,
           motivo,
           tipo
         )
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          ausenciaId,
          datos.mecanicoId,
          inicio,
          fin,
          datos.motivo,
          datos.tipo
        ]
      );
    }

    await registrarAuditoriaAusencia(
  conexion,
  administradorId,
  id ? 'EDITAR_AUSENCIA' : 'CREAR_AUSENCIA',
  {
    ausenciaId,
    mecanicoId: datos.mecanicoId,
    fechaInicio: datos.fechaInicio,
    fechaFin: datos.fechaFin,
    tipo: datos.tipo
  }
);

await conexion.commit();

return {
  id: ausenciaId,
  ...datos
};

    return {
      id: ausenciaId,
      ...datos
    };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// Eliminar una ausencia registrada por error.
export async function eliminarAusencia(
  id: string,
  administradorId: string
) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [registros] = await conexion.execute<IdDB[]>(
      `SELECT id
       FROM bloqueos_horarios
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );

    if (registros.length === 0) {
      throw new Error('AUSENCIA_NO_EXISTE');
    }

    
await conexion.execute(
  `DELETE FROM bloqueos_horarios
   WHERE id = ?`,
  [id]
);

await registrarAuditoriaAusencia(
  conexion,
  administradorId,
  'ELIMINAR_AUSENCIA',
  {
    ausenciaId: id
  }
);

await conexion.commit();


    await conexion.commit();
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}
