const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
try{
  const [e,identity]=await Promise.all(['/releases/latest.json','/releases/public-key.json'].map(url=>fetch(url,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();})));
  if(e.algorithm!=='Ed25519')throw Error();const data=bytes(e.payload),key=await crypto.subtle.importKey('spki',bytes(identity.publicKey),{name:'Ed25519'},false,['verify']);
  if(!await crypto.subtle.verify('Ed25519',key,bytes(e.signature),data))throw Error();
  const m=JSON.parse(new TextDecoder().decode(data));if(m.modId!=='erosionsector'||m.keyId!==identity.keyId||!m.downloadUrl.startsWith('https://github.com/AetrKD/erosion-sector-releases/releases/'))throw Error();
  document.querySelector('#version').textContent='Erosion Sector '+m.version;document.querySelector('#download').href=m.downloadUrl;document.querySelector('#fingerprint').textContent='배포 서명 확인 완료 · JAR SHA-256: '+m.sha256;
}catch{document.querySelector('#version').textContent='배포 서명을 확인할 수 없습니다. GitHub Releases에서 확인하세요.';}
