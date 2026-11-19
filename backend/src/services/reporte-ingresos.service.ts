import type { RowDataPacket } from 'mysql2';

import { pool } from '../config/database.js';

interface IngresoDiarioDB extends RowDataPacket {
  fecha: string;
  origen: 'FACTURA' | 'VENTA' | 'DEVOLUCION';
  total: number | string;
  manoObra: number | string;
  repuestos: number | string;
  costoRepuestos: number | string;
  unidadesRepuestos: number | string;
  lineasSinCosto: number | string;
  operaciones: number | string;
}

interface ProductoVendidoDB extends RowDataPacket {
  repuestoId: string;
  repuesto: string;
  cantidad: number | string;
  ingresos: number | string;
  costos: number | string;
  lineasSinCosto: number | string;
}

interface TotalesPeriodo {
  facturadoCentavos: number;
  ventasCentavos: number;
  totalGeneradoCentavos: number;
  manoObraCentavos: number;
  repuestosCentavos: number;
  costoRepuestosCentavos: number;
  unidadesRepuestos: number;
  lineasSinCosto: number;
  cantidadFacturas: number;
  cantidadVentas: number;
  cantidadDevoluciones: number;
}

function crearTotales(): TotalesPeriodo {
  return {
    facturadoCentavos: 0,
    ventasCentavos: 0,
    totalGeneradoCentavos: 0,
    manoObraCentavos: 0,
    repuestosCentavos: 0,
    costoRepuestosCentavos: 0,
    unidadesRepuestos: 0,
    lineasSinCosto: 0,
    cantidadFacturas: 0,
    cantidadVentas: 0,
    cantidadDevoluciones: 0
  };
}

function aCentavos(valor: number | string): number {
  const numero = Number(valor);
  const centavos = Math.round(numero * 100);

  if (
    !Number.isFinite(numero) ||
    !Number.isSafeInteger(centavos)
  ) {
    throw new Error('MONTO_REPORTE_INVALIDO');
  }

  return centavos;
}

function aEntero(valor: number | string): number {
  const numero = Number(valor);

  if (!Number.isSafeInteger(numero)) {
    throw new Error('TOTAL_REPORTE_INVALIDO');
  }

  return numero;
}

function presentarTotales(totales: TotalesPeriodo) {
  const repuestosCompletos = totales.lineasSinCosto === 0;

  return {
    totalFacturado: totales.facturadoCentavos / 100,
    totalVentas: totales.ventasCentavos / 100,
    totalGenerado: totales.totalGeneradoCentavos / 100,
    manoObraFacturada: totales.manoObraCentavos / 100,
    totalRepuestosVendidos: totales.repuestosCentavos / 100,
    costoRepuestos: repuestosCompletos
      ? totales.costoRepuestosCentavos / 100
      : null,
    gananciaBrutaRepuestos: repuestosCompletos
      ? (
          totales.repuestosCentavos -
          totales.costoRepuestosCentavos
        ) / 100
      : null,
    costosRepuestosCompletos: repuestosCompletos,
    unidadesRepuestos: totales.unidadesRepuestos,
    cantidadFacturas: totales.cantidadFacturas,
    cantidadVentas: totales.cantidadVentas,
    cantidadDevoluciones: totales.cantidadDevoluciones
  };
}

const COSTOS_SALIDAS_SERVICIO_SQL = `
  SELECT
    sr.servicioId,
    sr.repuestoId,
    SUM(k.cantidad) AS unidadesConCosto,
    SUM(
      k.cantidad * k.costoUnitarioMovimiento
    ) AS costo
  FROM servicio_repuestos sr
  LEFT JOIN inventario_pmp_kardex k
    ON k.referenciaOrigenId = sr.id
   AND k.repuestoId = sr.repuestoId
   AND k.tipoMovimiento = 'SALIDA_SERVICIO_MECANICO'
  GROUP BY sr.servicioId, sr.repuestoId
`;

const PARTES_FACTURA_SQL = `
  SELECT
    detalle.facturaId,
    detalle.repuestoId,
    detalle.descripcion,
    detalle.cantidad,
    detalle.ingreso,
    costo.unidadesConCosto,
    costo.costo
  FROM (
    SELECT
      f.id AS facturaId,
      f.servicioId,
      fr.repuestoId,
      COALESCE(
        MAX(fr.descripcion),
        MAX(r.nombre),
        'Repuesto'
      ) AS descripcion,
      SUM(fr.cantidad) AS cantidad,
      SUM(fr.subtotal) AS ingreso
    FROM facturas f
    INNER JOIN factura_repuestos fr
      ON fr.facturaId = f.id
    LEFT JOIN repuestos r
      ON r.id = fr.repuestoId
    WHERE f.estado <> 'ANULADO'
      AND f.created >= ?
      AND f.created < ?
    GROUP BY f.id, f.servicioId, fr.repuestoId
  ) detalle
  LEFT JOIN (
    ${COSTOS_SALIDAS_SERVICIO_SQL}
  ) costo
    ON costo.servicioId = detalle.servicioId
   AND costo.repuestoId = detalle.repuestoId
`;

const COSTOS_VENTAS_MOSTRADOR_SQL = `
  SELECT
    k.referenciaOrigenId AS ventaId,
    k.repuestoId,
    SUM(k.cantidad) AS unidadesConCosto,
    SUM(
      k.cantidad * k.costoUnitarioMovimiento
    ) AS costo
  FROM inventario_pmp_kardex k
  WHERE k.tipoMovimiento = 'SALIDA_VENTA_MOSTRADOR'
  GROUP BY k.referenciaOrigenId, k.repuestoId
`;

export async function obtenerReporteIngresos(
  anio: number,
  mes: number
) {
  const desde = `${anio}-01-01`;
  const hasta = `${anio + 1}-01-01`;

  const [filas] = await pool.execute<IngresoDiarioDB[]>(
    `SELECT
       DATE_FORMAT(ingresos.fecha, '%Y-%m-%d') AS fecha,
       ingresos.origen,
       SUM(ingresos.total) AS total,
       SUM(ingresos.manoObra) AS manoObra,
       SUM(ingresos.repuestos) AS repuestos,
       SUM(ingresos.costoRepuestos) AS costoRepuestos,
       SUM(ingresos.unidadesRepuestos) AS unidadesRepuestos,
       SUM(ingresos.lineasSinCosto) AS lineasSinCosto,
       COUNT(*) AS operaciones
     FROM (
       SELECT
         f.created AS fecha,
         'FACTURA' AS origen,
         f.total AS total,
         COALESCE(mo.total, 0) AS manoObra,
         COALESCE(partes.ingresos, 0) AS repuestos,
         COALESCE(partes.costos, 0) AS costoRepuestos,
         COALESCE(partes.unidades, 0) AS unidadesRepuestos,
         COALESCE(partes.lineasSinCosto, 0) AS lineasSinCosto
       FROM facturas f
       LEFT JOIN (
         SELECT facturaId, SUM(costoAplicado) AS total
         FROM factura_servicios
         GROUP BY facturaId
       ) mo
         ON mo.facturaId = f.id
       LEFT JOIN (
         SELECT
           detalle.facturaId,
           SUM(detalle.ingreso) AS ingresos,
           SUM(COALESCE(detalle.costo, 0)) AS costos,
           SUM(detalle.cantidad) AS unidades,
           SUM(
             CASE
               WHEN detalle.costo IS NULL
                 OR detalle.unidadesConCosto IS NULL
                 OR detalle.unidadesConCosto <> detalle.cantidad
               THEN 1
               ELSE 0
             END
           ) AS lineasSinCosto
         FROM (${PARTES_FACTURA_SQL}) detalle
         GROUP BY detalle.facturaId
       ) partes
         ON partes.facturaId = f.id
       WHERE f.estado <> 'ANULADO'
         AND f.created >= ?
         AND f.created < ?

       UNION ALL

       SELECT
         v.created AS fecha,
         'VENTA' AS origen,
         v.total AS total,
         0 AS manoObra,
         v.total AS repuestos,
         COALESCE(costo.costo, 0) AS costoRepuestos,
         v.cantidad AS unidadesRepuestos,
         CASE
           WHEN costo.costo IS NULL
             OR costo.unidadesConCosto <> v.cantidad
           THEN 1
           ELSE 0
         END AS lineasSinCosto
       FROM ventas v
       LEFT JOIN (
         ${COSTOS_VENTAS_MOSTRADOR_SQL}
       ) costo
         ON costo.ventaId = v.id
        AND costo.repuestoId = v.repuestoId
       WHERE v.created >= ?
         AND v.created < ?

       UNION ALL

       SELECT
         d.created AS fecha,
         'DEVOLUCION' AS origen,
         -d.totalDevolucion AS total,
         0 AS manoObra,
         -d.totalDevolucion AS repuestos,
         -(d.cantidad * d.costoUnitarioInventario) AS costoRepuestos,
         -d.cantidad AS unidadesRepuestos,
         0 AS lineasSinCosto
       FROM devoluciones_inventario d
       WHERE d.tipoDevolucion = 'CLIENTE'
         AND d.ventaId IS NOT NULL
         AND d.created >= ?
         AND d.created < ?
     ) ingresos
     GROUP BY
       DATE_FORMAT(ingresos.fecha, '%Y-%m-%d'),
       ingresos.origen
     ORDER BY
       DATE_FORMAT(ingresos.fecha, '%Y-%m-%d'),
       ingresos.origen`,
    [
      desde,
      hasta,
      desde,
      hasta,
      desde,
      hasta,
      desde,
      hasta
    ]
  );

  const meses = Array.from(
    { length: 12 },
    () => crearTotales()
  );

  const diasDelMes = new Date(
    Date.UTC(anio, mes, 0)
  ).getUTCDate();
  const dias = Array.from(
    { length: diasDelMes },
    () => crearTotales()
  );

  for (const fila of filas) {
    const fecha = String(fila.fecha);
    const numeroMes = Number(fecha.slice(5, 7));
    const numeroDia = Number(fecha.slice(8, 10));
    const totalesMes = meses[numeroMes - 1];

    if (
      !totalesMes ||
      !Number.isInteger(numeroDia) ||
      numeroDia < 1 ||
      numeroDia > 31
    ) {
      throw new Error('FECHA_REPORTE_INVALIDA');
    }

    const total = aCentavos(fila.total);
    const manoObra = aCentavos(fila.manoObra);
    const repuestos = aCentavos(fila.repuestos);
    const costoRepuestos = aCentavos(fila.costoRepuestos);
    const unidadesRepuestos = aEntero(fila.unidadesRepuestos);
    const lineasSinCosto = aEntero(fila.lineasSinCosto);
    const operaciones = aEntero(fila.operaciones);

    if (
      operaciones < 0 ||
      lineasSinCosto < 0 ||
      (fila.origen !== 'FACTURA' &&
        fila.origen !== 'VENTA' &&
        fila.origen !== 'DEVOLUCION')
    ) {
      throw new Error('DATOS_REPORTE_INVALIDOS');
    }

    const destinos = [totalesMes];

    if (numeroMes === mes) {
      const totalesDia = dias[numeroDia - 1];

      if (!totalesDia) {
        throw new Error('FECHA_REPORTE_INVALIDA');
      }

      destinos.push(totalesDia);
    }

    for (const destino of destinos) {
      destino.totalGeneradoCentavos += total;
      destino.manoObraCentavos += manoObra;
      destino.repuestosCentavos += repuestos;
      destino.costoRepuestosCentavos += costoRepuestos;
      destino.unidadesRepuestos += unidadesRepuestos;
      destino.lineasSinCosto += lineasSinCosto;

      if (fila.origen === 'FACTURA') {
        destino.facturadoCentavos += total;
        destino.cantidadFacturas += operaciones;
      } else if (fila.origen === 'VENTA') {
        destino.ventasCentavos += total;
        destino.cantidadVentas += operaciones;
      } else {
        destino.cantidadDevoluciones += operaciones;
      }
    }
  }

  const resumen = meses.reduce(
    (total, totalesMes) => ({
      facturadoCentavos:
        total.facturadoCentavos + totalesMes.facturadoCentavos,
      ventasCentavos:
        total.ventasCentavos + totalesMes.ventasCentavos,
      totalGeneradoCentavos:
        total.totalGeneradoCentavos +
        totalesMes.totalGeneradoCentavos,
      manoObraCentavos:
        total.manoObraCentavos + totalesMes.manoObraCentavos,
      repuestosCentavos:
        total.repuestosCentavos + totalesMes.repuestosCentavos,
      costoRepuestosCentavos:
        total.costoRepuestosCentavos +
        totalesMes.costoRepuestosCentavos,
      unidadesRepuestos:
        total.unidadesRepuestos + totalesMes.unidadesRepuestos,
      lineasSinCosto:
        total.lineasSinCosto + totalesMes.lineasSinCosto,
      cantidadFacturas:
        total.cantidadFacturas + totalesMes.cantidadFacturas,
      cantidadVentas:
        total.cantidadVentas + totalesMes.cantidadVentas,
      cantidadDevoluciones:
        total.cantidadDevoluciones +
        totalesMes.cantidadDevoluciones
    }),
    crearTotales()
  );

  const desdeMes =
    `${anio}-${String(mes).padStart(2, '0')}-01`;
  const siguienteMes = new Date(Date.UTC(anio, mes, 1));
  const hastaMes =
    `${siguienteMes.getUTCFullYear()}-${String(
      siguienteMes.getUTCMonth() + 1
    ).padStart(2, '0')}-01`;

  const [productosDB] = await pool.execute<ProductoVendidoDB[]>(
    `SELECT
       vendidos.repuestoId,
       MAX(vendidos.repuesto) AS repuesto,
       SUM(vendidos.cantidad) AS cantidad,
       SUM(vendidos.ingresos) AS ingresos,
       SUM(vendidos.costos) AS costos,
       SUM(vendidos.lineasSinCosto) AS lineasSinCosto
     FROM (
       SELECT
         detalle.repuestoId,
         detalle.descripcion AS repuesto,
         detalle.cantidad,
         detalle.ingreso AS ingresos,
         COALESCE(detalle.costo, 0) AS costos,
         CASE
           WHEN detalle.costo IS NULL
             OR detalle.unidadesConCosto IS NULL
             OR detalle.unidadesConCosto <> detalle.cantidad
           THEN 1
           ELSE 0
         END AS lineasSinCosto
       FROM (${PARTES_FACTURA_SQL}) detalle

       UNION ALL

       SELECT
         v.repuestoId,
         r.nombre AS repuesto,
         v.cantidad,
         v.total AS ingresos,
         COALESCE(costo.costo, 0) AS costos,
         CASE
           WHEN costo.costo IS NULL
             OR costo.unidadesConCosto <> v.cantidad
           THEN 1
           ELSE 0
         END AS lineasSinCosto
       FROM ventas v
       INNER JOIN repuestos r
         ON r.id = v.repuestoId
       LEFT JOIN (
         ${COSTOS_VENTAS_MOSTRADOR_SQL}
       ) costo
         ON costo.ventaId = v.id
        AND costo.repuestoId = v.repuestoId
       WHERE v.created >= ?
         AND v.created < ?

       UNION ALL

       SELECT
         d.repuestoId,
         r.nombre AS repuesto,
         -d.cantidad AS cantidad,
         -d.totalDevolucion AS ingresos,
         -(d.cantidad * d.costoUnitarioInventario) AS costos,
         0 AS lineasSinCosto
       FROM devoluciones_inventario d
       INNER JOIN repuestos r
         ON r.id = d.repuestoId
       WHERE d.tipoDevolucion = 'CLIENTE'
         AND d.ventaId IS NOT NULL
         AND d.created >= ?
         AND d.created < ?
     ) vendidos
     GROUP BY vendidos.repuestoId
     HAVING SUM(vendidos.cantidad) <> 0
         OR SUM(vendidos.ingresos) <> 0
     ORDER BY ingresos DESC, repuesto ASC
     LIMIT 2001`,
    [
       desdeMes,
       hastaMes,
       desdeMes,
       hastaMes,
       desdeMes,
       hastaMes
    ]
  );

  if (productosDB.length > 2000) {
    throw new Error('PERIODO_CON_DEMASIADOS_REPUESTOS');
  }

  const productos = productosDB.map(producto => {
    const cantidad = aEntero(producto.cantidad);
    const ingresos = aCentavos(producto.ingresos);
    const costos = aCentavos(producto.costos);
    const costosCompletos =
      aEntero(producto.lineasSinCosto) === 0;

    return {
      repuestoId: producto.repuestoId,
      repuesto: producto.repuesto,
      cantidad,
      ingresos: ingresos / 100,
      costoRepuestos: costosCompletos
        ? costos / 100
        : null,
      gananciaBruta: costosCompletos
        ? (ingresos - costos) / 100
        : null,
      costosCompletos
    };
  });

  return {
    anio,
    mes,
    resumen: presentarTotales(resumen),
    meses: meses.map((totales, indice) => ({
      mes: indice + 1,
      ...presentarTotales(totales)
    })),
    dias: dias.map((totales, indice) => ({
      fecha: `${anio}-${String(mes).padStart(2, '0')}-${String(indice + 1).padStart(2, '0')}`,
      ...presentarTotales(totales)
    })),
    productos
  };
}
