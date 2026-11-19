
import { jsPDF } from 'jspdf';

interface TrabajoPDF {
  descripcion: string;
  costoAplicado: string | number;
}

interface RepuestoPDF {
  descripcion: string;
  cantidad: number;
  precioUnitario: string | number;
  subtotal: string | number;
}

interface PagoPDF {
  tipoPago: string;
  monto: string | number;
  estado: string;
  referencia: string | null;
}

interface FacturaPDF {
  numero: string;
  clienteNombre: string;
  motoPlaca: string | null;
  created: string;
  estado: string;
  subtotal: string | number;
  impuesto: string | number;
  total: string | number;
  totalPagado: string | number;
  saldoPendiente: string | number;
  trabajos: TrabajoPDF[];
  repuestos: RepuestoPDF[];
  pagos: PagoPDF[];
}

function moneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(valor));
}

export function descargarFacturaPDF(
  factura: FacturaPDF
): void {

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const ancho = pdf.internal.pageSize.getWidth();
  const alto = pdf.internal.pageSize.getHeight();

  const margen = 18;
  const anchoUtil = ancho - margen * 2;

  let y = 20;

  // ========================================
  // CONTROLAR SALTOS DE PÁGINA
  // ========================================

  function verificarPagina(espacio = 10) {
    if (y + espacio > alto - 20) {
      pdf.addPage();
      y = 20;
    }
  }

  function texto(
    contenido: string,
    negrita = false,
    tamano = 10
  ) {
    pdf.setFont(
      'helvetica',
      negrita ? 'bold' : 'normal'
    );

    pdf.setFontSize(tamano);

    const lineas = pdf.splitTextToSize(
      contenido,
      anchoUtil
    );

    verificarPagina(lineas.length * 5 + 2);

    pdf.text(lineas, margen, y);

    y += lineas.length * 5 + 2;
  }

  function separador() {
    verificarPagina(8);

    pdf.setDrawColor(210, 210, 210);

    pdf.line(
      margen,
      y,
      ancho - margen,
      y
    );

    y += 7;
  }

  function tituloSeccion(titulo: string) {
    verificarPagina(14);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(25, 65, 140);

    pdf.text(titulo, margen, y);

    pdf.setTextColor(30, 30, 30);
    y += 8;
  }

  function concepto(
    descripcion: string,
    precio: string
  ) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);

    // Reservar espacio a la derecha
    // para mostrar el precio.
    const lineas = pdf.splitTextToSize(
      descripcion,
      anchoUtil - 48
    );

    const altura = Math.max(7, lineas.length * 5);

    verificarPagina(altura + 2);

    pdf.text(lineas, margen, y);

    pdf.text(
      precio,
      ancho - margen,
      y,
      { align: 'right' }
    );

    y += altura + 2;
  }

  function total(
    etiqueta: string,
    valor: string | number,
    destacado = false
  ) {
    verificarPagina(9);

    pdf.setFont(
      'helvetica',
      destacado ? 'bold' : 'normal'
    );

    pdf.setFontSize(destacado ? 12 : 10);

    pdf.text(etiqueta, margen, y);

    pdf.text(
      `COP ${moneda(valor)}`,
      ancho - margen,
      y,
      { align: 'right' }
    );

    y += destacado ? 10 : 8;
  }

  // ========================================
  // ENCABEZADO
  // ========================================

  pdf.setTextColor(25, 65, 140);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(19);

  pdf.text(
    'URABA MOTORS FC',
    ancho / 2,
    y,
    { align: 'center' }
  );

  y += 9;

  pdf.setTextColor(90, 90, 90);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);

  pdf.text(
    'Taller y mantenimiento de motocicletas',
    ancho / 2,
    y,
    { align: 'center' }
  );

  y += 9;

  pdf.setFontSize(9);
  pdf.text(
    'COMPROBANTE INTERNO - NO ES FACTURA ELECTRONICA',
    ancho / 2,
    y,
    { align: 'center' }
  );

  y += 11;

  pdf.setTextColor(30, 30, 30);

  separador();

  texto(`Comprobante: ${factura.numero}`, true);

  texto(
    `Fecha: ${new Date(
      factura.created
    ).toLocaleString('es-CO')}`
  );

  texto(`Estado: ${factura.estado}`);

  separador();

  // ========================================
  // DATOS DEL CLIENTE
  // ========================================

  tituloSeccion('DATOS DEL CLIENTE');

  texto(`Cliente: ${factura.clienteNombre}`);

  texto(
    `Motocicleta: ${
      factura.motoPlaca || 'No asociada'
    }`
  );

  separador();

  // ========================================
  // MANO DE OBRA
  // ========================================

  tituloSeccion('MANO DE OBRA');

  if (factura.trabajos.length === 0) {
    texto('Sin trabajos registrados.');
  }

  for (const trabajo of factura.trabajos) {
    concepto(
      trabajo.descripcion,
      `COP ${moneda(trabajo.costoAplicado)}`
    );
  }

  separador();

  // ========================================
  // REPUESTOS
  // ========================================

  tituloSeccion('REPUESTOS');

  if (factura.repuestos.length === 0) {
    texto('Sin repuestos registrados.');
  }

  for (const repuesto of factura.repuestos) {
    concepto(
      `${repuesto.descripcion} x ${repuesto.cantidad}`,
      `COP ${moneda(repuesto.subtotal)}`
    );

    texto(
      `Precio unitario: COP ${
        moneda(repuesto.precioUnitario)
      }`,
      false,
      8
    );
  }

  separador();

  // ========================================
  // TOTALES
  // ========================================

  tituloSeccion('RESUMEN DE LA FACTURA');

  total('Subtotal', factura.subtotal);
  total('Impuesto registrado', factura.impuesto);

  separador();

  total('TOTAL', factura.total, true);

  total('Total pagado', factura.totalPagado);

  total(
    'Saldo pendiente',
    factura.saldoPendiente,
    true
  );

  separador();

  // ========================================
  // PAGOS REGISTRADOS
  // ========================================

  tituloSeccion('PAGOS REGISTRADOS');

  if (factura.pagos.length === 0) {
    texto('No hay pagos registrados.');
  }

  for (const pago of factura.pagos) {
    texto(
      `${pago.tipoPago} - ${pago.estado}: ` +
      `COP ${moneda(pago.monto)}`
    );

    if (pago.referencia) {
      texto(`Referencia: ${pago.referencia}`);
    }
  }

  separador();

  // ========================================
  // NOTA LEGAL
  // ========================================

  texto(
    'Documento interno de control del taller. ' +
    'No reemplaza una factura electronica ' +
    'validada por la DIAN.',
    false,
    8
  );

  // ========================================
  // DESCARGAR
  // ========================================

  const numeroSeguro = factura.numero.replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );

  pdf.save(
    `URABA_MOTORS_FC_${numeroSeguro}.pdf`
  );
}
