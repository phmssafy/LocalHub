<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'

import { useRoute } from 'vue-router'

import {
  closeChatbot,
  isChatbotOpen,
  openChatbot,
} from '../composables/chatbotState.js'

import {
  sendChatMessage,
} from '../services/chatService.js'

const route = useRoute()

const messageListElement = ref(null)
const userInput = ref('')
const isSending = ref(false)

let nextMessageId = 2

const messages = ref([
  {
    id: 1,
    role: 'assistant',
    content:
      '안녕하세요. 광주·전라권의 관광지, 음식점, 숙박, 축제 정보를 질문해 주세요.',
    isCollapsible: false,
    expanded: true,
  },
])

const showFloatingLauncher = computed(
  () => route.name !== 'home',
)

function splitNumberedItems(text) {
  return String(text ?? '')
    .split(/(?=\d+[.)]\s*)/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function isListResponse(text) {
  return splitNumberedItems(text).length > 3
}

function getCollapsedContent(text) {
  const items = splitNumberedItems(text)

  if (items.length <= 3) {
    return text
  }

  return `${items.slice(0, 3).join('\n\n')}\n\n... 더보기를 눌러 전체 목록을 확인하세요.`
}

function toggleExpand(message) {
  message.expanded = !message.expanded
}

async function scrollToBottom() {
  await nextTick()

  if (!messageListElement.value) {
    return
  }

  messageListElement.value.scrollTop =
    messageListElement.value.scrollHeight
}

async function sendMessage() {
  const normalizedInput = userInput.value.trim()

  if (!normalizedInput || isSending.value) {
    return
  }

  messages.value.push({
    id: nextMessageId++,
    role: 'user',
    content: normalizedInput,
    isCollapsible: false,
    expanded: true,
  })

  userInput.value = ''
  isSending.value = true

  await scrollToBottom()

  try {
    const answer = await sendChatMessage(normalizedInput)
    const collapsible = isListResponse(answer)

    messages.value.push({
      id: nextMessageId++,
      role: 'assistant',
      content: answer,
      isCollapsible: collapsible,
      expanded: !collapsible,
    })
  } catch (error) {
    messages.value.push({
      id: nextMessageId++,
      role: 'assistant',
      content:
        error instanceof Error
          ? error.message
          : 'AI 서버 연결 중 오류가 발생했습니다.',
      isCollapsible: false,
      expanded: true,
      isError: true,
    })
  } finally {
    isSending.value = false
    await scrollToBottom()
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape' && isChatbotOpen.value) {
    closeChatbot()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <button
    v-if="showFloatingLauncher && !isChatbotOpen"
    type="button"
    class="floating-launcher"
    @click="openChatbot"
  >
    AI 챗봇
  </button>

  <Teleport to="body">
    <div
      v-if="isChatbotOpen"
      class="chat-backdrop"
      @click.self="closeChatbot"
    >
      <section
        class="chat-panel"
        role="dialog"
        aria-modal="true"
        aria-label="광주·전라 관광 AI 챗봇"
      >
        <header class="chat-header">
          <div>
            <span>LOCALHUB AI</span>
            <h2>광주·전라 관광 챗봇</h2>
          </div>

          <button
            type="button"
            class="close-button"
            aria-label="챗봇 닫기"
            @click="closeChatbot"
          >
            닫기
          </button>
        </header>

        <div
          ref="messageListElement"
          class="message-list"
          aria-live="polite"
        >
          <article
            v-for="message in messages"
            :key="message.id"
            class="message-row"
            :class="message.role"
          >
            <div
              class="message-bubble"
              :class="{ error: message.isError }"
            >
              <strong>
                {{ message.role === 'assistant' ? 'AI' : '나' }}
              </strong>

              <p v-if="!message.isCollapsible || message.expanded">
                {{ message.content }}
              </p>

              <p v-else>
                {{ getCollapsedContent(message.content) }}
              </p>

              <button
                v-if="message.isCollapsible"
                type="button"
                class="expand-button"
                @click="toggleExpand(message)"
              >
                {{ message.expanded ? '간략히 보기' : '더보기' }}
              </button>
            </div>
          </article>

          <article
            v-if="isSending"
            class="message-row assistant"
          >
            <div class="message-bubble loading-bubble">
              <strong>AI</strong>
              <p>답변을 생성하고 있습니다.</p>
            </div>
          </article>
        </div>

        <form
          class="chat-input-form"
          @submit.prevent="sendMessage"
        >
          <label
            for="chatbot-input"
            class="screen-reader-only"
          >
            챗봇 질문
          </label>

          <textarea
            id="chatbot-input"
            v-model="userInput"
            rows="2"
            maxlength="500"
            placeholder="질문을 입력하세요. Enter로 전송하고 Shift+Enter로 줄을 바꿉니다."
            :disabled="isSending"
            @keydown.enter.exact.prevent="sendMessage"
          ></textarea>

          <button
            type="submit"
            :disabled="isSending || !userInput.trim()"
          >
            전송
          </button>
        </form>

        <p class="chat-notice">
          AI 답변은 제공된 관광 데이터에 기반하며 부정확할 수 있습니다.
        </p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.floating-launcher {
  position: fixed;
  z-index: 900;
  right: 24px;
  bottom: 24px;
  padding: 13px 18px;
  border: 0;
  border-radius: 999px;
  background: #176b5b;
  box-shadow: 0 8px 24px rgb(18 67 56 / 25%);
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.chat-backdrop {
  position: fixed;
  z-index: 1100;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 24px;
  background: rgb(8 28 23 / 38%);
}

.chat-panel {
  display: grid;
  width: min(440px, calc(100vw - 32px));
  height: min(720px, calc(100vh - 48px));
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  overflow: hidden;
  border: 1px solid #cfdbd7;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 22px 70px rgb(0 0 0 / 25%);
  color: #1f2d29;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px;
  border-bottom: 1px solid #dfe7e4;
  background: #173a34;
  color: #ffffff;
}

.chat-header span {
  color: #a8c8be;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.5px;
}

.chat-header h2 {
  margin: 4px 0 0;
  color: #ffffff;
  font-size: 20px;
}

.close-button {
  padding: 8px 11px;
  border: 1px solid rgb(255 255 255 / 30%);
  border-radius: 7px;
  background: transparent;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.message-list {
  overflow-y: auto;
  padding: 20px;
  background: #f4f7f6;
}

.message-row {
  display: flex;
  margin-bottom: 14px;
}

.message-row.user {
  justify-content: flex-end;
}

.message-bubble {
  max-width: 86%;
  padding: 12px 14px;
  border: 1px solid #dce5e2;
  border-radius: 12px 12px 12px 3px;
  background: #ffffff;
  box-shadow: 0 3px 10px rgb(18 67 56 / 5%);
}

.message-row.user .message-bubble {
  border-color: #176b5b;
  border-radius: 12px 12px 3px 12px;
  background: #176b5b;
  color: #ffffff;
}

.message-bubble.error {
  border-color: #dfb7b7;
  background: #fff2f2;
  color: #963d3d;
}

.message-bubble strong {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
}

.message-bubble p {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.loading-bubble p {
  color: #687570;
}

.expand-button {
  margin-top: 9px;
  padding: 6px 9px;
  border: 1px solid #bfd1cb;
  border-radius: 6px;
  background: #ffffff;
  color: #176b5b;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.chat-input-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 9px;
  padding: 14px 16px;
  border-top: 1px solid #dfe7e4;
  background: #ffffff;
}

.chat-input-form textarea {
  width: 100%;
  min-height: 48px;
  max-height: 130px;
  padding: 11px 12px;
  border: 1px solid #cedad6;
  border-radius: 9px;
  outline: none;
  color: #1f2d29;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}

.chat-input-form textarea:focus {
  border-color: #176b5b;
  box-shadow: 0 0 0 3px rgb(23 107 91 / 10%);
}

.chat-input-form button {
  align-self: stretch;
  min-width: 68px;
  padding: 0 14px;
  border: 0;
  border-radius: 9px;
  background: #176b5b;
  color: #ffffff;
  font-weight: 800;
  cursor: pointer;
}

.chat-input-form button:disabled,
.chat-input-form textarea:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.chat-notice {
  margin: 0;
  padding: 0 16px 13px;
  background: #ffffff;
  color: #7b8783;
  font-size: 10px;
  line-height: 1.5;
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

@media (max-width: 640px) {
  .floating-launcher {
    right: 14px;
    bottom: 14px;
  }

  .chat-backdrop {
    align-items: stretch;
    padding: 0;
  }

  .chat-panel {
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 0;
  }

  .message-bubble {
    max-width: 92%;
  }
}
</style>
