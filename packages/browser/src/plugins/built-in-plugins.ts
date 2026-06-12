export const BUILT_IN_PLUGINS = ['facebook-params'] as const

export type BuiltInPluginName = (typeof BUILT_IN_PLUGINS)[number]
