# FrameCreate Storage Layout

FrameCreate expects a predictable filesystem layout for models, LoRAs, embeddings, and outputs. All paths are configurable via environment variables, but default to the repository `storage/` tree.

## Default directories

- `storage/models` - checkpoints and base models
- `storage/loras` - LoRA weights
- `storage/vaes` - VAE weights
- `storage/embeddings` - text/embedding weights
- `storage/outputs` - generated images
- `storage/thumbnails` - preview thumbnails (reserved)

## Supported file types

- Checkpoints: `.safetensors`, `.ckpt`, `.pt`, `.onnx`
- LoRAs: `.safetensors`, `.pt`
- VAEs: `.safetensors`, `.ckpt`, `.pt`, `.onnx`
- Embeddings: `.pt`, `.bin`

## Metadata sidecars

For every weight file, the indexer will look for sidecars:

- `filename.json` - arbitrary metadata JSON (merged into `metadata` column)
- `filename.txt` - comma or newline separated trigger words

Example:

- `storage/models/atlas.safetensors`
- `storage/models/atlas.json`
- `storage/models/atlas.txt`

## Database fields

`model_assets` keeps normalized metadata:

- `kind`: checkpoint | lora | embedding
- `name`: inferred from filename
- `path`: absolute file path
- `sha256`: content hash
- `trigger_words`: parsed from `.txt`
- `metadata`: raw JSON
