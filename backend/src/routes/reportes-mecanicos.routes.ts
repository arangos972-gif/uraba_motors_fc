
import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';
import {
  verificarToken
} from '../middlewares/auth.middleware.js';
import {
  verificarPermiso
} from '../middlewares/permissions.middleware.js';

const router = Router();

router.use(verificarToken);
router.use(verificarPermiso('reportes.ver'));

interface ProductividadDB extends RowDataPacket {
  mecanicoId: string;
  mecanico: string;
  ordenesCompletadas: number | string;
  manoObraRealizada: number | string;
  segundosTrabajados: number | string;
}

interface RepuestoProductividadDB extends RowDataPacket {
  ordenId: string;
  repuestoId: string;
  repuesto: string;
  cantidad: number | string;
  ingresos: number | string | null;
  costoTotalPMP: number | string;
  precioNoDisponible: number | string;
}

function fechaValida(valor: unknown): valor is string {
  if (
    typeof valor !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor)
  ) {
    return false;
  }

  const [anio, mes, dia] =
    valor.split('-').map(Number);

  const fecha = new Date(
    Date.UTC(anio, mes - 1, dia)
  );

  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

// GET /api/reportes/mecanicos/productividad
// Ejemplo: ?desde=2026-11-01&hasta=2026-11-30

router.get('/productividad', async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    if (
      !fechaValida(desde) ||
      !fechaValida(hasta) ||
      desde > hasta
    ) {
      res.status(400).json({
        mensaje:
          'Indica fechas válidas. El inicio no puede superar el fin.'
      });
      return;
    }

    const [filas] =
      await pool.execute<ProductividadDB[]>(
        `SELECT
           u.id AS mecanicoId,
           u.name AS mecanico,

           COUNT(s.id) AS ordenesCompletadas,

           COALESCE(
             SUM(COALESCE(mo.totalManoObra, 0)),
             0
           ) AS manoObraRealizada,

           COALESCE(
             SUM(COALESCE(t.segundos, 0)),
             0
           ) AS segundosTrabajados

         FROM servicios s

         INNER JOIN users u
           ON u.id = s.mecanicoId

         LEFT JOIN (
           SELECT
             sd.servicioId,
             SUM(sd.precioAplicado)
               AS totalManoObra
           FROM servicios_detalles sd
           WHERE sd.estado = 'COMPLETADO'
           GROUP BY sd.servicioId
         ) mo
           ON mo.servicioId = s.id

         LEFT JOIN (
           SELECT
             st.servicioId,
             SUM(
               GREATEST(
                 TIMESTAMPDIFF(
                   SECOND,
                   st.inicio,
                   st.fin
                 ),
                 0
               )
             ) AS segundos
           FROM servicios_tiempos st
           WHERE st.fin IS NOT NULL
           GROUP BY st.servicioId
         ) t
           ON t.servicioId = s.id

         WHERE s.estado IN (
           'COMPLETADO',
           'ENTREGADO'
         )
           AND s.tiempoFin >= ?
           AND s.tiempoFin <
             DATE_ADD(?, INTERVAL 1 DAY)

         GROUP BY u.id, u.name
         ORDER BY manoObraRealizada DESC,
                  u.name ASC`,
        [desde, hasta]
      );

    const mecanicos = filas.map(fila => {
      const segundos =
        Number(fila.segundosTrabajados);

      return {
        mecanicoId: fila.mecanicoId,
        mecanico: fila.mecanico,

        ordenesCompletadas:
          Number(fila.ordenesCompletadas),

        manoObraRealizada:
          Number(fila.manoObraRealizada),

        horasEfectivas:
          Math.round(segundos / 36) / 100
      };
    });

    const resumen = mecanicos.reduce(
      (acumulado, mecanico) => ({
        ordenesCompletadas:
          acumulado.ordenesCompletadas +
          mecanico.ordenesCompletadas,

        manoObraRealizada:
          acumulado.manoObraRealizada +
          mecanico.manoObraRealizada,

        horasEfectivas:
          acumulado.horasEfectivas +
          mecanico.horasEfectivas
      }),
      {
        ordenesCompletadas: 0,
        manoObraRealizada: 0,
        horasEfectivas: 0
      }
    );

    res.json({
      desde,
      hasta,
      resumen,
      mecanicos
    });

  } catch (error) {
    console.error(
      'Error en reporte de productividad:',
      error
    );

    res.status(500).json({
      mensaje:
        'No fue posible consultar la productividad.'
    });
  }
});

router.get('/detalle', async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    if (
      !fechaValida(desde) ||
      !fechaValida(hasta) ||
      desde > hasta
    ) {
      res.status(400).json({
        mensaje: 'Indica un período de fechas válido.'
      });
      return;
    }

    const [filas] = await pool.execute<RowDataPacket[]>(
      `SELECT
         s.id AS ordenId,
         u.name AS mecanico,
         m.placa,

         DATE_FORMAT(
           s.tiempoFin,
           '%Y-%m-%d %H:%i:%s'
         ) AS fechaFinalizacion,

         sd.id AS trabajoId,
         sd.descripcion AS trabajoDescripcion,
         sd.precioAplicado,
         cg.valorComision,

         COALESCE(t.segundos, 0) AS segundos

       FROM servicios s

       INNER JOIN users u
         ON u.id = s.mecanicoId

       INNER JOIN motos m
         ON m.id = s.motoId

       LEFT JOIN servicios_detalles sd
         ON sd.servicioId = s.id
         AND sd.estado = 'COMPLETADO'

       LEFT JOIN comisiones_generadas cg
         ON cg.servicioDetalleId = sd.id

       LEFT JOIN (
         SELECT
           servicioId,
           COALESCE(
             SUM(
               GREATEST(
                 TIMESTAMPDIFF(SECOND, inicio, fin),
                 0
               )
             ),
             0
           ) AS segundos
         FROM servicios_tiempos
         WHERE fin IS NOT NULL
         GROUP BY servicioId
       ) t
         ON t.servicioId = s.id

       WHERE s.estado IN (
         'COMPLETADO',
         'ENTREGADO'
       )
         AND s.tiempoFin >= ?
         AND s.tiempoFin <
           DATE_ADD(?, INTERVAL 1 DAY)

       ORDER BY
         s.tiempoFin DESC,
         s.id,
         sd.created,
         sd.id

       LIMIT 2001`,
      [desde, hasta]
    );

    // Evitar mostrar informes incompletos.
    if (filas.length > 2000) {
      res.status(422).json({
        mensaje:
          'El período contiene demasiados trabajos. Reduce el intervalo de fechas.'
      });
      return;
    }

    const [repuestosFilas] =
      await pool.execute<RepuestoProductividadDB[]>(
        `SELECT
           s.id AS ordenId,
           sr.repuestoId,
           r.nombre AS repuesto,
           SUM(sr.cantidad) AS cantidad,
           SUM(
             sr.cantidad * sr.precioUnitarioVenta
           ) AS ingresos,
           SUM(
             sr.cantidad * sr.costoUnitarioPMP
           ) AS costoTotalPMP,
           MAX(
             sr.precioUnitarioVenta IS NULL
           ) AS precioNoDisponible
         FROM servicios s
         INNER JOIN servicio_repuestos sr
           ON sr.servicioId = s.id
         INNER JOIN repuestos r
           ON r.id = sr.repuestoId
         WHERE s.estado IN (
           'COMPLETADO',
           'ENTREGADO'
         )
           AND s.tiempoFin >= ?
           AND s.tiempoFin <
             DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY s.id, sr.repuestoId, r.nombre
         ORDER BY s.tiempoFin DESC, s.id, r.nombre
         LIMIT 20001`,
        [desde, hasta]
      );

    if (repuestosFilas.length > 20000) {
      res.status(422).json({
        mensaje:
          'El período contiene demasiados repuestos. Reduce el intervalo de fechas.'
      });
      return;
    }

    type Trabajo = {
      id: string;
      descripcion: string;
      valorManoObra: number;
      comisionGenerada: number | null;
    };

    type RepuestoOrden = {
      repuestoId: string;
      repuesto: string;
      cantidad: number;
      ingresos: number | null;
      costoTotalPMP: number;
      margenBruto: number | null;
    };

    type Orden = {
      ordenId: string;
      mecanico: string;
      placa: string;
      fechaFinalizacion: string;
      horasEfectivas: number;
      totalManoObra: number;
      totalComisionRegistrada: number;
      totalIngresosRepuestos: number | null;
      totalCostoRepuestos: number;
      margenBrutoRepuestos: number | null;
      unidadesRepuestos: number;
      trabajos: Trabajo[];
      repuestos: RepuestoOrden[];
    };

    const repuestosPorOrden =
      new Map<string, RepuestoOrden[]>();

    for (const fila of repuestosFilas) {
      const cantidad = Number(fila.cantidad);
      const costoTotalPMP = Number(fila.costoTotalPMP);
      const precioNoDisponible =
        Number(fila.precioNoDisponible) === 1;
      const ingresos =
        precioNoDisponible || fila.ingresos === null
          ? null
          : Number(fila.ingresos);

      if (
        !Number.isSafeInteger(cantidad) ||
        cantidad <= 0 ||
        !Number.isFinite(costoTotalPMP) ||
        costoTotalPMP < 0 ||
        (
          ingresos !== null &&
          (!Number.isFinite(ingresos) || ingresos < 0)
        )
      ) {
        throw new Error(
          'DATOS_REPUESTO_PRODUCTIVIDAD_INVALIDOS'
        );
      }

      const repuesto: RepuestoOrden = {
        repuestoId: fila.repuestoId,
        repuesto: fila.repuesto,
        cantidad,
        ingresos,
        costoTotalPMP,
        margenBruto:
          ingresos === null
            ? null
            : Math.round((ingresos - costoTotalPMP) * 100) / 100
      };

      const lista =
        repuestosPorOrden.get(fila.ordenId) ?? [];
      lista.push(repuesto);
      repuestosPorOrden.set(fila.ordenId, lista);
    }

    const porOrden = new Map<string, Orden>();

    for (const fila of filas) {
      const id = String(fila.ordenId);

      let orden = porOrden.get(id);

      if (!orden) {
        orden = {
          ordenId: id,
          mecanico: String(fila.mecanico),
          placa: String(fila.placa),
          fechaFinalizacion: String(
            fila.fechaFinalizacion
          ),
          horasEfectivas:
            Math.round(Number(fila.segundos) / 36) / 100,
          totalManoObra: 0,
          totalComisionRegistrada: 0,
          totalIngresosRepuestos: 0,
          totalCostoRepuestos: 0,
          margenBrutoRepuestos: 0,
          unidadesRepuestos: 0,
          trabajos: [],
          repuestos:
            repuestosPorOrden.get(id) ?? []
        };

        for (const repuesto of orden.repuestos) {
          orden.unidadesRepuestos += repuesto.cantidad;
          orden.totalCostoRepuestos =
            Math.round(
              (
                orden.totalCostoRepuestos +
                repuesto.costoTotalPMP
              ) * 100
            ) / 100;

          if (repuesto.ingresos === null) {
            orden.totalIngresosRepuestos = null;
            orden.margenBrutoRepuestos = null;
            continue;
          }

          if (orden.totalIngresosRepuestos !== null) {
            orden.totalIngresosRepuestos =
              Math.round(
                (
                  orden.totalIngresosRepuestos +
                  repuesto.ingresos
                ) * 100
              ) / 100;
          }

          if (orden.margenBrutoRepuestos !== null) {
            orden.margenBrutoRepuestos +=
              repuesto.margenBruto ?? 0;
            orden.margenBrutoRepuestos =
              Math.round(
                orden.margenBrutoRepuestos * 100
              ) / 100;
          }
        }

        porOrden.set(id, orden);
      }

      if (fila.trabajoId !== null) {
        const valor = Number(fila.precioAplicado);

        const comision =
          fila.valorComision === null
            ? null
            : Number(fila.valorComision);

        orden.trabajos.push({
          id: String(fila.trabajoId),
          descripcion: String(fila.trabajoDescripcion),
          valorManoObra: valor,
          comisionGenerada: comision
        });

        orden.totalManoObra += valor;

        if (comision !== null) {
          orden.totalComisionRegistrada += comision;
        }
      }
    }

    res.json({
      desde,
      hasta,
      ordenes: [...porOrden.values()]
    });

  } catch (error) {
    console.error(
      'Error consultando productividad detallada:',
      error
    );

    res.status(500).json({
      mensaje:
        'No fue posible consultar el detalle de productividad.'
    });
  }
});

export default router;
