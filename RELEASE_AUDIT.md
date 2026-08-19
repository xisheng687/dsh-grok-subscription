# v0.1.0 release audit

Date: 2026-08-19

## Exact release artifact

- File: `dsh-subscription-media-suite-0.1.0.tgz`
- SHA-256: `575ca07dd8ac11d3f9c3e9d343b62a5d1e2177134990b61f41af2bbe69a9f101`
- Package: 24 files, 15.5 kB compressed, 47.2 kB unpacked

## Privacy and secret scan

- Manual high-risk pattern review: passed
- Gitleaks 8.30.1 on the unpacked artifact: 0 findings
- TruffleHog 3.97.0 on the unpacked artifact: 0 verified or unverified findings
- Confirmed absent: local user paths, temporary paths, pasted device codes, OAuth
  access/refresh tokens, API keys, and client-impersonation headers

## Clean-profile release test

- Installed the exact tarball into a new `DSH_HOME`: passed
- DSH 0.1.0-rc.7 startup and HTML response: passed
- DSH process restart with the same media capability key: passed
- Signed media Range request: `206`, 100 requested bytes returned
- Invalid capability token: `404`
- Unsatisfiable Range request: `416`
- JavaScript syntax checks: passed
- `npm audit`: 0 known vulnerabilities
- `npm publish --dry-run`: passed

## Earlier end-to-end development tests

- Official CLI ACP text and image-understanding subagents
- Image and video generation lanes
- Native audio/video cards across page refresh and DSH restart
- 96-second video: 23 sampled frames plus speech transcription
- 910-second video: transcription crossed the 15-minute chunk boundary
- TTS and STT request/response round trips in the authenticated development environment

The clean public-profile test intentionally did not call billable API endpoints because
no maintainer API key is bundled. Public TTS, STT, and long-video synthesis require the
installer's own `XAI_API_KEY`.
