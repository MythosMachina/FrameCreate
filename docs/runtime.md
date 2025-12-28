# Generation Runtime

FrameCreate uses a Node-native runtime by design. The current worker includes a mock renderer that exercises the queue, database, and output pipeline without external dependencies.

## Current PoC

- In-process worker queue (no Redis/BullMQ)
- Mock image generation using `pngjs`
- Outputs saved under `storage/outputs`

## Roadmap

- Replace `runtime/mock.ts` with a GPU-backed Node runtime (OSS-only)
- Keep the same `generate` interface so UI/API remain stable
- Profile output latency and throughput under multi-GPU workloads
