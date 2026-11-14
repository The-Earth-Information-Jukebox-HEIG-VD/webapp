/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Dev-only: serve the datasets (same layout as the jukebox-data Docker volume)
 * at /data/, like nginx does in production:
 * - directories -> JSON listing (same shape as nginx `autoindex_format json`)
 * - files -> raw bytes, with HTTP Range support (206)
 * Folder: $JUKEBOX_DATA_DIR, default ../datasets/data (the `datasets` repository).
 */
function serveDataVolume(): Plugin {
  const root = path.resolve(
    process.env.JUKEBOX_DATA_DIR ?? fileURLToPath(new URL('../datasets/data', import.meta.url))
  )
  return {
    name: 'serve-data-volume',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0])
        const target = path.resolve(root, '.' + rel)
        if (target !== root && !target.startsWith(root + path.sep)) {
          res.statusCode = 403
          return res.end()
        }
        let stat: fs.Stats
        try {
          stat = fs.statSync(target)
        } catch {
          res.statusCode = 404
          return res.end()
        }
        if (stat.isDirectory()) {
          const entries = fs
            .readdirSync(target, { withFileTypes: true })
            .filter((e) => !e.name.startsWith('.'))
            .map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }))
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(entries))
        }
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Content-Type', 'application/octet-stream')
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '')
        if (range) {
          const start = Number(range[1])
          const end = Math.min(range[2] ? Number(range[2]) : stat.size - 1, stat.size - 1)
          if (start > end) {
            res.statusCode = 416
            res.setHeader('Content-Range', `bytes */${stat.size}`)
            return res.end()
          }
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
          res.setHeader('Content-Length', String(end - start + 1))
          return req.method === 'HEAD' ? res.end() : fs.createReadStream(target, { start, end }).pipe(res)
        }
        res.setHeader('Content-Length', String(stat.size))
        return req.method === 'HEAD' ? res.end() : fs.createReadStream(target).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveDataVolume()],
  // GitLab Pages deploys to a subpath (/<project-name>/)
  // In CI, use the project name; locally, use root
  base: process.env.CI ? `/${process.env.CI_PROJECT_NAME}/` : '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Only used when VITE_API_URL is relative (/api). The backend URL is set
        // with VITE_API_URL in .env.development(.local), see .env.example
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
})
