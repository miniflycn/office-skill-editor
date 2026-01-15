# Skill Evaluation System

基于 Vue 3 + TypeScript + Vite 构建的技能评估系统，用于评估和验证 AI 技能的 Rubrics（评分标准）。

## 功能特性

### 核心功能

- **用户 Query 管理**: 输入和编辑会触发特定技能的用户查询
- **技能选择**: 支持多种文档处理技能
  - PPTX (PowerPoint 演示文稿)
  - PDF (PDF 文档)
  - XLSX (Excel 电子表格)
  - DOCX (Word 文档)
- **PE 编辑器**: 编写和修改 Prompt Engineering 内容
- **Rubrics 编辑器**: 使用 Monaco Editor 进行 JSON 格式的 Rubrics 编辑
  - 支持 JSON 语法高亮和格式化
  - 实时验证 JSON 格式
  - 支持硬约束和软约束的配置

### 验证检查

系统提供 10 项自动化验证检查：

1. **用户 Query AI 检测**: 检测 Query 是否由 AI 生成
2. **必填字段完整性**: 检查所有必填字段是否已填写
3. **行数对比**: 对比 AI 生成的原始 Rubrics 与调整后 Rubrics 的行数差异
4. **硬约束数量**: 验证硬约束数量是否大于 3
5. **硬约束格式**: 检查硬约束是否只包含 0 分情况和 1 分情况
6. **相关事实与数据源**: 验证需要相关事实的硬约束是否配置了正确的数据源
7. **软约束区间**: 验证软约束的评分区间配置是否正确
8. **4 分区间配置**: 检查"是否需要 4 分区间"配置是否合理
9. **Query 附件类型与技能匹配**: 验证 Query 中提到的附件类型与选定技能是否匹配
10. **技能链接在 PE 中**: 检查使用的技能是否在 PE 中包含对应的 Skill 链接

### AI 集成

- **智谱 AI 集成**: 使用智谱 AI API 进行智能分析
  - 硬约束分析
  - 软约束和可选约束分析
  - 流式响应支持
  - Markdown 格式渲染

### 差异对比

- **Rubrics 差异对比**: 可视化对比原始 Rubrics 和调整后 Rubrics 的差异
  - 显示新增和删除的行数
  - 差异占比计算
  - 差异详情模态框展示

## 技术栈

### 核心框架
- **Vue 3**: 使用 Composition API 和 `<script setup>` 语法
- **TypeScript**: 提供类型安全
- **Vite**: 快速的构建工具

### 主要依赖
- **@guolao/vue-monaco-editor**: Monaco Editor 的 Vue 封装，用于代码编辑
- **monaco-editor**: Microsoft 的代码编辑器
- **diff**: 用于文本差异对比
- **marked**: Markdown 渲染器

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## 项目结构

```
skill/
├── public/                 # 静态资源
├── src/
│   ├── assets/            # 资源文件
│   ├── components/        # Vue 组件
│   │   ├── HelloWorld.vue               # 示例组件
│   │   └── SkillEvaluationForm.vue     # 技能评估表单组件
│   ├── mock/              # 模拟数据
│   │   └── api.json       # API 模拟数据
│   ├── App.vue            # 根组件
│   ├── main.ts            # 应用入口
│   ├── style.css          # 全局样式
│   └── vite-env.d.ts      # Vite 类型声明
├── index.html             # HTML 模板
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript 配置
├── vite.config.ts         # Vite 配置
└── README.md              # 项目文档
```

## 推荐的 IDE 设置

- [VS Code](https://code.visualstudio.com/)
- [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (禁用 Vetur)
- [TypeScript Vue Plugin (Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin)

### TypeScript 对 `.vue` 导入的类型支持

TypeScript 默认无法处理 `.vue` 导入的类型信息，因此我们使用 `vue-tsc` 替代 `tsc` CLI 进行类型检查。在编辑器中，需要 [TypeScript Vue Plugin (Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin) 使 TypeScript 语言服务感知 `.vue` 类型。

如果独立的 TypeScript 插件感觉不够快，Volar 还实现了性能更好的 [接管模式](https://github.com/johnsoncodehk/volar/discussions/471#discussioncomment-1361669)。可以通过以下步骤启用：

1. 禁用内置的 TypeScript 扩展
   1. 从 VSCode 的命令面板运行 `Extensions: Show Built-in Extensions`
   2. 找到 `TypeScript and JavaScript Language Features`，右键并选择 `Disable (Workspace)`
2. 通过从命令面板运行 `Developer: Reload Window` 来重新加载 VSCode 窗口。

## API 配置

项目使用智谱 AI API 进行智能分析，需要在代码中配置 API Key：

```typescript
const API_KEY = 'your-api-key-here'
const ZHIPU_API_BASE = 'https://open.bigmodel.cn/api/paas/v4/'
```

## 许可证

MIT
