import { clientHints } from '..'
import {
  highEntropyTestData,
  lowEntropyTestData,
} from '../../../test-helpers/fixtures/client-hints'
import { UADataValues } from '../interfaces'

describe('Client Hints API', () => {
  beforeEach(() => {
    ;(window.navigator as any).userAgentData = {
      ...lowEntropyTestData,
      getHighEntropyValues: jest
        .fn()
        .mockImplementation((hints: string[]): Promise<UADataValues> => {
          let result = {}
          Object.entries(highEntropyTestData).forEach(([k, v]) => {
            if (hints.includes(k)) {
              result = {
                ...result,
                [k]: v,
              }
            }
          })
          return Promise.resolve({
            ...lowEntropyTestData,
            ...result,
          })
        }),
      toJSON: jest.fn(() => {
        return lowEntropyTestData
      }),
    }
  })

  it('uses API when available', async () => {
    let userAgentData = await clientHints()
    expect(userAgentData).toEqual(lowEntropyTestData)
    ;(window.navigator as any).userAgentData = undefined
    userAgentData = await clientHints()
    expect(userAgentData).toBe(undefined)
  })

  it('always gets low entropy hints', async () => {
    const userAgentData = await clientHints()
    expect(userAgentData).toEqual(lowEntropyTestData)
  })

  it('gets low entropy hints when client rejects high entropy promise', async () => {
    ;(window.navigator as any).userAgentData = {
      ...lowEntropyTestData,
      getHighEntropyValues: jest.fn(() => Promise.reject()),
      toJSON: jest.fn(() => lowEntropyTestData),
    }

    const userAgentData = await clientHints(['bitness'])
    expect(userAgentData).toEqual(lowEntropyTestData)
  })

  it('gets specified high entropy hints', async () => {
    const userAgentData = await clientHints(['bitness'])
    expect(userAgentData).toEqual({
      ...lowEntropyTestData,
      bitness: '64',
    })
  })

  it('normalizes Pascal-cased `Brand`/`Version` on `brands` to spec lowercase keys', async () => {
    const pascalCasedBrands = {
      brands: [
        { Brand: 'Microsoft Edge', Version: '143' },
        { Brand: 'Chromium', Version: '143' },
        { brand: 'Not A(Brand', Version: '99' },
      ],
      mobile: false,
      platform: 'Windows',
    }

    ;(window.navigator as any).userAgentData = {
      ...pascalCasedBrands,
      getHighEntropyValues: jest.fn(() => Promise.resolve(pascalCasedBrands)),
      toJSON: jest.fn(() => pascalCasedBrands),
    }

    const lowEntropy = await clientHints()
    expect(lowEntropy?.brands).toEqual([
      { brand: 'Microsoft Edge', version: '143' },
      { brand: 'Chromium', version: '143' },
      { brand: 'Not A(Brand', version: '99' },
    ])
  })
})
