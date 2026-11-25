  // ---- the stage: Zé's game on the GPU (2026-11-01, the HD-2D round) ------------------------------------------------
  // The same round on a lit set. What the game draws is cut in three: the set, painted and baked once a sky; the actors, its
  // own 2D drawing code on an object shaped like a 2D context (zgBatch); the UI, the top canvas, never post-processed.
  // WebGL2, made when the dialog opens and let go when it closes; none, or a context lost, and the game is its 2D canvas.
  const ZE_WATER = 762, ZE_BANK = 826, ZE_TERRACE = 832, ZE_HORIZ = 748;
  const zg = ze.stage = { gl: null, off: false, P: null, scenes: new Map(), sky: -1, was: null, T: 0, frames: 0 };
  const ZG_HEAD = `#version 300 es
precision highp float;
vec2 cuv(vec2 p){return p/vec2(720.,900.);}
vec2 fuv(vec2 p){return vec2(p.x/720.,1.-p.y/900.);}
vec3 lin(vec3 c){return pow(max(c,vec3(0.)),vec3(2.2));}
in vec2 vP; out vec4 o;
`;
  const ZG_VS = `#version 300 es
uniform vec4 uRect; out vec2 vP;
void main(){vec2 q=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1));vP=uRect.xy+q*uRect.zw;vec2 c=vP/vec2(720.,900.);gl_Position=vec4(c.x*2.-1.,1.-c.y*2.,0.,1.);}`;
  const ZG_FS = {
    layer: `uniform sampler2D uT;uniform float uA;uniform vec2 uShift;
void main(){o=texture(uT,fuv(vP-uShift))*uA;}`,
    canvas: `uniform sampler2D uT;
void main(){vec4 a=texture(uT,cuv(vP));o=a.a>.002?vec4(lin(a.rgb/a.a)*a.a,a.a):vec4(0.);}`,
    tint: `uniform vec4 uC;uniform vec2 uFade;
void main(){o=uC*(1.-smoothstep(uFade.x,uFade.y,vP.y));}`,
    bake: `uniform sampler2D uA,uE;uniform vec3 uAmb,uRimC,uHaze;uniform float uEm,uUseE,uHazeA;uniform vec2 uRimD;
void main(){vec2 uv=cuv(vP);vec4 a=texture(uA,uv);vec3 e=uUseE>.5?lin(texture(uE,uv).rgb)*uEm:vec3(0.);
if(a.a<.002){o=vec4(e,dot(e,vec3(.33)));return;}
vec3 alb=lin(a.rgb/a.a);vec3 c=alb*uAmb;
float ahead=texture(uA,cuv(vP+uRimD*2.5)).a;float rim=clamp(a.a-ahead,0.,1.);c+=(alb*.6+.4)*uRimC*rim;
c=mix(c,uHaze,uHazeA);c+=e;o=vec4(c*a.a,a.a);}`,
    disc: `uniform sampler2D uT;uniform float uR,uB;
void main(){vec4 s=vec4(0.);float w=0.;for(int i=0;i<48;i++){float a=float(i)*2.39996;float r=sqrt(float(i)+.5)/6.93*uR;vec4 c=texture(uT,fuv(vP+vec2(cos(a),sin(a))*r));float b=1.+dot(c.rgb,vec3(.3,.6,.1))*uB;s+=c*b;w+=b;}o=s/w;}`,
    rays: `uniform sampler2D uT;uniform vec2 uC;uniform float uThr;
void main(){vec3 s=vec3(0.);vec2 d=(uC-vP)/44.;vec2 p=vP;float w=1.;for(int i=0;i<44;i++){vec3 c=texture(uT,fuv(p)).rgb;float l=max(dot(c,vec3(.3,.6,.1))-uThr,0.);s+=c*l*w;w*=.965;p+=d;}o=vec4(s/44.,1.);}`,
    river: `uniform sampler2D uC,uN;uniform float uT,uWet,uA,uSunX,uSunS;uniform vec3 uWater,uSunC;
void main(){float t=clamp((vP.y-${ZE_WATER}.)/(${ZE_BANK - ZE_WATER}.),0.,1.);
vec2 q=vec2(vP.x/(90.+t*170.),(vP.y-${ZE_WATER}.)/(7.+t*20.));
float n1=texture(uN,q*.5+vec2(uT*.012,uT*.05)).r-.5;float n2=texture(uN,q*vec2(1.3,1.)+vec2(-uT*.02,uT*.085)).g-.5;float n=n1+.6*n2;
float amp=mix(2.5,17.,t)*(1.+uWet);
vec2 rp=vec2(vP.x+n*amp,${ZE_WATER}.-(vP.y-${ZE_WATER}.)*1.25-abs(n)*amp*.5);
vec3 r=textureLod(uC,fuv(rp),mix(.6,2.4,t)).rgb;
vec3 c=mix(r*.82,uWater,mix(.16,.58,t));
float n3=texture(uN,vec2(vP.x/42.+n*.7,vP.y/4.4)+vec2(uT*.015,uT*.2)).b*.55+texture(uN,vec2(vP.x/15.-n*.5,vP.y/2.6)-vec2(uT*.02,uT*.1)).g*.45;
float col=exp(-pow((vP.x-uSunX)/mix(34.,92.,t),2.));float gl=smoothstep(.5,.62,n3)*col;c+=uSunC*gl*uSunS;
float gl2=smoothstep(.70,.86,texture(uN,vec2(vP.x/18.,vP.y/4.)-vec2(uT*.02,uT*.12)).g);c+=lin(vec3(.9))*gl2*.05;
c*=.78+.22*smoothstep(0.,5.,vP.y-${ZE_WATER}.);
o=vec4(c,1.)*uA;}`,
    clouds: `uniform sampler2D uN;uniform float uT,uCover,uA,uTop;uniform vec3 uDark,uLit;uniform vec2 uSunP;
void main(){vec2 p=vP;float h=p.y/760.;
float n=texture(uN,vec2(p.x/1300.+uT*.003,p.y/300.),1.).r*.7+texture(uN,vec2(p.x/560.-uT*.005,p.y/130.+.3),1.5).g*.3;
float a=smoothstep(uCover,uCover+.2,n);float thick=smoothstep(uCover+.04,uCover+.36,n);
float d=length((p-uSunP)/vec2(560.,340.));float glow=exp(-d*d*1.5);
vec3 c=mix(uLit,uDark,thick*.86);c+=uLit*glow*(1.-thick*.7)*.9;
a*=uA*(uTop+(1.-uTop)*smoothstep(.2,.85,h))*(1.-smoothstep(.9,1.,h)*.7);o=vec4(c*a,a);}`,
    fog: `uniform sampler2D uN;uniform float uT,uA,uY0,uY1;uniform vec3 uC;
void main(){float y=(vP.y-uY0)/(uY1-uY0);float band=smoothstep(0.,.35,y)*smoothstep(1.,.55,y);
float n=texture(uN,vec2(vP.x/520.+uT*.008,vP.y/120.)).r*.65+texture(uN,vec2(vP.x/230.-uT*.012,vP.y/60.+uT*.004)).g*.35;
float a=band*smoothstep(.28,.72,n)*uA;o=vec4(uC*a,a);}`,
    alpha: `uniform sampler2D uT;
void main(){float s=0.;for(int i=0;i<16;i++){float a=float(i)*2.39996;float r=sqrt(float(i)+.5)/4.*7.;s+=texture(uT,cuv(vP+vec2(cos(a),sin(a))*r)).a;}o=vec4(s/16.);}`,
    lit: `uniform sampler2D uA,uH,uE,uD;uniform vec3 uAmbS,uAmbG,uKey,uKeyC;uniform vec2 uDropD;uniform float uRim,uBev,uUseE,uEm,uSpec,uKeep,uEdge,uDrop;
uniform vec4 uLp[12];uniform vec4 uLc[12];uniform int uLn;
void main(){vec2 uv=cuv(vP);vec4 a=texture(uA,uv);vec3 e=uUseE>.5?lin(texture(uE,uv).rgb)*uEm:vec3(0.);
if(a.a<.004){o=vec4(0.);return;}
vec3 alb=lin(a.rgb/a.a);vec3 sp=vec3(0.);
float d=5.;float hl=texture(uH,fuv(vP-vec2(d,0.))).r,hr=texture(uH,fuv(vP+vec2(d,0.))).r,hu=texture(uH,fuv(vP-vec2(0.,d))).r,hd=texture(uH,fuv(vP+vec2(0.,d))).r;
vec3 N=normalize(vec3((hl-hr)*uBev,(hu-hd)*uBev,1.));
vec3 l=mix(uAmbG,uAmbS,.5-.5*N.y);
l+=uKeyC*max(dot(N,uKey),0.);vec3 V=vec3(0.,0.,1.);sp+=uKeyC*pow(max(dot(N,normalize(uKey+V)),0.),18.)*uSpec*.5*smoothstep(.0,.18,1.-N.z);sp+=uAmbS*(1.-N.z)*(1.-N.z)*uSpec*.34;
vec2 kd=normalize(uKey.xy+vec2(1e-4));l+=uKeyC*uRim*(1.-N.z)*max(dot(normalize(N.xy+vec2(1e-4)),kd),0.);
for(int i=0;i<uLn;i++){vec3 d3=vec3(uLp[i].xy-vP,uLp[i].z);float r2=dot(d3,d3);float R=uLp[i].w;float at=1./(1.+r2/(R*R*.28));at*=smoothstep(R*R*5.,R*R*.4,r2);vec3 Ld=d3/sqrt(r2);l+=uLc[i].rgb*at*max(dot(N,Ld),0.)*1.6;sp+=uLc[i].rgb*at*pow(max(dot(N,normalize(Ld+V)),0.),30.)*uSpec*1.4*smoothstep(.0,.18,1.-N.z);}
if(uDrop>0.){float s=texture(uD,fuv(vP+uDropD)).r;l*=1.-s*uDrop;}
l=mix(l,max(l,vec3(1.)),uKeep);if(uEdge>0.){float h0=texture(uH,fuv(vP)).r;l*=mix(1.-uEdge,1.,smoothstep(.12,.5,h0));}
o=vec4((alb*l+alb*e*1.6+sp)*a.a,a.a);}`,
    floor: `uniform sampler2D uTile,uM,uN,uA,uH;uniform vec3 uAmbS,uKs;uniform float uT,uWet,uRefl;
uniform vec4 uLp[12];uniform vec4 uLc[12];uniform int uLn;uniform vec3 uBl[16];uniform int uBn;
void main(){float y=vP.y,x=vP.x;float h=max(y-${ZE_HORIZ}.,1.);
float X=(x-360.)*3.17/h;float Z=285./h;vec2 uv=vec2(X*.56,Z*2.3);
float near=smoothstep(860.,900.,y);vec3 alb=lin(texture(uTile,uv,near*1.6).rgb);
vec2 id=floor(uv*2.);float hs=fract(sin(dot(id,vec2(41.3,17.7)))*4375.);alb*=.9+.14*hs;
float dz=y-${ZE_FLOOR}.;float fz=dz*2.6;vec3 l=uAmbS*.62;
for(int i=0;i<uLn;i++){vec3 d3=vec3(uLp[i].x-x,${ZE_FLOOR}.-uLp[i].y,uLp[i].z-fz);float r2=dot(d3,d3);float R=uLp[i].w;float at=1./(1.+r2/(R*R*.4));at*=smoothstep(R*R*7.,R*R*.3,r2);l+=uLc[i].rgb*at*max(d3.y/sqrt(r2)+.25,0.)*1.5;}
float sh=0.;
if(dz>0.){vec2 sp=vec2(x-dz*uKs.x,${ZE_FLOOR}.-dz*uKs.y);if(uKs.y>0.&&sp.y>0.){float s0=texture(uA,cuv(sp)).a;float s1=texture(uH,fuv(sp)).r;float k=smoothstep(4.,44.,dz);sh=mix(s0,s1*1.2,k)*uKs.z*(1.-.45*k);}}
for(int i=0;i<uLn;i++){if(uLc[i].a<.5)continue;float H=${ZE_FLOOR}.-uLp[i].y;if(H<8.)continue;float lz=uLp[i].z;if(lz>=0.&&dz>0.)continue;if(lz<0.&&dz<-2.)continue;float f=abs(dz)/max(abs(lz)*.22,8.);vec2 sp=vec2(x-(x-uLp[i].x)*f*.55,${ZE_FLOOR}.-f*H*.8);if(sp.y<0.)continue;float s1=texture(uH,fuv(sp)).r;float at=max(uLc[i].r,uLc[i].g)*smoothstep(0.,.35,1./(1.+pow(length(vec2(x-uLp[i].x,fz-lz))/uLp[i].w,2.)));sh=max(sh,s1*1.05*at*.42);}
for(int i=0;i<uBn;i++){vec2 d=vec2((x-uBl[i].x)/uBl[i].y,(y-${ZE_FLOOR + 3}.)/(uBl[i].y*.26));float q=1.-dot(d,d);if(q>0.)sh=max(sh,q*uBl[i].z);}
sh=clamp(sh,0.,.8);
vec3 c=alb*l*(1.-sh);c*=mix(1.,.62,smoothstep(846.,900.,y));
float aoback=1.-.45*smoothstep(${ZE_TERRACE + 7}.,${ZE_TERRACE}.,y);c*=aoback;
float ao=0.;if(y>=${ZE_FLOOR}.){float a1=smoothstep(14.,0.,y-${ZE_FLOOR}.);if(x>466.&&x<676.)ao=a1;else if(x>58.&&x<162.)ao=a1;}c*=1.-.42*ao;
vec2 w=vec2(0.);if(uWet>.5){w=vec2(texture(uN,vec2(x/40.,y/9.)+vec2(0.,uT*.3)).r-.5,0.)*10.;}
float ry=${ZE_FLOOR}.-(y-${ZE_FLOOR}.)*1.15;if(y<${ZE_FLOOR}.)ry=${ZE_FLOOR}.+(${ZE_FLOOR}.-y)*.2;
vec3 r=textureLod(uM,fuv(vec2(x,ry)+w),.8+near*2.).rgb;float fres=mix(.8,.28,smoothstep(${ZE_TERRACE}.,900.,y));c=mix(c,c*.72+r*.9,uRefl*fres);
o=vec4(c,1.);}`,
    down: `uniform sampler2D uT;uniform vec2 uPx;uniform float uThr;
void main(){vec2 p=gl_FragCoord.xy*uPx;vec3 c=texture(uT,p).rgb*4.;c+=texture(uT,p+vec2(uPx.x,uPx.y)).rgb+texture(uT,p+vec2(-uPx.x,uPx.y)).rgb+texture(uT,p+vec2(uPx.x,-uPx.y)).rgb+texture(uT,p-uPx).rgb;c/=8.;
if(uThr>0.){float b=max(c.r,max(c.g,c.b));float k=max(b-uThr,0.);k=k*k/(k+.5);c*=k/max(b,1e-4);}o=vec4(min(c,vec3(30.)),1.);}`,
    up: `uniform sampler2D uT;uniform vec2 uPx;
void main(){vec2 p=gl_FragCoord.xy*uPx;vec3 c=vec3(0.);c+=texture(uT,p+vec2(-uPx.x*2.,0.)).rgb+texture(uT,p+vec2(uPx.x*2.,0.)).rgb+texture(uT,p+vec2(0.,-uPx.y*2.)).rgb+texture(uT,p+vec2(0.,uPx.y*2.)).rgb;c+=(texture(uT,p+vec2(-uPx.x,uPx.y)).rgb+texture(uT,p+vec2(uPx.x,uPx.y)).rgb+texture(uT,p+vec2(uPx.x,-uPx.y)).rgb+texture(uT,p+vec2(-uPx.x,-uPx.y)).rgb)*2.;o=vec4(c/12.,1.);}`,
    final: `uniform sampler2D uS,uB,uR,uA;uniform mat3 uCam;uniform float uFlash,uBloom,uRays,uT,uVig,uSat,uKo;uniform vec2 uKoP;uniform vec3 uFlashC,uLift,uGain;
void main(){vec2 p=(uCam*vec3(vP,1.)).xy;vec3 c=texture(uS,fuv(p)).rgb;
float m=1.-.8*texture(uA,cuv(p)).a;
c+=texture(uB,fuv(p)).rgb*uBloom*m;
if(uRays>0.)c+=texture(uR,fuv(p)).rgb*uRays*(.86+.14*sin(uT*.5+p.x*.012))*m;
c+=uFlashC*uFlash;
c=c*uGain+uLift;float g=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(g),c,uSat);
vec2 q=(vP-vec2(360.,450.))/vec2(360.,450.);c*=1.-uVig*smoothstep(.55,1.45,length(q));
if(uKo>0.){vec2 kq=(p-uKoP)/vec2(1.,1.25);c*=1.-uKo*.82*smoothstep(90.,360.,length(kq));}
c=mix(c,vec3(1.)-(vec3(1.)-vec3(.8))*exp(-(c-vec3(.8))/.2),step(.8,c));
c=pow(max(c,vec3(0.)),vec3(1./2.2));
float d=fract(sin(dot(gl_FragCoord.xy,vec2(12.98,78.23))+uT)*43758.5)-.5;c+=d/255.;
o=vec4(c,1.);}`,
  };
  const ZG_PT_VS = `#version 300 es
layout(location=0)in vec2 aP;layout(location=1)in vec4 aC;layout(location=2)in vec2 aS;uniform float uK;out vec4 vC;out float vSoft;
void main(){vec2 c=aP/vec2(720.,900.);gl_Position=vec4(c.x*2.-1.,1.-c.y*2.,0.,1.);gl_PointSize=aS.x*uK;vC=aC;vSoft=aS.y;}`;
  const ZG_PT_FS = `#version 300 es
precision highp float;in vec4 vC;in float vSoft;out vec4 o;
void main(){vec2 d=gl_PointCoord*2.-1.;float r=dot(d,d);float a=vSoft<.5?1.:smoothstep(1.,.0,r);o=vec4(vC.rgb*a*vC.a,vSoft>0.?0.:a*vC.a);}`;
  function zgCompile(gl, vs, fs) {
    const mk = (t, s) => { const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return { p, u: new Map() };
  }
  /** The stage up or not. Made on the first frame of an opening; what cannot be made is the 2D canvas until the dialog is opened again. */
  function zgOn() {
    if (zg.off) return false;
    if (zg.gl) return true;
    const cv = document.createElement('canvas'); cv.id = 'zeGL'; cv.setAttribute('aria-hidden', 'true');
    const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) { zg.off = true; return false; }
    try {
      zg.hdr = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
      zg.fmt = zg.hdr ? [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT] : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
      zgKeep(gl); zg.gl = gl; zg.P = {}; for (const k of Object.keys(ZG_FS)) zg.P[k] = zgCompile(gl, ZG_VS, ZG_HEAD + ZG_FS[k]);
      zg.Pt = zgCompile(gl, ZG_PT_VS, ZG_PT_FS); zg.pts = new Float32Array(8 * 4000); zg.ptVao = gl.createVertexArray(); zg.ptBuf = gl.createBuffer(); gl.bindVertexArray(zg.ptVao); gl.bindBuffer(gl.ARRAY_BUFFER, zg.ptBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 8); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
      zg.vao = gl.createVertexArray(); gl.bindVertexArray(zg.vao);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      zg.ax = zgBatch(gl); zg.noise = zgNoise(gl); zg.tile = zgTile(gl);
    } catch (e) { console.error('Zé: no stage', e); zg.gl = null; zg.off = true; return false; }
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); if (zg.gl !== gl) return; zgFree(); zg.off = true; const c = $('#zeCanvas'); c.getContext('2d').setTransform(1, 0, 0, 1, 0, 0); if ($('#zeGame').open && !ze.raf) zeDraw(); });
    $('#zeStack').prepend(cv);
    return true;
  }
  /** What the context makes, kept to delete by hand: WebKit's lost context holds on to its textures until a collection, 200 MB an opening. */
  function zgKeep(gl) {
    const made = zg.made = [];
    for (const [mk, del] of [['createTexture', 'deleteTexture'], ['createFramebuffer', 'deleteFramebuffer'], ['createBuffer', 'deleteBuffer'], ['createVertexArray', 'deleteVertexArray'], ['createProgram', 'deleteProgram'], ['createSampler', 'deleteSampler']]) {
      const f = gl[mk].bind(gl); gl[mk] = () => { const o = f(); made.push(del, o); return o; };
    }
  }
  /** A canvas done with, its pixels let go now: WebKit keeps a dropped one's until a collection, and a page with little script rarely has one. */
  const zgLetGo = (...cs) => { for (const c of cs) if (c) c.width = c.height = 0; };
  /** All of it let go with the dialog: the context, so its memory with it — the next opening starts clean. */
  function zgFree() {
    const gl = zg.gl; zg.off = false;
    if (gl) {
      const cv = gl.canvas, m = zg.made;
      gl.useProgram(null); gl.bindVertexArray(null); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
      for (let u = 0; u < 8; u++) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, null); gl.bindSampler(u, null); }
      for (let i = 0; i < m.length; i += 2) gl[m[i]](m[i + 1]);
      cv.width = cv.height = 1; gl.getExtension('WEBGL_lose_context')?.loseContext(); cv.remove();
    }
    zg.ax?.free(); if (zg.cars) zgLetGo(...zg.cars.values()); zgLetGo(zg.town?.c, zg.town?.e, zg.bridge?.c, zg.bridge?.e);
    Object.assign(zg, { gl: null, P: null, ax: null, sky: -1, was: null, fS: null, fA: null, fC: null, fM: null, fH: null, fB: null, set: null, cars: null, town: null, bridge: null, made: null, baked: false, dust: null, dustK: null, splash: null, frames: 0 }); zg.scenes.clear();
    $('#zeCanvas').getContext('2d').setTransform(1, 0, 0, 1, 0, 0); $('#zeCanvas').getContext('2d').clearRect(0, 0, 1e4, 1e4);
  }
  function zgTex(gl, filt = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap); return t;
  }
  function zgFbo(gl, w, h, fmt = zg.fmt, mips = false) {
    const t = zgTex(gl, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    if (mips) gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(w, h))) + 1, fmt[0], w, h);
    else gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], w, h, 0, fmt[1], fmt[2], null);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f, w, h };
  }
  const zgDrop = (gl, b) => { if (b) { gl.deleteTexture(b.t); gl.deleteFramebuffer(b.f); } };
  const zgUp = (gl, cv) => { const t = zgTex(gl); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv); return t; };
  /** Tiling noise in three channels. */
  function zgNoise(gl) {
    const N = 256, d = new Uint8Array(N * N * 4), r = (x, y, s, c) => { const f = v => Math.abs(Math.sin(v * 127.1 + c * 11.3) * 43758.5453) % 1; return f(((x % s + s) % s) + ((y % s + s) % s) * 57.3 + s); };
    const n = (x, y, s, c) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (r(ix, iy, s, c) * (1 - u) + r(ix + 1, iy, s, c) * u) * (1 - v) + (r(ix, iy + 1, s, c) * (1 - u) + r(ix + 1, iy + 1, s, c) * u) * v; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let c = 0; c < 3; c++) {
      let a = 0, w = .5, s = 8; for (let o = 0; o < 5; o++) { a += n(x / N * s, y / N * s, s, c) * w; w *= .5; s *= 2; }
      d[(y * N + x) * 4 + c] = Math.min(255, a * 255 * 1.05);
    }
    const t = zgTex(gl, gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, d); gl.generateMipmap(gl.TEXTURE_2D); return t;
  }
  /** The azulejo, one tile: the game's own rosette and diamond, mipmapped for the floor's distance. */
  function zgTile(gl) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), s = 128 / 29;
    x.scale(s, s); x.fillStyle = '#ece6f4'; x.fillRect(0, 0, 29, 29); x.fillStyle = '#2b4fa8';
    for (const [a, b] of [[0, 0], [29, 0], [0, 29], [29, 29]]) { x.beginPath(); x.arc(a, b, 8, 0, Math.PI * 2); x.fill(); }
    x.beginPath(); x.moveTo(14.5, 8); x.lineTo(21, 14.5); x.lineTo(14.5, 21); x.lineTo(8, 14.5); x.fill();
    x.fillStyle = 'rgba(30, 20, 50, .35)'; x.fillRect(0, 0, 29, .5); x.fillRect(0, 0, .5, 29);
    const t = zgTex(gl, gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D); zgLetGo(c); return t;
  }
  function zgUse(P, rect, vals = {}, texs = {}) {
    const gl = zg.gl; gl.useProgram(P.p);
    const U = n => { if (!P.u.has(n)) P.u.set(n, gl.getUniformLocation(P.p, n)); return P.u.get(n); };
    gl.uniform4f(U('uRect'), rect[0], rect[1], rect[2], rect[3]);
    let i = 0; for (const n in texs) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, texs[n]); gl.uniform1i(U(n), i); i++; }
    for (const n in vals) {
      const v = vals[n], u = U(n); if (u == null) continue;
      if (typeof v === 'number') gl.uniform1f(u, v);
      else if (v.int !== undefined) gl.uniform1i(u, v.int);
      else if (v.v4) gl.uniform4fv(u, v.v4);
      else if (v.v3) gl.uniform3fv(u, v.v3);
      else if (v.m3) gl.uniformMatrix3fv(u, false, v.m3);
      else if (v.length === 2) gl.uniform2f(u, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(u, v[0], v[1], v[2]);
      else if (v.length === 4) gl.uniform4f(u, v[0], v[1], v[2], v[3]);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  const ZG_FULL = [0, 0, ZE_W, ZE_H];
  function zgBind(b) { const gl = zg.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, b ? b.f : null); gl.viewport(0, 0, b ? b.w : gl.canvas.width, b ? b.h : gl.canvas.height); }

