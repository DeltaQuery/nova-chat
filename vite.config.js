import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry:    resolve(__dirname, 'src/index.jsx'),
      name:     'MaratecaChat',
      fileName: 'marateca-chat',
      formats:  ['iife'],
    },
    rollupOptions: {
      output: {
        assetFileNames: 'marateca-chat.css',
      }
    }
  },
  publicDir: 'public'
})