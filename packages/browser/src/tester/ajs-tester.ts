import { Analytics } from '../core/analytics'
import { SerializedContext } from '../core/context'
import mem from 'micro-memoize'
import playwright from 'playwright'

type BrowserType = 'chromium' | 'firefox' | 'webkit'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeStub(page: playwright.Page) {
  const stub = {
    async register(
      ...args: Parameters<Analytics['register']>
    ): Promise<SerializedContext> {
      return await page.evaluate((innerArgs) => {
        return (
          // @ts-ignore
          window.htevents
            .register(...innerArgs)
            // @ts-ignore
            .then((ctx) => ctx.toJSON())
        )
      }, args)
    },
    async track(
      ...args: Parameters<Analytics['track']>
    ): Promise<SerializedContext> {
      // @ts-expect-error
      const ctx = await page.evaluate((innerArgs) => {
        // @ts-ignore
        return window.htevents.track(...innerArgs).then((ctx) => {
          return ctx.toJSON()
        })
        // @ts-ignore
      }, args)

      return ctx
    },
    async page(
      ...args: Parameters<Analytics['page']>
    ): Promise<SerializedContext> {
      const ctx = await page.evaluate((innerArgs) => {
        // @ts-ignore
        return window.htevents.page(...innerArgs).then((ctx) => {
          return ctx.toJSON()
        })
        // @ts-ignore
      }, args)

      return ctx
    },

    async identify(
      ...args: Parameters<Analytics['identify']>
    ): Promise<SerializedContext> {
      const ctx = await page.evaluate((innerArgs) => {
        // @ts-ignore
        return window.htevents.identify(...innerArgs).then((ctx) => {
          return ctx.toJSON()
        })
        // @ts-ignore
      }, args)

      return ctx
    },

    browserPage: page,
  }

  return stub
}

export const getBrowser = mem(
  async (browserType?: BrowserType, remoteDebug?: boolean) => {
    const browser = await playwright[browserType ?? 'chromium'].launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        remoteDebug ? '--remote-debugging-port=9222' : '',
      ],
    })

    process.on('unhandledRejection', () => {
      void (browser && browser.close())
    })

    return browser
  }
)

export async function testerTeardown(): Promise<void> {
  const browser = await getBrowser()
  await browser.close()
}

export async function tester(
  _writeKey: string,
  url?: string,
  browserType?: BrowserType,
  remoteDebug?: boolean
): Promise<ReturnType<typeof makeStub>> {
  const browser = await getBrowser(browserType, remoteDebug)
  const page = await browser.newPage()

  await page.goto(
    url || `file://${process.cwd()}/src/tester/__fixtures__/index.html`
  )
  await page.evaluate(`
    window.AnalyticsNext.HtEventsBrowser.load({
      writeKey: '${_writeKey}',
    }).then(loaded => {
      window.htevents = loaded[0]
    })
  `)

  await page.waitForFunction('window.htevents !== undefined')
  return makeStub(page)
}
