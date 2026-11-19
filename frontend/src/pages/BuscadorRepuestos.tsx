
import { useState } from 'react';

import {
  Search,
  ChevronDown,
  X
} from 'lucide-react';

interface Repuesto {
  id: string;
  nombre: string;
  categoriaNombre: string | null;
  stockActual: number;
}

interface Props {
  repuestos: Repuesto[];
  valor: string;
  onSeleccionar: (id: string) => void;
  idsOcupados?: string[];
  disabled?: boolean;
}

function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function BuscadorRepuestos({
  repuestos,
  valor,
  onSeleccionar,
  idsOcupados = [],
  disabled = false
}: Props) {

  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);

  const seleccionado = repuestos.find(
    repuesto => repuesto.id === valor
  );

  const repuestosFiltrados = repuestos.filter(
    repuesto => {

      const texto = normalizar(busqueda.trim());

      const coincideBusqueda =
        normalizar(repuesto.nombre).includes(texto) ||
        normalizar(
          repuesto.categoriaNombre ?? ''
        ).includes(texto);

      const disponible =
        !idsOcupados.includes(repuesto.id) ||
        repuesto.id === valor;

      return coincideBusqueda && disponible;
    }
  );

  function seleccionarRepuesto(id: string) {
    onSeleccionar(id);
    setBusqueda('');
    setAbierto(false);
  }

  function abrirBuscador() {
    if (disabled) return;

    setBusqueda('');
    setAbierto(true);
  }

  return (
    <div
      className="buscador-repuestos"
      onBlur={evento => {
        if (
          !evento.currentTarget.contains(
            evento.relatedTarget as Node | null
          )
        ) {
          setAbierto(false);
          setBusqueda('');
        }
      }}
      onKeyDown={evento => {
        if (evento.key === 'Escape') {
          setAbierto(false);
          setBusqueda('');
        }
      }}
    >

      <div className="buscador-repuestos-campo">

        <Search size={17} />

        <input
          type="text"
          aria-label="Buscar repuesto"
          aria-expanded={abierto}
          placeholder={
            seleccionado
              ? seleccionado.nombre
              : 'Buscar repuesto...'
          }
          value={
            abierto
              ? busqueda
              : seleccionado?.nombre ?? ''
          }
          disabled={disabled}
          autoComplete="off"
          onFocus={abrirBuscador}
          onChange={evento => {
            setBusqueda(evento.target.value);
            setAbierto(true);
          }}
        />

        {seleccionado && !abierto ? (

          <button
            type="button"
            disabled={disabled}
            aria-label="Quitar repuesto seleccionado"
            onClick={() => seleccionarRepuesto('')}
          >
            <X size={16} />
          </button>

        ) : (

          <button
            type="button"
            disabled={disabled}
            aria-label="Mostrar repuestos"
            onClick={() => {
              if (abierto) {
                setAbierto(false);
                setBusqueda('');
              } else {
                abrirBuscador();
              }
            }}
          >
            <ChevronDown size={17} />
          </button>

        )}

      </div>

      {abierto && !disabled && (

        <div className="buscador-repuestos-resultados">

          <div className="buscador-repuestos-contador">
            {repuestosFiltrados.length} repuestos encontrados
          </div>

          {repuestosFiltrados.length === 0 ? (

            <div className="buscador-repuestos-vacio">
              No se encontraron repuestos disponibles.
            </div>

          ) : (

            repuestosFiltrados.map(repuesto => (

              <button
                key={repuesto.id}
                type="button"
                className={
                  `buscador-repuestos-opcion ${
                    repuesto.id === valor
                      ? 'seleccionado'
                      : ''
                  }`
                }
                onClick={() =>
                  seleccionarRepuesto(repuesto.id)
                }
              >

                <div>
                  <strong>{repuesto.nombre}</strong>

                  <small>
                    {repuesto.categoriaNombre ||
                      'Sin categoría'}
                  </small>
                </div>

                <span className="buscador-repuestos-stock">
                  Stock: {repuesto.stockActual}
                </span>

              </button>

            ))

          )}

        </div>

      )}

    </div>
  );
}
