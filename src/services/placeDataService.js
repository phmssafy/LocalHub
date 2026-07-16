const DATA_BASE_PATH = '/data/광주_전라권'

/*
 * 실제 public 폴더에 있는 JSON 파일명과 정확히 일치해야 합니다.
 */
const CATEGORY_FILES = [
  {
    category: '관광지',
    fileName: '광주_전라권_관광지.json',
  },
  {
    category: '레포츠',
    fileName: '광주_전라권_레포츠.json',
  },
  {
    category: '문화시설',
    fileName: '광주_전라권_문화시설.json',
  },
  {
    category: '쇼핑',
    fileName: '광주_전라권_쇼핑.json',
  },
  {
    category: '숙박',
    fileName: '광주_전라권_숙박.json',
  },
  {
    category: '여행코스',
    fileName: '광주_전라권_여행코스.json',
  },
  {
    category: '음식점',
    fileName: '광주_전라권_음식점.json',
  },
  {
    category: '축제공연행사',
    fileName: '광주_전라권_축제공연행사.json',
  },
]

/*
 * null, undefined, 숫자 등이 들어와도 안전하게 문자열로 정리합니다.
 */
function cleanText(value) {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim()
}

/*
 * JSON의 mapx, mapy는 문자열이므로 숫자로 변환합니다.
 */
function parseCoordinate(value) {
  const coordinate = Number.parseFloat(value)

  if (!Number.isFinite(coordinate)) {
    return null
  }

  return coordinate
}

/*
 * Netlify는 HTTPS 환경이므로 HTTP 이미지 주소를 HTTPS로 변환합니다.
 */
function normalizeImageUrl(value) {
  const imageUrl = cleanText(value)

  if (!imageUrl) {
    return ''
  }

  return imageUrl.replace(/^http:\/\//i, 'https://')
}

/*
 * 주소 1과 주소 2를 하나의 문자열로 합칩니다.
 */
function createFullAddress(addr1, addr2) {
  return [cleanText(addr1), cleanText(addr2)]
    .filter(Boolean)
    .join(' ')
}

/*
 * 원본 TourAPI 데이터를 화면에서 사용하기 편한 형태로 변환합니다.
 */
function normalizePlace(item, categoryInfo, jsonData) {
  const contentId = cleanText(item.contentid)
  const image = normalizeImageUrl(item.firstimage)
  const secondaryImage = normalizeImageUrl(item.firstimage2)

  return {
    /*
     * 게시판과 관광지를 연결할 때 contentid를 사용합니다.
     */
    id: contentId,
    contentId,

    name: cleanText(item.title) || '이름 없음',

    /*
     * 상단 카테고리 탭과 정확히 일치하도록
     * 파일 설정에 지정한 category를 사용합니다.
     */
    category: categoryInfo.category,

    /*
     * JSON 안에 들어 있던 원본 contentType도 별도로 보관합니다.
     */
    sourceContentType: cleanText(jsonData.contentType),

    region: cleanText(jsonData.region) || '광주_전라권',

    address: createFullAddress(item.addr1, item.addr2),
    addr1: cleanText(item.addr1),
    addr2: cleanText(item.addr2),

    image,
    thumbnail: secondaryImage || image,

    longitude: parseCoordinate(item.mapx),
    latitude: parseCoordinate(item.mapy),
    mapLevel: cleanText(item.mlevel),

    telephone: cleanText(item.tel),
    zipCode: cleanText(item.zipcode),

    areaCode: cleanText(item.areacode),
    sigunguCode: cleanText(item.sigungucode),

    contentTypeId: cleanText(
      item.contenttypeid || jsonData.contentTypeId,
    ),

    categoryCode1: cleanText(item.cat1),
    categoryCode2: cleanText(item.cat2),
    categoryCode3: cleanText(item.cat3),

    largeClassCode1: cleanText(item.lclsSystm1),
    largeClassCode2: cleanText(item.lclsSystm2),
    largeClassCode3: cleanText(item.lclsSystm3),

    createdTime: cleanText(item.createdtime),
    modifiedTime: cleanText(item.modifiedtime),

    copyrightType: cleanText(item.cpyrhtDivCd),
  }
}

/*
 * 카테고리 JSON 파일 하나를 불러옵니다.
 */
async function loadCategoryFile(categoryInfo) {
  const filePath = encodeURI(
    `${DATA_BASE_PATH}/${categoryInfo.fileName}`,
  )

  const response = await fetch(filePath)

  if (!response.ok) {
    throw new Error(
      `${categoryInfo.fileName} 로드 실패: HTTP ${response.status}`,
    )
  }

  let jsonData

  try {
    jsonData = await response.json()
  } catch {
    throw new Error(
      `${categoryInfo.fileName}의 JSON 형식이 올바르지 않습니다.`,
    )
  }

  if (!Array.isArray(jsonData.items)) {
    throw new Error(
      `${categoryInfo.fileName}의 items가 배열 형식이 아닙니다.`,
    )
  }

  return jsonData.items
    .filter((item) => item && typeof item === 'object')
    .map((item) =>
      normalizePlace(item, categoryInfo, jsonData),
    )
    .filter((place) => place.id)
}

/*
 * 8개 카테고리 파일을 모두 불러옵니다.
 *
 * 한 파일이 실패하더라도 나머지 파일은 계속 사용할 수 있도록
 * Promise.allSettled를 사용합니다.
 */
export async function loadAllPlaces() {
  const results = await Promise.allSettled(
    CATEGORY_FILES.map((categoryInfo) =>
      loadCategoryFile(categoryInfo),
    ),
  )

  const loadedPlaces = []
  const failedFiles = []

  results.forEach((result, index) => {
    const categoryInfo = CATEGORY_FILES[index]

    if (result.status === 'fulfilled') {
      loadedPlaces.push(...result.value)
      return
    }

    failedFiles.push({
      category: categoryInfo.category,
      fileName: categoryInfo.fileName,
      message:
        result.reason instanceof Error
          ? result.reason.message
          : '알 수 없는 오류가 발생했습니다.',
    })
  })

  /*
   * contentid 기준으로 중복 데이터를 제거합니다.
   */
  const uniquePlaceMap = new Map()

  loadedPlaces.forEach((place) => {
    if (!uniquePlaceMap.has(place.id)) {
      uniquePlaceMap.set(place.id, place)
    }
  })

  /*
   * 한글 장소명 기준으로 정렬합니다.
   */
  const places = Array.from(
    uniquePlaceMap.values(),
  ).sort((firstPlace, secondPlace) =>
    firstPlace.name.localeCompare(
      secondPlace.name,
      'ko',
    ),
  )

  return {
    places,
    failedFiles,
  }
} 