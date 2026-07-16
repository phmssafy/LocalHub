<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from 'vue'

import {
  useRoute,
  useRouter,
} from 'vue-router'

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import {
  loadAllPlaces,
} from '../services/placeDataService.js'

import {
  getPosts,
} from '../services/localStorageService.js'

import {
  openChatbot,
} from '../composables/chatbotState.js'

const route = useRoute()
const router = useRouter()

const categories = [
  '종합',
  '관광지',
  '레포츠',
  '문화시설',
  '쇼핑',
  '숙박',
  '여행코스',
  '음식점',
  '축제공연행사',
]

const categoryColors = {
  관광지: '#2563eb',
  레포츠: '#16a34a',
  문화시설: '#7c3aed',
  쇼핑: '#db2777',
  숙박: '#65a30d',
  여행코스: '#f97316',
  음식점: '#dc2626',
  축제공연행사: '#ca8a04',
}

const activeCategory = ref('종합')
const searchKeyword = ref('')
const selectedPlace = ref(null)

const places = ref([])
const posts = ref([])

const isPlaceLoading = ref(true)
const placeLoadError = ref('')
const placeLoadWarning = ref('')

const brokenImageIds = ref(new Set())

/*
 * Leaflet 관련 객체는 Vue 반응형 프록시로 변환하지 않도록
 * shallowRef를 사용합니다.
 */
const mapElement = ref(null)
const mapInstance = shallowRef(null)
const markerLayer = shallowRef(null)

const markersByPlaceId = new Map()

const filteredPlaces = computed(() => {
  const keyword = searchKeyword.value
    .trim()
    .toLocaleLowerCase('ko-KR')

  return places.value.filter((place) => {
    const matchesCategory =
      activeCategory.value === '종합' ||
      place.category === activeCategory.value

    if (!matchesCategory) {
      return false
    }

    if (!keyword) {
      return true
    }

    const searchTargets = [
      place.name,
      place.category,
      place.region,
      place.address,
      place.telephone,
    ]

    return searchTargets.some((target) =>
      String(target || '')
        .toLocaleLowerCase('ko-KR')
        .includes(keyword),
    )
  })
})

const mappablePlaces = computed(() =>
  filteredPlaces.value.filter((place) =>
    isValidCoordinate(
      place.latitude,
      place.longitude,
    ),
  ),
)

const boardTitle = computed(() => {
  if (selectedPlace.value) {
    return `${selectedPlace.value.name} 게시판`
  }

  return '종합 게시판'
})

const visiblePosts = computed(() => {
  if (selectedPlace.value) {
    return posts.value.filter(
      (post) =>
        String(post.placeId) ===
        selectedPlace.value.id,
    )
  }

  return posts.value.filter(
    (post) =>
      post.placeId === null ||
      post.placeId === undefined ||
      post.placeId === '',
  )
})

function isValidCoordinate(
  latitude,
  longitude,
) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 33 &&
    latitude <= 39 &&
    longitude >= 124 &&
    longitude <= 132
  )
}

function initializeMap() {
  if (
    !mapElement.value ||
    mapInstance.value
  ) {
    return
  }

  mapInstance.value = L.map(
    mapElement.value,
    {
      zoomControl: true,
      preferCanvas: true,
    },
  ).setView(
    [35.35, 127.1],
    8,
  )

  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution:
        '&copy; OpenStreetMap contributors',
    },
  ).addTo(mapInstance.value)

  markerLayer.value =
    L.layerGroup().addTo(
      mapInstance.value,
    )
}

function createPlaceMarker(place) {
  const markerColor =
    categoryColors[place.category] ||
    '#176b5b'

  const marker = L.circleMarker(
    [
      place.latitude,
      place.longitude,
    ],
    {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: markerColor,
      fillOpacity: 0.9,
    },
  )

  marker.bindTooltip(
    place.name,
    {
      direction: 'top',
      offset: [0, -8],
      opacity: 0.95,
    },
  )

  marker.on('click', () => {
    selectPlace(place)
  })

  return marker
}

function renderMarkers({
  fitBounds = false,
} = {}) {
  if (
    !mapInstance.value ||
    !markerLayer.value
  ) {
    return
  }

  markerLayer.value.clearLayers()
  markersByPlaceId.clear()

  const bounds = []

  mappablePlaces.value.forEach((place) => {
    const marker =
      createPlaceMarker(place)

    marker.addTo(markerLayer.value)

    markersByPlaceId.set(
      place.id,
      marker,
    )

    bounds.push([
      place.latitude,
      place.longitude,
    ])
  })

  if (
    !fitBounds ||
    bounds.length === 0
  ) {
    return
  }

  if (bounds.length === 1) {
    mapInstance.value.setView(
      bounds[0],
      14,
    )

    return
  }

  mapInstance.value.fitBounds(
    bounds,
    {
      padding: [30, 30],
      maxZoom: 12,
    },
  )
}

function focusPlaceOnMap(place) {
  if (
    !mapInstance.value ||
    !isValidCoordinate(
      place.latitude,
      place.longitude,
    )
  ) {
    return
  }

  mapInstance.value.flyTo(
    [
      place.latitude,
      place.longitude,
    ],
    Math.max(
      mapInstance.value.getZoom(),
      14,
    ),
    {
      duration: 0.5,
    },
  )

  const marker =
    markersByPlaceId.get(place.id)

  if (marker) {
    window.setTimeout(() => {
      marker.openTooltip()
    }, 450)
  }
}

function updateSelectedPlaceQuery(
  placeId,
) {
  const nextQuery = {
    ...route.query,
  }

  if (placeId) {
    nextQuery.placeId = placeId
  } else {
    delete nextQuery.placeId
  }

  router.replace({
    name: 'home',
    query: nextQuery,
  })
}

function selectPlace(place) {
  selectedPlace.value = place

  updateSelectedPlaceQuery(place.id)
  focusPlaceOnMap(place)
}

async function selectCategory(category) {
  activeCategory.value = category
  selectedPlace.value = null

  updateSelectedPlaceQuery(null)

  await nextTick()

  renderMarkers({
    fitBounds: true,
  })
}

function showGeneralBoard() {
  selectedPlace.value = null
  updateSelectedPlaceQuery(null)
}

function submitSearch() {
  /*
   * 검색어는 computed를 통해 실시간으로 적용됩니다.
   */
}

function goToWrite() {
  router.push({
    name: 'post-write',

    query: selectedPlace.value
      ? {
          placeId:
            selectedPlace.value.id,
        }
      : {},
  })
}

function openPost(post) {
  router.push({
    name: 'post-detail',
    params: {
      postId: post.id,
    },
  })
}

function formatPostDate(createdAt) {
  if (!createdAt) {
    return '-'
  }

  const date = new Date(createdAt)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat(
    'ko-KR',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  ).format(date)
}

function handleImageError(placeId) {
  const nextBrokenImageIds =
    new Set(brokenImageIds.value)

  nextBrokenImageIds.add(placeId)

  brokenImageIds.value =
    nextBrokenImageIds
}

/*
 * 검색어 변경 시 목록뿐 아니라 지도 마커도 갱신합니다.
 */
watch(
  searchKeyword,
  async () => {
    if (
      selectedPlace.value &&
      !filteredPlaces.value.some(
        (place) =>
          place.id ===
          selectedPlace.value.id,
      )
    ) {
      selectedPlace.value = null
      updateSelectedPlaceQuery(null)
    }

    await nextTick()

    renderMarkers({
      fitBounds: true,
    })
  },
)

onMounted(async () => {
  posts.value = getPosts()

  isPlaceLoading.value = true
  placeLoadError.value = ''
  placeLoadWarning.value = ''

  await nextTick()
  initializeMap()

  try {
    const {
      places: loadedPlaces,
      failedFiles,
    } = await loadAllPlaces()

    places.value = loadedPlaces

    if (failedFiles.length > 0) {
      const failedFileNames =
        failedFiles
          .map((file) => file.fileName)
          .join(', ')

      placeLoadWarning.value =
        `일부 데이터를 불러오지 못했습니다: ${failedFileNames}`

      console.warn(
        '일부 관광 데이터 파일 로드 실패:',
        failedFiles,
      )
    }

    if (loadedPlaces.length === 0) {
      throw new Error(
        '불러온 장소 데이터가 없습니다.',
      )
    }

    const requestedPlaceId =
      typeof route.query.placeId ===
      'string'
        ? route.query.placeId
        : ''

    const requestedPlace =
      requestedPlaceId
        ? loadedPlaces.find(
            (place) =>
              place.id ===
              requestedPlaceId,
          ) ?? null
        : null

    if (requestedPlace) {
      activeCategory.value =
        requestedPlace.category

      selectedPlace.value =
        requestedPlace
    }

    await nextTick()

    renderMarkers({
      fitBounds: !requestedPlace,
    })

    if (requestedPlace) {
      focusPlaceOnMap(requestedPlace)
    }

    window.setTimeout(() => {
      mapInstance.value?.invalidateSize()
    }, 100)
  } catch (error) {
    console.error(
      '관광지 데이터 로드 실패:',
      error,
    )

    placeLoadError.value =
      error instanceof Error
        ? error.message
        : '관광지 데이터를 불러오지 못했습니다.'
  } finally {
    isPlaceLoading.value = false
  }
})

onUnmounted(() => {
  markerLayer.value?.clearLayers()
  markersByPlaceId.clear()

  if (mapInstance.value) {
    mapInstance.value.remove()
  }

  markerLayer.value = null
  mapInstance.value = null
})
</script>

<template>
  <div class="localhub-page">
    <!-- 상단부 -->
    <header class="site-header">
      <div class="header-container">
        <button
          type="button"
          class="logo"
          aria-label="Localhub 홈"
          @click="
            selectCategory('종합')
          "
        >
          호남야 ~ 호
        </button>

        <nav
          class="category-navigation"
          aria-label="장소 카테고리"
        >
          <button
            v-for="category in categories"
            :key="category"
            type="button"
            class="category-button"
            :class="{
              active:
                activeCategory === category,
            }"
            @click="
              selectCategory(category)
            "
          >
            {{ category }}
          </button>
        </nav>
      </div>
    </header>

    <main class="main-container">
      <!-- 검색 -->
      <section class="search-section">
        <form
          class="search-form"
          @submit.prevent="submitSearch"
        >
          <label
            for="place-search"
            class="screen-reader-only"
          >
            관광지 검색
          </label>

          <input
            id="place-search"
            v-model="searchKeyword"
            type="search"
            class="search-input"
            placeholder="관광지 이름, 지역 또는 주소를 검색하세요."
          />

          <button
            type="submit"
            class="search-button"
          >
            검색
          </button>
        </form>
      </section>

      <p
        v-if="placeLoadWarning"
        class="load-warning"
      >
        {{ placeLoadWarning }}
      </p>

      <!-- 지도 및 관광지 목록 -->
      <section class="explore-dashboard">
        <!-- 왼쪽 지도 -->
        <section class="map-dashboard">
          <div class="map-header">
            <div>
              <span class="panel-caption">
                MAP
              </span>

              <h2>
                광주·전라권 지도
              </h2>
            </div>

            <span class="map-count">
              {{ mappablePlaces.length }}개
            </span>
          </div>

          <div class="map-wrapper">
            <div
              ref="mapElement"
              class="map-container"
            ></div>

            <div
              v-if="isPlaceLoading"
              class="map-overlay"
            >
              장소 데이터를 불러오는
              중입니다.
            </div>

            <div
              v-else-if="placeLoadError"
              class="map-overlay error-overlay"
            >
              <strong>
                지도 데이터를 불러오지
                못했습니다.
              </strong>

              <p>{{ placeLoadError }}</p>
            </div>
          </div>

          <div class="map-legend">
            <span
              v-for="category in categories.slice(1)"
              :key="category"
            >
              <i
                :style="{
                  backgroundColor:
                    categoryColors[category],
                }"
              ></i>

              {{ category }}
            </span>
          </div>
        </section>

        <!-- 오른쪽 관광지 목록 -->
        <aside class="place-dashboard">
          <div class="panel-header">
            <div>
              <span class="panel-caption">
                PLACE
              </span>

              <h2>관광지 목록</h2>
            </div>

            <span class="place-count">
              {{
                isPlaceLoading
                  ? '...'
                  : `${filteredPlaces.length}개`
              }}
            </span>
          </div>

          <div
            v-if="isPlaceLoading"
            class="empty-state"
          >
            <strong>
              장소 데이터를 불러오는
              중입니다.
            </strong>
          </div>

          <div
            v-else-if="placeLoadError"
            class="empty-state error-state"
          >
            <strong>
              데이터 로드에 실패했습니다.
            </strong>

            <p>{{ placeLoadError }}</p>
          </div>

          <div
            v-else-if="
              filteredPlaces.length
            "
            class="place-list"
          >
            <button
              v-for="place in filteredPlaces"
              :key="place.id"
              type="button"
              class="place-item"
              :class="{
                selected:
                  selectedPlace?.id ===
                  place.id,
              }"
              @click="selectPlace(place)"
            >
              <span
                class="place-category"
              >
                {{ place.category }}
              </span>

              <strong class="place-name">
                {{ place.name }}
              </strong>

              <span
                class="place-address"
              >
                {{
                  place.address ||
                  '주소 정보 없음'
                }}
              </span>

              <span
                v-if="
                  !isValidCoordinate(
                    place.latitude,
                    place.longitude,
                  )
                "
                class="coordinate-warning"
              >
                지도 좌표 없음
              </span>
            </button>
          </div>

          <div
            v-else
            class="empty-state"
          >
            <strong>
              검색 결과가 없습니다.
            </strong>

            <p>
              다른 검색어나 카테고리를
              선택해 주세요.
            </p>
          </div>
        </aside>
      </section>

      <!-- 장소 상세 및 게시판 -->
      <section class="board-dashboard">
        <article
          v-if="selectedPlace"
          class="selected-place"
        >
          <div
            class="selected-place-information"
          >
            <div
              class="selected-place-tags"
            >
              <span>
                {{ selectedPlace.category }}
              </span>

              <span>
                {{ selectedPlace.region }}
              </span>
            </div>

            <h2>
              {{ selectedPlace.name }}
            </h2>

            <p
              class="selected-place-address"
            >
              {{
                selectedPlace.address ||
                '등록된 주소가 없습니다.'
              }}
            </p>

            <dl
              class="place-information-list"
            >
              <div>
                <dt>전화번호</dt>

                <dd>
                  {{
                    selectedPlace.telephone ||
                    '정보 없음'
                  }}
                </dd>
              </div>

              <div>
                <dt>우편번호</dt>

                <dd>
                  {{
                    selectedPlace.zipCode ||
                    '정보 없음'
                  }}
                </dd>
              </div>

              <div>
                <dt>콘텐츠 ID</dt>

                <dd>
                  {{
                    selectedPlace.contentId
                  }}
                </dd>
              </div>

              <div>
                <dt>좌표</dt>

                <dd>
                  <template
                    v-if="
                      isValidCoordinate(
                        selectedPlace.latitude,
                        selectedPlace.longitude,
                      )
                    "
                  >
                    {{
                      selectedPlace.latitude
                    }},
                    {{
                      selectedPlace.longitude
                    }}
                  </template>

                  <template v-else>
                    정보 없음
                  </template>
                </dd>
              </div>
            </dl>
          </div>

          <img
            v-if="
              selectedPlace.image &&
              !brokenImageIds.has(
                selectedPlace.id,
              )
            "
            :src="selectedPlace.image"
            :alt="
              `${selectedPlace.name} 이미지`
            "
            class="place-image"
            @error="
              handleImageError(
                selectedPlace.id,
              )
            "
          />

          <div
            v-else
            class="image-placeholder"
          >
            등록된 이미지가 없습니다.
          </div>
        </article>

        <div class="board-header">
          <div>
            <span class="panel-caption">
              COMMUNITY
            </span>

            <h2>{{ boardTitle }}</h2>
          </div>

          <div class="board-actions">
            <button
              v-if="selectedPlace"
              type="button"
              class="general-board-button"
              @click="showGeneralBoard"
            >
              종합 게시판
            </button>

            <button
              type="button"
              class="write-button"
              @click="goToWrite"
            >
              글쓰기
            </button>
          </div>
        </div>

        <div class="board-column-header">
          <span>번호</span>
          <span>제목</span>
          <span>작성자</span>
          <span>작성일</span>
          <span>조회</span>
        </div>

        <div
          v-if="visiblePosts.length"
          class="post-list"
        >
          <button
            v-for="(
              post,
              index
            ) in visiblePosts"
            :key="post.id"
            type="button"
            class="post-row"
            @click="openPost(post)"
          >
            <span class="post-number">
              {{
                visiblePosts.length -
                index
              }}
            </span>

            <strong class="post-title">
              {{ post.title }}
            </strong>

            <span class="post-author">
              {{ post.author || '익명' }}
            </span>

            <span class="post-date">
              {{
                formatPostDate(
                  post.createdAt,
                )
              }}
            </span>

            <span class="post-views">
              {{ post.views || 0 }}
            </span>
          </button>
        </div>

        <div
          v-else
          class="empty-state board-empty-state"
        >
          <strong>
            등록된 게시글이 없습니다.
          </strong>

          <p>
            이 게시판의 첫 번째 게시글을
            작성해 보세요.
          </p>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <div class="footer-container">
        <div>
          <strong class="footer-title">
            Localhub AI
          </strong>

          <p>
            지역 관광 정보를 AI 챗봇에게
            질문할 수 있습니다.
          </p>
        </div>

        <button
          type="button"
          class="chatbot-button"
          @click="openChatbot"
        >
          <span>
            AI 챗봇에게 물어보기
          </span>

          <small>열기</small>
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.localhub-page {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  background: #f4f6f5;
  color: #1f2d29;
}

/* 상단 */

.site-header {
  border-bottom: 1px solid #dce4e1;
  background: #ffffff;
}

.header-container {
  width: min(1400px, calc(100% - 48px));
  margin: 0 auto;
  padding-top: 24px;
}

.logo {
  padding: 0;
  border: 0;
  background: transparent;
  color: #176b5b;
  font-family: 'Arial Rounded MT Bold', Arial, sans-serif;
  font-size: 34px;
  font-weight: 700;
  font-style: italic;
  letter-spacing: -1px;
  cursor: pointer;
}

.category-navigation {
  display: flex;
  margin-top: 20px;
  overflow-x: auto;
}

.category-button {
  flex: 0 0 auto;
  padding: 15px 17px 13px;
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  color: #687570;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.category-button:hover {
  background: #f4f8f6;
  color: #176b5b;
}

.category-button.active {
  border-bottom-color: #176b5b;
  color: #176b5b;
}

/* 메인 */

.main-container {
  width: min(1400px, calc(100% - 48px));
  flex: 1;
  margin: 0 auto;
  padding: 32px 0 56px;
}

/* 검색 */

.search-section {
  margin-bottom: 24px;
}

.search-form {
  display: flex;
  padding: 9px;
  border: 1px solid #d6e0dc;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 5px 18px rgb(18 67 56 / 6%);
}

.search-input {
  min-width: 0;
  flex: 1;
  padding: 13px 16px;
  border: 0;
  outline: none;
  background: transparent;
  color: #1f2d29;
  font-size: 16px;
}

.search-input::placeholder {
  color: #9ba6a2;
}

.search-button {
  min-width: 96px;
  padding: 12px 20px;
  border: 0;
  border-radius: 8px;
  background: #176b5b;
  color: #ffffff;
  font-weight: 700;
  cursor: pointer;
}

/* 로드 경고 */

.load-warning {
  margin: 0 0 20px;
  padding: 11px 18px;
  border: 1px solid #f1d7a5;
  border-radius: 9px;
  background: #fff8e8;
  color: #795614;
  font-size: 12px;
  line-height: 1.5;
}

/* 지도 및 장소 목록 */

.explore-dashboard {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    minmax(320px, 390px);
  gap: 24px;
  align-items: stretch;
}

.map-dashboard,
.place-dashboard,
.board-dashboard {
  border: 1px solid #dce4e1;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 8px 26px rgb(18 67 56 / 6%);
}

.map-dashboard,
.place-dashboard {
  min-height: 620px;
  overflow: hidden;
}

.map-header,
.panel-header,
.board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.map-header,
.panel-header {
  min-height: 82px;
  padding: 20px 22px;
  border-bottom: 1px solid #e5ebe8;
}

.panel-caption {
  color: #176b5b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.6px;
}

.map-header h2,
.panel-header h2,
.board-header h2 {
  margin: 4px 0 0;
  font-size: 22px;
  letter-spacing: -0.6px;
}

.map-count,
.place-count {
  display: inline-flex;
  min-width: 54px;
  height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border-radius: 999px;
  background: #edf5f2;
  color: #176b5b;
  font-size: 13px;
  font-weight: 700;
}

.map-wrapper {
  position: relative;
}

.map-container {
  width: 100%;
  height: 500px;
}

.map-overlay {
  position: absolute;
  z-index: 500;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 30px;
  background: rgb(255 255 255 / 88%);
  color: #53615c;
  text-align: center;
}

.map-overlay p {
  margin: 8px 0 0;
}

.error-overlay {
  color: #a43e3e;
}

.map-legend {
  display: flex;
  min-height: 38px;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 9px 16px;
  border-top: 1px solid #e5ebe8;
  background: #fafcfb;
}

.map-legend span {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #687570;
  font-size: 10px;
}

.map-legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* 장소 목록 */

.place-list {
  height: 537px;
  overflow-y: auto;
}

.place-item {
  position: relative;
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 7px;
  padding: 18px 20px;
  border: 0;
  border-bottom: 1px solid #edf1ef;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
}

.place-item:hover {
  background: #f6faf8;
}

.place-item.selected {
  background: #eaf5f1;
  box-shadow: inset 4px 0 0 #176b5b;
}

.place-category {
  color: #176b5b;
  font-size: 11px;
  font-weight: 700;
}

.place-name {
  color: #1f2d29;
  font-size: 15px;
}

.place-address {
  overflow: hidden;
  color: #7b8783;
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coordinate-warning {
  color: #b26a20;
  font-size: 10px;
}

/* 장소 상세 및 게시판 */

.board-dashboard {
  min-height: 540px;
  margin-top: 24px;
  padding: 24px;
}

.selected-place {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    260px;
  gap: 24px;
  margin-bottom: 28px;
  padding: 22px;
  border-radius: 12px;
  background: #edf5f2;
}

.selected-place-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.selected-place-tags span {
  padding: 5px 9px;
  border-radius: 5px;
  background: #ffffff;
  color: #176b5b;
  font-size: 12px;
  font-weight: 700;
}

.selected-place h2 {
  margin: 14px 0 8px;
  font-size: 24px;
}

.selected-place-address {
  margin: 0;
  color: #67746f;
  font-size: 14px;
  line-height: 1.6;
}

.place-information-list {
  display: grid;
  gap: 8px;
  margin: 20px 0 0;
}

.place-information-list div {
  display: grid;
  grid-template-columns:
    80px minmax(0, 1fr);
  gap: 12px;
  font-size: 13px;
}

.place-information-list dt {
  color: #71807a;
  font-weight: 700;
}

.place-information-list dd {
  overflow-wrap: anywhere;
  margin: 0;
  color: #34423d;
}

.place-image,
.image-placeholder {
  width: 100%;
  height: 200px;
  border-radius: 10px;
  background: #dfece7;
}

.place-image {
  object-fit: cover;
}

.image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  color: #66766f;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

/* 게시판 */

.board-actions {
  display: flex;
  gap: 8px;
}

.general-board-button,
.write-button {
  padding: 10px 16px;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
}

.general-board-button {
  border: 1px solid #ccd8d4;
  background: #ffffff;
  color: #52615c;
}

.write-button {
  border: 1px solid #176b5b;
  background: #176b5b;
  color: #ffffff;
}

.board-column-header,
.post-row {
  display: grid;
  grid-template-columns:
    64px
    minmax(220px, 1fr)
    90px
    110px
    64px;
  align-items: center;
}

.board-column-header {
  margin-top: 24px;
  padding: 13px 10px;
  border-top: 2px solid #34443f;
  border-bottom: 1px solid #dce4e1;
  color: #687570;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}

.post-row {
  width: 100%;
  padding: 17px 10px;
  border: 0;
  border-bottom: 1px solid #e8edeb;
  background: #ffffff;
  color: #687570;
  font-size: 13px;
  text-align: center;
  cursor: pointer;
}

.post-row:hover {
  background: #f7faf9;
}

.post-title {
  overflow: hidden;
  color: #25332e;
  font-size: 14px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 빈 상태 */

.empty-state {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 30px;
  color: #7a8682;
  text-align: center;
}

.empty-state strong {
  color: #394641;
}

.empty-state p {
  max-width: 300px;
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.6;
}

.error-state strong {
  color: #a43e3e;
}

.board-empty-state {
  min-height: 300px;
}

/* 하단 */

.site-footer {
  border-top: 1px solid #dce4e1;
  background: #173a34;
  color: #ffffff;
}

.footer-container {
  display: flex;
  width: min(1400px, calc(100% - 48px));
  margin: 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 30px;
  padding: 28px 0;
}

.footer-title {
  font-size: 18px;
}

.footer-container p {
  margin: 6px 0 0;
  color: #b8ccc6;
  font-size: 13px;
}

.chatbot-button {
  display: flex;
  min-width: 250px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 18px;
  border: 0;
  border-radius: 9px;
  background: #ffffff;
  color: #173a34;
  font-weight: 800;
}


.chatbot-button small {
  padding: 4px 7px;
  border-radius: 4px;
  background: #e6ecea;
  color: #697772;
  font-size: 11px;
}

.screen-reader-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  margin: -1px;
  padding: 0;
  border: 0;
  clip: rect(0, 0, 0, 0);
}

:global(.leaflet-tooltip) {
  border: 0;
  border-radius: 6px;
  box-shadow: 0 3px 10px rgb(0 0 0 / 15%);
  font-size: 12px;
  font-weight: 700;
}

:global(.leaflet-control-attribution) {
  font-size: 9px;
}

@media (max-width: 1000px) {
  .header-container,
  .main-container,
  .footer-container {
    width: min(100% - 28px, 1400px);
  }

  .explore-dashboard {
    grid-template-columns: 1fr;
  }

  .map-container {
    height: 500px;
  }

  .place-dashboard {
    min-height: 420px;
  }

  .place-list {
    height: 340px;
  }

  .selected-place {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .header-container {
    padding-top: 18px;
  }

  .logo {
    font-size: 28px;
  }

  .category-button {
    padding-right: 13px;
    padding-left: 13px;
    font-size: 14px;
  }

  .main-container {
    padding-top: 20px;
  }

  .search-form {
    padding: 7px;
  }

  .search-button {
    min-width: 72px;
    padding-right: 12px;
    padding-left: 12px;
  }

  .map-container {
    height: 420px;
  }

  .map-legend {
    display: none;
  }

  .board-dashboard {
    padding: 18px;
  }

  .board-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .board-actions {
    width: 100%;
  }

  .general-board-button,
  .write-button {
    flex: 1;
  }

  .board-column-header {
    display: none;
  }

  .post-row {
    grid-template-columns: 1fr auto;
    gap: 8px 16px;
    text-align: left;
  }

  .post-number,
  .post-author {
    display: none;
  }

  .post-title {
    grid-column: 1 / -1;
  }

  .footer-container {
    align-items: stretch;
    flex-direction: column;
  }

  .chatbot-button {
    width: 100%;
    min-width: 0;
  }
}
</style>