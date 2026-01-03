# Configuration

FrameCreate reads configuration from environment variables. Copy `.env.example` to `.env` and adjust paths.

Key variables:

- `FRAMECREATE_DATABASE_URL` - Postgres connection string
- `FRAMECREATE_ROOT` - root path for default storage lookups
- `FRAMECREATE_MODELS_DIR` - checkpoints directory
- `FRAMECREATE_LORAS_DIR` - LoRA directory
- `FRAMECREATE_VAES_DIR` - VAE directory
- `FRAMECREATE_EMBEDDINGS_DIR` - embeddings directory
- `FRAMECREATE_OUTPUTS_DIR` - generated images
- `FRAMECREATE_THUMBNAILS_DIR` - thumbnails directory
- `FRAMECREATE_PORT` - API port
- `FRAMECREATE_WORKER_PORT` - Worker port
- `FRAMECREATE_INDEXER_PORT` - Indexer port
- `FRAMECREATE_WORKER_URL` - API -> worker URL
- `FRAMECREATE_INDEXER_URL` - API -> indexer URL
- `FRAMECREATE_CONCURRENCY` - in-process worker concurrency
- `FRAMECREATE_VRAM_MODE` - VRAM strategy (`balanced` default, `low` for offload)
