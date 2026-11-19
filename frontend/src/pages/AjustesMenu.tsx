
import { useState } from 'react';

import {
  ClipboardList,
  Undo2,
  Truck,
  History,
  ArrowLeft,
  ChevronRight
} from 'lucide-react';

import AjustesInventario from './AjustesInventario';
import DevolucionesInventario from './DevolucionesInventario';

import './Inventario.css';

type VistaAjustes =
  | 'menu'
  | 'ajustes'
  | 'cliente'
  | 'proveedor'
  | 'historial';

const opciones = [
  {
    id: 'ajustes',
    titulo: 'Ajustar existencias',
    descripcion:
      'Registra sobrantes, faltantes y productos dañados.',
    icono: ClipboardList
  },
  {
    id: 'cliente',
    titulo: 'Devolución de cliente',
    descripcion:
      'Registra mercancía devuelta de una venta de mostrador.',
    icono: Undo2
  },
  {
    id: 'proveedor',
    titulo: 'Devolución a proveedor',
    descripcion:
      'Devuelve repuestos vinculados a una factura de compra.',
    icono: Truck
  },
  {
    id: 'historial',
    titulo: 'Historial de devoluciones',
    descripcion:
      'Consulta las devoluciones, importes y motivos registrados.',
    icono: History
  }
] as const;

export default function AjustesMenu() {

  const [vista, setVista] =
    useState<VistaAjustes>('menu');

  function volver() {
    setVista('menu');
  }

  return (
    <div className="ajustes-menu-pagina">

      {vista === 'menu' ? (

        <>

          <header className="inventario-header">

            <div>
              <span className="inventario-etiqueta">
                CONTROL DE EXISTENCIAS
              </span>

              <h1>Ajustes y devoluciones</h1>

              <p>
                Gestiona las correcciones y devoluciones
                de mercancía del taller.
              </p>
            </div>

          </header>

          <section className="inventario-menu">

            {opciones.map(opcion => {

              const Icono = opcion.icono;

              return (

                <button
                  key={opcion.id}
                  type="button"
                  className="inventario-menu-item"
                  onClick={() =>
                    setVista(opcion.id)
                  }
                >

                  <div className="inventario-menu-icono">
                    <Icono size={27} />
                  </div>

                  <div className="inventario-menu-texto">
                    <h3>{opcion.titulo}</h3>

                    <p>{opcion.descripcion}</p>
                  </div>

                  <ChevronRight size={20} />

                </button>

              );
            })}

          </section>

          <section className="inventario-panel">

            <div className="inventario-titulo">
              <div>
                <h2>Control y trazabilidad</h2>

                <p>
                  Los ajustes y devoluciones deben
                  justificar cada cambio en las existencias.
                </p>
              </div>

              <ClipboardList size={28} />
            </div>

            <div className="inventario-nota">
              Los movimientos registrados no eliminan
              las compras o ventas originales. Cada
              operación conserva su historial y genera
              un movimiento independiente en Kardex PMP.
            </div>

          </section>

        </>

      ) : (

        <>

          <button
            type="button"
            className="inventario-volver"
            onClick={volver}
          >
            <ArrowLeft size={18} />
            Volver a Ajustes y devoluciones
          </button>

          {vista === 'ajustes' && (
            <AjustesInventario />
          )}

          {vista === 'cliente' && (
            <DevolucionesInventario
              key="cliente"
              vistaInicial="cliente"
            />
          )}

          {vista === 'proveedor' && (
            <DevolucionesInventario
              key="proveedor"
              vistaInicial="proveedor"
            />
          )}

          {vista === 'historial' && (
            <DevolucionesInventario
              key="historial"
              vistaInicial="historial"
            />
          )}

        </>

      )}

    </div>
  );
}
