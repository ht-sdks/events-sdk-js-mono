import { Plugin } from '../core/plugin'
import { PluginFactory } from '../plugins/remote-loader'
import type { BuiltInPluginName } from '../plugins/built-in-plugins'

export function dedupeStringPluginNames(
  names: BuiltInPluginName[]
): BuiltInPluginName[] {
  const seen = new Set<BuiltInPluginName>()
  const unique: BuiltInPluginName[] = []

  for (const name of names) {
    if (seen.has(name)) {
      console.warn(`duplicate plugin ignored: ${name}`)
      continue
    }
    seen.add(name)
    unique.push(name)
  }

  return unique
}

export function dedupePluginFactories(
  factories: PluginFactory[]
): PluginFactory[] {
  const seen = new Set<string>()
  const unique: PluginFactory[] = []

  for (const factory of factories) {
    if (seen.has(factory.pluginName)) {
      console.warn(`duplicate plugin factory ignored: ${factory.pluginName}`)
      continue
    }
    seen.add(factory.pluginName)
    unique.push(factory)
  }

  return unique
}

export function dedupePlugins(plugins: Plugin[]): Plugin[] {
  const seenRefs = new Set<Plugin>()
  const seenNames = new Set<string>()
  const unique: Plugin[] = []

  for (const plugin of plugins) {
    if (seenRefs.has(plugin)) {
      continue
    }

    if (seenNames.has(plugin.name)) {
      console.warn(`duplicate plugin ignored: ${plugin.name}`)
      continue
    }

    seenRefs.add(plugin)
    seenNames.add(plugin.name)
    unique.push(plugin)
  }

  return unique
}
