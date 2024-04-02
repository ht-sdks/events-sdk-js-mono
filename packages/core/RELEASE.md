### Publishing New Version

This package follows semantic versioning. To publish a new version:

1. Create a new GitHub Release with a git tag matching the format `core@x.x.x`
   - A new package will be published to NPM automatically via GitHub Actions. No need to manually bump any versions in `package.json` since the GH Action will automatically set the version based on the git tag.
   - We do recommend bumping the `package.json` version manually if publishing a new **major** version as a way of documenting which major version the code base currently represents, but the published NPM/CDN packages will always use the version parsed from the git tag `core@x.x.x`
