# 근접무기 조작 · 0.5.14

Better Combat NeoForge 2.4.0 + Player Animator 2.0.4 + Cloth Config 15.0.140을 사용합니다. ES는 해당 모드의 원본 파일·설정·무기팩을 수정하지 않습니다. 확장 조작은 서바이벌·모험의 **1번 근접무기 슬롯**에 적용하며 건축용 크리에이티브와 나머지 슬롯은 기존 조작을 유지합니다. 무기에는 Better Combat의 무기 속성 또는 자동 호환 프리셋이 있어야 합니다. Better Combat이 없으면 ES 충전 조작은 비활성화됩니다.

- **좌클릭 유지:** 전방을 반복 공격합니다. 무기별 콤보·모션·선딜·타격 범위·대상 선택·넉백·내구도는 Better Combat 원본 흐름을 사용합니다.
- **우클릭 유지:** 선택한 강공격 모션의 준비 구간을 충전 시간에 맞춰 천천히 재생합니다. 검은 들어 올린 자세에서 최대 충전을 유지합니다. 조준선 바로 아래에 바닐라 공격 쿨타임과 같은 16×4 막대가 차오르며, 충전 중에는 기존 공격 쿨타임 표시와 겹치지 않습니다. 충전 중에는 일반 공격을 하지 않습니다.
- **우클릭을 유지한 채 좌클릭:** 충전량에 비례한 **단일 대상 강공격**을 한 번 즉시 실행합니다. 준비 동작을 다시 기다리지 않고 클릭한 틱에 Better Combat의 원래 대상 탐색·타격 패킷을 보냅니다. 실제 피해 반영에는 서버 처리와 네트워크 지연이 있습니다. 기본값은 0초 1배 ~ 1초 3배이며, 원본의 현재 콤보 피해량을 기준으로 계산합니다. 후보 중 가장 가까운 보이는 대상 하나를 원본 타격 처리 전에 남기므로 다중 대상 피해 패널티를 받지 않습니다.
- 좌클릭으로 강공격을 확정한 뒤 우클릭을 놓아도 이미 시작한 공격은 유지합니다. 공격 전 우클릭만 놓으면 충전을 취소합니다.
- 기본 3초 이상 우클릭을 유지하면 충전이 자동 취소됩니다. 다시 충전하려면 우클릭을 놓았다가 누르세요. 두 버튼을 계속 누르고 있어도 강공격을 반복하지 않습니다.
- 메뉴 열기·다른 장비로 교체·사망·차원 이동·접속 종료 시 충전을 취소합니다. 실제 충전 시간과 최종 피해량은 서버가 판정합니다.

## 설정 파일

`minecraft/es/melee/combat.json`을 수정하고 게임 내 관리자 명령어 **`/reload`**를 실행하세요. 접속한 플레이어에게도 새 설정을 전송합니다. 총기·스킨 설정과는 별개이며 총기팩이나 Better Combat 설정 파일을 바꾸지 않습니다.

```json
{
  "version": 1,
  "defaults": {
    "enabled": true,
    "attackIntervalMultiplier": 1.0,
    "attackRangeMultiplier": 1.0,
    "normalDamageMultiplier": 1.0,
    "fullChargeSeconds": 1.0,
    "chargeTimeoutSeconds": 3.0,
    "minChargedDamageMultiplier": 1.0,
    "maxChargedDamageMultiplier": 3.0,
    "chargedAnimation": "bettercombat:one_handed_slam"
  },
  "weapons": {}
}
```

| 항목 | 역할 | 허용 범위 |
|---|---|---|
| `chargedAnimation` | 강공격 모션 ID. 빈 문자열은 원래 콤보 모션 | 모션 ID / `""` |
| `enabled` | 해당 무기의 ES 조작 사용 | true / false |
| `attackIntervalMultiplier` | Better Combat 원래 공격 간격의 배율. 0.5는 빠르게, 2는 느리게 | 0.25 ~ 4 |
| `attackRangeMultiplier` | Better Combat 원래 사거리의 배율 | 0.25 ~ 3 |
| `normalDamageMultiplier` | 일반 공격 피해 배율 | 0.05 ~ 20 |
| `fullChargeSeconds` | 최대 충전에 걸리는 시간(초) | 0.05 ~ 10 |
| `chargeTimeoutSeconds` | 충전 시작부터 자동 취소까지 시간(초). 최대 충전 시간보다 커야 함 | 0.1 ~ 30 |
| `minChargedDamageMultiplier` | 충전 시작 시 강공격 피해 배율 | 0.05 ~ 20 |
| `maxChargedDamageMultiplier` | 최대 충전 시 강공격 피해 배율. 최소 배율 이상이어야 함 | 0.05 ~ 20 |

일반 공격 배율과 강공격 배율은 각각 독립적으로 원본 콤보 피해에 적용합니다. 충전 시간은 20틱/초 기준이며 중간 배율은 선형으로 증가합니다. 공격 간격의 최종 안전 범위는 1~200틱, 사거리는 0.25~12블록입니다. 실제 공격 형태·각도는 Better Combat 무기 속성을 그대로 사용합니다.

## 무기별 설정

`weapons`에 **아이템 ID**별로 변경할 항목만 넣으면 나머지는 `defaults`를 유지합니다. 스킨마다 별도 아이템으로 바꾸지 않으므로 스킨 선택은 성능을 바꾸지 않습니다.

```json
"weapons": {
  "minecraft:iron_axe": {
    "fullChargeSeconds": 1.5,
    "chargeTimeoutSeconds": 4.0,
    "maxChargedDamageMultiplier": 4.0
  },
  "my_mod:glaive": {
    "attackRangeMultiplier": 1.2,
    "normalDamageMultiplier": 0.9
  }
}
```

잘못된 JSON·오타·숫자 범위 오류가 있으면 파일명과 오류 위치를 로그에 표시하고 **이전 정상 설정 전체를 유지**합니다. `/reload`는 진행 중 충전을 취소하고 새 설정으로 다시 시작하게 합니다. 클라이언트 개인 ES 설정 탭은 화면·조명·조작 표시용이며, 서버 전투 규칙은 이 파일에서 관리합니다.

## 강공격 모션 지정

`chargedAnimation`에 설치된 모션 ID를 넣으면 **강공격에만** 해당 모션을 사용합니다. 일반 공격 콤보·무기 레지스트리·원본 모션 파일은 변경하지 않습니다. 선택한 모션의 0~`beginTick`을 충전 시간에 맞춰 재생하고 최대 충전에서 멈춥니다. 좌클릭 시 `beginTick` 이후 타격·복귀 구간을 이어 재생합니다. 현재 무기의 타격 범위·피해 계산·공격 후 회복과 쿨타임은 원본을 사용하며, 강공격에만 추가 준비 대기 시간을 생략합니다. ES의 서버 승인 모션 상태를 주변 플레이어에게 전송하고, 각 클라이언트에서 Better Combat의 원본 좌우 반전·1인칭·팔 조정 레이어로 재생합니다. 일반 공격은 원래 애니메이션 패킷을 사용합니다.

확인한 Better Combat 2.4.0 모션 예시:

| 모션 ID | 용도 |
|---|---|
| `bettercombat:one_handed_slam` | 한손 내려찍기 (기본) |
| `bettercombat:one_handed_stab` | 한손 찌르기 |
| `bettercombat:one_handed_uppercut_right` | 아래에서 위로 올려치기 |
| `bettercombat:two_handed_slam` | 양손 내려찍기 |
| `bettercombat:two_handed_slam_heavy` | 양손 강한 내려찍기 |
| `bettercombat:two_handed_stab_right` | 양손 찌르기 |

Better Combat의 `one_handed_` / `two_handed_` 공격 모션은 한손·양손 재생을 자동으로 맞춥니다. 다른 이름의 커스텀 모션은 원래 무기의 손 사용 방식을 유지합니다. `chargedAnimation: ""`로 지정하면 원래 콤보 모션을 사용합니다.

```json
"weapons": {
  "minecraft:iron_sword": {
    "chargedAnimation": "bettercombat:one_handed_stab"
  },
  "minecraft:iron_axe": {
    "chargedAnimation": "bettercombat:two_handed_slam_heavy"
  }
}
```

추가 애니메이션 리소스팩의 Player Animator 모션도 ID로 지정할 수 있으며 모든 참여자에게 해당 리소스가 필요합니다. 클라이언트에 없는 모션은 로그에 ID를 표시하고 원래 콤보 모션으로 돌아갑니다. 모션 파일을 ES 안으로 복사하거나 Better Combat JAR를 수정하지 않습니다. 설정을 수정한 뒤 `/reload`를 실행하세요.
