export type PresetStyle = {
  id: string;
  name: string;
  prompt: string;
  negative_prompt: string;
};

const styles: PresetStyle[] = [
  {
    id: "enhance",
    name: "Enhance",
    prompt: "enhance",
    negative_prompt:
      "(worst quality, low quality, normal quality, lowres, low details, oversaturated, undersaturated, overexposed, underexposed, grayscale, bw, bad photo, bad photography, bad art:1.4), (watermark, signature, text font, username, error, logo, words, letters, digits, autograph, trademark, name:1.2), (blur, blurry, grainy), morbid, ugly, asymmetrical, mutated malformed, mutilated, poorly lit, bad shadow, draft, cropped, out of frame, cut off, censored, jpeg artifacts, out of focus, glitch, duplicate, (airbrushed, cartoon, anime, semi-realistic, cgi, render, blender, digital art, manga, amateur:1.3), (3D ,3D Game, 3D Game Scene, 3D Character:1.1), (bad hands, bad anatomy, bad body, bad face, bad teeth, bad arms, bad legs, deformities:1.3)"
  },
  {
    id: "semi-realistic",
    name: "Semi Realistic",
    prompt: "semi realistic",
    negative_prompt:
      "(worst quality, low quality, normal quality, lowres, low details, oversaturated, undersaturated, overexposed, underexposed, bad photo, bad photography, bad art:1.4), (watermark, signature, text font, username, error, logo, words, letters, digits, autograph, trademark, name:1.2), (blur, blurry, grainy), morbid, ugly, asymmetrical, mutated malformed, mutilated, poorly lit, bad shadow, draft, cropped, out of frame, cut off, censored, jpeg artifacts, out of focus, glitch, duplicate, (bad hands, bad anatomy, bad body, bad face, bad teeth, bad arms, bad legs, deformities:1.3)"
  },
  {
    id: "sharp",
    name: "Sharp",
    prompt:
      "cinematic still . emotional, harmonious, vignette, 4k epic detailed, shot on kodak, 35mm photo, sharp focus, high budget, cinemascope, moody, epic, gorgeous, film grain, grainy",
    negative_prompt:
      "anime, cartoon, graphic, (blur, blurry, bokeh), text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured"
  },
  {
    id: "masterpiece",
    name: "Masterpiece",
    prompt:
      "(masterpiece), (best quality), (ultra-detailed), illustration, disheveled hair, detailed eyes, perfect composition, moist skin, intricate details, earrings",
    negative_prompt:
      "longbody, lowres, bad anatomy, bad hands, missing fingers, pubic hair,extra digit, fewer digits, cropped, worst quality, low quality"
  },
  {
    id: "photograph",
    name: "Photograph",
    prompt:
      "photograph, 50mm . cinematic 4k epic detailed 4k epic detailed photograph shot on kodak detailed cinematic hbo dark moody, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, stained, highly detailed, found footage",
    negative_prompt:
      "Brad Pitt, bokeh, depth of field, blurry, cropped, regular face, saturated, contrast, deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime, text, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck"
  },
  {
    id: "cinematic",
    name: "Cinematic",
    prompt:
      "cinematic still . emotional, harmonious, vignette, highly detailed, high budget, bokeh, cinemascope, moody, epic, gorgeous, film grain, grainy",
    negative_prompt:
      "anime, cartoon, graphic, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured"
  },
  {
    id: "pony",
    name: "Pony",
    prompt: "score_9, score_8_up, score_7_up",
    negative_prompt: "score_6, score_5, score_4"
  }
];

const normalizePrompt = (value: string) => value.replace(/\{prompt\}/gi, "").trim();

export const presetStyles = styles.map((style) => ({
  ...style,
  prompt: normalizePrompt(style.prompt),
  negative_prompt: style.negative_prompt.trim()
}));

export const presetStylesById = presetStyles.reduce<Record<string, PresetStyle>>((acc, style) => {
  acc[style.id] = style;
  return acc;
}, {});
