# Security and privacy

- Never open an issue containing OAuth tokens, API keys, signed media URLs, or
  private local paths.
- Subscription credentials stay inside the official CLI. This project does not
  read or redistribute `~/.grok/auth.json`.
- `XAI_API_KEY` is read from the host environment and is never returned to the
  browser or model.
- Local media uses an HMAC capability URL. Treat a copied signed URL as private.
- Original-video, STT, and derived-media uploads require per-operation confirmation.
- Original video uploads use a one-hour Files API expiry and are also deleted
  immediately after success, failure, or cancellation whenever an ID was issued.
- Image attachments use DSH 0.1.0-rc.8's validated content-addressed store; this
  plugin does not create a second image upload route or image credential path.

Please report vulnerabilities privately through GitHub Security Advisories.
