const BASE_URL =
  import.meta.env.VITE_API_URL ||
  'https://uraba-motors-fc.onrender.com/api';

export const API_URL = BASE_URL.replace(/\/$/, '');