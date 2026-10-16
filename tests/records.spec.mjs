import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
test('live record API persists, deduplicates and renders a self-reported result',async({page,request})=>{
  const envelope=await request.get('/releases/latest.json');expect(envelope.ok()).toBe(true);const signed=await envelope.json(),manifest=JSON.parse(Buffer.from(signed.payload,'base64').toString('utf8'));
  const record={recordId:randomUUID(),stageId:'integration-smoke',stageName:'연동 확인용 테스트 기록',success:true,finishedAt:new Date().toISOString(),completedObjectives:1,durationMs:65000,partySize:1,integrity:{status:'verified',version:manifest.version,sha256:manifest.sha256,keyId:manifest.keyId,artifactVerifiedLocally:true,runtimeAttested:false}};
  const created=await request.post('/api/records',{data:record});expect(created.status()).toBe(201);expect((await created.json()).artifactMatch).toBe(true);
  expect((await request.post('/api/records',{data:record})).status()).toBe(200);expect((await request.post('/api/records',{data:{...record,success:false}})).status()).toBe(409);
  await page.goto('/records/?id='+record.recordId);await expect(page.locator('#stage')).toHaveText(record.stageName);await expect(page.locator('#outcome')).toHaveText('임무 성공');await expect(page.locator('#integrity')).toContainText('플레이 검증은 제공하지 않습니다');
  const fetched=await request.get('/api/records?id='+record.recordId);const body=await fetched.json();expect(body.trust).toBe('self-reported');expect(body.integrity.runtimeAttested).toBe(false);expect(body.players).toBeUndefined();
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/official-record.png'});await writeFile('artifacts/record-smoke.json',JSON.stringify({recordId:record.recordId,url:page.url()}));
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('release page verifies its signature and offers only the official binary URL',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/releases/');await expect(page.locator('#fingerprint')).toContainText('배포 서명 확인 완료');await expect(page.locator('#download')).toHaveAttribute('href',/^https:\/\/github\.com\/AetrKD\/erosion-sector-releases\/releases\/download\//);await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
test('record viewer rejects unknown IDs and renders server strings as text',async({page,request})=>{
  expect((await request.get('/api/records?id='+randomUUID())).status()).toBe(404);expect((await request.post('/api/records',{data:{recordId:'wrong'}})).status()).toBe(400);
  const id=randomUUID();await page.route('**/api/records?id=*',route=>route.fulfill({json:{recordId:id,stageId:'safe',stageName:'<img src=x onerror="window.bad=true">',success:false,finishedAt:new Date().toISOString(),durationMs:1000,partySize:1,completedObjectives:0,integrity:{version:'test'},artifactMatch:false}}));await page.goto('/records/?id='+id);await expect(page.locator('#stage')).toContainText('<img');expect(await page.locator('#stage img').count()).toBe(0);expect(await page.evaluate(()=>window.bad)).toBeUndefined();
});
