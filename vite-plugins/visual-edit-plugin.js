/**
 * visual-edit-plugin (Standalone Version)
 * 
 * Injects the visual editing client script into the HTML.
 * NOTE: This version does NOT add source location attributes. 
 * It assumes they are added by another tool.
 */

const DEFAULT_TRANSLATIONS = {
  en: { placeholder: 'What to change?' },
  ko: { placeholder: '무엇을 변경하시겠습니까?' },
  vn: { placeholder: 'Bạn muốn thay đổi gì?' },
  jp: { placeholder: '何を変更しますか？' },
  ch: { placeholder: '你想改什么？' },
};

const DEFAULT_OPTIONS = {
  persistState: false,
  submitTimeout: 10,
  showBadge: false,
  enableKeyboardShortcut: false,
  defaultInputDisabled: false,
  messageTypeDataRequest: 'visual-edit-request',
  messageTypeDataResponse: 'visual-edit-response',
  messageTypeToggle: 'visual-edit-toggle',
  messageTypeLanguage: 'visual-edit-language',
  messageTypeConfig: 'visual-edit-config',
  messageTypeInputControl: 'visual-edit-input-control',
  defaultEnabled: false,
  colorHover: '#b28fff',
  colorSelected: '#9360fd',
  colorSubmit: '#9360fd',
  attributeSourceLocation: 'data-source-location',
  attributeDynamicContent: 'data-dynamic-content',
  language: 'en',
  multiSelectSameLocation: false,
};

function generateClientScript(config) {
  return `
<script type="module">
(function(){
  if(typeof window==='undefined')return;
  
  const CONFIG = ${JSON.stringify(config)};
  
  let enabled = CONFIG.defaultEnabled;
  const STORAGE_KEY = 'visual-edit-enabled';
  
  if (CONFIG.persistState) {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved !== null) enabled = saved === 'true';
    } catch(e) {}
  }
  
  const HC=CONFIG.colorHover,SC=CONFIG.colorSelected,SB=CONFIG.colorSubmit,LC='#fff';
  const ATTR_LOC = CONFIG.attributeSourceLocation;
  const ATTR_DYN = CONFIG.attributeDynamicContent;
  
  // Helper to convert hex to rgba
  function hexToRgba(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return\`rgba(\${r},\${g},\${b},\${a})\`}
  
  let aH=[],aL=[],cL=null,sL=null,sH=[],sLb=[],aF=null,cE=null,iS=false,aSB=null,sT=null,mH=null,init=false,cEIdx=null,hE=null,inputDisabled=CONFIG.defaultInputDisabled;
  
  function cHl(el,sel=false){
    const r=el.getBoundingClientRect(),sx=scrollX,sy=scrollY,c=sel?SC:HC;
    const h=document.createElement('div');
    h.className=sel?'ve-hs':'ve-h';
    h.style.cssText=\`position:absolute;top:\${r.top+sy}px;left:\${r.left+sx}px;width:\${r.width}px;height:\${r.height}px;border:2px solid \${c};background:\${sel?'transparent':hexToRgba(c,0.1)};pointer-events:none;z-index:\${sel?99998:99999};box-sizing:border-box\`;
    document.body.appendChild(h);
    sel?sH.push(h):aH.push(h);
    return{r,sx,sy};
  }
  
  function cLb(el,r,sx,sy,sel=false){
    const l=document.createElement('div');
    l.className=sel?'ve-ls':'ve-l';
    l.textContent=el.tagName.toLowerCase();
    l.style.cssText=\`position:absolute;top:\${r.top<20?r.top+sy+2:r.top+sy-20}px;left:\${r.left+sx}px;background:\${sel?SC:HC};color:\${LC};padding:2px 6px;font-size:11px;font-family:ui-monospace,monospace;font-weight:500;border-radius:\${r.top<20?'0 0 3px 3px':'3px 3px 0 0'};pointer-events:none;z-index:\${sel?99999:100000};white-space:nowrap\`;
    document.body.appendChild(l);
    sel?sLb.push(l):aL.push(l);
  }
  
  function isIF(){try{return self!==top}catch(e){return true}}
  
  function setL(l){
    iS=l;if(!aSB)return;
    if(l){
      aSB.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>';
      aSB.disabled=true;aSB.style.cursor='not-allowed';
      if(!document.getElementById('ve-sp')){const s=document.createElement('style');s.id='ve-sp';s.textContent='@keyframes ve-spin{to{transform:rotate(360deg)}}.ve-f .spin{animation:ve-spin 1s linear infinite}';document.head.appendChild(s);}
    }else{
      aSB.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>';
      aSB.disabled=false;aSB.style.cursor='pointer';aSB.style.background=SB;
    }
  }
  
  function clnL(){if(mH){window.removeEventListener('message',mH);mH=null}if(sT){clearTimeout(sT);sT=null}}
  function clsF(){clnL();iS=false;aSB=null;if(aF){aF.remove();aF=null}sH.forEach(h=>h.remove());sLb.forEach(l=>l.remove());sH=[];sLb=[];sL=null;cE=null}
  function clrH(){aH.forEach(h=>h.remove());aL.forEach(l=>l.remove());aH=[];aL=[];cL=null}
  function clrAll(){clsF();clrH()}
  
  function sub(v){
    const idx = CONFIG.multiSelectSameLocation ? null : cEIdx;
    const dynContent = cE?.getAttribute(ATTR_DYN) || null;
    const elContent=cE?cE?.innerText?.trim():null;
    const d={sourceLocation:sL,content:v,element:cE?.tagName.toLowerCase()||null,elementIndex:idx,dynamicContent:dynContent,elementContent:elContent};
    setL(true);clnL();
    if(isIF()){
      try{
        mH=(e)=>{if(!mH||!e.data||e.data.type!==CONFIG.messageTypeDataResponse)return;const o=aF!==null;clnL();if(o)setL(false);if(e.data.success&&o)clsF()};
        window.addEventListener('message',mH);
        sT=setTimeout(()=>{if(!sT)return;clnL();if(aF)setL(false)},CONFIG.submitTimeout);
        parent.postMessage({type:CONFIG.messageTypeDataRequest,data:d},'*');
      }catch(e){clnL();setL(false)}
    }else{window.dispatchEvent(new CustomEvent(CONFIG.messageTypeDataRequest,{detail:d}));setL(false);clsF()}
  }
  
  function cIF(el){
    const r=el.getBoundingClientRect(),sx=scrollX,sy=scrollY;
    const f=document.createElement('div');f.className='ve-f';
    f.style.cssText=\`position:absolute;top:\${r.bottom+sy+8}px;left:\${r.left+sx}px;min-width:300px;max-width:400px;background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.15),0 0 0 1px rgba(0,0,0,.05);z-index:100001;display:flex;align-items:center;padding:8px 12px;gap:8px;font-family:-apple-system,sans-serif\`;
    const bb=document.createElement('button');bb.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
    bb.style.cssText='background:none;border:none;cursor:pointer;padding:4px;color:#6b7280;display:flex;border-radius:4px';bb.onclick=clsF;
    const t = CONFIG.translations[CONFIG.language] || CONFIG.translations['en'];
    const ip=document.createElement('input');ip.type='text';ip.placeholder=t.placeholder;
    ip.style.cssText='flex:1;border:none;outline:none;font-size:14px;color:#374151;background:transparent';
    const sb=document.createElement('button');
    sb.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg>';
    sb.disabled=true;sb.style.cssText=\`background:\${SB};opacity:0.5;border:none;cursor:not-allowed;padding:6px;color:white;display:flex;border-radius:6px\`;
    aSB=sb;
    const upd=()=>{if(iS||inputDisabled)return;const h=ip.value.trim().length>0;sb.disabled=!h;sb.style.background=SB;sb.style.opacity=h?'1':'0.5';sb.style.cursor=h?'pointer':'not-allowed'};
    ip.oninput=upd;ip.onkeydown=(e)=>{if(e.key==='Enter'&&ip.value.trim()&&!iS&&!inputDisabled)sub(ip.value.trim());else if(e.key==='Escape')clsF()};
    sb.onclick=()=>{if(ip.value.trim()&&!iS&&!inputDisabled)sub(ip.value.trim())};
    const cb=document.createElement('button');cb.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    cb.style.cssText='background:none;border:none;cursor:pointer;padding:4px;color:#6b7280;display:flex;border-radius:4px';cb.onclick=clsF;
    const dv=document.createElement('div');dv.style.cssText='width:1px;background:#e5e7eb;height:24px;margin-left:5px';
    f.append(bb,ip,sb,dv,cb);document.body.appendChild(f);aF=f;
    f.addEventListener('mouseenter',clrH);f.addEventListener('click',e=>e.stopPropagation());
    setTimeout(()=>ip.focus(),50);
    const fr=f.getBoundingClientRect();
    if(fr.right>innerWidth)f.style.left=\`\${innerWidth-fr.width-16}px\`;
    if(fr.bottom>innerHeight)f.style.top=\`\${r.top+sy-fr.height-8}px\`;
    if(inputDisabled){
      ip.disabled=true;ip.style.opacity='0.5';ip.style.cursor='not-allowed';
      sb.disabled=true;sb.style.opacity='0.5';sb.style.cursor='not-allowed';
    }
  }
  
  function cSH(loc,el){sH.forEach(h=>h.remove());sLb.forEach(l=>l.remove());sH=[];sLb=[];if(CONFIG.multiSelectSameLocation){document.querySelectorAll(\`[\${ATTR_LOC}="\${loc}"]\`).forEach(e=>{const{r,sx,sy}=cHl(e,true);cLb(e,r,sx,sy,true)})}else if(el){const{r,sx,sy}=cHl(el,true);cLb(el,r,sx,sy,true)}}
  function hlE(loc,el){hE=el;if(CONFIG.multiSelectSameLocation){if(cL===loc)return;aH.forEach(h=>h.remove());aL.forEach(l=>l.remove());aH=[];aL=[];cL=loc;if(loc===sL)return;document.querySelectorAll(\`[\${ATTR_LOC}="\${loc}"]\`).forEach(e=>{const{r,sx,sy}=cHl(e,false);cLb(e,r,sx,sy,false)})}else{aH.forEach(h=>h.remove());aL.forEach(l=>l.remove());aH=[];aL=[];cL=loc;if(el===cE)return;const{r,sx,sy}=cHl(el,false);cLb(el,r,sx,sy,false)}}
  
  function mO(e){if(!enabled)return;const t=e.target;if(t.closest('.ve-h,.ve-hs,.ve-l,.ve-ls,.ve-f,.ve-badge'))return;const el=t.closest(\`[\${ATTR_LOC}]\`);if(el)hlE(el.getAttribute(ATTR_LOC),el)}
  function mOut(e){if(!enabled)return;const rt=e.relatedTarget;if(rt){if(rt.closest?.('.ve-h,.ve-hs,.ve-l,.ve-ls,.ve-f,.ve-badge'))return;const el=rt.closest?.(\`[\${ATTR_LOC}]\`);if(CONFIG.multiSelectSameLocation){if(el&&el.getAttribute(ATTR_LOC)===cL)return}else{if(el===hE)return}}clrH()}
  function clk(e){if(!enabled)return;const t=e.target;if(t.closest('.ve-f,.ve-badge'))return;const el=t.closest(\`[\${ATTR_LOC}]\`);if(el){const loc=el.getAttribute(ATTR_LOC);if(!CONFIG.multiSelectSameLocation&&el===cE)return;if(CONFIG.multiSelectSameLocation&&loc===sL)return;e.preventDefault();e.stopPropagation();if(aF){aF.remove();aF=null}sL=loc;cE=el;const allEls=Array.from(document.querySelectorAll(\`[\${ATTR_LOC}="\${loc}"]\`));cEIdx=allEls.indexOf(el);cEIdx=cEIdx===-1?null:cEIdx;clrH();cSH(loc,el);cIF(el)}else if(sL)clsF()}
  
  function upd(){
    if(!enabled)return;
    if(cL){
      if(CONFIG.multiSelectSameLocation){
        const els=document.querySelectorAll(\`[\${ATTR_LOC}="\${cL}"]\`);
        aH.forEach((h,i)=>{const e=els[i];if(!e)return;const r=e.getBoundingClientRect();h.style.top=\`\${r.top+scrollY}px\`;h.style.left=\`\${r.left+scrollX}px\`;h.style.width=\`\${r.width}px\`;h.style.height=\`\${r.height}px\`});
        aL.forEach((l,i)=>{const e=els[i];if(!e)return;const r=e.getBoundingClientRect();l.style.top=r.top<20?\`\${r.top+scrollY+2}px\`:\`\${r.top+scrollY-20}px\`;l.style.left=\`\${r.left+scrollX}px\`});
      }else if(hE){
        if(aH[0]){const r=hE.getBoundingClientRect();aH[0].style.top=\`\${r.top+scrollY}px\`;aH[0].style.left=\`\${r.left+scrollX}px\`;aH[0].style.width=\`\${r.width}px\`;aH[0].style.height=\`\${r.height}px\`}
        if(aL[0]){const r=hE.getBoundingClientRect();aL[0].style.top=r.top<20?\`\${r.top+scrollY+2}px\`:\`\${r.top+scrollY-20}px\`;aL[0].style.left=\`\${r.left+scrollX}px\`}
      }
    }
    if(sL){
      if(CONFIG.multiSelectSameLocation){
        const els=document.querySelectorAll(\`[\${ATTR_LOC}="\${sL}"]\`);
        sH.forEach((h,i)=>{const e=els[i];if(!e)return;const r=e.getBoundingClientRect();h.style.top=\`\${r.top+scrollY}px\`;h.style.left=\`\${r.left+scrollX}px\`;h.style.width=\`\${r.width}px\`;h.style.height=\`\${r.height}px\`});
        sLb.forEach((l,i)=>{const e=els[i];if(!e)return;const r=e.getBoundingClientRect();l.style.top=r.top<20?\`\${r.top+scrollY+2}px\`:\`\${r.top+scrollY-20}px\`;l.style.left=\`\${r.left+scrollX}px\`});
      }else if(cE){
        if(sH[0]){const r=cE.getBoundingClientRect();sH[0].style.top=\`\${r.top+scrollY}px\`;sH[0].style.left=\`\${r.left+scrollX}px\`;sH[0].style.width=\`\${r.width}px\`;sH[0].style.height=\`\${r.height}px\`}
        if(sLb[0]){const r=cE.getBoundingClientRect();sLb[0].style.top=r.top<20?\`\${r.top+scrollY+2}px\`:\`\${r.top+scrollY-20}px\`;sLb[0].style.left=\`\${r.left+scrollX}px\`}
      }
      if(aF&&cE){const r=cE.getBoundingClientRect(),fr=aF.getBoundingClientRect();let t=r.bottom+scrollY+8;if(r.bottom+fr.height+8>innerHeight)t=r.top+scrollY-fr.height-8;aF.style.top=\`\${t}px\`;aF.style.left=\`\${Math.min(r.left+scrollX,innerWidth-fr.width-16)}px\`}
    }
  }
  
  function setEnabled(val) {
    enabled = val;
    if (CONFIG.persistState) {
      try { sessionStorage.setItem(STORAGE_KEY, String(val)); } catch(e) {}
    }
    
    const css = document.getElementById('ve-css');
    if (val) {
      if (!css) {
        const s = document.createElement('style');
        s.id = 've-css';
        s.textContent = 'body,body *{cursor:crosshair}.ve-f,.ve-f *{cursor:pointer}.ve-f input{cursor:text!important}.ve-f button{cursor:pointer!important}.ve-f button:disabled{cursor:not-allowed!important}.ve-badge{cursor:pointer!important}';
        document.head.appendChild(s);
      }
    } else {
      if (css) css.remove();
      clrAll();
    }
    
    if (CONFIG.showBadge) updateBadge();
  }

  function setLanguage(lang) {
    if (!CONFIG.translations[lang]) return;
    CONFIG.language = lang;
    if (aF) {
      const t = CONFIG.translations[lang];
      const ip = aF.querySelector('input');
      if (ip) ip.placeholder = t.placeholder;
    }
  }
  
  let badge = null;
  function updateBadge() {
    if (!CONFIG.showBadge) return;
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 've-badge';
      badge.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:100002;padding:8px 12px;border-radius:8px;font-family:-apple-system,sans-serif;font-size:12px;font-weight:500;cursor:pointer;transition:all .2s;box-shadow:0 2px 10px rgba(0,0,0,.15)';
      badge.onclick = () => setEnabled(!enabled);
      badge.title = 'Toggle Visual Edit (Ctrl+Shift+E)';
      document.body.appendChild(badge);
    }
    badge.style.background = enabled ? SB : '#6b7280';
    badge.style.color = '#fff';
    badge.textContent = enabled ? '✏️ Edit ON' : '👁️ Edit OFF';
  }
  
  function onKeyDown(e) {
    if (!CONFIG.enableKeyboardShortcut) return;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      setEnabled(!enabled);
    }
  }
  
  function setMultiSelect(val) {
    CONFIG.multiSelectSameLocation = !!val;
    clrAll();
  }
  
  function setInputDisabled(disabled) {
    inputDisabled = !!disabled;
    if (!aF) {
      return;
    }
    const ip = aF.querySelector('input');
    if (ip) {
      ip.disabled = !!disabled;
      ip.style.opacity = disabled ? '0.5' : '1';
      ip.style.cursor = disabled ? 'not-allowed' : 'text';
    }
    if (aSB) {
      if (disabled) {
        aSB.disabled = true;
        aSB.style.opacity = '0.5';
        aSB.style.cursor = 'not-allowed';
      } else {
        const hasValue = ip && ip.value.trim().length > 0;
        aSB.disabled = !hasValue;
        aSB.style.opacity = hasValue ? '1' : '0.5';
        aSB.style.cursor = hasValue ? 'pointer' : 'not-allowed';
      }
    }
  }
  
  function onMessage(e) {
    if (e.data && e.data.type === CONFIG.messageTypeToggle) {
      if (typeof e.data.enabled === 'boolean') {
        setEnabled(e.data.enabled);
      } else {
        setEnabled(!enabled);
      }
    } else if (e.data && e.data.type === CONFIG.messageTypeLanguage) {
      if (e.data.language) {
        setLanguage(e.data.language);
      }
    } else if (e.data && e.data.type === CONFIG.messageTypeConfig) {
      if (typeof e.data.multiSelectSameLocation === 'boolean') {
        setMultiSelect(e.data.multiSelectSameLocation);
      }
    } else if (e.data && e.data.type === CONFIG.messageTypeInputControl) {
      if (typeof e.data.disabled === 'boolean') {
        setInputDisabled(e.data.disabled);
      }
    }
  }
  
  function initVE(){
    if(init)return;init=true;
    
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('message', onMessage);
    document.addEventListener('mouseover',mO,true);
    document.addEventListener('mouseout',mOut,true);
    document.addEventListener('click',clk,true);
    window.addEventListener('scroll',upd,true);
    window.addEventListener('resize',upd);
    
    if (enabled) {
      const s = document.createElement('style');
      s.id = 've-css';
      s.textContent = 'body,body *{cursor:crosshair}.ve-f,.ve-f *{cursor:auto!important}.ve-f input{cursor:text!important}.ve-f button{cursor:pointer!important}.ve-f button:disabled{cursor:not-allowed!important}.ve-badge{cursor:pointer!important}';
      document.head.appendChild(s);
    }
    
    if (CONFIG.showBadge) updateBadge();
  }
  
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initVE,{once:true});else initVE();
  
  window.__VISUAL_EDIT__ = {
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    toggle: () => setEnabled(!enabled),
    setLanguage: (lang) => setLanguage(lang),
    setMultiSelect: (val) => setMultiSelect(val),
    setInputDisabled: (disabled) => setInputDisabled(disabled),
    isEnabled: () => enabled,
    isMultiSelect: () => CONFIG.multiSelectSameLocation,
    isInputDisabled: () => inputDisabled,
    config: CONFIG
  };
})();
</script>`;
}

export function visualEditPlugin(options = {}) {
  const resolvedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const {
    persistState,
    submitTimeout,
    showBadge,
    enableKeyboardShortcut,
    defaultInputDisabled,
    messageTypeDataRequest,
    messageTypeDataResponse,
    messageTypeToggle,
    messageTypeLanguage,
    messageTypeConfig,
    messageTypeInputControl,
    defaultEnabled,
    colorHover,
    colorSelected,
    colorSubmit,
    attributeSourceLocation,
    attributeDynamicContent,
    language,
    multiSelectSameLocation,
    translations: userTranslations,
  } = resolvedOptions;

  const translations = { ...DEFAULT_TRANSLATIONS };
  if (userTranslations) {
    Object.keys(userTranslations).forEach(lang => {
      if (userTranslations[lang]) {
        translations[lang] = {
          ...translations[lang],
          ...userTranslations[lang]
        };
      }
    });
  }

  const config = {
    persistState,
    submitTimeout: submitTimeout * 1000,
    showBadge,
    enableKeyboardShortcut,
    defaultInputDisabled,
    messageTypeDataRequest,
    messageTypeDataResponse,
    messageTypeToggle,
    messageTypeLanguage,
    messageTypeConfig,
    messageTypeInputControl,
    defaultEnabled,
    colorHover,
    colorSelected,
    colorSubmit,
    attributeSourceLocation,
    attributeDynamicContent,
    language,
    multiSelectSameLocation,
    translations,
  };

  return {
    name: 'visual-edit-plugin',

    transformIndexHtml(html) {
      const script = generateClientScript(config);
      return html.replace('</body>', `${script}\n</body>`);
    },
  };
}
