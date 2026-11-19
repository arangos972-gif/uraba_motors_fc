
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  PackagePlus,
  Tags,
  Boxes,
  AlertTriangle,
  Search,
  Plus,
  Pencil,
  X,
  RefreshCw,
  Package
} from 'lucide-react';

import { obtenerToken, tienePermiso } from '../services/auth';

import './Repuestos.css';

const API = 'https://uraba-motors-fc.onrender.com/api/repuestos';

interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
}

interface Repuesto {
  id: string;
  categoriaId: string | null;
  categoriaNombre: string | null;
  nombre: string;
  descripcion: string | null;
  precioVenta: number | string;
  costoPromedioPMP?: number | string;
  porcentajeGanancia?: number | string;
  stockActual: number;
  cantidadMinima: number;
}

interface FormularioRepuesto {
  nombre: string;
  categoriaId: string;
  descripcion: string;
  porcentajeGanancia: string;
  cantidadMinima: string;
}

type Vista =
  | 'todos'
  | 'precios'
  | 'existencias'
  | 'alertas';

const formularioInicial: FormularioRepuesto = {
  nombre: '',
  categoriaId: '',
  descripcion: '',
  porcentajeGanancia: '30',
  cantidadMinima: '5'
};

function mostrarDinero(valor: number | string) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(valor));
}

function obtenerEncabezados() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${obtenerToken() ?? ''}`
  };
}

async function leerRespuesta(respuesta: Response) {
  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    throw new Error(
      datos?.mensaje ||
      `Error en la solicitud (${respuesta.status})`
    );
  }

  return datos;
}

export default function Repuestos() {
  const [repuestos, setRepuestos] =
    useState<Repuesto[]>([]);

  const [categorias, setCategorias] =
    useState<Categoria[]>([]);

  const [esAdministrador, setEsAdministrador] =
    useState(false);
  const puedeCrearRepuesto = tienePermiso('inventario.crear');
  const puedeEditarRepuesto = tienePermiso('inventario.editar');

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] =
    useState('');

  const [vista, setVista] = useState<Vista>('todos');

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [mostrarFormulario, setMostrarFormulario] =
    useState(false);

  const [repuestoEditado, setRepuestoEditado] =
    useState<Repuesto | null>(null);

  const [formulario, setFormulario] =
    useState<FormularioRepuesto>({
      ...formularioInicial
    });

  const [mostrarCategoria, setMostrarCategoria] =
    useState(false);

  const [nombreCategoria, setNombreCategoria] =
    useState('');

  const [
    descripcionCategoria,
    setDescripcionCategoria
  ] = useState('');

  // ========================================
  // CARGAR REPUESTOS Y CATEGORÍAS
  // ========================================

  async function cargarDatos() {
    setCargando(true);
    setError('');

    try {
      const encabezados = obtenerEncabezados();

      // Primero comprobar si el usuario puede
      // consultar los costos administrativos.
      let respuestaRepuestos = await fetch(
        `${API}/inventario`,
        { headers: encabezados }
      );

      if (respuestaRepuestos.status === 403) {
        setEsAdministrador(false);

        // Los demás usuarios consultan el
        // catálogo sin costos internos.
        respuestaRepuestos = await fetch(API, {
          headers: encabezados
        });
      } else if (respuestaRepuestos.ok) {
        setEsAdministrador(true);
      }

      const respuestaCategorias = await fetch(
        `${API}/categorias`,
        { headers: encabezados }
      );

      const datosRepuestos = await leerRespuesta(
        respuestaRepuestos
      );

      const datosCategorias = await leerRespuesta(
        respuestaCategorias
      );

      if (
        !Array.isArray(datosRepuestos) ||
        !Array.isArray(datosCategorias)
      ) {
        throw new Error(
          'El servidor devolvió datos no válidos'
        );
      }

      setRepuestos(datosRepuestos);
      setCategorias(datosCategorias);

    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar los repuestos'
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargarDatos();
  }, []);

  // ========================================
  // RESUMEN Y FILTROS
  // ========================================

  const agotados = repuestos.filter(
    repuesto => repuesto.stockActual === 0
  ).length;

  const stockBajo = repuestos.filter(
    repuesto =>
      repuesto.stockActual > 0 &&
      repuesto.stockActual <= repuesto.cantidadMinima
  ).length;

  const unidadesTotales = repuestos.reduce(
    (total, repuesto) =>
      total + Number(repuesto.stockActual),
    0
  );

  const valorInventario = repuestos.reduce(
    (total, repuesto) =>
      total +
      Number(repuesto.stockActual) *
      Number(repuesto.costoPromedioPMP ?? 0),
    0
  );

  const repuestosFiltrados = repuestos.filter(
    repuesto => {
      const texto = busqueda.trim().toLowerCase();

      const coincideBusqueda =
        repuesto.nombre.toLowerCase().includes(texto) ||
        (repuesto.categoriaNombre ?? '')
          .toLowerCase()
          .includes(texto) ||
        (repuesto.descripcion ?? '')
          .toLowerCase()
          .includes(texto);

      const coincideCategoria =
        filtroCategoria === '' ||
        repuesto.categoriaId === filtroCategoria;

      const coincideVista =
        vista !== 'alertas' ||
        repuesto.stockActual <= repuesto.cantidadMinima;

      return (
        coincideBusqueda &&
        coincideCategoria &&
        coincideVista
      );
    }
  );

  // ========================================
  // ABRIR FORMULARIO
  // ========================================

  function abrirNuevoRepuesto() {
    setError('');
    setMensaje('');

    setRepuestoEditado(null);

    setFormulario({
      ...formularioInicial
    });

    setMostrarFormulario(true);
  }

  function abrirEditarRepuesto(repuesto: Repuesto) {
    setError('');
    setMensaje('');

    setRepuestoEditado(repuesto);

    setFormulario({
      nombre: repuesto.nombre,
      categoriaId: repuesto.categoriaId ?? '',
      descripcion: repuesto.descripcion ?? '',
      porcentajeGanancia: String(
        repuesto.porcentajeGanancia ?? 30
      ),
      cantidadMinima: String(
        repuesto.cantidadMinima
      )
    });

    setMostrarFormulario(true);
  }

  function cerrarFormulario() {
    if (guardando) return;

    setMostrarFormulario(false);
    setRepuestoEditado(null);
    setError('');
  }

  // ========================================
  // PRECIO AUTOMÁTICO DE REFERENCIA
  // ========================================

  const costoPMP = Number(
    repuestoEditado?.costoPromedioPMP ?? 0
  );

  const porcentaje = Number(
    formulario.porcentajeGanancia
  );

  const porcentajeValido =
    formulario.porcentajeGanancia.trim() !== '' &&
    Number.isFinite(porcentaje) &&
    porcentaje >= 0 &&
    porcentaje <= 999.99;

  const precioCalculado =
    costoPMP > 0 && porcentajeValido
      ? Math.round(
          costoPMP *
          (1 + porcentaje / 100) *
          100
        ) / 100
      : 0;

  // ========================================
  // GUARDAR REPUESTO
  // ========================================

  async function guardarRepuesto(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    setError('');
    setMensaje('');

    if (!formulario.nombre.trim()) {
      setError('Ingresa el nombre del repuesto');
      return;
    }

    if (!porcentajeValido) {
      setError(
        'Ingresa un porcentaje entre 0 y 999.99'
      );
      return;
    }

    const cantidadMinima = Number(
      formulario.cantidadMinima
    );

    if (
      formulario.cantidadMinima.trim() === '' ||
      !Number.isInteger(cantidadMinima) ||
      cantidadMinima < 0
    ) {
      setError('Ingresa una cantidad mínima válida');
      return;
    }

    setGuardando(true);

    try {
      const url = repuestoEditado
        ? `${API}/${repuestoEditado.id}`
        : API;

      const respuesta = await fetch(url, {
        method: repuestoEditado ? 'PUT' : 'POST',
        headers: obtenerEncabezados(),
        body: JSON.stringify({
          nombre: formulario.nombre.trim(),

          categoriaId:
            formulario.categoriaId || null,

          descripcion:
            formulario.descripcion.trim() || null,

          porcentajeGanancia: porcentaje,

          cantidadMinima
        })
      });

      const datos = await leerRespuesta(respuesta);

      setMostrarFormulario(false);
      setRepuestoEditado(null);

      setMensaje(
        datos.mensaje ||
        'Repuesto guardado correctamente'
      );

      await cargarDatos();

    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar el repuesto'
      );
    } finally {
      setGuardando(false);
    }
  }

  // ========================================
  // CREAR CATEGORÍA
  // ========================================

  async function guardarCategoria(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (!nombreCategoria.trim()) {
      setError('Ingresa el nombre de la categoría');
      return;
    }

    setGuardando(true);
    setError('');

    try {
      const respuesta = await fetch(
        `${API}/categorias`,
        {
          method: 'POST',
          headers: obtenerEncabezados(),
          body: JSON.stringify({
            nombre: nombreCategoria.trim(),
            descripcion:
              descripcionCategoria.trim() || null
          })
        }
      );

      const datos = await leerRespuesta(respuesta);

      setCategorias(anteriores =>
        [...anteriores, datos.categoria].sort(
          (a, b) => a.nombre.localeCompare(b.nombre)
        )
      );

      setFormulario(anterior => ({
        ...anterior,
        categoriaId: datos.categoria.id
      }));

      setMostrarCategoria(false);
      setNombreCategoria('');
      setDescripcionCategoria('');

      setMensaje('Categoría registrada correctamente');

    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'No fue posible crear la categoría'
      );
    } finally {
      setGuardando(false);
    }
  }

  // ========================================
  // INTERFAZ
  // ========================================

  return (
    <div className="repuestos-pagina">

      <header className="repuestos-encabezado">
        <div>
          <span className="repuestos-etiqueta">
            CATÁLOGO DE PRODUCTOS
          </span>

          <h1>Repuestos</h1>

          <p>
            Gestiona los productos, sus precios
            y existencias del taller.
          </p>
        </div>

        <div className="repuestos-acciones">
          <button
            type="button"
            className="repuestos-btn-secundario"
            onClick={() => void cargarDatos()}
            disabled={cargando}
          >
            <RefreshCw size={17} />
            Actualizar
          </button>

          {puedeCrearRepuesto && (
            <button
              type="button"
              className="repuestos-btn-primario"
              onClick={abrirNuevoRepuesto}
            >
              <Plus size={20} />
              Nuevo repuesto
            </button>
          )}
        </div>
      </header>

      {/* MENÚ DE INTERACCIONES */}

      <div className="repuestos-menu">

        {puedeCrearRepuesto && (
          <button
            className="repuestos-menu-item"
            onClick={abrirNuevoRepuesto}
          >
            <span className="repuestos-menu-icono">
              <PackagePlus size={25} />
            </span>

            <div>
              <strong>Registrar repuesto</strong>
              <p>Crear productos y categorías</p>
            </div>
          </button>
        )}

        <button
          className={
            `repuestos-menu-item ${
              vista === 'precios' ? 'activo' : ''
            }`
          }
          onClick={() => setVista('precios')}
        >
          <span className="repuestos-menu-icono">
            <Tags size={25} />
          </span>

          <div>
            <strong>
              {esAdministrador
                ? 'Gestionar precios'
                : 'Consultar precios'}
            </strong>

            <p>
              {esAdministrador
                ? 'Ganancia y precio automático PMP'
                : 'Precios de venta disponibles'}
            </p>
          </div>
        </button>

        <button
          className={
            `repuestos-menu-item ${
              vista === 'existencias' ? 'activo' : ''
            }`
          }
          onClick={() => setVista('existencias')}
        >
          <span className="repuestos-menu-icono verde">
            <Boxes size={25} />
          </span>

          <div>
            <strong>Consultar existencias</strong>
            <p>Stock actual y cantidades mínimas</p>
          </div>
        </button>

        <button
          className={
            `repuestos-menu-item ${
              vista === 'alertas' ? 'activo' : ''
            }`
          }
          onClick={() => setVista('alertas')}
        >
          <span className="repuestos-menu-icono naranja">
            <AlertTriangle size={25} />
          </span>

          <div>
            <strong>Alertas de stock</strong>
            <p>Productos agotados o con stock bajo</p>
          </div>
        </button>

      </div>

      {/* INDICADORES */}

      <div className="repuestos-resumen">

        <div className="repuestos-indicador">
          <span>Productos registrados</span>
          <strong>{repuestos.length}</strong>
        </div>

        <div className="repuestos-indicador">
          <span>Unidades en inventario</span>
          <strong>{unidadesTotales}</strong>
        </div>

        <div className="repuestos-indicador alerta">
          <span>Stock bajo</span>
          <strong>{stockBajo}</strong>
        </div>

        <div className="repuestos-indicador peligro">
          <span>Agotados</span>
          <strong>{agotados}</strong>
        </div>

      </div>

      {esAdministrador && (
        <div className="repuestos-valor-inventario">
          <div>
            <span>Valor del inventario a costo PMP</span>
            <small>
              Calculado con las existencias actuales
            </small>
          </div>

          <strong>{mostrarDinero(valorInventario)}</strong>
        </div>
      )}

      {error && !mostrarFormulario && (
        <div className="repuestos-mensaje error">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="repuestos-mensaje exito">
          {mensaje}
        </div>
      )}

      {/* LISTADO DE REPUESTOS */}

      <section className="repuestos-contenedor">

        <div className="repuestos-listado-titulo">
          <div>
            <h2>
              {vista === 'precios'
                ? 'Precios de repuestos'
                : vista === 'existencias'
                ? 'Existencias de repuestos'
                : vista === 'alertas'
                ? 'Alertas de inventario'
                : 'Catálogo de repuestos'}
            </h2>

            <p>
              {repuestosFiltrados.length} productos
            </p>
          </div>

          {vista !== 'todos' && (
            <button
              className="repuestos-btn-secundario"
              onClick={() => setVista('todos')}
            >
              Ver todos
            </button>
          )}
        </div>

        <div className="repuestos-filtros">

          <div className="repuestos-buscador">
            <Search size={20} />

            <input
              type="text"
              placeholder="Buscar por nombre o categoría..."
              value={busqueda}
              onChange={evento =>
                setBusqueda(evento.target.value)
              }
            />
          </div>

          <select
            value={filtroCategoria}
            onChange={evento =>
              setFiltroCategoria(evento.target.value)
            }
          >
            <option value="">
              Todas las categorías
            </option>

            {categorias.map(categoria => (
              <option
                key={categoria.id}
                value={categoria.id}
              >
                {categoria.nombre}
              </option>
            ))}
          </select>

        </div>

        {cargando ? (
          <div className="repuestos-vacio">
            Cargando repuestos...
          </div>
        ) : repuestosFiltrados.length === 0 ? (
          <div className="repuestos-vacio">
            <Package size={40} />

            <h3>
              {vista === 'alertas'
                ? 'No hay alertas para mostrar'
                : 'No se encontraron repuestos'}
            </h3>

            <p>
              {repuestos.length === 0
                ? 'Registra los primeros productos del taller.'
                : 'Prueba cambiando los filtros.'}
            </p>

            {puedeCrearRepuesto &&
              repuestos.length === 0 && (
                <button
                  className="repuestos-btn-primario"
                  onClick={abrirNuevoRepuesto}
                >
                  <Plus size={18} />
                  Registrar primer repuesto
                </button>
              )}
          </div>
        ) : (
          <div className="repuestos-tabla-scroll">
            <table className="repuestos-tabla">
              <thead>
                <tr>
                  <th>Repuesto</th>
                  <th>Categoría</th>

                  {puedeEditarRepuesto && (
                    <>
                      <th>Costo PMP</th>
                      <th>Ganancia</th>
                    </>
                  )}

                  <th>Precio venta</th>
                  <th>Stock</th>
                  <th>Stock mín.</th>
                  <th>Estado</th>

                  {puedeEditarRepuesto && (
                    <th>Acciones</th>
                  )}
                </tr>
              </thead>

              <tbody>
                {repuestosFiltrados.map(repuesto => {
                  const estado =
                    repuesto.stockActual === 0
                      ? 'agotado'
                      : repuesto.stockActual <=
                        repuesto.cantidadMinima
                      ? 'bajo'
                      : 'disponible';

                  return (
                    <tr key={repuesto.id}>
                      <td>
                        <strong>{repuesto.nombre}</strong>

                        {repuesto.descripcion && (
                          <small>
                            {repuesto.descripcion}
                          </small>
                        )}
                      </td>

                      <td>
                        {repuesto.categoriaNombre ||
                          'Sin categoría'}
                      </td>

                      {esAdministrador && (
                        <>
                          <td>
                            {mostrarDinero(
                              repuesto.costoPromedioPMP ?? 0
                            )}
                          </td>

                          <td>
                            {Number(
                              repuesto.porcentajeGanancia ?? 30
                            )}%
                          </td>
                        </>
                      )}

                      <td className="repuestos-precio">
                        {Number(repuesto.precioVenta) > 0
                          ? mostrarDinero(
                              repuesto.precioVenta
                            )
                          : 'Pendiente'}
                      </td>

                      <td>{repuesto.stockActual}</td>

                      <td>{repuesto.cantidadMinima}</td>

                      <td>
                        <span
                          className={
                            `repuestos-estado ${estado}`
                          }
                        >
                          {estado === 'agotado'
                            ? 'Agotado'
                            : estado === 'bajo'
                            ? 'Stock bajo'
                            : 'Disponible'}
                        </span>
                      </td>

                      {esAdministrador && (
                        <td>
                          <button
                            className="repuestos-btn-editar"
                            title="Editar repuesto"
                            onClick={() =>
                              abrirEditarRepuesto(repuesto)
                            }
                          >
                            <Pencil size={15} />
                            Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}
      </section>

      {/* FORMULARIO DE REPUESTO */}

      {mostrarFormulario && (
        <div
          className="repuestos-modal-fondo"
          onClick={cerrarFormulario}
        >
          <section
            className="repuestos-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Formulario de repuesto"
            onClick={evento => evento.stopPropagation()}
          >
            <header className="repuestos-modal-header">
              <div>
                <h2>
                  {repuestoEditado
                    ? 'Editar repuesto'
                    : 'Registrar nuevo repuesto'}
                </h2>

                <p>
                  El precio de venta se calcula
                  automáticamente mediante PMP.
                </p>
              </div>

              <button
                className="repuestos-btn-cerrar"
                onClick={cerrarFormulario}
                disabled={guardando}
                aria-label="Cerrar formulario"
              >
                <X size={23} />
              </button>
            </header>

            <form
              className="repuestos-formulario"
              onSubmit={guardarRepuesto}
            >

              {error && (
                <div className="repuestos-mensaje error">
                  {error}
                </div>
              )}

              <label>
                Nombre del repuesto *

                <input
                  type="text"
                  required
                  maxLength={150}
                  placeholder="Ej. Aceite 4T 20W50"
                  value={formulario.nombre}
                  onChange={evento =>
                    setFormulario({
                      ...formulario,
                      nombre: evento.target.value
                    })
                  }
                />
              </label>

              <label>
                Categoría

                <div className="repuestos-categoria-campo">
                  <select
                    value={formulario.categoriaId}
                    onChange={evento =>
                      setFormulario({
                        ...formulario,
                        categoriaId: evento.target.value
                      })
                    }
                  >
                    <option value="">
                      Sin categoría
                    </option>

                    {categorias.map(categoria => (
                      <option
                        key={categoria.id}
                        value={categoria.id}
                      >
                        {categoria.nombre}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="repuestos-btn-secundario"
                    onClick={() => {
                      setError('');
                      setMostrarCategoria(true);
                    }}
                  >
                    <Plus size={17} />
                    Nueva
                  </button>
                </div>
              </label>

              <label>
                Descripción

                <textarea
                  rows={3}
                  maxLength={10000}
                  placeholder="Características del producto..."
                  value={formulario.descripcion}
                  onChange={evento =>
                    setFormulario({
                      ...formulario,
                      descripcion: evento.target.value
                    })
                  }
                />
              </label>

              <div className="repuestos-form-grid">
                <label>
                  Stock mínimo *

                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={formulario.cantidadMinima}
                    onChange={evento =>
                      setFormulario({
                        ...formulario,
                        cantidadMinima: evento.target.value
                      })
                    }
                  />
                </label>

                <label>
                  Ganancia sobre costo (%) *

                  <input
                    type="number"
                    min="0"
                    max="999.99"
                    step="0.01"
                    required
                    value={formulario.porcentajeGanancia}
                    onChange={evento =>
                      setFormulario({
                        ...formulario,
                        porcentajeGanancia:
                          evento.target.value
                      })
                    }
                  />
                </label>
              </div>

              <div className="repuestos-calculo">
                <h3>Precio automático PMP</h3>

                <div className="repuestos-calculo-fila">
                  <span>Stock actual</span>

                  <strong>
                    {repuestoEditado?.stockActual ?? 0}
                    {' '}unidades
                  </strong>
                </div>

                <div className="repuestos-calculo-fila">
                  <span>Costo promedio PMP</span>
                  <strong>{mostrarDinero(costoPMP)}</strong>
                </div>

                <div className="repuestos-calculo-fila">
                  <span>Ganancia por unidad</span>

                  <strong>
                    {mostrarDinero(
                      Math.max(0, precioCalculado - costoPMP)
                    )}
                  </strong>
                </div>

                <div className="repuestos-calculo-total">
                  <span>Precio de venta estimado</span>

                  <strong>
                    {costoPMP > 0 && porcentajeValido
                      ? mostrarDinero(precioCalculado)
                      : costoPMP === 0 &&
                        Number(repuestoEditado?.precioVenta ?? 0) > 0
                      ? mostrarDinero(
                          repuestoEditado!.precioVenta
                        )
                      : 'Pendiente'}
                  </strong>
                </div>

                <p>
                  {costoPMP === 0
                    ? 'El precio automático se calculará cuando exista un costo de adquisición. Si hay un precio anterior, se conservará mientras tanto.'
                    : 'El servidor confirmará el precio definitivo al guardar.'}
                </p>
              </div>

              <footer className="repuestos-modal-footer">
                <button
                  type="button"
                  className="repuestos-btn-secundario"
                  onClick={cerrarFormulario}
                  disabled={guardando}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="repuestos-btn-primario"
                  disabled={guardando}
                >
                  {guardando
                    ? 'Guardando...'
                    : 'Guardar repuesto'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {/* FORMULARIO DE CATEGORÍA */}

      {mostrarCategoria && (
        <div className="repuestos-modal-fondo categoria">
          <section
            className="repuestos-modal pequeno"
            role="dialog"
            aria-modal="true"
            aria-label="Nueva categoría"
          >
            <header className="repuestos-modal-header">
              <div>
                <h2>Nueva categoría</h2>
                <p>Organiza los repuestos del taller.</p>
              </div>

              <button
                className="repuestos-btn-cerrar"
                disabled={guardando}
                aria-label="Cerrar categoría"
                onClick={() => {
                  setMostrarCategoria(false);
                  setError('');
                }}
              >
                <X size={23} />
              </button>
            </header>

            <form
              className="repuestos-formulario"
              onSubmit={guardarCategoria}
            >

              {error && (
                <div className="repuestos-mensaje error">
                  {error}
                </div>
              )}

              <label>
                Nombre *

                <input
                  type="text"
                  required
                  maxLength={100}
                  value={nombreCategoria}
                  placeholder="Ej. Lubricantes"
                  onChange={evento =>
                    setNombreCategoria(evento.target.value)
                  }
                />
              </label>

              <label>
                Descripción

                <textarea
                  rows={3}
                  maxLength={255}
                  value={descripcionCategoria}
                  onChange={evento =>
                    setDescripcionCategoria(
                      evento.target.value
                    )
                  }
                />
              </label>

              <footer className="repuestos-modal-footer">
                <button
                  type="button"
                  className="repuestos-btn-secundario"
                  disabled={guardando}
                  onClick={() => {
                    setMostrarCategoria(false);
                    setError('');
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="repuestos-btn-primario"
                  disabled={guardando}
                >
                  {guardando
                    ? 'Guardando...'
                    : 'Guardar categoría'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

    </div>
  );
}
