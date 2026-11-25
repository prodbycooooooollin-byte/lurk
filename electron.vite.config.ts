import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    resolve: { alias: { '@': resolve('src/renderer/src') } },
    plugins: [react()],
    // LURK_PROFILE=1 npm run build → lesbare Funktionsnamen im CPU-Profil
    build: process.env.LURK_PROFILE ? { minify: false, sourcemap: true } : undefined
  }
})
