<script setup>
import { computed, ref } from 'vue'
import { state, storage } from '../store'
import DatasetCatalog from './DatasetCatalog.vue'
import { demoRoles, publicRecommendations } from '../auth'
const props = defineProps({page:{type:String,default:'home'},focus:Object})
const emit = defineEmits(['login','navigate','request-login','browse'])
const role = ref(demoRoles.includes(state.role) ? state.role : demoRoles[0])
const recommendations = computed(() => publicRecommendations(state).slice(0, 6))
const supportedTypes = [
  { icon:'Document', title:'文本资料', tone:'blue', formats:['TXT','Markdown'], description:'文本清洗、内容分块与文本分类。' },
  { icon:'Picture', title:'图片资料', tone:'teal', formats:['PNG','JPG','WebP','SVG'], description:'整图分类与区域框选标注。' },
  { icon:'Grid', title:'结构化记录', tone:'amber', formats:['JSON','JSONL'], description:'导入数据条目，保留自定义字段。' },
  { icon:'ChatDotRound', title:'问答与对话', tone:'purple', formats:['Alpaca','ShareGPT'], description:'问答人工复核与多轮对话导入。' },
]
function requestLogin() { emit('request-login') }
function scrollToSection(id) { document.getElementById(id)?.scrollIntoView({behavior:'smooth'}) }
</script>

<template>
  <div class="public-home">
    <header class="public-header"><a class="public-brand" href="#home" @click.prevent="emit('navigate','home')"><span class="brand-mark"><el-icon><DataLine /></el-icon></span><span><b>研数</b><small>科研数据建设与共享</small></span></a><nav aria-label="首页导航"><a v-if="page==='home'" href="#public-features" @click.prevent="scrollToSection('public-features')">支持类型</a><a v-else href="#home" @click.prevent="emit('navigate','home')">首页</a><a href="#square" @click.prevent="emit('navigate','square')">数据广场</a></nav><el-button v-if="page!=='login'" type="primary" @click="requestLogin">登录</el-button></header>
    <main v-if="page==='square'" class="public-content public-plaza governance-shell">
      <DatasetCatalog v-if="storage.ready" page="plaza" guest :focus="focus" @login-required="target=>emit('request-login',target)" />
      <div v-else class="loading-screen"><el-icon class="is-loading"><Loading /></el-icon></div>
    </main>
    <main v-else-if="page==='login'" class="public-login">
      <section class="public-login-card">
        <span class="public-login-icon"><el-icon><Lock /></el-icon></span><h1>登录研数</h1>
        <el-form label-position="top" @submit.prevent="emit('login',role)"><el-form-item label="身份"><el-select v-model="role" aria-label="登录身份"><el-option v-for="item in demoRoles" :key="item" :value="item" /></el-select></el-form-item><el-button native-type="submit" type="primary">登录</el-button></el-form>
        <el-button text @click="emit('navigate','square')"><el-icon><Back /></el-icon>返回数据广场</el-button>
      </section>
    </main>
    <main v-else class="public-content">
      <section class="public-hero"><div class="public-hero-copy"><span class="eyebrow">RESEARCH DATA WORKSPACE</span><h1>让科研资料<br />成为可用的数据</h1><p>从一份文档到一组标注数据，在项目中完成采集、加工与复核，让科研成果得到更好的积累与共享。</p><div class="public-hero-actions"><el-button type="primary" size="large" @click="requestLogin">登录工作台<el-icon><ArrowRight /></el-icon></el-button><span>组织资料 · 建设数据 · 共享成果</span></div></div><div class="public-hero-visual" aria-hidden="true"><div class="public-visual-orbit"></div><div class="public-visual-card"><span class="icon-tile blue"><el-icon><Document /></el-icon></span><b>资料，连接知识与应用</b><div class="public-visual-lines"><i></i><i></i><i></i></div><div class="public-visual-flow"><span>采集</span><el-icon><ArrowRight /></el-icon><span>标注</span><el-icon><ArrowRight /></el-icon><span>共享</span></div></div><div class="public-visual-badge"><el-icon><CircleCheck /></el-icon>每一步，都有迹可循</div></div></section>
      <section id="public-features" class="public-supported-types" aria-labelledby="supported-types-title">
        <h2 id="supported-types-title">支持的数据类型</h2>
        <div class="public-type-grid">
          <article v-for="type in supportedTypes" :key="type.title" class="public-type-card">
            <div class="public-type-heading"><span :class="['icon-tile',type.tone]" aria-hidden="true"><el-icon><component :is="type.icon" /></el-icon></span><h3>{{ type.title }}</h3></div>
            <p>{{ type.description }}</p>
            <div class="public-type-formats"><el-tag v-for="format in type.formats" :key="format" type="info" effect="plain">{{ format }}</el-tag></div>
          </article>
        </div>
      </section>
      <section id="public-datasets" class="public-datasets"><div class="public-section-heading"><div><span class="eyebrow">OPEN DATASETS</span><h2>发现公开的数据成果</h2><p>发现公开数据集，按领域和类型浏览。</p></div><el-button plain @click="emit('navigate','square')">查看数据广场<el-icon><ArrowRight /></el-icon></el-button></div><div v-if="recommendations.length" class="recommend-grid"><article v-for="item in recommendations" :key="item.id" class="recommend-card"><span class="icon-tile teal"><el-icon><Collection /></el-icon></span><h3>{{ item.name }}</h3><p>{{ item.summary }}</p><div class="tags"><el-tag v-for="tag in item.tags" :key="tag" type="info">{{ tag }}</el-tag></div><div class="public-dataset-footer"><small>{{ item.type }} · {{ item.count.toLocaleString() }} {{ item.type==='图片'?'张':'条' }}</small><el-button link type="primary" @click="emit('browse',item.id)">查看详情</el-button></div></article></div><div v-else class="public-datasets-empty"><el-icon><Collection /></el-icon><div><h3>公开数据集正在积累中</h3><p>登录工作台，开始建设您的第一个数据集。</p></div><el-button text type="primary" @click="requestLogin">开始数据建设<el-icon><ArrowRight /></el-icon></el-button></div></section>
    </main>
    <footer v-if="page==='home'" class="public-footer"><span>研数 · 科研数据建设与共享</span><span>从资料出发，让数据产生价值</span></footer>
  </div>
</template>
