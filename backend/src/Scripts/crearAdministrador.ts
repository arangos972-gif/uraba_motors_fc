
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pool } from '../config/database.js';
import type { RowDataPacket } from 'mysql2';

interface Rol extends RowDataPacket {
  id: string;
}

interface Conteo extends RowDataPacket {
  total: number;
}

async function crearAdministrador() {
  const rl = createInterface({
    input: stdin,
    output: stdout
  });

  try {
    // Comprobar si ya existe un administrador
    const [usuarios] = await pool.execute<Conteo[]>(
      `SELECT COUNT(*) AS total
       FROM users u
       JOIN roles r ON u.roleId = r.id
       WHERE r.nombre = 'Administrador'`
    );

    if (usuarios[0].total > 0) {
      console.log('Ya existe un administrador.');
      return;
    }

    // Obtener identificador del rol
    const [roles] = await pool.execute<Rol[]>(
      `SELECT id FROM roles
       WHERE nombre = 'Administrador'
       AND activo = 1
       LIMIT 1`
    );

    if (roles.length === 0) {
      throw new Error('No existe el rol Administrador.');
    }

    // Solicitar datos
    const nombre = (await rl.question('Nombre: ')).trim();
    const email = (
      await rl.question('Correo electrónico: ')
    ).trim().toLowerCase();

    const password = await rl.question('Contraseña: ');

    if (
      !nombre ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 12
    ) {
      throw new Error(
        'Ingresa un nombre, correo válido y contraseña de mínimo 12 caracteres.'
      );
    }

    // Cifrar mediante hash la contraseña
    const passwordHash = await bcrypt.hash(password, 12);

    // Registrar el usuario
    await pool.execute(
      `INSERT INTO users
       (id, email, password, roleId, active, verified, name)
       VALUES (?, ?, ?, ?, 1, 1, ?)`,
      [
        randomUUID(),
        email,
        passwordHash,
        roles[0].id,
        nombre
      ]
    );

    console.log('Administrador creado correctamente.');

  } catch (error) {
    console.error('Error al crear administrador:', error);
  } finally {
    rl.close();
    await pool.end();
  }
}

crearAdministrador();