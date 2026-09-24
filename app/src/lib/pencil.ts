// Colored-pencil renderer: one shared WebGL2 context draws every boil frame of a
// photo into a vertical sprite on the caller's 2D canvas.

export const PENCIL_FRAMES = 3
const PAPER_RGB: readonly [number, number, number] = [0.973, 0.937, 0.882]
const MAX_RENDER_SCALE = 1.5

const TONE = {
  uWhiteBalance: 0.35,
  uExposure: 0.3,
  uShadowLift: 0.3,
  uShoulder: 1.7,
  uDetail: 0.8,
  uVibrance: 1.02,
  uCastLow: 0.6,
}

const STYLE = {
  uStroke: [5, 0.8],
  uSoft: 0.8,
  uTooth: 0.25,
  uLine: 0.9,
  uPressure: 0.25,
  uGamma: 0.8,
  uSaturation: 0.84,
  uDensity: 0.3,
  uBurnish: 1,
  uSpecks: 0.9,
  uCoolShadow: 0.45,
  uWarmth: 0.9,
  uEdgeKeep: 0.3,
  uEdgeLow: 0.002,
  uWobble: 1.2,
}

export type PencilRequest = {
  // 'pencil' draws a photo in colored pencil; 'boil' only animates an already drawn image.
  mode: 'pencil' | 'boil'
  source: HTMLImageElement | HTMLVideoElement
  sourceWidth: number
  sourceHeight: number
  width: number
  height: number
  frames: number
  seed: number
  canvas: HTMLCanvasElement
  signal: AbortSignal
}

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const SMOOTH = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uSource;
uniform vec2 uCropOffset;
uniform vec2 uCropScale;
uniform vec2 uTexel;
uniform int uRadius;
uniform float uGlobalLevel;
uniform float uLocalLevel;
uniform float uWhiteBalance;
uniform float uExposure;
uniform float uShadowLift;
uniform float uShoulder;
uniform float uDetail;
uniform float uVibrance;
uniform float uCastLow;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

// Re-exposes dark or color-cast photos the way an illustrator would: neutral-ish light,
// readable shadows, soft highlights.
vec3 tone(vec3 c) {
  vec3 avg = textureLod(uSource, vec2(0.5), uGlobalLevel).rgb;
  float avgL = max(dot(avg, LUMA), 0.02);
  float tint = (max(avg.r, max(avg.g, avg.b)) - min(avg.r, min(avg.g, avg.b))) / avgL;
  vec3 gain = clamp(mix(vec3(1.0), avgL / max(avg, vec3(0.02)), uWhiteBalance * smoothstep(uCastLow, uCastLow + 0.6, tint)), 0.5, 2.6);
  float exposure = clamp(pow(0.46 / avgL, uExposure), 0.85, 2.6);
  vec3 local = textureLod(uSource, uCropOffset + clamp(vUv, 0.0, 1.0) * uCropScale, uLocalLevel).rgb * gain * exposure;
  float lift = clamp(pow(0.5 / max(dot(local, LUMA), 0.02), uShadowLift), 0.8, 2.2);
  vec3 o = max(c * gain * exposure * lift, 0.0);
  vec3 base = local * lift;
  o = max(base + (o - base) * uDetail, 0.0);
  float oL = dot(o, LUMA);
  o = max(mix(vec3(oL), o, uVibrance), 0.0);
  return clamp((1.0 - exp(-uShoulder * o)) / (1.0 - exp(-uShoulder)), 0.0, 1.0);
}

vec3 src(vec2 uv) {
  return texture(uSource, uCropOffset + clamp(uv, 0.0, 1.0) * uCropScale).rgb;
}

void main() {
  vec3 m[4];
  vec3 s[4];
  for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
  for (int j = -uRadius; j <= uRadius; j++) {
    for (int i = -uRadius; i <= uRadius; i++) {
      vec3 c = src(vUv + vec2(float(i), float(j)) * uTexel);
      vec3 c2 = c * c;
      if (i <= 0 && j <= 0) { m[0] += c; s[0] += c2; }
      if (i >= 0 && j <= 0) { m[1] += c; s[1] += c2; }
      if (i <= 0 && j >= 0) { m[2] += c; s[2] += c2; }
      if (i >= 0 && j >= 0) { m[3] += c; s[3] += c2; }
    }
  }
  float n = float((uRadius + 1) * (uRadius + 1));
  float best = 1e9;
  vec3 color = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    vec3 mean = m[k] / n;
    vec3 variance = abs(s[k] / n - mean * mean);
    float v = variance.r + variance.g + variance.b;
    if (v < best) { best = v; color = mean; }
  }
  color = tone(color);
  o = vec4(color, dot(color, LUMA));
}`

const TENSOR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uColor;
uniform vec2 uTexel;

vec3 c(float x, float y) { return texture(uColor, vUv + vec2(x, y) * uTexel).rgb; }

void main() {
  vec3 gx = (-c(-1.0, -1.0) - 2.0 * c(-1.0, 0.0) - c(-1.0, 1.0) + c(1.0, -1.0) + 2.0 * c(1.0, 0.0) + c(1.0, 1.0)) / 4.0;
  vec3 gy = (-c(-1.0, -1.0) - 2.0 * c(0.0, -1.0) - c(1.0, -1.0) + c(-1.0, 1.0) + 2.0 * c(0.0, 1.0) + c(1.0, 1.0)) / 4.0;
  o = vec4(dot(gx, gx), dot(gx, gy), dot(gy, gy), 1.0);
}`

// uMode 0 blurs all channels, 1 seeds two luminance blurs (sigma, sigma * k) from alpha,
// 2 continues those two blurs from red and green.
const BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uInput;
uniform vec2 uStep;
uniform float uSigma;
uniform float uSigma2;
uniform int uMode;

void main() {
  int radius = int(ceil(uSigma2 * 2.5));
  vec4 acc = vec4(0.0);
  vec2 wsum = vec2(0.0);
  for (int i = -40; i <= 40; i++) {
    if (i < -radius || i > radius) continue;
    float x = float(i);
    vec4 t = texture(uInput, vUv + uStep * x);
    float w1 = exp(-x * x / (2.0 * uSigma * uSigma));
    float w2 = exp(-x * x / (2.0 * uSigma2 * uSigma2));
    if (uMode == 0) {
      acc += t * w1;
      wsum += vec2(w1);
    } else {
      float a = uMode == 1 ? t.a : t.r;
      float b = uMode == 1 ? t.a : t.g;
      acc.rg += vec2(a * w1, b * w2);
      wsum += vec2(w1, w2);
    }
  }
  o = uMode == 0 ? acc / wsum.x : vec4(acc.rg / wsum, 0.0, 1.0);
}`

// Hand-drawn "boil" for an already drawn image: small per-frame line displacement and a
// torn paper edge, no restyling.
const BOIL = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uSource;
uniform vec2 uCropOffset;
uniform vec2 uCropScale;
uniform vec2 uSize;
uniform float uScale;
uniform float uSeed;
uniform float uStatic;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 p = gl_FragCoord.xy / uScale;
  vec2 cssSize = uSize / uScale;
  float boil = uSeed * (1.0 - uStatic);
  vec2 wob = vec2(vnoise(p / 26.0 + boil * 7.1), vnoise(p / 26.0 + 41.0 + boil * 3.7)) - 0.5;
  vec2 uv = clamp(vUv + wob * 2.2 * uScale / uSize, 0.0, 1.0);
  vec3 c = texture(uSource, uCropOffset + uv * uCropScale).rgb;

  vec2 edge = min(p, cssSize - p);
  float rough = 1.5 + vnoise(p / 5.0 + boil) * 2.5;
  float edgeMask = smoothstep(rough - 1.5, rough + 1.0, min(edge.x, edge.y));
  o = vec4(c * edgeMask, edgeMask);
}`

const FINAL = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uColor;
uniform sampler2D uTensor;
uniform sampler2D uDog;
uniform vec2 uSize;
uniform float uScale;
uniform float uSeed;
uniform float uStatic;
uniform vec3 uPaper;
uniform vec2 uStroke;
uniform float uSoft;
uniform float uTooth;
uniform float uLine;
uniform float uPressure;
uniform float uSaturation;
uniform float uGamma;
uniform float uDensity;
uniform float uBurnish;
uniform float uSpecks;
uniform float uCoolShadow;
uniform float uWarmth;
uniform float uEdgeKeep;
uniform float uEdgeLow;
uniform float uWobble;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Line integral of noise along dir: short parallel streaks, the look of pencil hatching.
float hatch(vec2 p, vec2 dir, float seed, float len, float width) {
  const int N = 12;
  float s = 0.0;
  vec2 q0 = p + vec2(seed * 37.1, seed * 91.7);
  for (int i = 0; i < N; i++) {
    float t = (float(i) / float(N - 1) - 0.5) * len;
    s += vnoise((q0 + dir * t) / width);
  }
  s /= float(N);
  return clamp((s - 0.5) * 4.2 + 0.5, 0.0, 1.0);
}

vec2 rot(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

void main() {
  vec2 p = gl_FragCoord.xy / uScale;
  vec2 cssSize = uSize / uScale;
  vec2 toUv = uScale / uSize;
  float boil = uSeed * (1.0 - uStatic);

  vec2 wob = vec2(vnoise(p / 30.0 + boil * 7.1), vnoise(p / 30.0 + 41.0 + boil * 3.7)) - 0.5;
  vec2 uv = vUv + wob * uWobble * toUv;

  vec3 tensor = texture(uTensor, uv).xyz;
  float E = tensor.x;
  float F = tensor.y;
  float G = tensor.z;
  float tr = E + G;
  float disc = sqrt((E - G) * (E - G) + 4.0 * F * F);
  float coherence = tr > 1e-6 ? disc / tr : 0.0;
  float tangent = 0.5 * atan(2.0 * F, E - G) + 1.5707963;
  float base = 0.72 + (vnoise(p / 110.0 + 3.0) - 0.5) * 1.1;
  float follow = coherence * smoothstep(0.0004, 0.012, tr) * 0.85;
  vec2 a2 = mix(vec2(cos(2.0 * base), sin(2.0 * base)), vec2(cos(2.0 * tangent), sin(2.0 * tangent)), follow);
  float angle = 0.5 * atan(a2.y, a2.x);
  vec2 dir = vec2(cos(angle), sin(angle));

  vec3 c = texture(uColor, uv).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(lum), c, uSaturation);
  c = mix(c, c * vec3(0.78, 0.84, 1.18), pow(1.0 - lum, 2.0) * uCoolShadow);
  c *= mix(vec3(1.0), vec3(1.07, 1.0, 0.84), uWarmth * (1.0 - smoothstep(0.6, 0.95, lum)));
  c = pow(clamp(c, 0.0, 1.0), vec3(uGamma));
  c = mix(c, uPaper, 0.1);

  vec3 d = (uPaper - c) / uPaper;
  float a = clamp(max(d.r, max(d.g, d.b)), 0.0, 1.0);
  float density = pow(a, uDensity);
  vec3 pigment = density > 0.002 ? clamp(uPaper - (uPaper - c) / density, 0.0, 1.0) : uPaper;

  float h1 = hatch(p, dir, 1.0 + boil * 13.7, uStroke.x, uStroke.y);
  float h2 = hatch(p, rot(dir, 0.95), 7.0 + boil * 5.3, uStroke.x * 0.85, uStroke.y);
  float h3 = hatch(p, rot(dir, -0.3), 13.0 + boil * 3.1, uStroke.x * 1.3, uStroke.y * 1.2);
  float strokes = mix(h1, max(h1, h2), smoothstep(0.35, 0.9, density));

  // Light tones leave paper between strokes; mid and dark tones are burnished nearly solid.
  float soft = uSoft;
  float sparse = smoothstep(1.0 - density - soft, 1.0 - density + soft, strokes + (density - 0.5) * 0.25);
  float coverage = mix(sparse, 1.0, smoothstep(0.25, 0.7, density) * uBurnish);

  // Paper tooth: small specks where the pencil skips over the grain, fewer in heavy pigment.
  float tooth = vnoise(p * 1.1 + 11.0) * 0.6 + vnoise(p * 0.4 + 5.0) * 0.4;
  coverage *= mix(1.0, smoothstep(uTooth - 0.08, uTooth + 0.08, tooth), uSpecks * (1.0 - density * 0.6));

  // Texture in covered areas comes from pressure and from a second, shifted pigment layer.
  // Features (eyes, outlines, lettering) are drawn carefully; loose texture stays in open areas.
  float feature = smoothstep(uEdgeLow, uEdgeLow * 6.0, tr);
  coverage = mix(coverage, 1.0, feature * uEdgeKeep);
  float pressure = 1.0 + (0.5 - strokes) * uPressure * (1.0 - feature * uEdgeKeep);
  vec3 layer = pigment * mix(vec3(1.0), vec3(0.85, 0.9, 1.12), (1.0 - lum) * 0.6);
  layer = mix(layer, pigment * vec3(1.08, 1.02, 0.9), smoothstep(0.55, 0.9, lum));
  vec3 color = mix(pigment, layer, smoothstep(0.35, 0.75, h3) * 0.6);
  color = clamp(color * mix(vec3(1.0), uPaper, 0.12) * pressure, 0.0, 1.0);

  vec2 lwob = vec2(vnoise(p / 22.0 + 90.0 + boil * 5.1), vnoise(p / 22.0 + 17.0 + boil * 8.3)) - 0.5;
  vec2 g = texture(uDog, vUv + lwob * 2.0 * toUv).rg;
  float dog = g.r - 0.982 * g.g;
  float line = dog < -0.003 ? clamp(tanh(-(dog + 0.003) * 55.0), 0.0, 1.0) : 0.0;
  float lineGrain = hatch(p, dir, 31.0 + boil * 4.1, 7.0, 1.1);
  line *= smoothstep(0.2, 0.62, lineGrain * 0.7 + tooth * 0.5);
  vec3 lineColor = clamp(pigment * 0.42 + vec3(0.03, 0.03, 0.08), 0.0, 1.0);
  float lineAlpha = line * uLine;
  vec3 premul = lineColor * lineAlpha + color * coverage * (1.0 - lineAlpha);
  float alpha = lineAlpha + coverage * (1.0 - lineAlpha);

  vec2 edge = min(p, cssSize - p);
  float edgeDist = min(edge.x, edge.y);
  float rough = 1.5 + vnoise(p / 5.0 + boil) * 2.5;
  float edgeMask = smoothstep(rough - 1.5, rough + 1.0, edgeDist);

  o = vec4(premul * edgeMask, alpha * edgeMask);
}`

type Program = {
  program: WebGLProgram
  uniforms: Map<string, WebGLUniformLocation>
}

type Target = {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
}

class PencilRenderer {
  readonly canvas: OffscreenCanvas | HTMLCanvasElement
  readonly gl: WebGL2RenderingContext
  readonly smooth: Program
  readonly tensor: Program
  readonly blur: Program
  readonly final: Program
  readonly boil: Program
  readonly vao: WebGLVertexArrayObject
  readonly sourceTexture: WebGLTexture
  targets: Target[] = []
  targetSize = [0, 0]

  constructor(canvas: OffscreenCanvas | HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas
    this.gl = gl
    this.smooth = createProgram(gl, SMOOTH)
    this.tensor = createProgram(gl, TENSOR)
    this.blur = createProgram(gl, BLUR)
    this.final = createProgram(gl, FINAL)
    this.boil = createProgram(gl, BOIL)
    this.vao = gl.createVertexArray()
    this.sourceTexture = gl.createTexture()
  }

  render(request: PencilRequest) {
    const { gl } = this
    const scale = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE)
    const width = Math.max(1, Math.round(request.width * scale))
    const height = Math.max(1, Math.round(request.height * scale))
    this.ensureTargets(width, height)
    gl.bindVertexArray(this.vao)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, request.source)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const crop = getCoverCrop(request.sourceWidth, request.sourceHeight, width, height)
    this.canvas.width = width
    this.canvas.height = height
    const output = request.canvas
    output.width = width
    output.height = height * request.frames
    const context = output.getContext('2d')
    if (!context) {
      return
    }

    if (request.mode === 'boil') {
      for (let frame = 0; frame < request.frames; frame++) {
        this.pass(this.boil, null, [this.sourceTexture], {
          uCropOffset: crop.offset,
          uCropScale: crop.scale,
          uSize: [width, height],
          uScale: scale,
          uSeed: request.seed + frame * 1.618,
          uStatic: request.frames > 1 ? 0 : 1,
        }, { uSource: 0 })
        context.drawImage(this.canvas, 0, frame * height)
      }
      return
    }

    const texel = [1 / width, 1 / height]
    const [color, tensorA, tensorB, dogA, dogB] = this.targets

    this.pass(this.smooth, color, [this.sourceTexture], {
      uCropOffset: crop.offset,
      uCropScale: crop.scale,
      uTexel: texel,
      uGlobalLevel: Math.floor(Math.log2(Math.max(request.sourceWidth, request.sourceHeight, 1))),
      uLocalLevel: Math.max(0, Math.floor(Math.log2(Math.max(request.sourceWidth, request.sourceHeight, 1))) - 4),
      ...TONE,
    }, { uRadius: 1 })
    this.pass(this.tensor, tensorA, [color.texture], { uTexel: texel })
    const tensorSigma = 2.6 * scale
    this.pass(this.blur, tensorB, [tensorA.texture], { uStep: [texel[0], 0], uSigma: tensorSigma, uSigma2: tensorSigma }, { uMode: 0 })
    this.pass(this.blur, tensorA, [tensorB.texture], { uStep: [0, texel[1]], uSigma: tensorSigma, uSigma2: tensorSigma }, { uMode: 0 })
    const dogSigma = 0.9 * scale
    this.pass(this.blur, dogA, [color.texture], { uStep: [texel[0], 0], uSigma: dogSigma, uSigma2: dogSigma * 1.6 }, { uMode: 1 })
    this.pass(this.blur, dogB, [dogA.texture], { uStep: [0, texel[1]], uSigma: dogSigma, uSigma2: dogSigma * 1.6 }, { uMode: 2 })

    for (let frame = 0; frame < request.frames; frame++) {
      this.pass(this.final, null, [color.texture, tensorA.texture, dogB.texture], {
        uSize: [width, height],
        uScale: scale,
        uSeed: request.seed + frame * 1.618,
        uStatic: request.frames > 1 ? 0 : 1,
        uPaper: [...PAPER_RGB],
        ...STYLE,
      }, { uColor: 0, uTensor: 1, uDog: 2 })
      context.drawImage(this.canvas, 0, frame * height)
    }
  }

  ensureTargets(width: number, height: number) {
    if (this.targetSize[0] === width && this.targetSize[1] === height) {
      return
    }
    const { gl } = this
    for (const target of this.targets) {
      gl.deleteTexture(target.texture)
      gl.deleteFramebuffer(target.framebuffer)
    }
    this.targets = [gl.RGBA8, gl.RGBA16F, gl.RGBA16F, gl.RGBA16F, gl.RGBA16F].map((format) =>
      createTarget(gl, width, height, format),
    )
    this.targetSize = [width, height]
  }

  pass(
    program: Program,
    target: Target | null,
    textures: WebGLTexture[],
    uniforms: Record<string, number | number[]>,
    ints: Record<string, number> = {},
  ) {
    const { gl } = this
    gl.useProgram(program.program)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null)
    const [width, height] = this.targetSize
    gl.viewport(0, 0, width, height)
    textures.forEach((texture, index) => {
      gl.activeTexture(gl.TEXTURE0 + index)
      gl.bindTexture(gl.TEXTURE_2D, texture)
    })
    for (const [name, value] of Object.entries(uniforms)) {
      const location = program.uniforms.get(name)
      if (!location) {
        continue
      }
      if (typeof value === 'number') {
        gl.uniform1f(location, value)
      } else if (value.length === 2) {
        gl.uniform2fv(location, value)
      } else {
        gl.uniform3fv(location, value)
      }
    }
    for (const [name, value] of Object.entries(ints)) {
      const location = program.uniforms.get(name)
      if (location) {
        gl.uniform1i(location, value)
      }
    }
    if (target === null) {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

function createProgram(gl: WebGL2RenderingContext, fragment: string): Program {
  const program = gl.createProgram()
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type)
    if (!shader) {
      throw new Error('shader allocation failed')
    }
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed')
    }
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'program link failed')
  }

  const uniforms = new Map<string, WebGLUniformLocation>()
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
  for (let index = 0; index < count; index++) {
    const info = gl.getActiveUniform(program, index)
    const location = info ? gl.getUniformLocation(program, info.name) : null
    if (info && location) {
      uniforms.set(info.name, location)
    }
  }
  return { program, uniforms }
}

function createTarget(gl: WebGL2RenderingContext, width: number, height: number, format: number): Target {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const framebuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  return { texture, framebuffer }
}

function getCoverCrop(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const sourceAspect = sourceWidth / sourceHeight
  const targetAspect = width / height
  if (sourceAspect > targetAspect) {
    const scale = targetAspect / sourceAspect
    return { offset: [(1 - scale) / 2, 0], scale: [scale, 1] }
  }
  const scale = sourceAspect / targetAspect
  return { offset: [0, (1 - scale) / 2], scale: [1, scale] }
}

let renderer: PencilRenderer | null | undefined
let queue = Promise.resolve()

function getRenderer() {
  if (renderer !== undefined) {
    return renderer
  }
  try {
    const canvas = typeof OffscreenCanvas === 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1)
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false }) as WebGL2RenderingContext | null
    renderer = gl && gl.getExtension('EXT_color_buffer_float') ? new PencilRenderer(canvas, gl) : null
    canvas.addEventListener('webglcontextlost', () => {
      renderer = undefined
    })
  } catch {
    renderer = null
  }
  return renderer
}

// Renders are serialized so one texture set serves every card.
export function renderPencil(request: PencilRequest): Promise<void> {
  const run = queue.then(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    if (request.signal.aborted) {
      return
    }
    const current = getRenderer()
    if (!current) {
      throw new Error('WebGL2 colored-pencil renderer unavailable')
    }
    current.render(request)
  })
  queue = run.catch(() => undefined)
  return run
}
