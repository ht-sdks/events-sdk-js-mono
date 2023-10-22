# Releasing

### Candidate release
Pushing a new tag kicks of a Github Actions workflow that pushes new candidate releases to:
- browser standalone: `https://cdn.hightouch-events.com/browser/candidate/${gitTag}/events.min.js`
- npm: TODO
- node: TODO

For example:

```
git tag v0.0.5
git push origin v0.0.5
```

### General audience release
Making a github release, from a git tag, kicks off a Github Actions workflow that pushes the new release to:
- browser standalone: `https://cdn.hightouch-events.com/browser/release/${gitTag}/events.min.js`
- npm: TODO
- node: TODO

For example:

```
git tag v0.0.5
git push origin v0.0.5
```
Then make a new release: https://github.com/ht-sdks/events-sdk-js/releases/new
