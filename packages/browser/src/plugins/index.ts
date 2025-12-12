import type { Plugin } from '../core/plugin'

/**
 * Creates a plugin instance from a string name.
 * This allows script tag users to specify plugins by name without importing them.
 *
 * @param name - The name of the plugin to load
 * @returns A promise that resolves to the plugin instance, or undefined if not found
 */
export async function createPlugin(name: string): Promise<Plugin | undefined> {
  switch (name) {
    case 'facebook-params':
      return import(
        /* webpackChunkName: "facebook-params" */ './facebook-params'
      ).then((mod) => mod.facebookParams)
    default:
      return undefined
  }
}
