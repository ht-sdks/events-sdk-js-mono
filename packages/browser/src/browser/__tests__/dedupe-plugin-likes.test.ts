import { describe, it, expect, jest } from '@jest/globals'
import { Plugin } from '../../core/plugin'
import { PluginFactory } from '../../plugins/remote-loader'
import {
  dedupePluginFactories,
  dedupePlugins,
  dedupeStringPluginNames,
} from '../dedupe-plugin-likes'
import { BuiltInPluginName } from '../../plugins/built-in-plugins'

const plugin = (name: string): Plugin => ({
  name,
  type: 'utility',
  version: '1.0',
  load: async () => undefined,
  isLoaded: () => true,
})

describe('dedupeStringPluginNames', () => {
  it('removes duplicate string plugin names', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    expect(
      dedupeStringPluginNames([
        'a' as BuiltInPluginName,
        'a' as BuiltInPluginName,
        'b' as BuiltInPluginName,
      ])
    ).toEqual(['a', 'b'])

    expect(warn).toHaveBeenCalledWith('duplicate plugin ignored: a')
  })
})

describe('dedupePluginFactories', () => {
  it('removes duplicate factories by pluginName', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const first = Object.assign(jest.fn(), { pluginName: 'Braze' })
    const second = Object.assign(jest.fn(), { pluginName: 'Braze' })

    expect(dedupePluginFactories([first, second] as PluginFactory[])).toEqual([
      first,
    ])

    expect(warn).toHaveBeenCalledWith('duplicate plugin factory ignored: Braze')
  })
})

describe('dedupePlugins', () => {
  it('silently skips duplicate references', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const xt = plugin('Test Plugin')

    expect(dedupePlugins([xt, xt])).toEqual([xt])
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns and skips different instances with the same name', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const first = plugin('Test Plugin')
    const second = plugin('Test Plugin')

    expect(dedupePlugins([first, second])).toEqual([first])
    expect(warn).toHaveBeenCalledWith('duplicate plugin ignored: Test Plugin')
  })
})
