import { defineConfig } from 'vite';
import { alphaTab } from '@coderline/alphatab-vite';

// The alphaTab plugin wires up its web workers and copies the music font
// and the soundfont into public/ (served at /font/ and /soundfont/).
export default defineConfig({
  plugins: [alphaTab()],
  server: { port: 5173 },
});
