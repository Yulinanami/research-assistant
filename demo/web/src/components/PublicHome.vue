<script setup>
import { computed, ref } from 'vue'
import { state } from '../store'
import { demoRoles, publicRecommendations } from '../auth'
const emit = defineEmits(['login'])
const loginOpen = ref(false)
const role = ref(demoRoles.includes(state.role) ? state.role : demoRoles[0])
const recommendations = computed(() => publicRecommendations(state).slice(0, 6))
const features = [
  { icon:'FolderOpened', title:'以项目组织资料', text:'围绕科研目标管理文档、图片和结构化数据。' },
  { icon:'EditPen', title:'按模板建设数据', text:'连接清洗、生成与人工标注，让加工过程有序衔接。' },
  { icon:'Collection', title:'发现与共享成果', text:'通过数据目录与数据广场，让经过审核的成果得到应用。' },
]
function requestLogin() { loginOpen.value = true }
function scrollToSection(id) { document.getElementById(id)?.scrollIntoView({behavior:'smooth'}) }
</script>

<template>
  <div class="public-home">
    <header class="public-header"><a class="public-brand" href="#home"><span class="brand-mark"><el-icon><DataLine /></el-icon></span><span><b>研数</b><small>科研数据建设与共享</small></span></a><nav aria-label="首页导航"><a href="#public-features" @click.prevent="scrollToSection('public-features')">平台能力</a><a href="#public-datasets" @click.prevent="scrollToSection('public-datasets')">公开数据集</a></nav><el-button type="primary" @click="requestLogin">登录</el-button></header>
    <main class="public-content">
      <section class="public-hero"><div class="public-hero-copy"><span class="eyebrow">RESEARCH DATA WORKSPACE</span><h1>让科研资料<br />成为可用的数据</h1><p>从一份文档到一组标注数据，在项目中完成采集、加工与复核，让科研成果得到更好的积累与共享。</p><div class="public-hero-actions"><el-button type="primary" size="large" @click="requestLogin">登录工作台<el-icon><ArrowRight /></el-icon></el-button><span>组织资料 · 建设数据 · 共享成果</span></div></div><div class="public-hero-visual" aria-hidden="true"><div class="public-visual-orbit"></div><div class="public-visual-card"><span class="icon-tile blue"><el-icon><Document /></el-icon></span><b>资料，连接知识与应用</b><div class="public-visual-lines"><i></i><i></i><i></i></div><div class="public-visual-flow"><span>采集</span><el-icon><ArrowRight /></el-icon><span>标注</span><el-icon><ArrowRight /></el-icon><span>共享</span></div></div><div class="public-visual-badge"><el-icon><CircleCheck /></el-icon>每一步，都有迹可循</div></div></section>
      <section id="public-features" class="public-features"><article v-for="feature in features" :key="feature.title"><span class="icon-tile blue"><el-icon><component :is="feature.icon" /></el-icon></span><h2>{{ feature.title }}</h2><p>{{ feature.text }}</p></article></section>
      <section id="public-datasets" class="public-datasets"><div class="public-section-heading"><div><span class="eyebrow">OPEN DATASETS</span><h2>发现公开的数据成果</h2><p>展示已发布的公开数据集，登录后申请使用并管理自己的数据。</p></div><el-button plain @click="requestLogin">登录探索更多<el-icon><ArrowRight /></el-icon></el-button></div><div v-if="recommendations.length" class="recommend-grid"><article v-for="item in recommendations" :key="item.id" class="recommend-card"><span class="icon-tile teal"><el-icon><Collection /></el-icon></span><h3>{{ item.name }}</h3><p>{{ item.summary }}</p><div class="tags"><el-tag v-for="tag in item.tags" :key="tag" type="info">{{ tag }}</el-tag></div><div class="public-dataset-footer"><small>{{ item.type }} · {{ item.count }} 条数据</small><el-button link type="primary" @click="requestLogin">登录查看详情</el-button></div></article></div><div v-else class="public-datasets-empty"><el-icon><Collection /></el-icon><div><h3>公开数据集正在积累中</h3><p>登录工作台，开始建设您的第一个数据集。</p></div><el-button text type="primary" @click="requestLogin">开始数据建设<el-icon><ArrowRight /></el-icon></el-button></div></section>
    </main>
    <footer class="public-footer"><span>研数 · 科研数据建设与共享</span><span>从资料出发，让数据产生价值</span></footer>
    <el-dialog v-model="loginOpen" title="登录研数工作台" width="430" class="demo-login-dialog"><p class="login-description">当前为本地演示，选择身份后进入工作台。</p><el-form label-position="top" @submit.prevent="emit('login',role);loginOpen=false"><el-form-item label="演示身份"><el-select v-model="role" class="full-width"><el-option v-for="item in demoRoles" :key="item" :value="item" /></el-select></el-form-item></el-form><template #footer><el-button @click="loginOpen=false">取消</el-button><el-button type="primary" @click="emit('login',role);loginOpen=false">进入工作台</el-button></template></el-dialog>
  </div>
</template>
