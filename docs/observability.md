# Observability

FrameCreate uses structured Fastify logs for API, worker, and indexer services. Logs are JSON by default and can be shipped to any collector.

## Signals

- API: request/response logging, job creation
- Worker: job lifecycle (queued, running, completed, failed)
- Indexer: scan duration and counts

## Tips

- Run services with `NODE_ENV=production` for consistent output
- Use `journalctl -u framecreate-*` when running under systemd
