import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry:    resolve(__dirname, 'src/index.jsx'),
      name:     'NovaChat',
      fileName: 'nova-chat',
      formats:  ['iife'],
    },
    rollupOptions: {
      output: {
        assetFileNames: 'nova-chat.css',
      }
    }
  },
  publicDir: 'public'
})