// GLSL ES 3.0 shaders for the CarrotCam render pipeline.
// Convention: every offscreen texture stores the image top row at v = 0, so in
// offscreen passes `vUv` is an image coordinate with y pointing down. Only the
// display pass flips for the canvas.

export const VS = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`

/** Pass 1: framing (crop/zoom/rotate/mirror) + face reshaping, source -> output. */
export const FS_FRAME = HEADER + /* glsl */ `
uniform sampler2D uSrc;
uniform mat3 uM;          // output uv -> source uv
uniform float uAspect;    // output width / height
uniform vec4 uEyes;       // left eye xy, right eye xy (output uv)
uniform float uEyeR;      // eye radius (height units)
uniform float uEnlarge;   // 0..1
uniform vec4 uJaw;        // left jaw xy, right jaw xy (output uv)
uniform vec2 uFaceC;      // face center (output uv)
uniform float uJawR;      // jaw influence radius (height units)
uniform float uSlim;      // 0..1

vec2 bulge(vec2 p, vec2 c, float r, float s) {
  vec2 d = p - c;
  float t = clamp(length(d) / r, 0.0, 1.0);
  return c + d * (1.0 - s * (1.0 - t * t));
}

vec2 pinch(vec2 p, vec2 a, vec2 c, float r, float s) {
  vec2 d = p - a;
  float t = clamp(1.0 - length(d) / r, 0.0, 1.0);
  vec2 dir = normalize(a - c + 1e-5);
  return p + dir * s * r * t * t;
}

void main() {
  vec2 uv = vUv;
  if (uEnlarge > 0.0 || uSlim > 0.0) {
    vec2 k = vec2(uAspect, 1.0);
    vec2 p = uv * k;
    if (uEnlarge > 0.0) {
      p = bulge(p, uEyes.xy * k, uEyeR, uEnlarge * 0.28);
      p = bulge(p, uEyes.zw * k, uEyeR, uEnlarge * 0.28);
    }
    if (uSlim > 0.0) {
      p = pinch(p, uJaw.xy * k, uFaceC * k, uJawR, uSlim * 0.16);
      p = pinch(p, uJaw.zw * k, uFaceC * k, uJawR, uSlim * 0.16);
    }
    uv = p / k;
  }
  vec2 src = (uM * vec3(uv, 1.0)).xy;
  vec3 c = texture(uSrc, src).rgb;
  float inside = step(0.0, src.x) * step(src.x, 1.0) * step(0.0, src.y) * step(src.y, 1.0);
  outColor = vec4(c * inside, 1.0);
}`

/** Temporal denoise for low light: blends static areas with the previous frame. */
export const FS_DENOISE = HEADER + /* glsl */ `
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform float uStrength;
void main() {
  vec3 cur = texture(uCur, vUv).rgb;
  vec3 prev = texture(uPrev, vUv).rgb;
  float diff = length(cur - prev);
  float k = uStrength * (1.0 - smoothstep(0.025, 0.11, diff));
  outColor = vec4(mix(cur, prev, k * 0.82), 1.0);
}`

/** Segmentation mask: source space -> output space, feathered + temporally smoothed. */
export const FS_MASK = HEADER + /* glsl */ `
uniform sampler2D uRaw;
uniform sampler2D uPrev;
uniform mat3 uM;
uniform vec2 uEdge;
uniform float uLerp;
uniform float uHasPrev;
void main() {
  vec2 src = (uM * vec3(vUv, 1.0)).xy;
  float m = texture(uRaw, clamp(src, 0.0, 1.0)).r;
  m = smoothstep(uEdge.x, uEdge.y, m);
  float prev = texture(uPrev, vUv).r;
  float v = uHasPrev > 0.5 ? mix(prev, m, uLerp) : m;
  outColor = vec4(v, v, v, 1.0);
}`

/** Dual-Kawase downsample. First level weights by background (1 - mask). */
export const FS_DOWN = HEADER + /* glsl */ `
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform vec2 uTexel;   // 1 / source size
uniform float uOffset;
uniform float uFirst;      // 1 on the first level
uniform float uUseMask;
vec4 tap(vec2 uv) {
  if (uFirst > 0.5) {
    vec3 c = texture(uTex, uv).rgb;
    float w = uUseMask > 0.5 ? 1.0 - texture(uMask, uv).r : 1.0;
    w = w * w;
    return vec4(c * w, w);
  }
  return texture(uTex, uv);
}
void main() {
  vec2 o = uTexel * uOffset;
  vec4 s = tap(vUv) * 4.0;
  s += tap(vUv - o);
  s += tap(vUv + o);
  s += tap(vUv + vec2(o.x, -o.y));
  s += tap(vUv - vec2(o.x, -o.y));
  outColor = s / 8.0;
}`

export const FS_UP = HEADER + /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uOffset;
void main() {
  vec2 o = uTexel * uOffset;
  vec4 s = texture(uTex, vUv + vec2(-o.x * 2.0, 0.0));
  s += texture(uTex, vUv + vec2(-o.x, o.y)) * 2.0;
  s += texture(uTex, vUv + vec2(0.0, o.y * 2.0));
  s += texture(uTex, vUv + vec2(o.x, o.y)) * 2.0;
  s += texture(uTex, vUv + vec2(o.x * 2.0, 0.0));
  s += texture(uTex, vUv + vec2(o.x, -o.y)) * 2.0;
  s += texture(uTex, vUv + vec2(0.0, -o.y * 2.0));
  s += texture(uTex, vUv + vec2(-o.x, -o.y)) * 2.0;
  outColor = s / 12.0;
}`

/** Main look pass: retouch, background, lighting, color grading. */
export const FS_COMPOSITE = HEADER + /* glsl */ `
uniform sampler2D uBase;
uniform sampler2D uMask;
uniform sampler2D uBlur;
uniform sampler2D uBgImg;
uniform mediump sampler3D uLut;
uniform vec2 uRes;
uniform float uAspect;
uniform float uTime;

uniform float uHasMask;
uniform int uBgMode;        // 0 none 1 blur 2 image 3 color 4 studio 5 desaturate 6 privacy blur
uniform vec3 uBgColor;
uniform vec2 uBgImgScale;   // cover fit
uniform float uBgImgReady;

// face (output uv)
uniform float uHasFace;
uniform vec2 uFaceC;
uniform vec3 uFaceEllipse;  // half width, half height (height units), angle
uniform vec4 uEyes;
uniform float uEyeR;
uniform vec2 uMouth;
uniform vec2 uMouthR;       // half width/height (height units)

// retouch
uniform float uSmooth;
uniform float uEyeBright;
uniform float uTeeth;
uniform float uFaceLight;
uniform float uSharp;

// lighting
uniform float uSpotOn;
uniform vec2 uSpotC;
uniform float uSpotI;
uniform float uSpotSize;
uniform float uSpotSoft;
uniform vec3 uSpotTint;
uniform float uStudio;
uniform float uKey;
uniform vec2 uKeyDir;

// color
uniform vec3 uAutoGain;
uniform float uLowLight;
uniform float uExposure;
uniform vec3 uWB;
uniform float uBrightness;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uHue;
uniform float uSaturation;
uniform float uVibrance;
uniform float uFade;
uniform float uVignette;
uniform float uGrain;

// look
uniform float uLookMix;
uniform float uLExposure;
uniform vec3 uLWB;
uniform vec3 uLLift;
uniform vec3 uLGamma;
uniform vec3 uLGain;
uniform float uLSat;
uniform float uLContrast;
uniform vec3 uLShadows;
uniform vec3 uLHighlights;
uniform vec3 uLBw;
uniform float uLBwOn;
uniform float uLFade;

uniform float uLutOn;
uniform float uLutMix;
uniform float uLutSize;

vec3 hueRotate(vec3 c, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * c;
  float cs = cos(a), sn = sin(a);
  yiq.yz = vec2(yiq.y * cs - yiq.z * sn, yiq.y * sn + yiq.z * cs);
  return toRGB * yiq;
}

vec3 sCurve(vec3 c, float amount) {
  if (amount >= 0.0) return mix(c, c * c * (3.0 - 2.0 * c), amount);
  return mix(c, vec3(0.5), -amount * 0.5);
}

vec3 applyLook(vec3 c) {
  c *= exp2(uLExposure);
  c *= uLWB;
  c = c * uLGain + uLLift * (1.0 - c);
  c = pow(max(c, 0.0), 1.0 / uLGamma);
  float l = luma(c);
  c = mix(vec3(l), c, uLSat);
  c = sCurve(clamp(c, 0.0, 1.0), uLContrast);
  l = luma(c);
  c += uLShadows * (1.0 - smoothstep(0.0, 0.55, l)) + uLHighlights * smoothstep(0.45, 1.0, l);
  if (uLBwOn > 0.5) c = vec3(dot(c, uLBw)) + uLShadows * (1.0 - smoothstep(0.0, 0.55, l)) + uLHighlights * smoothstep(0.45, 1.0, l);
  c = mix(c, vec3(0.08, 0.075, 0.09) + c * 0.84, uLFade);
  return c;
}

float ellipseMask(vec2 uv, vec2 c, vec3 e, float soft) {
  vec2 p = (uv - c) * vec2(uAspect, 1.0);
  float cs = cos(e.z), sn = sin(e.z);
  p = vec2(p.x * cs + p.y * sn, -p.x * sn + p.y * cs);
  float d = length(p / max(e.xy, vec2(1e-4)));
  return 1.0 - smoothstep(1.0 - soft, 1.0 + soft, d);
}

float skinLikelihood(vec3 c) {
  float y = luma(c);
  float cb = (c.b - y) * 0.564 + 0.5;
  float cr = (c.r - y) * 0.713 + 0.5;
  float a = smoothstep(0.035, 0.0, abs(cb - 0.44) - 0.06);
  float b = smoothstep(0.04, 0.0, abs(cr - 0.6) - 0.07);
  return a * b * smoothstep(0.06, 0.18, y);
}

void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / uRes;
  vec3 base = texture(uBase, uv).rgb;
  vec3 c = base;

  // ---- detail: skin smoothing (edge-aware) and sharpening
  float scale = uRes.y / 720.0;
  if (uSmooth > 0.0 && uHasFace > 0.5) {
    float region = ellipseMask(uv, uFaceC, uFaceEllipse * vec3(1.15, 1.2, 1.0), 0.25);
    region *= skinLikelihood(base);
    if (region > 0.001) {
      vec3 acc = base;
      float wsum = 1.0;
      for (int ring = 1; ring <= 2; ring++) {
        float r = (ring == 1 ? 2.5 : 6.0) * scale;
        for (int i = 0; i < 8; i++) {
          float a = 6.2831853 * (float(i) + (ring == 1 ? 0.0 : 0.5)) / 8.0;
          vec3 s = texture(uBase, uv + vec2(cos(a), sin(a)) * r * px).rgb;
          vec3 d = s - base;
          float w = exp(-dot(d, d) / 0.012);
          acc += s * w;
          wsum += w;
        }
      }
      vec3 smoothC = acc / wsum;
      c = mix(c, smoothC, uSmooth * region * 0.9);
    }
  }
  if (uSharp > 0.0) {
    vec3 n = texture(uBase, uv + vec2(px.x, 0.0)).rgb + texture(uBase, uv - vec2(px.x, 0.0)).rgb +
             texture(uBase, uv + vec2(0.0, px.y)).rgb + texture(uBase, uv - vec2(0.0, px.y)).rgb;
    vec3 detail = base - n * 0.25;
    c += detail * uSharp * 1.6;
  }

  // ---- background
  float m = uHasMask > 0.5 ? texture(uMask, uv).r : 1.0;
  if (uBgMode == 6) m = 0.0;
  if (uBgMode > 0) {
    vec3 bg = c;
    if (uBgMode == 1 || uBgMode == 6) {
      vec4 b = texture(uBlur, uv);
      bg = b.a > 0.003 ? b.rgb / b.a : c;
    } else if (uBgMode == 2) {
      vec2 buv = (uv - 0.5) * uBgImgScale + 0.5;
      bg = uBgImgReady > 0.5 ? texture(uBgImg, buv).rgb : uBgColor;
    } else if (uBgMode == 3) {
      bg = uBgColor;
    } else if (uBgMode == 4) {
      float d = length((uv - vec2(0.5, 0.38)) * vec2(uAspect * 0.6, 1.0));
      bg = mix(uBgColor * 1.35 + 0.04, uBgColor * 0.45, smoothstep(0.0, 0.9, d));
    } else if (uBgMode == 5) {
      bg = vec3(luma(c)) * 0.9;
    }
    c = mix(bg, c, m);
  }

  // ---- retouch: eyes, teeth, face fill light
  if (uHasFace > 0.5) {
    vec2 k = vec2(uAspect, 1.0);
    if (uEyeBright > 0.0) {
      float e1 = 1.0 - smoothstep(uEyeR * 0.35, uEyeR * 1.1, length((uv - uEyes.xy) * k));
      float e2 = 1.0 - smoothstep(uEyeR * 0.35, uEyeR * 1.1, length((uv - uEyes.zw) * k));
      float e = max(e1, e2) * uEyeBright;
      vec3 bright = c * 1.22 + 0.025;
      c = mix(c, mix(vec3(luma(bright)), bright, 1.12), e * 0.75);
    }
    if (uTeeth > 0.0) {
      vec2 d = (uv - uMouth) * k / max(uMouthR, vec2(1e-4));
      float region = 1.0 - smoothstep(0.7, 1.0, length(d));
      float l = luma(c);
      float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      float t = region * smoothstep(0.3, 0.55, l) * (1.0 - smoothstep(0.18, 0.45, sat)) * uTeeth;
      vec3 white = vec3(l * 1.1) + vec3(-0.01, 0.0, 0.03);
      c = mix(c, white, t * 0.75);
    }
    if (uFaceLight > 0.0) {
      float f = ellipseMask(uv, uFaceC, uFaceEllipse * vec3(1.3, 1.25, 1.0), 0.45);
      c = c + (1.0 - c) * f * uFaceLight * 0.28;
    }
  }

  // ---- lighting
  if (uStudio > 0.0) {
    c *= mix(1.0 - uStudio * 0.45, 1.0 + uStudio * 0.18, m);
    c = mix(c, sCurve(clamp(c, 0.0, 1.0), 0.25), uStudio * m * 0.6);
  }
  if (uKey > 0.0) {
    vec2 rel = (uv - uFaceC) * vec2(uAspect, 1.0);
    float g = clamp(dot(rel, uKeyDir) / max(uFaceEllipse.y * 1.6, 0.05), -1.0, 1.0);
    c *= 1.0 + uKey * 0.38 * g * m;
  }
  if (uSpotOn > 0.5) {
    float d = length((uv - uSpotC) * vec2(uAspect, 1.0));
    float r = mix(0.18, 0.95, uSpotSize);
    float s = mix(0.04, 0.55, uSpotSoft);
    float spot = 1.0 - smoothstep(r - s, r + s, d);
    c *= mix(1.0 - uSpotI * 0.78, 1.0 + uSpotI * 0.22, spot);
    c *= mix(vec3(1.0), uSpotTint, spot * uSpotI);
  }

  // ---- color
  c *= uAutoGain;
  if (uLowLight > 0.0) c = 1.0 - pow(max(1.0 - clamp(c, 0.0, 1.0), 0.0), vec3(1.0 + uLowLight * 1.6));
  c *= exp2(uExposure);
  c *= uWB;
  c = pow(max(c, 0.0), vec3(exp2(-uBrightness * 0.9)));
  c = sCurve(clamp(c, 0.0, 1.0), uContrast);
  float l = luma(c);
  c += uShadows * 0.32 * (1.0 - smoothstep(0.0, 0.5, l)) * (0.6 + c * 0.4);
  c += uHighlights * 0.28 * smoothstep(0.45, 1.0, l);
  if (uHue != 0.0) c = hueRotate(c, uHue);
  l = luma(c);
  c = mix(vec3(l), c, 1.0 + uSaturation);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(luma(c)), c, 1.0 + uVibrance * (1.0 - sat) * 1.2);
  c = clamp(c, 0.0, 1.0);

  if (uLookMix > 0.0) c = mix(c, clamp(applyLook(c), 0.0, 1.0), uLookMix);
  if (uLutOn > 0.5) {
    vec3 lc = c * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize;
    c = mix(c, texture(uLut, lc).rgb, uLutMix);
  }
  if (uFade > 0.0) c = mix(c, vec3(0.09, 0.085, 0.1) + c * 0.82, uFade);
  if (uVignette > 0.0) {
    float v = smoothstep(0.95, 0.25, length((uv - 0.5) * vec2(1.0, 0.9) * 1.25));
    c *= mix(1.0, v, uVignette);
  }
  if (uGrain > 0.0) {
    float n = hash12(uv * uRes + fract(uTime * 13.37) * 311.0) - 0.5;
    c += n * uGrain * 0.14 * (1.0 - luma(c) * 0.5);
  }
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`

/** Stylized effects. */
export const FS_STYLE = HEADER + /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform int uMode;   // see StyleEffect order in engine
uniform float uAmount;

vec3 tex(vec2 uv) { return texture(uTex, clamp(uv, 0.0, 1.0)).rgb; }

float edge(vec2 uv, vec2 px) {
  float tl = luma(tex(uv + px * vec2(-1, -1))), t = luma(tex(uv + px * vec2(0, -1))), tr = luma(tex(uv + px * vec2(1, -1)));
  float l = luma(tex(uv + px * vec2(-1, 0))), r = luma(tex(uv + px * vec2(1, 0)));
  float bl = luma(tex(uv + px * vec2(-1, 1))), b = luma(tex(uv + px * vec2(0, 1))), br = luma(tex(uv + px * vec2(1, 1)));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  return length(vec2(gx, gy));
}

vec3 thermal(float t) {
  vec3 c1 = vec3(0.0, 0.0, 0.25), c2 = vec3(0.45, 0.0, 0.6), c3 = vec3(0.95, 0.15, 0.1), c4 = vec3(1.0, 0.75, 0.0), c5 = vec3(1.0, 1.0, 0.85);
  if (t < 0.25) return mix(c1, c2, t / 0.25);
  if (t < 0.5) return mix(c2, c3, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c3, c4, (t - 0.5) / 0.25);
  return mix(c4, c5, (t - 0.75) / 0.25);
}

void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / uRes;
  vec3 orig = tex(uv);
  vec3 c = orig;
  float a = uAmount;
  float scale = uRes.y / 720.0;

  if (uMode == 1) { // glitch
    float t = floor(uTime * 12.0);
    float burst = step(0.55, hash12(vec2(t, 7.0)));
    float row = floor(uv.y * 24.0);
    float shift = (hash12(vec2(row, t)) - 0.5) * 0.08 * a * burst * step(0.6, hash12(vec2(row * 3.1, t)));
    vec2 g = uv + vec2(shift, 0.0);
    float split = (0.004 + 0.012 * burst) * a;
    c = vec3(tex(g + vec2(split, 0.0)).r, tex(g).g, tex(g - vec2(split, 0.0)).b);
    c += (hash12(uv * uRes + t) - 0.5) * 0.08 * a;
  } else if (uMode == 2) { // vhs
    float wob = sin(uv.y * 40.0 + uTime * 3.0) * 0.0015 * a + (hash12(vec2(floor(uv.y * uRes.y * 0.5), floor(uTime * 30.0))) - 0.5) * 0.002 * a;
    vec2 g = uv + vec2(wob, 0.0);
    float y = luma(tex(g));
    vec3 chroma = (tex(g + vec2(0.006 * a, 0.0)) + tex(g + vec2(0.012 * a, 0.0))) * 0.5;
    c = vec3(y) + (chroma - vec3(luma(chroma))) * 0.9;
    c *= 0.92 + 0.08 * sin(uv.y * uRes.y * 1.5);
    float band = smoothstep(0.0, 0.02, abs(fract(uv.y - uTime * 0.07) - 0.5) - 0.48);
    c += (1.0 - band) * 0.12 * a;
    c = mix(c, c * vec3(1.05, 0.98, 1.08), a);
    c += (hash12(uv * uRes + uTime) - 0.5) * 0.06 * a;
  } else if (uMode == 3) { // pixel
    float size = mix(6.0, 34.0, a) * scale;
    vec2 cell = floor(uv * uRes / size) * size + size * 0.5;
    c = tex(cell / uRes);
    vec2 f = fract(uv * uRes / size);
    c *= 0.9 + 0.1 * step(0.08, f.x) * step(0.08, f.y);
    a = 1.0;
  } else if (uMode == 4) { // comic
    vec3 q = floor(orig * 5.0 + 0.5) / 5.0;
    q = mix(vec3(luma(q)), q, 1.35);
    float e = edge(uv, px * 1.6 * scale);
    float ink = smoothstep(0.25, 0.55, e);
    vec2 dotUv = uv * uRes / (7.0 * scale);
    float d = length(fract(dotUv) - 0.5);
    float tone = 1.0 - luma(orig);
    float halftone = smoothstep(tone * 0.6, tone * 0.6 - 0.08, d) * 0.18;
    c = q * (1.0 - ink) - halftone;
  } else if (uMode == 5) { // sketch
    float e = edge(uv, px * 1.2 * scale);
    float l = luma(orig);
    float pencil = 1.0 - smoothstep(0.08, 0.45, e);
    float hatch = 1.0 - (1.0 - step(0.5, fract((uv.x + uv.y) * uRes.y / (6.0 * scale)))) * (1.0 - smoothstep(0.2, 0.5, l)) * 0.35;
    float paper = 0.96 + (hash12(floor(uv * uRes / 2.0)) - 0.5) * 0.05;
    c = vec3(pencil * hatch * paper) * vec3(1.0, 0.985, 0.95);
  } else if (uMode == 6) { // thermal
    c = thermal(clamp(luma(orig) * 1.1, 0.0, 1.0));
  } else if (uMode == 7) { // night vision
    float l = luma(orig);
    l = pow(clamp(l * 1.8, 0.0, 1.0), 0.8);
    c = vec3(0.1, 1.0, 0.25) * l;
    c += (hash12(uv * uRes + uTime * 60.0) - 0.5) * 0.18;
    c *= 0.85 + 0.15 * sin(uv.y * uRes.y * 2.0);
    c *= smoothstep(0.85, 0.35, length((uv - 0.5) * vec2(1.6, 1.0)));
  } else if (uMode == 8) { // posterize
    float levels = mix(8.0, 3.0, a);
    c = floor(orig * levels + 0.5) / levels;
    a = 1.0;
  } else if (uMode == 9) { // chromatic aberration
    vec2 d = (uv - 0.5) * 0.02 * a;
    c = vec3(tex(uv + d).r, tex(uv).g, tex(uv - d).b);
    a = 1.0;
  } else if (uMode == 10) { // mirror
    vec2 m = vec2(uv.x < 0.5 ? uv.x : 1.0 - uv.x, uv.y);
    c = tex(m);
    a = 1.0;
  } else if (uMode == 11) { // halftone
    float size = mix(5.0, 14.0, a) * scale;
    vec2 g = uv * uRes;
    float ang = 0.785;
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 rp = rot * g;
    vec2 cellCenter = (floor(rp / size) + 0.5) * size;
    vec2 centerUv = (transpose(rot) * cellCenter) / uRes;
    vec3 col = tex(centerUv);
    float r = sqrt(1.0 - luma(col)) * size * 0.62;
    float dotMask = 1.0 - smoothstep(r - 1.0, r + 1.0, length(rp - cellCenter));
    c = mix(vec3(0.98, 0.96, 0.92), col * 0.85, dotMask);
    a = 1.0;
  }
  outColor = vec4(mix(orig, clamp(c, 0.0, 1.0), a), 1.0);
}`

/** Final pass: overlays (name tag, clock, reactions, BRB card) and border. */
export const FS_FINAL = HEADER + /* glsl */ `
uniform sampler2D uTex;
uniform sampler2D uOverlay;
uniform float uHasOverlay;
uniform vec2 uRes;
uniform float uBorderOn;
uniform vec3 uBorderColor;
uniform float uBorderW;
uniform float uBorderR;

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec3 c = texture(uTex, vUv).rgb;
  if (uHasOverlay > 0.5) {
    vec4 o = texture(uOverlay, vUv);
    c = mix(c, o.rgb, o.a);
  }
  if (uBorderOn > 0.5) {
    vec2 p = (vUv - 0.5) * uRes;
    float d = sdRoundRect(p, uRes * 0.5 - uBorderW, uBorderR);
    float inside = 1.0 - smoothstep(-0.75, 0.75, d);
    c = mix(uBorderColor, c, inside);
  }
  outColor = vec4(c, 1.0);
}`

/** Display to the preview canvas (flipped), with before/after compare. */
export const FS_DISPLAY = HEADER + /* glsl */ `
uniform sampler2D uTex;
uniform sampler2D uOrig;
uniform float uCompare;  // < 0 = off, else split position 0..1
uniform vec2 uRes;
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 c = texture(uTex, uv).rgb;
  if (uCompare >= 0.0) {
    if (uv.x < uCompare) c = texture(uOrig, uv).rgb;
    float line = 1.0 - smoothstep(0.0, 1.5 / uRes.x, abs(uv.x - uCompare));
    c = mix(c, vec3(1.0), line * 0.9);
  }
  outColor = vec4(c, 1.0);
}`

/** Packs the final image to tightly packed, top-down BGR24 for the virtual camera. */
export const FS_PACK_BGR = HEADER + /* glsl */ `
uniform sampler2D uTex;
void main() {
  ivec2 o = ivec2(gl_FragCoord.xy);
  vec4 r;
  for (int i = 0; i < 4; i++) {
    int b = o.x * 4 + i;
    int px = b / 3;
    int ch = b - px * 3;
    vec3 col = texelFetch(uTex, ivec2(px, o.y), 0).rgb;
    r[i] = ch == 0 ? col.b : (ch == 1 ? col.g : col.r);
  }
  outColor = r;
}`

/** Tiny downsample used for auto-enhance statistics. */
export const FS_COPY = HEADER + /* glsl */ `
uniform sampler2D uTex;
void main() { outColor = vec4(texture(uTex, vUv).rgb, 1.0); }`

/** Filter thumbnails: applies one look per atlas cell. */
export const FS_THUMBS = HEADER + /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uGrid;
uniform vec3 uWB[24];
uniform vec4 uP[24];     // exposure, saturation, contrast, fade
uniform vec3 uSh[24];
uniform vec3 uHi[24];
uniform vec4 uBw[24];    // weights + on
uniform vec3 uLift[24];
uniform vec3 uGain[24];

vec3 sCurve(vec3 c, float amount) {
  if (amount >= 0.0) return mix(c, c * c * (3.0 - 2.0 * c), amount);
  return mix(c, vec3(0.5), -amount * 0.5);
}

void main() {
  vec2 cell = floor(vUv * uGrid);
  int idx = int(cell.y * uGrid.x + cell.x);
  vec2 uv = fract(vUv * uGrid);
  vec3 c = texture(uTex, uv).rgb;
  vec4 p = uP[idx];
  c *= exp2(p.x);
  c *= uWB[idx];
  c = c * uGain[idx] + uLift[idx] * (1.0 - c);
  float l = luma(c);
  c = mix(vec3(l), c, p.y);
  c = sCurve(clamp(c, 0.0, 1.0), p.z);
  l = luma(c);
  vec3 tone = uSh[idx] * (1.0 - smoothstep(0.0, 0.55, l)) + uHi[idx] * smoothstep(0.45, 1.0, l);
  c = uBw[idx].w > 0.5 ? vec3(dot(c, uBw[idx].xyz)) + tone : c + tone;
  c = mix(c, vec3(0.08, 0.075, 0.09) + c * 0.84, p.w);
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`

/** Scenes: draws one source into the scene (scissored to its box, alpha blended). */
export const FS_LAYER = HEADER + /* glsl */ `
uniform sampler2D uTex;
uniform sampler2D uMask;  // person mask (camera only)
uniform vec4 uRect;     // x, y, w, h in output uv (y down)
uniform vec4 uCrop;     // left, top, right, bottom fractions
uniform vec2 uRes;
uniform float uOpacity;
uniform float uRadius;  // px
uniform int uMode;      // 0 texture, 1 solid color, 2 texture in BGRA order, 3 camera cut out
uniform vec4 uColor;
uniform float uShadow;  // cut out: drop shadow strength 0..1
uniform float uHasMask;
float maskAt(vec2 st) {
  if (uHasMask < 0.5) return 1.0;
  return texture(uMask, clamp(st, 0.0, 1.0)).r;
}
void main() {
  vec2 local = (vUv - uRect.xy) / uRect.zw;
  if (local.x < 0.0 || local.y < 0.0 || local.x > 1.0 || local.y > 1.0) discard;
  vec4 c;
  vec2 st = vec2(mix(uCrop.x, 1.0 - uCrop.z, local.x), mix(uCrop.y, 1.0 - uCrop.w, local.y));
  if (uMode == 1) {
    c = uColor;
  } else {
    c = texture(uTex, st);
    if (uMode == 2) c = c.bgra;
  }
  if (uMode == 3) {
    // just the person, with a soft shadow down and to the right
    float a = smoothstep(0.08, 0.6, maskAt(st));
    float sh = 0.0;
    if (uShadow > 0.0) {
      vec2 off = vec2(0.012, 0.018);
      vec2 r = vec2(0.012, 0.012 * uRes.x / uRes.y);
      for (int i = -2; i <= 2; i++)
        for (int j = -2; j <= 2; j++) sh += maskAt(st - off + vec2(float(i), float(j)) * r);
      sh = sh / 25.0 * 0.55 * uShadow;
    }
    float outA = a + sh * (1.0 - a);
    c = vec4(outA > 0.001 ? c.rgb * a / outA : vec3(0.0), outA);
  } else {
    vec2 size = uRect.zw * uRes;
    vec2 q = abs(local * size - size * 0.5) - (size * 0.5 - uRadius);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
    c.a *= clamp(0.5 - d, 0.0, 1.0);
  }
  outColor = vec4(c.rgb, c.a * uOpacity);
}`
