
import { useEffect, useState, type FormEvent } from "react";

import {
  Search,
  RefreshCw,
  Wrench,
  Plus,
  ArrowLeft,
  Save,
  Pencil,
  Power,
  RotateCcw
} from "lucide-react";

import {
  obtenerToken,
  tienePermiso
} from "../services/auth";

import "./CatalogoServicios.css";

interface TipoServicio {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  precioManoObra: number | string;
  activo: number;
}

const API_URL = "https://uraba-motors-fc.onrender.com/api/catalogo-servicios";

export default function CatalogoServicios() {

  // LISTADO DE SERVICIOS
  const [servicios, setServicios] = useState<TipoServicio[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensajeExito, setMensajeExito] = useState("");

  // FORMULARIO
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [servicioEditando, setServicioEditando] =
    useState<string | null>(null);

  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precioManoObra, setPrecioManoObra] = useState("0");

  const [guardando, setGuardando] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState("");

  // ACTIVAR / DESACTIVAR
  const [cambiandoEstado, setCambiandoEstado] =
    useState<string | null>(null);

  const puedeCrearServicio = tienePermiso("servicios.crear");
  const puedeEditarServicio = tienePermiso("servicios.editar");

  // CONSULTAR SERVICIOS DESDE MYSQL
  async function cargarServicios() {
    setCargando(true);
    setError("");

    try {
      const token = obtenerToken();

      if (!token) {
        throw new Error("La sesión no está disponible");
      }

      const respuesta = await fetch(API_URL, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const tipoRespuesta =
        respuesta.headers.get("content-type") || "";

      if (!tipoRespuesta.includes("application/json")) {
        throw new Error(
          `Respuesta inesperada del servidor (HTTP ${respuesta.status})`
        );
      }

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.mensaje || "No se pudo consultar el catálogo"
        );
      }

      if (!Array.isArray(datos.servicios)) {
        throw new Error("El catálogo recibido no es válido");
      }

      setServicios(datos.servicios);

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado"
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarServicios();
  }, []);

  // LIMPIAR FORMULARIO
  function limpiarFormulario() {
    setCodigo("");
    setNombre("");
    setDescripcion("");
    setPrecioManoObra("0");
    setErrorFormulario("");
  }

  // SUGERIR EL SIGUIENTE CÓDIGO
  function sugerirSiguienteCodigo() {
    const numeros = servicios
      .map((servicio) => {
        const coincidencia =
          servicio.codigo.match(/^SER-(\d+)$/i);

        return coincidencia
          ? Number(coincidencia[1])
          : 0;
      })
      .filter((numero) => Number.isSafeInteger(numero));

    const siguienteNumero = Math.max(0, ...numeros) + 1;

    return `SER-${String(siguienteNumero).padStart(3, "0")}`;
  }

  // ABRIR FORMULARIO PARA CREAR
  function abrirFormulario() {
    setServicioEditando(null);
    limpiarFormulario();

    setCodigo(sugerirSiguienteCodigo());
    setMensajeExito("");
    setMostrarFormulario(true);
  }

  // ABRIR FORMULARIO PARA EDITAR
  function abrirEdicion(servicio: TipoServicio) {
    setServicioEditando(servicio.id);

    setCodigo(servicio.codigo);
    setNombre(servicio.nombre);
    setDescripcion(servicio.descripcion || "");
    setPrecioManoObra(String(servicio.precioManoObra));

    setErrorFormulario("");
    setMensajeExito("");
    setMostrarFormulario(true);
  }

  // CERRAR FORMULARIO
  function cerrarFormulario() {
    setMostrarFormulario(false);
    setServicioEditando(null);
    limpiarFormulario();
  }

  // CREAR O ACTUALIZAR TIPO DE SERVICIO
  async function guardarTipoServicio(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (guardando) return;

    setErrorFormulario("");
    setMensajeExito("");

    const precio = Number(precioManoObra);

    if (
      !codigo.trim() ||
      codigo.trim().length > 30 ||
      !nombre.trim() ||
      nombre.trim().length > 120 ||
      precioManoObra.trim() === "" ||
      !Number.isFinite(precio) ||
      precio < 0 ||
      precio > 9999999999.99 ||
      Math.round(precio * 100) / 100 !== precio
    ) {
      setErrorFormulario(
        "Verifica el código, nombre y precio del servicio."
      );
      return;
    }

    setGuardando(true);

    const estabaEditando = servicioEditando !== null;

    try {
      const token = obtenerToken();

      if (!token) {
        throw new Error("Tu sesión no está disponible");
      }

      const url = estabaEditando
        ? `${API_URL}/${servicioEditando}`
        : API_URL;

      const respuesta = await fetch(url, {
        method: estabaEditando ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          descripcion: descripcion.trim(),
          precioManoObra: precio
        })
      });

      const tipoRespuesta =
        respuesta.headers.get("content-type") || "";

      if (!tipoRespuesta.includes("application/json")) {
        throw new Error(
          `El servidor respondió con un formato incorrecto (HTTP ${respuesta.status})`
        );
      }

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.mensaje || "No se pudo guardar el servicio"
        );
      }

      cerrarFormulario();

      setMensajeExito(
        estabaEditando
          ? "Tipo de servicio actualizado correctamente."
          : "Tipo de servicio registrado correctamente."
      );

      await cargarServicios();

    } catch (err) {
      const mensaje =
        err instanceof Error
          ? err.message
          : "Ocurrió un error al guardar";

      if (mostrarFormulario) {
        setErrorFormulario(mensaje);
      } else {
        setError(mensaje);
      }
    } finally {
      setGuardando(false);
    }
  }

  // ACTIVAR O DESACTIVAR TIPO DE SERVICIO
  async function cambiarEstado(servicio: TipoServicio) {
    if (cambiandoEstado) return;

    const nuevoEstado = !Boolean(servicio.activo);

    const accion = nuevoEstado
      ? "reactivar"
      : "desactivar";

    const confirmado = window.confirm(
      `¿Deseas ${accion} el servicio "${servicio.nombre}"?`
    );

    if (!confirmado) return;

    setCambiandoEstado(servicio.id);
    setError("");
    setMensajeExito("");

    try {
      const token = obtenerToken();

      if (!token) {
        throw new Error("Tu sesión no está disponible");
      }

      const respuesta = await fetch(
        `${API_URL}/${servicio.id}/estado`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            activo: nuevoEstado
          })
        }
      );

      const tipoRespuesta =
        respuesta.headers.get("content-type") || "";

      if (!tipoRespuesta.includes("application/json")) {
        throw new Error(
          `Respuesta inesperada del servidor (HTTP ${respuesta.status})`
        );
      }

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.mensaje || "No se pudo cambiar el estado"
        );
      }

      await cargarServicios();

      setMensajeExito(
        nuevoEstado
          ? "Tipo de servicio reactivado correctamente."
          : "Tipo de servicio desactivado correctamente."
      );

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al cambiar el estado"
      );
    } finally {
      setCambiandoEstado(null);
    }
  }

  // BUSCAR POR NOMBRE O CÓDIGO
  const serviciosFiltrados = servicios.filter((servicio) => {
    const texto = busqueda.toLocaleLowerCase().trim();

    return (
      servicio.nombre.toLocaleLowerCase().includes(texto) ||
      servicio.codigo.toLocaleLowerCase().includes(texto)
    );
  });

  // FORMATO DE PRECIOS COLOMBIANOS
  function formatearPrecio(precio: number | string) {
    return Number(precio).toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0
    });
  }

  return (
    <section className="catalogo-servicios">

      {/* ENCABEZADO */}
      <div className="catalogo-encabezado">
        <div>
          <h2>Gestionar tipos de servicios</h2>

          <p>
            Consulta y administra los trabajos
            que ofrece URABÁ MOTORS FC.
          </p>
        </div>

        {!mostrarFormulario && (
          <div className="catalogo-botones">

            <button
              type="button"
              className="catalogo-actualizar"
              onClick={() => {
                setMensajeExito("");
                cargarServicios();
              }}
              disabled={cargando}
            >
              <RefreshCw size={17} />
              Actualizar
            </button>

            {puedeCrearServicio && (
              <button
                type="button"
                className="catalogo-nuevo"
                onClick={abrirFormulario}
              >
                <Plus size={18} />
                Nuevo tipo de servicio
              </button>
            )}

          </div>
        )}
      </div>

      {/* FORMULARIO DE CREACIÓN Y EDICIÓN */}
      {mostrarFormulario ? (

        <form
          className="catalogo-formulario"
          onSubmit={guardarTipoServicio}
        >

          <div className="catalogo-formulario-titulo">
            <h3>
              {servicioEditando
                ? "Editar tipo de servicio"
                : "Registrar nuevo tipo de servicio"}
            </h3>

            <p>
              {servicioEditando
                ? "Modifica los datos del mantenimiento seleccionado."
                : "Completa la información del mantenimiento que ofrece el taller."}
            </p>
          </div>

          <div className="catalogo-campos">

            <div className="catalogo-campo">
              <label htmlFor="catalogo-codigo">
                Código del servicio
              </label>

              <input
                id="catalogo-codigo"
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ejemplo: SER-006"
                maxLength={30}
                required
              />
            </div>

            <div className="catalogo-campo">
              <label htmlFor="catalogo-nombre">
                Nombre del servicio
              </label>

              <input
                id="catalogo-nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ejemplo: Ajuste de cadena"
                maxLength={120}
                required
              />
            </div>

            <div className="catalogo-campo catalogo-campo-ancho">
              <label htmlFor="catalogo-descripcion">
                Descripción
              </label>

              <textarea
                id="catalogo-descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Describe el trabajo que se realiza..."
                rows={4}
              />
            </div>

            <div className="catalogo-campo">
              <label htmlFor="catalogo-precio">
                Precio de mano de obra (COP)
              </label>

              <input
                id="catalogo-precio"
                type="number"
                min="0"
                max="9999999999.99"
                step="0.01"
                value={precioManoObra}
                onChange={(e) =>
                  setPrecioManoObra(e.target.value)
                }
                required
              />

              <small>
                Puedes ingresar 0 si todavía no
                tienes una tarifa definida.
              </small>
            </div>

          </div>

          {errorFormulario && (
            <p className="catalogo-error" role="alert">
              {errorFormulario}
            </p>
          )}

          <div className="catalogo-formulario-acciones">

            <button
              type="button"
              className="catalogo-cancelar"
              onClick={cerrarFormulario}
              disabled={guardando}
            >
              <ArrowLeft size={17} />
              Cancelar
            </button>

            <button
              type="submit"
              className="catalogo-nuevo"
              disabled={guardando}
            >
              <Save size={17} />

              {guardando
                ? "Guardando..."
                : servicioEditando
                  ? "Guardar cambios"
                  : "Guardar servicio"}
            </button>

          </div>

        </form>

      ) : (

        <>
          {/* MENSAJES */}
          {mensajeExito && (
            <p className="catalogo-exito" role="status">
              {mensajeExito}
            </p>
          )}

          {/* BUSCADOR */}
          <div className="catalogo-buscador">
            <Search size={20} />

            <input
              type="search"
              placeholder="Buscar por nombre o código..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          {cargando && (
            <p>Cargando servicios...</p>
          )}

          {error && (
            <p className="catalogo-error" role="alert">
              {error}
            </p>
          )}

          {/* LISTADO */}
          {!cargando && !error && (
            <div className="catalogo-lista">

              {serviciosFiltrados.length === 0 ? (

                <p>No se encontraron servicios.</p>

              ) : (

                serviciosFiltrados.map((servicio) => (

                  <article
                    className="catalogo-tarjeta"
                    key={servicio.id}
                  >

                    <div className="catalogo-icono">
                      <Wrench size={22} />
                    </div>

                    <div className="catalogo-informacion">

                      <span className="catalogo-codigo">
                        {servicio.codigo}
                      </span>

                      <h3>{servicio.nombre}</h3>

                      <p>
                        {servicio.descripcion ||
                          "Sin descripción registrada"}
                      </p>

                    </div>

                    <div className="catalogo-derecha">

                      <strong>
                        {formatearPrecio(
                          servicio.precioManoObra
                        )}
                      </strong>

                      <span
                        className={
                          servicio.activo
                            ? "catalogo-estado activo"
                            : "catalogo-estado inactivo"
                        }
                      >
                        {servicio.activo
                          ? "Activo"
                          : "Inactivo"}
                      </span>

                      {/* BOTONES DE ADMINISTRACIÓN */}
                      {puedeEditarServicio && (

                        <div className="catalogo-acciones-tarjeta">

                          <button
                            type="button"
                            className="catalogo-boton-editar"
                            onClick={() => abrirEdicion(servicio)}
                            disabled={cambiandoEstado !== null}
                          >
                            <Pencil size={15} />
                            Editar
                          </button>

                          <button
                            type="button"
                            className="catalogo-boton-estado"
                            onClick={() => cambiarEstado(servicio)}
                            disabled={cambiandoEstado !== null}
                          >
                            {cambiandoEstado === servicio.id ? (
                              <>
                                <RefreshCw size={15} />
                                Guardando...
                              </>
                            ) : servicio.activo ? (
                              <>
                                <Power size={15} />
                                Desactivar
                              </>
                            ) : (
                              <>
                                <RotateCcw size={15} />
                                Reactivar
                              </>
                            )}
                          </button>

                        </div>

                      )}

                    </div>

                  </article>

                ))

              )}

            </div>
          )}

        </>
      )}

    </section>
  );
}
