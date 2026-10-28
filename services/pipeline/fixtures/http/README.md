# HTTP fixtures

Synthetic responses used by unit tests and by the offline dry run (`pnpm pipeline:dry`).
`manifest.json` maps request URLs to these files; any other URL returns 404.

All content is **fictional** and uses `example.com` / `example.org` domains. Never commit real
articles or feeds here: this repository is public and that content belongs to its publishers.
The dry run's clock is fixed (see `manifest.json`), so dates here are relative to that moment.
