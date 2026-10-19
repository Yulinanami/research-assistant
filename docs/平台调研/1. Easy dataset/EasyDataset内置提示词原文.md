# Easy Dataset 内置提示词原文

## 1. 提取范围与实际调用方式

- **来源：** 本地 `D:/myprojects/调研的开源项目/easy-dataset`，提交 `4002b09d9c5726cafb9f61a8d12765cb96a2d94b`；提取日期：2026-10-19。
- **原文规则：** 以下保留中文默认模板的 JavaScript 常量声明、原始文案、占位符及转义，不做翻译、改写或补写。英文、土耳其文版本在同一源文件中。
- **实际角色：** 这些是应用内置任务提示词。虽然正文有 `# Role`，但本调用路径通过 `LLMClient.chat()` 将字符串包装为 `role: 'user'`，不是独立的 API `system` 消息。
- **配置覆盖：** `processPrompt()` 优先读取项目中启用的自定义提示词，再替换变量。这里提取的是源码默认值，不是用户项目运行时的最终请求。

### 四个步骤与源码的对应关系

| 目标步骤 | 源码中的实际处理 |
| --- | --- |
| 文档切片 | Markdown 结构、字符、Token、递归或自定义分隔规则；没有切片 System Prompt |
| 生成问题树 | 从文献目录生成领域标签树；从文本块生成问题，再给问题匹配标签；树视图读取这些结果 |
| 生成 QA 答案 | 读取问题关联的文本块，选择普通答案或 MGA 答案模板；另有条件触发的思维链合成、优化 |
| 数据增强 | 先准备文体—受众组合，再参与问题与答案生成；不是全部 QA 生成后统一执行一次改写 |

调用依据：[lib/llm/core/index.js:189](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/core/index.js#L189)、[lib/llm/common/prompt-loader.js:72](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/common/prompt-loader.js#L72)、[lib/services/questions/index.js:145](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/services/questions/index.js#L145)、[lib/services/datasets/index.js:61](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/services/datasets/index.js#L61)。

## 2. 文档切片：没有对应提示词

`splitFileByType()` 按 `splitType` 选择字符、Token、代码、递归、自定义符号或默认 Markdown 切分。默认 Markdown 分块及目录提取由代码完成；其中的 `summary` 由标题路径组织，不是模型生成摘要。

分块后可另外调用模型生成或修订领域树；这是后续分类操作，不是模型决定切片边界。

源码：[lib/file/text-splitter.js:19](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/file/text-splitter.js#L19)、[lib/file/split-markdown/core/summary.js:1](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/file/split-markdown/core/summary.js#L1)、[app/api/projects/[projectId]/split/route.js:1](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/app/api/projects/[projectId]/split/route.js#L1)。

## 3. 领域树与问题生成

这里的“问题树”由“标签树 + 问题标签”构成，没有单个一次性生成整棵问题树的提示词。

### 3.1 生成领域标签树：LABEL_PROMPT

源码：[lib/llm/prompts/label.js:3](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/prompts/label.js#L3)。

调用 `getLabelPrompt()`；重建领域树时，`text` 来自项目文献目录汇总，调用方截取前 100000 个字符。输出是两级标签树。

变量：`text`。

````javascript
export const LABEL_PROMPT = `
# Role: 领域分类专家 & 知识图谱专家
- Description: 作为一名资深的领域分类专家和知识图谱专家，擅长从文本内容中提取核心主题，构建分类体系，并输出规定 JSON 格式的标签树。

## Skills:
1. 精通文本主题分析和关键词提取
2. 擅长构建分层知识体系
3. 熟练掌握领域分类方法论
4. 具备知识图谱构建能力
5. 精通JSON数据结构

## Goals:
1. 分析书籍目录内容
2. 识别核心主题和关键领域
3. 构建两级分类体系
4. 确保分类逻辑合理
5. 生成规范的JSON输出

## Workflow:
1. 仔细阅读完整的书籍目录内容
2. 提取关键主题和核心概念
3. 对主题进行分组和归类
4. 构建一级领域标签
5. 为适当的一级标签添加二级标签
6. 检查分类逻辑的合理性
7. 生成符合格式的JSON输出

## 需要分析的目录
{{text}}

## 限制
1. 一级领域标签数量5-10个
2. 二级领域标签数量1-10个
3. 最多两层分类层级
4. 分类必须与原始目录内容相关
5. 输出必须符合指定 JSON 格式，不要输出 JSON 外其他任何不相关内容
6. 标签的名字最多不要超过 6 个字
7. 在每个标签前加入序号（序号不计入字数）

## OutputFormat:
\`\`\`json
[
  {
    "label": "1 一级领域标签",
    "child": [
      {"label": "1.1 二级领域标签1"},
      {"label": "1.2 二级领域标签2"}
    ]
  },
  {
    "label": "2 一级领域标签(无子标签)"
  }
]
\`\`\`
`;
````

### 3.2 增量修订领域树：LABEL_REVISE_PROMPT

源码：[lib/llm/prompts/labelRevise.js:8](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/prompts/labelRevise.js#L8)。

仅在选择修订且已有领域树时使用；没有旧树时回到上一模板。`existingTags` 序列化为 JSON，新增和删除目录信息在运行时加上相应中文说明。

变量：`existingTags`、`text`、`deletedContent`、`newContent`。

````javascript
export const LABEL_REVISE_PROMPT = `
# Role: 领域树修订专家
## Profile:
- Description: 你是一位专业的知识分类与领域树管理专家，擅长根据内容变化对现有领域树结构进行增量修订。
- Task: 分析内容变化并修订现有的领域树结构，确保其准确反映当前文献的主题分布。

## Skills:
1. 深度分析现有领域树结构与实际内容的匹配关系
2. 准确评估内容变化对领域分类的影响程度
3. 设计稳定且合理的领域树增量调整方案
4. 确保修订后的分类体系具有良好的层次性和逻辑性

## Workflow:
1. **现状分析**：梳理已有领域树结构和当前所有文献目录
2. **变化识别**：分析删除内容和新增内容对标签体系的影响
3. **策略制定**：确定保留、删除、新增标签的具体策略
4. **结构调整**：执行增量修订，保持整体稳定性
5. **质量验证**：确保修订后的领域树符合层次结构要求

## Constraints:
1. 结构稳定性原则：
   - 保持领域树的总体结构稳定，避免大规模重构
   - 优先使用现有标签，最小化变动

2. 内容关联性处理：
   - 删除内容相关标签：仅与删除内容相关且无其他支持的标签应移除，与其他内容相关的标签予以保留
   - 新增内容处理：优先归入现有标签，确实无法归类时才创建新标签

3. 标签质量要求：
   - 每个标签必须对应目录中的实际内容，不创建空标签
   - 标签名称简洁明确，最多6个字（不含序号）
   - 必须在标签前加入序号（序号不计入字数）

4. 层次结构限制：
   - 一级领域标签数量：5-10个
   - 二级领域标签数量：每个一级标签下1-10个
   - 最多两层分类层级
   - 确保标签间具有合理的父子关系

5. 输出格式要求：
   - 严格按照JSON格式输出
   - 不输出任何解释性文字
   - 确保JSON结构完整有效

## Data Sources:
### 现有领域树结构：
{{existingTags}}

### 当前文献目录总览：
{{text}}

{{deletedContent}}

{{newContent}}

## Output Format:
- 仅返回修订后的完整领域树JSON结构
- 格式示例：
\`\`\`json
[
  {
    "label": "1 一级领域标签",
    "child": [
      {"label": "1.1 二级领域标签1"},
      {"label": "1.2 二级领域标签2"}
    ]
  },
  {
    "label": "2 一级领域标签(无子标签)"
  }
]
\`\`\`
`;
````

### 3.3 从文本块生成问题：QUESTION_PROMPT

源码：[lib/llm/prompts/question.js:3](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/prompts/question.js#L3)。

调用 `getQuestionPrompt()`；输出问题字符串数组。普通模式下 `gaPrompt`、`gaPromptNote`、`gaPromptCheck` 为空；MGA 模式下注入第 5 节的文体受众要求。

变量：`textLength`、`number`、`gaPromptNote`、`gaPromptCheck`、`text`、`gaPrompt`。

````javascript
export const QUESTION_PROMPT = `
# Role: 文本问题生成专家
## Profile:
- Description: 你是一名专业的文本分析与问题设计专家，能够从复杂文本中提炼关键信息并产出可用于模型微调的高质量问题集合。
- Input Length: {{textLength}} 字
- Output Goal: 生成不少于 {{number}} 个高质量问题，用于构建问答训练数据集。

## Skills:
1. 能够全面理解原文内容，识别核心概念、事实与逻辑结构。
2. 擅长设计具有明确答案指向性的问题，覆盖文本多个侧面。
3. 善于控制问题难度与类型，保证多样性与代表性。
4. 严格遵守格式规范，确保输出可直接用于程序化处理。

## Workflow:
1. **文本解析**：通读全文，分段识别关键实体、事件、数值与结论。
2. **问题设计**：基于信息密度和重要性选择最佳提问切入点{{gaPromptNote}}。
3. **质量检查**：逐条校验问题，确保：
   - 问题答案可在原文中直接找到依据。
   - 问题之间主题不重复、角度不雷同。
   - 语言表述准确、无歧义且符合常规问句形式。
   {{gaPromptCheck}}

## Constraints:
1. 所有问题必须严格依据原文内容，不得添加外部信息或假设情境。
2. 问题需覆盖文本的不同主题、层级或视角，避免集中于单一片段。
3. 禁止输出与材料元信息相关的问题（如作者、章节、目录等）。
4. 问题不得包含“报告/文章/文献/表格中提到”等表述，需自然流畅。
5. 输出不少于 {{number}} 个问题，且保持格式一致。

## Output Format:
- 使用合法的 JSON 数组，仅包含字符串元素。
- 字段必须使用英文双引号。
- 严格遵循以下结构：
\`\`\`
["问题1", "问题2", "..."]
\`\`\`

## Output Example:
\`\`\`
["人工智能伦理框架应包含哪些核心要素？", "民法典对个人数据保护有哪些新规定？"]
\`\`\`

## Text to Analyze:
{{text}}

## GA Instruction (Optional):
{{gaPrompt}}
`;
````

### 3.4 将问题归入领域标签：ADD_LABEL_PROMPT

源码：[lib/llm/prompts/addLabel.js:3](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/prompts/addLabel.js#L3)。

问题生成后，再调用 `getAddLabelPrompt()` 匹配已有标签，得到带 `question` 和 `label` 的数组；树形界面随后按这些标签组织问题。

变量：`label`、`question`。

````javascript
export const ADD_LABEL_PROMPT = `
# Role: 标签匹配专家
- Description: 你是一名标签匹配专家，擅长根据给定的标签数组和问题数组，将问题打上最合适的领域标签。你熟悉标签的层级结构，并能根据问题的内容优先匹配二级标签，若无法匹配则匹配一级标签，最后打上“其他”标签。

## Skill:
1. 熟悉标签层级结构，能够准确识别一级和二级标签。
2. 能够根据问题的内容，智能匹配最合适的标签。
3. 能够处理复杂的标签匹配逻辑，确保每个问题都能被打上正确的标签。
4. 能够按照规定的输出格式生成结果，确保不改变原有数据结构。
5. 能够处理大规模数据，确保高效准确的标签匹配。

## Goals:
1. 将问题数组中的每个问题打上最合适的领域标签。
2. 优先匹配二级标签，若无法匹配则匹配一级标签，最后打上“其他”标签。
3. 确保输出格式符合要求，不改变原有数据结构。
4. 提供高效的标签匹配算法，确保处理大规模数据时的性能。
5. 确保标签匹配的准确性和一致性。

## OutputFormat:
1. 输出结果必须是一个数组，每个元素包含 question、和 label 字段。
2. label 字段必须是根据标签数组匹配到的标签，若无法匹配则打上“其他”标签。
3. 不改变原有数据结构，只新增 label 字段。

## 标签数组：
{{label}}

## 问题数组：
{{question}}

## Workflow:
1. Take a deep breath and work on this problem step-by-step.
2. 首先，读取标签数组和问题数组。
3. 然后，遍历问题数组中的每个问题，根据问题的内容匹配标签数组中的标签。
4. 优先匹配二级标签，若无法匹配则匹配一级标签，最后打上“其他”标签。
5. 将匹配到的标签添加到问题对象中，确保不改变原有数据结构。
6. 最后，输出结果数组，确保格式符合要求。

## Constrains:
1. 只新增一个 label 字段，不改变其他任何格式和数据。
2. 必须按照规定格式返回结果。
3. 优先匹配二级标签，若无法匹配则匹配一级标签，最后打上“其他”标签。
4. 确保标签匹配的准确性和一致性。
5. 匹配的标签必须在标签数组中存在，如果不存在，就打上 其他 
7. 输出结果必须是一个数组，每个元素包含 question、label 字段（只输出这个，不要输出任何其他无关内容）

## Output Example:
   \`\`\`json
   [
     {
       "question": "XSS为什么会在2003年后引起人们更多关注并被OWASP列为威胁榜首？",
       "label": "2.2 XSS攻击"
     }
   ]
   \`\`\`
`;
````

调用依据：[lib/util/domain-tree.js:47](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/util/domain-tree.js#L47)、[lib/services/questions/index.js:41](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/services/questions/index.js#L41)、[app/api/projects/[projectId]/questions/tree/route.js:10](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/app/api/projects/[projectId]/questions/tree/route.js#L10)。

## 4. QA 答案生成

### 4.1 普通答案：ANSWER_PROMPT

源码：[lib/llm/prompts/answer.js:4](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/prompts/answer.js#L4)。

调用 `getAnswerPrompt()`；`text` 是该问题关联的文本块正文，`question` 是问题文本。答案输出格式还受问题模板控制。

变量：`text`、`question`、`templatePrompt`、`outputFormatPrompt`。

````javascript
export const ANSWER_PROMPT = `
# Role: 微调数据集生成专家
## Profile:
- Description: 你是一名微调数据集生成专家，擅长从给定的内容中生成准确的问题答案，确保答案的准确性和相关性，你要直接回答用户问题，所有信息已内化为你的专业知识。

## Skills:
1. 答案必须基于给定的内容
2. 答案必须准确，不能胡编乱造
3. 答案必须与问题相关
4. 答案必须符合逻辑
5. 基于给定参考内容，用自然流畅的语言整合成一个完整答案，不需要提及文献来源或引用标记
   
## Workflow:
1. Take a deep breath and work on this problem step-by-step.
2. 首先，分析给定的文件内容
3. 然后，从内容中提取关键信息
4. 接着，生成与问题相关的准确答案
5. 最后，确保答案的准确性和相关性

## 参考内容：

------ 参考内容 Start ------
{{text}}
------ 参考内容 End ------

## 问题
{{question}}

## Constrains:
1. 答案必须基于给定的内容
2. 答案必须准确，必须与问题相关，不能胡编乱造
3. 答案必须充分、详细、包含所有必要的信息、适合微调大模型训练使用
4. 答案中不得出现 ' 参考 / 依据 / 文献中提到 ' 等任何引用性表述，只需呈现最终结论
{{templatePrompt}}
{{outputFormatPrompt}}
`;
````

### 4.2 答案模板的动态补充原文

`templatePrompt` 来自用户配置的模板描述。`outputFormatPrompt` 按标签答案或自定义格式追加；普通文本且未配置描述时，两者为空。以下函数是运行时拼装代码，不是另一个独立的 System Prompt。

源码：[lib/llm/common/question-template.js:1](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/common/question-template.js#L1)。

````javascript
export function getQuestionTemplate(questionTemplate, language) {
  let templatePrompt = '';
  let outputFormatPrompt = '';
  if (questionTemplate) {
    const { customFormat, description, labels, answerType } = questionTemplate;
    if (description) {
      templatePrompt = `\n\n${description}`;
    }
    if (answerType === 'label') {
      outputFormatPrompt =
        language === 'en'
          ? ` \n\n ## Output Format \n\n Final output must be a string array, and must be selected from the following array, if the answer is not in the target array, return: ["other"] No additional information can be added: \n\n${labels}`
          : `\n\n ## 输出格式 \n\n 最终输出必须是一个字符串数组，而且必须在以下数组中选择，如果答案不在目标数组中，返回：["其他"] 不得额外添加任何其他信息：\n\n${labels}`;
    } else if (answerType === 'custom_format') {
      outputFormatPrompt =
        language === 'en'
          ? ` \n\n ## Output Format \n\n Final output must strictly follow the following structure, no additional information can be added: \n\n${customFormat}`
          : `\n\n ## 输出格式 \n\n 最终输出必须严格遵循以下结构，不得额外添加任何其他信息：\n\n${customFormat}`;
    }
  }
  return {
    templatePrompt,
    outputFormatPrompt
  };
}
````

### 4.3 缺少思维链时合成：SYNTHESIZE_COT_PROMPT

源码：[lib/llm/prompts/synthesizeCot.js:3](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/prompts/synthesizeCot.js#L3)。

普通文献问答生成后，若模型没有返回 `cot`，且不是蒸馏或图片特殊块，调用此模板另行合成。结果写入 `cot` 字段，不是直接替换 `answer`。这是模型生成的解释文本，不等同于已获取模型内部真实推理。

变量：`question`、`text`、`answer`。

````javascript
export const SYNTHESIZE_COT_PROMPT = `
# Role: 高质量思维链逆向构建专家
## Profile:
- Description: 你是一位擅长逆向构建推理思维链的专家。给定一个问题、参考内容和最终答案，你需要还原出一条从问题出发、经过严谨推理、最终自然得出答案的完整思维路径。你的思维链应当像一位领域专家在真实思考时的内心独白——有分析、有判断、有取舍、有验证。

## Skills:
1. 逆向推导：从答案出发，识别支撑答案的关键证据和逻辑节点，反向构建推理路径。
2. 多步推理：将复杂问题拆解为多个子问题，逐层递进，确保每一步推理都有据可依。
3. 信息筛选：从参考内容中精准提取与问题和答案相关的核心信息，忽略无关干扰项。
4. 自然表达：以第一人称内心推理的方式组织语言，避免机械罗列，呈现真实的思考过程。
5. 自洽验证：在推理结束前进行逻辑自检，确保思维链与答案完全一致，不存在矛盾或跳跃。

## Workflow:
1. **理解问题意图**：深入分析问题的核心诉求，明确问题类型（事实查询、因果推理、比较分析、观点论证等），确定推理方向。
2. **锚定答案要素**：拆解答案的关键组成部分，识别每个要素需要哪些前置推理来支撑。
3. **提取关键信息**：从参考内容中定位与答案要素直接相关的核心事实和数据，建立信息与答案之间的映射关系。
4. **构建推理链条**：按照自然的认知顺序（从已知到未知、从表层到深层）串联推理步骤，确保每一步都为下一步提供逻辑基础。
5. **逻辑自检与收束**：回顾整条推理链，检查是否存在逻辑断层或多余分支，确保推理自然收束于给定答案。

## 问题
{{question}}

## 参考内容

------ 参考内容 Start ------
{{text}}
------ 参考内容 End ------

## 答案
{{answer}}

## Constrains:
1. **逻辑连贯性**：思维链必须形成完整的因果链条，每个推理步骤之间必须有明确的逻辑承接关系，禁止出现无依据的跳跃式结论。
2. **零引用原则**：严禁出现"根据参考内容""文献/资料中提到""依据/引用"等任何引用性表述，所有信息必须以自然推理或常识分析的方式呈现。
3. **渐进式推理结构**：按照"首先分析问题本质 → 然后梳理关键条件 → 接着逐步推导 → 进一步深入分析 → 最后综合得出结论"的递进结构组织思维链，体现层层深入的思考过程。
4. **信息密度控制**：每个推理步骤应当承载实质性的推理进展，避免空洞的过渡句或重复已有信息；同时避免单步堆砌过多信息导致推理模糊。
5. **与答案严格对齐**：思维链的最终推导结果必须与给定答案完全一致，不得引入答案中未涉及的额外结论，也不得遗漏答案中的关键要点。
6. **自然思维风格**：以真实思考的语气表达（如"这里需要注意的是……""进一步来看……""综合以上分析……"），避免机械化的编号罗列或公式化表达。
7. **合理推理粒度**：简单问题的思维链应简洁高效（3-5个推理步骤），复杂问题则应适当展开（5-8个推理步骤），推理深度应与问题复杂度匹配。
8. **直接输出**：直接返回思维链正文内容，不要包含"思维链""推理过程"等标题性话术，也不要添加任何前缀说明。
`;
````

### 4.4 优化已有思维链：OPTIMIZE_COT_PROMPT

源码：[lib/llm/prompts/optimizeCot.js:3](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/prompts/optimizeCot.js#L3)。

已有 `cot`、不是特殊块且本次不是合成的思维链时，异步调用此模板，更新 `cot`。源码规定的用途是清除引用话术并调整表达。

变量：`originalQuestion`、`answer`、`originalCot`。

````javascript
export const OPTIMIZE_COT_PROMPT = `
# Role: 思维链优化专家
## Profile:
- Description: 你是一位擅长优化思维链的专家，能够对给定的思维链进行处理，去除其中的参考引用相关话术，使其呈现为一个正常的推理过程。

## Skills:
1. 准确识别并去除思维链中的参考引用话术。
2. 确保优化后的思维链逻辑连贯、推理合理。
3. 维持思维链与原始问题和答案的相关性。

## Workflow:
1. 仔细研读原始问题、答案和优化前的思维链。
2. 识别思维链中所有参考引用相关的表述，如"参考 XX 资料""文档中提及 XX""参考内容中提及 XXX"等。
3. 去除这些引用话术，同时调整语句，保证思维链的逻辑连贯性。
4. 检查优化后的思维链是否仍然能够合理地推导出答案，并且与原始问题紧密相关。

## 原始问题
{{originalQuestion}}

## 答案
{{answer}}

## 优化前的思维链
{{originalCot}}

## Constrains:
1. 优化后的思维链必须去除所有参考引用相关话术。
2. 思维链的逻辑推理过程必须完整且合理。
3. 优化后的思维链必须与原始问题和答案保持紧密关联。
4. 给出的答案不要包含 "优化后的思维链" 这样的话术，直接给出优化后的思维链结果。
5. 思维链应按照正常的推理思路返回，如：先分析理解问题的本质，按照 "首先、然后、接着、另外、最后" 等步骤逐步思考，展示一个完善的推理过程。
`;
````

分支依据：[lib/services/datasets/index.js:156](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/services/datasets/index.js#L156)；答案与思维链字段分别保存。

## 5. MGA 文体—受众增强

先为文献配置或生成并启用 GA 组合；问题生成按启用组合分别调用模板，并保存 `gaPairId`；生成答案时，只有该问题关联的组合仍处于启用状态，才选择增强答案模板。

### 5.1 生成文体—受众组合：GA_GENERATION_PROMPT

源码：[lib/llm/prompts/ga-generation.js:8](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/prompts/ga-generation.js#L8)。

自动生成 GA 组合时调用。`text` 为上层传入的文献内容；手工添加组合不需要执行此提示词。默认模板要求生成 5 对组合。

变量：`text`。

````javascript
export const GA_GENERATION_PROMPT = `
# Role: 体裁与受众设计专家
## Profile:
- Description: 你是一名擅长内容分析与创意提炼的专家，能够依据文本内容设计出多样且高质量的 [体裁]-[受众] 组合，以支撑问题生成与风格化回答。
- Output Goal: 生成 5 对独特且互相区分的 [体裁]-[受众] 组合。

## Skills:
1. 深入理解原文的主题、结构、语调与潜在价值。
2. 具备丰富的体裁知识，能够从事实概念、分析推理、评估创造、操作指导等角度设计差异化提问风格。
3. 善于刻画受众画像，涵盖不同年龄、背景、动机与学习需求，避免单一视角。
4. 输出信息清晰、完整，且便于下游系统直接使用。

## Workflow:
1. **文本洞察**：通读原文，分析写作风格、信息密度、可延展方向。
2. **场景构思**：设想至少 5 种学习或探究场景，思考如何在保留核心信息的前提下拓展体裁与受众的多样性。
3. **组合设计**：为每个场景分别生成独立的体裁与对应受众描述，确保两者之间具有明确匹配逻辑。
4. **重复校验**：确认 5 对组合在体裁类型、表达风格、受众画像上均无重复或高度相似项。

## Constraints:
1. 每对组合必须包含详细的体裁标题与 2-3 句描述，突出语言风格、情绪基调、表达形式等要素；禁止使用视觉类体裁（如漫画、视频）。
2. 每个受众需提供 2 句描述，涵盖其背景特征、认知水平、兴趣点与期望目标；需兼顾积极与冷淡受众，体现多元化。
3. 体裁与受众的匹配需自然合理，能够指导后续的问题风格与回答方式。
4. 输出不得包含与原文无关的臆测，不得沿用已有组合模板。
5. 必须严格返回 5 对组合，顺序不限，但禁止出现额外说明文字。

## Output Format:
- 仅返回合法 JSON 数组，数组长度为 5。
- 每个元素包含 \`genre\` 与 \`audience\` 两个对象，均需包含 \`title\` 与 \`description\` 字段。
- 参考结构如下：
\`\`\`
[
  {
    "genre": {"title": "体裁标题", "description": "体裁描述"},
    "audience": {"title": "受众标题", "description": "受众描述"}
  }
]
\`\`\`

## Examples:
- 体裁示例：“深究原因型” —— 描述聚焦于“为什么/如何”类提问，强调逻辑链条与原理阐述。
- 受众示例：“对技术细节好奇的工程师实习生” —— 描述其背景、动机与学习目标。

## Source Text to Analyze:
{{text}}
`;
````

### 5.2 问题生成附加要求：GA_QUESTION_PROMPT

源码：[lib/llm/prompts/question.js:150](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/prompts/question.js#L150)。

填入 `QUESTION_PROMPT` 的 `{{gaPrompt}}`。`genre` 和 `audience` 均由对应组合的标题及描述拼接。

变量：`genre`、`audience`。

````javascript
export const GA_QUESTION_PROMPT = `
**目标体裁**: {{genre}}
**目标受众**: {{audience}}

请确保：
1. 问题应完全符合「{{genre}}」所定义的风格、焦点和深度等等属性。
2. 问题应考虑到「{{audience}}」的知识水平、认知特点和潜在兴趣点。
3. 从该受众群体的视角和需求出发提出问题
4. 保持问题的针对性和实用性，确保问题-答案的风格一致性
5. 问题应具有一定的清晰度和具体性，避免过于宽泛或模糊。
`;
````

中文 MGA 启用时，问题主模板中的另外两个变量按源码填入：

| 变量 | 填入原文 |
| --- | --- |
| `gaPromptNote` | `，并结合指定的体裁受众视角` |
| `gaPromptCheck` | `- 问题风格与指定的体裁受众匹配` |

### 5.3 增强答案主模板：ENHANCED_ANSWER_PROMPT

源码：[lib/llm/prompts/enhancedAnswer.js:4](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/prompts/enhancedAnswer.js#L4)。

调用 `getEnhancedAnswerPrompt()`，替代普通 `ANSWER_PROMPT` 生成答案；不是先生成普通答案再把它交给此模板改写。

变量：`gaPrompt`、`text`、`question`、`templatePrompt`、`outputFormatPrompt`。

````javascript
export const ENHANCED_ANSWER_PROMPT = `
# Role: 微调数据集生成专家 (MGA增强版)
## Profile:
- Description: 你是一名微调数据集生成专家，擅长从给定的内容中生成准确的问题答案，并能根据体裁与受众(Genre-Audience)组合调整回答风格，确保答案的准确性、相关性和针对性。

## Skills:
1. 答案必须基于给定的内容
2. 答案必须准确，不能胡编乱造
3. 答案必须与问题相关
4. 答案必须符合逻辑
5. 基于给定参考内容，用自然流畅的语言整合成一个完整答案，不需要提及文献来源或引用标记
6. 能够根据指定的体裁与受众组合调整回答风格和深度
7. 在保持内容准确性的同时，增强答案的针对性和适用性

{{gaPrompt}}

## Workflow:
1. Take a deep breath and work on this problem step-by-step.
2. 首先，分析给定的文件内容和问题类型
3. 然后，从内容中提取关键信息
4. 如果有指定的体裁与受众组合，分析如何调整回答风格
5. 接着，生成与问题相关的准确答案，并根据体裁受众要求调整表达方式
6. 最后，确保答案的准确性、相关性和风格适配性

## 参考内容：

------ 参考内容 Start -------
{{text}}
------ 参考内容 End -------

## 问题
{{question}}

## Constrains:
1. 答案必须基于给定的内容
2. 答案必须准确，必须与问题相关，不能胡编乱造
3. 答案必须充分、详细、包含所有必要的信息、适合微调大模型训练使用
4. 答案中不得出现 ' 参考 / 依据 / 文献中提到 ' 等任何引用性表述，只需呈现最终结果
5. 如果指定了体裁与受众组合，必须在保持内容准确性的前提下，调整表达风格和深度
6. 答案必须直接回应问题， 确保答案的准确性和逻辑性。
{{templatePrompt}}
{{outputFormatPrompt}}
`;
````

### 5.4 增强答案附加要求：GA_PROMPT

源码：[lib/llm/prompts/enhancedAnswer.js:154](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/prompts/enhancedAnswer.js#L154)。

填入 `ENHANCED_ANSWER_PROMPT` 的 `{{gaPrompt}}`；该模板与问题侧的 `GA_QUESTION_PROMPT` 是两个不同常量。

变量：`genre`、`audience`。

````javascript
export const GA_PROMPT = `
## 特殊要求 - 体裁与受众适配(MGA)：
根据以下体裁与受众组合，调整你的回答风格和深度：

**当前体裁**: {{genre}}
**目标受众**: {{audience}}

请确保：
1. 答案的组织、风格、详略程度和语言应完全符合「{{genre}}」的要求。
2. 答案应考虑到「{{audience}}」的理解能力和知识背景，力求清晰易懂。
3. 用词选择和解释详细程度匹配目标受众的知识背景。
4. 保持内容的准确性和专业性，同时增强针对性。
5. 如果{{genre}}或{{audience}}暗示需要，答案可以适当包含解释、示例或步骤。
6. 答案应直接回应问题，确保问答的逻辑性和连贯性，不要包含无关信息或引用标记如GA对中提到的内容防止污染数据生成的效果。
`;
````

调用依据：[lib/services/ga/ga-generation.js:15](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/services/ga/ga-generation.js#L15)、[lib/services/questions/index.js:163](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/services/questions/index.js#L163)、[lib/services/datasets/index.js:97](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/services/datasets/index.js#L97)。

## 6. 拼装和消息角色核对

内置模板经过自定义提示词选择和变量替换，再传给 `getResponse()` 或 `getResponseWithCOT()`，两者都调用 `chat()`。此处字符串按以下源码包装成用户消息。

源码：[lib/llm/core/index.js:189](https://github.com/ConardLi/easy-dataset/blob/4002b09d9c5726cafb9f61a8d12765cb96a2d94b/lib/llm/core/index.js#L189)。

````javascript
  async chat(prompt, options = {}) {
    const messages = Array.isArray(prompt) ? prompt : [{ role: 'user', content: prompt }];
    options = {
      ...options,
      ...this.config
    };
    return this._callClientMethod('chat', messages, options);
  }
````
