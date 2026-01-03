import argparse
import json
import os
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--negative", default="")
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--steps", type=int, required=True)
    parser.add_argument("--cfg", type=float, required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--sampler", default="")
    parser.add_argument("--scheduler", default="")
    parser.add_argument("--lora", action="append", default=[])
    parser.add_argument("--cancel-path", default="")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    try:
        import torch
        from diffusers import StableDiffusionPipeline, StableDiffusionXLPipeline
        from diffusers.schedulers import (
            DDIMScheduler,
            DPMSolverMultistepScheduler,
            DPMSolverSDEScheduler,
            EulerAncestralDiscreteScheduler,
            EulerDiscreteScheduler,
            HeunDiscreteScheduler,
            KDPM2AncestralDiscreteScheduler,
            KDPM2DiscreteScheduler,
            LMSDiscreteScheduler,
            PNDMScheduler,
            UniPCMultistepScheduler,
        )
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}))
        sys.exit(1)

    model_path = Path(args.model)
    if not model_path.exists():
        print(json.dumps({"status": "error", "error": "model_not_found"}))
        sys.exit(1)

    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    try:
        pipe = StableDiffusionXLPipeline.from_single_file(
            str(model_path), torch_dtype=torch_dtype
        )
    except Exception:
        pipe = StableDiffusionPipeline.from_single_file(
            str(model_path), torch_dtype=torch_dtype
        )

    vram_mode = os.getenv("FRAMECREATE_VRAM_MODE", "balanced").strip().lower()
    if torch.cuda.is_available():
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True

    if vram_mode == "low" and torch.cuda.is_available():
        if hasattr(pipe, "enable_vae_slicing"):
            pipe.enable_vae_slicing()
        if hasattr(pipe, "enable_vae_tiling"):
            pipe.enable_vae_tiling()
        if hasattr(pipe, "enable_attention_slicing"):
            pipe.enable_attention_slicing("max")
        if hasattr(pipe, "enable_model_cpu_offload"):
            pipe.enable_model_cpu_offload()
    else:
        pipe = pipe.to("cuda" if torch.cuda.is_available() else "cpu")
        if hasattr(pipe, "enable_xformers_memory_efficient_attention"):
            try:
                pipe.enable_xformers_memory_efficient_attention()
            except Exception:
                if hasattr(pipe, "enable_attention_slicing"):
                    pipe.enable_attention_slicing("auto")
        elif hasattr(pipe, "enable_attention_slicing"):
            pipe.enable_attention_slicing("auto")
        if hasattr(pipe, "enable_vae_slicing"):
            pipe.enable_vae_slicing()

    if hasattr(pipe, "safety_checker"):
        pipe.safety_checker = None

    lora_entries = []
    for raw in args.lora:
        path_value = raw.strip()
        if not path_value:
            continue
        if "|" in path_value:
            path_part, weight_part = path_value.rsplit("|", 1)
        else:
            path_part, weight_part = path_value, "1.0"
        lora_path = Path(path_part).expanduser()
        if not lora_path.exists():
            print(json.dumps({"status": "error", "error": f"lora_not_found:{lora_path}"}))
            sys.exit(1)
        try:
            weight = float(weight_part)
        except ValueError:
            weight = 1.0
        lora_entries.append((lora_path, weight))

    sampler = args.sampler.strip().lower()
    schedule_mode = args.scheduler.strip().lower()
    scheduler_map = {
        "euler": EulerDiscreteScheduler,
        "euler_a": EulerAncestralDiscreteScheduler,
        "heun": HeunDiscreteScheduler,
        "lms": LMSDiscreteScheduler,
        "ddim": DDIMScheduler,
        "pndm": PNDMScheduler,
        "dpm2": KDPM2DiscreteScheduler,
        "dpm2_a": KDPM2AncestralDiscreteScheduler,
        "dpmpp_2m": DPMSolverMultistepScheduler,
        "dpmpp_sde": DPMSolverSDEScheduler,
        "unipc": UniPCMultistepScheduler,
    }
    scheduler_cls = scheduler_map.get(sampler)
    if scheduler_cls is not None:
        scheduler = scheduler_cls.from_config(pipe.scheduler.config)
        if sampler.startswith("dpmpp") and hasattr(scheduler, "algorithm_type"):
            scheduler.algorithm_type = "dpmsolver++"
        if schedule_mode == "karras" and hasattr(scheduler, "use_karras_sigmas"):
            scheduler.use_karras_sigmas = True
        elif schedule_mode == "exponential" and hasattr(scheduler, "use_exponential_sigmas"):
            scheduler.use_exponential_sigmas = True
        pipe.scheduler = scheduler

    if lora_entries:
        adapter_names = []
        adapter_weights = []
        for index, (lora_path, weight) in enumerate(lora_entries):
            adapter_name = f"lora_{index}"
            if lora_path.is_file():
                pipe.load_lora_weights(
                    str(lora_path.parent),
                    weight_name=lora_path.name,
                    adapter_name=adapter_name,
                )
            else:
                pipe.load_lora_weights(str(lora_path), adapter_name=adapter_name)
            adapter_names.append(adapter_name)
            adapter_weights.append(weight)
        if hasattr(pipe, "set_adapters"):
            pipe.set_adapters(adapter_names, adapter_weights=adapter_weights)

    cancel_path = Path(args.cancel_path).expanduser() if args.cancel_path else None
    if cancel_path and cancel_path.exists():
        print(json.dumps({"status": "error", "error": "cancelled"}))
        sys.exit(1)

    generator = torch.Generator(device=pipe.device).manual_seed(args.seed)
    with torch.inference_mode():
        result = pipe(
            prompt=args.prompt,
            negative_prompt=args.negative,
            width=args.width,
            height=args.height,
            num_inference_steps=args.steps,
            guidance_scale=args.cfg,
            generator=generator,
        )

    os.makedirs(Path(args.output).parent, exist_ok=True)
    result.images[0].save(args.output)

    print(json.dumps({"status": "ok", "output": args.output}))


if __name__ == "__main__":
    main()
