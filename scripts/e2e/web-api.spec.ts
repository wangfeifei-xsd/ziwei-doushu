import {test,expect}from'@playwright/test';
import {createServer}from'node:http';
test('Web API: H2 原始时间、密钥遮罩/保留/清除、双协议实际流',async({request},info)=>{
 test.skip(info.project.name!=='web','原生服务由 Rust 集成测试验证。');
 const server=createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;const data=JSON.parse(text);expect(req.headers.authorization).toBe('Bearer fixture-only-key');res.writeHead(200,{'Content-Type':'text/event-stream'});if(req.url?.endsWith('/responses')){expect(data.store).toBe(false);res.write('data: {"type":"response.output_text.delta","delta":"紫微"}\n\n');setTimeout(()=>res.end('data: {"type":"response.output_text.delta","delta":"斗数"}\n\ndata: {"type":"response.completed"}\n\n'),80);}else{res.write('data: {"choices":[{"delta":{"content":"紫微"}}]}\n\n');setTimeout(()=>res.end('data: {"choices":[{"delta":{"content":"斗数"}}]}\n\ndata: [DONE]\n\n'),80);}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address()as{port:number}).port;
 try{
  const form={name:'API 测试',year:'2000',month:'1',day:'31',clockHour:'23',clockMinute:'30',unknownTime:false,province:'',city:'',longitude:120,gender:'female'};
  const saved=await(await request.post('/api/profiles',{data:form})).json();expect(saved.profile.form.day).toBe('31');const loaded=await(await request.get(`/api/profiles/${saved.profile.id}`)).json();expect(loaded.profile.form.clockHour).toBe('23');expect((await request.delete(`/api/profiles/${saved.profile.id}`)).ok()).toBe(true);
  for(const mode of ['chat','responses']){
   const draft={baseURL:`http://127.0.0.1:${port}/v1`,model:'fixture',mode,apiKey:'fixture-only-key'};
   const result=await request.put('/api/settings/model',{data:draft});expect(result.ok()).toBe(true);const publicConfig=await(await request.get('/api/settings/model')).json();expect(publicConfig.settings.apiKey).toBe('');expect(publicConfig.settings.hasApiKey).toBe(true);
   const preserved=await request.put('/api/settings/model',{data:{...draft,apiKey:''}});expect(preserved.ok()).toBe(true);
   const tested=await request.post('/api/settings/model/test',{data:{...draft,apiKey:''}});expect(tested.ok()).toBe(true);
  }
  expect((await request.delete('/api/settings/model',{headers:{Origin:'https://external.example'}})).status()).toBe(403);
  expect((await request.delete('/api/settings/model')).ok()).toBe(true);const cleared=await(await request.get('/api/settings/model')).json();expect(cleared.settings.hasApiKey).toBe(false);expect(cleared.settings.configured).toBe(false);expect(cleared.settings.apiKey).toBe('');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
