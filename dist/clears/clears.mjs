const form=document.querySelector('#lookup'),input=document.querySelector('#player-id'),status=document.querySelector('#status'),result=document.querySelector('#result'),rows=document.querySelector('#clears'),more=document.querySelector('#more');let current='',cursor='';
async function load(id,append=false){
  if(!append){result.hidden=true;rows.replaceChildren();cursor='';}status.textContent='클리어 기록을 불러오는 중이에요.';form.querySelector('button').disabled=true;more.disabled=true;
  try{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error('게임에서 받은 플레이어 ID를 입력해 주세요.');
    const response=await fetch('/api/clears?playerId='+encodeURIComponent(id)+(append?'&after='+encodeURIComponent(cursor):''),{cache:'no-store'});if(!response.ok)throw Error('클리어 기록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    const data=await response.json();if(data.playerId!==id.toLowerCase())throw Error('플레이어 정보가 일치하지 않아요.');
    for(const entry of data.clears){const article=document.createElement('article'),title=document.createElement('h3'),meta=document.createElement('p');title.textContent='✓ '+entry.stageName;meta.textContent=[entry.chapter,entry.missionCode,'최초 클리어 '+new Date(entry.clearedAt).toLocaleDateString('ko-KR')].filter(Boolean).join(' · ');article.append(title,meta);rows.append(article);}
    document.querySelector('#summary').textContent='클리어한 스테이지 '+data.total+'개';cursor=data.nextCursor||'';more.hidden=!cursor;current=id;result.hidden=false;status.textContent=data.total?'클리어 기록을 불러왔어요.':'아직 클리어한 스테이지가 없어요.';history.replaceState(null,'','?playerId='+encodeURIComponent(id));
  }catch(e){status.textContent=e.message;}finally{form.querySelector('button').disabled=false;more.disabled=false;}
}
form.addEventListener('submit',e=>{e.preventDefault();load(input.value.trim());});more.addEventListener('click',()=>load(current,true));const initial=new URL(location.href).searchParams.get('playerId');if(initial){input.value=initial;load(initial);}
