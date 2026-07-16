const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const OpenAI = require('openai')

dotenv.config({
  path: path.resolve(__dirname, '..', '..', '.env'),
})

const useMockResponse =
  process.env.USE_MOCK_RESPONSE === 'true'

const model =
  process.env.OPENAI_MODEL || 'gpt-5-mini'

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null

const dataSearchRoots = [
  path.resolve(
    process.cwd(),
    'public',
    'data',
    '광주_전라권',
  ),
  path.resolve(
    __dirname,
    '..',
    '..',
    'public',
    'data',
    '광주_전라권',
  ),
  path.join(__dirname, 'data'),
  path.resolve(
    process.cwd(),
    'netlify',
    'functions',
    'data',
  ),
]

function getErrorMessage(error) {
  return (
    error?.error?.message ||
    error?.message ||
    '알 수 없는 오류'
  )
}

function isModelPermissionError(error) {
  const message = getErrorMessage(error).toLowerCase()

  return (
    error?.status === 403 ||
    error?.code === 'model_not_found' ||
    error?.code === 'permission_denied' ||
    message.includes('does not have access to model') ||
    (message.includes('model') &&
      message.includes('not found'))
  )
}

function stripBom(text) {
  return String(text ?? '').replace(/^\uFEFF/, '')
}

function findJsonFiles() {
  const files = []
  const seen = new Set()

  for (const directory of dataSearchRoots) {
    if (!fs.existsSync(directory)) {
      continue
    }

    const entries = fs.readdirSync(directory, {
      withFileTypes: true,
    })

    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !entry.name.toLowerCase().endsWith('.json')
      ) {
        continue
      }

      const fullPath = path.join(
        directory,
        entry.name,
      )

      if (!seen.has(entry.name)) {
        seen.add(entry.name)
        files.push(fullPath)
      }
    }
  }

  return files
}

function normalizeData(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (item) => item && typeof item === 'object',
    )
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray(parsed.items)
  ) {
    return parsed.items.filter(
      (item) => item && typeof item === 'object',
    )
  }

  return []
}

function loadDataFromFiles(files) {
  const allData = []

  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const text = stripBom(raw).trim()

      if (!text) {
        continue
      }

      const parsed = JSON.parse(text)
      const items = normalizeData(parsed)

      console.log(
        `[data] ${path.basename(filePath)} -> ${items.length} items`,
      )

      allData.push(...items)
    } catch (error) {
      console.error(
        `[data] parse failed: ${filePath}`,
        error,
      )
    }
  }

  return allData
}

function selectFilesByKeyword(message, files) {
  const lowerMessage = String(message ?? '').toLowerCase()

  const rules = [
    {
      pattern: /(맛집|식당|음식|먹거리|밥|카페)/,
      tokens: ['음식점'],
    },
    {
      pattern: /(축제|공연|행사|festival)/,
      tokens: ['축제공연행사'],
    },
    {
      pattern: /(숙박|호텔|게스트하우스|펜션)/,
      tokens: ['숙박'],
    },
    {
      pattern: /(쇼핑|시장|마트|상권)/,
      tokens: ['쇼핑'],
    },
    {
      pattern: /(레포츠|액티비티|스포츠|체험)/,
      tokens: ['레포츠'],
    },
    {
      pattern: /(문화|전시|박물관|미술관|공연장)/,
      tokens: ['문화시설'],
    },
    {
      pattern: /(여행코스|코스|동선)/,
      tokens: ['여행코스'],
    },
    {
      pattern: /(관광|명소|볼거리|가볼만한)/,
      tokens: ['관광지', '여행코스'],
    },
  ]

  for (const rule of rules) {
    if (!rule.pattern.test(lowerMessage)) {
      continue
    }

    const matchedFiles = files.filter((file) => {
      const fileName = path
        .basename(file)
        .toLowerCase()

      return rule.tokens.some((token) =>
        fileName.includes(token.toLowerCase()),
      )
    })

    if (matchedFiles.length > 0) {
      return matchedFiles
    }
  }

  return files
}

function extractSearchTerms(message) {
  const stopWords = new Set([
    '추천',
    '추천해줘',
    '알려줘',
    '어디',
    '어떤',
    '있어',
    '있나요',
    '장소',
    '곳',
    '광주',
    '전라',
    '전라권',
  ])

  return String(message ?? '')
    .toLowerCase()
    .split(/[\s,?.!]+/)
    .map((term) => term.trim())
    .filter(
      (term) =>
        term.length >= 2 &&
        !stopWords.has(term),
    )
}

function scoreItem(item, terms) {
  const title = String(item.title ?? '').toLowerCase()
  const address = [item.addr1, item.addr2]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const description = [
    item.overview,
    item.description,
    item.tel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  let score = 0

  for (const term of terms) {
    if (title.includes(term)) score += 5
    if (address.includes(term)) score += 3
    if (description.includes(term)) score += 1
  }

  return score
}

function searchData(message, data) {
  const terms = extractSearchTerms(message)

  if (terms.length === 0) {
    return data.slice(0, 20)
  }

  const scoredItems = data
    .map((item) => ({
      item,
      score: scoreItem(item, terms),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (first, second) =>
        second.score - first.score,
    )
    .slice(0, 20)
    .map(({ item }) => item)

  return scoredItems.length > 0
    ? scoredItems
    : data.slice(0, 20)
}

function buildMockResponse(message, data) {
  const sample = data[0]

  if (sample?.title) {
    return `[모의 응답] "${message}" 질문에는 ${sample.title}을(를) 참고할 수 있습니다. 주소: ${sample.addr1 || '정보 없음'}`
  }

  return `[모의 응답] "${message}"에 대한 테스트 답변입니다.`
}

async function createAnswer(message, searchResult) {
  if (!client) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `
너는 광주·전라권 관광 전문 AI 챗봇이다.

반드시 제공된 지역 데이터만 활용해서 답변한다.
데이터에 없는 내용은 사실처럼 추측하지 않는다.
추천할 때는 장소명과 주소를 함께 제시한다.
질문과 관련된 항목이 부족하면 데이터상 확인 가능한 범위를 명확히 말한다.

[지역 데이터]
${JSON.stringify(searchResult)}
`,
      },
      {
        role: 'user',
        content: message,
      },
    ],
  })

  return (
    response.choices?.[0]?.message?.content ||
    '응답을 생성하지 못했습니다.'
  )
}

async function handler(event) {
  try {
    if (
      event.httpMethod === 'GET' &&
      event.queryStringParameters?.mode === 'health'
    ) {
      const jsonFiles = findJsonFiles()

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          ok: true,
          useMockResponse,
          model,
          dataFileCount: jsonFiles.length,
          dataFiles: jsonFiles.map((file) =>
            path.basename(file),
          ),
        }),
      }
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({
          message: 'Method Not Allowed',
        }),
      }
    }

    let payload = {}

    try {
      payload = event.body
        ? JSON.parse(event.body)
        : {}
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({
          answer: '요청 형식이 올바르지 않습니다.',
        }),
      }
    }

    const message = String(
      payload.message ?? '',
    ).trim()

    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          answer: '질문 내용을 입력해 주세요.',
        }),
      }
    }

    if (
      !process.env.OPENAI_API_KEY &&
      !useMockResponse
    ) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          answer:
            'OpenAI API 키가 설정되지 않았습니다.',
        }),
      }
    }

    const jsonFiles = findJsonFiles()

    if (jsonFiles.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          answer:
            '사용 가능한 관광 데이터 파일이 없습니다.',
        }),
      }
    }

    const selectedFiles = selectFilesByKeyword(
      message,
      jsonFiles,
    )

    const allData = loadDataFromFiles(
      selectedFiles,
    )

    if (allData.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          answer:
            '선택된 관광 데이터에서 읽을 수 있는 항목이 없습니다.',
        }),
      }
    }

    const searchResult = searchData(
      message,
      allData,
    )

    const answer = useMockResponse
      ? buildMockResponse(
          message,
          searchResult,
        )
      : await createAnswer(
          message,
          searchResult,
        )

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ answer }),
    }
  } catch (error) {
    console.error('Chat function error:', error)

    const answer = isModelPermissionError(error)
      ? `OpenAI 모델 권한 문제가 발생했습니다. OPENAI_MODEL 환경변수와 API 프로젝트의 모델 접근 권한을 확인해 주세요. (${getErrorMessage(error)})`
      : `AI 서버 연결 중 오류가 발생했습니다. (${getErrorMessage(error)})`

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ answer }),
    }
  }
}

module.exports = { handler }
