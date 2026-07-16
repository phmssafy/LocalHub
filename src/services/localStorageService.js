import defaultPostsData from '../data/default-posts.json'

const POST_STORAGE_KEY = 'localhub_posts_v1'
const COMMENT_STORAGE_KEY =
  'localhub_comments_v1'

const DEFAULT_POSTS = defaultPostsData.map(
  (post) => ({
    ...post,

    id: String(post.id),

    content: Array.isArray(post.content)
      ? post.content.join('\n\n')
      : String(post.content || ''),

    placeId:
      post.placeId === null ||
      post.placeId === undefined ||
      post.placeId === ''
        ? null
        : String(post.placeId),

    tags: Array.isArray(post.tags)
      ? post.tags
      : [],

    author: post.author || 'Localhub',
    views: Number(post.views) || 0,
    pwHash: null,
    isDefault: true,
  }),
)

const DEFAULT_POST_IDS = new Set(
  DEFAULT_POSTS.map((post) => post.id),
)

function readStorageArray(key) {
  try {
    const savedValue =
      window.localStorage.getItem(key)

    if (!savedValue) {
      return []
    }

    const parsedValue =
      JSON.parse(savedValue)

    return Array.isArray(parsedValue)
      ? parsedValue
      : []
  } catch (error) {
    console.error(
      `${key} 데이터를 읽지 못했습니다.`,
      error,
    )

    return []
  }
}

function writeStorageArray(key, value) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(value),
    )
  } catch (error) {
    console.error(
      `${key} 데이터를 저장하지 못했습니다.`,
      error,
    )

    throw new Error(
      '브라우저 저장소에 데이터를 저장하지 못했습니다.',
    )
  }
}

function createId(prefix) {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID ===
      'function'
  ) {
    return `${prefix}_${crypto.randomUUID()}`
  }

  return [
    prefix,
    Date.now(),
    Math.random()
      .toString(36)
      .slice(2),
  ].join('_')
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return []
  }

  return [
    ...new Set(
      tags
        .map((tag) =>
          String(tag || '').trim(),
        )
        .filter(Boolean),
    ),
  ]
}

function requireText(value, fieldName) {
  const normalizedValue =
    String(value || '').trim()

  if (!normalizedValue) {
    throw new Error(
      `${fieldName}을(를) 입력해 주세요.`,
    )
  }

  return normalizedValue
}

function getSavedPosts() {
  return readStorageArray(
    POST_STORAGE_KEY,
  )
}

function getDefaultPostById(postId) {
  const normalizedPostId =
    String(postId)

  return (
    DEFAULT_POSTS.find(
      (post) =>
        post.id === normalizedPostId,
    ) ?? null
  )
}

function isDefaultPost(postId) {
  return DEFAULT_POST_IDS.has(
    String(postId),
  )
}

export async function hashPassword(
  password,
) {
  const normalizedPassword =
    requireText(password, '비밀번호')

  if (
    typeof crypto === 'undefined' ||
    !crypto.subtle
  ) {
    throw new Error(
      '현재 브라우저에서는 비밀번호 암호화를 사용할 수 없습니다.',
    )
  }

  const encodedPassword =
    new TextEncoder().encode(
      normalizedPassword,
    )

  const hashBuffer =
    await crypto.subtle.digest(
      'SHA-256',
      encodedPassword,
    )

  return Array.from(
    new Uint8Array(hashBuffer),
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
}

export async function verifyPassword(
  password,
  savedPasswordHash,
) {
  if (!savedPasswordHash) {
    return false
  }

  const inputPasswordHash =
    await hashPassword(password)

  return (
    inputPasswordHash ===
    savedPasswordHash
  )
}

export function getPosts() {
  const savedPosts = getSavedPosts()

  /*
   * 기본 게시글과 같은 ID를 가진 로컬 게시글이 있다면
   * 중복 표시하지 않습니다.
   */
  const uniqueSavedPosts =
    savedPosts.filter(
      (post) =>
        !DEFAULT_POST_IDS.has(
          String(post.id),
        ),
    )

  return [
    ...DEFAULT_POSTS.map(
      (post) => ({
        ...post,
        tags: [...post.tags],
      }),
    ),
    ...uniqueSavedPosts,
  ].sort((firstPost, secondPost) => {
    const firstTime = new Date(
      firstPost.createdAt,
    ).getTime()

    const secondTime = new Date(
      secondPost.createdAt,
    ).getTime()

    return secondTime - firstTime
  })
}

export function getPostById(postId) {
  const normalizedPostId =
    String(postId)

  const defaultPost =
    getDefaultPostById(
      normalizedPostId,
    )

  if (defaultPost) {
    return {
      ...defaultPost,
      tags: [...defaultPost.tags],
    }
  }

  return (
    getSavedPosts().find(
      (post) =>
        String(post.id) ===
        normalizedPostId,
    ) ?? null
  )
}

export async function createPost({
  title,
  content,
  placeId = null,
  tags = [],
  password,
}) {
  const now = new Date().toISOString()

  const newPost = {
    id: createId('post'),
    title: requireText(
      title,
      '제목',
    ),
    content: requireText(
      content,
      '내용',
    ),
    placeId:
      placeId === null ||
      placeId === undefined ||
      placeId === ''
        ? null
        : String(placeId),
    tags: normalizeTags(tags),
    author: '익명',
    views: 0,
    createdAt: now,
    updatedAt: now,
    pwHash:
      await hashPassword(password),
    isDefault: false,
  }

  const savedPosts = getSavedPosts()

  savedPosts.push(newPost)

  writeStorageArray(
    POST_STORAGE_KEY,
    savedPosts,
  )

  return newPost
}

export async function updatePost(
  postId,
  {
    title,
    content,
    placeId = null,
    tags = [],
  },
  password,
) {
  const normalizedPostId =
    String(postId)

  if (
    isDefaultPost(normalizedPostId)
  ) {
    throw new Error(
      '기본 게시글은 수정할 수 없습니다.',
    )
  }

  const savedPosts = getSavedPosts()

  const postIndex =
    savedPosts.findIndex(
      (post) =>
        String(post.id) ===
        normalizedPostId,
    )

  if (postIndex < 0) {
    throw new Error(
      '수정할 게시글을 찾을 수 없습니다.',
    )
  }

  const passwordMatches =
    await verifyPassword(
      password,
      savedPosts[postIndex].pwHash,
    )

  if (!passwordMatches) {
    throw new Error(
      '비밀번호가 일치하지 않습니다.',
    )
  }

  const updatedPost = {
    ...savedPosts[postIndex],
    title: requireText(
      title,
      '제목',
    ),
    content: requireText(
      content,
      '내용',
    ),
    placeId:
      placeId === null ||
      placeId === undefined ||
      placeId === ''
        ? null
        : String(placeId),
    tags: normalizeTags(tags),
    updatedAt:
      new Date().toISOString(),
  }

  savedPosts[postIndex] =
    updatedPost

  writeStorageArray(
    POST_STORAGE_KEY,
    savedPosts,
  )

  return updatedPost
}

export async function deletePost(
  postId,
  password,
) {
  const normalizedPostId =
    String(postId)

  if (
    isDefaultPost(normalizedPostId)
  ) {
    throw new Error(
      '기본 게시글은 삭제할 수 없습니다.',
    )
  }

  const savedPosts = getSavedPosts()

  const postIndex =
    savedPosts.findIndex(
      (post) =>
        String(post.id) ===
        normalizedPostId,
    )

  if (postIndex < 0) {
    throw new Error(
      '삭제할 게시글을 찾을 수 없습니다.',
    )
  }

  const passwordMatches =
    await verifyPassword(
      password,
      savedPosts[postIndex].pwHash,
    )

  if (!passwordMatches) {
    throw new Error(
      '비밀번호가 일치하지 않습니다.',
    )
  }

  savedPosts.splice(postIndex, 1)

  writeStorageArray(
    POST_STORAGE_KEY,
    savedPosts,
  )

  const remainingComments =
    readStorageArray(
      COMMENT_STORAGE_KEY,
    ).filter(
      (comment) =>
        String(comment.postId) !==
        normalizedPostId,
    )

  writeStorageArray(
    COMMENT_STORAGE_KEY,
    remainingComments,
  )

  return true
}

export function increasePostViews(
  postId,
) {
  const normalizedPostId =
    String(postId)

  /*
   * 기본 게시글의 조회수는 배포 데이터이므로
   * 브라우저마다 수정하지 않고 그대로 반환합니다.
   */
  const defaultPost =
    getDefaultPostById(
      normalizedPostId,
    )

  if (defaultPost) {
    return {
      ...defaultPost,
      tags: [...defaultPost.tags],
    }
  }

  const savedPosts = getSavedPosts()

  const postIndex =
    savedPosts.findIndex(
      (post) =>
        String(post.id) ===
        normalizedPostId,
    )

  if (postIndex < 0) {
    return null
  }

  const updatedPost = {
    ...savedPosts[postIndex],
    views:
      Number(
        savedPosts[postIndex].views,
      ) + 1,
  }

  savedPosts[postIndex] =
    updatedPost

  writeStorageArray(
    POST_STORAGE_KEY,
    savedPosts,
  )

  return updatedPost
}

export function getCommentsByPostId(
  postId,
) {
  const normalizedPostId =
    String(postId)

  return readStorageArray(
    COMMENT_STORAGE_KEY,
  )
    .filter(
      (comment) =>
        String(comment.postId) ===
        normalizedPostId,
    )
    .sort(
      (
        firstComment,
        secondComment,
      ) =>
        new Date(
          firstComment.createdAt,
        ).getTime() -
        new Date(
          secondComment.createdAt,
        ).getTime(),
    )
}

export async function createComment({
  postId,
  content,
  password,
}) {
  const normalizedPostId =
    String(postId)

  const targetPost =
    getPostById(normalizedPostId)

  if (!targetPost) {
    throw new Error(
      '댓글을 등록할 게시글을 찾을 수 없습니다.',
    )
  }

  const now = new Date().toISOString()

  const newComment = {
    id: createId('comment'),
    postId: normalizedPostId,
    content: requireText(
      content,
      '댓글 내용',
    ),
    author: '익명',
    createdAt: now,
    updatedAt: now,
    pwHash:
      await hashPassword(password),
  }

  const savedComments =
    readStorageArray(
      COMMENT_STORAGE_KEY,
    )

  savedComments.push(newComment)

  writeStorageArray(
    COMMENT_STORAGE_KEY,
    savedComments,
  )

  return newComment
}

export async function deleteComment(
  commentId,
  password,
) {
  const normalizedCommentId =
    String(commentId)

  const savedComments =
    readStorageArray(
      COMMENT_STORAGE_KEY,
    )

  const commentIndex =
    savedComments.findIndex(
      (comment) =>
        String(comment.id) ===
        normalizedCommentId,
    )

  if (commentIndex < 0) {
    throw new Error(
      '삭제할 댓글을 찾을 수 없습니다.',
    )
  }

  const passwordMatches =
    await verifyPassword(
      password,
      savedComments[commentIndex]
        .pwHash,
    )

  if (!passwordMatches) {
    throw new Error(
      '비밀번호가 일치하지 않습니다.',
    )
  }

  savedComments.splice(
    commentIndex,
    1,
  )

  writeStorageArray(
    COMMENT_STORAGE_KEY,
    savedComments,
  )

  return true
}