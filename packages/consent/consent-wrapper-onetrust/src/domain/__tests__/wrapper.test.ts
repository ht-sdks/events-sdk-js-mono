import * as ConsentTools from '@ht-sdks/events-sdk-js-consent-tools'
import * as OneTrustAPI from '../../lib/onetrust-api'
import { sleep } from '@internal/test-helpers'
import { withOneTrust } from '../wrapper'
import { OneTrustMockGlobal, analyticsMock } from '../../test-helpers/mocks'

const throwNotImplemented = (): never => {
  throw new Error('not implemented')
}

const grpFixture = {
  StrictlyNeccessary: {
    CustomGroupId: 'C0001',
  },
  Targeting: {
    CustomGroupId: 'C0004',
  },
  Performance: {
    CustomGroupId: 'C0005',
  },
}

const getConsentedGroupIdsSpy = jest
  .spyOn(OneTrustAPI, 'getConsentedGroupIds')
  .mockImplementationOnce(throwNotImplemented)

const createWrapperSpyHelper = {
  _spy: jest.spyOn(ConsentTools, 'createWrapper'),
  get shouldLoad() {
    return createWrapperSpyHelper._spy.mock.lastCall![0].shouldLoad!
  },
  get getCategories() {
    return createWrapperSpyHelper._spy.mock.lastCall![0].getCategories!
  },
  get registerOnConsentChanged() {
    return createWrapperSpyHelper._spy.mock.lastCall![0]
      .registerOnConsentChanged!
  },
}

/**
 * These tests are not meant to be comprehensive, but they should cover the most important cases.
 * We should prefer unit tests for most functionality (see lib/__tests__)
 */
describe('High level "integration" tests', () => {
  beforeEach(() => {
    jest
      .spyOn(OneTrustAPI, 'getOneTrustGlobal')
      .mockImplementation(() => OneTrustMockGlobal)
    getConsentedGroupIdsSpy.mockReset()
    Object.values(OneTrustMockGlobal).forEach((fn) => fn.mockReset())
  })

  describe('shouldLoad', () => {
    it('should be resolved successfully', async () => {
      withOneTrust(analyticsMock)
      OneTrustMockGlobal.GetDomainData.mockReturnValueOnce({
        Groups: [grpFixture.StrictlyNeccessary, grpFixture.Performance],
      })
      getConsentedGroupIdsSpy.mockImplementation(() => [
        grpFixture.StrictlyNeccessary.CustomGroupId,
      ])
      const shouldLoadP = Promise.resolve(
        createWrapperSpyHelper.shouldLoad({} as any)
      )
      let shouldLoadResolved = false
      void shouldLoadP.then(() => (shouldLoadResolved = true))
      await sleep(0)
      expect(shouldLoadResolved).toBe(false)
      OneTrustMockGlobal.IsAlertBoxClosed.mockReturnValueOnce(true)
      const result = await shouldLoadP
      expect(result).toBe(undefined)
    })
  })

  describe('getCategories', () => {
    it('should get categories successfully', async () => {
      withOneTrust(analyticsMock)
      OneTrustMockGlobal.GetDomainData.mockReturnValue({
        Groups: [
          grpFixture.StrictlyNeccessary,
          grpFixture.Performance,
          grpFixture.Targeting,
        ],
      })
      getConsentedGroupIdsSpy.mockImplementation(() => [
        grpFixture.StrictlyNeccessary.CustomGroupId,
      ])
      const categories = createWrapperSpyHelper.getCategories()
      // contain both consented and denied category
      expect(categories).toEqual({
        C0001: true,
        C0004: false,
        C0005: false,
      })
    })
  })

  describe('Consent changed', () => {
    it('should enable consent changed by default', async () => {
      withOneTrust(analyticsMock)
      OneTrustMockGlobal.GetDomainData.mockReturnValue({
        Groups: [
          grpFixture.StrictlyNeccessary,
          grpFixture.Performance,
          grpFixture.Targeting,
        ],
      })
      const setCategories = jest.fn()

      createWrapperSpyHelper.registerOnConsentChanged(setCategories)
      setCategories()

      await sleep(0)

      const onConsentChangedArg =
        OneTrustMockGlobal.OnConsentChanged.mock.lastCall![0]
      onConsentChangedArg(
        new CustomEvent('', {
          detail: [
            grpFixture.StrictlyNeccessary.CustomGroupId,
            grpFixture.Performance.CustomGroupId,
          ],
        })
      )
      // expect to be normalized!
      expect(setCategories.mock.lastCall[0]).toEqual({
        [grpFixture.StrictlyNeccessary.CustomGroupId]: true,
        [grpFixture.Performance.CustomGroupId]: true,
        [grpFixture.Targeting.CustomGroupId]: false,
      })
    })
  })
})
