import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Fila = RowDataPacket & Record<string, any>;
class ErrorLiquidacion extends Error {
  constructor(public codigo: number, mensaje: string) { super(mensaje); }
}
const fallar = (res: Response, error: unknown) => {
  if (error instanceof ErrorLiquidacion) {
    res.status(error.codigo).json({ mensaje: error.message }); return;
  }
  console.error('Error liquidaciones:', error);
  res.status(500).json({ mensaje: 'Error interno en liquidaciones.' });
};
const usuario = (res: Response) => {
  const id = (res.locals.usuario as { id?: string } | undefined)?.id;
  if (!id || !UUID.test(id)) throw new ErrorLiquidacion(401, 'Sesión inválida.');
  return id;
};
const idValido = (id: unknown): id is string => typeof id === 'string' && UUID.test(id);
const dinero = (v: unknown) => {
  const n = Number(v);
  const c = Math.round(n * 100);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(c) || c > 999999999999 || Math.abs(n * 100 - c) > .001)
    throw new ErrorLiquidacion(409, 'Hay un importe monetario inválido.');
  return c;
};
const aSQL = (c: number) => (c / 100).toFixed(2);
function periodo(anio: unknown, mes: unknown, quincena: unknown) {
  const y = Number(anio), m = Number(mes), q = Number(quincena);
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12 || (q !== 1 && q !== 2))
    throw new ErrorLiquidacion(400, 'Año, mes o quincena inválidos.');
  const prefijo = `${y}-${String(m).padStart(2, '0')}`;
  const siguiente = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return {
    inicio: `${prefijo}-${q === 1 ? '01' : '16'}`,
    fin: q === 1 ? `${prefijo}-15` : ultimo,
    finExclusivo: q === 1 ? `${prefijo}-16` : siguiente,
  };
}

// GET /api/liquidaciones?mecanicoId=uuid — lista general o filtrada.
router.get('/', async (req, res) => {
  try {
    usuario(res);
    const filtro = req.query.mecanicoId;
    if (filtro !== undefined && !idValido(filtro)) throw new ErrorLiquidacion(400, 'Mecánico inválido.');
    const [filas] = await pool.execute<Fila[]>(
      `SELECT lm.id, lm.mecanicoId, u.name AS mecanico, lm.periodoInicio,
              lm.periodoFin, lm.totalManoObra, lm.totalComisiones,
              lm.estado, lm.fechaAprobacion, lm.fechaPago, lm.created
       FROM liquidaciones_mecanicos lm JOIN users u ON u.id = lm.mecanicoId
       ${filtro ? 'WHERE lm.mecanicoId = ?' : ''}
       ORDER BY lm.periodoInicio DESC, u.name LIMIT 500`, filtro ? [filtro] : []
    );
    res.json({ liquidaciones: filas });
  } catch (e) { fallar(res, e); }
});

// GET /api/liquidaciones/:id — detalle de comisiones y comprobante.
router.get('/:id', async (req, res) => {
  try {
    usuario(res);
    if (!idValido(req.params.id)) throw new ErrorLiquidacion(400, 'ID inválido.');
    const [cab] = await pool.execute<Fila[]>(
      `SELECT lm.*, u.name AS mecanico FROM liquidaciones_mecanicos lm
       JOIN users u ON u.id = lm.mecanicoId WHERE lm.id = ?`, [req.params.id]
    );
    if (!cab.length) throw new ErrorLiquidacion(404, 'Liquidación no encontrada.');
    const [detalles] = await pool.execute<Fila[]>(
      `SELECT d.id, d.comisionGeneradaId, d.valorManoObra,
              d.porcentajeAplicado, d.valorComision,
              cg.servicioId, cg.servicioDetalleId, cg.fechaReconocimiento,
              sd.descripcion AS trabajo
       FROM liquidaciones_mecanicos_detalles d
       JOIN comisiones_generadas cg ON cg.id = d.comisionGeneradaId
       JOIN servicios_detalles sd ON sd.id = cg.servicioDetalleId
       WHERE d.liquidacionId = ? ORDER BY cg.fechaReconocimiento, d.id`, [req.params.id]
    );
    const [pagos] = await pool.execute<Fila[]>(
      `SELECT id, monto, medioPago, referencia, registradoPorId, fechaPago
       FROM pagos_liquidaciones_mecanicos WHERE liquidacionId = ?`, [req.params.id]
    );
    res.json({ liquidacion: cab[0], detalles, pagos });
  } catch (e) { fallar(res, e); }
});

// POST /api/liquidaciones/calcular — {mecanicoId, anio, mes, quincena}
router.post('/calcular', async (req: Request, res: Response) => {
  const cn = await pool.getConnection();
  try {
    const calculador = usuario(res);
    const { mecanicoId, anio, mes, quincena } = req.body ?? {};
    if (!idValido(mecanicoId)) throw new ErrorLiquidacion(400, 'Mecánico inválido.');
    const p = periodo(anio, mes, quincena);
    const partesHoy = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const valorHoy = (tipo: string) => partesHoy.find(x => x.type === tipo)?.value ?? '';
    const hoy = `${valorHoy('year')}-${valorHoy('month')}-${valorHoy('day')}`;
    if (hoy < p.finExclusivo)
      throw new ErrorLiquidacion(409, 'La quincena todavía no ha terminado.');
    await cn.beginTransaction();
    // Serializar liquidaciones del mismo mecánico.
    const [mecanicos] = await cn.execute<Fila[]>(
      'SELECT id FROM users WHERE id = ? FOR UPDATE', [mecanicoId]
    );
    if (!mecanicos.length) throw new ErrorLiquidacion(404, 'Mecánico no existe.');
    const [existentes] = await cn.execute<Fila[]>(
      `SELECT id FROM liquidaciones_mecanicos
       WHERE mecanicoId = ? AND periodoInicio = ? AND periodoFin = ?`,
      [mecanicoId, p.inicio, p.fin]
    );
    if (existentes.length) throw new ErrorLiquidacion(409, 'Esta quincena ya está liquidada.');
    // Comprobar que no hay comisiones ya asignadas en el período.
    const [comisiones] = await cn.execute<Fila[]>(
      `SELECT cg.id, cg.valorManoObra, cg.porcentajeAplicado, cg.valorComision,
              d.liquidacionId
       FROM comisiones_generadas cg
       LEFT JOIN liquidaciones_mecanicos_detalles d
         ON d.comisionGeneradaId = cg.id
       WHERE cg.mecanicoId = ?
         AND cg.fechaReconocimiento >= ?
         AND cg.fechaReconocimiento < ?
       ORDER BY cg.fechaReconocimiento, cg.id FOR UPDATE`,
      [mecanicoId, p.inicio, p.finExclusivo]
    );
    if (!comisiones.length) throw new ErrorLiquidacion(409, 'No hay comisiones generadas en esa quincena.');
    if (comisiones.some(c => c.liquidacionId !== null))
      throw new ErrorLiquidacion(409, 'Algunas comisiones ya pertenecen a otra liquidación.');
    let mano = 0, comision = 0;
    for (const c of comisiones) {
      mano += dinero(c.valorManoObra);
      comision += dinero(c.valorComision);
    }
    if (!Number.isSafeInteger(mano) || !Number.isSafeInteger(comision) ||
        mano > 999999999999 || comision > 999999999999)
      throw new ErrorLiquidacion(409, 'El total excede el límite permitido.');
    const id = randomUUID();
    await cn.execute(
      `INSERT INTO liquidaciones_mecanicos
       (id, mecanicoId, periodoInicio, periodoFin, totalManoObra,
        totalComisiones, estado, calculadaPorId)
       VALUES (?, ?, ?, ?, ?, ?, 'CALCULADA', ?)`,
      [id, mecanicoId, p.inicio, p.fin, aSQL(mano), aSQL(comision), calculador]
    );
    for (const c of comisiones) {
      await cn.execute(
        `INSERT INTO liquidaciones_mecanicos_detalles
         (id, liquidacionId, comisionGeneradaId, valorManoObra,
          porcentajeAplicado, valorComision)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), id, c.id, aSQL(dinero(c.valorManoObra)),
         Number(c.porcentajeAplicado).toFixed(2), aSQL(dinero(c.valorComision))]
      );
    }
    await cn.commit();
    res.status(201).json({ mensaje: 'Liquidación calculada.', id,
      periodoInicio: p.inicio, periodoFin: p.fin,
      cantidadTrabajos: comisiones.length,
      totalManoObra: aSQL(mano), totalComisiones: aSQL(comision), estado: 'CALCULADA' });
  } catch (e) { await cn.rollback(); fallar(res, e); }
  finally { cn.release(); }
});

// PATCH /api/liquidaciones/:id/aprobar
router.patch('/:id/aprobar', async (req, res) => {
  const cn = await pool.getConnection();
  try {
    const aprobador = usuario(res);
    if (!idValido(req.params.id)) throw new ErrorLiquidacion(400, 'ID inválido.');
    await cn.beginTransaction();
    const [filas] = await cn.execute<Fila[]>(
      'SELECT id, estado FROM liquidaciones_mecanicos WHERE id = ? FOR UPDATE', [req.params.id]
    );
    if (!filas.length) throw new ErrorLiquidacion(404, 'Liquidación no existe.');
    if (filas[0].estado !== 'CALCULADA') throw new ErrorLiquidacion(409, 'Solo se puede aprobar una liquidación calculada.');
    const [cuentas] = await cn.execute<Fila[]>(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(valorManoObra),0) AS mano,
              COALESCE(SUM(valorComision),0) AS comision
       FROM liquidaciones_mecanicos_detalles WHERE liquidacionId = ?`, [req.params.id]
    );
    const [cab] = await cn.execute<Fila[]>(
      'SELECT totalManoObra, totalComisiones FROM liquidaciones_mecanicos WHERE id = ?', [req.params.id]
    );
    if (!Number(cuentas[0].cantidad) || dinero(cuentas[0].mano) !== dinero(cab[0].totalManoObra) ||
        dinero(cuentas[0].comision) !== dinero(cab[0].totalComisiones))
      throw new ErrorLiquidacion(409, 'El detalle no coincide con el total.');
    await cn.execute<ResultSetHeader>(
      `UPDATE liquidaciones_mecanicos
       SET estado = 'APROBADA', aprobadaPorId = ?, fechaAprobacion = NOW()
       WHERE id = ? AND estado = 'CALCULADA'`, [aprobador, req.params.id]
    );
    await cn.commit();
    res.json({ mensaje: 'Liquidación aprobada.', id: req.params.id });
  } catch (e) { await cn.rollback(); fallar(res, e); }
  finally { cn.release(); }
});

// POST /api/liquidaciones/:id/pagar — {medioPago, referencia?}
// Registra pago completo, no abonos.
router.post('/:id/pagar', async (req, res) => {
  const cn = await pool.getConnection();
  try {
    const pagador = usuario(res);
    if (!idValido(req.params.id)) throw new ErrorLiquidacion(400, 'ID inválido.');
    const { medioPago, referencia } = req.body ?? {};
    const medios = ['EFECTIVO','TRANSFERENCIA','NEQUI','DAVIPLATA','OTRO'];
    if (!medios.includes(medioPago)) throw new ErrorLiquidacion(400, 'Medio de pago inválido.');
    if (referencia !== undefined && referencia !== null &&
        (typeof referencia !== 'string' || referencia.length > 150))
      throw new ErrorLiquidacion(400, 'Referencia inválida.');
    await cn.beginTransaction();
    const [filas] = await cn.execute<Fila[]>(
      `SELECT id, estado, totalComisiones FROM liquidaciones_mecanicos
       WHERE id = ? FOR UPDATE`, [req.params.id]
    );
    if (!filas.length) throw new ErrorLiquidacion(404, 'Liquidación no existe.');
    if (filas[0].estado !== 'APROBADA') throw new ErrorLiquidacion(409, 'La liquidación debe estar aprobada y no pagada.');
    const monto = aSQL(dinero(filas[0].totalComisiones));
    const pagoId = randomUUID();
    await cn.execute(
      `INSERT INTO pagos_liquidaciones_mecanicos
       (id, liquidacionId, monto, medioPago, referencia, registradoPorId)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [pagoId, req.params.id, monto, medioPago, referencia?.trim() || null, pagador]
    );
    await cn.execute(
      `UPDATE liquidaciones_mecanicos
       SET estado = 'PAGADA', fechaPago = NOW(), pagadaPorId = ?
       WHERE id = ? AND estado = 'APROBADA'`, [pagador, req.params.id]
    );
    await cn.commit();
    res.json({ mensaje: 'Pago registrado.', pagoId, liquidacionId: req.params.id, monto });
  } catch (e) { await cn.rollback(); fallar(res, e); }
  finally { cn.release(); }
});

export default router;
