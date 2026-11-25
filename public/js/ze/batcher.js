// ---- the batcher: what the game's own code draws goes straight to the GPU. A canvas handed to WebGL each frame costs 7 ms
// in WebKit whatever its size (a sync with its GPU process), and frames lost; a sprite goes up once.
const ZG_BATCH_VS = `#version 300 es
layout(location=0)in vec2 aP;layout(location=1)in vec2 aU;layout(location=2)in vec4 aC;out vec2 vU;out vec4 vC;
void main(){vec2 c=aP/vec2(720.,900.);gl_Position=vec4(c.x*2.-1.,c.y*2.-1.,0.,1.);vU=aU;vC=aC;}`;
const ZG_BATCH_FS = `#version 300 es
precision highp float;uniform sampler2D uT;in vec2 vU;in vec4 vC;out vec4 o;void main(){o=texture(uT,vU)*vC;}`;
function zgBatch(gl) {
  const P = zgCompile(gl, ZG_BATCH_VS, ZG_BATCH_FS),
    vao = gl.createVertexArray(),
    buf = gl.createBuffer(),
    V = new Float32Array(8 * 24000);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 8);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.bindVertexArray(zg.vao);
  const sL = gl.createSampler(),
    sN = gl.createSampler();
  for (const [sm, f] of [
    [sL, gl.LINEAR],
    [sN, gl.NEAREST],
  ]) {
    gl.samplerParameteri(sm, gl.TEXTURE_MIN_FILTER, f);
    gl.samplerParameteri(sm, gl.TEXTURE_MAG_FILTER, f);
    gl.samplerParameteri(sm, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(sm, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  const white = zgTex(gl);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  const texs = new WeakMap(),
    texts = new Map(),
    colors = new Map(),
    probe = document.createElement('canvas').getContext('2d');
  let n = 0,
    curT = null,
    curS = null,
    M = [1, 0, 0, 1, 0, 0],
    stack = [],
    paths = [],
    cur = null,
    K = 1;
  const flush = () => {
    if (!n) return;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, V.subarray(0, n * 8), gl.DYNAMIC_DRAW);
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, curT);
    gl.bindSampler(0, curS);
    gl.uniform1i(gl.getUniformLocation(P.p, 'uT'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, n);
    gl.bindSampler(0, null);
    gl.bindVertexArray(zg.vao);
    n = 0;
  };
  const bind = (t, sm) => {
    if (t !== curT || sm !== curS || n > 23900) {
      flush();
      curT = t;
      curS = sm;
    }
  };
  const vert = (x, y, u, v, c) => {
    const i = n++ * 8;
    V[i] = M[0] * x + M[2] * y + M[4];
    V[i + 1] = M[1] * x + M[3] * y + M[5];
    V[i + 2] = u;
    V[i + 3] = v;
    V[i + 4] = c[0];
    V[i + 5] = c[1];
    V[i + 6] = c[2];
    V[i + 7] = c[3];
  };
  const rawv = (x, y, c) => {
    const i = n++ * 8;
    V[i] = x;
    V[i + 1] = y;
    V[i + 2] = 0.5;
    V[i + 3] = 0.5;
    V[i + 4] = c[0];
    V[i + 5] = c[1];
    V[i + 6] = c[2];
    V[i + 7] = c[3];
  };
  const color = (css, a) => {
    let c = colors.get(css);
    if (!c) {
      probe.fillStyle = '#000';
      probe.fillStyle = css;
      const t = probe.fillStyle;
      let m;
      if (t[0] === '#') {
        const h = parseInt(t.slice(1), 16);
        c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255, 1];
      } else if ((m = t.match(/rgba?\(([^)]+)\)/))) {
        const q = m[1].split(',').map(Number);
        c = [q[0] / 255, q[1] / 255, q[2] / 255, q[3] ?? 1];
      } else c = [1, 1, 1, 1];
      colors.set(css, c);
    }
    const A = c[3] * a;
    return [c[0] * A, c[1] * A, c[2] * A, A];
  };
  const texOf = cv => {
    let t = texs.get(cv);
    if (!t) {
      t = zgUp(gl, cv);
      texs.set(cv, t);
      zg.ups = (zg.ups || 0) + 1;
    }
    return t;
  };
  const X = {
    zg: true,
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
    shadowBlur: 0,
    shadowColor: '',
    begin(k) {
      K = k;
      n = 0;
      curT = null;
      curS = null;
      M = [1, 0, 0, 1, 0, 0];
      stack = [];
      X.globalAlpha = 1;
      X.imageSmoothingEnabled = true;
    },
    free() {
      for (const T of texts.values()) zgLetGo(T.cv);
      texts.clear();
    },
    end() {
      flush();
    },
    save() {
      stack.push({
        M: M.slice(),
        a: X.globalAlpha,
        f: X.fillStyle,
        s: X.strokeStyle,
        l: X.lineWidth,
        fo: X.font,
        al: X.textAlign,
        ba: X.textBaseline,
        sm: X.imageSmoothingEnabled,
      });
    },
    restore() {
      const q = stack.pop();
      if (!q) return;
      M = q.M;
      X.globalAlpha = q.a;
      X.fillStyle = q.f;
      X.strokeStyle = q.s;
      X.lineWidth = q.l;
      X.font = q.fo;
      X.textAlign = q.al;
      X.textBaseline = q.ba;
      X.imageSmoothingEnabled = q.sm;
    },
    translate(x, y) {
      M[4] += M[0] * x + M[2] * y;
      M[5] += M[1] * x + M[3] * y;
    },
    scale(x, y) {
      M[0] *= x;
      M[1] *= x;
      M[2] *= y;
      M[3] *= y;
    },
    rotate(a) {
      const c = Math.cos(a),
        s = Math.sin(a),
        [A, B, C, D] = M;
      M[0] = A * c + C * s;
      M[1] = B * c + D * s;
      M[2] = C * c - A * s;
      M[3] = D * c - B * s;
    },
    drawImage(img, a, b, c, d, e, f, g, h) {
      let sx = 0,
        sy = 0,
        sw = img.width,
        sh = img.height,
        dx = a,
        dy = b,
        dw = c ?? sw,
        dh = d ?? sh;
      if (e !== undefined) {
        sx = a;
        sy = b;
        sw = c;
        sh = d;
        dx = e;
        dy = f;
        dw = g;
        dh = h;
      }
      bind(texOf(img), X.imageSmoothingEnabled ? sL : sN);
      const u0 = sx / img.width,
        v0 = sy / img.height,
        u1 = (sx + sw) / img.width,
        v1 = (sy + sh) / img.height,
        A = X.globalAlpha,
        cl = [A, A, A, A];
      vert(dx, dy, u0, v0, cl);
      vert(dx + dw, dy, u1, v0, cl);
      vert(dx, dy + dh, u0, v1, cl);
      vert(dx + dw, dy, u1, v0, cl);
      vert(dx + dw, dy + dh, u1, v1, cl);
      vert(dx, dy + dh, u0, v1, cl);
    },
    fillRect(x, y, w, h) {
      if (typeof X.fillStyle !== 'string') return;
      const c = color(X.fillStyle, X.globalAlpha);
      bind(white, sL);
      vert(x, y, 0.5, 0.5, c);
      vert(x + w, y, 0.5, 0.5, c);
      vert(x, y + h, 0.5, 0.5, c);
      vert(x + w, y, 0.5, 0.5, c);
      vert(x + w, y + h, 0.5, 0.5, c);
      vert(x, y + h, 0.5, 0.5, c);
    },
    createRadialGradient() {
      return { addColorStop() {} };
    }, // a soft glow is the stage's own to give
    beginPath() {
      paths = [];
      cur = null;
    },
    moveTo(x, y) {
      cur = [[M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]];
      paths.push(cur);
    },
    lineTo(x, y) {
      if (!cur) return X.moveTo(x, y);
      cur.push([M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]);
    },
    closePath() {
      if (cur) cur.push(cur[0].slice());
    },
    rect(x, y, w, h) {
      X.moveTo(x, y);
      X.lineTo(x + w, y);
      X.lineTo(x + w, y + h);
      X.lineTo(x, y + h);
      X.closePath();
    },
    roundRect(x, y, w, h, r = 0) {
      r = typeof r === 'number' ? r : (r[0] ?? 0);
      X.moveTo(x + r, y);
      X.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
      X.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
      X.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
      X.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
      X.closePath();
    },
    arc(x, y, r, a0, a1, ccw) {
      X.ellipse(x, y, r, r, 0, a0, a1, ccw);
    },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
      let d = a1 - a0;
      if (ccw && d > 0) d -= Math.PI * 2;
      if (!ccw && d < 0) d += Math.PI * 2;
      if (Math.abs(a1 - a0) >= Math.PI * 2) d = Math.PI * 2;
      const st = Math.max(8, Math.min(56, Math.ceil(Math.abs(d) * Math.max(rx, ry) * 0.7))),
        co = Math.cos(rot),
        si = Math.sin(rot);
      for (let i = 0; i <= st; i++) {
        const t = a0 + (d * i) / st,
          px = Math.cos(t) * rx,
          py = Math.sin(t) * ry,
          qx = x + px * co - py * si,
          qy = y + px * si + py * co;
        if (i === 0 && !cur) X.moveTo(qx, qy);
        else X.lineTo(qx, qy);
      }
    },
    clip() {},
    fill() {
      if (typeof X.fillStyle !== 'string') return;
      const c = color(X.fillStyle, X.globalAlpha);
      bind(white, sL);
      for (const p of paths) {
        if (p.length < 3) continue;
        let cx0 = 0,
          cy0 = 0;
        for (const q of p) {
          cx0 += q[0];
          cy0 += q[1];
        }
        cx0 /= p.length;
        cy0 /= p.length;
        bind(white, sL);
        for (let i = 0; i < p.length - 1; i++) {
          rawv(cx0, cy0, c);
          rawv(p[i][0], p[i][1], c);
          rawv(p[i + 1][0], p[i + 1][1], c);
        }
      }
    },
    stroke() {
      const c = color(X.strokeStyle, X.globalAlpha),
        w = (X.lineWidth * Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2]))) / 2;
      bind(white, sL);
      for (const p of paths)
        for (let i = 0; i < p.length - 1; i++) {
          bind(white, sL);
          const [a, b] = p[i],
            [e, f] = p[i + 1],
            dx = e - a,
            dy = f - b,
            l = Math.hypot(dx, dy) || 1,
            nx = (-dy / l) * w,
            ny = (dx / l) * w,
            ex = (dx / l) * w * 0.5,
            ey = (dy / l) * w * 0.5;
          rawv(a + nx - ex, b + ny - ey, c);
          rawv(e + nx + ex, f + ny + ey, c);
          rawv(a - nx - ex, b - ny - ey, c);
          rawv(e + nx + ex, f + ny + ey, c);
          rawv(e - nx + ex, f - ny + ey, c);
          rawv(a - nx - ex, b - ny - ey, c);
        }
    },
    measureText(s) {
      probe.font = X.font;
      return probe.measureText(s);
    },
    _text(s, x, y, mode) {
      const style = mode === 'fill' ? X.fillStyle : X.strokeStyle,
        lw = mode === 'fill' ? 0 : X.lineWidth,
        key = `${K}|${X.font}|${mode}|${style}|${lw}|${s}`;
      let T = texts.get(key);
      if (!T) {
        probe.font = X.font;
        const tw = probe.measureText(s).width,
          size = parseFloat(X.font.match(/([\d.]+)px/)?.[1] || 12),
          pad = 4 + lw,
          w = tw + pad * 2,
          h = size * 1.5 + pad * 2,
          cv = document.createElement('canvas');
        cv.width = Math.ceil(w * K);
        cv.height = Math.ceil(h * K);
        const q = cv.getContext('2d');
        q.scale(K, K);
        q.font = X.font;
        q.textAlign = 'left';
        q.textBaseline = 'middle';
        q.lineJoin = 'round';
        q.fillStyle = q.strokeStyle = style;
        q.lineWidth = lw;
        if (mode === 'fill') q.fillText(s, pad, h / 2);
        else q.strokeText(s, pad, h / 2);
        T = { cv, w, h, tw, pad };
        if (texts.size > 240) texts.clear();
        texts.set(key, T);
      }
      const dx = X.textAlign === 'center' ? -T.tw / 2 : X.textAlign === 'right' ? -T.tw : 0,
        sm = X.imageSmoothingEnabled;
      X.imageSmoothingEnabled = true;
      X.drawImage(T.cv, x + dx - T.pad, y - T.h / 2, T.w, T.h);
      X.imageSmoothingEnabled = sm;
    },
    fillText(s, x, y) {
      X._text(s, x, y, 'fill');
    },
    strokeText(s, x, y) {
      X._text(s, x, y, 'stroke');
    },
  };
  return X;
}
/** A car is too much path for a frame: drawn once a wheel's phase by its own code, then a sprite that pitches and rolls. */
function zgCar(cx, kind, x, y, f, wheel, tilt, flip, part) {
  const step = (Math.PI * 2) / 5,
    w = ((wheel % step) + step) % step,
    ph = Math.floor((w / step) * 4),
    k = zg.k,
    key = `${kind}|${f}|${part}|${ph}|${k}`,
    m = (zg.cars ||= new Map());
  let cv = m.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = Math.ceil(320 * k);
    cv.height = Math.ceil(170 * k);
    const q = cv.getContext('2d');
    q.scale(k, k);
    q.translate(160, 140);
    zeCar(q, kind, 0, 0, f, (ph / 4) * step, 0, 0, part);
    m.set(key, cv);
  }
  cx.save();
  cx.translate(x, y);
  cx.scale(f, 1);
  if (flip) {
    cx.translate(0, -50 - Math.sin(flip) * 60);
    cx.rotate(flip);
    cx.translate(0, 50);
  } else if (tilt) {
    const pv = kind === 'focus' ? -58 : -46;
    cx.translate(pv, 0);
    cx.rotate(tilt);
    cx.translate(-pv, 0);
  }
  cx.scale(f, 1);
  cx.drawImage(cv, -160, -140, 320, 170);
  cx.restore();
}
