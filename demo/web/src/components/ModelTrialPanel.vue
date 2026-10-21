<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Clock, FullScreen } from '@element-plus/icons-vue'
import { state } from '../store'
import { ensureChatSessions, createChatSession, selectChatSession } from '../domain'
const props = defineProps({ open: Boolean, expanded: Boolean })
const emit = defineEmits(['close','toggle-expanded'])
const input = ref(null)
const messagesArea = ref(null)
const historyOpen = ref(false)
const models = computed(() => state.models.filter(model => model.status === '已上架'))
const current = computed(() => state.chatSessions.find(session=>session.id===state.activeChatId && session.owner===state.role))
const history = computed(() => state.chatSessions.filter(session=>session.owner===state.role && (session.messages.length || session.draft)).sort((a,b)=>b.updatedAt-a.updatedAt))
const selectedModel = computed({ get:()=>models.value.some(model=>model.id===current.value?.modelId) ? current.value.modelId : models.value[0]?.id || '', set:value=>{ const session=current.value || createChatSession(state,value); session.modelId=value } })
const draft = computed({ get:()=>current.value?.draft || '', set:value=>{ const session=current.value || createChatSession(state,selectedModel.value); session.draft=value; session.updatedAt=Date.now() } })
const messages = computed(() => current.value?.messages || [])
const canSend = computed(() => Boolean(draft.value.trim() && models.value.some(model => model.id === selectedModel.value)))
watch(() => state.role, () => { ensureChatSessions(state); historyOpen.value=false })
async function scrollToEnd() { await nextTick(); messagesArea.value?.scrollTo({ top: messagesArea.value.scrollHeight }) }
async function focusInput() { await nextTick(); input.value?.focus(); scrollToEnd() }
watch(() => props.open, open => { if (open) focusInput(); else historyOpen.value=false })
watch(() => props.expanded, () => { historyOpen.value=false; focusInput() })
watch(() => messages.value.length, scrollToEnd)
function startNew() { createChatSession(state,selectedModel.value); historyOpen.value=false; focusInput() }
function chooseSession(id) { if (selectChatSession(state,id)) { historyOpen.value=false; focusInput() } }
const sessionDate = session => session.updatedAt ? new Date(session.updatedAt).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'}) : ''
function send() {
  if (!canSend.value) return
  const text=draft.value.trim()
  const modelId=selectedModel.value
  const session=current.value || createChatSession(state,modelId)
  if (!session.messages.length) session.title=text.slice(0,28)
  session.modelId=modelId
  session.messages.push({ role:'您', text }, { role:models.value.find(model=>model.id===modelId)?.name || '模型', text:'根据演示材料，A组含水率为20%，B组为25%，两组相差5个百分点。尚无作物产量记录，不能推断增产效果。' })
  session.draft=''; session.updatedAt=Date.now()
}
</script>
<template>
  <section v-show="open" id="model-trial-panel" class="model-trial-panel" aria-label="模型试用面板" @keydown.esc.stop="emit('close')">
    <header class="trial-header"><span class="trial-heading-icon"><el-icon><MagicStick /></el-icon></span><h2>模型试用</h2><div class="trial-header-actions"><el-button v-if="!expanded" text class="trial-new-chat" aria-label="新建聊天" @click="startNew"><el-icon><Plus /></el-icon>新建聊天</el-button><el-popover v-if="!expanded" v-model:visible="historyOpen" trigger="click" placement="bottom-end" :width="300" popper-class="trial-history-popover"><template #reference><el-button text aria-label="历史会话" title="历史会话"><el-icon><Clock /></el-icon></el-button></template><div class="trial-history-heading">历史会话</div><div class="trial-history-list"><button v-for="session in history" :key="session.id" class="trial-history-item" :class="{active:session.id===state.activeChatId}" @click="chooseSession(session.id)"><el-icon><ChatDotRound /></el-icon><span><b>{{ session.title }}</b><small v-if="sessionDate(session)">{{ sessionDate(session) }}</small></span></button><div v-if="!history.length" class="trial-history-empty">暂无历史会话</div></div></el-popover><el-button text :aria-label="expanded?'返回侧栏':'展开聊天窗口'" :title="expanded?'返回侧栏':'展开聊天窗口'" @click="emit('toggle-expanded')"><el-icon><Fold v-if="expanded" /><FullScreen v-else /></el-icon><span v-if="expanded">返回侧栏</span></el-button><el-button text aria-label="收起模型试用" title="收起模型试用" @click="emit('close')"><el-icon><ArrowRight /></el-icon></el-button></div></header>
    <div class="trial-body"><aside class="trial-session-sidebar" :inert="!expanded" :aria-hidden="!expanded"><el-button class="trial-sidebar-new" @click="startNew"><el-icon><Plus /></el-icon>新建聊天</el-button><div class="trial-history-list"><button v-for="session in history" :key="session.id" class="trial-history-item" :class="{active:session.id===state.activeChatId}" @click="chooseSession(session.id)"><el-icon><ChatDotRound /></el-icon><span><b>{{ session.title }}</b><small v-if="sessionDate(session)">{{ sessionDate(session) }}</small></span></button><div v-if="!history.length" class="trial-history-empty">暂无历史会话</div></div></aside><div class="trial-chat-content">
      <div ref="messagesArea" class="trial-messages" aria-live="polite"><div v-if="!messages.length" class="trial-empty"><span><el-icon><ChatDotRound /></el-icon></span><h3>在这里开始对话</h3></div><article v-for="(message,index) in messages" :key="index" class="trial-message" :class="{user:message.role==='您'}"><div class="trial-message-role"><el-icon><component :is="message.role==='您'?'EditPen':'MagicStick'" /></el-icon>{{ message.role.replace(/ · 模拟回答$/, '') }}</div><p>{{ message.text }}</p></article></div>
      <footer class="trial-composer"><div class="trial-input-box"><el-input ref="input" v-model="draft" type="textarea" :autosize="{minRows:3,maxRows:6}" placeholder="输入问题，Enter 发送…" aria-label="模型试用问题" @keydown.enter.exact.prevent="send" /><div class="trial-input-actions"><div class="trial-model-selector"><el-icon><Cpu /></el-icon><el-select v-model="selectedModel" placeholder="暂无可用模型" aria-label="选择试用模型"><el-option v-for="model in models" :key="model.id" :label="model.name" :value="model.id" /></el-select></div><el-button type="primary" :disabled="!canSend" circle aria-label="发送试用消息" @click="send"><el-icon><Upload /></el-icon></el-button></div></div></footer>
    </div></div>
  </section>
</template>
