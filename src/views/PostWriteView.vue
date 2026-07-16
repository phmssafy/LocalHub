<script setup>
import {
  computed,
  onMounted,
  ref,
  watch,
} from 'vue'

import {
  useRoute,
  useRouter,
} from 'vue-router'

import {
  loadAllPlaces,
} from '../services/placeDataService.js'

import {
  createPost,
  getPostById,
  updatePost,
} from '../services/localStorageService.js'

const route = useRoute()
const router = useRouter()

const isEditMode = computed(
  () => route.name === 'post-edit',
)

const postId = computed(() =>
  typeof route.params.postId === 'string'
    ? route.params.postId
    : '',
)

const initialPlaceId =
  typeof route.query.placeId === 'string'
    ? route.query.placeId
    : ''

const boardType = ref(
  initialPlaceId
    ? 'place'
    : 'general',
)

const title = ref('')
const content = ref('')
const tagInput = ref('')
const password = ref('')
const passwordConfirm = ref('')

const places = ref([])
const selectedPlaceId = ref(initialPlaceId)
const placeSearchKeyword = ref('')

const isPageLoading = ref(true)
const isSubmitting = ref(false)

const formError = ref('')
const pageError = ref('')
const placeLoadError = ref('')

const pageTitle = computed(() =>
  isEditMode.value
    ? '게시글 수정'
    : '게시글 작성',
)

const submitButtonText = computed(() => {
  if (isSubmitting.value) {
    return isEditMode.value
      ? '수정 중...'
      : '저장 중...'
  }

  return isEditMode.value
    ? '게시글 수정'
    : '게시글 등록'
})

const selectedPlace = computed(() =>
  places.value.find(
    (place) =>
      place.id === selectedPlaceId.value,
  ) ?? null,
)

const filteredPlaces = computed(() => {
  const keyword = placeSearchKeyword.value
    .trim()
    .toLocaleLowerCase('ko-KR')

  if (!keyword) {
    return places.value.slice(0, 20)
  }

  return places.value
    .filter((place) => {
      const searchTarget = [
        place.name,
        place.category,
        place.address,
      ]
        .join(' ')
        .toLocaleLowerCase('ko-KR')

      return searchTarget.includes(keyword)
    })
    .slice(0, 20)
})

watch(boardType, (nextBoardType) => {
  formError.value = ''

  if (nextBoardType === 'general') {
    selectedPlaceId.value = ''
    placeSearchKeyword.value = ''
  }
})

onMounted(async () => {
  isPageLoading.value = true
  pageError.value = ''
  placeLoadError.value = ''

  let editingPlaceId = initialPlaceId

  try {
    if (isEditMode.value) {
      const savedPost =
        getPostById(postId.value)

      if (!savedPost) {
        throw new Error(
          '수정할 게시글을 찾을 수 없습니다.',
        )
      }

      title.value = savedPost.title
      content.value = savedPost.content
      tagInput.value =
        Array.isArray(savedPost.tags)
          ? savedPost.tags.join(', ')
          : ''

      editingPlaceId =
        savedPost.placeId
          ? String(savedPost.placeId)
          : ''

      selectedPlaceId.value =
        editingPlaceId

      boardType.value =
        editingPlaceId
          ? 'place'
          : 'general'
    }

    try {
      const {
        places: loadedPlaces,
      } = await loadAllPlaces()

      places.value = loadedPlaces

      if (editingPlaceId) {
        const initialPlace =
          loadedPlaces.find(
            (place) =>
              place.id === editingPlaceId,
          )

        if (initialPlace) {
          selectedPlaceId.value =
            initialPlace.id

          placeSearchKeyword.value =
            initialPlace.name
        }
      }
    } catch (error) {
      console.error(error)

      placeLoadError.value =
        error instanceof Error
          ? error.message
          : '관광지 데이터를 불러오지 못했습니다.'
    }
  } catch (error) {
    console.error(error)

    pageError.value =
      error instanceof Error
        ? error.message
        : '게시글 정보를 불러오지 못했습니다.'
  } finally {
    isPageLoading.value = false
  }
})

function selectPlace(place) {
  selectedPlaceId.value = place.id
  placeSearchKeyword.value = place.name
  formError.value = ''
}

function clearSelectedPlace() {
  selectedPlaceId.value = ''
  placeSearchKeyword.value = ''
}

function parseTags(value) {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ]
}

async function submitPost() {
  formError.value = ''

  if (!title.value.trim()) {
    formError.value =
      '제목을 입력해 주세요.'
    return
  }

  if (!content.value.trim()) {
    formError.value =
      '내용을 입력해 주세요.'
    return
  }

  if (
    boardType.value === 'place' &&
    !selectedPlace.value
  ) {
    formError.value =
      '게시글을 등록할 관광지를 선택해 주세요.'
    return
  }

  if (!password.value.trim()) {
    formError.value =
      isEditMode.value
        ? '게시글 작성 시 사용한 비밀번호를 입력해 주세요.'
        : '수정·삭제용 비밀번호를 입력해 주세요.'

    return
  }

  if (
    password.value !==
    passwordConfirm.value
  ) {
    formError.value =
      '비밀번호 확인이 일치하지 않습니다.'
    return
  }

  isSubmitting.value = true

  try {
    const postData = {
      title: title.value,
      content: content.value,

      placeId:
        boardType.value === 'place'
          ? selectedPlace.value.id
          : null,

      tags: parseTags(tagInput.value),
    }

    if (isEditMode.value) {
      await updatePost(
        postId.value,
        postData,
        password.value,
      )

      await router.push({
        name: 'post-detail',
        params: {
          postId: postId.value,
        },
      })

      return
    }

    const newPost = await createPost({
      ...postData,
      password: password.value,
    })

    await router.push({
      name: 'post-detail',
      params: {
        postId: newPost.id,
      },
    })
  } catch (error) {
    console.error(error)

    formError.value =
      error instanceof Error
        ? error.message
        : '게시글을 저장하지 못했습니다.'
  } finally {
    isSubmitting.value = false
  }
}

function cancelWrite() {
  if (isEditMode.value) {
    router.push({
      name: 'post-detail',
      params: {
        postId: postId.value,
      },
    })

    return
  }

  router.push({
    name: 'home',

    query: initialPlaceId
      ? {
          placeId: initialPlaceId,
        }
      : {},
  })
}
</script>

<template>
  <div class="write-page">
    <header class="write-header">
      <div class="header-container">
        <button
          type="button"
          class="logo"
          @click="
            router.push({
              name: 'home',
            })
          "
        >
          Localhub
        </button>
      </div>
    </header>

    <main class="write-container">
      <section
        v-if="isPageLoading"
        class="state-card"
      >
        게시글 정보를 불러오는 중입니다.
      </section>

      <section
        v-else-if="pageError"
        class="state-card error-card"
      >
        <strong>
          페이지를 열 수 없습니다.
        </strong>

        <p>{{ pageError }}</p>

        <button
          type="button"
          @click="
            router.push({
              name: 'home',
            })
          "
        >
          홈으로 이동
        </button>
      </section>

      <section
        v-else
        class="write-card"
      >
        <div class="write-title-area">
          <p class="section-caption">
            COMMUNITY
          </p>

          <h1>{{ pageTitle }}</h1>

          <p>
            {{
              isEditMode
                ? '작성 시 사용한 비밀번호가 일치해야 수정할 수 있습니다.'
                : '종합 게시판 또는 관광지별 게시판에 익명으로 글을 작성합니다.'
            }}
          </p>
        </div>

        <form
          class="post-form"
          @submit.prevent="submitPost"
        >
          <fieldset class="form-section">
            <legend>게시판 선택</legend>

            <div class="board-type-options">
              <label class="radio-option">
                <input
                  v-model="boardType"
                  type="radio"
                  value="general"
                />

                <span>
                  <strong>종합 게시판</strong>
                  <small>
                    전체 지역에 관한 글
                  </small>
                </span>
              </label>

              <label class="radio-option">
                <input
                  v-model="boardType"
                  type="radio"
                  value="place"
                />

                <span>
                  <strong>
                    관광지별 게시판
                  </strong>

                  <small>
                    특정 장소에 관한 글
                  </small>
                </span>
              </label>
            </div>
          </fieldset>

          <section
            v-if="boardType === 'place'"
            class="form-section"
          >
            <label
              for="place-search"
              class="field-label"
            >
              관광지 선택
            </label>

            <div
              v-if="selectedPlace"
              class="selected-place"
            >
              <div>
                <span>
                  {{ selectedPlace.category }}
                </span>

                <strong>
                  {{ selectedPlace.name }}
                </strong>

                <p>
                  {{
                    selectedPlace.address ||
                    '주소 정보 없음'
                  }}
                </p>
              </div>

              <button
                type="button"
                @click="clearSelectedPlace"
              >
                변경
              </button>
            </div>

            <template v-else>
              <input
                id="place-search"
                v-model="placeSearchKeyword"
                type="search"
                class="text-input"
                placeholder="관광지 이름을 검색하세요."
                autocomplete="off"
              />

              <p
                v-if="placeLoadError"
                class="field-error"
              >
                {{ placeLoadError }}
              </p>

              <div
                v-else
                class="place-results"
              >
                <button
                  v-for="place in filteredPlaces"
                  :key="place.id"
                  type="button"
                  class="place-result"
                  @click="selectPlace(place)"
                >
                  <span>
                    {{ place.category }}
                  </span>

                  <strong>
                    {{ place.name }}
                  </strong>

                  <small>
                    {{
                      place.address ||
                      '주소 정보 없음'
                    }}
                  </small>
                </button>
              </div>
            </template>
          </section>

          <section class="form-section">
            <label
              for="post-title"
              class="field-label"
            >
              제목
            </label>

            <input
              id="post-title"
              v-model="title"
              type="text"
              class="text-input"
              maxlength="100"
              placeholder="게시글 제목을 입력하세요."
            />

            <p class="character-count">
              {{ title.length }} / 100
            </p>
          </section>

          <section class="form-section">
            <label
              for="post-content"
              class="field-label"
            >
              내용
            </label>

            <textarea
              id="post-content"
              v-model="content"
              class="content-input"
              rows="14"
              placeholder="게시글 내용을 입력하세요."
            />
          </section>

          <section class="form-section">
            <label
              for="post-tags"
              class="field-label"
            >
              태그
              <span>선택 사항</span>
            </label>

            <input
              id="post-tags"
              v-model="tagInput"
              type="text"
              class="text-input"
              placeholder="예: 맛집, 가족여행, 주차"
            />

            <p class="field-message">
              여러 태그는 쉼표로 구분합니다.
            </p>
          </section>

          <section class="form-section">
            <div class="password-grid">
              <div>
                <label
                  for="post-password"
                  class="field-label"
                >
                  {{
                    isEditMode
                      ? '기존 비밀번호'
                      : '수정·삭제 비밀번호'
                  }}
                </label>

                <input
                  id="post-password"
                  v-model="password"
                  type="password"
                  class="text-input"
                  autocomplete="new-password"
                  placeholder="비밀번호 입력"
                />
              </div>

              <div>
                <label
                  for="post-password-confirm"
                  class="field-label"
                >
                  비밀번호 확인
                </label>

                <input
                  id="post-password-confirm"
                  v-model="passwordConfirm"
                  type="password"
                  class="text-input"
                  autocomplete="new-password"
                  placeholder="비밀번호 다시 입력"
                />
              </div>
            </div>

            <div class="security-notice">
              <strong>
                비밀번호는 복구할 수 없습니다.
              </strong>

              <p>
                비밀번호는 SHA-256 해시로 저장되며,
                수정과 삭제 시에만 사용됩니다.
                브라우저 기반 게시판이므로 민감한
                개인정보는 작성하지 마세요.
              </p>
            </div>
          </section>

          <p
            v-if="formError"
            class="form-error"
            role="alert"
          >
            {{ formError }}
          </p>

          <div class="form-actions">
            <button
              type="button"
              class="cancel-button"
              :disabled="isSubmitting"
              @click="cancelWrite"
            >
              취소
            </button>

            <button
              type="submit"
              class="submit-button"
              :disabled="isSubmitting"
            >
              {{ submitButtonText }}
            </button>
          </div>
        </form>
      </section>
    </main>
  </div>
</template>

<style scoped>
.write-page {
  min-height: 100vh;
  background: #f4f6f5;
  color: #1f2d29;
}

.write-header {
  border-bottom: 1px solid #dce4e1;
  background: #ffffff;
}

.header-container {
  width: min(960px, calc(100% - 48px));
  margin: 0 auto;
  padding: 24px 0;
}

.logo {
  padding: 0;
  border: 0;
  background: transparent;
  color: #176b5b;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -1.5px;
  cursor: pointer;
}

.write-container {
  width: min(960px, calc(100% - 48px));
  margin: 0 auto;
  padding: 40px 0 72px;
}

.write-card,
.state-card {
  padding: 36px;
  border: 1px solid #dce4e1;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 8px 28px rgb(18 67 56 / 7%);
}

.state-card {
  text-align: center;
}

.state-card p {
  color: #73807b;
}

.state-card button {
  margin-top: 10px;
  padding: 11px 18px;
  border: 0;
  border-radius: 8px;
  background: #176b5b;
  color: #ffffff;
  font-weight: 700;
  cursor: pointer;
}

.error-card strong {
  color: #a43e3e;
}

.write-title-area {
  padding-bottom: 28px;
  border-bottom: 1px solid #e7ecea;
}

.section-caption {
  margin: 0;
  color: #176b5b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.6px;
}

.write-title-area h1 {
  margin: 7px 0 8px;
  font-size: 30px;
}

.write-title-area > p:last-child {
  margin: 0;
  color: #72807b;
  font-size: 14px;
}

.post-form {
  display: grid;
  gap: 30px;
  padding-top: 30px;
}

.form-section {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.form-section legend,
.field-label {
  display: block;
  margin-bottom: 10px;
  color: #273631;
  font-size: 14px;
  font-weight: 800;
}

.field-label span {
  margin-left: 5px;
  color: #8b9792;
  font-size: 12px;
  font-weight: 500;
}

.board-type-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px;
  border: 1px solid #d9e2df;
  border-radius: 10px;
  cursor: pointer;
}

.radio-option:has(input:checked) {
  border-color: #176b5b;
  background: #edf6f3;
}

.radio-option input {
  margin-top: 4px;
  accent-color: #176b5b;
}

.radio-option span {
  display: grid;
  gap: 5px;
}

.radio-option small {
  color: #77847f;
}

.text-input,
.content-input {
  width: 100%;
  border: 1px solid #d5dfdc;
  border-radius: 9px;
  outline: none;
  background: #ffffff;
  color: #1f2d29;
}

.text-input {
  height: 48px;
  padding: 0 14px;
}

.content-input {
  min-height: 260px;
  padding: 14px;
  line-height: 1.7;
  resize: vertical;
}

.text-input:focus,
.content-input:focus {
  border-color: #176b5b;
  box-shadow: 0 0 0 3px rgb(23 107 91 / 10%);
}

.character-count {
  margin: 7px 0 0;
  color: #87928e;
  font-size: 12px;
  text-align: right;
}

.field-message,
.field-error {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.field-message {
  color: #7b8783;
}

.field-error {
  color: #ae4141;
}

.place-results {
  max-height: 280px;
  overflow-y: auto;
  margin-top: 10px;
  border: 1px solid #dce4e1;
  border-radius: 9px;
}

.place-result {
  display: grid;
  width: 100%;
  gap: 5px;
  padding: 14px 16px;
  border: 0;
  border-bottom: 1px solid #e8edeb;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
}

.place-result:last-child {
  border-bottom: 0;
}

.place-result:hover {
  background: #f3f8f6;
}

.place-result span {
  color: #176b5b;
  font-size: 11px;
  font-weight: 700;
}

.place-result strong {
  font-size: 14px;
}

.place-result small {
  overflow: hidden;
  color: #7c8884;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-place {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 17px;
  border: 1px solid #bdd5cd;
  border-radius: 10px;
  background: #edf6f3;
}

.selected-place div {
  display: grid;
  gap: 5px;
}

.selected-place span {
  color: #176b5b;
  font-size: 11px;
  font-weight: 700;
}

.selected-place p {
  margin: 0;
  color: #6d7b76;
  font-size: 12px;
}

.selected-place button {
  padding: 8px 12px;
  border: 1px solid #bacbc5;
  border-radius: 7px;
  background: #ffffff;
  color: #46554f;
  cursor: pointer;
}

.password-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.security-notice {
  margin-top: 14px;
  padding: 15px;
  border: 1px solid #e8d6ac;
  border-radius: 9px;
  background: #fff9eb;
}

.security-notice strong {
  color: #705315;
  font-size: 13px;
}

.security-notice p {
  margin: 7px 0 0;
  color: #7d6b42;
  font-size: 12px;
  line-height: 1.6;
}

.form-error {
  margin: 0;
  padding: 13px 15px;
  border: 1px solid #e3baba;
  border-radius: 8px;
  background: #fff2f2;
  color: #a43c3c;
  font-size: 13px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}

.cancel-button,
.submit-button {
  min-width: 120px;
  padding: 13px 20px;
  border-radius: 8px;
  font-weight: 800;
  cursor: pointer;
}

.cancel-button {
  border: 1px solid #ccd7d3;
  background: #ffffff;
  color: #52605b;
}

.submit-button {
  border: 1px solid #176b5b;
  background: #176b5b;
  color: #ffffff;
}

.cancel-button:disabled,
.submit-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (max-width: 640px) {
  .header-container,
  .write-container {
    width: min(100% - 28px, 960px);
  }

  .write-container {
    padding-top: 20px;
  }

  .write-card {
    padding: 22px 18px;
  }

  .board-type-options,
  .password-grid {
    grid-template-columns: 1fr;
  }

  .form-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .cancel-button,
  .submit-button {
    min-width: 0;
  }
}
</style>