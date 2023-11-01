import { Analytics } from '../../core/analytics'

export async function loadLegacyVideoPlugins(
  htevents: Analytics
): Promise<void> {
  const plugins = await import(
    // @ts-expect-error
    '@segment/analytics.js-video-plugins/dist/index.umd.js'
  )

  // This is super gross, but we need to support the `window.htevents.plugins` namespace
  // that is linked in the hightouch docs in order to be backwards compatible with ajs-classic

  // @ts-expect-error
  htevents._plugins = plugins
}
