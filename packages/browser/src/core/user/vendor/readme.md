# Why are we vendoring crypto-es?

> jest syntaxerror: cannot use import statement outside a module

Crypto-es decided to write their package in "esm" style modules, with a ".js" extension, with no babel or other build step. It doesn't work with jest + typescript. https://github.com/jestjs/jest/issues/9430 https://github.com/jestjs/jest/issues/12990

We need crypto-es to "decrypt" Rudder's anonymousId. We've vendored crypto-es (along with its MIT license https://github.com/entronad/crypto-es/blob/master/LICENSE) instead of continuing on the esm + jest issue.
