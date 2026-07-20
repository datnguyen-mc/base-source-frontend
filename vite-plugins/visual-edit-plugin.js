/**
 * visual-edit-plugin (Standalone Version)
 * 
 * Injects the visual editing client script into the HTML.
 * NOTE: This version does NOT add source location attributes. 
 * It assumes they are added by another tool.
 */

const DEFAULT_TRANSLATIONS = {
  en: { placeholder: 'What to change?', uploadImage: 'Upload Image', tooManyFilesTitle: 'Upload limit reached', tooManyFiles: 'You can upload up to {{max}} files (currently {{current}}). All selected files were cancelled.', fileTooLargeTitle: 'File too large', fileTooLarge: 'Max size: {{maxImage}}. Rejected: {{rejected}}', totalTooLargeTitle: 'Total size exceeded', totalTooLarge: 'Total upload size exceeds {{max}} (current: {{total}})', invalidFileTypeTitle: 'Invalid file type', invalidFileType: 'Only image files (JPG, PNG, GIF, WEBP, SVG) are allowed.' },
  ko: { placeholder: '무엇을 변경하시겠습니까?', uploadImage: '이미지 업로드', tooManyFilesTitle: '업로드 한도 초과', tooManyFiles: '최대 {{max}}개 파일까지 업로드할 수 있습니다 (현재 {{current}}개). 선택한 파일이 모두 취소되었습니다.', fileTooLargeTitle: '파일 크기 초과', fileTooLarge: '최대 크기: {{maxImage}}. 거부됨: {{rejected}}', totalTooLargeTitle: '총 크기 초과', totalTooLarge: '총 업로드 크기가 {{max}}을 초과합니다 (현재: {{total}})', invalidFileTypeTitle: '지원하지 않는 파일 형식', invalidFileType: '이미지 파일(JPG, PNG, GIF, WEBP, SVG)만 업로드할 수 있습니다.' },
  vn: { placeholder: 'Bạn muốn thay đổi gì?', uploadImage: 'Tải ảnh lên', tooManyFilesTitle: 'Vượt quá giới hạn tải lên', tooManyFiles: 'Bạn có thể tải lên tối đa {{max}} tệp (hiện tại {{current}}). Đã hủy tất cả tệp được chọn.', fileTooLargeTitle: 'Tệp quá lớn', fileTooLarge: 'Kích thước tối đa: {{maxImage}}. Bị từ chối: {{rejected}}', totalTooLargeTitle: 'Vượt quá tổng dung lượng', totalTooLarge: 'Tổng dung lượng vượt quá {{max}} (hiện tại: {{total}})', invalidFileTypeTitle: 'Loại tệp không hợp lệ', invalidFileType: 'Chỉ hỗ trợ tệp hình ảnh (JPG, PNG, GIF, WEBP, SVG).' },
  jp: { placeholder: '何を変更しますか？', uploadImage: '画像をアップロード', tooManyFilesTitle: 'アップロード上限に達しました', tooManyFiles: '最大 {{max}} 個のファイルをアップロードできます（現在 {{current}} 個）。すべての選択がキャンセルされました。', fileTooLargeTitle: 'ファイルが大きすぎます', fileTooLarge: '最大サイズ: {{maxImage}}。拒否: {{rejected}}', totalTooLargeTitle: '合計サイズ超過', totalTooLarge: '合計アップロードサイズが {{max}} を超えています（現在: {{total}}）', invalidFileTypeTitle: '無効なファイル形式', invalidFileType: '画像ファイル（JPG、PNG、GIF、WEBP、SVG）のみ許可されています。' },
  ch: { placeholder: '你想改什么？', uploadImage: '上传图片', tooManyFilesTitle: '上传达到上限', tooManyFiles: '最多允许上传 {{max}} 个文件（当前 {{current}}）。已取消所有选择。', fileTooLargeTitle: '文件过大', fileTooLarge: '最大大小: {{maxImage}}。被拒绝: {{rejected}}', totalTooLargeTitle: '总大小超过限制', totalTooLarge: '总上传大小超过 {{max}}（当前: {{total}}）', invalidFileTypeTitle: '文件类型无效', invalidFileType: '仅允许使用图像文件（JPG、PNG、GIF、WEBP、SVG）。' },
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
  
  function showToast(title, msg) {
    let tc = document.getElementById('ve-toast-container');
    if (!tc) {
      tc = document.createElement('div');
      tc.id = 've-toast-container';
      tc.style.cssText = 'position:fixed;top:24px;right:24px;z-index:2147483647;display:flex;flex-direction:column;gap:16px;max-width:448px;width:calc(100vw - 32px);';
      document.body.appendChild(tc);
      
      const s = document.createElement('style');
      s.textContent = '@keyframes ve-toast-in{from{transform:translateY(-20px) scale(0.95);opacity:0}to{transform:translateY(0) scale(1);opacity:1}} @keyframes ve-toast-out{from{transform:translateY(0) scale(1);opacity:1}to{transform:translateY(-20px) scale(0.95);opacity:0}}';
      document.head.appendChild(s);
    }
    
    const t = document.createElement('div');
    t.style.cssText = 'background:linear-gradient(to bottom right, #fef2f2, #fdf2f8);border:2px solid #fecaca;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);padding:20px;backdrop-filter:blur(24px);font-family:-apple-system,sans-serif;animation:ve-toast-in 0.2s ease-out forwards;position:relative;';
    
    const flexCont = document.createElement('div');
    flexCont.style.cssText = 'display:flex;align-items:flex-start;gap:16px;';
    
    const iconCont = document.createElement('div');
    iconCont.style.cssText = 'flex-shrink:0;width:40px;height:40px;background:linear-gradient(to bottom right, #ef4444, #ec4899);border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);';
    iconCont.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';
    flexCont.appendChild(iconCont);
    
    const textCont = document.createElement('div');
    textCont.style.cssText = 'flex:1;min-width:0;';
    
    if (title) {
      const h = document.createElement('h3');
      h.style.cssText = 'font-weight:700;font-size:16px;color:#111827;margin:0 0 4px 0;';
      h.textContent = title;
      textCont.appendChild(h);
    }
    
    const b = document.createElement('p');
    b.style.cssText = 'font-size:14px;color:#4b5563;line-height:1.625;margin:0;word-break:break-word;';
    b.innerHTML = msg.replace(/\\n/g, '<br/>');
    textCont.appendChild(b);
    
    flexCont.appendChild(textCont);
    
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'position:relative;z-index:10;flex-shrink:0;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:background-color 0.2s;cursor:pointer;border:none;background:transparent;padding:0;';
    closeBtn.onmouseenter = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.5)';
    closeBtn.onmouseleave = () => closeBtn.style.background = 'transparent';
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    flexCont.appendChild(closeBtn);
    
    t.appendChild(flexCont);
    tc.appendChild(t);
    
    const removeToast = () => {
      t.style.animation = 've-toast-out 0.2s ease-in forwards';
      setTimeout(() => { t.remove(); if(tc.childNodes.length === 0) tc.remove(); }, 200);
    };
    
    closeBtn.onclick = (e) => { e.stopPropagation(); removeToast(); };
    setTimeout(removeToast, 4000);
  }

  
  const UPLOAD_LIMITS = {
    IMAGE_MAX: 5 * 1024 * 1024,   // 5 MB per image
    FILE_MAX: 20 * 1024 * 1024,   // 20 MB per non-image file
    TOTAL_MAX: 50 * 1024 * 1024,  // 50 MB total size
    MAX_COUNT: 10,                // max 10 items total
  };

  function formatFileSize(bytes) {
    if (bytes < 1024) return \`\${bytes}B\`;
    if (bytes < 1024 * 1024) return \`\${(bytes / 1024).toFixed(0)}KB\`;
    return \`\${(bytes / (1024 * 1024)).toFixed(1)}MB\`;
  }

  function validateUploadFiles(files, options = {}) {
    const imageMax = options.imageMax ?? UPLOAD_LIMITS.IMAGE_MAX;
    const fileMax = options.fileMax ?? UPLOAD_LIMITS.FILE_MAX;
    const totalMax = options.totalMax ?? UPLOAD_LIMITS.TOTAL_MAX;
    const maxCount = options.maxCount ?? UPLOAD_LIMITS.MAX_COUNT;
    const currentCount = options.currentCount ?? 0;

    const errors = [];
    let candidateFiles = [...files];

    const remaining = Math.max(0, maxCount - currentCount);
    if (candidateFiles.length > remaining) {
      const excess = candidateFiles.length - remaining;
      errors.push({
        key: "upload.tooManyFiles",
        params: { max: maxCount, current: currentCount, excess },
      });
      candidateFiles = [];
    }

    const validTypes = [];
    let hasInvalidType = false;
    for (const file of candidateFiles) {
      if (file.type.startsWith('image/')) {
        validTypes.push(file);
      } else {
        hasInvalidType = true;
      }
    }
    if (hasInvalidType) {
      errors.push({ key: "upload.invalidFileType", params: {} });
    }
    candidateFiles = validTypes;

    const validFiles = [];
    const rejectedNames = [];

    for (const file of candidateFiles) {
      if (file.size > imageMax) {
        rejectedNames.push(\`\${file.name} (\${formatFileSize(file.size)})\`);
      } else {
        validFiles.push(file);
      }
    }

    if (rejectedNames.length > 0) {
      errors.push({
        key: "upload.fileTooLarge",
        params: {
          maxImage: formatFileSize(imageMax),
          rejected: rejectedNames.join(", "),
        },
      });
    }

    if (validFiles.length > 0) {
      const totalSize = validFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > totalMax) {
        errors.push({
          key: "upload.totalTooLarge",
          params: {
            max: formatFileSize(totalMax),
            total: formatFileSize(totalSize),
          },
        });
        validFiles.length = 0;
      }
    }

    return { validFiles, errors };
  }
  
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
  
  function sub(v, files = []){
    const idx = CONFIG.multiSelectSameLocation ? null : cEIdx;
    const dynContent = cE?.getAttribute(ATTR_DYN) || null;
    const elContent=cE?cE?.innerText?.trim():null;
    let parentHtml = null;
    let parentPath = null;
    let codeSnippet = null;
    if (cE) {
      try {
        parentHtml = cE.parentElement ? cE.parentElement.cloneNode(false).outerHTML.replace('></', '>... (children hidden)</') : null;
      } catch (e) {}
      try {
        let path = [];
        let el = cE;
        while (el && el.parentElement && el.tagName.toLowerCase() !== 'body') {
          el = el.parentElement;
          let selector = el.tagName.toLowerCase();
          if (el.id) {
            selector += '#' + el.id;
          } else if (el.className) {
            const classes = el.classList ? Array.from(el.classList).filter(c => typeof c === 'string' && !c.startsWith('ve-')).join('.') : '';
            if (classes) {
              selector += '.' + classes;
            }
          }
          path.unshift(selector);
        }
        parentPath = path.join(' > ');
      } catch (e) {}
      try {
        codeSnippet = cE.outerHTML.length > 2000
          ? cE.cloneNode(false).outerHTML.replace('></', '>... (children hidden)</')
          : cE.outerHTML;
      } catch (e) {}
    }
    const d={sourceLocation:sL,content:v,element:cE?.tagName.toLowerCase()||null,elementIndex:idx,dynamicContent:dynContent,elementContent:elContent,parent:parentHtml,parentPath:parentPath,codeSnippet:codeSnippet};
    if (files && files.length > 0) d.files = files;
    setL(true);clnL();
    if(isIF()){
      try{
        mH=(e)=>{if(!mH||!e.data||e.data.type!==CONFIG.messageTypeDataResponse)return;const o=aF!==null;clnL();if(o)setL(false);if(e.data.success&&o)clsF()};
        window.addEventListener('message',mH);
        sT=setTimeout(()=>{if(!sT)return;clnL();if(aF)setL(false)},CONFIG.submitTimeout);
        window.parent.postMessage({type:CONFIG.messageTypeDataRequest,data:d},'*');
      }catch(e){clnL();setL(false)}
    }else{window.dispatchEvent(new CustomEvent(CONFIG.messageTypeDataRequest,{detail:d}));setL(false);clsF()}
  }
  
  function cIF(el){
    const r=el.getBoundingClientRect(),sx=scrollX,sy=scrollY;
    const f=document.createElement('div');f.className='ve-f';
    f.style.cssText=\`position:absolute;top:\${r.bottom+sy+8}px;left:\${r.left+sx}px;min-width:320px;max-width:320px;background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.15),0 0 0 1px rgba(0,0,0,.05);z-index:100001;display:flex;align-items:center;padding:8px 12px;gap:8px;display:flex;flex-direction:column;align-items:stretch;font-family:-apple-system,sans-serif\`;
    
    const pcList = document.createElement('div');
    pcList.className = 've-pclist';
    pcList.style.cssText = 'display:none;gap:8px;flex-wrap:wrap;padding-bottom:8px;border-bottom:1px solid #f3f4f6;margin-bottom:2px';
    
    const ir = document.createElement('div');
    ir.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%';
    
    const bb=document.createElement('button');bb.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
    bb.style.cssText='background:transparent;border:none;cursor:pointer;padding:6px;color:#6b7280;display:flex;border-radius:6px;transition:all 0.2s';
    bb.onmouseenter = () => { bb.style.background = '#f3f4f6'; bb.style.color = '#374151'; };
    bb.onmouseleave = () => { bb.style.background = 'transparent'; bb.style.color = '#6b7280'; };
    bb.onclick=clsF;
    
    let selectedFiles = [];
    
    const handleFiles = (newFiles) => {
      if (newFiles.length === 0) return;
      const { validFiles, errors } = validateUploadFiles(newFiles, { currentCount: selectedFiles.length });
      if (errors.length > 0) {
        const t = CONFIG.translations[CONFIG.language] || CONFIG.translations['en'];
        errors.forEach(e => {
          let title = '';
          let msg = '';
          if (e.key === 'upload.tooManyFiles') {
             title = t.tooManyFilesTitle || 'Upload limit reached';
             msg = (t.tooManyFiles || 'Too many files (max {{max}}).').replace('{{max}}', e.params.max).replace('{{current}}', e.params.current);
          }
          if (e.key === 'upload.fileTooLarge') {
             title = t.fileTooLargeTitle || 'File too large';
             msg = (t.fileTooLarge || 'Files too large: {{rejected}}.').replace('{{rejected}}', e.params.rejected).replace('{{maxImage}}', e.params.maxImage);
          }
          if (e.key === 'upload.totalTooLarge') {
             title = t.totalTooLargeTitle || 'Total size exceeded';
             msg = (t.totalTooLarge || 'Total size too large (max {{max}}).').replace('{{max}}', e.params.max).replace('{{total}}', e.params.total);
          }
          if (e.key === 'upload.invalidFileType') {
             title = t.invalidFileTypeTitle || 'Invalid file type';
             msg = t.invalidFileType || 'Invalid file type.';
          }
          showToast(title, msg);
        });
      }
      if (validFiles.length > 0) {
        selectedFiles = [...selectedFiles, ...validFiles];
        renderPreviews();
        upd();
      }
    };
    
    const ab=document.createElement('button');ab.className='ve-ab';ab.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    ab.style.cssText='background:transparent;border:none;cursor:pointer;padding:6px;color:#6b7280;display:flex;border-radius:6px;transition:all 0.2s';
    ab.onmouseenter = () => { if(!iS && !inputDisabled) { ab.style.background = '#f3f4f6'; ab.style.color = '#374151'; } };
    ab.onmouseleave = () => { if(!iS && !inputDisabled) { ab.style.background = 'transparent'; ab.style.color = '#6b7280'; } };
    
    const fi=document.createElement('input');fi.type='file';fi.accept='image/*';fi.multiple=true;fi.style.display='none';
    ab.onclick = () => { if(!iS && !inputDisabled) fi.click(); };
    
    const t = CONFIG.translations[CONFIG.language] || CONFIG.translations['en'];
    if (t.uploadImage) ab.title = t.uploadImage;
    const ip=document.createElement('input');ip.type='text';ip.placeholder=t.placeholder;
    ip.style.cssText='flex:1;border:none;outline:none;font-size:14px;color:#374151;background:transparent;min-width:0';
    const sb=document.createElement('button');
    sb.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg>';
    sb.disabled=true;
    sb.style.cssText=\`background:\${SB};opacity:0.5;border:none;cursor:not-allowed;padding:8px;color:white;display:flex;border-radius:8px;transition:all 0.2s;box-shadow:0 2px 4px rgba(0,0,0,0.1)\`;
    aSB=sb;
    
    const upd=()=>{
      if(iS||inputDisabled)return;
      const h=ip.value.trim().length>0;
      sb.disabled=!h;sb.style.background=SB;sb.style.opacity=h?'1':'0.5';sb.style.cursor=h?'pointer':'not-allowed';
      if(h) {
        sb.style.transform = 'translateY(-1px)';
        sb.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
      } else {
        sb.style.transform = 'none';
        sb.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      }
    };
    
    const renderPreviews = () => {
      pcList.innerHTML = '';
      if(selectedFiles.length === 0) {
        pcList.style.display = 'none';
      } else {
        pcList.style.display = 'flex';
        selectedFiles.forEach((file, index) => {
          const pc = document.createElement('div');
          pc.style.cssText = 'position:relative;align-items:center;justify-content:center;width:44px;height:44px;border-radius:6px;border:1px solid #e5e7eb;overflow:hidden;flex-shrink:0;box-shadow:0 1px 2px rgba(0,0,0,0.05)';
          const pcImg = document.createElement('img');
          pcImg.style.cssText = 'width:100%;height:100%;object-fit:cover';
          pcImg.src = URL.createObjectURL(file);
          pc.append(pcImg);
          const pcBtn = document.createElement('button');
          pcBtn.className = 've-pc-btn';
          pcBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
          pcBtn.style.cssText = 'position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.5);border:none;cursor:pointer;padding:3px;color:#fff;display:flex;border-radius:4px;transition:background 0.2s;backdrop-filter:blur(2px)';
          
          pcBtn.onmouseenter = () => { if(!iS && !inputDisabled) pcBtn.style.background = 'rgba(0,0,0,0.8)'; };
          pcBtn.onmouseleave = () => { if(!iS && !inputDisabled) pcBtn.style.background = 'rgba(0,0,0,0.5)'; };
          
          pcBtn.onclick = () => {
            if(iS || inputDisabled) return;
            selectedFiles.splice(index, 1);
            URL.revokeObjectURL(pc.querySelector('img').src);
            renderPreviews();
            upd();
          };
          
          pc.append(pcBtn);
          pcList.append(pc);
        });
      }
      if(inputDisabled) {
        const btns = pcList.querySelectorAll('.ve-pc-btn');
        btns.forEach(btn => {
          btn.disabled = true;
          btn.style.opacity = '0.5';
          btn.style.cursor = 'not-allowed';
        });
      }
    };
    
    ip.oninput=upd;
    ip.onkeydown=(e)=>{if(e.key==='Enter'&&(ip.value.trim().length>0)&&!iS&&!inputDisabled)sub(ip.value.trim(), selectedFiles);else if(e.key==='Escape')clsF()};
    sb.onclick=()=>{if((ip.value.trim().length>0)&&!iS&&!inputDisabled)sub(ip.value.trim(), selectedFiles)};
    
    fi.onchange = (e) => {
      const newFiles = Array.from(e.target.files);
      if(newFiles.length > 0) {
        handleFiles(newFiles);
      }
      fi.value = '';
    };
    
    const cb=document.createElement('button');cb.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    cb.style.cssText='background:none;border:none;cursor:pointer;padding:4px;color:#6b7280;display:flex;border-radius:4px';cb.onclick=clsF;
    const dv=document.createElement('div');dv.style.cssText='width:1px;background:#e5e7eb;height:24px;margin-left:5px';
    
    ir.append(bb,ip,ab,fi,sb,dv,cb);
    f.append(pcList, ir);
    document.body.appendChild(f);aF=f;
    f.addEventListener('mouseenter',clrH);f.addEventListener('click',e=>e.stopPropagation());
    
    f.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!inputDisabled && !iS) {
        f.style.borderColor = SB;
        f.style.background = '#f9fafb';
      }
    });
    f.addEventListener('dragleave', (e) => {
      e.preventDefault();
      f.style.borderColor = '#f3f4f6';
      f.style.background = '#fff';
    });
    f.addEventListener('drop', (e) => {
      e.preventDefault();
      f.style.borderColor = '#f3f4f6';
      f.style.background = '#fff';
      if (inputDisabled || iS) return;
      const newFiles = Array.from(e.dataTransfer.files);
      if (newFiles.length > 0) {
        handleFiles(newFiles);
      }
    });
    f.addEventListener('paste', (e) => {
      if (inputDisabled || iS) return;
      const items = (e.clipboardData || window.clipboardData).items;
      const newFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          newFiles.push(items[i].getAsFile());
        }
      }
      if (newFiles.length > 0) {
        e.preventDefault();
        handleFiles(newFiles);
      }
    });
    setTimeout(()=>ip.focus(),50);
    const fr=f.getBoundingClientRect();
    if(fr.right>innerWidth)f.style.left=\`\${innerWidth-fr.width-16}px\`;
    if(fr.bottom>innerHeight)f.style.top=\`\${r.top+sy-fr.height-8}px\`;
    if(inputDisabled){
      ip.disabled=true;ip.style.opacity='0.5';ip.style.cursor='not-allowed';
      sb.disabled=true;sb.style.opacity='0.5';sb.style.cursor='not-allowed';
      ab.disabled=true;ab.style.opacity='0.5';ab.style.cursor='not-allowed';
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
      const ab = aF.querySelector('.ve-ab');
      if (ab && t.uploadImage) ab.title = t.uploadImage;
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
    if (!aF) return;
    const ip = aF.querySelector('input[type="text"]');
    if (ip) {
      ip.disabled = !!disabled;
      ip.style.opacity = disabled ? '0.5' : '1';
      ip.style.cursor = disabled ? 'not-allowed' : 'text';
    }
    const ab = aF.querySelector('.ve-ab');
    if (ab) {
      ab.disabled = !!disabled;
      ab.style.opacity = disabled ? '0.5' : '1';
      ab.style.cursor = disabled ? 'not-allowed' : 'pointer';
    }
    const pcBtns = aF.querySelectorAll('.ve-pc-btn');
    pcBtns.forEach(btn => {
      btn.disabled = !!disabled;
      btn.style.opacity = disabled ? '0.5' : '1';
      btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    });
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
