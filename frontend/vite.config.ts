
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  const backendPublico =
    env.VITE_BACKEND_URL?.replace(/\/+$/, '');

  return {
    plugins: [
      react(),

      {
        name: 'uraba-api-url',
        enforce: 'pre',

        transform(codigo, archivo) {
          // Solo modificar archivos del frontend.
          if (
            !/[\\/]src[\\/].*\.[jt]sx?(?:\?.*)?$/.test(archivo)
          ) {
            return null;
          }

          if (
            mode !== 'production' ||
            !backendPublico
          ) {
            return null;
          }

          return {
            code: codigo.replaceAll(
              'https://uraba-motors-fc.onrender.com',
              backendPublico
            ),
            map: null
          };
        }
      }
    ]
  };
});
