import type { AppServices } from '@ziwei/runtime/services';
function unavailable(): never { throw new Error('当前为浏览器样式预览。请运行 npm run dev:app 使用本地档案和模型连接。'); }
export function previewServices(websiteURL:string):AppServices {
  return {platform:'preview',websiteURL,
    profiles:{list:async()=>unavailable(),get:async()=>unavailable(),save:async()=>unavailable(),update:async()=>unavailable(),remove:async()=>unavailable()},
    ai:{async *stream(){unavailable();}},
    model:{get:async()=>({baseURL:'',model:'',mode:'chat',apiKey:'',hasApiKey:false,configured:false,source:'session'}),save:async()=>unavailable(),test:async()=>unavailable(),clear:async()=>unavailable()},
    files:{importJSON:async()=>unavailable(),exportJSON:async()=>unavailable(),exportImage:async()=>unavailable(),copyText:text=>navigator.clipboard.writeText(text),openExternal:async url=>{if(/^https?:\/\//.test(url))window.open(url,'_blank','noopener,noreferrer');}},
  };
}
