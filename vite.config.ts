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
  }
})
