import {test,expect} from '@playwright/test';
import {scanFixture} from '../tools/scan-fixture.mjs';
import {packStage,unpackStage} from '../dist/stage-file.mjs';
import {readFile} from 'node:fs/promises';
test('author a multi-step random scan and download the same configuration',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  const {project:p}=await scanFixture();await page.locator('#projectInput').setInputFiles({name:'scan.esfile',mimeType:'application/zip',buffer:Buffer.from(packStage(p))});
  await page.locator('[data-section=resources]').click();await page.locator('#managementPanel [data-select-id="security-scan"]').click();
  await page.getByLabel('스캔 반경 · 블록',{exact:true}).fill('2');await page.getByLabel('스캔 반경 · 블록',{exact:true}).press('Tab');
  await expect(page.getByLabel('스캔 중심 기준',{exact:true})).toHaveCount(0);await expect(page.getByLabel('X',{exact:true})).toHaveAttribute('step','1');
  await page.getByLabel('스캔 요구 인원',{exact:true}).selectOption('2');await page.getByLabel('스캔 위치 방식',{exact:true}).selectOption('random');
  await page.locator('[data-scan-add]').click();await expect(page.locator('[data-scan-remove]')).toHaveCount(2);
  await page.getByLabel('3단계 타일',{exact:true}).selectOption('p2');await page.getByLabel('3단계 요구 인원',{exact:true}).selectOption('all');
  const saved=await page.evaluate(()=>EROSIONSECTOR_EDITOR.snapshot());const settings=saved.gimmicks.find(g=>g.id==='security-scan').settings;
  expect(settings.centerAnchor).toBeUndefined();expect(settings.radius).toBe(2);expect(settings.requiredPlayers).toBe(2);expect(settings.positionMode).toBe('random');expect(settings.steps[1].placementId).toBe('p2');
  await page.screenshot({path:'artifacts/scan-settings.png'});expect(errors).toEqual([]);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action=save]').first().click()]);
  expect(download.suggestedFilename()).toMatch(/\.esfile$/);const round=unpackStage(await readFile(await download.path()));expect(round.gimmicks.find(g=>g.id==='security-scan').settings).toEqual(settings);
});
