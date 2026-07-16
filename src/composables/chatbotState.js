import { ref } from 'vue'

export const isChatbotOpen = ref(false)

export function openChatbot() {
  isChatbotOpen.value = true
}

export function closeChatbot() {
  isChatbotOpen.value = false
}

export function toggleChatbot() {
  isChatbotOpen.value = !isChatbotOpen.value
}
