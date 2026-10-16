const form=document.querySelector('#lookup'),input=document.querySelector('#record-id'),status=document.querySelector('#status'),result=document.querySelector('#result');
async function load(id){
  result.hidden=true;status.textContent='기록을 확인하고 있어요.';form.querySelector('button').disabled=true;
  try{if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('올바른 기록 ID를 입력해 주세요.');const response=await fetch('/api/records?id='+encodeURIComponent(id),{cache:'no-store'});if(!response.ok)throw Error(response.status===404?'해당 기록을 찾을 수 없어요.':'기록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');const data=await response.json();
    document.querySelector('#stage').textContent=data.stageName;document.querySelector('#outcome').textContent=data.success?'임무 성공':'임무 실패';
    const fields=[['스테이지',data.stageId],['종료 시각',new Date(data.finishedAt).toLocaleString('ko-KR')],['소요 시간',Math.floor(data.durationMs/60000)+'분 '+Math.floor(data.durationMs%60000/1000)+'초'],['참가 인원',data.partySize+'명'],['완료 목표',data.completedObjectives+'개'],['모드 버전',data.integrity.version||'알 수 없음'],['기록 ID',data.recordId]];
    const dl=document.querySelector('#details');dl.replaceChildren();for(const [label,value] of fields){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value);dl.append(dt,dd);}
    document.querySelector('#integrity').textContent=data.artifactMatch?'제출된 해시가 공식 서명된 배포 파일과 일치합니다. 플레이 검증은 제공하지 않습니다.':'제출된 정보로 공식 배포 파일과의 일치를 확인할 수 없습니다.';
    result.hidden=false;status.textContent='기록을 불러왔어요.';history.replaceState(null,'','?id='+encodeURIComponent(id));
  }catch(e){status.textContent=e.message;}finally{form.querySelector('button').disabled=false;}
}
form.addEventListener('submit',e=>{e.preventDefault();load(input.value.trim());});const initial=new URL(location.href).searchParams.get('id');if(initial){input.value=initial;load(initial);}
