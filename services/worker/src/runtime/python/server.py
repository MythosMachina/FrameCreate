import json
import os
import sys
from pathlib import Path


def load_pipeline(model_path, torch_dtype):
    from diffusers import StableDiffusionPipeline, StableDiffusionXLPipeline

    try:
        pipe = StableDiffusionXLPipeline.from_single_file(
            str(model_path), torch_dtype=torch_dtype
        )
    except Exception:
        pipe = StableDiffusionPipeline.from_single_file(
            str(model_path), torch_dtype=torch_dtype
        )
    return pipe


def configure_scheduler(pipe, sampler, schedule_mode):
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

    sampler = (sampler or "").strip().lower()
    schedule_mode = (schedule_mode or "").strip().lower()
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
    if scheduler_cls is None:
        return
    scheduler = scheduler_cls.from_config(pipe.scheduler.config)
    if sampler.startswith("dpmpp") and hasattr(scheduler, "algorithm_type"):
        scheduler.algorithm_type = "dpmsolver++"
    if schedule_mode == "karras" and hasattr(scheduler, "use_karras_sigmas"):
        scheduler.use_karras_sigmas = True
    elif schedule_mode == "exponential" and hasattr(scheduler, "use_exponential_sigmas"):
        scheduler.use_exponential_sigmas = True
    pipe.scheduler = scheduler


def apply_loras(pipe, lora_entries):
    if not lora_entries:
        if hasattr(pipe, "unload_lora_weights"):
            pipe.unload_lora_weights()
        return

    if hasattr(pipe, "unload_lora_weights"):
        pipe.unload_lora_weights()

    adapter_names = []
    adapter_weights = []
    for index, (lora_path, weight) in enumerate(lora_entries):
        adapter_name = f"lora_{index}"
        lora_path = Path(lora_path)
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


def read_requests():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        yield line


def write_response(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def main():
    try:
        import torch
    except Exception as exc:
        write_response({"status": "error", "error": str(exc)})
        return

    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    device = "cuda" if torch.cuda.is_available() else "cpu"
    pipe = None
    current_model = None

    for raw in read_requests():
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            write_response({"status": "error", "error": "invalid_json"})
            continue

        action = payload.get("action")
        if action == "reload":
            pipe = None
            current_model = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            write_response({"status": "ok"})
            continue

        if action != "generate":
            write_response({"status": "error", "error": "unknown_action"})
            continue

        model_path = Path(payload.get("model_path", "")).expanduser()
        if not model_path.exists():
            write_response({"status": "error", "error": "model_not_found"})
            continue

        try:
            if pipe is None or current_model != str(model_path):
                pipe = load_pipeline(model_path, torch_dtype)
                pipe = pipe.to(device)
                if hasattr(pipe, "safety_checker"):
                    pipe.safety_checker = None
                current_model = str(model_path)

            configure_scheduler(pipe, payload.get("sampler", ""), payload.get("scheduler", ""))

            lora_entries = payload.get("loras", [])
            apply_loras(pipe, lora_entries)

            preview_enabled = bool(payload.get("preview_enabled", False))
            preview_interval = int(payload.get("preview_interval") or 0)
            preview_path = payload.get("preview_path", "")
            cancel_path = payload.get("cancel_path", "")
            cancel_path = Path(cancel_path) if cancel_path else None

            preview_interval = max(1, preview_interval) if preview_enabled else 0
            if cancel_path and cancel_path.exists():
                write_response({"status": "error", "error": "cancelled"})
                continue

            def save_preview(latents):
                if not preview_path:
                    return
                if hasattr(pipe, "decode_latents"):
                    image = pipe.decode_latents(latents)
                    image = (image * 255).round().astype("uint8")
                    from PIL import Image
                    preview = Image.fromarray(image[0])
                else:
                    latents = latents / pipe.vae.config.scaling_factor
                    image = pipe.vae.decode(latents).sample
                    image = (image / 2 + 0.5).clamp(0, 1)
                    image = image.cpu().permute(0, 2, 3, 1).float().numpy()
                    image = (image * 255).round().astype("uint8")
                    from PIL import Image
                    preview = Image.fromarray(image[0])
                os.makedirs(Path(preview_path).parent, exist_ok=True)
                preview.save(preview_path, "JPEG", quality=80)

            def callback_on_step_end(_pipe, step, _timestep, callback_kwargs):
                if cancel_path and cancel_path.exists():
                    raise RuntimeError("cancelled")
                if preview_interval and step % preview_interval == 0:
                    latents = callback_kwargs.get("latents")
                    if latents is not None:
                        save_preview(latents)
                return callback_kwargs

            generator = torch.Generator(device=pipe.device).manual_seed(int(payload.get("seed", 0)))
            result = pipe(
                prompt=payload.get("prompt", ""),
                negative_prompt=payload.get("negative_prompt", ""),
                width=int(payload.get("width", 1024)),
                height=int(payload.get("height", 1024)),
                num_inference_steps=int(payload.get("steps", 30)),
                guidance_scale=float(payload.get("cfg", 7.5)),
                generator=generator,
                callback_on_step_end=callback_on_step_end if preview_interval else None,
                callback_on_step_end_tensor_inputs=["latents"] if preview_interval else None,
            )

            output_path = Path(payload.get("output", "output.png"))
            os.makedirs(output_path.parent, exist_ok=True)
            result.images[0].save(output_path)
            write_response({"status": "ok", "output": str(output_path)})
        except Exception as exc:
            write_response({"status": "error", "error": str(exc)})


if __name__ == "__main__":
    main()
