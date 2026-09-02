import { fetch } from '../fetch'
import { getGlobal } from '../get-global'
import unfetch from 'unfetch'

jest.mock('unfetch')
const unfetchMock = jest.mocked(unfetch).mockResolvedValue({} as Response)

jest.mock('../get-global')
const getGlobalMock = jest.mocked(getGlobal)

describe(fetch, () => {
  const testFetchArgs = ['http://foo.com', {}] as const

  it('should call native fetch if available', () => {
    const nativeFetchMock = jest.fn()
    getGlobalMock.mockReturnValue({ ...window, fetch: nativeFetchMock })
    void fetch(...testFetchArgs)
    expect(nativeFetchMock).toHaveBeenCalledWith(...testFetchArgs)
    expect(unfetchMock).not.toHaveBeenCalled()
  })
  it('should fall back to unfetch in non-browserlike environment', () => {
    getGlobalMock.mockReturnValue(null)
    void fetch(...testFetchArgs)
    expect(unfetchMock).toHaveBeenCalledWith(...testFetchArgs)
  })
  it('should fall back to unfetch if native fetch is unsupported', () => {
    getGlobalMock.mockReturnValue({
      ...window,
      fetch: undefined,
    } as any)

    void fetch(...testFetchArgs)
    expect(unfetchMock).toHaveBeenCalledWith(...testFetchArgs)
  })
})
