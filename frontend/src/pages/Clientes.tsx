
import { useEffect, useState, type FormEvent } from "react";
import {
  Users,
  Search,
  Plus,
  Pencil,
  Archive,
  RotateCcw,
  ArrowLeft,
  Save,
  RefreshCw
} from "lucide-react";

import { obtenerToken } from "../services/auth";
import "./Clientes.css";

interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  direccion: string | null;
  ciudad: string | null;
  activo: number;
  created: string;
  updated: string;
}

interface FormularioCliente {
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  ciudad: string;
}

const API_URL = "http://localhost:3000/api/clientes";

const formularioVacio: FormularioCliente = {
  nombre: "",
  telefono: "",
  email: "",
  direccion: "",
  ciudad: ""
};

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("activos");

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState<string | null>(null);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<FormularioCliente>(
    formularioVacio
  );

  const [error, setError] = useState("");
  const [errorFormulario, setErrorFormulario] = useState("");
  const [mensajeExito, setMensajeExito] = useState("");

  // PETICIONES A LA API
  async function consultarAPI(
    url: string,
    opciones: RequestInit = {}
  ) {
    const token = obtenerToken();

    if (!token) {
      throw new Error("Tu sesión no está disponible");
    }

    const respuesta = await fetch(url, {
      ...opciones,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...opciones.headers
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
        datos.mensaje || `Error del servidor (${respuesta.status})`
      );
    }

    return datos;
  }

  // CONSULTAR CLIENTES EN MYSQL
  async function cargarClientes() {
    setCargando(true);
    setError("");

    try {
      const datos = await consultarAPI(API_URL);

      if (!Array.isArray(datos.clientes)) {
        throw new Error("El listado de clientes no es válido");
      }

      setClientes(datos.clientes);
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron consultar los clientes"
      );
      return false;
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarClientes();
  }, []);

  // ACTUALIZAR CAMPOS DEL FORMULARIO
  function cambiarCampo(
    campo: keyof FormularioCliente,
    valor: string
  ) {
    setFormulario((anterior) => ({
      ...anterior,
      [campo]: valor
    }));
  }

  // ABRIR FORMULARIO PARA CREAR
  function abrirNuevoCliente() {
    setClienteEditando(null);
    setFormulario({ ...formularioVacio });
    setErrorFormulario("");
    setMensajeExito("");
    setMostrarFormulario(true);
  }

  // ABRIR FORMULARIO PARA EDITAR
  function abrirEdicion(cliente: Cliente) {
    setClienteEditando(cliente.id);

    setFormulario({
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      email: cliente.email || "",
      direccion: cliente.direccion || "",
      ciudad: cliente.ciudad || ""
    });

    setErrorFormulario("");
    setMensajeExito("");
    setMostrarFormulario(true);
  }

  function cerrarFormulario() {
    setMostrarFormulario(false);
    setClienteEditando(null);
    setFormulario({ ...formularioVacio });
    setErrorFormulario("");
  }

  // CREAR O EDITAR CLIENTE
  async function guardarCliente(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (guardando) return;

    setErrorFormulario("");
    setMensajeExito("");

    if (
      !formulario.nombre.trim() ||
      formulario.nombre.trim().length > 100 ||
      !formulario.telefono.trim() ||
      formulario.telefono.trim().length > 20
    ) {
      setErrorFormulario(
        "El nombre y el teléfono son obligatorios."
      );
      return;
    }

    setGuardando(true);

    const editando = clienteEditando !== null;

    try {
      const url = editando
        ? `${API_URL}/${clienteEditando}`
        : API_URL;

      await consultarAPI(url, {
        method: editando ? "PUT" : "POST",
        body: JSON.stringify({
          nombre: formulario.nombre.trim(),
          telefono: formulario.telefono.trim(),
          email: formulario.email.trim() || null,
          direccion: formulario.direccion.trim() || null,
          ciudad: formulario.ciudad.trim() || null
        })
      });

      cerrarFormulario();

      setBusqueda("");
      setFiltro("activos");

      const actualizado = await cargarClientes();

      if (actualizado) {
        setMensajeExito(
          editando
            ? "Cliente actualizado correctamente."
            : "Cliente registrado correctamente."
        );
      }
    } catch (err) {
      setErrorFormulario(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el cliente"
      );
    } finally {
      setGuardando(false);
    }
  }

  // ARCHIVAR O REACTIVAR CLIENTE
  async function cambiarEstado(cliente: Cliente) {
    if (cambiandoEstado) return;

    const nuevoEstado = !Boolean(cliente.activo);
    const accion = nuevoEstado ? "reactivar" : "archivar";

    const confirmado = window.confirm(
      `¿Deseas ${accion} al cliente "${cliente.nombre}"?`
    );

    if (!confirmado) return;

    setCambiandoEstado(cliente.id);
    setError("");
    setMensajeExito("");

    try {
      await consultarAPI(
        `${API_URL}/${cliente.id}/estado`,
        {
          method: "PATCH",
          body: JSON.stringify({
            activo: nuevoEstado
          })
        }
      );

      const actualizado = await cargarClientes();

      if (actualizado) {
        setMensajeExito(
          nuevoEstado
            ? "Cliente reactivado correctamente."
            : "Cliente archivado correctamente."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cambiar el estado"
      );
    } finally {
      setCambiandoEstado(null);
    }
  }

  // BUSCAR Y FILTRAR CLIENTES
  const clientesFiltrados = clientes.filter((cliente) => {
    const texto = busqueda.trim().toLocaleLowerCase();

    const coincideBusqueda = [
      cliente.nombre,
      cliente.telefono,
      cliente.email || "",
      cliente.ciudad || ""
    ].some((valor) =>
      valor.toLocaleLowerCase().includes(texto)
    );

    const coincideEstado =
      filtro === "todos" ||
      (filtro === "activos" && Boolean(cliente.activo)) ||
      (filtro === "archivados" && !Boolean(cliente.activo));

    return coincideBusqueda && coincideEstado;
  });

  return (
    <section className="clientes-pagina">

      <div className="clientes-encabezado">
        <div>
          <h1>Gestión de Clientes</h1>
          <p>
            Administra los clientes registrados
            en URABÁ MOTORS FC.
          </p>
        </div>

        {!mostrarFormulario && (
          <div className="clientes-encabezado-botones">
            <button
              type="button"
              className="clientes-boton-secundario"
              onClick={() => {
                setMensajeExito("");
                cargarClientes();
              }}
              disabled={cargando}
            >
              <RefreshCw size={17} />
              Actualizar
            </button>

            <button
              type="button"
              className="clientes-boton-primario"
              onClick={abrirNuevoCliente}
            >
              <Plus size={18} />
              Nuevo cliente
            </button>
          </div>
        )}
      </div>

      {mostrarFormulario ? (

        <form
          className="clientes-formulario"
          onSubmit={guardarCliente}
        >
          <h2>
            {clienteEditando
              ? "Editar cliente"
              : "Registrar nuevo cliente"}
          </h2>

          <p>
            Completa la información del cliente.
            Los campos marcados con * son obligatorios.
          </p>

          <div className="clientes-campos">

            <div className="clientes-campo">
              <label htmlFor="cliente-nombre">
                Nombre completo *
              </label>

              <input
                id="cliente-nombre"
                type="text"
                value={formulario.nombre}
                onChange={(e) =>
                  cambiarCampo("nombre", e.target.value)
                }
                placeholder="Nombre del cliente"
                maxLength={100}
                required
              />
            </div>

            <div className="clientes-campo">
              <label htmlFor="cliente-telefono">
                Teléfono *
              </label>

              <input
                id="cliente-telefono"
                type="tel"
                value={formulario.telefono}
                onChange={(e) =>
                  cambiarCampo("telefono", e.target.value)
                }
                placeholder="Número de contacto"
                maxLength={20}
                required
              />
            </div>

            <div className="clientes-campo">
              <label htmlFor="cliente-email">
                Correo electrónico
              </label>

              <input
                id="cliente-email"
                type="email"
                value={formulario.email}
                onChange={(e) =>
                  cambiarCampo("email", e.target.value)
                }
                placeholder="correo@ejemplo.com"
                maxLength={150}
              />
            </div>

            <div className="clientes-campo">
              <label htmlFor="cliente-ciudad">
                Ciudad
              </label>

              <input
                id="cliente-ciudad"
                type="text"
                value={formulario.ciudad}
                onChange={(e) =>
                  cambiarCampo("ciudad", e.target.value)
                }
                placeholder="Ciudad del cliente"
                maxLength={100}
              />
            </div>

            <div className="clientes-campo clientes-campo-completo">
              <label htmlFor="cliente-direccion">
                Dirección
              </label>

              <input
                id="cliente-direccion"
                type="text"
                value={formulario.direccion}
                onChange={(e) =>
                  cambiarCampo("direccion", e.target.value)
                }
                placeholder="Dirección de residencia"
                maxLength={255}
              />
            </div>

          </div>

          {errorFormulario && (
            <p className="clientes-error" role="alert">
              {errorFormulario}
            </p>
          )}

          <div className="clientes-formulario-acciones">
            <button
              type="button"
              className="clientes-boton-secundario"
              onClick={cerrarFormulario}
              disabled={guardando}
            >
              <ArrowLeft size={17} />
              Cancelar
            </button>

            <button
              type="submit"
              className="clientes-boton-primario"
              disabled={guardando}
            >
              <Save size={17} />
              {guardando
                ? "Guardando..."
                : clienteEditando
                  ? "Guardar cambios"
                  : "Registrar cliente"}
            </button>
          </div>
        </form>

      ) : (

        <>
          {mensajeExito && (
            <p className="clientes-exito" role="status">
              {mensajeExito}
            </p>
          )}

          <div className="clientes-filtros">
            <div className="clientes-buscador">
              <Search size={20} />

              <input
                type="search"
                placeholder="Buscar nombre, teléfono, correo o ciudad..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <select
              aria-label="Filtrar clientes por estado"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            >
              <option value="activos">Activos</option>
              <option value="archivados">Archivados</option>
              <option value="todos">Todos</option>
            </select>
          </div>

          <div className="clientes-contador">
            <Users size={18} />
            {clientesFiltrados.length} clientes encontrados
          </div>

          {cargando && <p>Cargando clientes...</p>}

          {error && (
            <p className="clientes-error" role="alert">
              {error}
            </p>
          )}

          {!cargando && !error && (
            <div className="clientes-lista">

              {clientesFiltrados.length === 0 ? (
                <div className="clientes-vacio">
                  <Users size={36} />
                  <p>No se encontraron clientes.</p>
                </div>
              ) : (
                clientesFiltrados.map((cliente) => (
                  <article
                    className="clientes-tarjeta"
                    key={cliente.id}
                  >
                    <div className="clientes-avatar">
                      {cliente.nombre.charAt(0).toUpperCase()}
                    </div>

                    <div className="clientes-informacion">
                      <div className="clientes-nombre-fila">
                        <h3>{cliente.nombre}</h3>

                        <span
                          className={
                            cliente.activo
                              ? "clientes-estado activo"
                              : "clientes-estado archivado"
                          }
                        >
                          {cliente.activo
                            ? "Activo"
                            : "Archivado"}
                        </span>
                      </div>

                      <p>Teléfono: {cliente.telefono}</p>

                      {cliente.email && (
                        <p>Correo: {cliente.email}</p>
                      )}

                      {cliente.ciudad && (
                        <p>Ciudad: {cliente.ciudad}</p>
                      )}

                      {cliente.direccion && (
                        <p>Dirección: {cliente.direccion}</p>
                      )}
                    </div>

                    <div className="clientes-acciones">
                      <button
                        type="button"
                        className="clientes-boton-editar"
                        onClick={() => abrirEdicion(cliente)}
                        disabled={cambiandoEstado !== null}
                      >
                        <Pencil size={16} />
                        Editar
                      </button>

                      <button
                        type="button"
                        className="clientes-boton-estado"
                        onClick={() => cambiarEstado(cliente)}
                        disabled={cambiandoEstado !== null}
                      >
                        {cambiandoEstado === cliente.id ? (
                          "Guardando..."
                        ) : cliente.activo ? (
                          <>
                            <Archive size={16} />
                            Archivar
                          </>
                        ) : (
                          <>
                            <RotateCcw size={16} />
                            Reactivar
                          </>
                        )}
                      </button>
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
