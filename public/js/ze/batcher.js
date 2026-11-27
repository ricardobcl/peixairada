// ---- the batcher: what the game's own code draws goes straight to the GPU. A canvas handed to WebGL each frame costs 7 ms
// in WebKit whatever its size (a sync with its GPU process), and frames lost; a sprite goes up once.
const ZG_BATCH_VS = `#version 300 es
layout(location=0)in vec2 aP;layout(location=1)in vec2 aU;layout(location=2)in vec4 aC;out vec2 vU;out vec4 vC;
void main(){vec2 c=aP/vec2(720.,900.);gl_Position=vec4(c.x*2.-1.,c.y*2.-1.,0.,1.);vU=aU;vC=aC;}`;

const ZG_BATCH_FS = `#version 300 es
precision highp float;uniform sampler2D uT;in vec2 vU;in vec4 vC;out vec4 o;void main(){o=texture(uT,vU)*vC;}`;

function zgBatch(gl) {
  const program = zgCompile(gl, ZG_BATCH_VS, ZG_BATCH_FS);
  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  const vertices = new Float32Array(8 * 24000);

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 8);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.bindVertexArray(zg.vao);

  const sL = gl.createSampler();
  const sN = gl.createSampler();

  for (const [sm, filter] of [
    [sL, gl.LINEAR],
    [sN, gl.NEAREST],
  ]) {
    gl.samplerParameteri(sm, gl.TEXTURE_MIN_FILTER, filter);
    gl.samplerParameteri(sm, gl.TEXTURE_MAG_FILTER, filter);
    gl.samplerParameteri(sm, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(sm, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  const white = zgTex(gl);

  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

  const texs = new WeakMap();
  const texts = new Map();
  const colors = new Map();
  const probe = document.createElement('canvas').getContext('2d');

  let count = 0;
  let curT = null;
  let curS = null;
  let matrix = [1, 0, 0, 1, 0, 0];
  let stack = [];
  let paths = [];
  let cur = null;
  let scale = 1;

  const flush = () => {
    if (!count) return;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, count * 8), gl.DYNAMIC_DRAW);
    gl.useProgram(program.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, curT);
    gl.bindSampler(0, curS);
    gl.uniform1i(gl.getUniformLocation(program.p, 'uT'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.bindSampler(0, null);
    gl.bindVertexArray(zg.vao);
    count = 0;
  };

  const bind = (texture, sm) => {
    if (texture !== curT || sm !== curS || count > 23900) {
      flush();
      curT = texture;
      curS = sm;
    }
  };

  const vert = (atX, atY, texU, texV, rgba) => {
    const offset = count++ * 8;

    vertices[offset] = matrix[0] * atX + matrix[2] * atY + matrix[4];
    vertices[offset + 1] = matrix[1] * atX + matrix[3] * atY + matrix[5];
    vertices[offset + 2] = texU;
    vertices[offset + 3] = texV;
    vertices[offset + 4] = rgba[0];
    vertices[offset + 5] = rgba[1];
    vertices[offset + 6] = rgba[2];
    vertices[offset + 7] = rgba[3];
  };

  const rawv = (atX, atY, rgba) => {
    const offset = count++ * 8;

    vertices[offset] = atX;
    vertices[offset + 1] = atY;
    vertices[offset + 2] = 0.5;
    vertices[offset + 3] = 0.5;
    vertices[offset + 4] = rgba[0];
    vertices[offset + 5] = rgba[1];
    vertices[offset + 6] = rgba[2];
    vertices[offset + 7] = rgba[3];
  };

  const color = (css, alpha) => {
    let rgba = colors.get(css);

    if (!rgba) {
      probe.fillStyle = '#000';
      probe.fillStyle = css;
      const canonical = probe.fillStyle;
      let match;

      if (canonical[0] === '#') {
        const packed = parseInt(canonical.slice(1), 16);

        rgba = [((packed >> 16) & 255) / 255, ((packed >> 8) & 255) / 255, (packed & 255) / 255, 1];
      } else if ((match = canonical.match(/rgba?\(([^)]+)\)/))) {
        const parts = match[1].split(',').map(Number);

        rgba = [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3] ?? 1];
      } else rgba = [1, 1, 1, 1];
      colors.set(css, rgba);
    }

    const opacity = rgba[3] * alpha;

    return [rgba[0] * opacity, rgba[1] * opacity, rgba[2] * opacity, opacity];
  };

  const texOf = cv => {
    let texture = texs.get(cv);

    if (!texture) {
      texture = zgUp(gl, cv);
      texs.set(cv, texture);
      zg.ups = (zg.ups || 0) + 1;
    }

    return texture;
  };

  const batch = {
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
    begin(frameScale) {
      scale = frameScale;
      count = 0;
      curT = null;
      curS = null;
      matrix = [1, 0, 0, 1, 0, 0];
      stack = [];
      batch.globalAlpha = 1;
      batch.imageSmoothingEnabled = true;
    },
    free() {
      for (const textSprite of texts.values()) zgLetGo(textSprite.cv);
      texts.clear();
    },
    end() {
      flush();
    },
    save() {
      stack.push({
        M: matrix.slice(),
        a: batch.globalAlpha,
        f: batch.fillStyle,
        s: batch.strokeStyle,
        l: batch.lineWidth,
        fo: batch.font,
        al: batch.textAlign,
        ba: batch.textBaseline,
        sm: batch.imageSmoothingEnabled,
      });
    },
    restore() {
      const saved = stack.pop();

      if (!saved) return;
      matrix = saved.M;
      batch.globalAlpha = saved.a;
      batch.fillStyle = saved.f;
      batch.strokeStyle = saved.s;
      batch.lineWidth = saved.l;
      batch.font = saved.fo;
      batch.textAlign = saved.al;
      batch.textBaseline = saved.ba;
      batch.imageSmoothingEnabled = saved.sm;
    },
    translate(byX, byY) {
      matrix[4] += matrix[0] * byX + matrix[2] * byY;
      matrix[5] += matrix[1] * byX + matrix[3] * byY;
    },
    scale(scaleX, scaleY) {
      matrix[0] *= scaleX;
      matrix[1] *= scaleX;
      matrix[2] *= scaleY;
      matrix[3] *= scaleY;
    },
    rotate(angle) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const [m0, m1, m2, m3] = matrix;

      matrix[0] = m0 * cos + m2 * sin;
      matrix[1] = m1 * cos + m3 * sin;
      matrix[2] = m2 * cos - m0 * sin;
      matrix[3] = m3 * cos - m1 * sin;
    },
    drawImage(img, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
      let sx = 0;
      let sy = 0;
      let sw = img.width;
      let sh = img.height;
      let dx = arg1;
      let dy = arg2;
      let dw = arg3 ?? sw;
      let dh = arg4 ?? sh;

      if (arg5 !== undefined) {
        sx = arg1;
        sy = arg2;
        sw = arg3;
        sh = arg4;
        dx = arg5;
        dy = arg6;
        dw = arg7;
        dh = arg8;
      }

      bind(texOf(img), batch.imageSmoothingEnabled ? sL : sN);

      const u0 = sx / img.width;
      const v0 = sy / img.height;
      const u1 = (sx + sw) / img.width;
      const v1 = (sy + sh) / img.height;
      const alpha = batch.globalAlpha;
      const cl = [alpha, alpha, alpha, alpha];

      vert(dx, dy, u0, v0, cl);
      vert(dx + dw, dy, u1, v0, cl);
      vert(dx, dy + dh, u0, v1, cl);
      vert(dx + dw, dy, u1, v0, cl);
      vert(dx + dw, dy + dh, u1, v1, cl);
      vert(dx, dy + dh, u0, v1, cl);
    },
    fillRect(left, top, width, height) {
      if (typeof batch.fillStyle !== 'string') return;
      const rgba = color(batch.fillStyle, batch.globalAlpha);

      bind(white, sL);
      vert(left, top, 0.5, 0.5, rgba);
      vert(left + width, top, 0.5, 0.5, rgba);
      vert(left, top + height, 0.5, 0.5, rgba);
      vert(left + width, top, 0.5, 0.5, rgba);
      vert(left + width, top + height, 0.5, 0.5, rgba);
      vert(left, top + height, 0.5, 0.5, rgba);
    },
    createRadialGradient() {
      return { addColorStop() {} };
    }, // a soft glow is the stage's own to give
    beginPath() {
      paths = [];
      cur = null;
    },
    moveTo(atX, atY) {
      cur = [[matrix[0] * atX + matrix[2] * atY + matrix[4], matrix[1] * atX + matrix[3] * atY + matrix[5]]];
      paths.push(cur);
    },
    lineTo(atX, atY) {
      if (!cur) return batch.moveTo(atX, atY);
      cur.push([matrix[0] * atX + matrix[2] * atY + matrix[4], matrix[1] * atX + matrix[3] * atY + matrix[5]]);
    },
    closePath() {
      if (cur) cur.push(cur[0].slice());
    },
    rect(left, top, width, height) {
      batch.moveTo(left, top);
      batch.lineTo(left + width, top);
      batch.lineTo(left + width, top + height);
      batch.lineTo(left, top + height);
      batch.closePath();
    },
    roundRect(left, top, width, height, radius = 0) {
      radius = typeof radius === 'number' ? radius : (radius[0] ?? 0);
      batch.moveTo(left + radius, top);
      batch.arc(left + width - radius, top + radius, radius, -Math.PI / 2, 0);
      batch.arc(left + width - radius, top + height - radius, radius, 0, Math.PI / 2);
      batch.arc(left + radius, top + height - radius, radius, Math.PI / 2, Math.PI);
      batch.arc(left + radius, top + radius, radius, Math.PI, Math.PI * 1.5);
      batch.closePath();
    },
    arc(centerX, centerY, radius, a0, a1, ccw) {
      batch.ellipse(centerX, centerY, radius, radius, 0, a0, a1, ccw);
    },
    ellipse(centerX, centerY, rx, ry, rot, a0, a1, ccw) {
      let sweep = a1 - a0;

      if (ccw && sweep > 0) sweep -= Math.PI * 2;
      if (!ccw && sweep < 0) sweep += Math.PI * 2;
      if (Math.abs(a1 - a0) >= Math.PI * 2) sweep = Math.PI * 2;

      const st = Math.max(8, Math.min(56, Math.ceil(Math.abs(sweep) * Math.max(rx, ry) * 0.7)));
      const co = Math.cos(rot);
      const si = Math.sin(rot);

      for (let step = 0; step <= st; step++) {
        const angle = a0 + (sweep * step) / st;
        const px = Math.cos(angle) * rx;
        const py = Math.sin(angle) * ry;
        const qx = centerX + px * co - py * si;
        const qy = centerY + px * si + py * co;

        if (step === 0 && !cur) batch.moveTo(qx, qy);
        else batch.lineTo(qx, qy);
      }
    },
    clip() {},
    fill() {
      if (typeof batch.fillStyle !== 'string') return;
      const rgba = color(batch.fillStyle, batch.globalAlpha);

      bind(white, sL);

      for (const path of paths) {
        if (path.length < 3) continue;

        let cx0 = 0;
        let cy0 = 0;

        for (const point of path) {
          cx0 += point[0];
          cy0 += point[1];
        }

        cx0 /= path.length;
        cy0 /= path.length;
        bind(white, sL);

        for (let index = 0; index < path.length - 1; index++) {
          rawv(cx0, cy0, rgba);
          rawv(path[index][0], path[index][1], rgba);
          rawv(path[index + 1][0], path[index + 1][1], rgba);
        }
      }
    },
    stroke() {
      const rgba = color(batch.strokeStyle, batch.globalAlpha);
      const halfWidth = (batch.lineWidth * Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]))) / 2;

      bind(white, sL);

      for (const path of paths) {
        for (let index = 0; index < path.length - 1; index++) {
          bind(white, sL);

          const [fromX, fromY] = path[index];
          const [toX, toY] = path[index + 1];
          const dx = toX - fromX;
          const dy = toY - fromY;
          const length = Math.hypot(dx, dy) || 1;
          const nx = (-dy / length) * halfWidth;
          const ny = (dx / length) * halfWidth;
          const ex = (dx / length) * halfWidth * 0.5;
          const ey = (dy / length) * halfWidth * 0.5;

          rawv(fromX + nx - ex, fromY + ny - ey, rgba);
          rawv(toX + nx + ex, toY + ny + ey, rgba);
          rawv(fromX - nx - ex, fromY - ny - ey, rgba);
          rawv(toX + nx + ex, toY + ny + ey, rgba);
          rawv(toX - nx + ex, toY - ny + ey, rgba);
          rawv(fromX - nx - ex, fromY - ny - ey, rgba);
        }
      }
    },
    measureText(text) {
      probe.font = batch.font;
      return probe.measureText(text);
    },
    _text(text, atX, atY, mode) {
      const style = mode === 'fill' ? batch.fillStyle : batch.strokeStyle;
      const lw = mode === 'fill' ? 0 : batch.lineWidth;
      const key = `${scale}|${batch.font}|${mode}|${style}|${lw}|${text}`;

      let textSprite = texts.get(key);

      if (!textSprite) {
        probe.font = batch.font;

        const tw = probe.measureText(text).width;
        const size = parseFloat(batch.font.match(/([\d.]+)px/)?.[1] || 12);
        const pad = 4 + lw;
        const width = tw + pad * 2;
        const height = size * 1.5 + pad * 2;
        const cv = document.createElement('canvas');

        cv.width = Math.ceil(width * scale);
        cv.height = Math.ceil(height * scale);
        const context = cv.getContext('2d');

        context.scale(scale, scale);
        context.font = batch.font;
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.lineJoin = 'round';
        context.fillStyle = context.strokeStyle = style;
        context.lineWidth = lw;
        if (mode === 'fill') context.fillText(text, pad, height / 2);
        else context.strokeText(text, pad, height / 2);
        textSprite = { cv, w: width, h: height, tw, pad };
        if (texts.size > 240) texts.clear();
        texts.set(key, textSprite);
      }

      const dx = batch.textAlign === 'center' ? -textSprite.tw / 2 : batch.textAlign === 'right' ? -textSprite.tw : 0;
      const sm = batch.imageSmoothingEnabled;

      batch.imageSmoothingEnabled = true;
      batch.drawImage(textSprite.cv, atX + dx - textSprite.pad, atY - textSprite.h / 2, textSprite.w, textSprite.h);
      batch.imageSmoothingEnabled = sm;
    },
    fillText(text, atX, atY) {
      batch._text(text, atX, atY, 'fill');
    },
    strokeText(text, atX, atY) {
      batch._text(text, atX, atY, 'stroke');
    },
  };

  return batch;
}

/** A car is too much path for a frame: drawn once a wheel's phase by its own code, then a sprite that pitches and rolls. */
function zgCar(cx, kind, atX, atY, facing, wheel, tilt, flip, part) {
  const step = (Math.PI * 2) / 5;
  const turn = ((wheel % step) + step) % step;
  const ph = Math.floor((turn / step) * 4);
  const scale = zg.k;
  const key = `${kind}|${facing}|${part}|${ph}|${scale}`;
  const cars = (zg.cars ||= new Map());

  let cv = cars.get(key);

  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = Math.ceil(320 * scale);
    cv.height = Math.ceil(170 * scale);
    const context = cv.getContext('2d');

    context.scale(scale, scale);
    context.translate(160, 140);
    zeCar(context, kind, 0, 0, facing, (ph / 4) * step, 0, 0, part);
    cars.set(key, cv);
  }

  cx.save();
  cx.translate(atX, atY);
  cx.scale(facing, 1);

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

  cx.scale(facing, 1);
  cx.drawImage(cv, -160, -140, 320, 170);
  cx.restore();
}
