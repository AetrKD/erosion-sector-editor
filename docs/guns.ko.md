# Erosion Sector 총기 설정

마인크래프트 폴더의 es/guns 안에서 관리합니다. .esgun은 UTF-8 JSON 텍스트입니다.

```text
es/
├─ assets/
│  └─ tile/타일셋/타일.nbt
├─ stage/스테이지.esfile
└─ guns/
   ├─ tacz/
   │  ├─ ak47.esgun
   │  └─ glock_17.esgun
   ├─ lang/
   │  ├─ ko_kr.json
   │  └─ en_us.json
   ├─ ammo.esgun
   ├─ supply.json
   └─ 사용법.md
```

## 총기 하나당 파일 하나

tacz/ak47.esgun은 tacz:ak47 총기 하나의 설정 예시입니다. 다른 총기팩은 해당 네임스페이스 폴더에 파일을 만들면 됩니다.
gunId는 실제 TaCZ 총기 ID입니다. item ID인 tacz:modern_kinetic_gun과 다릅니다.
overrides에는 바꾸고 싶은 항목만 나눠 기록할 수 있습니다.

중요: 현재 0.4.9에서는 총기별 .esgun의 성능·슬롯 분류 오버라이드는 아직 읽지 않습니다.
이 파일들은 확장할 설정 형식의 예시이며 _status에도 이 상태를 표시했습니다.
기존 예시의 임의 수치가 게임에 적용되지는 않습니다.
nameKey와 descriptionKey는 해당 총기의 TaCZ 인덱스가 이미 사용하는 번역 키를 기록한 것입니다.
새 키를 이 파일에 적는 기능은 아직 구현되지 않았으므로 아래 언어 파일에서 기존 키의 문구를 바꾸세요.

## 총기 이름·설명 (실제 적용)

lang/ko_kr.json의 아래 값들을 원하는 문구로 변경하세요.

```json
{
  "tacz.gun.ak47.name": "AK-47 돌격소총",
  "tacz.gun.ak47.desc": "시설 탐사를 위한 주무기. 중거리 교전에 적합합니다."
}
```

- 한국어는 ko_kr.json, 영어는 en_us.json입니다. 다른 게임 언어도 같은 언어 코드의 JSON을 만들 수 있습니다.
- 사용 중인 게임 언어에 해당 키가 없으면 영어(en_us)가 기본값이 됩니다. 두 파일 모두에 키가 없으면 TaCZ 원래 문구를 사용합니다.
- 예시에 없는 총기의 키는 TaCZ 총기팩 data/<네임스페이스>/index/guns/<총기>.json의 name, tooltip 값을 확인하세요.
- 기본 TaCZ 총기팩의 번역을 높은 우선순위의 ES 언어 리소스로 덮어씁니다. TaCZ 원본 파일은 수정하지 않습니다.
- 저장한 뒤 관리자 권한으로 /reload 를 실행하면 접속 중인 ES 클라이언트가 자신의 로컬 언어 파일을 다시 읽습니다.
- F3+T로 클라이언트 리소스를 다시 읽어도 적용됩니다.
- 멀티플레이에서는 각 플레이어에게 같은 es/guns/lang 파일을 배포해야 합니다. 서버 파일을 자동 전송하지 않습니다.
- JSON 형식이 잘못되면 해당 언어 파일의 마지막 정상 문구를 유지하고 로그에 오류를 남깁니다.
- 최초 실행 시 예시를 만들고, 이미 존재하는 파일은 덮어쓰지 않습니다. 예시를 끄려면 파일 내용을 {}로 바꾸세요.

## 예비탄·체력 보급 (실제 적용)

ammo.esgun 예시:

```json
{
  "version": 1,
  "defaults": {"maxReserve": 180, "refill": 45},
  "ammo": {
    "tacz:762x39": {"maxReserve": 180, "refill": 45},
    "tacz:9mm": {"maxReserve": 120, "refill": 30}
  }
}
```

- maxReserve는 장착 총기 한 정당 최대 예비탄, refill은 탄약 보급 팩 1개당 보급량입니다.
- ammo의 키는 총기가 아니라 탄종 ID입니다. 별도 항목이 없는 탄종은 defaults 값을 사용합니다.
- 주·보조무기가 같은 탄종이면 최대량과 보급량을 합산합니다. 9mm 두 정은 위 예시 기준 최대 240발, 팩당 최대 60발입니다.
- 서로 다른 탄종은 한 팩으로 각각 보급합니다. 최대 잔량을 넘지는 않습니다.
- 값은 1~100000 사이의 정수입니다. 설정 변경만으로 예비탄이 충전되지는 않습니다.
- supply.json의 healthPerPack은 체력 보급 팩 1개당 회복량입니다. 기존 기본값은 8입니다.
- 두 파일을 수정한 뒤 /reload 로 적용합니다. 오류가 있으면 두 파일 모두 이전 정상 설정을 유지합니다.
- /erosionsector supply status 로 장착 무기의 실제 예비탄 한도와 보급량을 확인합니다.
- 멀티플레이에서 탄약·보급 설정은 서버의 es/guns 파일을 사용합니다.

## 스테이지와 타일

스테이지는 es/stage 아래에 .esfile 파일만 모읍니다. 타일 원본은 es/assets/tile/<타일셋>/<타일>.nbt로 보관합니다.
스테이지는 타일셋/타일.nbt 상대 경로로 참조하며 NBT를 스테이지 안에 넣지 않습니다.
게임의 기본 작업 폴더는 es입니다. 편집기의 타일 폴더 연결에서는 es/assets/tile을 선택하세요.
다른 작업 폴더를 지정할 때에도 그 안에 assets/tile 및 stage 구조를 유지해야 합니다.
