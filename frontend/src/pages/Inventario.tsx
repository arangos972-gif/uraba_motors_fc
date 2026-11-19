
import { useState } from 'react';

import {
  Boxes,
  ShoppingCart,
  History,
  Receipt,
  ShoppingBasket,
  ClipboardList,
  ArrowLeft,
  ChevronRight,
  Package
} from 'lucide-react';

import Repuestos from './Repuestos';
import ComprasInventario from './ComprasInventario';
import KardexInventario from './KardexInventario';
import VentasInventario from './VentasInventario';
import AjustesMenu from './AjustesMenu';
import { tienePermiso } from '../services/auth';
import './Inventario.css';

// ========================================
// VISTAS DEL INVENTARIO
// ========================================

type VistaInventario =
  | 'menu'
  | 'compras'
  | 'historial'
  | 'existencias'
  | 'kardex'
  | 'ventas'
  | 'ajustes';

// ========================================
// OPCIONES DEL MENÚ
// ========================================

const opciones = [
  {
    id: 'compras',
    titulo: 'Registrar compra',
    descripcion:
      'Registra facturas, proveedores y entradas de repuestos.',
    icono: ShoppingCart,
    disponible: true,
    permiso: 'compras.registrar'
  },
  {
    id: 'existencias',
    titulo: 'Consultar existencias',
    descripcion:
      'Consulta stock, costos PMP y precios de venta.',
    icono: Boxes,
    disponible: true,
    permiso: 'inventario.ver'
  },
  {
    id: 'kardex',
    titulo: 'Kardex PMP',
    descripcion:
      'Consulta entradas, salidas y movimientos de inventario.',
    icono: History,
    disponible: true,
    permiso: 'inventario.ver'
  },
  {
    id: 'historial',
    titulo: 'Historial de compras',
    descripcion:
      'Consulta las facturas y sus productos registrados.',
    icono: Receipt,
    disponible: true,
    permiso: 'compras.ver'
  },
  {
    id: 'ventas',
    titulo: 'Ventas de mostrador',
    descripcion:
      'Registra las ventas directas de repuestos.',
    icono: ShoppingBasket,
    disponible: true,
    permiso: ['ventas.ver', 'ventas.registrar']
  },
  {
  id: 'ajustes',
  titulo: 'Ajustes y devoluciones',
  descripcion:
    'Gestiona correcciones de existencias y devoluciones de mercancía.',
  icono: ClipboardList,
  disponible: true,
  permiso: 'inventario.editar'
}
] as const;

// ========================================
// COMPONENTE PRINCIPAL
// ========================================

export default function Inventario() {

  const [vista, setVista] =
    useState<VistaInventario>('menu');

  function volver() {
    setVista('menu');
  }

  return (
    <div className="inventario-pagina">

      {vista === 'menu' ? (

        <>

          {/* ENCABEZADO */}

          <header className="inventario-header">

            <div>
              <span className="inventario-etiqueta">
                CONTROL DE MERCANCÍA
              </span>

              <h1>Gestión de Inventario</h1>

              <p>
                Administra las compras, existencias
                y movimientos de repuestos del taller.
              </p>
            </div>

            <div className="inventario-metodo">

              <Boxes size={25} />

              <div>
                <strong>Método PMP</strong>

                <small>
                  Precio medio ponderado
                </small>
              </div>

            </div>

          </header>

          {/* MENÚ DE INTERACCIONES */}

          <section className="inventario-menu">

            {opciones.filter(opcion => {
              const requeridos = Array.isArray(opcion.permiso)
                ? opcion.permiso
                : [opcion.permiso];
              return requeridos.some(tienePermiso);
            }).map(opcion => {

              const Icono = opcion.icono;

              return (
                <button
                  key={opcion.id}
                  type="button"
                  className={
                    `inventario-menu-item ${
                      !opcion.disponible
                        ? 'pendiente'
                        : ''
                    }`
                  }
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

                    {!opcion.disponible && (
                      <span className="inventario-pendiente">
                        Próximamente
                      </span>
                    )}

                  </div>

                  <ChevronRight size={20} />

                </button>
              );
            })}

          </section>

          {/* EXPLICACIÓN DEL MÉTODO PMP */}

          <section className="inventario-panel">

            <div className="inventario-titulo">

              <div>
                <h2>Flujo del inventario PMP</h2>

                <p>
                  Todas las operaciones están
                  relacionadas con el catálogo de repuestos.
                </p>
              </div>

            </div>

            <div className="inventario-flujo">

              {/* COMPRA DE REPUESTOS */}

              <div className="inventario-flujo-item">

                <ShoppingCart size={28} />

                <strong>Compra de repuestos</strong>

                <span>
                  Factura, proveedor y costos
                </span>

              </div>

              <ChevronRight
                className="inventario-flecha"
                size={25}
              />

              {/* CONTROL PMP */}

              <div className="inventario-flujo-item">

                <Package size={28} />

                <strong>Control PMP</strong>

                <span>
                  Existencias y precio automático
                </span>

              </div>

              <ChevronRight
                className="inventario-flecha"
                size={25}
              />

              {/* KARDEX */}

              <div className="inventario-flujo-item">

                <History size={28} />

                <strong>Kardex PMP</strong>

                <span>
                  Registro de movimientos
                </span>

              </div>

            </div>

          </section>

        </>

      ) : (

        <>

          {/* BOTÓN VOLVER */}

          <button
            type="button"
            className="inventario-volver"
            onClick={volver}
          >
            <ArrowLeft size={18} />
            Volver a Inventario
          </button>

          {/* REGISTRAR COMPRA */}

          {vista === 'compras' && (
            <ComprasInventario
              key="registrar"
              vistaInicial="registrar"
            />
          )}

          {/* HISTORIAL DE COMPRAS */}

          {vista === 'historial' && (
            <ComprasInventario
              key="historial"
              vistaInicial="historial"
            />
          )}

          {/* CONSULTAR EXISTENCIAS */}

          {vista === 'existencias' && (
            <Repuestos />
          )}

          {/* KARDEX PMP */}

          {vista === 'kardex' && (
            <KardexInventario />
          )}

          {/* VENTAS DE MOSTRADOR */}

          {vista === 'ventas' && (
            <VentasInventario />
          )}

          {/* AJUSTES DE INVENTARIO */}

         {vista === 'ajustes' && (
  <AjustesMenu />
)}

        </>

      )}

    </div>
  );
}
