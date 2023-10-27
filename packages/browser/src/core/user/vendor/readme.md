# Why are we vendoring crypto-es?

> jest syntaxerror: cannot use import statement outside a module

- I've spent hours trying to get jest to work with esm style modules in a node_modules dependency.
- I've spent hours trying babels, more jests, transforms, transformIgnoreModuls, and more.
- So instead, I've vendored the tiny bit of functionality we need from crypto-es (along with its MIT license https://github.com/entronad/crypto-es/blob/master/LICENSE). This functionality is needed for "decrypting" Rudder's anonymousId. Why does Rudder "encrypt" the anonymousId when the "key" is public in their repository? I don't know.

See this insanity:
- https://github.com/jestjs/jest/issues/9430
- https://github.com/jestjs/jest/issues/12990

500+ comments and no real resolution.

This is Javascript in 2023.
