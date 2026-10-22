const objectRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)

// Normalize only known fields; keep annotations, predictions and domain fields intact.
export function parseEntries(text, format = 'auto') {
  const content = text.replace(/^\uFEFF/, '').trim()
  if (!content) throw new Error('请提供非空 JSON 或 JSONL 条目')
  let parsed
  if (format !== 'jsonl') {
    try { parsed = JSON.parse(content) }
    catch (error) {
      if (format === 'json') throw new Error(`JSON 语法错误：${error.message}`)
    }
  }
  if (parsed === undefined) {
    parsed = content.split(/\r?\n/).flatMap((line, index) => {
      if (!line.trim()) return []
      try { return [JSON.parse(line)] }
      catch { throw new Error(`JSONL 第 ${index + 1} 行不是有效 JSON`) }
    })
  }
  const records = Array.isArray(parsed) ? parsed : parsed?.records
  if (!Array.isArray(records) || !records.length) throw new Error('请提供非空对象数组，或包含 records 数组的对象')
  return records.map((record, index) => {
    const fail = message => { throw new Error(`第 ${index + 1} 条：${message}`) }
    if (!objectRecord(record)) fail('条目必须是对象')
    const next = structuredClone(record)
    for (const key of ['question', 'answer', 'correctedAnswer', 'reference', 'instruction', 'input', 'output', 'content', 'image']) {
      if (next[key] !== undefined && typeof next[key] !== 'string') fail(`${key} 必须是文本`)
    }
    if (Object.hasOwn(next, 'data')) {
      if (!objectRecord(next.data)) fail('Label Studio data 必须是对象')
      for (const key of ['annotations', 'predictions']) {
        if (next[key] !== undefined && !Array.isArray(next[key])) fail(`${key} 必须是数组`)
      }
      if (!next.content && typeof next.data.text === 'string') next.content = next.data.text
      if (!next.image && typeof next.data.image === 'string') next.image = next.data.image
    }
    if (Object.hasOwn(next, 'conversations')) {
      validateConversations(next.conversations, `第 ${index + 1} 条`)
      // A multi-turn conversation remains a conversation, rather than a lossy QA pair.
    }
    if (Object.hasOwn(next, 'instruction') || Object.hasOwn(next, 'output')) {
      next.question = next.question || next.instruction || ''
      next.answer = next.answer || next.output || ''
      next.reference = next.reference || next.input || ''
    }
    if (next.labels !== undefined && (!Array.isArray(next.labels) || next.labels.some(label => typeof label !== 'string'))) fail('labels 必须是文本数组')
    return next
  })
}

export function validateConversations(messages, context = 'ShareGPT') {
  if (!Array.isArray(messages) || !messages.length) throw new Error(`${context}：conversations 必须是非空数组`)
  const roles = ['system', 'human', 'gpt', 'function_call', 'observation']
  for (const message of messages) {
    if (!objectRecord(message) || !roles.includes(message.from) || typeof message.value !== 'string' || !message.value.trim()) {
      throw new Error(`${context}：对话角色或消息内容无效`)
    }
  }
  if (!messages.some(message => message.from === 'human') || !messages.some(message => message.from === 'gpt')) {
    throw new Error(`${context}：需要包含 human 和 gpt 消息`)
  }
}
