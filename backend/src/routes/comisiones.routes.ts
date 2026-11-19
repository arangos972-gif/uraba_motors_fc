
/**
 * URABÁ MOTORS FC
 * Configuración de porcentajes individuales de mecánicos.
 *
 * IMPORTANTE:
 * Este router debe montarse después de los middlewares
 * de autenticación y permisos administrativos.
 */

import { randomUUID } from 'node:crypto';

import {
  Router,
  type Request,
  type Response
} from 'express';

import type {
  Pool,
  PoolConnection,
  RowDataPacket,
  ResultSetHeader
} from 'mysql2/promise';

type Fila = RowDataPacket & Record<string, unknown>;

class ErrorComision extends Error {
  constructor(
    public readonly status: number,
    mensaje: string
  ) {
    super(mensaje);
  }
}

// ========================================
// VALIDACIONES
// ========================================

function idValido(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      valor
    )
  );
}

function obtenerPorcentaje(valor: unknown): string {
  if (
    typeof valor !== 'string' &&
    typeof valor !== 'number'
  ) {
    throw new ErrorComision(
      400,
      'Debes indicar el porcentaje.'
    );
  }

  const texto = String(valor).trim();

  if (!/^(?:\d{1,3})(?:\.\d{1,2})?$/.test(texto)) {
    throw new ErrorComision(
      400,
      'El porcentaje debe tener máximo dos decimales.'
    );
  }

  const numero = Number(texto);

  if (
    !Number.isFinite(numero) ||
    numero < 0 ||
    numero > 100
  ) {
    throw new ErrorComision(
      400,
      'El porcentaje debe estar entre 0 y 100.'
    );
  }

  return numero.toFixed(2);
}

function usuarioAutenticado(res: Response): string {
  const id = (
    res.locals.usuario as
      | { id?: unknown }
      | undefined
  )?.id;

  if (!idValido(id)) {
    throw new ErrorComision(
      401,
      'Sesión no válida.'
    );
  }

  return id;
}

function fallo(
  res: Response,
  error: unknown
): void {
  if (error instanceof ErrorComision) {
    res.status(error.status).json({
      mensaje: error.message
    });
    return;
  }

  console.error(
    'Error en comisiones:',
    error
  );

  res.status(500).json({
    mensaje: 'Error interno al gestionar comisiones.'
  });
}

// ========================================
// ASIGNAR O CAMBIAR PORCENTAJE
// ========================================

async function establecerPorcentaje(
  pool: Pool,
  mecanicoId: string,
  porcentaje: string,
  administradorId: string
) {
  const cn: PoolConnection =
    await pool.getConnection();

  try {
    await cn.beginTransaction();

    // 1. Bloquear al usuario para evitar
    // cambios simultáneos de su porcentaje.

    const [usuarios] =
      await cn.execute<Fila[]>(
        `SELECT id, active
         FROM users
         WHERE id = ?
         FOR UPDATE`,
        [mecanicoId]
      );

    if (usuarios.length === 0) {
      throw new ErrorComision(
        404,
        'El usuario no existe.'
      );
    }

    if (Number(usuarios[0].active) !== 1) {
      throw new ErrorComision(
        409,
        'El usuario está inactivo.'
      );
    }

    // 2. Obtener la fecha desde MySQL.

    const [reloj] =
      await cn.query<Fila[]>(
        `SELECT DATE_FORMAT(
           NOW(),
           '%Y-%m-%d %H:%i:%s'
         ) AS ahora`
      );

    const ahora = String(reloj[0].ahora);

    // 3. Evitar sobrescribir porcentajes
    // programados para fechas futuras.

    const [futuras] =
      await cn.execute<Fila[]>(
        `SELECT id
         FROM mecanicos_comisiones
         WHERE mecanicoId = ?
           AND vigenteDesde > ?
         LIMIT 1`,
        [mecanicoId, ahora]
      );

    if (futuras.length > 0) {
      throw new ErrorComision(
        409,
        'El mecánico tiene una vigencia futura. Revisa su historial antes de modificarlo.'
      );
    }

    // 4. Consultar porcentaje vigente.

    const [actuales] =
      await cn.execute<Fila[]>(
        `SELECT id, porcentaje
         FROM mecanicos_comisiones
         WHERE mecanicoId = ?
           AND vigenteDesde <= ?
           AND (
             vigenteHasta IS NULL
             OR vigenteHasta > ?
           )
         FOR UPDATE`,
        [mecanicoId, ahora, ahora]
      );

    if (actuales.length > 1) {
      throw new ErrorComision(
        409,
        'Existen porcentajes vigentes superpuestos. Requiere revisión.'
      );
    }

    // Si no cambió, no generamos otro registro.

    if (
      actuales.length === 1 &&
      Number(actuales[0].porcentaje) ===
        Number(porcentaje)
    ) {
      await cn.commit();

      return {
        actualizado: false,
        mensaje:
          'El porcentaje ya estaba vigente.'
      };
    }

    // 5. Cerrar la configuración anterior.

    if (actuales.length === 1) {
      const [cierre] =
        await cn.execute<ResultSetHeader>(
          `UPDATE mecanicos_comisiones
           SET vigenteHasta = ?
           WHERE id = ?
             AND vigenteDesde < ?
             AND vigenteHasta IS NULL`,
          [
            ahora,
            String(actuales[0].id),
            ahora
          ]
        );

      if (cierre.affectedRows !== 1) {
        throw new ErrorComision(
          409,
          'Espera un segundo antes de cambiar de nuevo el porcentaje.'
        );
      }
    }

    // 6. Impedir dos configuraciones
    // con la misma fecha de inicio.

    const [mismoInicio] =
      await cn.execute<Fila[]>(
        `SELECT id
         FROM mecanicos_comisiones
         WHERE mecanicoId = ?
           AND vigenteDesde = ?
         LIMIT 1`,
        [mecanicoId, ahora]
      );

    if (mismoInicio.length > 0) {
      throw new ErrorComision(
        409,
        'Ya existe un cambio de porcentaje en este segundo. Reintenta después.'
      );
    }

    // 7. Crear la configuración nueva.

    const id = randomUUID();

    await cn.execute(
      `INSERT INTO mecanicos_comisiones (
         id,
         mecanicoId,
         porcentaje,
         vigenteDesde,
         vigenteHasta,
         creadoPorId
       )
       VALUES (?, ?, ?, ?, NULL, ?)`,
      [
        id,
        mecanicoId,
        porcentaje,
        ahora,
        administradorId
      ]
    );

    await cn.commit();

    return {
      actualizado: true,
      id,
      mecanicoId,
      porcentaje,
      vigenteDesde: ahora
    };

  } catch (error) {
    await cn.rollback();
    throw error;

  } finally {
    cn.release();
  }
}

// ========================================
// RUTAS DE COMISIONES
// ========================================

export function crearComisionesRouter(
  pool: Pool
): Router {
  const router = Router();

  // --------------------------------------
  // GET /api/comisiones/mecanicos
  // --------------------------------------
  // Mecánicos con órdenes o porcentajes.
  // Los mecánicos nuevos sin órdenes
  // necesitarán el filtro por rol real.

  router.get(
    '/mecanicos',
    async (
      _req: Request,
      res: Response
    ) => {
      try {
        usuarioAutenticado(res);

        const [filas] =
          await pool.execute<Fila[]>(
            `SELECT
               u.id,
               u.name,
               u.email,
               u.active,

               (
                 SELECT COUNT(*)
                 FROM servicios s
                 WHERE s.mecanicoId = u.id
               ) AS totalOrdenes,

               (
                 SELECT mc.porcentaje
                 FROM mecanicos_comisiones mc
                 WHERE mc.mecanicoId = u.id
                   AND mc.vigenteDesde <= NOW()
                   AND (
                     mc.vigenteHasta IS NULL
                     OR mc.vigenteHasta > NOW()
                   )
                 ORDER BY mc.vigenteDesde DESC
                 LIMIT 1
               ) AS porcentajeActual

             FROM users u

             WHERE EXISTS (
               SELECT 1
               FROM servicios s
               WHERE s.mecanicoId = u.id
             )
             OR EXISTS (
               SELECT 1
               FROM mecanicos_comisiones mc
               WHERE mc.mecanicoId = u.id
             )

             ORDER BY u.name`
          );

        res.json({
          mecanicos: filas
        });

      } catch (error) {
        fallo(res, error);
      }
    }
  );

  // --------------------------------------
  // GET /api/comisiones/mecanicos/:id/historial
  // --------------------------------------

  router.get(
    '/mecanicos/:id/historial',
    async (
      req: Request,
      res: Response
    ) => {
      try {
        usuarioAutenticado(res);

        const mecanicoId = req.params.id;

        if (!idValido(mecanicoId)) {
          throw new ErrorComision(
            400,
            'ID de mecánico inválido.'
          );
        }

        const [filas] =
          await pool.execute<Fila[]>(
            `SELECT
               id,
               mecanicoId,
               porcentaje,
               vigenteDesde,
               vigenteHasta,
               creadoPorId,
               created
             FROM mecanicos_comisiones
             WHERE mecanicoId = ?
             ORDER BY vigenteDesde DESC`,
            [mecanicoId]
          );

        res.json({
          historial: filas
        });

      } catch (error) {
        fallo(res, error);
      }
    }
  );

  // --------------------------------------
  // PUT /api/comisiones/mecanicos/:id/porcentaje
  // --------------------------------------

  router.put(
    '/mecanicos/:id/porcentaje',
    async (
      req: Request,
      res: Response
    ) => {
      try {
        const administradorId =
          usuarioAutenticado(res);

        const mecanicoId = req.params.id;

        if (!idValido(mecanicoId)) {
          throw new ErrorComision(
            400,
            'ID de mecánico inválido.'
          );
        }

        const porcentaje =
          obtenerPorcentaje(
            req.body?.porcentaje
          );

        const resultado =
          await establecerPorcentaje(
            pool,
            mecanicoId,
            porcentaje,
            administradorId
          );

        res.json(resultado);

      } catch (error) {
        fallo(res, error);
      }
    }
  );

  return router;
}
