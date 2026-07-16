import {
  createRouter,
  createWebHistory,
} from 'vue-router'

import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(
    import.meta.env.BASE_URL,
  ),

  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/write',
      name: 'post-write',
      component: () =>
        import(
          '../views/PostWriteView.vue'
        ),
    },
    {
      path: '/post/:postId/edit',
      name: 'post-edit',
      component: () =>
        import(
          '../views/PostWriteView.vue'
        ),
    },
    {
      path: '/post/:postId',
      name: 'post-detail',
      component: () =>
        import(
          '../views/PostDetailView.vue'
        ),
    },
  ],

  scrollBehavior() {
    return {
      top: 0,
    }
  },
})

export default router