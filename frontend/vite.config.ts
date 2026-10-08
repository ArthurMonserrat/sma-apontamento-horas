import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const isGitHubPages = process.env.GITHUB_PAGES === 'true'
const publicBasePath = isGitHubPages ? '/sma-apontamento-horas/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base: publicBasePath,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['sma-logo-32.png', 'sma-logo-192.png', 'sma-logo-512.png', 'apple-touch-icon.png'],
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'SM&A Horas',
        short_name: 'SM&A Horas',
        description: 'Sistema corporativo de apontamento e banco de horas da SM&A.',
        start_url: publicBasePath,
        display: 'standalone',
        theme_color: '#0A161E',
        background_color: '#0A161E',
        lang: 'pt-BR',
        icons: [
          { src: '/sma-logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/sma-logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
