import { rmSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import pkg from './package.json'

export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe

  return {
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src'),
        'jmuxerJs': path.join(__dirname, 'src/lib/jmuxer-esm.js'),
      },
    },
    // No need to optimize local JMuxer file
    optimizeDeps: {
      exclude: ['jmuxerJs'],
    },
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main/index.ts',
          onstart(args) {
            args.startup()
          },
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
          },
        },
        preload: {
          input: 'electron/preload/index.ts',
          vite: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined,
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
                output: {
                  format: 'cjs',
                  entryFileNames: '[name].cjs',
                },
              },
            },
          },
        },
        renderer: {},
      }),
    ],
    clearScreen: false,
  }
})

