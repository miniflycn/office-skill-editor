<script setup lang="ts">
import { ref, computed } from 'vue'

const API_KEY = 'f97c08043d7e46a4895b77ec7d93e425.iL7AVQhJq7GwVRgi'
const API_BASE = 'https://sd46rr9g19ma6giekl1c0.apigateway-cn-beijing.volceapi.com'
const REVIEW_APP_TOKEN = 'Ch21bZIBiaILEsseNqFc1A2pnwr'
const REVIEW_TABLE_ID = 'tblqcGro2wnE10DH'
const ZHIPU_API_BASE = 'https://open.bigmodel.cn/api/paas/v4/'

const recordId = ref('')
const loading = ref(false)
const error = ref('')
const data = ref<any>(null)
const formData = ref<Record<string, string>>({})
const validationResults = ref<Array<{ name: string; passed: boolean; message: string }>>([])
const aiAnalysisLoading = ref(false)
const aiAnalysisResult = ref('')

function extractTextFromArray(arr: any[]): string {
  if (!Array.isArray(arr)) return String(arr || '')
  return arr.map(item => item.text || item || '').join('')
}

function parseFormData(rawData: any) {
  const fields = rawData?.fields || {}
  formData.value = {
    'AI 生成的原始 Rubrics': extractTextFromArray(fields['AI 生成的原始 Rubrics']),
    '会触发特定技能的用户 Query': extractTextFromArray(fields['会触发特定技能的用户 Query']),
    '使用的特定技能': Array.isArray(fields['使用的特定技能'])
      ? fields['使用的特定技能'].join(', ')
      : String(fields['使用的特定技能'] || ''),
    '修改后的 PE': extractTextFromArray(fields['修改后的 PE']),
    '调整后的 Rubrics': extractTextFromArray(fields['调整后的 Rubrics']),
    '领域标签': extractTextFromArray(fields['领域标签'])
  }
}

function countLines(text: string): number {
  return text.split('\n').filter(line => line.trim()).length
}

function parseRubrics(rubricsText: string): any {
  try {
    return JSON.parse(rubricsText)
  } catch {
    return null
  }
}

function validateRubrics() {
  const results: Array<{ name: string; passed: boolean; message: string }> = []
  const originalRubrics = formData.value['AI 生成的原始 Rubrics']
  const adjustedRubrics = formData.value['调整后的 Rubrics']

  const originalLines = countLines(originalRubrics)
  const adjustedLines = countLines(adjustedRubrics)
  const percentage = originalLines > 0 ? ((adjustedLines / originalLines) * 100).toFixed(2) : '0'

  results.push({
    name: '检验1：行数对比',
    passed: true,
    message: `AI 生成的原始 Rubrics: ${originalLines} 行，调整后的 Rubrics: ${adjustedLines} 行，占比 ${percentage}%`
  })

  const parsedAdjusted = parseRubrics(adjustedRubrics)
  if (parsedAdjusted && parsedAdjusted.rubric && parsedAdjusted.rubric.硬约束) {
    const hardConstraints = parsedAdjusted.rubric.硬约束
    results.push({
      name: '检验2：硬约束数量',
      passed: hardConstraints.length > 3,
      message: `硬约束数量: ${hardConstraints.length} ${hardConstraints.length > 3 ? '✓' : '✗ (应大于3)'}`
    })

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
      message: hardConstraintValid ? '硬约束只有 0分情况 和 1分情况 ✓' : `硬约束包含其他字段: ${Array.from(hardConstraintKeys).join(', ')} ✗`
    })

    const hasRelatedFactConstraint = hardConstraints.find((hc: any) => {
      const needFact = hc['是否需要相关事实']
      return needFact && needFact.includes('是')
    })

    if (hasRelatedFactConstraint) {
      let relatedFactValid = true
      const missingSourceIssues: string[] = []
      const wrongFactIssues: string[] = []

      hardConstraints.forEach((hc: any, idx: number) => {
        const constraintLabel = hc['约束描述'] || `硬约束${idx + 1}`
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
        name: '检验3：相关事实与数据源',
        passed: relatedFactValid,
        message
      })
    } else {
      results.push({
        name: '检验3：相关事实与数据源',
        passed: true,
        message: '无需要相关事实的硬约束 ✓'
      })
    }
  } else {
    results.push({
      name: '检验2：硬约束数量',
      passed: false,
      message: '无法解析调整后的 Rubrics ✗'
    })
    results.push({
      name: '检验4：硬约束格式',
      passed: false,
      message: '无法解析调整后的 Rubrics ✗'
    })
    results.push({
      name: '检验3：相关事实与数据源',
      passed: false,
      message: '无法解析调整后的 Rubrics ✗'
    })
  }

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
      name: '检验5：软约束区间',
      passed: softConstraintValid,
      message: softConstraintValid
        ? `软约束格式正确 (${totalSoftCount} 个) ✓`
        : `${invalidSoftCount}/${totalSoftCount} 个软约束格式不正确 ✗`
    })
  } else {
    results.push({
      name: '检验5：软约束区间',
      passed: true,
      message: '无软约束或无法解析 ✓'
    })
  }

  if (parsedAdjusted && parsedAdjusted.rubric) {
    const allConstraints = [
      ...(parsedAdjusted.rubric.硬约束 || []),
      ...(parsedAdjusted.rubric.软约束 || [])
    ]

    let fourPointValid = true
    let invalidFourPointCount = 0

    allConstraints.forEach((c: any) => {
      const fourPointAnswer = c['是否需要4分区间']
      if (fourPointAnswer) {
        if (fourPointAnswer === '否' || fourPointAnswer.trim() === '是') {
          fourPointValid = false
          invalidFourPointCount++
        }
      }
    })

    results.push({
      name: '检验6：4分区间配置',
      passed: fourPointValid,
      message: fourPointValid
        ? '所有"是否需要4分区间"配置合理 ✓'
        : `${invalidFourPointCount} 处配置过于简单（"是"或"否"） ✗`
    })
  } else {
    results.push({
      name: '检验6：4分区间配置',
      passed: true,
      message: '无约束或无法解析 ✓'
    })
  }

  validationResults.value = results
}

function extractHardConstraintOptions(rubricsText: string): Array<{ description: string; zeroPoint: string; onePoint: string }> {
  const parsed = parseRubrics(rubricsText)
  if (!parsed || !parsed.rubric || !parsed.rubric.硬约束) {
    return []
  }

  return parsed.rubric.硬约束.map((hc: any) => ({
    description: hc['rubric描述'] || '',
    zeroPoint: hc['0分情况'] || '',
    onePoint: hc['1分情况'] || ''
  }))
}

async function callZhipuAI(prompt: string): Promise<string> {
  const response = await fetch(ZHIPU_API_BASE + 'chat/completions', {
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
      temperature: 0.3
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API 调用失败: ${errorText}`)
  }

  const result = await response.json()
  return result.choices?.[0]?.message?.content || ''
}

async function analyzeHardConstraints() {
  const adjustedRubrics = formData.value['调整后的 Rubrics']
  if (!adjustedRubrics) {
    error.value = '无可分析的 Rubrics 数据'
    return
  }

  const options = extractHardConstraintOptions(adjustedRubrics)
  if (options.length === 0) {
    error.value = '无法提取硬约束选项'
    return
  }

  aiAnalysisLoading.value = true
  error.value = ''
  aiAnalysisResult.value = ''

  try {
    const constraintsText = options.map((opt, idx) => {
      return `【约束 ${idx + 1}】
描述: ${opt.description}
0分情况: ${opt.zeroPoint}
1分情况: ${opt.onePoint}`
    }).join('\n\n')

    const prompt = `请分析以下硬约束选项的 0分情况 和 1分情况 描述：

${constraintsText}

请按照以下三个维度逐一分析每个约束：

## 1. MECE 原则（相互独立，完全穷尽）
检查 0分和1分的描述是否：
- 覆盖了所有可能的情况，不存在遗漏
- 两者之间没有重叠或交叉
- 一个案例只能被判为 0分 或 1分，不能同时满足或都无法满足

## 2. 便于常人判断
检查描述是否：
- 使用普通人能理解的语言，不需要专业知识
- 描述具体明确，没有歧义
- 判断标准清晰，普通人根据描述就能做出判断

## 3. 可从最终产物验证
检查描述描述的情况是否能从最终产物中验证：
- 例如"读取PDF"无法从最终产物（PPT文件）验证
- 例如"输出PPTX格式"可以从文件扩展名验证
- 例如"包含封面页"可以从PPT内容验证

请对每个约束分别给出：
- 是否符合 MECE 原则（符合/不符合）
- 是否便于常人判断（符合/不符合）
- 是否可从最终产物验证（符合/不符合）
- 具体问题和改进建议
`

    const analysis = await callZhipuAI(prompt)
    aiAnalysisResult.value = analysis
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    aiAnalysisLoading.value = false
  }
}

async function fetchBitableRecord() {
  if (!recordId.value.trim()) {
    error.value = '请输入 recordId'
    return
  }

  loading.value = true
  error.value = ''
  data.value = null
  formData.value = {}
  validationResults.value = []

  try {
    const url = API_BASE + '/tca/v1/bitable/record/' +
      encodeURIComponent(REVIEW_APP_TOKEN) + '/' +
      encodeURIComponent(REVIEW_TABLE_ID) + '/' +
      encodeURIComponent(recordId.value)

    const resp = await fetch(url, { method: 'GET' })
    const text = await resp.text()

    let result
    try {
      result = JSON.parse(text)
    } catch {
      throw new Error('接口返回的不是合法 JSON：\n' + text)
    }

    if (!resp.ok) {
      const detail = result?.detail || JSON.stringify(result, null, 2)
      throw new Error(detail)
    }

    data.value = result
    parseFormData(result)
    validateRubrics()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="container">
    <h1>Bitable 记录查询</h1>

    <div class="input-group">
      <input
        v-model="recordId"
        type="text"
        placeholder="请输入 recordId"
        :disabled="loading"
        @keyup.enter="fetchBitableRecord"
      />
      <button @click="fetchBitableRecord" :disabled="loading">
        {{ loading ? '加载中...' : '查询' }}
      </button>
    </div>

    <div v-if="error" class="error">
      {{ error }}
    </div>

    <div v-if="Object.keys(formData).length > 0" class="content">
      <div class="column">
        <h2>查询结果</h2>

        <div class="form-container">
          <div class="form-row" v-for="(value, key) in formData" :key="key">
            <div class="form-label">{{ key }}</div>
            <div class="form-value">
              <pre v-if="isComplexContent(value)">{{ value }}</pre>
              <span v-else>{{ value }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="column">
        <h2>检验结果</h2>

        <div class="validation-container">
          <div
            v-for="(result, index) in validationResults"
            :key="index"
            class="validation-item"
            :class="{ passed: result.passed, failed: !result.passed }"
          >
            <div class="validation-header">
              <span class="status-icon">{{ result.passed ? '✓' : '✗' }}</span>
              <span class="validation-name">{{ result.name }}</span>
            </div>
            <div class="validation-message">{{ result.message }}</div>
          </div>

          <div v-if="validationResults.length === 0" class="no-data">
            暂无检验数据
          </div>
        </div>

        <div class="ai-analysis-section">
          <h3>AI 深度分析</h3>
          <button @click="analyzeHardConstraints" :disabled="aiAnalysisLoading" class="analyze-btn">
            {{ aiAnalysisLoading ? '分析中...' : '调用 AI 分析硬约束' }}
          </button>

          <div v-if="aiAnalysisResult" class="ai-result">
            <pre>{{ aiAnalysisResult }}</pre>
          </div>

          <div v-if="aiAnalysisLoading" class="ai-loading">
            正在调用智谱AI进行分析，请稍候...
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  methods: {
    isComplexContent(value: string): boolean {
      return value.length > 100 || value.includes('\n') || value.includes('{')
    }
  }
}
</script>

<style scoped>
.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

h1 {
  text-align: center;
  margin-bottom: 30px;
}

h2 {
  font-size: 18px;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid #42b883;
}

.input-group {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

input {
  flex: 1;
  padding: 12px 16px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}

input:focus {
  border-color: #42b883;
}

input:disabled {
  background-color: #f5f5f5;
}

button {
  padding: 12px 24px;
  font-size: 16px;
  background-color: #42b883;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

button:hover:not(:disabled) {
  background-color: #33a06f;
}

button:disabled {
  background-color: #a0dcb8;
  cursor: not-allowed;
}

.error {
  padding: 12px 16px;
  background-color: #fee;
  color: #c00;
  border-radius: 8px;
  margin-bottom: 20px;
}

.content {
  display: flex;
  gap: 30px;
}

.column {
  flex: 1;
  min-width: 0;
}

.form-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: flex;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background-color: white;
}

.form-label {
  width: 180px;
  padding: 10px 12px;
  background-color: #f0f0f0;
  font-weight: 500;
  color: #333;
  flex-shrink: 0;
  border-right: 1px solid #e0e0e0;
  font-size: 14px;
}

.form-value {
  flex: 1;
  padding: 10px 12px;
  overflow-x: auto;
  min-height: 42px;
}

.form-value pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
}

.form-value span {
  word-break: break-word;
  font-size: 14px;
}

.validation-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.validation-item {
  background-color: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  border-left: 4px solid #999;
}

.validation-item.passed {
  border-left-color: #42b883;
  background-color: #f0fff4;
}

.validation-item.failed {
  border-left-color: #f56c6c;
  background-color: #fff0f0;
}

.validation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.status-icon {
  font-size: 16px;
  font-weight: bold;
}

.validation-item.passed .status-icon {
  color: #42b883;
}

.validation-item.failed .status-icon {
  color: #f56c6c;
}

.validation-name {
  font-weight: 500;
  color: #333;
  font-size: 14px;
}

.validation-message {
  font-size: 13px;
  color: #666;
  padding-left: 24px;
  word-break: break-word;
}

.no-data {
  padding: 20px;
  text-align: center;
  color: #999;
  background-color: #f9f9f9;
  border-radius: 8px;
}

.ai-analysis-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 2px dashed #ddd;
}

.ai-analysis-section h3 {
  font-size: 16px;
  margin-bottom: 12px;
  color: #333;
}

.analyze-btn {
  padding: 10px 20px;
  background-color: #4a9eff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.analyze-btn:hover:not(:disabled) {
  background-color: #3a8eef;
}

.analyze-btn:disabled {
  background-color: #a0c4ff;
  cursor: not-allowed;
}

.ai-result {
  margin-top: 16px;
  padding: 16px;
  background-color: #f5f7fa;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.ai-result pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #333;
}

.ai-loading {
  margin-top: 16px;
  padding: 16px;
  text-align: center;
  color: #666;
  background-color: #f5f7fa;
  border-radius: 8px;
  font-size: 14px;
}

@media (max-width: 1000px) {
  .content {
    flex-direction: column;
  }
}
</style>
