<script setup>
import { ref } from 'vue'
defineProps({ login: Boolean })
const emit = defineEmits(['navigate', 'login'])
const account = ref('')
const password = ref('')
const error = ref('')
const processingFeatures = [
  { icon:'UploadFilled', title:'接入多种资料', text:'集中组织文档、表格和图片，按项目开展数据建设。' },
  { icon:'Brush', title:'解析与清洗', text:'提取文档内容，处理重复、格式和质量问题。' },
  { icon:'EditPen', title:'生成与标注', text:'构建问答、图片分类和多轮对话，结合人工检查。' },
  { icon:'Files', title:'管理数据版本', text:'查看历史内容，为发布版本填写Tag和更新说明。' },
]
const governanceFeatures = [
  { icon:'Grid', title:'发现数据集', text:'按类型和领域查找数据，比较版本、简介和下载量。' },
  { icon:'CircleCheck', title:'审核数据质量', text:'核对数据内容，记录审核意见并跟踪修订。' },
  { icon:'DocumentChecked', title:'申请与共享', text:'按发布版本申请使用，查看审批和授权结果。' },
  { icon:'Connection', title:'提供数据服务', text:'将已发布的数据用于下载和接口调用。' },
]
function showFeatures(id) { document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' }) }
function fillAccount() { account.value='demo_user'; password.value='demo123456'; error.value='' }
function submit() {
  if (!account.value.trim() || !password.value) { error.value='请输入账号和密码'; return }
  if (account.value.trim() !== 'demo_user' || password.value !== 'demo123456') { error.value='账号或密码不正确'; return }
  error.value=''; password.value=''; emit('login')
}
</script>

<template>
  <div class="public-shell" :class="{'public-auth':login}">
    <header class="public-header">
      <a class="public-brand" href="#welcome" @click.prevent="emit('navigate','welcome')"><span class="brand-mark"><el-icon><DataLine /></el-icon></span><b>研数</b></a>
      <nav v-if="!login" class="public-nav" aria-label="平台介绍"><button @click="showFeatures('processing-features')">数据加工</button><button @click="showFeatures('governance-features')">数据治理与共享</button></nav>
      <el-button v-if="!login" type="primary" class="public-login-link" @click="emit('navigate','login')">登录<el-icon><ArrowRight /></el-icon></el-button>
      <button v-else class="public-back" @click="emit('navigate','welcome')"><el-icon><ArrowLeft /></el-icon>返回首页</button>
    </header>
    <main v-if="!login" class="public-landing">
      <section class="public-hero">
        <div class="public-hero-copy"><h1>让科研资料<br />成为可用的数据<span>。</span></h1><p>从资料接入、清洗标注到版本发布，<br />在同一个平台完成数据建设与共享。</p><div class="public-hero-actions"><el-button type="primary" @click="emit('navigate','login')">开始使用<el-icon><ArrowRight /></el-icon></el-button><button @click="showFeatures('processing-features')">了解平台功能<el-icon><ArrowDown /></el-icon></button></div></div>
        <div class="public-hero-art" aria-hidden="true"><div class="public-art-orbit"></div><div class="public-document"><span class="public-art-icon"><el-icon><Document /></el-icon></span><b>科研资料</b><div class="public-document-lines"><i></i><i></i><i></i><i></i></div><div class="public-document-formats"><span>PDF</span><span>Word</span><span>图片</span></div></div><div class="public-data-card"><div><el-icon><Files /></el-icon><b>数据集</b><el-icon><CircleCheck /></el-icon></div><p>问答 · 标签 · 来源</p><div class="public-data-bars"><i></i><i></i><i></i><i></i><i></i></div></div><div class="public-floating-label"><el-icon><MagicStick /></el-icon>生成与标注</div></div>
      </section>
      <div class="public-feature-grid">
        <section id="processing-features" class="public-feature-section"><div class="public-feature-title"><el-icon><SetUp /></el-icon><h2>数据加工</h2></div><article v-for="feature in processingFeatures" :key="feature.title"><span><el-icon><component :is="feature.icon" /></el-icon></span><div><h3>{{ feature.title }}</h3><p>{{ feature.text }}</p></div></article></section>
        <section id="governance-features" class="public-feature-section"><div class="public-feature-title"><el-icon><Collection /></el-icon><h2>数据治理与共享</h2></div><article v-for="feature in governanceFeatures" :key="feature.title"><span><el-icon><component :is="feature.icon" /></el-icon></span><div><h3>{{ feature.title }}</h3><p>{{ feature.text }}</p></div></article></section>
      </div>
      <section class="public-start"><h2>从一个项目，开始数据建设</h2><el-button type="primary" @click="emit('navigate','login')">进入平台<el-icon><ArrowRight /></el-icon></el-button></section>
    </main>
    <main v-else class="public-login-page">
      <section class="public-login-card"><span class="public-login-icon"><el-icon><DataLine /></el-icon></span><h1>登录研数</h1><el-form label-position="top" @submit.prevent="submit"><el-form-item label="账号"><el-input v-model="account" placeholder="请输入账号" autocomplete="username" aria-label="登录账号"><template #prefix><el-icon><Monitor /></el-icon></template></el-input></el-form-item><el-form-item label="密码"><el-input v-model="password" type="password" show-password placeholder="请输入密码" autocomplete="current-password" aria-label="登录密码" @keyup.enter="submit"><template #prefix><el-icon><Lock /></el-icon></template></el-input></el-form-item><p v-if="error" class="public-login-error" role="alert">{{ error }}</p><el-button type="primary" class="public-submit" @click="submit">登录<el-icon><ArrowRight /></el-icon></el-button><el-button link class="public-example-account" @click="fillAccount">填入示例账号</el-button></el-form></section>
    </main>
  </div>
</template>
