# 모드 연동 기준과 확인 기록

다른 모드의 기능을 ES에서 사용할 때는 설치된 버전의 코드와 API를 먼저 확인합니다. 공개 이벤트·API를 우선 사용하고, 필요한 내부 연동은 ES 어댑터와 Mixin에 둡니다. 외부 모드 JAR·총기 팩·모델·설정은 수정하지 않습니다. 이 기준은 소스 루트 `AGENTS.md`에도 기록했습니다.

## 확인 대상: 2026-10-18

0.5.7은 TaCZ 1.1.8-hotfix-r7의 `GunAttachmentSlot`, `InventoryAttachmentSlot`, `RefitUnloadButton` 생성자·렌더 흐름을 직접 확인하고 원본 위젯을 ES 화면에서 재사용합니다. 18×18 슬롯·원본 아이콘·16×16 아이템 렌더는 별도의 표시용 Inventory만 읽으며 콜백은 ES 패킷으로 보냅니다. NeoForge 21.1.259의 취소 가능한 `RenderGuiEvent.Pre`와 `RenderHandEvent`로 장비 화면 동안만 전체 HUD와 손을 숨깁니다. Minecraft 1.21.1 `AbstractContainerScreen.renderBackground`가 `renderBg`도 호출하는 흐름을 확인해 배경·블러 없이 중앙 모델을 유지합니다. 화면·스탯은 스크롤 없이 표시하며 메뉴의 선택·스킨·부착물 요청에서 저장된 구성을 자동 적용합니다. 기본 서버 156개, 설치 TaCZ 7개 검사 및 표시되는 실제 클라이언트의 투명 월드·모델·HUD 복원·원본 위젯·자동 적용·GUI 배율 2/3을 검증합니다. 외부 모드와 사용자 HUD 설정은 수정하지 않습니다.

0.5.6 장비 화면은 같은 세 선택기 블록을 유지하면서 목록·3D 미리보기·성능의 세 열로 구성합니다. 설치된 TaCZ 1.1.8-hotfix-r7의 `GunIndexPOJO.getTooltip`, `IGun.getRPM`, `AttachmentDataUtils.getDamageWithAttachment/getHeadshotMultiplier/getArmorIgnoreWithAttachment/getWightWithAttachment`, `AttachmentCacheProperty.eval/getCache`와 `GunProperties.ADS_TIME`를 확인했습니다. 부착물을 반영한 스탯은 서버의 선택 캐시에 포함하며 매 프레임 파일·총기 성능을 재계산하지 않습니다. 근접무기는 원본 `ItemStack.forEachModifier`와 독립 `AttributeInstance`로 무기 속성을 평가합니다. 기본 서버 155개·설치 TaCZ 서버 7개 검사 및 실제 클라이언트의 설명·스탯·하단 스킨·부착물 상승 패널·선택·Esc·회전·GUI 배율 2/3을 확인합니다. 외부 모드 원본은 수정하지 않습니다.

0.5.5 장비 작업실은 설치된 TaCZ 1.1.8-hotfix-r7의 `IGun.allowAttachment/allowAttachmentType`, `installAttachment/unloadAttachment/getAttachment`, `AttachmentItemBuilder`, `TimelessAPI.getAllCommonAttachmentIndex`, `AttachmentDataUtils.getAmmoCountWithAttachment`를 확인했습니다. 원본 `GunSmithTableScreen.renderLeftModel`의 `FIXED` 렌더 경로와 `RenderDistance.markGuiRenderTimestamp`를 사용해 부착물을 포함한 실제 총기 모델을 그립니다. 등록과 장착은 서버에서 호환성을 검사합니다. 원본 JAR·총기팩·설정은 수정하지 않습니다. 전용 근접무기 스킨은 Minecraft 1.21.1 `ItemRenderer.getModel`의 반환 모델과 NeoForge `ModelEvent.RegisterAdditional`만 사용하며 실제 아이템 속성은 변경하지 않습니다. 기본 서버 154개, 설치 TaCZ 서버 7개 검사와 표시되는 실제 클라이언트의 세 선택기 블록·전용 화면·개별 적용·스킨 모델·조준경 장착·적용 패킷·회전·확대·GUI 배율 2/3을 확인했습니다. [장비와 등록 파일](equipment.ko.md).

0.5.4는 설치된 Minecraft 1.21.1의 `ServerLevel` 생성자와 `Level.levelData`/`ServerLevel.serverLevelData`의 동일 인수 할당, `DerivedLevelData`의 전역 GameRules·시간·날씨 위임, NeoForge 21.1.259의 `MobSpawnEvent.SpawnPlacementCheck`와 `FinalizeSpawnEvent.setSpawnCancelled`를 확인했습니다. ES 두 차원에만 원본 데이터를 감싼 LevelData를 전달하고, 게임 틱 시계는 원본에 위임합니다. 차단하는 규칙 이외에는 현재 원본 규칙을 계속 읽으며, 자연 생성 타입만 거부합니다. 실제 네이티브 소환과 몹 폭발, 서버 검사 151개 및 표시되는 클라이언트의 차원 이동·고정 시각·부활·재접속을 검증합니다. 외부 모드 파일은 수정하지 않습니다. [차원 환경 규칙](dimension-rules.ko.md).

0.5.3의 자동 월드 생성은 설치된 Minecraft 1.21.1의 `TitleScreen.createNormalMenuOptions`, `WorldOpenFlows.createFreshLevel`, `WorldDimensions.bake`와 NeoForge 21.1.259의 `ScreenEvent.Init.Post`를 확인했습니다. 기본 모드 데이터팩의 차원을 함께 로드하는 원본 생성 흐름을 사용하며, 싱글플레이 버튼만 ES 생성으로 연결합니다. 최초 도착·부활은 서버의 `PlayerLoggedInEvent`, `PlayerRespawnEvent`, `Clone`에서 처리하고 임무 중 관전은 StageRuntime 처리 뒤에 보존합니다. 기본 서버 검사 148개와 표시되는 실제 클라이언트의 생성·사망·부활·저장·재접속·두 번째 새 월드 흐름을 확인했습니다. TaCZ·Create·CarryOn 등 외부 모드 파일과 기존 사용자 설정은 변경하지 않습니다. [로비 생성 안내](lobby-world.ko.md).

0.5.2는 ES 문의 상태 변경 알림과 이벤트 대상 분류를 추가합니다. 설치된 Minecraft/NeoForge 원본의 BlockEntity 수명 주기와 `Inventory.setItem/setChanged` 호출을 확인했습니다. 문 로드·제거·방향·결합 상태 변경도 무효화하고, 다른 모드가 변경 알림 없이 아이템의 컴포넌트를 교체해도 수집을 놓치지 않도록 슬롯 읽기는 유지합니다. CustomData의 불변 값만 식별 캐시에 사용합니다. 외부 모드의 JAR·설정·API는 변경하지 않습니다. 독립된 숨긴 클라이언트에서 Iris·Create와 모사 팀원 3명을 포함한 부하를 확인했습니다. 검사 범위는 [최적화 기록](optimization.ko.md)을 참고하세요.

0.5.1은 ES 손전등의 임시 객체 생성과 스테이지 위치·스캔 검사를 줄입니다. 기존 Minecraft 1.21.1의 AABB 포함 규칙과 좌표 계산 순서를 유지하고, 외부 모드의 광선 훅이 광학 형상을 무시할 때의 기존 재검사 경로도 유지합니다. TaCZ·CarryOn·Iris·Create 연동 API와 갱신 주기는 변경하지 않습니다. 이전 그림자 데이터와의 정확한 일치, 타일 경계·겹침, 비활성 탈출 스캔의 화물 인계와 같은 틱 활성화를 검증했습니다. 측정 범위와 클라이언트 검사는 [최적화 기록](optimization.ko.md)을 참고하세요.

0.5.0 스캔은 기존 IrisApi·CapturedRenderingState 카메라 연동을 재사용합니다. AFTER_LEVEL에서 ES 어둠 처리 뒤에 전용 POSITION_COLOR 셰이더로 주 화면에 발광 원을 그리며, 공유 깊이와 깊이 테스트를 유지하고 GPU의 깊이·블렌드·컬링·프로그램·프레임버퍼 상태를 복원합니다. 초기 일반 RenderType 경로가 셰이더 환경에서 어둡게 사라지는 것을 실제 화면으로 확인해 독립 합성으로 수정했습니다. 블록·엔티티·광원 갱신은 추가하지 않습니다. 서버가 원 내부·±1블록 높이·벽 차폐·참가 인원을 판정하며 CarryOn이나 TaCZ의 코드를 변경하지 않습니다.

0.4.28은 NeoForge 21.1.259의 CreativeModeTab.Builder.withTabsBefore가 지정한 탭 뒤에 배치하는 순서 규칙을 원본 소스로 확인하고 ES 건축 다음에 ES 아이템이 오도록 등록합니다. 자동 클라이언트 검사도 원본 크리에이티브 페이지 버튼으로 두 탭에 접근해 표시 목록과 3D 아이콘을 확인합니다. 장비 선택기는 기존 ES의 KeyInteractable·BlockInteractionPayload와 장비 선택 화면을 재사용하며, TaCZ·외부 모드 파일을 수정하지 않습니다.

0.4.27의 블록 아이콘은 설치된 Minecraft 1.21.1 원본 ssets/minecraft/models/block/block.json의 GUI 회전·배율·측면 조명 값을 ES 아이템 모델에 적용합니다. 블록 배치 모델이나 외부 모드 파일을 변경하지 않습니다. 숨긴 전용 클라이언트에서 실제 크리에이티브 화면과 여섯 블록의 베이크된 모델을 확인합니다.

0.4.26은 사용하지 않는 터미널 블록 3종과 탈출 스캐너 등록·리소스·시설 터미널 통신을 제거했습니다. 구형 터미널을 참조하던 TaCZ 상호작용 태그도 제거했습니다. TaCZ 자체 파일은 수정하지 않으며 총기 조작과 기존 보급함·문 E키 처리는 유지합니다. 크리에이티브 목록은 Minecraft 원본 CreativeModeTab.buildContents와 NeoForge의 탭 빌드 이벤트를 사용해 실제 표시 항목과 제거된 레지스트리를 검사합니다.

0.4.25는 설치된 Minecraft 1.21.1의 `EntityRenderer.getPackedLightCoords(Entity,float)`가 `Entity.getLightProbePosition`을 한 개의 블록 좌표로 바꿔 블록·하늘 광원을 읽는 흐름을 확인했습니다. 클라이언트 Mixin으로 ES 문 칸의 비어 있는 반쪽에 놓인 좌표만 같은 방의 인접 칸으로 보정하며, 기존 `getBlockLightLevel/getSkyLightLevel` 호출과 렌더러별 특수 처리는 유지합니다. 기존 기본 클라이언트에서 문 칸 밝기 0·같은 방 밝기 9/8에도 몹·아이템 렌더 값이 0인 것을 재현했고 수정 후 9/8로 일치했습니다. 문 반대편의 어두운 방은 0을 유지합니다. 일반·보안 문의 양쪽·네 방향·형상 내부 좌표와 일반 블록을 GameTest로 검사합니다. 외부 모드의 JAR와 설정은 수정하지 않습니다.

0.4.24의 ES 설정 진입점은 NeoForge 21.1.259 원본에서 확인한 `ScreenEvent.Init.Post`의 버튼 등록을 사용합니다. 메인·일시정지 메뉴의 설정 버튼 영역 안에서 두 버튼을 배치합니다. 설정 편집은 `ConfigurationSectionScreen`과 공개 `Context.section`을 사용하고 일반·개발자 항목의 입력 목록을 분리해 초기화 범위도 제한합니다. `devmod`는 설정 파일 전용이며 UI에는 편집·초기화 대상으로 노출하지 않습니다. 조작은 설치된 Minecraft의 `ControlsScreen`과 키 지정 화면으로 연결하고 TaCZ 원본 키 처리나 설정은 수정하지 않습니다. 한국어 실제 클라이언트에서 저장·초기화, 개발자 접근 차단·실행 중 해제와 GUI 배율 2·3의 버튼 배치를 검증했습니다.

0.4.23의 `[lighting].enabled`는 ES의 자체 렌더러와 ES 총구 효과를 함께 제어하는 클라이언트 옵션입니다. 기존 Iris 입력 경로와 TaCZ 발사 이벤트 연동 API는 변경하지 않습니다. 기본 클라이언트 및 아래 TaCZ·Create·Iris·Sodium과 Complementary Reimagined r5.9.3 조합의 실제 클라이언트에서 실행 중 끄기·재활성화, GPU 자원 해제와 재생성, 개별 설정 보존을 검증했습니다. 시설 조명 블록의 월드 광원과 서버의 노출 판정은 유지합니다.

0.4.20의 왼손 잠금은 NeoForge 21.1.259 원본 소스에서 확인한 `LivingSwapItemsEvent.Hands` 취소로 서버의 기본 손 교환 패킷을 차단합니다. 상자 화면의 `ClickType.SWAP` 40번 경로는 ES의 기존 메뉴 처리에서 별도로 차단합니다. 기본 `InventoryMenu`의 왼손은 45번 메뉴 슬롯·40번 인벤토리 슬롯을 유지하며, `PlayerOffhandInvWrapper → InvWrapper → Inventory.canPlaceItem` 경로에도 ES 제한을 적용합니다. 크리에이티브의 정상 교환과 기존 TaCZ 2·3번 장비 거치는 유지합니다.

| 모드 | 설치 버전 | 실제 코드에서 확인한 연결 지점 |
| --- | --- | --- |
| TaCZ | NeoForge 1.21.1 / 1.1.8-hotfix-r7 | `IGun`, `TimelessAPI`, `CommonGunIndex`, `CommonDataManager.apply`, `ModernKineticGunScriptAPI.consumeAmmoFromPlayer/hasAmmoToConsume`, `GunFireEvent`, `HumanoidOffhandRender.renderGunItem` |
| CarryOn | NeoForge 1.21.1 / 2.2.6.13 | `CarryOnDataManager`, `PickupHandler.tryPickUpBlock`, `PlacementHandler.tryPlaceBlock`, `NeoForgePlatformHelper.setCarryData` |
| Iris | NeoForge 1.21.1 / 1.8.14-beta.1 | `IrisApi`, `CapturedRenderingState`의 gbuffer 행렬, `HandRenderer.DEPTH`, `IrisRenderingPipeline.finalizeLevelRendering/finalizeGameRendering`, `RenderTargets` |
| Sodium | NeoForge 1.21.1 / 0.8.13 | ES가 Sodium 내부 메서드를 호출하지 않음. 모델은 NeoForge의 `ModelData`, 렌더 레이어별 `BakedModel.getQuads` 경로로 조회 |
| Create | NeoForge 1.21.1 / 6.0.10 | `MetalLadderBlock.skipRendering`, `AllBlocks`의 안산암·황동·구리 사다리, `create:block/ladder` 모델과 각 재질 텍스처 |

TaCZ의 총기 데이터·예비탄은 실제 원본 로더와 재장전 경로에 연결합니다. 총구 화염은 `GunFireEvent`의 논리 측을 확인하고 실제 디스플레이와 소음기 데이터를 조회합니다. 상호작용 키의 등록 이름 `key.tacz.interact.desc`와 안내 레이어 `tacz:tac_interact_key_overlay`도 설치 JAR에서 대조했습니다. 장착 외형은 실제 TaCZ 렌더러를 사용하며, 주·보조 슬롯 변경과 팀원 장비 동기화만 ES에서 처리합니다. TaCZ 선택 의존성 범위는 `[1.1.8-hotfix-r7,1.1.9)`입니다.

CarryOn의 운반 상태·월드 제거·배치는 원본 기능에 맡깁니다. ES 화물만 1초 상호작용 검사를 거치며, 미션 종료 시 원본 `clear`와 `setCarryData`를 사용합니다. `setCarryData`는 NeoForge attachment 설정과 클라이언트 동기화를 수행하는 원본 경로임을 확인했습니다.

Iris는 공개 API로 셰이더 활성 여부와 그림자 패스를 구분합니다. 최종 월드 합성·색 공간 변환 순서, 주 화면의 깊이 텍스처 전달, 실제 gbuffer 카메라 행렬과 손 깊이 압축 상수를 대조했습니다. 자체 손전등은 Iris의 조명 엔진을 수정하지 않고 최종 장면에 합성합니다. 내부 행렬 API는 향후 Iris 버전 변경 시 재검증해야 합니다.

외부 래그돌·동적 조명 엔진을 호출하는 활성 연동은 없습니다. 광선 결과 검증은 특정 물리 모드에 의존하지 않는 일반 보호 장치로 유지합니다. 보류된 자체 물리 작업은 `work-in-progress/native-physics`에 분리되어 있습니다.

## 부분 블록의 광학 형태

이전 일반 블록 그림자는 충돌 형태를 그대로 사용했습니다. 설치된 Minecraft 1.21.1의 모델을 확인한 결과, 엔드 막대 몸통은 2/16블록, 받침은 4/16블록이며 사다리는 깊이 15.2/16 위치에 투명 텍스처로 그려지는 평면입니다. 두 블록 모두 충돌 형태와 표시되는 형태가 다릅니다.

ES는 일반 불투명 꽉 찬 블록의 빠른 경로를 유지하면서, 부분 블록의 실제 베이크된 모델 면과 텍스처 알파를 그림자 형태에 반영합니다. 사다리의 투명한 틈은 통과하고, 엔드 막대는 몸통과 받침을 구분합니다. 모델 상태·ModelData·변형 시드로 결과를 캐시하며 같은 프레임의 위치별 결과도 공유합니다. 월드 전환과 리소스 재적용 시 캐시를 비웁니다.

일반 축에 정렬된 불투명·컷아웃 모델을 대상으로 합니다. 기울어진 면, 반투명 재질, 별도 블록 엔티티 렌더러, 지나치게 복잡한 모델은 기존 충돌 형태로 돌아갑니다. HD 텍스처는 면당 각 축 최대 64표본이며 애니메이션의 불투명 부분은 프레임들의 합집합으로 근사합니다. 유한한 그림자 해상도 때문에 먼 거리의 가는 디테일은 여전히 생략되거나 부드럽게 보일 수 있습니다. 서버의 몹 노출 판정과 플레이어 충돌은 변경하지 않습니다.

ES 문의 이동 형태는 기존 전용 광학 처리로 유지합니다. 사다리·엔드 막대를 위한 별도 가짜 블록이나 뒤쪽 그림자 판을 월드에 생성하지 않습니다.

## 0.4.16 Create 금속 사다리

Create의 안산암·황동·구리 사다리는 고리 부분이 모델 좌표 18/16까지 뻗습니다. 0.4.15는 모델 좌표를 한 칸 내부로 제한하면서 이 고리를 발견하면 전체 모델을 제외했고, 결국 빈틈 없는 충돌 판으로 되돌아갔습니다.

범위 검사를 인접 칸까지 허용하도록 수정했습니다. 사다리 계열은 모델이 실제로 차지하는 인접 공기 칸에서도 튀어나온 부분을 검사하며, 대각선으로 걸친 고리도 포함합니다. 사다리가 없는 구간은 청크 섹션의 블록 목록으로 빠르게 제외하고, 같은 프레임의 결과를 공유합니다. 모델 캐시는 주변 블록에 따른 면 표시 여부도 구분합니다. 위에 사다리가 있으면 아래 사다리의 고리를 숨기는 Create 원본 규칙을 `Block.shouldRenderFace` 경로로 따르므로, 보이지 않는 고리의 그림자를 만들지 않습니다.

Create 원본 JAR와 포함된 Flywheel·Ponder·Registrate를 사용한 실제 클라이언트에서 금속 사다리 3종×4방향의 투명 128픽셀/불투명 128픽셀을 확인했습니다. 위쪽·뒤쪽·대각선 칸의 고리 차폐, 고리 사이의 빈 공간, 위아래 연결 시 고리 숨김과 캐시 재사용도 검사했습니다. Iris·Sodium·Complementary Reimagined r5.9.3을 함께 켠 환경에서도 통과했습니다. 기존 엔드 막대·바닐라 사다리 검사를 함께 유지합니다.

자동 클라이언트 검사 창은 기본적으로 숨기며, 검사 클래스와 창 제어 코드는 배포 JAR에서 제외합니다. 그래픽 검사를 생략하는 방식은 아닙니다. 다른 모드 파일과 사용자 설정은 수정하지 않습니다.

## 0.4.15 검증

- 외부 모드 없는 기본 서버: 필수 GameTest 134개 통과.
- 설치된 TaCZ 원본을 추가한 서버: 전용 GameTest 6개 통과.
- 설치된 CarryOn 원본을 추가한 서버: 전용 GameTest 1개 통과.
- 실제 클라이언트: 엔드 막대 6방향의 몸통·받침, 사다리 4방향의 투명 112픽셀/불투명 144픽셀, 표면 자기 가림·뒤 벽 차단·캐시 초기화 통과.
- 실제 그래픽 조합: TaCZ를 켠 기본 렌더러, TaCZ·Iris·Sodium·Complementary Reimagined r5.9.3에서 같은 클라이언트 검사와 화면 캡처 완료.
- OpenGL 검사: 기존 업로드 상태 복원, 문 표면, 금속 무늬, 모서리, 광원 4개, 총구 점등, 주변 어둠, Full HD·4K 밝기 경계 검사 통과.

개발용 `-PopticalSmoke`와 `-PopticalIris` 실행은 별도 `run/saves/es-optical-smoke`를 사용하며 클라이언트 검사 클래스는 배포 JAR에서 제외합니다. Sodium의 설치 배포물은 서비스 라이브러리와 내부 JAR로 구성되어 있어, 개발 실행에서도 원래 서비스의 초기화와 원본 내부 JAR가 모두 로드되도록 구성했습니다. 사용자의 인스턴스나 외부 모드 파일을 고치는 방식으로 해결하지 않았습니다.


### 장비 패널 세부 표시 (0.5.8)

설치된 TaCZ NeoForge 1.21.1 1.1.8-hotfix-r7의 `GunPropertyDiagrams.draw`와 `GunAttachmentSlot`, `InventoryAttachmentSlot` 바이트코드를 확인했습니다. 성능표 전체 렌더러는 실제 주 손과 플레이어 캐시를 읽으므로 임의의 선택 장비에 직접 호출하지 않습니다. ES는 그 막대 형태(검정 배경, 흰색 4픽셀 채움)를 사용하고 요청된 노랑/빨강 비교 구간을 추가합니다. 공개 `AttachmentCacheProperty.eval`, `AttachmentDataUtils`와 기존 API로 복사본의 부착물 성능을 계산합니다. `CommonAssetsManager.get()`의 클라이언트 대체 경로는 동기화된 `CommonNetworkCache.INSTANCE`인 것을 확인했습니다. 커서 이동은 네트워크 요청이나 실제 인벤토리 변경을 발생시키지 않습니다.

제거 옵션은 복사본에서 해당 외부 부착물만 해제한 뒤 원본 `GunAttachmentSlot`에 전달하여 빈 종류 아이콘을 얻습니다. 근접 스킨 아이콘에는 동일 아이템에 등록된 스킨 데이터가 적용된 서버 제공 복사본을 사용합니다. TaCZ가 없으면 18×18 ES 아이템 버튼으로 표시하며 서버에서 클라이언트 클래스를 로드하지 않습니다. 장비 목록 아이콘은 카탈로그가 바뀔 때만 인코딩하고 스킨·부착물 스택은 기존 상태 캐시에 포함합니다.

기본 서버 검사, 설치된 TaCZ 서버 검사, 실제 표시된 클라이언트 GUI 배율 2/3에서 교체 애니메이션·빈 슬롯·스킨 아이콘·호버 비교·자동 적용·Esc 복원을 검증합니다. TaCZ JAR·총기팩·설정은 변경하지 않습니다.


### 로비 탄약·개조 제한·UI 수정 (0.5.9)

동일한 TaCZ 1.1.8-hotfix-r7의 `LivingEntityAmmoCheck.needCheckAmmo`, `ModernKineticGunScriptAPI.hasAmmoToConsume/consumeAmmoFromPlayer`를 확인했습니다. 로비 플레이어에만 네이티브 예비탄 검사와 추출을 우회하며, 실제 탄창 소모와 재장전은 유지합니다. 임무용 예비탄은 저장하거나 덮어쓰지 않습니다. 판정은 현재 차원을 직접 읽으므로 차원을 나가면 즉시 해제되며 몹에는 적용되지 않습니다.

`RefitKey`가 `GunRefitScreen`을 여는 경로와 `ClientMessageRefitGun`, `ClientMessageUnloadAttachment`, `ClientMessageLaserColor`의 정적 `handle` 시그니처 및 enqueueWork 이전 호출을 확인했습니다. 화면은 NeoForge `ScreenEvent.Opening`으로 취소하며 세 기본 개조 요청은 선택적 Mixin의 HEAD에서 취소합니다. ES 공개 API 부착·해제와 선택 콜백은 이 패킷을 사용하지 않아 계속 정상 작동합니다. TaCZ 자체 코드·리소스·설정은 변경하지 않습니다.

원본 버튼은 유지하되 떠다니는 툴팁을 호출하지 않습니다. 고정 설명 칸, 가운데 정렬, 전체 패널의 동일 이동, 스탯 전경의 명시적 깊이를 사용합니다. 실제 GUI 배율 2/3와 GPU 캡처의 일곱 막대 픽셀, 기본 개조 화면 차단 및 서버 요청 차단·로비 이탈을 검증합니다.


### Create 연결 유리와 아틀라스 좌표 (0.5.10)

설치된 Create NeoForge 1.21.1 6.0.10의 `AllPaletteBlocks`, `WindowGen.framedGlass`, `ConnectedGlassBlock`, `CTModel.getQuads`와 `BakedQuadHelper.clone`을 분석했습니다. `CTModel`은 면을 복사하고 연결 텍스처의 UV 좌표로 바꾸지만 `getSprite()`는 원본 스프라이트를 유지합니다. 기존 ES가 좌표를 원본 경계로 잘라 읽어 큰 유리의 검사 광선 256개가 모두 막히는 것을 실제 클라이언트에서 재현했습니다.

ES는 UV가 원본 스프라이트 범위를 벗어났을 때 NeoForge `TextureAtlas.getTextures()` 공개 API에서 실제 범위를 포함하는 스프라이트를 찾아 사용합니다. 일반 면은 원본 경로를 유지하고, 검색은 512개 제한 캐시에 저장하며 아틀라스 재적용 시 함께 초기화합니다. Create 내부 필드 접근이나 Mixin, 외부 JAR·모델·텍스처 수정은 필요하지 않습니다. 알 수 없는 범위와 지원하지 않는 모델은 기존 안전한 충돌 형태를 유지합니다.

큰 유리·가로 유리·세로 유리·타일 유리를 각 6방향으로 검사하고, 독립 블록의 단면 256개 중 134개가 투과하고 122개가 불투명 무늬에 차단되는 것을 확인했습니다. 연결된 3×3 유리, 실제 손전등 그림자 맵의 유리 뒤 조명·뒤쪽 돌벽 차단, 차광 유리 차단, 캐시 초기화, 기존 엔드 막대·바닐라 및 Create 사다리 검사를 유지합니다. 기본 렌더러와 Iris·Sodium·Complementary Reimagined r5.9.3의 실제 클라이언트에서 검사합니다.

### TaCZ 원본 성능표·간단 툴팁 (0.5.11)

설치된 TaCZ 1.1.8-hotfix-r7의 `AttachmentPropertyManager.getModifiers`, `IAttachmentModifier.getPropertyDiagramsData`와 `DiagramsData.titleKey/defaultString/positivelyBetter`를 직접 확인했습니다. `defaultString`에는 해당 복사본의 부착물까지 적용한 표시값이 들어갑니다. 이 API는 클라이언트 전용으로 전용 서버에서 제거되므로 ES의 클라이언트 연동 클래스에서만 호출합니다. 서버는 기존 안전한 공통 API로 장비·데이터를 전달합니다. 12개 표시 행 중 탄창 용량은 기존 `getAmmoCountWithAttachment`, 나머지는 원본 성능표의 최종 문자열·단위·개선 방향을 사용합니다. 반동 곡선과 분산 계산을 임의의 다른 공식으로 복제하지 않습니다. 선택 및 호버 후보 캐시에만 계산하고, 실패하면 기존 서버 메타데이터로 돌아갑니다.

원본 `GunTooltip`은 텍스트 행 외의 구조화된 툴팁이므로 `ItemTooltipEvent`의 텍스트만 지우는 방식으로는 제거되지 않습니다. NeoForge의 공개 `RenderTooltipEvent.GatherComponents` 단계에서 이름·`AmmoItemBuilder`의 원본 탄약 이름·`ClientAssetsManager.getPackInfo`의 실제 팩 이름으로 교체합니다. 아이템·원본 JAR·총기팩을 변경하지 않습니다.

실제 표시되는 클라이언트에서 GUI 배율 2/3의 12개 수치·얇은 막대·부착물 추가/제거 비교·변화량 너비에 맞춘 이동·스탯 설명·영역별 진입/종료·실제 인벤토리의 세 줄 툴팁·기존 자동 저장·HUD 복원을 검증합니다. 이전 버전의 일곱 항목·4픽셀 막대·단순 증감 색상 설명은 0.5.11의 표시 규칙으로 대체합니다.

### 장비 카드 가로 폭 (0.5.12)

ES 자체 `EquipmentHudLayout`의 고정 폭을 176에서 128 논리 픽셀로 줄였습니다. 기본 정수 배율 2에서는 실제 화면 폭이 352에서 256픽셀로 줄어듭니다. 이름 영역의 좌우 여백을 줄이고 선택 화살표 공간을 유지합니다. 폰트 정수 배율·카드 높이·개별 배경·오른쪽 끝 고정·이름 말줄임과 외부 모드 연동은 유지합니다. GUI 배율 2/3의 실제 클라이언트 캡처로 확인합니다.

### Better Combat 충전 조작·모션 (0.5.13)

현재 인스턴스의 Better Combat NeoForge `2.4.0+1.21.1`, Player Animator `2.0.4+1.21.1`, Cloth Config `15.0.140`의 JAR·메타데이터를 확인했습니다. ES의 Better Combat 선택 의존성 범위는 `[2.4.0,2.5)`입니다. 미설치 환경에서는 확장 근접 조작만 꺼지고 기존 기능은 유지합니다. 외부 모드와 의존성 JAR는 ES 배포물에 포함하지 않습니다.

일반 반복 공격은 원본 `Minecraft.startUpswing(WeaponAttributes)`를 캐시한 호출로 시작합니다. 공개 API에는 공격 시작 요청 메서드가 없어 확인된 원본 입력 진입점만 연결하며, 모델·콤보·선딜·타격 범위·네트워크·타격음·내구도는 원본에 맡깁니다. Minecraft `startAttack/continueAttack/startUseItem` 앞에서 ES 슬롯 입력을 분리하고, 버튼을 놓을 때 바닐라 `missTime` 초기화를 유지하여 월드 입장 후 공격이 막히는 문제를 방지합니다. 공개 `CombatFlags`의 공격 비활성 상태를 존중하며 다른 모드의 플래그를 덮어쓰지 않습니다.

`ServerNetwork.handleAttackRequest`의 원본 요청을 감싸 충전 시각과 무기를 서버에서 검사하고, 강공격의 후보를 가장 가까운 보이는 대상 하나로 줄인 뒤 원본 처리로 전달합니다. 원본 `MinecraftServer.executeIfPossible`는 호출 상황에 따라 타격을 뒤로 미루므로 해당 Runnable에도 공격 문맥을 전달하고 finally로 복원합니다. 피해 배율은 NeoForge `LivingIncomingDamageEvent`에서 해당 플레이어와 원본 요청 대상에만 적용하며, 강공격의 바닐라 추가 휩쓸기는 `SweepAttackEvent`로 막습니다. 정상·지연 실행에서 다른 공격에 배율이 남지 않습니다.

`getAttackCooldownTicksCapped/getRangeForItem` 반환값에 무기별 배율을 적용합니다. 강공격 모션은 짧은 생성 범위에서 `PlayerAttackHelper.getCurrentAttack`의 `AttackHand/WeaponAttributes.Attack`를 복사해 모션 ID만 바꾸고, 원본 레지스트리를 수정하지 않습니다. 원본 애니메이션 패킷으로 팀원에게도 전달하며 `PlayerAnimationRegistry.getAnimation`으로 클라이언트 리소스 유무를 확인합니다. 공식 한손·양손 모션 이름에 맞춰 원본 시작 파라미터의 손 사용만 복사하여 조정합니다. 누락된 모션은 원래 콤보 모션으로 돌아갑니다.

설정은 `es/melee/combat.json`의 공통값·아이템별 부분 변경으로 관리합니다. `/reload` 때 원자적으로 검증하고 이전 정상값을 유지하며, 확장 전의 간결한 설정을 접속 클라이언트에 전달해 무기 수가 많을 때도 불필요하게 패킷을 늘리지 않습니다. 크리에이티브·다른 슬롯은 원래 조작을 유지합니다. [조작·수치·모션 설정](melee.ko.md).

검증은 외부 모드 없는 기본 서버, 설치된 Better Combat·TaCZ를 함께 로드한 서버 및 실제 클라이언트로 나눕니다. 실제 키 매핑 유지 → 원본 모션·타격 패킷 → 서버 피해까지 확인하며, 실제 `/reload`로 한손·양손 강공격 모션 변경·단일 대상·우클릭 해제 뒤 타격·시간 초과·메뉴 취소·크리에이티브 예외를 검사합니다. 개발 검사와 전용 구조물은 배포 JAR에서 제외합니다.


### 충전 준비 모션·즉시 강공격·바닐라 게이지 (0.5.14)

동일한 Better Combat 2.4.0의 `AbstractClientPlayerEntityMixin.playAttackAnimation`, `AttackAnimationSubStack`, `CustomAnimationPlayer`, `WeaponSwing`과 `MinecraftClientInject.startUpswing/performAttack/currentUpswingTicks`의 실제 바이트코드를 확인했습니다. Player Animator 2.0.4의 키프레임 시간·부분 틱 샘플링을 사용합니다. 원본이 조정한 모션 복사본에서 0~beginTick만 충전 시간에 맞춰 샘플링하고 최대 충전에서 유지합니다. 좌클릭 시 beginTick 이후를 이어 재생하며 원본 타격 메서드를 같은 클라이언트 틱에 한 번 호출합니다. 이후 native WeaponSwing의 upswing을 -1로 유지해 다음 틱에 타격이 재실행되지 않게 하고 원본 회복·쿨타임을 유지합니다. 내부 메서드·필드 연결은 검증한 정확한 버전에 한정하며 리플렉션 핸들은 최초 한 번만 조회합니다.

주변 클라이언트에는 서버가 승인한 준비·타격·취소 상태를 ES 패킷으로 전달합니다. 강공격 범위에서만 Better Combat의 시작 모션 패킷을 억제해 관전자에게 준비 동작이 중복 재생되지 않게 합니다. 일반 공격·원본 레지스트리·외부 JAR·에셋·설정은 변경하지 않습니다. 취소·시간 초과·아이템 변경·메뉴·접속 종료를 정리합니다.

Minecraft 1.21.1 Gui.renderCrosshair의 실제 hud/crosshair_attack_indicator_background 및 progress 스프라이트와 좌표·블렌딩을 재사용합니다. 충전 게이지가 보일 때만 기본 공격 지시계를 숨기며 조준선과 나머지 HUD는 유지합니다. 표시된 실제 클라이언트에서 준비·최대 유지·타격·시간 초과·메뉴 취소·한손/양손 설정 재적용을 확인합니다.


### 충전 감속·1인칭 장착 총기 표시 (0.5.15)

Minecraft 1.21.1 `AttributeInstance.addOrUpdateTransientModifier/getModifier/removeModifier`와 `ADD_MULTIPLIED_TOTAL`을 확인했습니다. ES 소유의 일시적 이동속도 배율 하나만 적용하며 기본 속도·다른 효과·달리기 상태를 변경하지 않습니다. 서버는 충전 시작 시각을 기준으로 매 틱 판정하고 클라이언트는 같은 설정으로 입력을 예측합니다. 같은 배율이면 수정자를 다시 만들지 않으며 취소·타격·시간 초과·슬롯 변경·메뉴·사망·차원 이동·접속 종료와 설정 재적용 시 제거합니다. 설정은 fullChargeMovementMultiplier(기본 0.4), 아이템별 부분 변경과 /reload를 지원하며 기존 파일에서 생략하면 기본값을 사용합니다.

설치된 TaCZ 1.1.8-hotfix-r7 `HumanoidOffhandRender.renderGun/renderGunItem`의 장착 총기 렌더링 경로와 Player Animator 2.0.4 `FirstPersonMode.isFirstPersonPass`의 ThreadLocal 렌더링 단계 구분을 직접 확인했습니다. ES 어댑터가 본인·본인 카메라·1인칭·실제 1인칭 애니메이션 렌더링 단계일 때만 장착 총기 제출을 생략합니다. 카메라 설정만으로 전체 플레이어 모델을 숨기지 않으므로 제3자·3인칭·인벤토리 미리보기·월드 그림자 렌더링 경로는 유지합니다. Player Animator가 없는 환경에서는 해당 클래스에 접근하지 않습니다. 외부 JAR·모델·설정은 수정하지 않습니다.


### 강공격 충전 만료 경고 (0.5.16)

기존 서버 충전 상태와 클라이언트 시간 보간을 사용해 만료 직전 12틱(0.6초)에 여섯 번의 표시 단계를 배치합니다. 0.1초 숨김/표시를 세 번 반복하며 충전 제한이 짧으면 기간을 비례 축소합니다. HUD 시간과 경고 단계는 충전 중 뒤로 이동하지 않아 서버 동기화 보정으로 같은 깜빡임이 반복되지 않습니다. 새 충전·취소·메뉴 전환 때 초기화합니다. 기본 조준선의 쿨타임 지시계는 경고의 숨김 단계에도 억제하여 다른 게이지가 대신 보이지 않게 합니다. 타격·감속·충전 판정과 패킷은 변경하지 않습니다. 실제 클라이언트에서 여섯 표시 단계와 화면 캡처를 확인합니다.
