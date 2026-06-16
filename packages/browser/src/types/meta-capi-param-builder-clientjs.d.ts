declare module 'meta-capi-param-builder-clientjs' {
  // Facebook Parameter Builder SDK types (clientParamBuilder)
  // Based on Meta's official API: https://developers.facebook.com/docs/marketing-api/conversions-api/parameter-builder-feature-library/client-side-onboarding
  export interface ClientParamBuilder {
    /**
     * Processes and collects all parameters (fbc, fbp, client_ip_address).
     * Must be called before getFbc(), getFbp(), or getClientIpAddress().
     * @param url - Optional. The full URL to collect clickID from. If not provided, uses window.location.href
     * @param getIpFn - Optional. Function to retrieve client IPv6 address (fallback to IPv4 if unavailable)
     * @returns Promise that resolves to updated cookie object with _fbc, _fbp, and _fbi keys
     */
    processAndCollectAllParams(
      url?: string,
      getIpFn?: () => Promise<string>
    ): Promise<{ _fbc?: string; _fbp?: string; _fbi?: string }>
    /**
     * Returns the fbc value from cookie. Returns empty string if cookie does not exist.
     */
    getFbc(): string
    /**
     * Returns the fbp value from cookie. Returns empty string if cookie does not exist.
     */
    getFbp(): string
    /**
     * Returns the client_ip_address value from cookie. Returns empty string if cookie does not exist.
     */
    getClientIpAddress(): string
  }

  const clientParamBuilder: ClientParamBuilder
  export default clientParamBuilder
}
