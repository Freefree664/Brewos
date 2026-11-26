import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// This preview is hosted at https://freefree664.github.io/Brewos/
export default defineConfig({
  base: '/Brewos/',
  plugins: [react()],
})
