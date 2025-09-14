import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  console.log('Loaded env:', env)
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/admin': {
          target: env.VITE_API_ADMIN_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/admin/, ''),
          secure: false // Ignore la vérification du certificat
        },
        '/api/public': {
          target: env.VITE_API_PUBLIC_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/public/, ''),
          secure: false // Ignore la vérification du certificat
        },
      },
    },
    build: {
      // Increase the warning limit slightly and split large vendor chunks.
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // Recommended manualChunks to split large dependencies into separate files
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
                if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor'
                if (id.includes('node_modules/@mui/icons-material')) return 'mui-icons'
                if (id.includes('node_modules/@mui')) return 'mui'
                if (id.includes('node_modules/@emotion')) return 'emotion'
                if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) return 'i18n'
                return 'vendor'
              }
          }
        }
      }
    }
  }
})
