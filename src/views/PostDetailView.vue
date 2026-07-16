<script setup>
import {
  computed,
  onMounted,
  ref,
} from 'vue'

import {
  useRoute,
  useRouter,
} from 'vue-router'

import {
  loadAllPlaces,
} from '../services/placeDataService.js'

import {
  createComment,
  deleteComment,
  deletePost,
  getCommentsByPostId,
  getPostById,
  increasePostViews,
} from '../services/localStorageService.js'

const route = useRoute()
const router = useRouter()

const postId = computed(() =>
  typeof route.params.postId === 'string'
    ? route.params.postId
    : '',
)

const post = ref(null)
const linkedPlace = ref(null)
const comments = ref([])

const isLoading = ref(true)
const pageError = ref('')

const commentContent = ref('')
const commentPassword = ref('')
const commentPasswordConfirm = ref('')
const commentError = ref('')
const isCommentSubmitting = ref(false)

const passwordModal = ref({
  isOpen: false,
  targetType: '',
  commentId: '',
  password: '',
  error: '',
  isProcessing: false,
})

const passwordModalTitle = computed(() =>
  passwordModal.value.targetType === 'post'
    ? '게시글 삭제'
    : '댓글 삭제',
)

onMounted(async () => {
  isLoading.value = true
  pageError.value = ''

  try {
    const savedPost =
      getPostById(postId.value)

    if (!savedPost) {
      throw new Error(
        '게시글을 찾을 수 없습니다.',
      )
    }

    post.value =
      increasePostViews(postId.value) ??
      savedPost

    comments.value =
      getCommentsByPostId(postId.value)

    if (post.value.placeId) {
      try {
        const {
          places,
        } = await loadAllPlaces()

        linkedPlace.value =
          places.find(
            (place) =>
              place.id ===
              String(post.value.placeId),
          ) ?? null
      } catch (error) {
        console.error(
          '연결된 관광지 정보 로드 실패:',
          error,
        )
      }
    }
  } catch (error) {
    console.error(error)

    pageError.value =
      error instanceof Error
        ? error.message
        : '게시글을 불러오지 못했습니다.'
  } finally {
    isLoading.value = false
  }
})

function formatDate(dateValue) {
  if (!dateValue) {
    return '-'
  }

  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat(
    'ko-KR',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(date)
}

function goToBoard() {
  router.push({
    name: 'home',

    query: post.value?.placeId
      ? {
          placeId:
            String(post.value.placeId),
        }
      : {},
  })
}

function goToEdit() {
  router.push({
    name: 'post-edit',
    params: {
      postId: postId.value,
    },
  })
}

async function submitComment() {
  commentError.value = ''

  if (!commentContent.value.trim()) {
    commentError.value =
      '댓글 내용을 입력해 주세요.'
    return
  }

  if (!commentPassword.value.trim()) {
    commentError.value =
      '댓글 수정·삭제용 비밀번호를 입력해 주세요.'
    return
  }

  if (
    commentPassword.value !==
    commentPasswordConfirm.value
  ) {
    commentError.value =
      '비밀번호 확인이 일치하지 않습니다.'
    return
  }

  isCommentSubmitting.value = true

  try {
    await createComment({
      postId: postId.value,
      content: commentContent.value,
      password: commentPassword.value,
    })

    comments.value =
      getCommentsByPostId(postId.value)

    commentContent.value = ''
    commentPassword.value = ''
    commentPasswordConfirm.value = ''
  } catch (error) {
    console.error(error)

    commentError.value =
      error instanceof Error
        ? error.message
        : '댓글을 저장하지 못했습니다.'
  } finally {
    isCommentSubmitting.value = false
  }
}

function openPostDeleteModal() {
  passwordModal.value = {
    isOpen: true,
    targetType: 'post',
    commentId: '',
    password: '',
    error: '',
    isProcessing: false,
  }
}

function openCommentDeleteModal(commentId) {
  passwordModal.value = {
    isOpen: true,
    targetType: 'comment',
    commentId,
    password: '',
    error: '',
    isProcessing: false,
  }
}

function closePasswordModal() {
  if (passwordModal.value.isProcessing) {
    return
  }

  passwordModal.value = {
    isOpen: false,
    targetType: '',
    commentId: '',
    password: '',
    error: '',
    isProcessing: false,
  }
}

async function submitDelete() {
  passwordModal.value.error = ''

  if (!passwordModal.value.password.trim()) {
    passwordModal.value.error =
      '비밀번호를 입력해 주세요.'
    return
  }

  passwordModal.value.isProcessing = true

  try {
    if (
      passwordModal.value.targetType ===
      'post'
    ) {
      const returnPlaceId =
        post.value?.placeId
          ? String(post.value.placeId)
          : ''

      await deletePost(
        postId.value,
        passwordModal.value.password,
      )

      await router.push({
        name: 'home',

        query: returnPlaceId
          ? {
              placeId: returnPlaceId,
            }
          : {},
      })

      return
    }

    await deleteComment(
      passwordModal.value.commentId,
      passwordModal.value.password,
    )

    comments.value =
      getCommentsByPostId(postId.value)

    closePasswordModal()
  } catch (error) {
    console.error(error)

    passwordModal.value.error =
      error instanceof Error
        ? error.message
        : '삭제하지 못했습니다.'
  } finally {
    passwordModal.value.isProcessing = false
  }
}
</script>

<template>
  <div class="detail-page">
    <header class="site-header">
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

    <main class="detail-container">
      <section
        v-if="isLoading"
        class="state-card"
      >
        게시글을 불러오는 중입니다.
      </section>

      <section
        v-else-if="pageError"
        class="state-card error-card"
      >
        <strong>
          게시글을 열 수 없습니다.
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

      <template v-else-if="post">
        <article class="post-card">
          <div class="post-header">
            <div class="board-information">
              <span class="section-caption">
                COMMUNITY
              </span>

              <button
                type="button"
                class="board-link"
                @click="goToBoard"
              >
                {{
                  linkedPlace
                    ? `${linkedPlace.name} 게시판`
                    : '종합 게시판'
                }}
              </button>
            </div>

            <h1>{{ post.title }}</h1>

            <div class="post-meta">
              <span>
                작성자 {{ post.author || '익명' }}
              </span>

              <span>
                작성일
                {{ formatDate(post.createdAt) }}
              </span>

              <span
                v-if="
                  post.updatedAt &&
                  post.updatedAt !==
                    post.createdAt
                "
              >
                수정일
                {{ formatDate(post.updatedAt) }}
              </span>

              <span>
                조회 {{ post.views || 0 }}
              </span>
            </div>
          </div>

          <section
            v-if="linkedPlace"
            class="linked-place-card"
          >
            <div>
              <span>
                {{ linkedPlace.category }}
              </span>

              <strong>
                {{ linkedPlace.name }}
              </strong>

              <p>
                {{
                  linkedPlace.address ||
                  '주소 정보 없음'
                }}
              </p>
            </div>

            <button
              type="button"
              @click="goToBoard"
            >
              장소 게시판 보기
            </button>
          </section>

          <div
            v-if="
              Array.isArray(post.tags) &&
              post.tags.length
            "
            class="tag-list"
          >
            <span
              v-for="tag in post.tags"
              :key="tag"
            >
              #{{ tag }}
            </span>
          </div>

          <div class="post-content">
            {{ post.content }}
          </div>

          <div class="post-actions">
            <button
              type="button"
              class="list-button"
              @click="goToBoard"
            >
              목록
            </button>

            <div>
              <button
                type="button"
                class="edit-button"
                @click="goToEdit"
              >
                수정
              </button>

              <button
                type="button"
                class="delete-button"
                @click="openPostDeleteModal"
              >
                삭제
              </button>
            </div>
          </div>
        </article>

        <section class="comment-card">
          <div class="comment-header">
            <div>
              <span class="section-caption">
                COMMENT
              </span>

              <h2>
                댓글
                <span>
                  {{ comments.length }}
                </span>
              </h2>
            </div>
          </div>

          <div
            v-if="comments.length"
            class="comment-list"
          >
            <article
              v-for="comment in comments"
              :key="comment.id"
              class="comment-item"
            >
              <div class="comment-meta">
                <strong>
                  {{ comment.author || '익명' }}
                </strong>

                <span>
                  {{ formatDate(comment.createdAt) }}
                </span>
              </div>

              <p>{{ comment.content }}</p>

              <button
                type="button"
                class="comment-delete-button"
                @click="
                  openCommentDeleteModal(
                    comment.id,
                  )
                "
              >
                삭제
              </button>
            </article>
          </div>

          <div
            v-else
            class="empty-comments"
          >
            등록된 댓글이 없습니다.
          </div>

          <form
            class="comment-form"
            @submit.prevent="submitComment"
          >
            <label
              for="comment-content"
              class="field-label"
            >
              댓글 작성
            </label>

            <textarea
              id="comment-content"
              v-model="commentContent"
              rows="4"
              class="comment-textarea"
              placeholder="댓글 내용을 입력하세요."
            />

            <div class="comment-password-grid">
              <div>
                <label
                  for="comment-password"
                  class="field-label"
                >
                  수정·삭제 비밀번호
                </label>

                <input
                  id="comment-password"
                  v-model="commentPassword"
                  type="password"
                  class="password-input"
                  autocomplete="new-password"
                  placeholder="비밀번호 입력"
                />
              </div>

              <div>
                <label
                  for="comment-password-confirm"
                  class="field-label"
                >
                  비밀번호 확인
                </label>

                <input
                  id="comment-password-confirm"
                  v-model="commentPasswordConfirm"
                  type="password"
                  class="password-input"
                  autocomplete="new-password"
                  placeholder="비밀번호 다시 입력"
                />
              </div>
            </div>

            <p
              v-if="commentError"
              class="comment-error"
              role="alert"
            >
              {{ commentError }}
            </p>

            <div class="comment-submit-area">
              <p>
                비밀번호 분실 시 댓글을 삭제할 수 없습니다.
              </p>

              <button
                type="submit"
                :disabled="isCommentSubmitting"
              >
                {{
                  isCommentSubmitting
                    ? '등록 중...'
                    : '댓글 등록'
                }}
              </button>
            </div>
          </form>
        </section>
      </template>
    </main>

    <div
      v-if="passwordModal.isOpen"
      class="modal-backdrop"
      @click.self="closePasswordModal"
    >
      <section
        class="password-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="passwordModalTitle"
      >
        <h2>{{ passwordModalTitle }}</h2>

        <p>
          작성 시 사용한 비밀번호를 입력해 주세요.
          삭제한 데이터는 복구할 수 없습니다.
        </p>

        <label
          for="delete-password"
          class="field-label"
        >
          비밀번호
        </label>

        <input
          id="delete-password"
          v-model="passwordModal.password"
          type="password"
          class="password-input"
          autocomplete="current-password"
          placeholder="비밀번호 입력"
          @keyup.enter="submitDelete"
        />

        <p
          v-if="passwordModal.error"
          class="modal-error"
          role="alert"
        >
          {{ passwordModal.error }}
        </p>

        <div class="modal-actions">
          <button
            type="button"
            class="modal-cancel-button"
            :disabled="
              passwordModal.isProcessing
            "
            @click="closePasswordModal"
          >
            취소
          </button>

          <button
            type="button"
            class="modal-delete-button"
            :disabled="
              passwordModal.isProcessing
            "
            @click="submitDelete"
          >
            {{
              passwordModal.isProcessing
                ? '확인 중...'
                : '삭제'
            }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  min-height: 100vh;
  background: #f4f6f5;
  color: #1f2d29;
}

.site-header {
  border-bottom: 1px solid #dce4e1;
  background: #ffffff;
}

.header-container {
  width: min(1000px, calc(100% - 48px));
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

.detail-container {
  display: grid;
  width: min(1000px, calc(100% - 48px));
  gap: 24px;
  margin: 0 auto;
  padding: 40px 0 72px;
}

.post-card,
.comment-card,
.state-card {
  border: 1px solid #dce4e1;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 8px 28px rgb(18 67 56 / 7%);
}

.state-card {
  padding: 50px;
  text-align: center;
}

.state-card p {
  color: #73807b;
}

.state-card button {
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

.post-card {
  padding: 34px;
}

.post-header {
  padding-bottom: 26px;
  border-bottom: 1px solid #e5ebe8;
}

.board-information {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.section-caption {
  color: #176b5b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.6px;
}

.board-link {
  padding: 7px 11px;
  border: 1px solid #ccd9d4;
  border-radius: 7px;
  background: #ffffff;
  color: #176b5b;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.post-header h1 {
  margin: 18px 0 14px;
  color: #1f2d29;
  font-size: 30px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  color: #74817c;
  font-size: 12px;
}

.linked-place-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 24px;
  padding: 18px;
  border: 1px solid #c8dcd5;
  border-radius: 10px;
  background: #edf6f3;
}

.linked-place-card div {
  display: grid;
  gap: 5px;
}

.linked-place-card span {
  color: #176b5b;
  font-size: 11px;
  font-weight: 700;
}

.linked-place-card p {
  margin: 0;
  color: #6e7b76;
  font-size: 12px;
}

.linked-place-card button {
  flex: 0 0 auto;
  padding: 9px 13px;
  border: 1px solid #176b5b;
  border-radius: 7px;
  background: #ffffff;
  color: #176b5b;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 24px;
}

.tag-list span {
  padding: 6px 9px;
  border-radius: 999px;
  background: #edf5f2;
  color: #176b5b;
  font-size: 12px;
}

.post-content {
  min-height: 260px;
  padding: 34px 4px;
  color: #313f3a;
  font-size: 15px;
  line-height: 1.9;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.post-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-top: 20px;
  border-top: 1px solid #e5ebe8;
}

.post-actions > div {
  display: flex;
  gap: 8px;
}

.list-button,
.edit-button,
.delete-button {
  padding: 10px 16px;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
}

.list-button,
.edit-button {
  border: 1px solid #ccd8d4;
  background: #ffffff;
  color: #52615c;
}

.delete-button {
  border: 1px solid #bd4747;
  background: #bd4747;
  color: #ffffff;
}

.comment-card {
  padding: 30px 34px;
}

.comment-header {
  padding-bottom: 18px;
  border-bottom: 1px solid #e5ebe8;
}

.comment-header h2 {
  margin: 6px 0 0;
  font-size: 22px;
}

.comment-header h2 span {
  color: #176b5b;
}

.comment-list {
  border-bottom: 1px solid #e5ebe8;
}

.comment-item {
  position: relative;
  padding: 22px 90px 22px 2px;
  border-bottom: 1px solid #edf1ef;
}

.comment-item:last-child {
  border-bottom: 0;
}

.comment-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.comment-meta strong {
  font-size: 13px;
}

.comment-meta span {
  color: #89948f;
  font-size: 11px;
}

.comment-item > p {
  margin: 11px 0 0;
  color: #3c4944;
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.comment-delete-button {
  position: absolute;
  top: 20px;
  right: 0;
  padding: 6px 10px;
  border: 1px solid #d5ddda;
  border-radius: 6px;
  background: #ffffff;
  color: #727f7a;
  font-size: 11px;
  cursor: pointer;
}

.empty-comments {
  padding: 40px 0;
  border-bottom: 1px solid #e5ebe8;
  color: #84908c;
  font-size: 13px;
  text-align: center;
}

.comment-form {
  padding-top: 26px;
}

.field-label {
  display: block;
  margin-bottom: 9px;
  color: #2e3c37;
  font-size: 13px;
  font-weight: 800;
}

.comment-textarea,
.password-input {
  width: 100%;
  border: 1px solid #d5dfdc;
  border-radius: 8px;
  outline: none;
  background: #ffffff;
  color: #1f2d29;
}

.comment-textarea {
  padding: 13px;
  line-height: 1.7;
  resize: vertical;
}

.password-input {
  height: 44px;
  padding: 0 12px;
}

.comment-textarea:focus,
.password-input:focus {
  border-color: #176b5b;
  box-shadow: 0 0 0 3px rgb(23 107 91 / 10%);
}

.comment-password-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}

.comment-error,
.modal-error {
  margin: 13px 0 0;
  padding: 11px 13px;
  border: 1px solid #e3baba;
  border-radius: 7px;
  background: #fff2f2;
  color: #a43c3c;
  font-size: 12px;
}

.comment-submit-area {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 16px;
}

.comment-submit-area p {
  margin: 0;
  color: #84908c;
  font-size: 11px;
}

.comment-submit-area button {
  min-width: 110px;
  padding: 11px 16px;
  border: 0;
  border-radius: 8px;
  background: #176b5b;
  color: #ffffff;
  font-weight: 700;
  cursor: pointer;
}

.comment-submit-area button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.modal-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgb(10 26 22 / 55%);
}

.password-modal {
  width: min(430px, 100%);
  padding: 26px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 20px 60px rgb(0 0 0 / 20%);
}

.password-modal h2 {
  margin: 0;
  font-size: 22px;
}

.password-modal > p {
  margin: 10px 0 22px;
  color: #73807b;
  font-size: 13px;
  line-height: 1.6;
}

.modal-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-top: 20px;
}

.modal-cancel-button,
.modal-delete-button {
  padding: 11px 16px;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
}

.modal-cancel-button {
  border: 1px solid #ccd7d3;
  background: #ffffff;
  color: #53615c;
}

.modal-delete-button {
  border: 1px solid #bd4747;
  background: #bd4747;
  color: #ffffff;
}

.modal-cancel-button:disabled,
.modal-delete-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (max-width: 640px) {
  .header-container,
  .detail-container {
    width: min(100% - 28px, 1000px);
  }

  .detail-container {
    padding-top: 20px;
  }

  .post-card,
  .comment-card {
    padding: 22px 18px;
  }

  .post-header h1 {
    font-size: 24px;
  }

  .board-information,
  .linked-place-card,
  .post-actions,
  .comment-submit-area {
    align-items: stretch;
    flex-direction: column;
  }

  .linked-place-card button {
    width: 100%;
  }

  .post-actions > div {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .list-button {
    width: 100%;
  }

  .comment-password-grid {
    grid-template-columns: 1fr;
  }

  .comment-submit-area button {
    width: 100%;
  }
}
</style>