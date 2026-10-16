# 모드 연동 기준과 확인 기록

다른 모드의 기능을 ES에서 사용할 때는 설치된 버전의 코드와 API를 먼저 확인합니다. 공개 이벤트·API를 우선 사용하고, 필요한 내부 연동은 ES 어댑터와 Mixin에 둡니다. 외부 모드 JAR·총기 팩·모델·설정은 수정하지 않습니다. 이 기준은 소스 루트 `AGENTS.md`에도 기록했습니다.

## 확인 대상: 2026-10-17

| 모드 | 설치 버전 | 실제 코드에서 확인한 연결 지점 |
| --- | --- | --- |
| TaCZ | NeoForge 1.21.1 / 1.1.8-hotfix-r7 | `IGun`, `TimelessAPI`, `CommonGunIndex`, `CommonDataManager.apply`, `ModernKineticGunScriptAPI.consumeAmmoFromPlayer/hasAmmoToConsume`, `GunFireEvent`, `HumanoidOffhandRender.renderGunItem` |
| CarryOn | NeoForge 1.21.1 / 2.2.6.13 | `CarryOnDataManager`, `PickupHandler.tryPickUpBlock`, `PlacementHandler.tryPlaceBlock`, `NeoForgePlatformHelper.setCarryData` |
| Iris | NeoForge 1.21.1 / 1.8.14-beta.1 | `IrisApi`, `CapturedRenderingState`의 gbuffer 행렬, `HandRenderer.DEPTH`, `IrisRenderingPipeline.finalizeLevelRendering/finalizeGameRendering`, `RenderTargets` |
| Sodium | NeoForge 1.21.1 / 0.8.13 | ES가 Sodium 내부 메서드를 호출하지 않음. 모델은 NeoForge의 `ModelData`, 렌더 레이어별 `BakedModel.getQuads` 경로로 조회 |

TaCZ의 총기 데이터·예비탄은 실제 원본 로더와 재장전 경로에 연결합니다. 총구 화염은 `GunFireEvent`의 논리 측을 확인하고 실제 디스플레이와 소음기 데이터를 조회합니다. 상호작용 키의 등록 이름 `key.tacz.interact.desc`와 안내 레이어 `tacz:tac_interact_key_overlay`도 설치 JAR에서 대조했습니다. 장착 외형은 실제 TaCZ 렌더러를 사용하며, 주·보조 슬롯 변경과 팀원 장비 동기화만 ES에서 처리합니다. TaCZ 선택 의존성 범위는 `[1.1.8-hotfix-r7,1.1.9)`입니다.

CarryOn의 운반 상태·월드 제거·배치는 원본 기능에 맡깁니다. ES 화물만 1초 상호작용 검사를 거치며, 미션 종료 시 원본 `clear`와 `setCarryData`를 사용합니다. `setCarryData`는 NeoForge attachment 설정과 클라이언트 동기화를 수행하는 원본 경로임을 확인했습니다.

Iris는 공개 API로 셰이더 활성 여부와 그림자 패스를 구분합니다. 최종 월드 합성·색 공간 변환 순서, 주 화면의 깊이 텍스처 전달, 실제 gbuffer 카메라 행렬과 손 깊이 압축 상수를 대조했습니다. 자체 손전등은 Iris의 조명 엔진을 수정하지 않고 최종 장면에 합성합니다. 내부 행렬 API는 향후 Iris 버전 변경 시 재검증해야 합니다.

외부 래그돌·동적 조명 엔진을 호출하는 활성 연동은 없습니다. 광선 결과 검증은 특정 물리 모드에 의존하지 않는 일반 보호 장치로 유지합니다. 보류된 자체 물리 작업은 `work-in-progress/native-physics`에 분리되어 있습니다.

## 부분 블록의 광학 형태

이전 일반 블록 그림자는 충돌 형태를 그대로 사용했습니다. 설치된 Minecraft 1.21.1의 모델을 확인한 결과, 엔드 막대 몸통은 2/16블록, 받침은 4/16블록이며 사다리는 깊이 15.2/16 위치에 투명 텍스처로 그려지는 평면입니다. 두 블록 모두 충돌 형태와 표시되는 형태가 다릅니다.

ES는 일반 불투명 꽉 찬 블록의 빠른 경로를 유지하면서, 부분 블록의 실제 베이크된 모델 면과 텍스처 알파를 그림자 형태에 반영합니다. 사다리의 투명한 틈은 통과하고, 엔드 막대는 몸통과 받침을 구분합니다. 모델 상태·ModelData·변형 시드로 결과를 캐시하며 같은 프레임의 위치별 결과도 공유합니다. 월드 전환과 리소스 재적용 시 캐시를 비웁니다.

일반 축에 정렬된 불투명·컷아웃 모델을 대상으로 합니다. 기울어진 면, 반투명 재질, 별도 블록 엔티티 렌더러, 지나치게 복잡한 모델은 기존 충돌 형태로 돌아갑니다. HD 텍스처는 면당 각 축 최대 64표본이며 애니메이션의 불투명 부분은 프레임들의 합집합으로 근사합니다. 유한한 그림자 해상도 때문에 먼 거리의 가는 디테일은 여전히 생략되거나 부드럽게 보일 수 있습니다. 서버의 몹 노출 판정과 플레이어 충돌은 변경하지 않습니다.

ES 문의 이동 형태는 기존 전용 광학 처리로 유지합니다. 사다리·엔드 막대를 위한 별도 가짜 블록이나 뒤쪽 그림자 판을 월드에 생성하지 않습니다.

## 0.4.15 검증

- 외부 모드 없는 기본 서버: 필수 GameTest 134개 통과.
- 설치된 TaCZ 원본을 추가한 서버: 전용 GameTest 6개 통과.
- 설치된 CarryOn 원본을 추가한 서버: 전용 GameTest 1개 통과.
- 실제 클라이언트: 엔드 막대 6방향의 몸통·받침, 사다리 4방향의 투명 112픽셀/불투명 144픽셀, 표면 자기 가림·뒤 벽 차단·캐시 초기화 통과.
- 실제 그래픽 조합: TaCZ를 켠 기본 렌더러, TaCZ·Iris·Sodium·Complementary Reimagined r5.9.3에서 같은 클라이언트 검사와 화면 캡처 완료.
- OpenGL 검사: 기존 업로드 상태 복원, 문 표면, 금속 무늬, 모서리, 광원 4개, 총구 점등, 주변 어둠, Full HD·4K 밝기 경계 검사 통과.

개발용 `-PopticalSmoke`와 `-PopticalIris` 실행은 별도 `run/saves/es-optical-smoke`를 사용하며 클라이언트 검사 클래스는 배포 JAR에서 제외합니다. Sodium의 설치 배포물은 서비스 라이브러리와 내부 JAR로 구성되어 있어, 개발 실행에서도 원래 서비스의 초기화와 원본 내부 JAR가 모두 로드되도록 구성했습니다. 사용자의 인스턴스나 외부 모드 파일을 고치는 방식으로 해결하지 않았습니다.
