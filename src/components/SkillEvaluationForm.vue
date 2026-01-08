<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import * as Diff from 'diff'
import { marked } from 'marked'

// API配置
const API_KEY = '06c43b48b854470f88b6a9fa2cdd8bac.BkQtKioz4rCB7ago'
const ZHIPU_API_BASE = 'https://open.bigmodel.cn/api/paas/v4/'

// 表单数据
const userQuery = ref('')
const selectedSkills = ref<string[]>([])
const peContent = ref('')
const originalRubrics = ref('{}')
const adjustedRubrics = ref('{}')

// JSON编辑器配置
const editorOptions = {
  language: 'json',
  theme: 'vs',
  automaticLayout: true,
  formatOnType: true,
  formatOnPaste: true,
  minimap: { enabled: false },
  fontSize: 14,
  lineNumbers: 'on',
  scrollBeyondLastLine: false
}

// 技能选项
const skillOptions = [
  { value: 'pptx', label: 'PPTX', description: 'PowerPoint 演示文稿' },
  { value: 'pdf', label: 'PDF', description: 'PDF 文档' },
  { value: 'xlsx', label: 'XLSX', description: 'Excel 电子表格' },
  { value: 'docx', label: 'DOCX', description: 'Word 文档' }
]

// 加载状态
const aiAnalysisLoading = ref(false)
const aiHardConstraintResult = ref('')
const aiHardConstraintReasoning = ref('')
const showHardConstraintReasoning = ref(false)
const showAIFullscreen = ref(false)

// 验证结果
const validationResults = ref<Array<{ name: string; passed: boolean; message: string }>>([])

// 行数对比相关状态
const showDiffModal = ref(false)
const diffResult = ref<Array<Diff.Change>>([])
const diffOriginalLines = ref(0)
const diffAdjustedLines = ref(0)
const diffChangeCount = ref(0)

// 是否显示差异按钮（当有差异时）
const diffResults = computed(() => {
  return diffOriginalLines.value > 0 || diffAdjustedLines.value > 0
})

// 渲染Markdown内容
function renderMarkdown(text: string): string {
  if (!text) return ''
  try {
    return marked.parse(text, { async: false }) as string
  } catch {
    return text
  }
}

// 渲染AI分析结果（Markdown格式）
const renderedAIResult = computed(() => renderMarkdown(aiHardConstraintResult.value))
const renderedAIReasoning = computed(() => renderMarkdown(aiHardConstraintReasoning.value))

// 获取MimeType类别
function getMimeTypeCategory(mimeType: string): string {
  if (!mimeType) return ''
  const lower = mimeType.toLowerCase()
  if (lower.includes('pdf') || lower === 'application/pdf') return 'pdf'
  if (lower.includes('pptx') || lower.includes('presentation') || lower.includes('powerpoint') || lower === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx'
  if (lower.includes('xlsx') || lower.includes('spreadsheet') || lower.includes('excel') || lower === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx'
  if (lower.includes('docx') || lower.includes('word') || lower.includes('document') || lower === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  return ''
}

// 解析附件（从Query中提取）
function parseAttachmentsFromQuery(query: string): string[] {
  const attachmentTypes: string[] = []
  const patterns = [
    /\.(pptx|pdf|xlsx|docx)/gi
  ]
  
  patterns.forEach(pattern => {
    const matches = query.match(pattern)
    if (matches) {
      matches.forEach(match => {
        const type = match.toLowerCase().replace('.', '')
        if (['pptx', 'pdf', 'xlsx', 'docx'].includes(type)) {
          attachmentTypes.push(type)
        }
      })
    }
  })
  
  return [...new Set(attachmentTypes)]
}

// 技能链接映射
const skillLinks: Record<string, string> = {
  'docx': 'https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md',
  'pdf': 'https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md',
  'pptx': 'https://github.com/anthropics/skills/blob/main/skills/pptx/SKILL.md',
  'xlsx': 'https://github.com/anthropics/skills/blob/main/skills/xlsx/SKILL.md'
}

// 解析Rubrics JSON
function parseRubrics(rubricsText: string): any {
  try {
    return JSON.parse(rubricsText)
  } catch {
    return null
  }
}

// 检测文本是否由AI生成
function isAIGeneratedText(text: string): { isAI: boolean; confidence: number; reasons: string[] } {
  if (!text || !text.trim()) {
    return { isAI: false, confidence: 0, reasons: [] }
  }

  const scoreIndicators = [
    /^[一二三四五六七八九十\d]+[、.）)]/,
    /^[①②③④⑤⑥⑦⑧⑨⑩]/,
    /首先[，,]/,
    /其次[，,]/,
    /最后[，,]/,
    /总之/,
    /第一[，,]/,
    /第二[，,]/,
    /第三[，,]/,
    /总的来说/,
    /一般来说/,
    /需要说明的是/,
    /需要注意的是/,
    /具体而言/,
    /例如[，,]/,
    /比如[，,]/,
    /等等/,
    /等[等]?/
  ]

  let score = 0
  const reasons: string[] = []
  const maxScore = 10

  scoreIndicators.forEach(regex => {
    if (regex.test(text)) {
      score += 1
      reasons.push('使用规范的结构化编号格式')
    }
  })

  const sentences = text.split(/[。！？\n]/).filter(s => s.trim().length > 0)
  if (sentences.length > 0) {
    const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length
    if (avgLength > 30) {
      score += 1
      reasons.push(`句子平均长度较长 (${avgLength.toFixed(1)}字)，AI倾向使用长句`)
    }
  }

  const lineBreaks = text.split('\n')
  if (lineBreaks.length > 1) {
    const allLinesSimilarLength = lineBreaks.every(line => {
      const trimmed = line.trim()
      return trimmed.length > 10 && trimmed.length < 100
    })
    if (allLinesSimilarLength) {
      score += 1
      reasons.push('各行长度过于均匀，可能是批量生成')
    }
  }

  const hasUserQueryIndicators = [
    '用户', '客户', '请求', '需要', '想要', '希望',
    '查询', '问题', '需求', '场景'
  ]
  const userIndicatorCount = hasUserQueryIndicators.filter(ind => text.includes(ind)).length
  if (userIndicatorCount < 2) {
    score += 1.5
    reasons.push('缺少真实用户Query的自然语言特征')
  }

  const aiConfidence = Math.min((score / maxScore) * 100, 100)
  const isAI = score >= 5

  return { isAI, confidence: aiConfidence, reasons }
}

// 统计行数
function countLines(text: string): number {
  return text.split('\n').filter(line => line.trim()).length
}

// 计算差异
function computeDiff(original: string, adjusted: string) {
  const originalLines = original.split('\n').filter(line => line.trim())
  const adjustedLines = adjusted.split('\n').filter(line => line.trim())
  
  diffOriginalLines.value = originalLines.length
  diffAdjustedLines.value = adjustedLines.length
  
  const diff = Diff.diffLines(original, adjusted)
  diffResult.value = diff
  
  const changeCount = diff.filter(part => !part.added && !part.removed).length
  const totalParts = diff.length
  diffChangeCount.value = totalParts > 0 ? Math.round(((totalParts - changeCount) / totalParts) * 100) : 0
}

// 打开差异对比模态框
function openDiffModal() {
  computeDiff(originalRubrics.value, adjustedRubrics.value)
  showDiffModal.value = true
}

// 关闭差异对比模态框
function closeDiffModal() {
  showDiffModal.value = false
}

// 打开AI分析全屏
function openAIFullscreen() {
  showAIFullscreen.value = true
  document.body.style.overflow = 'hidden'
}

// 关闭AI分析全屏
function closeAIFullscreen() {
  showAIFullscreen.value = false
  document.body.style.overflow = ''
}

// 完整的静态检查
function performStaticChecks() {
  const results: Array<{ name: string; passed: boolean; message: string }> = []
  
  // 检验0：用户 Query AI 检测
  const aiDetection = isAIGeneratedText(userQuery.value)
  results.push({
    name: '检验0：用户 Query AI 检测',
    passed: !aiDetection.isAI,
    message: aiDetection.isAI 
      ? `可能是AI生成的 (置信度: ${aiDetection.confidence.toFixed(0)}%)\n检测到以下特征：\n${aiDetection.reasons.map(r => '  • ' + r).join('\n')}`
      : `未检测到AI生成特征 ✓`
  })

  // 检验1：必填字段检查
  const hasQuery = userQuery.value.trim().length > 0
  const hasSkills = selectedSkills.value.length > 0
  const hasPE = peContent.value.trim().length > 0
  const hasOriginalRubrics = originalRubrics.value.trim().length > 0
  const hasAdjustedRubrics = adjustedRubrics.value.trim().length > 0
  
  results.push({
    name: '检验1：必填字段完整性',
    passed: hasQuery && hasSkills && hasPE && hasOriginalRubrics && hasAdjustedRubrics,
    message: hasQuery && hasSkills && hasPE && hasOriginalRubrics && hasAdjustedRubrics
      ? '所有必填字段已填写 ✓'
      : `缺少必要字段：${[
          !hasQuery ? '用户Query' : '',
          !hasSkills ? '使用的特定技能' : '',
          !hasPE ? 'PE' : '',
          !hasOriginalRubrics ? 'AI生成原始Rubrics' : '',
          !hasAdjustedRubrics ? '调整后Rubrics' : ''
        ].filter(Boolean).join('、')} ✗`
  })

  // 计算行数对比
  const originalLineCount = countLines(originalRubrics.value)
  const adjustedLineCount = countLines(adjustedRubrics.value)
  
  const diff = (originalRubrics.value && adjustedRubrics.value) 
    ? computeDiffForCheck(originalRubrics.value, adjustedRubrics.value) 
    : { addedLines: 0, removedLines: 0 }
  
  const { addedLines, removedLines } = diff
  
  // 同步更新差异状态，供"查看差异"按钮使用
  diffOriginalLines.value = originalLineCount
  diffAdjustedLines.value = adjustedLineCount
  
  const originalLineCountForPercent = originalLineCount > 0 ? originalLineCount : 1
  const addedPercentage = ((addedLines / originalLineCountForPercent) * 100).toFixed(2)
  const removedPercentage = ((removedLines / originalLineCountForPercent) * 100).toFixed(2)
  const totalDiffPercentage = parseFloat(addedPercentage) + parseFloat(removedPercentage)
  
  const passed = totalDiffPercentage > 10

  results.push({
    name: '检验2：行数对比',
    passed: passed,
    message: `AI 生成的原始 Rubrics: ${originalLineCount} 行，调整后: ${adjustedLineCount} 行，新增: ${addedLines} 行，删除: ${removedLines} 行，差异占比: ${totalDiffPercentage.toFixed(2)}% ${passed ? '✓ (差异大于10%)' : '✗ (差异应大于10%)'}`
  })

  // 解析调整后的Rubrics
  const parsedAdjusted = parseRubrics(adjustedRubrics.value)
  
  // 检验3：硬约束数量
  if (parsedAdjusted && parsedAdjusted.rubric && parsedAdjusted.rubric.硬约束) {
    const hardConstraints = parsedAdjusted.rubric.硬约束
    results.push({
      name: '检验3：硬约束数量',
      passed: hardConstraints.length > 3,
      message: `硬约束数量: ${hardConstraints.length} ${hardConstraints.length > 3 ? '✓' : '✗ (应大于3)'}`
    })
  } else {
    results.push({
      name: '检验3：硬约束数量',
      passed: false,
      message: '无法解析调整后的 Rubrics 或无硬约束 ✗'
    })
  }

  // 检验4：硬约束格式
  if (parsedAdjusted && parsedAdjusted.rubric && parsedAdjusted.rubric.硬约束) {
    const hardConstraints = parsedAdjusted.rubric.硬约束
    const hardConstraintKeys = new Set()
    let hardConstraintValid = true
    
    hardConstraints.forEach((hc: any) => {
      const keys = Object.keys(hc).filter(k => !['rubric描述', '是否需要相关事实', '相关事实', '事实数据源'].includes(k))
      keys.forEach(key => {
        hardConstraintKeys.add(key)
        if (key !== '0分情况' && key !== '1分情况') {
          hardConstraintValid = false
        }
      })
    })
    
    results.push({
      name: '检验4：硬约束格式',
      passed: hardConstraintValid,
      message: hardConstraintValid 
        ? '硬约束只有 0分情况 和 1分情况 ✓' 
        : `硬约束包含其他字段: ${Array.from(hardConstraintKeys).join(', ')} ✗`
    })
  } else {
    results.push({
      name: '检验4：硬约束格式',
      passed: false,
      message: '无法解析调整后的 Rubrics ✗'
    })
  }

  // 检验5：相关事实与数据源
  if (parsedAdjusted && parsedAdjusted.rubric && parsedAdjusted.rubric.硬约束) {
    const hardConstraints = parsedAdjusted.rubric.硬约束
    const hasRelatedFactConstraint = hardConstraints.find((hc: any) => {
      const needFact = hc['是否需要相关事实']
      return needFact && needFact.includes('是')
    })

    if (hasRelatedFactConstraint) {
      let relatedFactValid = true
      const missingSourceIssues: string[] = []
      const wrongFactIssues: string[] = []

      hardConstraints.forEach((hc: any, idx: number) => {
        const constraintLabel = hc['rubric描述'] || `硬约束${idx + 1}`
        const needFact = hc['是否需要相关事实']
        if (needFact && needFact.includes('是')) {
          const fact = hc['相关事实']
          const source = hc['事实数据源']
          if (!source || !source.trim()) {
            relatedFactValid = false
            missingSourceIssues.push(`${constraintLabel}（第${idx + 1}个）`)
          }
          if (!fact || fact === '否') {
            relatedFactValid = false
            wrongFactIssues.push(`${constraintLabel}（第${idx + 1}个）`)
          }
        } else if (!needFact) {
          relatedFactValid = false
          missingSourceIssues.push(`${constraintLabel}（第${idx + 1}个）`)
        }
      })

      let message = ''
      if (relatedFactValid) {
        message = '相关事实与数据源配置正确 ✓'
      } else {
        const parts: string[] = []
        if (missingSourceIssues.length > 0) {
          parts.push(`缺少数据源: ${missingSourceIssues.join('、')}`)
        }
        if (wrongFactIssues.length > 0) {
          parts.push(`相关事实不当: ${wrongFactIssues.join('、')}`)
        }
        message = parts.join('；') + ' ✗'
      }

      results.push({
        name: '检验5：相关事实与数据源',
        passed: relatedFactValid,
        message
      })
    } else {
      results.push({
        name: '检验5：相关事实与数据源',
        passed: true,
        message: '无需要相关事实的硬约束 ✓'
      })
    }
  } else {
    results.push({
      name: '检验5：相关事实与数据源',
      passed: true,
      message: '无硬约束或无法解析 ✓'
    })
  }

  // 检验6：软约束区间
  if (parsedAdjusted && parsedAdjusted.rubric && parsedAdjusted.rubric.软约束) {
    const softConstraints = parsedAdjusted.rubric.软约束
    let softConstraintValid = true
    let invalidSoftCount = 0
    let totalSoftCount = softConstraints.length

    softConstraints.forEach((sc: any) => {
      const needFourPoint = sc['是否需要4分区间'] || ''
      const keys = Object.keys(sc).filter(k => !['rubric描述', '是否需要4分区间', '相关事实', '事实数据源'].includes(k))
      const scoreKeys = keys.filter(k => k.startsWith('评分选项') || k.match(/^\d+分情况/))

      let hasZeroOne = scoreKeys.some(k => k === '0分情况' || k === '1分情况')
      let hasFourPoint = scoreKeys.some(k => k.includes('分情况')) && scoreKeys.length >= 5

      if (!hasZeroOne && !hasFourPoint) {
        softConstraintValid = false
        invalidSoftCount++
      }
    })

    results.push({
      name: '检验6：软约束区间',
      passed: softConstraintValid,
      message: softConstraintValid
        ? `软约束格式正确 (${totalSoftCount} 个) ✓`
        : `${invalidSoftCount}/${totalSoftCount} 个软约束格式不正确 ✗`
    })
  } else {
    results.push({
      name: '检验6：软约束区间',
      passed: true,
      message: '无软约束或无法解析 ✓'
    })
  }

  // 检验7：4分区间配置
  if (parsedAdjusted && parsedAdjusted.rubric) {
    const allConstraints = [
      ...(parsedAdjusted.rubric.软约束 || []),
      ...(parsedAdjusted.rubric.可选约束 || [])
    ]

    let fourPointValid = true
    let invalidFourPointCount = 0

    allConstraints.forEach((c: any) => {
      const fourPointAnswer = c['是否需要4分区间']
      if (fourPointAnswer) {
        if (fourPointAnswer.trim() === '否' || fourPointAnswer.trim() === '是') {
          fourPointValid = false
          invalidFourPointCount++
        }
      }
    })

    results.push({
      name: '检验7：4分区间配置',
      passed: fourPointValid,
      message: fourPointValid
        ? '所有"是否需要4分区间"配置合理 ✓'
        : `${invalidFourPointCount} 处配置过于简单（"是"或"否"） ✗`
    })
  } else {
    results.push({
      name: '检验7：4分区间配置',
      passed: true,
      message: '无约束或无法解析 ✓'
    })
  }

  // 检验8：Query中附件类型与技能匹配
  const queryAttachments = parseAttachmentsFromQuery(userQuery.value)
  const requiredSkills = queryAttachments.filter(t => t)
  const usedSkillList = selectedSkills.value
  
  let attachmentCheckPassed = true
  const attachmentIssues: string[] = []
  
  requiredSkills.forEach(skill => {
    const skillMatch = usedSkillList.some(s => s === skill)
    if (!skillMatch) {
      attachmentCheckPassed = false
      attachmentIssues.push(`需要 ${skill.toUpperCase()} 技能但未包含`)
    }
  })
  
  results.push({
    name: '检验8：Query附件类型与技能匹配',
    passed: attachmentCheckPassed,
    message: attachmentCheckPassed
      ? `Query中附件类型与选定技能匹配 ${usedSkillList.length > 0 ? '(使用: ' + usedSkillList.join(', ').toUpperCase() + ')' : '✓'}`
      : `${attachmentIssues.join('；')} ✗`
  })

  // 检验9：技能链接在PE中
  let skillLinksPassed = true
  const skillLinksIssues: string[] = []
  
  usedSkillList.forEach(skill => {
    const link = skillLinks[skill]
    if (link && !peContent.value.includes(link)) {
      skillLinksPassed = false
      skillLinksIssues.push(`${skill.toUpperCase()} 缺少 Skill 链接`)
    }
  })
  
  results.push({
    name: '检验9：技能链接在PE中',
    passed: skillLinksPassed,
    message: skillLinksPassed
      ? `所有使用的技能都包含 Skill 链接 ${usedSkillList.length > 0 ? '(' + usedSkillList.join(', ').toUpperCase() + ')' : '✓'}`
      : `${skillLinksIssues.join('；')} ✗`
  })

  validationResults.value = results
}

// 计算差异（用于静态检查，不更新响应式状态）
function computeDiffForCheck(original: string, adjusted: string) {
  const diff = Diff.diffLines(original, adjusted)
  
  let addedLines = 0
  let removedLines = 0
  
  diff.forEach(part => {
    if (part.added) {
      addedLines += part.value.split('\n').filter(line => line.trim()).length
    } else if (part.removed) {
      removedLines += part.value.split('\n').filter(line => line.trim()).length
    }
  })
  
  return { addedLines, removedLines }
}

// 调用智谱AI流式API
async function callZhipuAIStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  onReasoningChunk?: (reasoning: string) => void
) {
  const response = await fetch(`${ZHIPU_API_BASE}chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: 'glm-4.6',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 4096,
      stream: true
    })
  })

  if (!response.ok) {
    throw new Error(`API请求失败: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('无法读取响应流')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6)
        if (dataStr === '[DONE]') continue

        try {
          const data = JSON.parse(dataStr)
          if (data.choices?.[0]?.delta?.content) {
            onChunk(data.choices[0].delta.content)
          }
          if (data.choices?.[0]?.delta?.reasoning_content && onReasoningChunk) {
            onReasoningChunk(data.choices[0].delta.reasoning_content)
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }
}

// 提取硬约束选项 - 兼容多种JSON结构
function extractHardConstraintOptions(rubrics: any): any[] {
  if (!rubrics) {
    console.warn('rubrics参数为空')
    return []
  }
  
  console.log('尝试提取硬约束，数据结构:', JSON.stringify(rubrics).substring(0, 200))
  
  // 兼容多种JSON结构
  const possiblePaths = [
    // 标准结构: rubrics.rubric.硬约束
    () => rubrics.rubric?.硬约束,
    // 直接硬约束字段: rubrics.硬约束
    () => rubrics.硬约束,
    // 英文结构: rubrics.rubric.hardConstraints
    () => rubrics.rubric?.hardConstraints,
    // 其他可能: rubrics.hardConstraints
    () => rubrics.hardConstraints,
    // 可能是嵌套在其他字段中
    () => {
      // 查找任何包含"硬约束"或"hardConstraints"的字段
      for (const key of Object.keys(rubrics)) {
        if (key.includes('硬约束') || key.toLowerCase().includes('hard')) {
          const value = rubrics[key]
          if (Array.isArray(value)) return value
          if (value?.硬约束) return value.硬约束
          if (value?.hardConstraints) return value.hardConstraints
        }
      }
      return undefined
    }
  ]
  
  for (const tryPath of possiblePaths) {
    const result = tryPath()
    if (result && Array.isArray(result) && result.length > 0) {
      console.log('成功提取硬约束，数量:', result.length)
      return result
    }
  }
  
  console.warn('未能找到硬约束数据')
  return []
}

// 格式化硬约束文本
function formatHardConstraintsText(hardConstraints: any[]): string {
  if (!hardConstraints.length) return '无硬约束'

  return hardConstraints.map((hc, idx) => {
    // 兼容不同的字段名称
    const description = hc.rubric描述 || hc.description || '无'
    const zeroPointCase = hc['0分情况'] || ''
    const onePointCase = hc['1分情况'] || ''
    
    // 构建评分选项文本
    let optionsText = ''
    if (zeroPointCase || onePointCase) {
      optionsText = `0分情况: ${zeroPointCase || '无'}
1分情况: ${onePointCase || '无'}`
    }
    
    return `【硬约束 ${idx + 1}】
描述: ${description}
是否需要4分区间: ${hc.isFourPoint || false}
评分选项:
${optionsText || '无评分选项'}`
  }).join('\n\n')
}

// AI分析硬约束
async function callAIAnalysis() {
  // 验证必填字段
  if (!userQuery.value?.trim()) {
    alert('请先填写用户Query')
    return
  }
  if (!peContent.value?.trim()) {
    alert('请先填写PE内容')
    return
  }
  if (!adjustedRubrics.value?.trim()) {
    alert('请先填写调整后的Rubrics')
    return
  }

  // 验证JSON格式
  let rubricsObj
  try {
    rubricsObj = JSON.parse(adjustedRubrics.value)
    console.log('parsed rubricsObj:', rubricsObj)
    console.log('rubric field:', rubricsObj?.rubric)
    console.log('硬约束:', rubricsObj?.rubric?.硬约束)
  } catch (e) {
    alert('调整后的Rubrics JSON格式无效')
    return
  }

  // 提取硬约束选项 - 兼容多种JSON结构
  const hardConstraints = extractHardConstraintOptions(rubricsObj)
  
  console.log('extracted hardConstraints:', hardConstraints)
  
  if (!hardConstraints.length) {
    alert('Rubrics中未找到硬约束定义，请检查JSON格式是否正确')
    return
  }

  aiAnalysisLoading.value = true
  try {
    const userQueriesText = userQuery.value
    const hardConstraintsText = formatHardConstraintsText(hardConstraints)

    const prompt = `## 背景信息

【会触发特定技能的用户 Query】（需要被覆盖的要求）：
${userQueriesText || '无'}

【硬约束列表】（用于验证是否覆盖上述要求）：
${hardConstraintsText || '无硬约束'}

## 分析任务

### 任务1：验证硬约束是否覆盖用户 Query 要求
请逐一检查每个"用户 Query"，判断是否有对应的硬约束来验证该要求的满足情况：

对于每个用户 Query，请判断：
- 是否有硬约束的"0分情况"或"1分情况"提及了该 Query 中提到的关键要求？
- 如果没有覆盖，请指出哪个用户 Query 要求未被任何硬约束覆盖

请给出：
1. 覆盖了哪些用户 Query（列出具体 Query 内容和对应的硬约束）
2. 未覆盖哪些用户 Query（列出具体 Query 内容和原因）
3. 覆盖率估算（已覆盖/总要求数）

### 任务2：硬约束质量分析
请按照以下三个维度逐一分析每个约束：

## 1. MECE 原则（相互独立，完全穷尽）
检查 0分和1分的描述是否：
- 覆盖了所有可能的情况，不存在遗漏
- 两者之间没有重叠或交叉
- 一个案例只能被判为 0分 或 1分，不能同时满足或都无法满足

## 2. 是否可仅从Query + 相关事实判断
检查描述是否：
- 描述具体明确，没有歧义
- 判断标准清晰，仅从Query + 相关事实就可以判断
- 是否不依赖人的主观感受，只依赖客观事实

## 3. 可从最终产物验证
检查描述描述的情况是否能从最终产物中验证：
- 例如"读取PDF"无法从最终产物（PPT文件）验证
- 例如"输出PPTX格式"可以从文件扩展名验证
- 例如"包含封面页"可以从PPT内容验证

请对每个约束分别给出：
- 是否符合 MECE 原则（符合/不符合）
- 是否可仅从Query + 相关事实判断（符合/不符合）
- 是否可从最终产物验证（符合/不符合）
- 具体问题和改进建议

### 输出格式

## 覆盖性分析结果
[覆盖率估算]
[覆盖详情]
[未覆盖详情]

## 硬约束质量分析
[每个约束的详细分析]

## 改进建议
[最需要改进的约束和具体建议]
`

    aiHardConstraintResult.value = ''
    aiHardConstraintReasoning.value = ''
    showHardConstraintReasoning.value = true
    
    await callZhipuAIStream(
      prompt,
      (chunk) => {
        aiHardConstraintResult.value += chunk
      },
      (reasoningChunk) => {
        aiHardConstraintReasoning.value += reasoningChunk
      }
    )
    
    showHardConstraintReasoning.value = false
  } catch (e) {
    aiHardConstraintResult.value = 'AI分析失败'
    aiHardConstraintReasoning.value = e instanceof Error ? e.message : String(e)
    showHardConstraintReasoning.value = false
  } finally {
    aiAnalysisLoading.value = false
  }
}

// 监听表单变化，自动执行静态检查
watch([userQuery, selectedSkills, peContent, originalRubrics, adjustedRubrics], () => {
  performStaticChecks()
}, { deep: true })

// 初始执行检查
performStaticChecks()
</script>

<template>
  <div class="skill-evaluation-container">
    <header class="page-header">
      <h1>🛠️ 技能评估工具</h1>
      <p class="subtitle">填写左侧表单，右侧自动进行静态检查和AI分析</p>
    </header>

    <main class="main-content">
      <!-- 左侧：填写区域 -->
      <section class="form-section">
        <div class="form-container">
          <h2 class="section-title">📝 填写内容</h2>
          
          <!-- 会触发特定技能的用户 Query -->
          <div class="form-group">
            <label class="form-label">
              <span class="required">*</span>
              会触发特定技能的用户 Query
            </label>
            <textarea 
              v-model="userQuery"
              class="form-textarea"
              placeholder="请输入会触发特定技能的用户Query，例如：帮我分析这份PPT文件并总结关键内容"
              rows="4"
            ></textarea>
          </div>

          <!-- 使用的特定技能 -->
          <div class="form-group">
            <label class="form-label">
              <span class="required">*</span>
              使用的特定技能（多选题）
            </label>
            <div class="skills-grid">
              <label 
                v-for="skill in skillOptions" 
                :key="skill.value"
                class="skill-checkbox"
                :class="{ active: selectedSkills.includes(skill.value) }"
              >
                <input 
                  type="checkbox" 
                  :value="skill.value"
                  v-model="selectedSkills"
                >
                <span class="skill-name">{{ skill.label }}</span>
                <span class="skill-desc">{{ skill.description }}</span>
              </label>
            </div>
          </div>

          <!-- PE -->
          <div class="form-group">
            <label class="form-label">
              <span class="required">*</span>
              PE（实践示例）
            </label>
            <textarea 
              v-model="peContent"
              class="form-textarea"
              placeholder="请输入PE内容，包含具体的技能使用示例和步骤"
              rows="6"
            ></textarea>
          </div>

          <!-- AI 生成的原始 Rubrics -->
          <div class="form-group">
            <label class="form-label">
              <span class="required">*</span>
              AI 生成的原始 Rubrics
            </label>
            <div class="json-editor-wrapper">
              <VueMonacoEditor
                v-model:value="originalRubrics"
                :options="editorOptions"
                :style="{ height: '350px', width: '100%' }"
              />
            </div>
          </div>

          <!-- 调整后的 Rubrics -->
          <div class="form-group">
            <label class="form-label">
              <span class="required">*</span>
              调整后的 Rubrics
            </label>
            <div class="json-editor-wrapper">
              <VueMonacoEditor
                v-model:value="adjustedRubrics"
                :options="editorOptions"
                :style="{ height: '350px', width: '100%' }"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- 右侧：检查区域 -->
      <aside class="check-section">
        <div class="check-container">
          <h2 class="section-title">✅ 检查项目</h2>
          
          <!-- 静态检查结果 -->
          <div class="check-group">
            <h3 class="check-group-title">📋 静态检查</h3>
            <div class="check-list">
              <div 
                v-for="(check, index) in validationResults" 
                :key="index"
                class="check-item"
                :class="{ passed: check.passed, failed: !check.passed }"
              >
                <span class="check-icon">{{ check.passed ? '✓' : '✗' }}</span>
                <span class="check-name">{{ check.name }}</span>
                <span class="check-message">{{ check.message }}</span>
                <!-- 检验2：行数对比 添加查看差异按钮 -->
                <button 
                  v-if="index === 1 && diffResults"
                  class="diff-btn"
                  @click="openDiffModal"
                >
                  查看差异
                </button>
              </div>
            </div>
          </div>

          <!-- AI 分析硬约束 -->
          <div class="check-group">
            <h3 class="check-group-title">🤖 调用 AI 分析硬约束</h3>
            <button 
              class="ai-analyze-btn"
              @click="callAIAnalysis"
              :disabled="aiAnalysisLoading"
            >
              <template v-if="aiAnalysisLoading">
                <span class="loading-spinner"></span>
                AI 分析中...
              </template>
              <template v-else>
                ✨ 开始 AI 分析
              </template>
            </button>
            
            <!-- AI 分析结果 -->
            <div v-if="aiHardConstraintResult || aiAnalysisLoading" class="ai-result">
              <!-- 加载状态 -->
              <div v-if="aiAnalysisLoading" class="ai-analysis-loading">
                <span class="loading-spinner"></span>
                <span>AI 正在分析硬约束...</span>
              </div>
              
              <!-- 分析完成状态 -->
              <template v-else>
                <div class="ai-result-header">
                  <span class="result-label">🎯 分析结论</span>
                  <div 
                    class="result-value markdown-body"
                    :class="{ passed: aiHardConstraintResult === '通过', failed: aiHardConstraintResult === '未通过' }"
                    v-html="renderedAIResult"
                  ></div>
                </div>
                <div class="ai-reasoning">
                  <details>
                    <summary>查看详细分析</summary>
                    <div class="markdown-body" v-html="renderedAIReasoning"></div>
                  </details>
                  <!-- 全屏展开按钮 -->
                  <button 
                    class="fullscreen-btn"
                    @click="openAIFullscreen"
                    title="全屏查看"
                  >
                    ⛶ 全屏
                  </button>
                </div>
              </template>
            </div>
          </div>

          <!-- 检查统计 -->
          <div class="check-summary">
            <h3 class="check-group-title">📊 检查统计</h3>
            <div class="summary-stats">
              <div class="stat-item passed">
                <span class="stat-value">{{ validationResults.filter(r => r.passed).length }}</span>
                <span class="stat-label">通过</span>
              </div>
              <div class="stat-item failed">
                <span class="stat-value">{{ validationResults.filter(r => !r.passed).length }}</span>
                <span class="stat-label">未通过</span>
              </div>
              <div class="stat-item total">
                <span class="stat-value">{{ validationResults.length }}</span>
                <span class="stat-label">总计</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- 差异对比模态框 -->
    <Teleport to="body">
      <div v-if="showDiffModal" class="diff-modal-overlay" @click.self="closeDiffModal">
        <div class="diff-modal">
          <div class="diff-modal-header">
            <h3>📊 Rubrics 行数对比</h3>
            <button class="close-btn" @click="closeDiffModal">×</button>
          </div>
          <div class="diff-modal-body">
            <div class="diff-stats">
              <div class="diff-stat">
                <span class="diff-stat-value added">{{ diffOriginalLines }}</span>
                <span class="diff-stat-label">原始行数</span>
              </div>
              <div class="diff-stat">
                <span class="diff-stat-value removed">{{ diffAdjustedLines }}</span>
                <span class="diff-stat-label">调整后行数</span>
              </div>
              <div class="diff-stat">
                <span class="diff-stat-value change">{{ diffChangeCount }}%</span>
                <span class="diff-stat-label">变化率</span>
              </div>
            </div>
            <div class="diff-content">
              <div class="diff-section">
                <h4>原始 Rubrics</h4>
                <pre>{{ originalRubrics }}</pre>
              </div>
              <div class="diff-section">
                <h4>调整后 Rubrics</h4>
                <pre>{{ adjustedRubrics }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- AI分析结果全屏模态框 -->
    <Teleport to="body">
      <div v-if="showAIFullscreen" class="ai-fullscreen-overlay" @click.self="closeAIFullscreen">
        <div class="ai-fullscreen-modal">
          <div class="ai-fullscreen-header">
            <h3>📊 AI 硬约束分析详情</h3>
            <button class="close-btn" @click="closeAIFullscreen">×</button>
          </div>
          <div class="ai-fullscreen-body">
            <div class="ai-fullscreen-result">
              <div class="result-value markdown-body" :class="{ passed: aiHardConstraintResult === '通过', failed: aiHardConstraintResult === '未通过' }">
                <div v-html="renderedAIResult"></div>
              </div>
            </div>
            <div class="ai-fullscreen-content">
              <div class="markdown-body" v-html="renderedAIReasoning"></div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.skill-evaluation-container {
  max-width: 1600px;
  margin: 0 auto;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}

.page-header {
  text-align: center;
  color: white;
  margin-bottom: 30px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  backdrop-filter: blur(10px);
}

.page-header h1 {
  font-size: 2.5em;
  margin: 0 0 10px 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.subtitle {
  font-size: 1.1em;
  opacity: 0.9;
  margin: 0;
}

.main-content {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 24px;
}

.form-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.check-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  height: fit-content;
  position: sticky;
  top: 20px;
}

.section-title {
  font-size: 1.5em;
  margin: 0 0 24px 0;
  color: #333;
  border-bottom: 2px solid #667eea;
  padding-bottom: 12px;
}

.form-group {
  margin-bottom: 24px;
}

.form-label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
  color: #333;
  font-size: 1.1em;
}

.required {
  color: #e74c3c;
  margin-right: 4px;
}

.form-textarea {
  width: 100%;
  padding: 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  transition: border-color 0.3s;
}

.form-textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.skills-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.skill-checkbox {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  background: #f9f9f9;
}

.skill-checkbox:hover {
  border-color: #667eea;
  background: #f0f4ff;
}

.skill-checkbox.active {
  border-color: #667eea;
  background: #e8edff;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
}

.skill-checkbox input[type="checkbox"] {
  margin-bottom: 8px;
  width: 20px;
  height: 20px;
  accent-color: #667eea;
}

.skill-name {
  font-weight: 600;
  font-size: 1.2em;
  color: #333;
}

.skill-desc {
  font-size: 0.85em;
  color: #666;
  margin-top: 4px;
}

.json-editor-container {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  height: 350px;
}

.json-editor-wrapper:hover {
  border-color: #667eea;
}

.check-group {
  margin-bottom: 24px;
}

.check-group-title {
  font-size: 1.2em;
  margin: 0 0 16px 0;
  color: #333;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.check-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.check-item {
  display: flex;
  align-items: flex-start;
  padding: 12px;
  border-radius: 8px;
  background: #f8f9fa;
  transition: all 0.3s;
}

.check-item.passed {
  background: #d4edda;
  border-left: 4px solid #28a745;
}

.check-item.failed {
  background: #f8d7da;
  border-left: 4px solid #dc3545;
}

.check-icon {
  font-size: 1.2em;
  margin-right: 8px;
  min-width: 24px;
}

.check-item.passed .check-icon {
  color: #28a745;
}

.check-item.failed .check-icon {
  color: #dc3545;
}

.check-name {
  font-weight: 600;
  color: #333;
  min-width: 150px;
}

.check-message {
  color: #666;
  font-size: 0.95em;
}

.diff-btn {
  margin-left: auto;
  padding: 6px 12px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.85em;
  cursor: pointer;
  transition: all 0.3s;
}

.diff-btn:hover {
  background: #5568d3;
}

.diff-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.diff-modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 1200px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.diff-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.diff-modal-header h3 {
  margin: 0;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5em;
  color: #999;
  cursor: pointer;
  transition: color 0.3s;
}

.close-btn:hover {
  color: #333;
}

.diff-modal-body {
  padding: 20px;
  overflow-y: auto;
}

.diff-stats {
  display: flex;
  justify-content: center;
  gap: 40px;
  margin-bottom: 20px;
}

.diff-stat {
  text-align: center;
}

.diff-stat-value {
  display: block;
  font-size: 2em;
  font-weight: 700;
}

.diff-stat-value.added {
  color: #28a745;
}

.diff-stat-value.removed {
  color: #dc3545;
}

.diff-stat-value.change {
  color: #667eea;
}

.diff-stat-label {
  color: #666;
  font-size: 0.9em;
}

.diff-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.diff-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 16px;
}

.diff-section h4 {
  margin: 0 0 12px 0;
  color: #333;
}

.diff-section pre {
  margin: 0;
  white-space: pre-wrap;
  font-size: 0.9em;
  line-height: 1.5;
  max-height: 400px;
  overflow-y: auto;
}

.ai-analyze-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.1em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  margin-bottom: 16px;
}

.ai-analyze-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
}

.ai-analyze-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ai-result {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #dee2e6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  margin-top: 16px;
}

.ai-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px dashed #dee2e6;
}

.result-label {
  font-weight: 600;
  color: #495057;
  font-size: 1.05em;
}

.result-value {
  padding: 8px 20px;
  border-radius: 25px;
  font-weight: 700;
  font-size: 1.1em;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.result-value.passed {
  background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
  color: white;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
}

.result-value.failed {
  background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%);
  color: white;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
}

.ai-reasoning {
  margin-top: 12px;
}

.ai-reasoning details {
  background: white;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  border: 1px solid #dee2e6;
  transition: all 0.3s ease;
}

.ai-reasoning details:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #667eea;
}

.ai-reasoning summary {
  font-weight: 600;
  color: #667eea;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1em;
}

.ai-reasoning summary::before {
  content: '📝';
  font-size: 1.2em;
}

.ai-reasoning p {
  margin: 16px 0 0 0;
  padding: 16px;
  background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%);
  border-radius: 8px;
  font-size: 0.95em;
  color: #495057;
  line-height: 1.8;
  white-space: pre-wrap;
  border-left: 4px solid #667eea;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);
}

/* AI分析结果加载动画 */
.ai-analysis-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px;
  color: #667eea;
  font-weight: 600;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #e9ecef;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.ai-reasoning summary::before {
  content: '📝';
  font-size: 1.2em;
}

.ai-reasoning p {
  margin: 12px 0 0 0;
  padding: 12px;
  background: #f0f4ff;
  border-radius: 6px;
  font-size: 0.95em;
  color: #666;
  line-height: 1.6;
  white-space: pre-wrap;
}

.check-summary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 16px;
  color: white;
}

.check-summary .check-group-title {
  color: white;
  border-bottom-color: rgba(255, 255, 255, 0.3);
  margin-bottom: 16px;
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.stat-value {
  display: block;
  font-size: 2em;
  font-weight: 700;
}

.stat-label {
  font-size: 0.9em;
  opacity: 0.9;
}

@media (max-width: 1024px) {
  .main-content {
    grid-template-columns: 1fr;
  }
  
  .check-section {
    position: static;
  }
}

@media (max-width: 600px) {
  .skills-grid {
    grid-template-columns: 1fr;
  }
  
  .page-header h1 {
    font-size: 1.8em;
  }
}

.ai-fullscreen-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
  font-size: 0.95em;
  line-height: 1.8;
  color: #495057;
}

.ai-fullscreen-content {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #dee2e6;
}

.ai-fullscreen-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
  font-size: 0.95em;
  line-height: 1.8;
  color: #495057;
}

/* Markdown 渲染样式 */
.markdown-body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.8;
  color: #24292e;
  font-size: 0.95em;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.markdown-body h1 {
  font-size: 2em;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.markdown-body h2 {
  font-size: 1.5em;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.markdown-body h3 {
  font-size: 1.25em;
}

.markdown-body p {
  margin-top: 0;
  margin-bottom: 16px;
  line-height: 1.8;
}

.markdown-body ul,
.markdown-body ol {
  padding-left: 2em;
  margin-bottom: 16px;
}

.markdown-body li {
  margin-bottom: 8px;
}

.markdown-body li + li {
  margin-top: 4px;
}

.markdown-body strong {
  font-weight: 600;
  color: #24292e;
}

.markdown-body code {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background-color: rgba(27, 31, 35, 0.05);
  border-radius: 3px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
}

.markdown-body pre {
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
  background-color: #f6f8fa;
  border-radius: 6px;
  margin-bottom: 16px;
}

.markdown-body pre code {
  padding: 0;
  background-color: transparent;
  font-size: 100%;
}

.markdown-body blockquote {
  padding: 0 1em;
  color: #6a737d;
  border-left: 0.25em solid #dfe2e5;
  margin: 0 0 16px 0;
}

.markdown-body blockquote p {
  margin: 0;
}

.markdown-body table {
  display: block;
  width: 100%;
  overflow: auto;
  border-spacing: 0;
  border-collapse: collapse;
  margin-bottom: 16px;
}

.markdown-body table th,
.markdown-body table td {
  padding: 6px 13px;
  border: 1px solid #dfe2e5;
}

.markdown-body table th {
  font-weight: 600;
  background-color: #f6f8fa;
}

.markdown-body table tr {
  background-color: #fff;
  border-top: 1px solid #c6cbd1;
}

.markdown-body table tr:nth-child(2n) {
  background-color: #f8f9fa;
}

.markdown-body hr {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: #e1e4e8;
  border: 0;
}

.markdown-body a {
  color: #0366d6;
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

/* AI结果区域的特殊样式 */
.ai-result .markdown-body {
  background: #fff;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e1e4e8;
}

.ai-result .result-label {
  display: block;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.ai-result .result-value {
  padding: 16px;
  border-radius: 8px;
  font-size: 1.1em;
}

.ai-result .result-value.passed {
  background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
  color: #155724;
  border: 1px solid #b1dfbb;
}

.ai-result .result-value.failed {
  background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%);
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.ai-result .result-value h1,
.ai-result .result-value h2 {
  border: none;
  margin-top: 0;
}

/* 全屏模态框中的markdown样式 */
.ai-fullscreen-modal .markdown-body {
  padding: 20px;
  background: #fff;
  border-radius: 8px;
}

.ai-fullscreen-modal .markdown-body h1:first-child {
  margin-top: 0;
}

/* 表格样式优化 */
.markdown-body table {
  width: 100%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.markdown-body table th,
.markdown-body table td {
  text-align: left;
  padding: 12px 16px;
}

/* 列表样式优化 */
.markdown-body ul,
.markdown-body ol {
  margin-bottom: 20px;
}

/* 代码块样式优化 */
.markdown-body pre {
  background: #2d3748;
  color: #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.markdown-body pre code {
  color: inherit;
}

/* 引言块样式 */
.markdown-body blockquote {
  background: #fffbeb;
  border-left-color: #f59e0b;
  padding: 12px 20px;
  border-radius: 0 8px 8px 0;
}

.markdown-body blockquote.warning {
  background: #fef2f2;
  border-left-color: #ef4444;
}

.markdown-body blockquote.info {
  background: #eff6ff;
  border-left-color: #3b82f6;
}

.markdown-body blockquote.info {
  background: #eff6ff;
  border-left-color: #3b82f6;
}

/* AI分析结果全屏模态框样式 */
.ai-fullscreen-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(8px);
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.ai-fullscreen-modal {
  background: white;
  width: 90%;
  max-width: 1000px;
  height: 85vh;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.4);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.ai-fullscreen-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.ai-fullscreen-header h3 {
  margin: 0;
  font-size: 1.3em;
  font-weight: 600;
}

.ai-fullscreen-header .close-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  font-size: 28px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-fullscreen-header .close-btn:hover {
  background: rgba(255, 255, 255, 0.35);
  transform: rotate(90deg);
}

.ai-fullscreen-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.ai-fullscreen-result {
  margin-bottom: 24px;
}

.ai-fullscreen-result .result-value {
  display: inline-block;
  padding: 12px 36px;
  border-radius: 30px;
  font-weight: 700;
  font-size: 1.4em;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.ai-fullscreen-content {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #dee2e6;
}

.ai-fullscreen-content .markdown-body {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
}

.ai-fullscreen-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
  font-size: 0.95em;
  line-height: 1.8;
  color: #495057;
}
</style>