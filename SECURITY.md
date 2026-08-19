# Security and privacy

- Never open an issue containing OAuth tokens, API keys, signed media URLs, or
  private local paths.
- Subscription credentials stay inside the official CLI. This project does not
  read or redistribute `~/.grok/auth.json`.
- `XAI_API_KEY` is read from the host environment and is never returned to the
  browser or model.
- Local media uses an HMAC capability URL. Treat a copied signed URL as private.
- STT and long-video derived uploads require per-operation confirmation.

Please report vulnerabilities privately through GitHub Security Advisories.
