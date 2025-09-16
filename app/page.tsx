"use client"

import { useEffect, useRef } from "react"

export default function AfynitiGlitch() {
  const heroRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const noiseCanvasRef = useRef<HTMLCanvasElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const bootRef = useRef<HTMLDivElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const runesRef = useRef<HTMLDivElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)
  const fallbackLogoRef = useRef<HTMLImageElement>(null)

  // WebGL and animation state using refs (no re-renders needed)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)
  const uniformsRef = useRef<{ [key: string]: WebGLUniformLocation | null }>({})
  const texturesRef = useRef<{ bg: WebGLTexture | null; logo: WebGLTexture | null }>({ bg: null, logo: null })
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const hoverLogoRef = useRef(0.0)
  const logoSizeRef = useRef({ w: 512, h: 512 })
  const bgSizeRef = useRef({ w: 1232, h: 928 }) // Default desktop image size
  const currentBreakpointRef = useRef<'mobile' | 'desktop'>('desktop')
  const animationRef = useRef<number | null>(null)

  const isReadyRef = useRef(false)
  const hasErrorRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const bgIntensity = 0.6
  const logoIntensity = 0.6
  const baseLogoSize = typeof window !== "undefined" && window.innerWidth < 768 ? 0.45 : 0.35
  const freeze = false // Removed freeze functionality

  // Initialize AudioContext on first interaction
  useEffect(() => {
    const handleFirstInteraction = () => {
      try {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      } catch (e) {}
    }
    window.addEventListener("pointerdown", handleFirstInteraction, { once: true })
    return () => window.removeEventListener("pointerdown", handleFirstInteraction)
  }, [])

  useEffect(() => {
    if (!heroRef.current || !canvasRef.current || !noiseCanvasRef.current) return

    const hero = heroRef.current
    const canvas = canvasRef.current
    const noiseCanvas = noiseCanvasRef.current
    const statusEl = statusRef.current!
    const boot = bootRef.current!
    const consoleEl = consoleRef.current!
    const runes = runesRef.current!
    const fallback = fallbackRef.current!
    const fallbackLogo = fallbackLogoRef.current!

    let loadedBG = false
    let loadedLogo = false
    let startTime = 0

    // Seed persistence for the session
    const ss = window.sessionStorage
    let bgSeed = Number(ss.getItem("af_bg_seed")) || Math.floor(Math.random() * 1e6)
    let logoSeed = Number(ss.getItem("af_logo_seed")) || Math.floor(Math.random() * 1e6)

    const reseedBG = () => {
      bgSeed = Math.floor(Math.random() * 1e6)
      ss.setItem("af_bg_seed", String(bgSeed))
    }

    const reseedLogo = () => {
      logoSeed = Math.floor(Math.random() * 1e6)
      ss.setItem("af_logo_seed", String(logoSeed))
    }

    ss.setItem("af_bg_seed", String(bgSeed))
    ss.setItem("af_logo_seed", String(logoSeed))

    // Boot sequence text (first visit in this tab only)
    if (!ss.getItem("af_boot_done")) {
      boot.classList.add("show")
      const lines = [
        "[afyniti] initializing core threads...",
        "[ok] linking quest engine…",
        "[ok] loading lumara protocols…",
        "[ok] weaving narrative fabric…",
        "[ok] syncing city map shards…",
        "[ok] calibrating glitch shader seed…",
        "[ready] enter.",
      ]
      let i = 0
      const iv = setInterval(() => {
        if (i < lines.length) {
          consoleEl.textContent += lines[i++] + "\n"
        } else {
          clearInterval(iv)
          setTimeout(() => boot.classList.remove("show"), 450)
          ss.setItem("af_boot_done", "1")
        }
      }, 280)
    }

    // Runes flash
    const glyphs = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚺ", "ᚾ", "ᛁ", "ᛃ", "ᛇ", "ᛈ", "ᛉ", "ᛋ", "ᛏ", "ᛒ", "ᛖ", "ᛗ"]
    for (let i = 0; i < 18; i++) {
      const s = document.createElement("span")
      s.textContent = glyphs[i % glyphs.length]
      runes.appendChild(s)
    }
    setTimeout(() => {
      runes.style.opacity = "1"
      setTimeout(() => (runes.style.opacity = "0"), 900)
    }, 1200)

    // WebGL init
    const glContext = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: false })
    glRef.current = glContext

    if (!glContext) {
      fallback.classList.add("show")
      const isMobile = window.innerWidth < 768
      hero.style.backgroundImage = `url("${isMobile ? "/hero-mobile.jpg" : "/hero.jpg"}")`
      fallbackLogo.src = "/logo.png"
      statusEl.textContent = "WebGL not supported. Showing fallback."
      hasErrorRef.current = true
      return
    }

    const VS = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main(){ v_uv = (a_pos + 1.0)*0.5; gl_Position = vec4(a_pos,0.0,1.0); }
    `

    const FS = `
      precision highp float;
      varying vec2 v_uv;

      uniform sampler2D u_bg;
      uniform sampler2D u_logo;
      uniform vec2  u_res;
      uniform float u_time;

      uniform float u_bgSeed;
      uniform float u_bgIntensity;
      uniform float u_bgFreezeAt;
      uniform vec2  u_bgWH;

      uniform float u_logoSeed;
      uniform float u_logoIntensity;
      uniform vec2  u_logoWH;
      uniform float u_logoScale;
      uniform vec2  u_logoCenter;
      uniform float u_logoHover;

      uniform vec2  u_mouse;
      uniform vec3  u_tint;

      float hash11(float p){ p=fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p); }
      float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }

      float sliceOffset(float y,float seed){
        float band=floor(y*12.0);
        float r=hash11(band+seed*57.0);
        float gate=step(0.7,r);
        float dir=sign(r-0.5);
        return gate*dir*(0.002+0.02*r);
      }

      vec3 sampleRGB(sampler2D tex, vec2 uv, vec2 shift){
        float r=texture2D(tex, uv+shift).r;
        float g=texture2D(tex, uv).g;
        float b=texture2D(tex, uv-shift).b;
        return vec3(r,g,b);
      }

      vec4 glitchBG(vec2 uv){
        float t = u_time * 0.6;
        float effective = u_bgIntensity;

        if(u_bgFreezeAt > 0.0){
          effective *= step(u_bgFreezeAt, 0.0) + step(0.0, u_bgFreezeAt - u_time) * 1.0;
          if(u_time > u_bgFreezeAt){ effective = 0.0; t = u_bgFreezeAt * 0.6; }
        }

        // Aspect ratio preservation - scale to cover screen, letterbox when screen is wider
        float screenAspect = u_res.x / u_res.y;
        float bgAspect = u_bgWH.x / u_bgWH.y;
        vec2 bgUV = uv;

        if (bgAspect > screenAspect) {
            // Image is wider than screen - scale to fill height, crop sides
            float scale = screenAspect / bgAspect;
            bgUV.x = (bgUV.x - 0.5) * scale + 0.5;
        } else {
            // Image is taller than screen - scale to fill width, crop vertically
            float scale = bgAspect / screenAspect;
            bgUV.y = (bgUV.y - 0.5) * scale + 0.5;
        }

        float mousePush = (u_mouse.x - 0.5) * 0.012;
        float j = hash21(vec2(floor(t*10.0), u_bgSeed)) * 0.002 * effective;
        bgUV.y += j;
        float off = sliceOffset(bgUV.y + t*0.02, u_bgSeed) * effective + mousePush;
        float micro = (hash21(vec2(bgUV.y*200.0 + t*5.0, u_bgSeed)) - 0.5) * 0.004 * effective;
        vec2 uvShift = vec2(off + micro, 0.0);

        float ca = (1.0 / u_res.x) * (3.0 + 30.0 * effective);
        vec3 col = sampleRGB(u_bg, bgUV + uvShift, vec2(ca,0.0));

        float scan = 0.93 + 0.07 * sin((uv.y + t*1.5) * u_res.y);
        float vig = smoothstep(1.2, 0.3, length(uv - 0.5));
        col *= scan * mix(1.0, vig, 0.15);

        float rowNoise = hash21(vec2(floor(uv.y * u_res.y * 0.25), floor(t*20.0)+u_bgSeed*100.0));
        float dropout = mix(1.0, 0.65 + 0.35*rowNoise, 0.25 * effective);
        col *= dropout;

        col *= u_tint;

        return vec4(col, 1.0);
      }

      vec4 glitchLogo(vec2 uv){
        float screenAspect = u_res.x / u_res.y;
        float logoAspect   = u_logoWH.x / u_logoWH.y;
        float h_uv = u_logoScale;
        float w_uv = h_uv * logoAspect / screenAspect;
        vec2 halfSize = 0.5 * vec2(w_uv, h_uv);
        vec2 minUV = u_logoCenter - halfSize;
        vec2 maxUV = u_logoCenter + halfSize;

        if(any(lessThan(uv, minUV)) || any(greaterThan(uv, maxUV))) return vec4(0.0);
        vec2 luv = (uv - minUV) / (maxUV - minUV);

        float t = u_time * 0.9;
        float e = u_logoIntensity + u_logoHover * 0.35;
        float j = hash21(vec2(floor(t*12.0), u_logoSeed)) * 0.003 * e;
        luv.y += j;

        float off = sliceOffset(luv.y + t*0.03, u_logoSeed) * e;
        float micro = (hash21(vec2(luv.y*240.0 + t*6.0, u_logoSeed)) - 0.5) * 0.006 * e;
        float shatter = u_logoHover * (step(0.6, hash21(vec2(floor(t*7.0), u_logoSeed))) * 1.0);
        float q = shatter > 0.5 ? 0.15 : 0.0;
        luv.x = (floor(luv.x / max(0.0001, q)) * max(0.0001, q)) + fract(luv.x / max(0.0001, q)) * 0.0;

        vec2 shift = vec2(off + micro, 0.0);
        float ca = (1.0 / u_res.x) * (4.0 + 40.0 * e);
        vec3 col = sampleRGB(u_logo, luv + shift, vec2(ca,0.0));
        float a = texture2D(u_logo, luv).a;

        float pulse = 0.97 + 0.07 * sin(t*2.0 + u_logoSeed);
        return vec4(col * pulse, a);
      }

      void main(){
        vec2 uv = v_uv;
        vec4 bg = glitchBG(uv);
        vec4 lg = glitchLogo(uv);
        vec3 outRGB = mix(bg.rgb, lg.rgb, lg.a);
        gl_FragColor = vec4(outRGB, 1.0);
      }
    `

    const compile = (type: number, src: string) => {
      const s = glContext.createShader(type)!
      glContext.shaderSource(s, src)
      glContext.compileShader(s)
      if (!glContext.getShaderParameter(s, glContext.COMPILE_STATUS))
        throw new Error(glContext.getShaderInfoLog(s) || "")
      return s
    }

    const link = (vs: WebGLShader, fs: WebGLShader) => {
      const p = glContext.createProgram()!
      glContext.attachShader(p, vs)
      glContext.attachShader(p, fs)
      glContext.linkProgram(p)
      if (!glContext.getProgramParameter(p, glContext.LINK_STATUS))
        throw new Error(glContext.getProgramInfoLog(p) || "")
      return p
    }

    // Initialize WebGL program
    let compiledProgram: WebGLProgram | null = null
    let initError = false

    const initWebGL = () => {
      try {
        compiledProgram = link(compile(glContext.VERTEX_SHADER, VS), compile(glContext.FRAGMENT_SHADER, FS))
        programRef.current = compiledProgram
        glContext.useProgram(compiledProgram)

        const buffer = glContext.createBuffer()
        glContext.bindBuffer(glContext.ARRAY_BUFFER, buffer)
        glContext.bufferData(glContext.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), glContext.STATIC_DRAW)

        // Store uniform locations
        uniformsRef.current = {
          u_bg: glContext.getUniformLocation(compiledProgram, "u_bg"),
          u_logo: glContext.getUniformLocation(compiledProgram, "u_logo"),
          u_res: glContext.getUniformLocation(compiledProgram, "u_res"),
          u_time: glContext.getUniformLocation(compiledProgram, "u_time"),
          u_bgSeed: glContext.getUniformLocation(compiledProgram, "u_bgSeed"),
          u_bgIntensity: glContext.getUniformLocation(compiledProgram, "u_bgIntensity"),
          u_bgFreezeAt: glContext.getUniformLocation(compiledProgram, "u_bgFreezeAt"),
          u_bgWH: glContext.getUniformLocation(compiledProgram, "u_bgWH"),
          u_logoSeed: glContext.getUniformLocation(compiledProgram, "u_logoSeed"),
          u_logoIntensity: glContext.getUniformLocation(compiledProgram, "u_logoIntensity"),
          u_logoWH: glContext.getUniformLocation(compiledProgram, "u_logoWH"),
          u_logoScale: glContext.getUniformLocation(compiledProgram, "u_logoScale"),
          u_logoCenter: glContext.getUniformLocation(compiledProgram, "u_logoCenter"),
          u_logoHover: glContext.getUniformLocation(compiledProgram, "u_logoHover"),
          u_mouse: glContext.getUniformLocation(compiledProgram, "u_mouse"),
          u_tint: glContext.getUniformLocation(compiledProgram, "u_tint"),
        }

        // Textures
        const textureBG = glContext.createTexture()
        texturesRef.current.bg = textureBG
        glContext.bindTexture(glContext.TEXTURE_2D, textureBG)
        glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.LINEAR)
        glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.LINEAR)
        glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, glContext.CLAMP_TO_EDGE)
        glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, glContext.CLAMP_TO_EDGE)

        const textureLogo = glContext.createTexture()
        texturesRef.current.logo = textureLogo
        glContext.bindTexture(glContext.TEXTURE_2D, textureLogo)
        glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.LINEAR)
        glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.LINEAR)
        glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, glContext.CLAMP_TO_EDGE)
        glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, glContext.CLAMP_TO_EDGE)
      } catch (e) {
        statusEl.textContent = "Shader error"
        statusEl.classList.add("error")
        console.error(e)
        initError = true
      }

      // Update React state after WebGL initialization
      hasErrorRef.current = initError
      if (initError) return

      // Load images
      const bgImg = new Image()
      const logoImg = new Image()

      bgImg.onload = () => {
        console.log("[v0] Background image loaded successfully")
        if (!glContext || !texturesRef.current.bg) return
        glContext.pixelStorei(glContext.UNPACK_FLIP_Y_WEBGL, true)
        glContext.activeTexture(glContext.TEXTURE0)
        glContext.bindTexture(glContext.TEXTURE_2D, texturesRef.current.bg)
        glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, bgImg)
        bgSizeRef.current = { w: bgImg.width, h: bgImg.height }
        loadedBG = true
        maybeStart()
      }

      logoImg.onload = () => {
        console.log("[v0] Logo image loaded successfully")
        if (!glContext || !texturesRef.current.logo) return
        glContext.pixelStorei(glContext.UNPACK_FLIP_Y_WEBGL, true)
        glContext.activeTexture(glContext.TEXTURE1)
        glContext.bindTexture(glContext.TEXTURE_2D, texturesRef.current.logo)
        glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, logoImg)
        logoSizeRef.current = { w: logoImg.width, h: logoImg.height }
        loadedLogo = true
        maybeStart()
      }

      bgImg.onerror = () => {
        console.log("[v0] Background image failed to load")
        statusEl.textContent = "Failed to load hero.jpg"
        statusEl.classList.add("error")
        hasErrorRef.current = true
      }

      logoImg.onerror = () => {
        console.log("[v0] Logo image failed to load")
        statusEl.textContent = "Failed to load logo.png"
        statusEl.classList.add("error")
        hasErrorRef.current = true
      }

      bgImg.crossOrigin = "anonymous"
      logoImg.crossOrigin = "anonymous"
      const isMobile = window.innerWidth < 768
      const bgImagePath = isMobile ? "/hero-mobile.jpg" : "/hero.jpg"
      const logoImagePath = "/logo.png"

      console.log("[v0] Loading background image:", bgImagePath)
      console.log("[v0] Loading logo image:", logoImagePath)

      // Set initial breakpoint
      currentBreakpointRef.current = isMobile ? 'mobile' : 'desktop'

      bgImg.src = bgImagePath
      logoImg.src = logoImagePath
    }

    // Function to load new background image
    const loadBackgroundImage = (imagePath: string) => {
      const newBgImg = new Image()
      newBgImg.onload = () => {
        if (!glContext || !texturesRef.current.bg) return
        glContext.pixelStorei(glContext.UNPACK_FLIP_Y_WEBGL, true)
        glContext.activeTexture(glContext.TEXTURE0)
        glContext.bindTexture(glContext.TEXTURE_2D, texturesRef.current.bg)
        glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, newBgImg)
        bgSizeRef.current = { w: newBgImg.width, h: newBgImg.height }
        console.log("[v0] Background image switched to:", imagePath, "size:", newBgImg.width, "x", newBgImg.height)
      }
      newBgImg.onerror = () => {
        console.error("[v0] Failed to load background image:", imagePath)
      }
      newBgImg.src = imagePath
    }

    // Resize
    const resize = () => {
      const rect = hero.getBoundingClientRect()
      const cw = Math.max(1, Math.floor(rect.width))
      const ch = Math.max(1, Math.floor(rect.height))
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.max(1, cw * dpr),
        h = Math.max(1, ch * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      if (glContext) glContext.viewport(0, 0, canvas.width, canvas.height)
      if (noiseCanvas.width !== cw || noiseCanvas.height !== ch) {
        noiseCanvas.width = cw
        noiseCanvas.height = ch
      }

      // Check for breakpoint change and switch background image if needed
      const isMobile = window.innerWidth < 560
      const newBreakpoint = isMobile ? 'mobile' : 'desktop'
      if (newBreakpoint !== currentBreakpointRef.current) {
        currentBreakpointRef.current = newBreakpoint
        const bgImagePath = isMobile ? "/hero-mobile.jpg" : "/hero.jpg"
        loadBackgroundImage(bgImagePath)
      }
    }

    // Clamp logo scale so it always stays inside screen (both width & height), with padding
    const clampLogoScale = (desired: number) => {
      // canvas size is device pixels; shader uses UV space (0..1)
      const screenAspect = canvas.width / canvas.height            // w/h
      const logoAspect = logoSizeRef.current.w / logoSizeRef.current.h             // w/h
      const padding = 0.9 // keep logo inside 90% of both dims (tweak if you want tighter/looser fit)
      const maxByHeight = padding                                  // h_uv <= padding
      const maxByWidth = padding * (screenAspect / logoAspect)     // w_uv = h_uv*(logoAspect/screenAspect) <= padding
      const safeMax = Math.max(0.0, Math.min(maxByHeight, isFinite(maxByWidth) ? maxByWidth : maxByHeight))
      return Math.min(desired, safeMax)
    }

    // Hover detect for logo area (aligned with clamped size)
    const isOverLogo = (mx: number, my: number) => {
      const screenAspect = canvas.width / canvas.height
      const logoAspect = logoSizeRef.current.w / logoSizeRef.current.h
      const h_uv = clampLogoScale(baseLogoSize)
      const w_uv = h_uv * (logoAspect / screenAspect)
      const cx = 0.5, cy = 0.5
      const minx = cx - 0.5 * w_uv, maxx = cx + 0.5 * w_uv
      const miny = cy - 0.5 * h_uv, maxy = cy + 0.5 * h_uv
      return mx >= minx && mx <= maxx && my >= miny && my <= maxy
    }

    hero.addEventListener("mousemove", (e) => {
      const r = hero.getBoundingClientRect()
      const mx = (e.clientX - r.left) / r.width
      const my = (e.clientY - r.top) / r.height
      mouseRef.current = { x: mx, y: my }
      hoverLogoRef.current = isOverLogo(mx, my) ? 1.0 : 0.0
    })

    // Time-of-day tint
    const computeTint = () => {
      const h = new Date().getHours()
      const day = [1.06, 1.0, 0.92]
      const night = [0.9, 0.98, 1.12]
      const t = h >= 7 && h <= 18 ? 1.0 : 0.0
      return [day[0] * t + night[0] * (1.0 - t), day[1] * t + night[1] * (1.0 - t), day[2] * t + night[2] * (1.0 - t)]
    }

    // Noise overlay draw
    const nctx = noiseCanvas.getContext("2d", { alpha: true })!
    const drawNoise = () => {
      const w = noiseCanvas.width,
        h = noiseCanvas.height
      const img = nctx.createImageData(w, h)
      const data = img.data
      for (let i = 0; i < data.length; i += 4) {
        const v = 200 + Math.random() * 55
        data[i] = data[i + 1] = data[i + 2] = v
        data[i + 3] = Math.random() * 35
      }
      nctx.putImageData(img, 0, 0)
    }

    const maybeStart = () => {
      if (!(loadedBG && loadedLogo)) return
      statusEl.textContent = "Running"
      isReadyRef.current = true
      startTime = performance.now()
      requestAnimationFrame(draw)
    }

    const draw = (ts: number) => {
      resize()
      drawNoise()

      const tSec = (ts - startTime) * 0.001
      const tint = computeTint()

      const glContext = glRef.current
      const program = programRef.current
      const uniforms = uniformsRef.current
      const textures = texturesRef.current

      if (glContext && program) {
        glContext.useProgram(program)

        glContext.activeTexture(glContext.TEXTURE0)
        glContext.bindTexture(glContext.TEXTURE_2D, textures.bg)
        if (uniforms.u_bg) glContext.uniform1i(uniforms.u_bg, 0)
        glContext.activeTexture(glContext.TEXTURE1)
        glContext.bindTexture(glContext.TEXTURE_2D, textures.logo)
        if (uniforms.u_logo) glContext.uniform1i(uniforms.u_logo, 1)

        if (uniforms.u_res) glContext.uniform2f(uniforms.u_res, canvas.width, canvas.height)
        if (uniforms.u_time) glContext.uniform1f(uniforms.u_time, tSec)
        if (uniforms.u_bgSeed) glContext.uniform1f(uniforms.u_bgSeed, bgSeed)
        if (uniforms.u_logoSeed) glContext.uniform1f(uniforms.u_logoSeed, logoSeed)
        if (uniforms.u_bgIntensity) glContext.uniform1f(uniforms.u_bgIntensity, bgIntensity)
        if (uniforms.u_logoIntensity) glContext.uniform1f(uniforms.u_logoIntensity, logoIntensity)
        if (uniforms.u_bgWH) glContext.uniform2f(uniforms.u_bgWH, bgSizeRef.current.w, bgSizeRef.current.h)
        if (uniforms.u_logoWH) glContext.uniform2f(uniforms.u_logoWH, logoSizeRef.current.w, logoSizeRef.current.h)
        // Use clamped logo size for both rendering and hit-testing
        const safeScale = clampLogoScale(baseLogoSize)
        if (uniforms.u_logoScale) glContext.uniform1f(uniforms.u_logoScale, safeScale)
        if (uniforms.u_logoCenter) glContext.uniform2f(uniforms.u_logoCenter, 0.5, 0.5)
        if (uniforms.u_logoHover) glContext.uniform1f(uniforms.u_logoHover, hoverLogoRef.current)
        if (uniforms.u_mouse) glContext.uniform2f(uniforms.u_mouse, mouseRef.current.x, mouseRef.current.y)
        if (uniforms.u_tint) glContext.uniform3f(uniforms.u_tint, tint[0], tint[1], tint[2])

        const freezeAt = freeze ? 2.0 : -1.0
        if (uniforms.u_bgFreezeAt) glContext.uniform1f(uniforms.u_bgFreezeAt, freezeAt)

        const attribLocation = glContext.getAttribLocation(program, "a_pos")
        glContext.enableVertexAttribArray(attribLocation)
        glContext.vertexAttribPointer(attribLocation, 2, glContext.FLOAT, false, 0, 0)

        glContext.drawArrays(glContext.TRIANGLES, 0, 3)
      }
      animationRef.current = requestAnimationFrame(draw)
    }

    // UI bindings
    ;(window as any).reseedBG = reseedBG
    ;(window as any).reseedLogo = reseedLogo

    window.addEventListener("resize", resize)

    // Initialize buffer outside of conditional logic
    const buffer = glContext.createBuffer()
    glContext.bindBuffer(glContext.ARRAY_BUFFER, buffer)
    glContext.bufferData(glContext.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), glContext.STATIC_DRAW)

    initWebGL()

    return () => {
      window.removeEventListener("resize", resize)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, []) // Removed dependencies since values are now constants

  return (
    <div className="min-h-screen bg-[#0b0b12] text-gray-200 font-mono">
      <div
        ref={heroRef}
        className="relative w-full h-screen bg-[#0b0b12] overflow-hidden"
        aria-label="Afyniti glitch hero"
      >
        {/* WebGL canvas */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" id="gl" />

        {/* Noise overlay canvas */}
        <canvas
          ref={noiseCanvasRef}
          className="absolute inset-0 w-full h-full block pointer-events-none mix-blend-soft-light opacity-[0.08]"
          id="noise"
        />

        {/* Status */}
        <div
          ref={statusRef}
          className="absolute left-3 bottom-3 z-[5] bg-black/35 border border-white/[0.12] px-2.5 py-1.5 rounded-lg text-xs"
        >
          Loading…
        </div>

        {/* Boot overlay */}
        <div
          ref={bootRef}
          className="boot absolute inset-0 flex items-center justify-center z-[6] pointer-events-none bg-gradient-radial from-black/65 to-black/95 opacity-0 transition-opacity duration-400"
        >
          <div
            ref={consoleRef}
            className="font-mono text-sm leading-relaxed text-[#9ee7ff] whitespace-pre-wrap max-w-[min(90vw,900px)] text-shadow-[0_0_6px_rgba(158,231,255,0.35)]"
          />
        </div>

        {/* Runes */}
        <div
          ref={runesRef}
          className="absolute inset-0 pointer-events-none z-[4] opacity-0 transition-opacity duration-600 grid grid-cols-6 grid-rows-3 gap-0"
        ></div>

        {/* Fallback (only shown if WebGL not available) */}
        <div
          ref={fallbackRef}
          className="fallback absolute inset-0 z-[1] bg-[#0b0b12] bg-center bg-cover bg-no-repeat hidden"
        >
          <img
            ref={fallbackLogoRef}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[70vw] md:max-w-[60vmin] w-[70vw] md:w-[60vmin] opacity-95 drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)] animate-[cssGlitch_3s_steps(20,end)_infinite]"
            alt="Afyniti Logo"
          />
        </div>
      </div>

      <style jsx>{`
        .boot.show { opacity: 1; }
        .fallback.show { display: block; }
        .runes span {
          align-self: center;
          justify-self: center;
          font-size: min(6vw, 42px);
          color: rgba(173, 216, 230, 0.18);
          text-shadow: 0 0 10px rgba(0, 255, 255, 0.15);
          transform: translateY(6px);
        }
        @keyframes cssGlitch {
          0% { clip-path: inset(0 0 0 0); }
          10% { clip-path: inset(5% 0 0 0); transform: translate(-50%, -52%); }
          11% { clip-path: inset(0 0 6% 0); transform: translate(-49%, -50%); }
          12% { clip-path: inset(0 0 0 0); transform: translate(-50%, -50%); }
        }
      `}</style>
    </div>
  )
}
