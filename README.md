# FrameFamily

A modular AI ecosystem focused on frame-based image generation, training, and visualization.

## Components

- **Training**  
  [FrameForge](https://github.com/MythosMachina/FrameForge)  
  AI training, dataset preparation, and orchestration within the Frame ecosystem.

- **Viewing**  
  [FrameView](https://github.com/MythosMachina/FrameView)  
  Visualization, inspection, and analysis of generated frames and training results.

- **Generating**  
  [FrameCreate](https://github.com/MythosMachina/FrameCreate)  
  Generative image AI of the Frame ecosystem.  
  _Work in Progress_
  
# FrameCreate

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node.js-required-green.svg)](https://nodejs.org/)
[![Postgres](https://img.shields.io/badge/postgres-required-blue.svg)](https://www.postgresql.org/)

FrameCreate is the generative core of the FrameFamily. It gives you a clean, fast image generator with a calm UI, model control, and a clear history of every output.

_Work in Progress_

Notice: Right now only SDXL-based models are supported. Embeddings are not wired yet.

> FrameCreate is built for creative, synthetic, and stylized content.
> Use on real individuals without consent is explicitly discouraged.

Support and Questions -> Discord  
https://discord.gg/TB5DHMNa5J

## Why you might like it
- One place to generate, manage models, and review results.
- A clear, uncluttered workflow that stays consistent with FrameFamily.
- Fast queue handling so the machine stays focused on generation.
- Built to stay fully open and self-hosted.

## What you can do
- Generate images with live preview and stop running jobs when needed.
- Manage base models, LoRAs, and VAEs in one place.
- Stack up to three LoRAs and control each strength.
- Browse history with metadata, reuse prompts, and delete what you do not need.
- Use preset styles and wildcard prompts to speed up prompting.
- Set default sampling and live preview settings in System.

## Quick Start
```bash
./scripts/setup.sh
```

Open the Web UI at `http://localhost:5174`.
The setup script installs dependencies, prepares the database, runs migrations, and enables systemd services.

What you need: Node.js + npm, Python 3, and Postgres. A GPU is recommended for generation.

## First steps
1. Run the setup command above.
2. Open the web UI.
3. Drop your models into the `storage/` folders (see below).
4. Use the Model Manager to rescan.
5. Generate your first image.

## Storage Layout
FrameCreate stores everything it needs under the `storage/` folder. You can drop your models there and FrameCreate will find them.

```
storage/
  models/       # base checkpoints (.safetensors)
  loras/        # LoRA adapters (.safetensors)
  embeddings/   # text embeddings
  outputs/      # generated images
  thumbnails/   # UI thumbnails
  wildcards/    # prompt wildcard lists (.txt)
```

Tip: After adding models, open the Model Manager and click Rescan.

## Wildcard prompts
Drop a text file into `storage/wildcards/`. Each line is one option. Use it in your prompt like `__colors__`.

Example:
- `storage/wildcards/colors.txt`
  ```
  red
  blue
  green
  ```
- Prompt: `a __colors__ car`  
  Each image in a series uses the next line from the file. New runs start from the top again.

## Optional: advanced setup
If you want to change ports, database settings, or runtime options, edit `.env`. You can start from `.env.example`.

## License
MIT
