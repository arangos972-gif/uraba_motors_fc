
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import kardexRoutes from './routes/kardex.routes.js';
import { pool } from './config/database.js';
import horariosMecanicosRoutes from './routes/horarios-mecanicos.routes.js';
import authRoutes from './routes/auth.routes.js';
import clientesRoutes from './routes/clientes.routes.js';
import catalogoServiciosRoutes from './routes/catalogo-servicios.routes.js';
import motosRoutes from './routes/motos.routes.js';
import usuariosRoutes from './routes/usuarios.routes.js';
import ausenciasRoutes from './routes/ausencias.routes.js';
import auditoriaRoutes from './routes/auditoria.routes.js';
import citasRoutes from './routes/citas.routes.js';
import ordenesRoutes from './routes/ordenes.routes.js';
import repuestosRoutes from './routes/repuestos.routes.js';
import comprasRoutes from './routes/compras.routes.js';
import ventasRoutes from './routes/ventas.routes.js';
import ajustesRoutes from './routes/ajustes.routes.js';
import devolucionesRoutes from './routes/devoluciones.routes.js';
import facturasRoutes from './routes/facturas.routes.js';
import {
  crearComisionesRouter
} from './routes/comisiones.routes.js';

import {
  verificarToken
} from './middlewares/auth.middleware.js';

import {
  verificarPermiso
} from './middlewares/permissions.middleware.js';
import liquidacionesRoutes from './routes/liquidaciones.routes.js';
import reportesMecanicosRoutes from './routes/reportes-mecanicos.routes.js';
import reporteHorariosMecanicosRoutes from './routes/reporte-horarios-mecanicos.routes.js';
import reporteClientesRoutes from './routes/reporte-clientes.routes.js';
import reporteMecanicosRoutes from './routes/reporte-mecanicos.routes.js';
import reporteTrabajosClienteRoutes from './routes/reporte-trabajos-cliente.routes.js';
import reporteIngresosRoutes from './routes/reporte-ingresos.routes.js';



dotenv.config();

const app = express();

// ======================================
// CONFIGURACIÓN GENERAL
// ======================================

// CORS debe estar antes de todas las rutas
app.use(cors());

// Permitir recibir datos JSON
app.use(express.json());

// ======================================
// RUTAS DE LA API
// ======================================

app.use('/api/auth', authRoutes);
app.use('/api/kardex', kardexRoutes);
app.use('/api/clientes', clientesRoutes);

app.use('/api/catalogo-servicios', catalogoServiciosRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/motos', motosRoutes);
app.use('/api/devoluciones', devolucionesRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/kardex', kardexRoutes);
app.use('/api/clientes', clientesRoutes);

app.use('/api/catalogo-servicios', catalogoServiciosRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/motos', motosRoutes);
app.use('/api/devoluciones', devolucionesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/horarios-mecanicos', horariosMecanicosRoutes);
app.use('/api/ausencias', ausenciasRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/citas', citasRoutes);
app.use('/api/ordenes', ordenesRoutes);
app.use('/api/repuestos', repuestosRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/ajustes', ajustesRoutes);
app.use(
  '/api/reportes/mecanicos',
  reportesMecanicosRoutes
);
app.use(
  '/api/reportes/horarios-mecanicos',
  reporteHorariosMecanicosRoutes
);
app.use(
  '/api/reportes/clientes',
  reporteClientesRoutes
);
app.use(
  '/api/reportes/cantidad-mecanicos',
  reporteMecanicosRoutes
);
app.use(
  '/api/reportes/trabajos-cliente',
  reporteTrabajosClienteRoutes
);
app.use(
  '/api/reportes/ingresos',
  reporteIngresosRoutes
);

// ======================================
// COMISIONES DE MECÁNICOS
// ======================================

app.use(
  '/api/comisiones',
  verificarToken,
  verificarPermiso('roles.administrar'),
  crearComisionesRouter(pool)
);


// ======================================
// LIQUIDACIONES DE MECÁNICOS
// ======================================

app.use(
  '/api/liquidaciones',
  verificarToken,
  verificarPermiso('roles.administrar'),
  liquidacionesRoutes
);








// ======================================
// RUTAS DE PRUEBA
// ======================================

app.post('/api/prueba-post', (_req, res) => {
  res.json({
    mensaje: 'Las solicitudes POST funcionan'
  });
});

console.log('Rutas de autenticación registradas');

// Ruta principal
app.get('/', (_req, res) => {
  res.json({
    mensaje: 'API de URABÁ MOTOR’S FC funcionando correctamente'
  });
});

app.get('/api/diagnostico', (_req, res) => {
  res.json({
    mensaje: 'Servidor actualizado correctamente',
    login: '/api/auth/login'
  });
});

// Prueba de conexión con MySQL
app.get('/api/test-db', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT DATABASE() AS database_name'
    );

    res.json({
      mensaje: 'Conexión con MySQL exitosa',
      resultado: rows
    });
  } catch (error) {
    console.error('ERROR MYSQL:', error);

    res.status(500).json({
      mensaje: 'Error al conectar con MySQL',
      detalle: error instanceof Error
        ? error.message
        : 'Error desconocido'
    });
  }
});

// ======================================
// INICIAR SERVIDOR
// ======================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Servidor ejecutándose en http://localhost:${PORT}`
  );
});
