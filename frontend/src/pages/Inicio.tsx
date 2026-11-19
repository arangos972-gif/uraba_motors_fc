
import './Inicio.css';

import {
  Wrench,
  Settings,
  CalendarDays,
  ShieldCheck,
  Award,
  Zap,
  ArrowRight
} from 'lucide-react';

export default function Inicio() {
  return (
    <div className="inicio">

      {/* ENCABEZADO */}
      <header className="inicio-header">
        <a className="inicio-marca" href="#inicio">
          <span className="marca-icono">
            <Wrench size={30} strokeWidth={2.5} />
          </span>
          <span>URABÁ MOTORS FC</span>
        </a>

        <nav className="inicio-nav">
          <a href="#inicio">Inicio</a>
          <a href="#servicios">Servicios</a>
          <a href="#nosotros">Nosotros</a>
        </nav>
      </header>

      <main>

        {/* SECCIÓN PRINCIPAL */}
        <section id="inicio" className="inicio-hero">
          <div className="hero-contenido">
            <span className="hero-etiqueta">
              TALLER ESPECIALIZADO
            </span>

            <h1>
              El cuidado que
              <br />
              tu moto <span>merece.</span>
            </h1>

            <p>
              Servicio técnico profesional,
              mantenimiento preventivo y
              atención especializada para
              tu motocicleta.
            </p>

            <a className="hero-boton" href="/login">
              Iniciar sesión
              <ArrowRight size={20} />
            </a>
          </div>
        </section>

        {/* SERVICIOS */}
        <section id="servicios" className="inicio-servicios">
          <div className="seccion-encabezado">
            <h2>Servicios Integrales</h2>
            <p>
              Todo lo que necesitas para tu motocicleta
              en un solo lugar.
            </p>
          </div>

          <div className="servicios-grid">

            <article className="servicio-card">
              <span className="servicio-icono">
                <Wrench size={30} strokeWidth={2.2} />
              </span>

              <h3>Mantenimiento y Reparación</h3>
              <p>
                Diagnóstico, reparación de motores
                y mantenimiento preventivo.
              </p>
            </article>

            <article className="servicio-card">
              <span className="servicio-icono">
                <Settings size={30} strokeWidth={2.2} />
              </span>

              <h3>Venta de Repuestos</h3>
              <p>
                Repuestos y accesorios para mantener
                tu motocicleta en óptimas condiciones.
              </p>
            </article>

            <article className="servicio-card">
              <span className="servicio-icono">
                <CalendarDays size={30} strokeWidth={2.2} />
              </span>

              <h3>Atención Programada</h3>
              <p>
                Organización eficiente de los servicios
                y la atención del taller.
              </p>
            </article>

          </div>
        </section>

        {/* NOSOTROS */}
        <section id="nosotros" className="inicio-nosotros">
            <div className="nosotros-imagen">
  <img
    src="/mecanico-taller.png"
    alt="Mecánico trabajando en una motocicleta"
  />
</div>
          <h2>¿Por qué elegirnos?</h2>

          <p>
            En Urabá Motors FC trabajamos para ofrecer
            un servicio confiable, profesional y
            comprometido con el cuidado de tu motocicleta.
          </p>

          <div className="beneficios">

            <div>
              <span className="beneficio-icono">
                <ShieldCheck size={34} strokeWidth={2} />
              </span>

              <h3>Experiencia y confianza</h3>
              <p>Atención profesional para tu moto.</p>
            </div>

            <div>
              <span className="beneficio-icono">
                <Award size={34} strokeWidth={2} />
              </span>

              <h3>Repuestos de calidad</h3>
              <p>Compromiso con la calidad del servicio.</p>
            </div>

            <div>
              <span className="beneficio-icono">
                <Zap size={34} strokeWidth={2} />
              </span>

              <h3>Servicio oportuno</h3>
              <p>Atención organizada y eficiente.</p>
            </div>

          </div>
        </section>

      </main>

      {/* PIE DE PÁGINA */}
      <footer className="inicio-footer">
        © URABÁ MOTORS FC — Todos los derechos reservados
      </footer>

    </div>
  );
}
