
// Simple interactive demo renderer (reads manifest.json)
let manifest;
const container = document.getElementById('canvas');
const sidebar = document.getElementById('sidebar');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalContent = document.getElementById('modal-content');
let currentIndex = 0;
let imgEl, svgEl;
async function init(){
  manifest = await (await fetch('manifest.json')).json();
  renderStep(0);
  renderTimeline();
}
function clearCanvas(){ container.innerHTML=''; const old = document.querySelector('.blur-canvas'); if(old) old.remove(); }
function renderStep(i){
  if(i<0 || i>=manifest.steps.length) return;
  currentIndex = i;
  const step = manifest.steps[i];
  clearCanvas();
  // load asset (support svg or img)
  const asset = step.asset;
  if(asset.endsWith('.svg')){
    fetch(asset).then(r=>r.text()).then(svg=>{
      container.innerHTML = svg;
      attachElements(step);
    });
  } else {
    const img = document.createElement('img');
    img.src = asset;
    container.appendChild(img);
    attachElements(step);
  }
  document.getElementById('cur-step').innerText = `Step ${i+1} / ${manifest.steps.length}`;
}
function attachElements(step){
  // create absolute-positioned overlay container relative to svg or image sizing
  const bbox = container.getBoundingClientRect();
  // elements added as positioned absolutely relative to container; manifest coordinates assume 1200x700 canvas
  const scaleX = container.clientWidth / (manifest.defaultWidth || 1200);
  const scaleY = (container.clientHeight || 700) / (manifest.defaultHeight || 700);
  (step.elements||[]).forEach((el,idx)=>{
    const x = (el.x||0)*scaleX;
    const y = (el.y||0)*scaleY;
    const w = (el.w||100)*scaleX;
    const h = (el.h||60)*scaleY;
    if(el.type === 'hotspot'){
      const node = document.createElement('div'); node.className='element hotspot'; node.style.left = x+'px'; node.style.top = y+'px';
      node.title = el.label||'Hotspot';
      node.innerText = '→';
      node.addEventListener('click', ()=> {
        if(el.action && el.action.type === 'next') goNext();
        else if(el.action && el.action.type === 'url') window.open(el.action.value,'_blank');
      });
      container.appendChild(node);
    } else if(el.type === 'tooltip'){
      const node = document.createElement('div'); node.className='element tooltip'; node.style.left = x+'px'; node.style.top = y+'px';
      node.innerHTML = `<div>${el.text||''}</div><div class="next" tabindex="0">Next</div>`;
      node.querySelector('.next').addEventListener('click', ()=> goNext());
      container.appendChild(node);
    } else if(el.type === 'media'){
      const node = document.createElement('div'); node.className='element tooltip'; node.style.left = x+'px'; node.style.top = y+'px';
      node.innerHTML = `<div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center">Media</div><div class="next" tabindex="0">Open</div>`;
      node.querySelector('.next').addEventListener('click', ()=> openMedia(el));
      container.appendChild(node);
    } else if(el.type === 'form'){
      const node = document.createElement('div'); node.className='element'; node.style.left = x+'px'; node.style.top = y+'px';
      node.innerHTML = `<div class="form-card"><strong>Contact</strong><form id="lead-form">
        <div style="margin-top:8px"><label>Name<br><input name="name" required></label></div>
        <div style="margin-top:8px"><label>Email<br><input name="email" type="email" required></label></div>
        <div style="margin-top:8px"><label>Company<br><input name="company"></label></div>
        <div style="margin-top:8px"><button type="submit" class="next">Submit</button></div>
      </form></div>`;
      container.appendChild(node);
      const form = node.querySelector('#lead-form');
      form.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        try{
          await fetch(manifest.formEndpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
        }catch(err){
          console.log('Demo form POST attempted (endpoint may be fake).',data);
        }
        showModal(`<h3>Thanks — we'll be in touch</h3><p class="small-muted">Form data logged (demo).</p>`);
      });
    } else if(el.type === 'blur'){
      // create a canvas overlay with blurred region
      createBlurOverlay(el);
    }
  });
}
function createBlurOverlay(el){
  // draw a blurred copy of the asset and mask region
  const c = document.createElement('canvas');
  c.className='blur-canvas';
  c.width = container.clientWidth; c.height = container.clientHeight;
  c.style.left='0'; c.style.top='0'; c.style.width='100%'; c.style.height='100%';
  container.appendChild(c);
  const ctx = c.getContext('2d');
  // draw full image into an offscreen img then blur specific area
  const imgNode = container.querySelector('svg') || container.querySelector('img');
  // create temp image from svg outerHTML if svg
  let imgSrcPromise;
  if(imgNode && imgNode.tagName.toLowerCase()==='svg'){
    const svgXML = new XMLSerializer().serializeToString(imgNode);
    imgSrcPromise = Promise.resolve('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgXML));
  } else if(imgNode){
    imgSrcPromise = Promise.resolve(imgNode.src);
  } else imgSrcPromise = Promise.resolve('');
  imgSrcPromise.then(src=>{
    const img = new Image();
    img.onload = ()=>{
      // draw original
      ctx.drawImage(img,0,0,c.width,c.height);
      // compute scaled region
      const sx = (el.x||0) * (c.width/ (manifest.defaultWidth||1200));
      const sy = (el.y||0) * (c.height/ (manifest.defaultHeight||700));
      const sw = (el.w||200) * (c.width/ (manifest.defaultWidth||1200));
      const sh = (el.h||80) * (c.height/ (manifest.defaultHeight||700));
      // copy region to offscreen canvas, blur it, then draw back
      const tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(img, sx * (img.width/c.width), sy * (img.height/c.height), sw * (img.width/c.width), sh * (img.height/c.height), 0,0,sw,sh);
      // apply blur using CSS filter via temporary element approach: scale and draw multiple times
      // simple pixelation-like effect: scale down and scale up for demo
      const scale = Math.max(1, Math.floor((el.strength||6)/2));
      const small = document.createElement('canvas'); small.width = Math.max(1,Math.floor(sw/scale)); small.height = Math.max(1,Math.floor(sh/scale));
      const sctx = small.getContext('2d');
      sctx.drawImage(tmp,0,0, small.width, small.height);
      // draw blurred back
      ctx.drawImage(small, sx, sy, sw, sh);
      // overlay semi-opaque rectangle
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(sx,sy,sw,sh);
      // add i icon (clickable)
      const icon = document.createElement('div'); icon.className='i-icon'; icon.style.left = (sx+sw-24)+'px'; icon.style.top = (sy-12)+'px'; icon.tabIndex=0; icon.innerText='i';
      icon.addEventListener('mouseenter', ()=> showTooltipAt(sx+sw, sy, el.info||''));
      icon.addEventListener('click', ()=> showModal(`<strong>Hidden info</strong><p>${el.info||''}</p>`));
      container.appendChild(icon);
    };
    img.crossOrigin="anonymous";
    img.src = src;
  });
}
function showTooltipAt(x,y,html){
  let t = document.getElementById('temp-tooltip');
  if(!t){ t = document.createElement('div'); t.id='temp-tooltip'; t.className='tooltip'; document.body.appendChild(t); }
  t.style.position='fixed'; t.style.left = (x+10)+'px'; t.style.top = (y+10)+'px'; t.innerHTML = html;
  t.style.display='block';
  setTimeout(()=>{ t.style.display='none'},3000);
}
function openMedia(el){
  showModal(`<div style="max-width:640px"><h3>Media (demo)</h3><p class="small-muted">Simulated media modal (no video file)</p><div style="height:200px;background:#000;color:#fff;display:flex;align-items:center;justify-content:center">Video Placeholder</div><div style="margin-top:10px"><button onclick="closeModal()" class="btn">Close</button></div></div>`);
}
function showModal(html){
  modalContent.innerHTML = html + '<div style="text-align:right;margin-top:10px"><button onclick="closeModal()" class="btn">Close</button></div>';
  modalBackdrop.style.display='flex';
}
function closeModal(){ modalBackdrop.style.display='none'; modalContent.innerHTML=''; }
function goNext(){ renderStep(currentIndex+1); }
function goPrev(){ renderStep(currentIndex-1); }
function renderTimeline(){
  const t = document.getElementById('timeline');
  t.innerHTML = '';
  manifest.steps.forEach((s,i)=>{
    const div = document.createElement('div'); div.className='thumb'; div.innerHTML = `<div style="width:100%;height:100%">${i+1}</div>`; div.addEventListener('click', ()=> renderStep(i));
    t.appendChild(div);
  });
}
window.addEventListener('keydown', (e)=>{ if(e.key==='ArrowRight') goNext(); if(e.key==='ArrowLeft') goPrev(); if(e.key==='Escape') closeModal();});
init();
