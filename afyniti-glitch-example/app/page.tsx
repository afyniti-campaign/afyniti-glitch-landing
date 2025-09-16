'use client';

import { useEffect, useRef } from 'react';

export default function Page() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current!;
    // --- Create DOM nodes
    const canvas = document.createElement('canvas');
    const noiseCanvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    Object.assign(noiseCanvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block',
      pointerEvents: 'none', mixBlendMode: 'soft-light', opacity: '0.08'
    });
    host.appendChild(canvas);
    host.appendChild(noiseCanvas);

    const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) {
      console.warn('WebGL not supported, show CSS/image fallback if desired.');
      return;
    }

    // ---- Helpers -----------------------------------------------------------
    const compile = (type: number, src: string, label: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        console.error('Shader compile error in', label, log, '\n----- SRC -----\n', src);
        throw new Error(String(log));
      }
      return s;
    };
    const link = (vs: WebGLShader, fs: WebGLShader) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(p);
        console.error('Program link error', log);
        throw new Error(String(log));
      }
      return p;
    };

    const VS = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = (a_pos + 1.0) * 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const FS = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif

      varying vec2 v_uv;

      uniform sampler2D u_bg;
      uniform sampler2D u_logo;
      uniform vec2  u_res;
      uniform float u_time;

      uniform float u_bgSeed;
      uniform float u_bgIntensity;
      uniform float u_bgFreezeAt;

      uniform float u_logoSeed;
      uniform float u_logoIntensity;
      uniform vec2  u_logoWH;
      uniform float u_logoScale;   // height in UV units
      uniform vec2  u_logoCenter;
      uniform float u_logoHover;

      uniform vec2  u_mouse;
      uniform vec3  u_tint;
      uniform float u_flash;

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

        float eff = u_bgIntensity;
        if(u_bgFreezeAt >= 0.0){
          if(u_time > u_bgFreezeAt){ eff = 0.0; t = u_bgFreezeAt * 0.6; }
        }

        float mousePush = (u_mouse.x - 0.5) * 0.012;
        float j = hash21(vec2(floor(t*10.0), u_bgSeed)) * 0.002 * eff;
        uv.y += j;
        float off = sliceOffset(uv.y + t*0.02, u_bgSeed) * eff + mousePush;
        float micro = (hash21(vec2(uv.y*200.0 + t*5.0, u_bgSeed)) - 0.5) * 0.004 * eff;
        vec2 uvShift = vec2(off + micro, 0.0);

        float ca = (1.0 / u_res.x) * (3.0 + 30.0 * eff);
        vec3 col = sampleRGB(u_bg, uv + uvShift, vec2(ca,0.0));

        float scan = 0.93 + 0.07 * sin((uv.y + t*1.5) * u_res.y);
        float vig = smoothstep(1.2, 0.3, length(uv - 0.5));
        col *= scan * mix(1.0, vig, 0.15);

        float rowNoise = hash21(vec2(floor(uv.y * u_res.y * 0.25), floor(t*20.0)+u_bgSeed*100.0));
        float dropout = mix(1.0, 0.65 + 0.35*rowNoise, 0.25 * eff);
        col *= dropout;

        col *= u_tint;
        col = mix(col, 1.0 - col, u_flash * 0.5);

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

        // Branchless "inside" test
        float inX = step(minUV.x, uv.x) * step(uv.x, maxUV.x);
        float inY = step(minUV.y, uv.y) * step(uv.y, maxUV.y);
        float inQuad = inX * inY;
        if(inQuad < 0.5) return vec4(0.0);

        vec2 luv = (uv - minUV) / (maxUV - minUV);

        float t = u_time * 0.9;
        float e = u_logoIntensity + u_logoHover * 0.35;
        float j = hash21(vec2(floor(t*12.0), u_logoSeed)) * 0.003 * e;
        luv.y += j;

        float off = sliceOffset(luv.y + t*0.03, u_logoSeed) * e;
        float micro = (hash21(vec2(luv.y*240.0 + t*6.0, u_logoSeed)) - 0.5) * 0.006 * e;

        // Hover shatter (quantize x into bands)
        float doShatter = step(0.5, u_logoHover);
        float q = mix(0.0001, 0.15, doShatter);
        float bands = floor(luv.x / q);
        luv.x = bands * q;

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
    `;

    const program = link(compile(gl.VERTEX_SHADER, VS, 'VERTEX'), compile(gl.FRAGMENT_SHADER, FS, 'FRAGMENT'));
    gl.useProgram(program);

    // Fullscreen triangle
    const a_pos = gl.getAttribLocation(program, 'a_pos');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(a_pos);
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const U = (n: string) => gl.getUniformLocation(program, n);
    const u_bg = U('u_bg'), u_logo = U('u_logo'), u_res = U('u_res'), u_time = U('u_time');
    const u_bgSeed = U('u_bgSeed'), u_bgIntensity = U('u_bgIntensity'), u_bgFreezeAt = U('u_bgFreezeAt');
    const u_logoSeed = U('u_logoSeed'), u_logoIntensity = U('u_logoIntensity'), u_logoWH = U('u_logoWH');
    const u_logoScale = U('u_logoScale'), u_logoCenter = U('u_logoCenter'), u_logoHover = U('u_logoHover');
    const u_mouse = U('u_mouse'), u_tint = U('u_tint'), u_flash = U('u_flash');

    // Textures
    const texBG = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texBG);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const texLogo = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texLogo);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Load images
    const bgImg = new Image();
    const logoImg = new Image();
    bgImg.src = '/hero.jpg?v=' + Math.random();
    // 1% alt logo if present
    const useAltLogo = Math.random() < 0.01;
    logoImg.src = (useAltLogo ? '/logo_alt.png' : '/logo.png') + '?v=' + Math.random();

    let logoW = 512, logoH = 512;
    const logoSizeRef = { w: 512, h: 512 };

    bgImg.onload = () => {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texBG);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgImg);
      maybeStart();
    };
    logoImg.onload = () => {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texLogo);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, logoImg);
      logoW = logoImg.width; logoH = logoImg.height;
      logoSizeRef.w = logoW; logoSizeRef.h = logoH;
      maybeStart();
    };

    let loadedBG = false, loadedLogo = false;
    function maybeStart() {
      if (!loadedBG && bgImg.complete) loadedBG = true;
      if (!loadedLogo && logoImg.complete) loadedLogo = true;
      if (loadedBG && loadedLogo) {
        start();
      }
    }

    // DPR resize & noise
    const noiseCtx = noiseCanvas.getContext('2d', { alpha: true })!;
    function drawNoise() {
      const w = noiseCanvas.width, h = noiseCanvas.height;
      const img = noiseCtx.createImageData(w, h);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = 200 + Math.random() * 55;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = Math.random() * 35;
      }
      noiseCtx.putImageData(img, 0, 0);
    }

    function resize() {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.max(1, Math.floor(rect.width));
      const ch = Math.max(1, Math.floor(rect.height));
      const w = Math.max(1, Math.floor(cw * dpr));
      const h = Math.max(1, Math.floor(ch * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      if (noiseCanvas.width !== cw || noiseCanvas.height !== ch) {
        noiseCanvas.width = cw; noiseCanvas.height = ch;
      }
    }
    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    // Interaction
    let mouse = { x: 0.5, y: 0.5 }, hoverLogo = 0.0;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const r = host.getBoundingClientRect();
      let cx: number, cy: number;
      if (e instanceof TouchEvent && e.touches[0]) {
        cx = e.touches[0].clientX; cy = e.touches[0].clientY;
      } else {
        const me = e as MouseEvent;
        cx = me.clientX; cy = me.clientY;
      }
      mouse.x = (cx - r.left) / r.width;
      mouse.y = (cy - r.top) / r.height;
      hoverLogo = isOverLogo(mouse.x, mouse.y) ? 1.0 : 0.0;
    };
    host.addEventListener('mousemove', onMove);
    host.addEventListener('touchmove', onMove, { passive: true });

    // Controls (you can make these props; hard-coded here)
    const bgIntensity = 0.36;
    const logoIntensity = 0.55;
    // Requested base size (UV height). We’ll clamp for mobile.
    const baseLogoSize = typeof window !== 'undefined' && window.innerWidth < 768 ? 0.45 : 0.35;

    // Seeds (persist for session)
    const ss = window.sessionStorage;
    let bgSeed = Number(ss.getItem('af_bg_seed')) || Math.floor(Math.random() * 1e6);
    let logoSeed = Number(ss.getItem('af_logo_seed')) || Math.floor(Math.random() * 1e6);
    ss.setItem('af_bg_seed', String(bgSeed));
    ss.setItem('af_logo_seed', String(logoSeed));

    // Time-of-day tint
    const computeTint = () => {
      const h = new Date().getHours();
      const day = [1.06, 1.00, 0.92], night = [0.90, 0.98, 1.12];
      const t = (h >= 7 && h <= 18) ? 1.0 : 0.0;
      return [day[0] * t + night[0] * (1.0 - t), day[1] * t + night[1] * (1.0 - t), day[2] * t + night[2] * (1.0 - t)];
    };

    // Color flash events
    let flash = 0.0, nextFlashAt = performance.now() + 800 + Math.random() * 6000;

    // -------- MOBILE-SAFE CLAMP --------
    // Clamp logo scale so it always stays inside screen (both width & height), with padding
    const clampLogoScale = (desired: number) => {
      // canvas size is device pixels; shader uses UV space (0..1)
      const screenAspect = canvas.width / canvas.height;            // w/h
      const logoAspect = logoSizeRef.w / logoSizeRef.h;             // w/h
      const padding = 0.9; // keep logo inside 90% of both dims (tweak if you want tighter/looser fit)
      const maxByHeight = padding;                                  // h_uv <= padding
      const maxByWidth = padding * (screenAspect / logoAspect);     // w_uv = h_uv*(logoAspect/screenAspect) <= padding
      const safeMax = Math.max(0.0, Math.min(maxByHeight, isFinite(maxByWidth) ? maxByWidth : maxByHeight));
      return Math.min(desired, safeMax);
    };

    // Hit test aligned with clamped size
    const isOverLogo = (mx: number, my: number) => {
      const screenAspect = canvas.width / canvas.height;
      const logoAspect = logoSizeRef.w / logoSizeRef.h;
      const h_uv = clampLogoScale(baseLogoSize);
      const w_uv = h_uv * (logoAspect / screenAspect);
      const cx = 0.5, cy = 0.5;
      const minx = cx - 0.5 * w_uv, maxx = cx + 0.5 * w_uv;
      const miny = cy - 0.5 * h_uv, maxy = cy + 0.5 * h_uv;
      return mx >= minx && mx <= maxx && my >= miny && my <= maxy;
    };

    // Animation
    let startTime = 0;
    const start = () => {
      startTime = performance.now();
      requestAnimationFrame(draw);
    };

    const draw = (ts: number) => {
      resize();
      drawNoise();

      const tSec = (ts - startTime) * 0.001;
      const tint = computeTint();

      // Flash spike occasionally
      if (ts >= nextFlashAt) {
        flash = 1.0;
        nextFlashAt = ts + 300 + Math.random() * 10000;
      }
      flash *= 0.90;

      gl.useProgram(program);

      // Textures
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texBG); gl.uniform1i(u_bg, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texLogo); gl.uniform1i(u_logo, 1);

      // Uniforms
      gl.uniform2f(u_res, canvas.width, canvas.height);
      gl.uniform1f(u_time, tSec);
      gl.uniform1f(u_bgSeed, bgSeed);
      gl.uniform1f(u_logoSeed, logoSeed);
      gl.uniform1f(u_bgIntensity, bgIntensity);
      gl.uniform1f(u_logoIntensity, logoIntensity);
      gl.uniform2f(u_logoWH, logoW, logoH);

      // >>> Use clamped logo size for both rendering and hit-testing <<<
      const safeScale = clampLogoScale(baseLogoSize);
      gl.uniform1f(u_logoScale, safeScale);

      gl.uniform2f(u_logoCenter, 0.5, 0.5);
      gl.uniform1f(u_logoHover, hoverLogo);

      gl.uniform2f(u_mouse, mouse.x, mouse.y);
      gl.uniform3f(u_tint, tint[0], tint[1], tint[2]);

      // Freeze BG after 2s (set to -1.0 to keep it always moving)
      gl.uniform1f(u_bgFreezeAt, 2.0);

      gl.uniform1f(u_flash, flash);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    };

    // Kick image loads (last so our onload hooks are in place)
    // Note: we already set src above; ensure maybeStart gets called when both complete
    if (bgImg.complete) loadedBG = true;
    if (logoImg.complete) { loadedLogo = true; logoW = logoImg.width; logoH = logoImg.height; logoSizeRef.w = logoW; logoSizeRef.h = logoH; }
    if (bgImg.complete && logoImg.complete) start();

    // Cleanup
    return () => {
      window.removeEventListener('resize', onResize);
      host.removeEventListener('mousemove', onMove);
      host.removeEventListener('touchmove', onMove);
      try {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {}
      canvas.remove();
      noiseCanvas.remove();
    };
  }, []);

  return (
    <main style={{ margin: 0, padding: 0 }}>
      {/* Host container with fixed height; tweak for your layout */}
      <div
        ref={hostRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '70vh',
          background: '#0b0b12',
          overflow: 'hidden',
          touchAction: 'none',
        }}
        aria-label="Afyniti glitch hero"
      />
    </main>
  );
}
