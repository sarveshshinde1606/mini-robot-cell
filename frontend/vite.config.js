import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [react(), vue()],
  server: { host: '0.0.0.0', port: 5173 }
});
