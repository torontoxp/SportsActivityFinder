import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/SportsActivityFinder/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['TorontoXP_logo.png', 'CrafesignLogo.svg', 'Pickleball.png', 'Squash.png', 'Bocce.png', 'Bowling.png', 'Netball.png', 'RollerHockey.png'],
      manifest: {
        name: 'TorontoXP - Sports Activity Finder',
        short_name: 'TorontoXP',
        description: 'Find sports and activities at Toronto community centres. Search schedules, locations and age groups.',
        theme_color: '#165788',
        background_color: '#f6f8fb',
        display: 'standalone',
        orientation: 'any',
        start_url: '/SportsActivityFinder/',
        scope: '/SportsActivityFinder/',
        icons: [
          {
            src: 'TorontoXP_logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'TorontoXP_logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}']
      }
    })
  ]
})
