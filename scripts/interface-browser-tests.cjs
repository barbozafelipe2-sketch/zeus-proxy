// Requires Playwright and its Chromium browser (or ZEUS_CHROMIUM_PATH).
// Every request is intercepted: no production data, provider calls or credentials.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve('public');
const project={id:'project1',name:'Home',description:'Files',goal:'Settings',status:'IN_PROGRESS',conversation_id:'chat1',progress:20};
const file={id:'file1',project_id:'project1',filename:'relatorio_com_nome_longo_para_conferir_a_leitura_em_telas_pequenas.txt',mime_type:'text/plain',size:128,downloadUrl:'/api/file-download?id=file1',previewUrl:'/api/file-preview?id=file1',metadata:{extractable:true,extractionStatus:'analyzable'}};
const markdown='# Análise\n\n**Prioridade alta**\n\n| Item | Estado |\n| --- | --- |\n| Testes | OK |\n\n```js\nconsole.log("exemplo");\n```\n\n[Seguro](https://example.com) [Perigoso](javascript:alert(1))\n<img src=x onerror="window.__xss=1"><script>window.__xss=1</script><iframe src="https://example.com"></iframe>';
(async()=>{
 const browser=await chromium.launch({...(process.env.ZEUS_CHROMIUM_PATH?{executablePath:process.env.ZEUS_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   assert.equal(u.origin,'https://zeus.test','the reading surface must not fetch third-party resources');
   if(u.pathname.startsWith('/api/')){
    if(['/api/file-preview','/api/file-download'].includes(u.pathname))return route.fulfill({body:'Settings',contentType:'text/plain; charset=utf-8'});
    const data=u.pathname==='/api/health'?{capabilities:{chat:true,webSearch:true,imageGeneration:true},capabilityReadiness:{chat:'configured_unverified',imageGeneration:'configured_unverified'}}:
     u.pathname==='/api/chat'?{conversation:{id:'chat1',title:'Test',project_id:u.searchParams.has('projectId')?'project1':null},messages:[{id:'m1',role:'user',content:'**Texto do usuário**'},{id:'m2',role:'assistant',mode:'ZEUS',content:markdown}],files:[],artifacts:[]}:
     u.pathname==='/api/tasks'?{tasks:[{id:'task1',title:'Files',status:'TODO',priority:'HIGH'}]}:
     u.pathname==='/api/memories'?{memories:[{id:'memory1',type:'manual_note',content:'Home',source:'manual'}]}:
     {conversations:[{id:'chat1',title:'Revisão do Zeus'}],projects:[project],files:[file],artifacts:[]};
    return route.fulfill({json:data});
   }
   const assetPath=path.join(root,u.pathname==='/'?'index.html':u.pathname);
   if(!fs.existsSync(assetPath))return route.fulfill({status:404,body:'missing'});
   return route.fulfill({body:fs.readFileSync(assetPath),contentType:/\.m?js$/.test(assetPath)?'text/javascript':assetPath.endsWith('.css')?'text/css':assetPath.endsWith('.html')?'text/html':'application/octet-stream'});
  });
  await page.addInitScript(()=>{
   localStorage.setItem('olyhub.zeusproxy.access.v3','fictional-private-access-1234567890123456789');
   Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text}}});
  });
  const go=async()=>{await page.goto('https://zeus.test');await page.getByRole('heading',{name:'O que vamos fazer hoje?'}).waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  for(const width of [320,390,768,959,960,1440]){
   await page.setViewportSize({width,height:width===320?568:900});await go();
   assert.equal(await page.locator('html').getAttribute('lang'),'pt-BR');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await page.locator('.mode-card small').first().isVisible(),true);
   assert.equal(await page.locator('.mode-blurb').isVisible(),true);
   await page.locator('#composer-text').fill('Meu rascunho');await page.locator('#attach').click();
   assert.equal(await page.locator('#composer-text').inputValue(),'Meu rascunho');await page.keyboard.press('Escape');
   if(width<960){
    await page.locator('#composer-text').focus();
    for(let i=0;i<25;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.sidebar')),false,'closed drawer must never receive focus');}
    await page.locator('#hamburger').click();await page.locator('.side-nav button.active').focus();
    for(let i=0;i<25;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.sidebar')),true,'open drawer must trap forward focus');}
    for(let i=0;i<25;i++){await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.sidebar')),true,'open drawer must trap reverse focus');}
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'hamburger');
    await page.locator('#hamburger').click();await page.locator('#close-navigation').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'hamburger');
   }else assert.equal(await page.locator('#hamburger').isVisible(),false);
   if(process.env.ZEUS_UI_SCREENSHOTS){fs.mkdirSync(process.env.ZEUS_UI_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.ZEUS_UI_SCREENSHOTS,`home-${width}.png`),fullPage:true});}
  }
  await page.setViewportSize({width:390,height:844});await go();
  await page.locator('#hamburger').click();await page.locator('[data-conv="chat1"]').click();await page.locator('.markdown-body h1').waitFor();
  assert.equal(await page.locator('.markdown-body h1').innerText(),'Análise');
  assert.equal(await page.locator('.markdown-body table').count(),1);
  assert.equal(await page.locator('.message.user .message-body').innerText(),'**Texto do usuário**');
  assert.equal(await page.locator('.markdown-body img,.markdown-body script,.markdown-body iframe,.markdown-body [onerror]').count(),0);
  assert.equal(await page.evaluate(()=>window.__xss),undefined);
  assert.equal(await page.locator('.markdown-body a[href^="javascript:"]').count(),0);
  assert.equal(await page.getByText('Perigoso',{exact:true}).getAttribute('href'),null,'a stripped unsafe URL must remain inert');
  assert.equal(await page.locator('.markdown-body a[href="https://example.com/"]').getAttribute('rel'),'noopener noreferrer');
  await page.locator('.copy-code').click();assert.equal(await page.evaluate(()=>window.__copied),'console.log("exemplo");\n');
  if(process.env.ZEUS_UI_SCREENSHOTS)await page.screenshot({path:path.join(process.env.ZEUS_UI_SCREENSHOTS,'chat-390.png'),fullPage:true});
  for(const tab of ['Tools','Files','Settings','Projects']){
   await page.locator('#hamburger').click();await page.locator(`.side-nav [data-tab="${tab}"]`).click();
   await page.waitForFunction(heading=>document.querySelector('.page h1')?.textContent===heading,({Tools:'Ferramentas',Files:'Arquivos e resultados',Settings:'Configurações',Projects:'Projetos'})[tab]);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${tab} must fit mobile`);
  }
  assert.equal(await page.locator('.proj-body strong').innerText(),'Home','user-defined project names must not be translated');
  await page.locator('[data-project="project1"]').click();await page.locator('.project-title-row h1').waitFor();
  assert.equal(await page.locator('.project-title-row h1').innerText(),'Home');
  assert.equal(await page.locator('.project-title-row p').innerText(),'Files');
  for(const section of ['OVERVIEW','TASKS','FILES','MEMORY','CHAT']){
   await page.locator(`[data-project-section="${section}"]`).first().click();
   await page.waitForFunction(section=>document.querySelector('.workspace-tabs [aria-current="page"]')?.dataset.projectSection===section,section);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`project ${section} must fit mobile`);
  }
  for(const width of [320,390]){
   await page.setViewportSize({width,height:width===320?568:844});
   for(const section of ['TASKS','FILES','MEMORY']){
    await page.locator(`[data-project-section="${section}"]`).first().click();
    await page.waitForFunction(section=>document.querySelector('.workspace-tabs [aria-current="page"]')?.dataset.projectSection===section,section);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${section} with content must fit ${width}px`);
    if(section==='TASKS')assert.equal(await page.locator('.task-item strong').innerText(),'Files');
    if(section==='MEMORY')assert.equal(await page.locator('.memory-item p').innerText(),'Home');
    if(section==='FILES'){
     assert.equal(await page.locator('.out-row strong').innerText(),file.filename);
     assert.ok((await page.locator('.out-row small').innerText()).includes('pronto para análise'));
     await page.locator('[data-open-output]').first().click();await page.locator('.private-preview-text').waitFor();
     assert.equal(await page.locator('.private-preview-text').innerText(),'Settings');await page.locator('#private-preview-close').click();
    }
    if(process.env.ZEUS_UI_SCREENSHOTS)await page.screenshot({path:path.join(process.env.ZEUS_UI_SCREENSHOTS,`project-${section}-${width}.png`),fullPage:true});
   }
   await page.locator('#edit-project').click();await page.locator('#project-edit-form').waitFor();
   assert.equal(await page.locator('#edit-project-name').inputValue(),'Home');assert.equal(await page.locator('#edit-project-goal').inputValue(),'Settings');
   assert.equal(await page.locator('label[for="edit-project-description"]').innerText(),'Descrição');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'project editor must fit mobile');
   await page.locator('#project-edit-submit').scrollIntoViewIfNeeded();
   assert.ok(await page.locator('.modal').evaluate(el=>el.scrollWidth<=el.clientWidth),'project editor must not require horizontal scrolling');
   assert.ok(await page.locator('#project-edit-submit').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight),'save action must be reachable inside the mobile dialog');
   if(process.env.ZEUS_UI_SCREENSHOTS)await page.screenshot({path:path.join(process.env.ZEUS_UI_SCREENSHOTS,`project-edit-${width}.png`),fullPage:true});
   await page.locator('#modal-cancel').click();
  }
  await page.locator('#hamburger').click();await page.locator('#logout').click();await page.getByRole('button',{name:'Desbloquear Zeus'}).waitFor();
  assert.deepEqual(errors,[],'interface must have no uncaught browser errors');
  console.log('Interface: responsive layout, Portuguese, protected user content, drawer focus, Markdown XSS filtering and code copy: PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
