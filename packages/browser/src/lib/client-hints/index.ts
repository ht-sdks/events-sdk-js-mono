import { HighEntropyHint, NavigatorUAData, UADataValues } from './interfaces'

// Tolerate Pascal-cased `Brand` / `Version` aliases emitted by some polyfills
// and enterprise wrappers on `brands` entries. The W3C spec only defines
// lowercase `brand` / `version`
// (https://wicg.github.io/ua-client-hints/#dictdef-navigatoruabrandversion),
// and downstream consumers read those, so we coerce to lowercase here.
function normalizeBrands(
  brands: UADataValues['brands']
): UADataValues['brands'] {
  return brands?.map(({ Brand, Version, brand, version, ...rest }: any) => ({
    ...rest,
    brand: brand ?? Brand,
    version: version ?? Version,
  }))
}

export async function clientHints(
  hints?: HighEntropyHint[]
): Promise<UADataValues | undefined> {
  const userAgentData = (navigator as any).userAgentData as
    | NavigatorUAData
    | undefined

  if (!userAgentData) return undefined

  const data = !hints
    ? userAgentData.toJSON()
    : await userAgentData
        .getHighEntropyValues(hints)
        .catch(() => userAgentData.toJSON())

  return { ...data, brands: normalizeBrands(data.brands) }
}
