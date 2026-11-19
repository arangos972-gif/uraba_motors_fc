
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const enRailway = Boolean(process.env.RAILWAY_ENVIRONMENT);

function obtenerVariable(
  nombreLocal: string,
  nombreRailway: string,
  valorLocal: string
): string {
  if (enRailway) {
    const valor = process.env[nombreRailway];

    if (!valor) {
      throw new Error(
        `Falta la variable ${nombreRailway} en Railway`
      );
    }

    return valor;
  }

  return process.env[nombreLocal] || valorLocal;
}

const host = obtenerVariable(
  'DB_HOST',
  'MYSQLHOST',
  'localhost'
);

const puertoTexto = obtenerVariable(
  'DB_PORT',
  'MYSQLPORT',
  '3306'
);

const usuario = obtenerVariable(
  'DB_USER',
  'MYSQLUSER',
  'root'
);

const password = obtenerVariable(
  'DB_PASSWORD',
  'MYSQLPASSWORD',
  ''
);

const database = obtenerVariable(
  'DB_NAME',
  'MYSQLDATABASE',
  'uraba_motors_db'
);

const port = Number(puertoTexto);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Puerto MySQL inválido');
}

export const pool = mysql.createPool({
  host,
  port,
  user: usuario,
  password,
  database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
