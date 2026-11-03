import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {viteSingleFile} from 'vite-plugin-singlefile';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Relative asset URLs so the build also works from a sub-folder or a local file.
    base: './',
    plugins: [react(), tailwindcss(), viteSingleFile()],
    build: {
      // Safari 14+ (macOS Big Sur / iOS 14) must be able to parse and run the bundle.
      target: ['safari14', 'chrome87', 'firefox78', 'edge88'],
      cssCodeSplit: false,
      assetsInlineLimit: 100_000_000,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
