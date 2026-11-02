# Releasing `@abelmferreira/mcp-postgres`

Two artifacts come from the same git tag `vX.Y.Z`:

| Artifact | Where | Workflow |
|---|---|---|
| npm package | `@abelmferreira/mcp-postgres` | `.github/workflows/publish-npm.yml` (Trusted Publishing / OIDC, no token) |
| Docker image | `abelmferreira/mcp-postgres` on Docker Hub (amd64 + arm64) | `.github/workflows/publish-docker.yml` (secrets `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`) |

Cut a release from a green `main`: bump the version in `package.json`, `package-lock.json` and
`CHANGELOG.md`, commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`. Both workflows check that
the tag matches `package.json`. Pre-release tags (`vX.Y.Z-rc.1`) go to the npm dist-tag `next`.

## First publish (manual) — what actually worked

npm Trusted Publishing can only be configured **after** the package exists, so the first version
has to be published by hand. This was harder than expected; the notes below are the result.

1. **`publishConfig.provenance: true` breaks local publishes.** Provenance only works inside
   GitHub Actions. A local `npm publish` fails with
   `Automatic provenance generation not supported for provider: null`.
   Publish locally with `--provenance=false`.
2. **`npm login` (browser flow) did not work for us.** After logging in, the publish was rejected with
   `403 Forbidden - Two-factor authentication or granular access token with bypass 2fa enabled is
   required to publish packages.` Retrying with the same login did not help.
3. **What worked: a granular access token with "Bypass two-factor authentication" checked.**
   - npmjs.com → Access Tokens → Generate New Token → *Granular Access Token*.
   - Permissions: read and write on packages; scope `@abelmferreira` (or all packages — the package
     does not exist yet, so it cannot be selected by name).
   - Tick **Bypass two-factor authentication**. Tokens last at most 90 days.
   - Put it in `~/.npmrc` as `//registry.npmjs.org/:_authToken=<token>` (mode 600), remove any older
     `_authToken` lines, then run `npm publish --access public --provenance=false`.
   - npm prints a notice that tokens that bypass 2FA are being restricted for direct publishing; it
     still worked for the first publish, but treat it as a one-off.
4. **Revoke the token right after the first publish** (npmjs.com → Access Tokens).

Do all of this in a container if you do not want npm on the host, for example:

```bash
docker run --rm -it --user "$(id -u):$(id -g)" --tmpfs /home/node:rw,mode=1777 -e HOME=/home/node \
  -v "$HOME/.npmrc":/home/node/.npmrc -v "$PWD":/app -w /app node:22-alpine \
  npm publish --access public --provenance=false
```

## Configure the trusted publisher (once, after the first publish)

npmjs.com → package → Settings → Trusted Publisher → GitHub Actions:

- Owner: `abelmferreira`
- Repository: `mcp-postgres`
- Workflow filename: `publish-npm.yml`
- Environment: leave empty

Then tick "Require two-factor authentication and disallow tokens". From then on a `v*` tag publishes
to npm with provenance and no stored token.

Version `1.1.0` was published manually, so the npm job of the `v1.1.0` tag would fail (version already
exists). Push that tag only if you want the Docker image for it; the Docker job is independent.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Automatic provenance generation not supported for provider: null` | Local publish with `provenance: true`. Add `--provenance=false`. |
| `403 ... Two-factor authentication or granular access token with bypass 2fa enabled is required` | Account without 2FA, or a login/token without bypass. Use a granular token with bypass (above), or enable 2FA at the "authorization and publishing" level. |
| `404` on `PUT` from the pipeline | Trusted publisher not configured, or owner/repo/workflow name differ from the npm settings. |
| `403 ... cannot publish over the previously published versions` | The version exists; npm versions are immutable. Bump and tag again. |
| Docker `unauthorized` / `denied` | Wrong or expired `DOCKERHUB_TOKEN`, or the Docker Hub repository does not exist. |
