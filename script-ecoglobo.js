(()=>{

// ==== DOM ====
const $ = (id)=>document.getElementById(id);
const canvas = $('stage');
const useData = $('useData');
const scoreEl = $('score');
const noiseEl = $('noise');
const detailEl= $('detail');
const btnSq = $('btnSquare');
const btnRd = $('btnRound');
const btnReset = $('btnReset');

// ==== dados salvos ====
function getSaved(){
  let pct = 75, noise = 52;
  try{
    const last = JSON.parse(localStorage.getItem("eco:lastScore")||"null");
    if (last && typeof last.pct === 'number') pct = last.pct;
  }catch{}
  const n = parseFloat(localStorage.getItem("eco:lastNoise")||"NaN");
  if (Number.isFinite(n)) noise = n;
  return {pct, noise};
}
const saved = getSaved();
scoreEl.value = saved.pct;
noiseEl.value = Math.min(80, Math.max(40, Math.round(saved.noise||52)));

// ==== WebGL ====
const gl = canvas.getContext('webgl', {antialias:true, alpha:true, preserveDrawingBuffer:true});
if(!gl){ alert("WebGL desativado no navegador :/"); return; }

function resize(){
  const size = Math.min(canvas.parentElement.clientWidth, 720);
  canvas.width = size; canvas.height = size;
  gl.viewport(0,0,gl.drawingBufferWidth, gl.drawingBufferHeight);
}
resize(); addEventListener('resize', resize);

// compila
function compile(src, type){
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}
const vs = compile(document.getElementById('vs').textContent, gl.VERTEX_SHADER);
const fs = compile(document.getElementById('fs').textContent, gl.FRAGMENT_SHADER);
const prog = gl.createProgram();
gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link fail');
gl.useProgram(prog);

const loc = {
  aPos : gl.getAttribLocation(prog,'aPos'),
  aNormal: gl.getAttribLocation(prog,'aNormal'),
  aUV  : gl.getAttribLocation(prog,'aUV'),
  uMVP : gl.getUniformLocation(prog,'uMVP'),
  uModel: gl.getUniformLocation(prog,'uModel'),
  uTime: gl.getUniformLocation(prog,'uTime'),
  uNoiseAmt: gl.getUniformLocation(prog,'uNoiseAmt'),
  uLightDir: gl.getUniformLocation(prog,'uLightDir'),
  uBase: gl.getUniformLocation(prog,'uBase'),
  uAcc : gl.getUniformLocation(prog,'uAcc'),
};

gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);

// ====== esfera ======
function buildSphere(segments=32){
  const pos=[], nor=[], uv=[], idx=[];
  for(let y=0;y<=segments;y++){
    const v = y/segments, th = v*Math.PI;
    for(let x=0;x<=segments;x++){
      const u = x/segments, ph = u*2*Math.PI;
      const sx = Math.sin(th)*Math.cos(ph);
      const sy = Math.cos(th);
      const sz = Math.sin(th)*Math.sin(ph);
      pos.push(sx,sy,sz); nor.push(sx,sy,sz); uv.push(u,v);
    }
  }
  for(let y=0;y<segments;y++){
    for(let x=0;x<segments;x++){
      const i = y*(segments+1)+x;
      idx.push(i, i+1, i+segments+1, i+1, i+segments+2, i+segments+1);
    }
  }
  return {
    pos:new Float32Array(pos),
    nor:new Float32Array(nor),
    uv:new Float32Array(uv),
    idx:new Uint16Array(idx)
  };
}

let mesh = uploadSphere(parseInt(detailEl.value,10));
detailEl.onchange = ()=>{ mesh = uploadSphere(parseInt(detailEl.value,10)); };

function uploadSphere(seg){
  const g = buildSphere(seg);
  const vboPos = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vboPos);
  gl.bufferData(gl.ARRAY_BUFFER, g.pos, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(loc.aPos); gl.vertexAttribPointer(loc.aPos,3,gl.FLOAT,false,0,0);

  const vboNor = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vboNor);
  gl.bufferData(gl.ARRAY_BUFFER, g.nor, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(loc.aNormal); gl.vertexAttribPointer(loc.aNormal,3,gl.FLOAT,false,0,0);

  const vboUV = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vboUV);
  gl.bufferData(gl.ARRAY_BUFFER, g.uv, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(loc.aUV); gl.vertexAttribPointer(loc.aUV,2,gl.FLOAT,false,0,0);

  const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW);
  return {ibo, count:g.idx.length};
}

// ====== math COLUNA-major (OpenGL) ======
function mat4Identity(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function mat4Mul(a,b){
  // C = A*B (col-major)
  const c=new Float32Array(16);
  for(let i=0;i<4;i++){
    for(let j=0;j<4;j++){
      c[j*4+i]=a[0*4+i]*b[j*4+0]+a[1*4+i]*b[j*4+1]+a[2*4+i]*b[j*4+2]+a[3*4+i]*b[j*4+3];
    }
  }
  return c;
}
function mat4Translate(v){
  const [x,y,z]=v;
  const m=mat4Identity();
  m[12]=x; m[13]=y; m[14]=z; // col-major
  return m;
}
function mat4RotateY(a){
  const c=Math.cos(a), s=Math.sin(a);
  return new Float32Array([ c,0,-s,0,  0,1,0,0,  s,0,c,0,  0,0,0,1 ]);
}
function mat4RotateX(a){
  const c=Math.cos(a), s=Math.sin(a);
  return new Float32Array([ 1,0,0,0,  0,c,s,0,  0,-s,c,0,  0,0,0,1 ]);
}
function mat4Perspective(fovy, aspect, near, far){
  const f=1/Math.tan(fovy/2), nf=1/(near-far);
  return new Float32Array([
    f/aspect,0,0,0,
    0,f,0,0,
    0,0,(far+near)*nf,-1,
    0,0,(2*far*near)*nf,0
  ]);
}

// cores
function hex3(h){ return [(h>>16&255)/255,(h>>8&255)/255,(h&255)/255]; }
function lerp(a,b,t){ return a+(b-a)*t; }
function colorFromScore(pct){
  const stops=[
    {p:0, c:0xEF4444},{p:50,c:0xF59E0B},{p:70,c:0xFDE047},{p:85,c:0x4ADE80},{p:100,c:0x22C55E},
  ];
  for(let i=0;i<stops.length-1;i++){
    const a=stops[i], b=stops[i+1];
    if(pct>=a.p && pct<=b.p){
      const t=(pct-a.p)/(b.p-a.p), ca=hex3(a.c), cb=hex3(b.c);
      return [lerp(ca[0],cb[0],t), lerp(ca[1],cb[1],t), lerp(ca[2],cb[2],t)];
    }
  }
  return hex3(0x22C55E);
}

// uniforms fixos
gl.uniform3fv(loc.uLightDir, new Float32Array([0.7,0.8,0.4]));

// interação
let rotX=0.4, rotY=0.6;
canvas.addEventListener('mousemove', (e)=>{ if(e.buttons===1){ rotY+=e.movementX*0.005; rotX+=e.movementY*0.005; }});
btnReset.onclick=()=>{rotX=0.4; rotY=0.6;};

// export
function downloadURI(uri, name){ const a=document.createElement('a'); a.href=uri; a.download=name; a.click(); }
btnSq.onclick=()=>downloadURI(canvas.toDataURL('image/png'), `eco_globe_square_${Date.now()}.png`);
btnRd.onclick=()=>{
  const s=Math.min(canvas.width, canvas.height);
  const off=document.createElement('canvas'); off.width=off.height=s;
  const ctx=off.getContext('2d'); ctx.save(); ctx.beginPath(); ctx.arc(s/2,s/2,s/2,0,Math.PI*2); ctx.clip();
  ctx.drawImage(canvas,0,0,s,s); ctx.restore();
  downloadURI(off.toDataURL('image/png'), `eco_globe_round_${Date.now()}.png`);
};

// anima
let start=performance.now();
function frame(now){
  const t=(now-start)/1000;
  const pct   = parseFloat(scoreEl.value);
  const noise = parseFloat(noiseEl.value);
  const noiseFactor = Math.min(1, Math.max(0, (noise-40)/40)); // 40..80 dB -> 0..1

  gl.uniform1f(loc.uTime, t);
  gl.uniform1f(loc.uNoiseAmt, noiseFactor);

  const base = colorFromScore(pct);
  const acc  = [Math.min(1,base[0]*0.7+0.1), Math.min(1,base[1]*0.9+0.2), Math.min(1,base[2]*1.1+0.25)];
  gl.uniform3fv(loc.uBase, new Float32Array(base));
  gl.uniform3fv(loc.uAcc , new Float32Array(acc));

  // matrices (col-major)
  const aspect = gl.drawingBufferWidth/gl.drawingBufferHeight;
  const P = mat4Perspective(35*Math.PI/180, aspect, 0.1, 100);
  const V = mat4Translate([0,0,-3.4]);
  let M = mat4RotateY(rotY + t*0.15);
  M = mat4Mul(M, mat4RotateX(rotX));

  const MVP = mat4Mul(mat4Mul(P,V), M);
  gl.uniformMatrix4fv(loc.uMVP, false, MVP);
  gl.uniformMatrix4fv(loc.uModel, false, M);

  gl.clearColor(1,1,1,0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// toggle “usar dados”
useData.onchange = ()=>{
  if(useData.checked){
    const s=getSaved(); scoreEl.value=s.pct; noiseEl.value=Math.round(s.noise||52);
  }
};

})();
