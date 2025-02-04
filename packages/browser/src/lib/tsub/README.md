Vendored from https://github.com/segmentio/tsub-js/tree/9771d565c92b78d0aec90a1f994a7e96ec86c330

### Changes Made
After cloning the original repo, we made the following changes:
- Updated files to use proper TypeScript (mainly cleaning up/fixing type defs)
- Removed dependency on `@stdlib/math-base-special-ldexp`
   - Replaced with local implementation
- Removed dependency on `tiny-hashes`
   - Replaced with `spark-md5` (package which this repo already uses)
