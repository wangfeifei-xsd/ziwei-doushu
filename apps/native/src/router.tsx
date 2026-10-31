import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation, useParams, useNavigate, Link } from 'react-router-dom';
import { NavigationProvider, type NavigationAdapter } from '@ziwei/runtime/navigation';
import { useServices } from '@ziwei/runtime/services';
import { closeTopModal, hasModal } from '@ziwei/runtime/modal';
import { isTauri, invoke } from '@tauri-apps/api/core';

const pages={home:lazy(()=>import('@ziwei/features/pages/home')),qipan:lazy(()=>import('@ziwei/features/pages/qipan')),chart:lazy(()=>import('@ziwei/features/pages/chart')),heming:lazy(()=>import('@ziwei/features/pages/heming')),profiles:lazy(()=>import('@ziwei/features/pages/profiles')),model:lazy(()=>import('@ziwei/features/pages/model')),knowledge:lazy(()=>import('@ziwei/features/pages/knowledge')),library:lazy(()=>import('@ziwei/features/pages/library')),search:lazy(()=>import('@ziwei/features/pages/search')),book:lazy(()=>import('@ziwei/features/pages/book')),chapter:lazy(()=>import('@ziwei/features/pages/chapter')),detail:lazy(()=>import('@ziwei/features/pages/knowledge-detail')),privacy:lazy(()=>import('@ziwei/features/pages/privacy')),terms:lazy(()=>import('@ziwei/features/pages/terms')),preview:lazy(()=>import('@ziwei/features/pages/preview')),notfound:lazy(()=>import('@ziwei/features/pages/not-found'))};
const adapter:NavigationAdapter={
  Link:({href,...props})=>{const services=useServices();return /^https?:\/\//i.test(href)?<a {...props} href={href} onClick={event=>{event.preventDefault();void services.files.openExternal(href);}}/>:<Link {...props} to={href}/>;},
  useRouter:()=>{const navigate=useNavigate();return {push:path=>void navigate(path),replace:path=>void navigate(path,{replace:true}),back:()=>void navigate(-1)};},
  usePathname:()=>useLocation().pathname,useSearchParams:()=>new URLSearchParams(useLocation().search),
};
function Book(){const p=useParams();return <pages.book params={{book:p.book!}}/>;}
function Chapter(){const p=useParams();if(!/^\d+$/.test(p.chapter||''))return <pages.notfound/>;return <pages.chapter params={{book:p.book!,chapter:p.chapter!}}/>;}
function Detail(){const p=useParams();return <pages.detail params={{star:p.star!,topic:p.topic!}}/>;}
function Search(){const location=useLocation();return <pages.search searchParams={{q:new URLSearchParams(location.search).get('q')||''}}/>;}
export function NativeNavigation({children}:{children:React.ReactNode}){
 const location=useLocation();
 const navigate=useNavigate();
 useEffect(()=>{
   if(!isTauri())return;
   const sync=()=>{void invoke('system_navigation',{intercept:hasModal()||location.pathname!=='/',light:document.documentElement.dataset.theme==='light'}).catch(()=>{});};
   const back=()=>{if(closeTopModal())return;if(location.pathname!=='/'){if((window.history.state?.idx||0)>0)void navigate(-1);else void navigate('/');}};
   sync();window.addEventListener('ziwei-modal-change',sync);window.addEventListener('ziwei-system-back',back);
   const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
   return()=>{observer.disconnect();window.removeEventListener('ziwei-modal-change',sync);window.removeEventListener('ziwei-system-back',back);};
 },[location.pathname,navigate]);
 useEffect(()=>{
   if(!location.hash){window.scrollTo(0,0);return;}
   let anchor:string;try{anchor=decodeURIComponent(location.hash.slice(1));}catch{return;}
   const scroll=()=>{const element=document.getElementById(anchor);if(!element)return false;element.scrollIntoView();return true;};
   if(scroll())return;
   const observer=new MutationObserver(()=>{if(scroll())observer.disconnect();});observer.observe(document.getElementById('root')!,{childList:true,subtree:true});
   const timer=setTimeout(()=>observer.disconnect(),10000);
   return()=>{clearTimeout(timer);observer.disconnect();};
 },[location.pathname,location.hash]);
 return <NavigationProvider adapter={adapter}>{children}</NavigationProvider>;
}
export function NativeBackButton(){
 const location=useLocation();const navigate=useNavigate();
 return location.pathname==='/'?null:<nav className="native-back" aria-label="页面返回"><button onClick={()=>{if(!closeTopModal()){if((window.history.state?.idx||0)>0)void navigate(-1);else void navigate('/');}}}>‹ 返回</button></nav>;
}
export function AppRoutes(){return <Suspense fallback={<p role="status" className="p-8">正在载入…</p>}><Routes>
 <Route path="/" element={<pages.home/>}/><Route path="/qipan" element={<pages.qipan/>}/><Route path="/chart" element={<pages.chart/>}/><Route path="/heming" element={<pages.heming/>}/><Route path="/profiles" element={<pages.profiles/>}/><Route path="/settings/model" element={<pages.model/>}/><Route path="/knowledge" element={<pages.knowledge/>}/><Route path="/knowledge/:star/:topic" element={<Detail/>}/><Route path="/library" element={<pages.library/>}/><Route path="/library/search" element={<Search/>}/><Route path="/library/:book" element={<Book/>}/><Route path="/library/:book/:chapter" element={<Chapter/>}/><Route path="/privacy" element={<pages.privacy native/>}/><Route path="/terms" element={<pages.terms/>}/><Route path="/preview" element={<pages.preview/>}/><Route path="*" element={<pages.notfound/>}/>
 </Routes></Suspense>;}
