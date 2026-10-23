<script setup>
import { computed, ref, watch } from 'vue'
import { state, selectedVersions, allowed, submitAnnotationResult, reviewAnnotationResult } from '../store'
import { isAnnotationResult, annotationReviewStatus, annotationSignature } from '../annotationReview'
import KnowledgeGraphView from './KnowledgeGraphView.vue'
const props = defineProps({ focusId: String })
const emit = defineEmits(['edit'])
const status = ref('全部')
const type = ref('全部')
const page = ref(1)
const selectedId = ref('')
const visible = ref(false)
const note = ref('')
const recordIndex = ref(0)
const results = computed(() => selectedVersions().filter(isAnnotationResult))
const types = computed(() => ['全部', ...new Set(results.value.map(version => version.type))])
const filtered = computed(() => results.value.filter(version => (status.value === '全部' || annotationReviewStatus(version) === status.value)
  && (type.value === '全部' || version.type === type.value)))
const rows = computed(() => filtered.value.slice((page.value - 1) * 8, page.value * 8))
const detail = computed(() => results.value.find(version => version.id === selectedId.value))
const detailStatus = computed(() => detail.value ? annotationReviewStatus(detail.value) : '')
const previewRecords = computed(() => detail.value ? detailStatus.value !== '待提交' ? detail.value.annotationReview.records : detail.value.records : [])
const record = computed(() => previewRecords.value[recordIndex.value])
const graphVersion = computed(() => detail.value ? { ...detail.value, records: previewRecords.value } : null)
const previewKey = computed(() => detail.value ? detail.value.id + ':' + annotationSignature(detail.value) : '')
function tagType(value) { return ({ '已通过':'success', '已退回':'danger', '待审核':'warning' })[value] || 'info' }
function show(version) { selectedId.value = version.id; note.value = ''; recordIndex.value = 0; visible.value = true }
watch(() => props.focusId, id => { const version = results.value.find(item => item.id === id); if (version) show(version) }, { immediate:true })
watch([status, type], () => { page.value = 1 })
watch(() => filtered.value.length, length => { page.value = Math.min(page.value, Math.max(1, Math.ceil(length / 8))) })
watch(() => previewRecords.value.length, length => { recordIndex.value = Math.min(recordIndex.value, Math.max(0, length - 1)) })
function decide(approved) { if (reviewAnnotationResult(detail.value, approved, note.value)) note.value = '' }
function edit() { if (detail.value) { visible.value = false; emit('edit', detail.value) } }
</script>

<template>
  <section class="panel annotation-result-review">
    <div class="section-title"><h3>标注成果审核</h3><el-tag type="info">{{ results.filter(item => annotationReviewStatus(item) === '待审核').length }} 项待审核</el-tag></div>
    <div class="toolbar"><el-select v-model="status" aria-label="审核状态"><el-option v-for="item in ['全部','待提交','待审核','已通过','已退回']" :key="item" :value="item" :label="item === '全部' ? '全部审核状态' : item" /></el-select><el-select v-model="type" aria-label="成果类型"><el-option v-for="item in types" :key="item" :value="item" :label="item === '全部' ? '全部成果类型' : item" /></el-select></div>
    <el-table :data="rows" empty-text="暂无标注成果">
      <el-table-column label="标注成果" min-width="210"><template #default="{row}"><b>{{ row.type }}{{ row.number ? ' · V' + row.number : '' }}</b><small class="task-project-name">{{ row.created }}</small></template></el-table-column>
      <el-table-column label="条数" width="80"><template #default="{row}">{{ row.records.length }}</template></el-table-column>
      <el-table-column label="审核状态" width="110"><template #default="{row}"><el-tag :type="tagType(annotationReviewStatus(row))">{{ annotationReviewStatus(row) }}</el-tag></template></el-table-column>
      <el-table-column label="提交人" width="100"><template #default="{row}">{{ row.annotationReview?.submittedBy || '—' }}</template></el-table-column>
      <el-table-column label="审核意见" min-width="200"><template #default="{row}">{{ annotationReviewStatus(row) === '待提交' && row.annotationReview ? '成果已变更，需重新提交' : row.annotationReview?.note || '—' }}</template></el-table-column>
      <el-table-column label="操作" width="220"><template #default="{row}"><el-button link type="primary" @click="show(row)">{{ annotationReviewStatus(row) === '待审核' && allowed('review') ? '审核' : '查看' }}</el-button><el-button v-if="['待提交','已退回'].includes(annotationReviewStatus(row))" link type="primary" :disabled="!allowed('edit')" @click="submitAnnotationResult(row)">提交审核</el-button></template></el-table-column>
    </el-table>
    <el-pagination v-model:current-page="page" :total="filtered.length" :page-size="8" layout="total, prev, pager, next" />
  </section>
  <el-drawer v-model="visible" title="标注成果审核" size="min(1100px, 96vw)">
    <template v-if="detail">
      <div class="section-title"><h3>{{ detail.type }}{{ detail.number ? ' · V' + detail.number : '' }}</h3><el-tag :type="tagType(detailStatus)">{{ detailStatus }}</el-tag></div>
      <KnowledgeGraphView v-if="detail.type === '知识图谱'" :key="previewKey" :version="graphVersion" />
      <template v-else-if="record">
        <div class="toolbar"><el-button :disabled="recordIndex === 0" @click="recordIndex--">上一条</el-button><span>{{ recordIndex + 1 }} / {{ previewRecords.length }}</span><el-button :disabled="recordIndex >= previewRecords.length - 1" @click="recordIndex++">下一条</el-button></div>
        <h4 v-if="record.title">{{ record.title }}</h4>
        <div v-if="record.image" class="review-image"><img :src="record.image" alt="待审核图片" /><span v-for="(box,index) in record.boxes || []" :key="box.id || index" class="review-image-box" :style="{left:box.x+'%',top:box.y+'%',width:box.width+'%',height:box.height+'%'}">{{ box.label }}</span></div>
        <div v-if="record.labels?.length" class="knowledge-keywords"><el-tag v-for="label in record.labels" :key="label">{{ label }}</el-tag></div>
        <h4 v-if="record.question">{{ record.question }}</h4><p v-if="record.question" class="review-answer">{{ record.correctedAnswer || record.answer }}</p>
        <pre v-if="record.content" class="knowledge-source-text">{{ record.content }}</pre>
        <section v-if="record.reference || record.source" class="graph-evidence"><h4>来源与证据</h4><p>{{ record.reference || record.source }}</p></section>
        <el-tag v-if="record.label" type="info">{{ record.label }}</el-tag>
      </template>
      <details v-if="detail.annotationReview?.criteria" class="annotation-review-criteria"><summary>审核标准</summary><pre>{{ detail.annotationReview.criteria }}</pre></details>
      <section v-if="detailStatus === '待审核' && allowed('review')" class="annotation-review-decision"><el-input v-model="note" type="textarea" :rows="4" placeholder="填写审核意见，退回时必填" /><div class="pipeline-actions"><el-button type="danger" @click="decide(false)">退回修改</el-button><el-button type="primary" @click="decide(true)">审核通过</el-button></div></section>
      <div v-else class="pipeline-actions"><span v-if="detail.annotationReview?.note">审核意见：{{ detail.annotationReview.note }}</span><el-button :disabled="!allowed('edit')" @click="edit">继续标注 / 修改</el-button><el-button v-if="['待提交','已退回'].includes(detailStatus)" type="primary" :disabled="!allowed('edit')" @click="submitAnnotationResult(detail)">提交审核</el-button></div>
      <el-table v-if="detail.annotationReview?.history?.length" :data="detail.annotationReview.history" class="annotation-review-history"><el-table-column label="操作" prop="action" width="100" /><el-table-column label="操作人" prop="actor" width="100" /><el-table-column label="时间" prop="at" width="170" /><el-table-column label="意见" prop="note" /></el-table>
    </template>
  </el-drawer>
</template>
