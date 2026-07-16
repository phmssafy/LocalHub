const CHAT_ENDPOINT = '/.netlify/functions/chat'
const REQUEST_TIMEOUT_MS = 45000

export async function sendChatMessage(message) {
  const normalizedMessage = String(message ?? '').trim()

  if (!normalizedMessage) {
    throw new Error('질문 내용을 입력해 주세요.')
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  )

  try {
    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: normalizedMessage,
      }),
      signal: controller.signal,
    })

    const responseText = await response.text()
    let responseData = {}

    try {
      responseData = responseText
        ? JSON.parse(responseText)
        : {}
    } catch {
      throw new Error(
        'AI 서버가 올바르지 않은 응답을 반환했습니다.',
      )
    }

    if (!response.ok) {
      throw new Error(
        responseData.answer ||
          responseData.message ||
          `AI 서버 요청에 실패했습니다. (HTTP ${response.status})`,
      )
    }

    const answer = String(responseData.answer ?? '').trim()

    if (!answer) {
      throw new Error('AI 응답 내용이 비어 있습니다.')
    }

    return answer
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(
        'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
      )
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}
