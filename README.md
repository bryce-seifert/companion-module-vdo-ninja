# companion-module-vdo-ninja

See [HELP.md](./companion/HELP.md) and [LICENSE](./LICENSE)

## Development

```bash
yarn install
yarn build      # compile to dist/
yarn dev        # compile in watch mode
yarn lint
yarn test       # unit tests
```

### End-to-end tests

`yarn test:e2e` opens real VDO.Ninja pages in headless Chromium and drives them through the module, using a local relay in place of `api.vdo.ninja` (VDO.Ninja's `&apiserver=` parameter points the pages at it). They cover local commands on a single page, and director commands with a guest joined to the room.

- They need internet access: the pages load from vdo.ninja, and the director and guest connect through VDO.Ninja's public signalling server.
- Install Chromium once with `yarn test:e2e:install`.
- They run against `https://vdo.ninja/v30/` by default; set `VDO_NINJA_URL` to test another release.
- They are not run in CI.
