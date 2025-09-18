import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import type { Plugin, ViteDevServer } from "vite"

// Plugin personnalisé pour l'API getS3url
function getS3UrlPlugin(env: Record<string, string>): Plugin {
    return {
        name: 'get-s3-url-plugin',
        configureServer(server: ViteDevServer) {
            server.middlewares.use('/api/getS3url', (_req, res) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ url: env.VITE_API_PUBLIC_URL }));
            });
        },
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd())
    return {
        plugins: [
            react(),
            getS3UrlPlugin(env),
        ],
        server: {
            proxy: {
                "/api/admin": {
                    target: env.VITE_API_ADMIN_URL,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api\/admin/, ""),
                    secure: false, // Ignore la vérification du certificat
                },
            },
        },
        build: {
            // Increase the warning limit slightly and split large vendor chunks.
            chunkSizeWarningLimit: 600,
            // When building into a directory outside the project root Vite warns and
            // will not empty the directory by default. We explicitly allow emptying
            // so the output folder is cleaned on each build (same effect as
            // --emptyOutDir on the CLI).
            emptyOutDir: true,
            // Output the built assets into the top-level output/public folder so
            // This resolves to <repo-root>/output/public when run from `front/`.
            outDir: path.resolve(process.cwd(), "../output/public"),
        rollupOptions: {
            output: {
                // Keep manual chunks for large libraries, but do NOT force React into a separate
                // `react-vendor` chunk. Splitting React/React-DOM can cause initialization order
                // issues when other vendor code expects runtime internals on the same module instance.
                manualChunks(id: string) {
                    if (id.includes("node_modules")) {
                        if (id.includes("node_modules/@mui/icons-material")) return "mui-icons"
                        if (id.includes("node_modules/@mui")) return "mui"
                        if (id.includes("node_modules/@emotion")) return "emotion"
                        if (id.includes("node_modules/i18next") || id.includes("node_modules/react-i18next")) return "i18n"
                        return "vendor"
                    }
                },
            },
        },
        },
    }
})
