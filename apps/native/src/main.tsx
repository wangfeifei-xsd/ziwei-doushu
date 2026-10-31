import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { isTauri } from '@tauri-apps/api/core';
import { ServicesProvider, type AppServices } from '@ziwei/runtime/services';
import { configureWebsite } from '@ziwei/runtime/site';
import { ThemeProvider } from '@ziwei/ui/components/ThemeProvider';
import SiteHeader from '@ziwei/ui/components/SiteHeader';
import { AppRoutes, NativeNavigation, NativeBackButton } from './router';
import { createNativeServices } from './adapters/native';
import { previewServices } from './adapters/preview';
import '@ziwei/ui/styles/globals.css';
import '@ziwei/ui/styles/celestial.css';
import './native.css';

function App({services}:{services:AppServices}){
 const [error,setError]=useState('');
 useEffect(()=>{const listener=(event:Event)=>setError((event as CustomEvent<string>).detail);window.addEventListener('ziwei-storage-error',listener);return()=>window.removeEventListener('ziwei-storage-error',listener);},[]);
 return <ServicesProvider services={services}><HashRouter><NativeNavigation><ThemeProvider>
   {services.platform==='preview'&&<div className="preview-notice" role="status">浏览器样式预览 · 档案、密钥和系统分享请在原生应用中验证</div>}
   {error&&<div role="alert" className="preview-notice">{error}<button onClick={()=>setError('')} aria-label="关闭提示"> ×</button></div>}
   <SiteHeader/><NativeBackButton/><div className="site-content"><AppRoutes/></div>
 </ThemeProvider></NativeNavigation></HashRouter></ServicesProvider>;
}
async function start(){
 const website=import.meta.env.VITE_SITE_URL||'';configureWebsite(website,false);
 const services=isTauri()?(await createNativeServices(website)).services:previewServices(website);
 createRoot(document.getElementById('root')!).render(<App services={services}/>);
}
void start().catch(error=>{
 const root=document.getElementById('root')!;root.replaceChildren();
 const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=`无法初始化本地数据：${String(error)}。原始数据文件未删除。`;root.append(message);
 const retry=document.createElement('button');retry.textContent='重新启动';retry.onclick=()=>location.reload();root.append(retry);
});
