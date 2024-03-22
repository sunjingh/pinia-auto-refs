import { promises as fs } from 'fs'
import { resolve } from 'path'
import chokidar from 'chokidar'
import js_beautify from 'js-beautify'

type Options = Partial<{
  storeDir: string | string[]
  excludes: string[]
  outputFile: string
  isDev: boolean
}>

const defaultOptions: Options = {
  storeDir: 'src/store',
  excludes: ['index'],
  outputFile: 'src/helper/pinia-auto-refs.ts',
  isDev: false,
}

export default function (options: Options = {}) {
  options = { ...defaultOptions, ...options }

  const { storeDir, excludes, outputFile, isDev } = options as Required<Options>
  const storeDirArray = Array.isArray(storeDir) ? storeDir : [storeDir]
  const storePathArray = storeDirArray.map((ele) => resolve(process.cwd(), ele))
  const outputDir = outputFile.replace(/(\/[^/]*).ts/, '')
  fs.readdir(outputDir).catch(() => fs.mkdir(outputDir))

  function getStoreNames(storesPath: string[]) {
    return storesPath
      .filter((i) => i.endsWith('.ts'))
      .map((i) => i.replace('.ts', ''))
      .filter((i) => !excludes.includes(i))
  }

  async function generateConfigFiles() {
    const storesPathMap: Map<string, string[]> = new Map(null)
    for (let index = 0; index < storePathArray.length; index++) {
      const element = await fs.readdir(storePathArray[index])
      storesPathMap.set(storeDirArray[index], element)
    }
    const ctx = `
      // "https://github.com/Allen-1998/pinia-auto-refs"
      /* eslint-disable */
      /* prettier-ignore */
      // @ts-nocheck
      import type { AutoToRefs, ToRef } from 'vue'

      ${storeDirArray.reduce((target, current) => {
        const preStoreName = current.replace('src', '').split('/')?.at(-2) ?? ''
        target += getStoreNames(storesPathMap.get(current) ?? []).reduce(
          (str, storeName) =>
            `${str} import ${preStoreName}${
              (preStoreName ? storeName.charAt(0).toUpperCase() : storeName.charAt(0)) +
              storeName.slice(1)
            }Store from '${current.replace('src', '@')}/${storeName}'`,
          ''
        )
        return target
      }, '')}

      type AutoToRefs<T> = {
        [K in keyof T]: T[K] extends Function ? T[K] : ToRef<T[K]>
      }

      const storeExports = {
        ${storeDirArray.reduce((target, current) => {
          const preStoreName = current.replace('src', '').split('/')?.at(-2) ?? ''
          target += getStoreNames(storesPathMap.get(current) ?? []).reduce(
            (str, storeName) =>
              `${str} "${preStoreName}${preStoreName ? '-' : ''}${storeName}": ${preStoreName}${
                (preStoreName ? storeName.charAt(0).toUpperCase() : storeName.charAt(0)) +
                storeName.slice(1)
              }Store,`,
            ''
          )
          return target
        }, '')}
      }

      export function useStore<T extends keyof typeof storeExports>(storeName: T) {
        const targetStore = storeExports[storeName]()
        const storeRefs = storeToRefs(targetStore)
        return { ...targetStore, ...storeRefs } as unknown as AutoToRefs<ReturnType<typeof storeExports[T]>>
      }
    `
    fs.writeFile(
      outputFile,
      js_beautify(ctx, { brace_style: 'preserve-inline', indent_size: 2 }),
      'utf-8'
    )
  }

  generateConfigFiles()
  if (process.env.NODE_ENV === 'development' || isDev) {
    const watcher = chokidar.watch(storeDir)
    watcher.on('add', () => generateConfigFiles())
    watcher.on('unlink', () => generateConfigFiles())
  }
  return {
    name: 'pinia-auto-refs',
  }
}
