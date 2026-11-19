
import { useEffect, useState, type FormEvent } from "react";
import {
  Bike,
  Search,
  Plus,
  Pencil,
  Archive,
  RotateCcw,
  ArrowLeft,
  Save,
  RefreshCw,
  CheckCircle2
} from "lucide-react";

import { obtenerToken } from "../services/auth";
import "./Motocicletas.css";

interface Moto {
  id: string;
  clienteId: string;
  marca: string;
  modelo: string;
  anio: number;
  placa: string;
  color: string | null;
  tipoMotor: string | null;
  activo: number;
  propietario: string;
  telefonoPropietario: string;
}

interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  activo: number;
}

interface DatosFormulario {
  clienteId: string;
  marca: string;
  modelo: string;
  anio: string;
  placa: string;
  color: string;
  tipoMotor: string;
}

const API_MOTOS = "http://localhost:3000/api/motos";
const API_CLIENTES = "http://localhost:3000/api/clientes";

const formularioVacio: DatosFormulario = {
  clienteId: "",
  marca: "",
  modelo: "",
  anio: String(new Date().getFullYear()),
  placa: "",
  color: "",
  tipoMotor: ""
};

export default function Motocicletas() {
  const [motos, setMotos] = useState<Moto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("activos");
  const [busquedaCliente, setBusquedaCliente] = useState("");

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] =
    useState<string | null>(null);

  const [mostrarFormulario, setMostrarFormulario] =
    useState(false);

  const [motoEditando, setMotoEditando] =
    useState<string | null>(null);

  const [formulario, setFormulario] =
    useState<DatosFormulario>({ ...formularioVacio });

  const [error, setError] = useState("");
  const [errorFormulario, setErrorFormulario] = useState("");
  const [mensajeExito, setMensajeExito] = useState("");

  // REALIZAR PETICIONES PROTEGIDAS
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

    const tipo =
      respuesta.headers.get("content-type") || "";

    if (!tipo.includes("application/json")) {
      throw new Error(
        `Respuesta inesperada del servidor (HTTP ${respuesta.status})`
      );
    }

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(
        datos.mensaje || `Error HTTP ${respuesta.status}`
      );
    }

    return datos;
  }

  // CARGAR MOTOCICLETAS Y PROPIETARIOS
  async function cargarDatos() {
    setCargando(true);
    setError("");

    try {
      const [datosMotos, datosClientes] = await Promise.all([
        consultarAPI(API_MOTOS),
        consultarAPI(API_CLIENTES)
      ]);

      if (
        !Array.isArray(datosMotos.motos) ||
        !Array.isArray(datosClientes.clientes)
      ) {
        throw new Error("Los datos recibidos no son válidos");
      }

      setMotos(datosMotos.motos);
      setClientes(datosClientes.clientes);

      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la información"
      );

      return false;
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  // CAMBIAR CAMPOS DEL FORMULARIO
  function cambiarCampo(
    campo: keyof DatosFormulario,
    valor: string
  ) {
    setFormulario((anterior) => ({
      ...anterior,
      [campo]: valor
    }));
  }

  // NUEVA MOTOCICLETA
  function abrirFormulario() {
    setMotoEditando(null);
    setFormulario({ ...formularioVacio });
    setBusquedaCliente("");
    setErrorFormulario("");
    setMensajeExito("");
    setMostrarFormulario(true);
  }

  // EDITAR MOTOCICLETA
  function abrirEdicion(moto: Moto) {
    setMotoEditando(moto.id);

    setFormulario({
      clienteId: moto.clienteId,
      marca: moto.marca,
      modelo: moto.modelo,
      anio: String(moto.anio),
      placa: moto.placa,
      color: moto.color || "",
      tipoMotor: moto.tipoMotor || ""
    });

    setBusquedaCliente("");
    setErrorFormulario("");
    setMensajeExito("");
    setMostrarFormulario(true);
  }

  function cerrarFormulario() {
    setMostrarFormulario(false);
    setMotoEditando(null);
    setErrorFormulario("");
  }

  // GUARDAR O EDITAR
  async function guardarMoto(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (guardando) return;

    setErrorFormulario("");

    const anio = Number(formulario.anio);

    if (
      !formulario.clienteId ||
      !formulario.marca.trim() ||
      !formulario.modelo.trim() ||
      !formulario.placa.trim() ||
      !Number.isInteger(anio) ||
      anio < 1900 ||
      anio > 2100
    ) {
      setErrorFormulario(
        "Verifica el propietario y los campos obligatorios."
      );
      return;
    }

    const propietarioSeleccionado = clientes.find(
      (cliente) =>
        cliente.id === formulario.clienteId &&
        Boolean(cliente.activo)
    );

    if (!propietarioSeleccionado) {
      setErrorFormulario(
        "Selecciona un propietario activo."
      );
      return;
    }

    setGuardando(true);

    const editando = motoEditando !== null;

    try {
      const url = editando
        ? `${API_MOTOS}/${motoEditando}`
        : API_MOTOS;

      await consultarAPI(url, {
        method: editando ? "PUT" : "POST",
        body: JSON.stringify({
          clienteId: formulario.clienteId,
          marca: formulario.marca.trim(),
          modelo: formulario.modelo.trim(),
          anio,
          placa: formulario.placa.trim().toUpperCase(),
          color: formulario.color.trim() || null,
          tipoMotor: formulario.tipoMotor.trim() || null
        })
      });

      cerrarFormulario();
      setBusqueda("");
      setFiltro("activos");

      const actualizado = await cargarDatos();

      if (actualizado) {
        setMensajeExito(
          editando
            ? "Motocicleta actualizada correctamente."
            : "Motocicleta registrada correctamente."
        );
      }
    } catch (err) {
      setErrorFormulario(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la motocicleta"
      );
    } finally {
      setGuardando(false);
    }
  }

  // ARCHIVAR O REACTIVAR
  async function cambiarEstado(moto: Moto) {
    if (cambiandoEstado) return;

    const nuevoEstado = !Boolean(moto.activo);
    const accion = nuevoEstado ? "reactivar" : "archivar";

    if (
      !window.confirm(
        `¿Deseas ${accion} la motocicleta de placa ${moto.placa}?`
      )
    ) {
      return;
    }

    setCambiandoEstado(moto.id);
    setMensajeExito("");
    setError("");

    try {
      await consultarAPI(
        `${API_MOTOS}/${moto.id}/estado`,
        {
          method: "PATCH",
          body: JSON.stringify({
            activo: nuevoEstado
          })
        }
      );

      const actualizado = await cargarDatos();

      if (actualizado) {
        setMensajeExito(
          nuevoEstado
            ? "Motocicleta reactivada correctamente."
            : "Motocicleta archivada correctamente."
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

  // CLIENTES ACTIVOS PARA EL SELECTOR
  const clientesActivos = clientes.filter(
    (cliente) => Boolean(cliente.activo)
  );

  const clientesFiltrados = clientesActivos.filter(
    (cliente) => {
      const texto = busquedaCliente.trim().toLowerCase();

      return (
        cliente.nombre.toLowerCase().includes(texto) ||
        cliente.telefono.toLowerCase().includes(texto)
      );
    }
  );

  const propietarioSeleccionado = clientes.find(
    (cliente) => cliente.id === formulario.clienteId
  );

  // BUSCADOR DE MOTOCICLETAS
  const motosFiltradas = motos.filter((moto) => {
    const texto = busqueda.trim().toLowerCase();

    const coincideTexto = [
      moto.placa,
      moto.marca,
      moto.modelo,
      moto.propietario,
      moto.telefonoPropietario
    ].some((valor) =>
      (valor || "").toLowerCase().includes(texto)
    );

    const coincideEstado =
      filtro === "todos" ||
      (filtro === "activos" && Boolean(moto.activo)) ||
      (filtro === "archivados" && !Boolean(moto.activo));

    return coincideTexto && coincideEstado;
  });

  return (
    <section className="motos-pagina">

      {/* ENCABEZADO */}
      <div className="motos-encabezado">
        <div>
          <h1>Gestión de Motocicletas</h1>
          <p>
            Administra las motocicletas registradas
            en URABÁ MOTORS FC.
          </p>
        </div>

        {!mostrarFormulario && (
          <div className="motos-botones">
            <button
              type="button"
              className="motos-boton-secundario"
              disabled={cargando}
              onClick={() => {
                setMensajeExito("");
                cargarDatos();
              }}
            >
              <RefreshCw size={17} />
              Actualizar
            </button>

            <button
              type="button"
              className="motos-boton-primario"
              onClick={abrirFormulario}
            >
              <Plus size={18} />
              Nueva motocicleta
            </button>
          </div>
        )}
      </div>

      {mostrarFormulario ? (

        /* FORMULARIO */
        <form
          className="motos-formulario"
          onSubmit={guardarMoto}
        >
          <h2>
            {motoEditando
              ? "Editar motocicleta"
              : "Registrar nueva motocicleta"}
          </h2>

          <p>
            Selecciona el propietario e ingresa
            la información de la motocicleta.
          </p>

          {/* SELECTOR DE PROPIETARIO */}
          <div className="motos-propietario">
            <label htmlFor="buscar-propietario">
              Propietario *
            </label>

            {propietarioSeleccionado && (
              <div className="motos-propietario-seleccionado">
                <CheckCircle2 size={19} />

                <div>
                  <strong>
                    {propietarioSeleccionado.nombre}
                  </strong>
                  <span>
                    {propietarioSeleccionado.telefono}
                  </span>
                </div>
              </div>
            )}

            <input
              id="buscar-propietario"
              type="search"
              placeholder="Buscar cliente por nombre o teléfono..."
              value={busquedaCliente}
              onChange={(e) =>
                setBusquedaCliente(e.target.value)
              }
            />

            <div className="motos-clientes-lista">
              {clientesFiltrados.length === 0 ? (
                <p>No se encontraron clientes activos.</p>
              ) : (
                clientesFiltrados.map((cliente) => (
                  <button
                    key={cliente.id}
                    type="button"
                    className={
                      formulario.clienteId === cliente.id
                        ? "motos-cliente-opcion seleccionado"
                        : "motos-cliente-opcion"
                    }
                    onClick={() =>
                      cambiarCampo("clienteId", cliente.id)
                    }
                  >
                    <span>
                      <strong>{cliente.nombre}</strong>
                      <small>{cliente.telefono}</small>
                    </span>

                    {formulario.clienteId === cliente.id && (
                      <CheckCircle2 size={19} />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* DATOS DE LA MOTO */}
          <div className="motos-campos">

            <div className="motos-campo">
              <label htmlFor="moto-marca">Marca *</label>
              <input
                id="moto-marca"
                value={formulario.marca}
                onChange={(e) =>
                  cambiarCampo("marca", e.target.value)
                }
                maxLength={50}
                placeholder="Ejemplo: Yamaha"
                required
              />
            </div>

            <div className="motos-campo">
              <label htmlFor="moto-modelo">Modelo *</label>
              <input
                id="moto-modelo"
                value={formulario.modelo}
                onChange={(e) =>
                  cambiarCampo("modelo", e.target.value)
                }
                maxLength={50}
                placeholder="Ejemplo: FZ 150"
                required
              />
            </div>

            <div className="motos-campo">
              <label htmlFor="moto-anio">Año *</label>
              <input
                id="moto-anio"
                type="number"
                min="1900"
                max="2100"
                step="1"
                value={formulario.anio}
                onChange={(e) =>
                  cambiarCampo("anio", e.target.value)
                }
                required
              />
            </div>

            <div className="motos-campo">
              <label htmlFor="moto-placa">Placa *</label>
              <input
                id="moto-placa"
                value={formulario.placa}
                onChange={(e) =>
                  cambiarCampo("placa", e.target.value.toUpperCase())
                }
                maxLength={15}
                placeholder="Ejemplo: ABC12D"
                required
              />
            </div>

            <div className="motos-campo">
              <label htmlFor="moto-color">Color</label>
              <input
                id="moto-color"
                value={formulario.color}
                onChange={(e) =>
                  cambiarCampo("color", e.target.value)
                }
                maxLength={30}
                placeholder="Ejemplo: Negro"
              />
            </div>

            <div className="motos-campo">
              <label htmlFor="moto-motor">
                Tipo de motor
              </label>
              <input
                id="moto-motor"
                value={formulario.tipoMotor}
                onChange={(e) =>
                  cambiarCampo("tipoMotor", e.target.value)
                }
                maxLength={50}
                placeholder="Ejemplo: 150 cc"
              />
            </div>

          </div>

          {errorFormulario && (
            <p className="motos-error" role="alert">
              {errorFormulario}
            </p>
          )}

          <div className="motos-formulario-acciones">
            <button
              type="button"
              className="motos-boton-secundario"
              onClick={cerrarFormulario}
              disabled={guardando}
            >
              <ArrowLeft size={17} />
              Cancelar
            </button>

            <button
              type="submit"
              className="motos-boton-primario"
              disabled={guardando}
            >
              <Save size={17} />
              {guardando
                ? "Guardando..."
                : motoEditando
                  ? "Guardar cambios"
                  : "Registrar motocicleta"}
            </button>
          </div>
        </form>

      ) : (

        /* LISTADO */
        <>
          {mensajeExito && (
            <p className="motos-exito" role="status">
              {mensajeExito}
            </p>
          )}

          <div className="motos-filtros">
            <div className="motos-buscador">
              <Search size={20} />

              <input
                type="search"
                placeholder="Buscar placa, marca, modelo o propietario..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <select
              aria-label="Filtrar motocicletas"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            >
              <option value="activos">Activas</option>
              <option value="archivados">Archivadas</option>
              <option value="todos">Todas</option>
            </select>
          </div>

          <p className="motos-contador">
            <Bike size={18} />
            {motosFiltradas.length} motocicletas encontradas
          </p>

          {cargando && <p>Cargando motocicletas...</p>}

          {error && (
            <p className="motos-error" role="alert">
              {error}
            </p>
          )}

          {!cargando && !error && (
            <div className="motos-lista">
              {motosFiltradas.length === 0 ? (
                <div className="motos-vacio">
                  <Bike size={36} />
                  <p>No se encontraron motocicletas.</p>
                </div>
              ) : (
                motosFiltradas.map((moto) => (
                  <article
                    className="motos-tarjeta"
                    key={moto.id}
                  >
                    <div className="motos-icono">
                      <Bike size={25} />
                    </div>

                    <div className="motos-informacion">
                      <div className="motos-titulo-fila">
                        <h3>
                          {moto.marca} {moto.modelo}
                        </h3>

                        <span
                          className={
                            moto.activo
                              ? "motos-estado activo"
                              : "motos-estado archivado"
                          }
                        >
                          {moto.activo
                            ? "Activa"
                            : "Archivada"}
                        </span>
                      </div>

                      <p>
                        <strong>Placa:</strong> {moto.placa}
                        {" · "}
                        <strong>Año:</strong> {moto.anio}
                      </p>

                      <p>
                        <strong>Propietario:</strong>{" "}
                        {moto.propietario}
                      </p>

                      {moto.color && (
                        <p>
                          <strong>Color:</strong> {moto.color}
                        </p>
                      )}

                      {moto.tipoMotor && (
                        <p>
                          <strong>Motor:</strong>{" "}
                          {moto.tipoMotor}
                        </p>
                      )}
                    </div>

                    <div className="motos-acciones">
                      <button
                        type="button"
                        className="motos-boton-editar"
                        onClick={() => abrirEdicion(moto)}
                        disabled={cambiandoEstado !== null}
                      >
                        <Pencil size={16} />
                        Editar
                      </button>

                      <button
                        type="button"
                        className="motos-boton-estado"
                        onClick={() => cambiarEstado(moto)}
                        disabled={cambiandoEstado !== null}
                      >
                        {cambiandoEstado === moto.id ? (
                          "Guardando..."
                        ) : moto.activo ? (
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
