# Data-Juicer 开源知识数据加工平台调研报告

## 3.1.1 基本信息

| 项目 | 内容 |
| --- | --- |
| 平台名称 | Data-Juicer |
| 主页/仓库地址 | [当前官方仓库](https://github.com/datajuicer/data-juicer)；[官方中文文档](https://datajuicer.github.io/data-juicer/zh_CN/main/index_ZH.html)。 |
| 开发方/维护方 | 阿里巴巴通义实验室 |
| 开源协议 | **Apache-2.0** |
| GitHub Stars | 7.2k |
| 首次发布时间 | 仓库创建于 **2023-08-01**；最早正式 Release 为 **v0.1.0，2023-08-11**。 |
| 最近更新时间 | 默认分支最近提交为 **2026-10-12**；最新 Release 为 v1.6.0，2026-09-09。 |
| 开发语言 | 主要为 Python，部分去重加速实现包含 C++/Cython。 |
| 部署方式 | Python 包/源码安装、CLI、Python API、Docker。 |
| 维护活跃度 | **高（近期开发维护）2026-07-13 至调研日，HEAD 可达历史中有 **71 次提交。 |

## 3.1.2 功能清单与功能说明

| 序号 | 功能模块 | 功能说明 | 对应本项目功能 |
| --- | --- | --- | --- |
| 1 | 数据加载与多源混合 | 支持本地 JSON/JSONL、CSV/TSV、Parquet、文本等输入，并有 Hugging Face、S3、HDFS 等加载实现。默认执行器可按设定比例从多个数据源抽样混合，或全量拼接；Ray 模式的数据源与格式支持需按对应策略确认。ModelScope、arXiv、Wiki、CommonCrawl 的直接远程加载类只有接口定义，尚未实现加载逻辑，不能仅凭注册名称认定可用。[C6] | 部分对应—资料/条目采集（022、023）、来源规划（021）。未发现 MySQL 字段选择和实时采集入口（024）。 |
| 2 | PDF/DOCX 文本提取 | `TextFormatter` 可读取 PDF/DOCX：DOCX 使用 `python-docx` 提取非空段落；PDF 使用 `pdfplumber`，当前实现先移除识别到的表格区域，再提取页面文本并处理页尾页码。结果转为普通文本，不是复杂版面还原。[C7] | 部分对应—文档资料采集、PDF/WORD 解析（022、029、030、032）。不覆盖扫描 OCR、表格结构化、公式 LaTeX、图片独立提取及 Word 样式完整解析。 |
| 3 | 处理规则与执行顺序配置 | 通过 YAML 配置数据源、导出位置和 `process` 中各处理步骤的执行顺序；算子按职责分为映射、过滤、去重、分组、聚合、选择和数据集级管道等，加载/格式化另有 Formatter。可通过 CLI 或 Python 调用。[C8] | 对应—可配置加工流程；部分对应—清洗流程、规范步骤索引、智能能力支持（006、011、012），不包含业务需求审批和版本发布步骤。 |
| 4 | 文本规范化与噪声处理 | 有空白、Unicode、标点规范化，HTML/链接/版权内容清理，重复句移除、中英文增强与繁简转换等具体算子；可以选择需要的规则，而非所有数据必须依赖 LLM 清洗。[C9] | 对应—文本格式标准化、内容清洗（028）；部分对应—语料管理（026）。农业术语和单位规则需另行配置或扩展。 |
| 5 | 文档精确与近重复去重 | `document_deduplicator` 对文本计算 MD5 后保留唯一条目；`document_minhash_deduplicator` 使用 MinHash-LSH 检测近重复，配置分词方式、窗口、相似阈值等；另有 SimHash 和 Ray 去重实现。[C10]、[C11] | 对应—文本数据清洗—文档去重（028）。近重复是算法判断，不能保证农业实验数值不同的资料绝不被误删。 |
| 6 | 跨文档重复行清理 | `document_line_deduplicator` 统计同一行出现于多少个不同文档，超过设定频率后清除；可跳过短行、Markdown 标题、LaTeX 环境等，适用于页脚、版权、网页导航等样板内容。[C12] | 对应—文本清洗—去除重复与模板噪声（028）。对多篇资料共同出现的有效说明仍需选择合适阈值。 |
| 7 | 规则脱敏与残留敏感信息检测 | `pii_redaction_mapper` 可配置替换邮箱、路径、密钥、手机号、身份证格式、用户/请求标识、IP 等；支持文本及部分嵌套对话字段和自定义模式。另有邮箱/IP 清理及 `pii_llm_suspect_mapper` 对残留敏感内容作模型检查。[C13] | 对应—语料脱敏、隐私脱敏（026、028）；部分对应—安全需求。规则与模型检测不等于已保证完整识别所有敏感信息。 |
| 8 | 文本质量规则过滤 | 有长度、词数、Token 数、重复字符/词、特殊字符、语言识别、停用词、标记词等过滤器；通常先计算统计指标，再根据上下限决定是否保留。[C14] | 对应—文本质量过滤、语料统计（028、027）；可作为质量要求（015）的执行组件。 |
| 9 | 模型质量评分与语义条件过滤 | `llm_quality_score_filter` 等对内容质量、准确性、语法、信息量、一致性等进行评分并过滤；`llm_condition_filter` 根据用户自然语言条件判断保留与否，可设置模型、知识依据及提示策略。[C15] | 部分对应—内容质量检查、智能审核（015、012、038）；模型给出的评分不是农业事实已经被验证。 |
| 10 | 字段校验与结构化规则 | 数据校验器可检查必需字段、字段类型和对话格式；`general_field_filter` 支持字段条件、逻辑组合，`specified_numeric_field_filter` 支持指定数值区间。可用于构造业务规则，但不自带土壤数据字典或单位转换标准。[C16] | 部分对应—质量要求、数据字典和土壤清洗流程（015、005、006）。提供执行机制，不等于提供农业规范。 |
| 11 | 文本切分与知识片段 | `text_chunk_mapper` 按长度、正则分隔和重叠范围分块，可用 tokenizer 计算长度；拆分时复制其它样本字段，便于传递来源元数据。没有自动建立论文页码/坐标级溯源的完整流程。[C17] | 对应—知识片段生成（033）的切分能力；来源标题等需要输入字段与加工配置共同保障。 |
| 12 | 文本生成 QA | `generate_qa_from_text_mapper` 调用本地 Hugging Face/vLLM 模型，解析模型输出的问题与答案，并保留输入字段、增加 query/response 字段；可控制生成数量和解析格式。[C18] | 对应—文本问答对提取（034）的生成环节；部分对应—自动标注（036），不含完整人工审核与成果发布界面。 |
| 13 | 根据已有问答生成新问答并优化 | `generate_qa_from_examples_mapper` 根据已有问答示例生成新 QA，使用 ROUGE-L 相关阈值检查与原有示例的相似程度；另有 query/response/QA 的优化和校准算子。示例格式、模型与提示词需要配置。[C19] | 对应—SFT 问答对增强（035）；需要实际核验模型是否改动了农业术语、数据或结论。 |
| 14 | 提取指定信息并自动标注 | `llm_extract_mapper` 根据指定输入字段和目标字段结构提取信息，保存为元数据；还有主题、情感、意图、实体关系等算子。目标字段结构是本次任务的字段定义，不是全平台的数据字典。[C20] | 部分对应—知识提取、智能标注（012、036）；可辅助科研资料的信息抽取。 |
| 15 | 图片描述与多模态生成 | `image_captioning_mapper` 生成图片描述，可配置提示词、候选数量和保留策略；视觉标签和多模态模型算子可产生标签或文本输出。图片问答需按输入字段、模型和模板组合构造，未发现统一的图片 QA 人工工作台。[C21] | 对应—图片描述生成；部分对应—图片问答与图像标注（037）。科研图表的数值理解和专业描述准确率未验证。 |
| 16 | 多模态过滤、转换与去重 | 图片有尺寸/比例、图文相似度、审美/水印、人脸等处理；音视频有时长、分辨率、帧提取、场景拆分、字幕/描述、音频相关算子；还有图片/视频去重和人脸模糊等能力，通常依赖相应模型和媒体库。[C9]、[C14] | 部分对应—图片语料加工（037）；音视频等多模态加工没有完整独立对应需求，可供后续扩展时参考。 |
| 17 | 数据统计与质量分析 | 本地 Analyzer 计算质量统计量、总体统计、逐列分布和相关性，支持采样分析；RayAnalyzer 分布式计算总体指标，不能直接视为具有本地分析器全部分布图、分位数和相关性功能。[C22] | 对应—语料统计和质量评价（027、015）；部分对应—关键指标展示（007），业务数据集/标注任务运营指标需上层汇总。 |
| 18 | 可视化阈值调优 | Streamlit Playground 解析配置、运行分析/处理、展示前后统计；用滑块调整 Filter 阈值，显示丢弃比例及保留/丢弃样本，支持数据下载。该工具用于试运行配置和查看效果，没有提供按角色划分的业务工作台。[C4] | 可借鉴—清洗结果预览和质量阈值调整（025、028）；不覆盖数据集申请和多角色工作台。 |
| 19 | 样本加工追踪 | Tracer 可记录 Mapper 修改前后内容、Filter 丢弃样本、Deduplicator 重复样本对，并可带上 sample_id/source_file 等字段。由开关和每算子采样数量控制；默认有限样本追踪，不是自动保存全量变更历史。[C23] | 部分对应—质量审核和加工追溯（038）；不能替代全部操作审计或正式数据集版本（039）。 |
| 20 | 单机与 Ray 分布式执行 | 默认执行器使用本地数据集与多进程，Ray/Ray 分区执行器面向集群；具备算子融合、资源参数、分区处理、自适应执行等工程机制。普通算子与 Ray 专用去重器需要匹配执行模式。[C8]、[C24] | 对应—批量加工（028）；为长任务执行提供基础支持。处理速度、并发和资源消耗未在本项目环境测量。 |
| 21 | 缓存、检查点与作业状态 | 数据指纹缓存减少重复计算；检查点按阶段/分区保存中间数据，用于失败恢复。作业事件、DAG、快照和日志帮助观察进度与处理状态，另有停止作业的工具。恢复行为依赖模式和配置。[C25] | 对应—长任务日志与执行过程管理；部分对应—可靠性与恢复。检查点不是业务版本切换、审核发布和下载权限。 |
| 22 | 数据导出与训练格式转换 | 默认导出器支持 JSONL/JSON/Parquet、分片、并行写入及统计/哈希保留选项；Ray 有其它输出格式和远程存储路径。`tools/fmt_conversion` 提供 Alpaca、Messages、ShareGPT 等格式转换脚本。[C26] | 部分对应—数据共享和标准化输出（041、043）；有加工结果输出，不含数据集目录、下载申请或自动封装受控业务 API。 |
| 23 | Python 扩展、Service API 与 MCP | 可通过 Python 类/函数、`python_file_mapper` 等扩展逻辑；第三方包可通过 `data_juicer.ops` entry points 注册插件。FastAPI 服务暴露选定类/函数处理方法，MCP 提供算子搜索、处理配置执行和数据分析等工具。[C27]、[C32] | 对应—自定义清洗扩展（028）；部分对应—API 服务（043）、智能能力支持（012）。内部处理接口不等于带访问控制、限流、审计的数据集服务自动发布。 |
| 24 | 外部人工标注衔接 | Annotation Mapper 可连接 Label Studio 创建任务、等待/读取标注结果；`human_preference_annotation_mapper` 将成对答案交给人工选择，回填 chosen/rejected。依赖独立 Label Studio 服务及连接配置。[C28] | 部分对应—人工标注、审核（036、038）。人工工作台、账号和协作机制来自外部标注系统，不能全归为 DJ 内置功能。 |
| 25 | 训练与模型评价工具 | `tools/evaluator` 提供基于 HELM/OpenAI 的训练检查点评测与记录工具，另有质量分类器和多模态评价工具。需要配套训练模型、第三方评测依赖和数据，不是上传评测集即可完成全部模型比选的统一页面。[C29] | 部分对应—模型评测（040）；数据质量评分与最终模型能力评价应分别判断。 |

**典型使用流程：** 准备带来源信息的数据 → 分析质量分布 → 选择规范化、脱敏、过滤和去重算子 → 形成 YAML 处理配置 → 在小样本上检查修改与丢弃情况 → 批量执行 → 记录统计/追踪信息 → 导出或继续生成 QA/交给标注工具。这是从代码和文档整理的流程，本次未实际运行。

**需要特别区分的能力边界：**

- **PDF/DOCX 基础提取与专业解析：** 当前 PDF 文本入口会排除检测到的表格；DOCX 读取正文段落，没有完整提取表格、嵌入图片、公式与样式的流程。没有发现 `.xls/.xlsx` 多工作表解析入口。它不能独立覆盖本项目 REQ-SJZS-029–032 的全部要求。
- **规则组件与农业业务标准：** 数值过滤、字段格式校验和自定义算子能执行部分标准规则，但土壤字段、单位、有效范围、样本采集条件及清洗规则需要项目方给定。
- **清洗时避免误删原始信息：** 精确去重的 `ignore_non_character` 默认关闭；若主动开启，会忽略数字和标点，可能把仅实验数值不同的文本当作重复。科研语料应核查此类配置，不能只比较删除率。[C10]
- **可恢复作业与数据集版本：** 处理配置可以通过 Git 管理，检查点可以帮助继续未完成的任务；二者都不等于原始文档/QA 数据集的业务版本、发布版本和历史审阅。
- **业务平台与外部工具：** Label Studio、PAI、Juicer 模型、Copilot 和 hub 处理配置是独立服务或资源。主仓库中的接入能力不代表这些资源已经随默认安装完整部署。
- **数据源名称与可用实现：** 注册表中的部分远程来源执行时会抛出 `NotImplementedError`。例如 arXiv 原始资料可先使用预处理工具转为 JSONL，但这不同于直接使用 arXiv 远程加载策略。[C6]

## 3.1.3 优势功能分析

### 优势功能1：用具体算子组合可复用的清洗流程

- **功能描述：** 将去噪、规范化、质量过滤、精确/近重复去重、脱敏等功能拆成可独立配置的处理步骤，按 YAML 顺序组织为可以重复使用的处理配置。可以先运行规则，需要根据内容含义作判断时再接入模型。
- **技术实现：** Mapper 修改样本，Filter 计算指标并作保留判断，Deduplicator 处理重复数据，Selector 等负责选择与组织；注册机制与执行器按配置加载和运行算子。MD5、MinHash-LSH、规则替换和 LLM 处理具有不同用途，均有具体实现。[C8]、[C10]、[C11]、[C13]
- **差异化价值：** 相比仅依赖一个清洗提示词，能明确记录用了哪些规则、阈值与顺序，也能组合模型处理和无需模型的步骤。通用算子不直接给出农业标准，但方便把经过业务确认的规则固定下来。
- **可借鉴方向：** 本项目可把常用清洗动作呈现为可配置步骤，后台使用 DJ 处理配置或算子执行。例如农业文献可组织为格式规范化、脱敏、重复检测与质量过滤；土壤结构化数据则需要单独定义字段和单位规则。具体配置仍应先用小样本检查原始信息是否保留。

### 优势功能2：通过质量分析与追踪解释清洗结果

- **功能描述：** 清洗前先了解长度、语言、重复率、模型评分等统计分布，再调整阈值；清洗后观察保留/丢弃比例、样本变化和重复样本对，帮助判断是否误删有效资料。
- **技术实现：** Analyzer 复用过滤器的统计计算能力，生成统计表和分布/相关性结果；Streamlit 调用分析与处理流程，展示阈值效果；Tracer 按配置抽取修改前后或被删除样本。RayAnalyzer 面向大规模总体汇总，本地分析器适合详细可视化。[C22]、[C4]、[C23]
- **差异化价值：** 能从“过滤掉多少”继续追查“哪些数据被改动或过滤”，有助于针对专业语料调整参数。追踪受采样配置限制，不能只凭展示的少量样本判断全部数据的质量。
- **可借鉴方向：** 本项目可参考加工前后指标对比、规则阈值调整、丢弃样本抽查与来源字段保留。农业数据的质量结果应结合专业核验，而非仅依据通用长度或质量分决定可用性。

### 优势功能3：为批量任务提供扩展、复用与恢复机制

- **功能描述：** 同一处理框架覆盖单机多进程与 Ray 集群；缓存复用已计算步骤，分区与检查点帮助长任务在失败后恢复，作业日志与快照用于观察过程。
- **技术实现：** 默认与 Ray 执行器封装不同的数据执行方式，Ray 专用去重器处理分布式重复检测；配置控制分区、检查点和资源参数，根据输入数据、处理步骤和函数计算标识，用于查找可复用的缓存。算子融合与自适应执行用于减少重复工作及调整批处理。[C24]、[C25]
- **差异化价值：** 比只提供若干独立处理脚本，更适合在加工量增长时保持统一规则，并减少长任务失败后的重复计算。不同执行器和算子仍有兼容边界，官方大集群案例不能直接推算本项目服务器性能。
- **可借鉴方向：** 可作为本项目批量加工的后台引擎候选，先验证常用算子和资料规模，再评估是否需要分布式执行。业务界面需要另外呈现任务状态、输出位置、错误和恢复结果，数据成果发布仍遵循本项目管理流程。

## 3.1.4 技术架构概述

- **整体架构：** Python 处理框架为主体：配置解析 → DatasetBuilder/Formatter 加载并组织数据 → 执行器运行算子 → Analyzer/Tracer 观察统计与变化 → Exporter 导出。Streamlit、FastAPI 和 MCP 是可选入口；核心业务不依赖一个内置的用户/数据集管理数据库。
- **核心依赖：** 数据组织依赖 Hugging Face Datasets、Arrow 相关能力，配合 Pandas、NumPy、jsonargparse 和 Pydantic；单机使用多进程，分布式主要依赖 Ray。PyTorch、Transformers、vLLM、图像/音视频处理库及模型作为相应算子的可选依赖。当前 `pyproject.toml` 将 generic、vision、nlp、audio、distributed、ai_services、tools 等依赖分组，并支持按需安装。[C1]
- **模型支持：** `model_utils.py` 封装 Hugging Face、本地 vLLM、OpenAI 兼容 API、LiteLLM 等模型调用。接口和提示可按算子配置；不是所有生成算子都同时支持所有后端，例如文本 QA 专用算子主要使用本地 HF/vLLM。规则算子可不调用 LLM，模型类算子的权重、硬件与接口需另外准备。[C18]、[C19]、[C30]
- **扩展机制：** 提供 Python API、算子继承/注册、处理配置、自定义 Python 处理函数和第三方 entry-point 插件；可由上层通过 Service API 或 MCP 调用。插件和函数扩展适合实现农业数据处理规则，但没有提供完整的可视化审核工作台。[C27]

**私有部署与工程边界：** 规则算子和本地模型可以在本地数据流程中执行；远程模型、远程数据源、PAI 或外部标注平台则涉及对应服务，是否完全离线取决于配置、依赖和权重准备。官方默认 Docker 环境集成 CUDA 与广泛媒体/模型依赖，单机规则加工不必据此认为也必须使用全部 GPU 组件。

**Juicer 模型与框架的关系：** 官方另提供用于清洗和整理数据的 Juicer 模型，可按自然语言任务进行处理；模型权重、推理服务和 Playground 需要另外部署，文档中的 Playground 位于 `data-juicer-hub`。不能把模型介绍或外部演示能力写成主框架安装后即可使用的功能。[Juicer 文档][C31]

官方资料有大规模 Ray 处理和去重案例，本次仅确认对应实现与文档存在，没有复现其服务器、数据规模和性能指标；不据此声称满足本项目的响应时间、并发、可用性或信创验收要求。

## 3.1.6 与本项目的关系

### 可直接集成的能力

优先候选是 REQ-SJZS-028 的格式规范化、质量过滤、文档去重、隐私脱敏和批量执行，以及 REQ-SJZS-033 的文本切分、034 的 QA 生成、035 的基于已有问答扩充数据。数据统计、加工追踪和分片输出也可作为后台组件。

实际接入可使用 Python API，或在独立处理环境中由本项目调用服务；这里给出的是组件边界，不是已经完成集成的承诺。需由本项目提供数据来源/样本标识、加工任务信息和业务成果归属，再核验所选算子的输入、输出和执行模式。中文语料、农业规则和数值敏感场景尤其需要验证。

PDF/DOCX 基础文本入口不足以支撑复杂科研文献解析。较适合的组合关系是让专门解析组件输出带来源信息的文本/结构化记录，再交给 DJ 做后续规范化、脱敏、去重、过滤、切分和 QA 加工；后续 MinerU、Docling 调研可继续核实解析端的适配情况。

### 可借鉴的设计理念

- **保存并重复使用处理规则：** 把算子、阈值、顺序和模型配置形成可检查的处理配置，便于记录一次加工实际使用的规则。
- **先分析再定阈值：** 基于真实资料的分布调参，避免把通用示例参数直接套到农业专业语料。
- **保留修改和丢弃证据：** 通过抽样追踪与来源字段，向审核人员解释处理结果，并把完整业务审计另行记录。
- **区分规则与语义任务：** 简单规范化使用明确规则，语义抽取或质量判断再调用模型，便于控制调用成本和检查结果。
- **把长任务组织为可观察的阶段：** 记录进度、错误、中间结果和检查点，给业务层提供任务过程信息。

### 本项目相对优势

以下对比仅表示**本项目需求设计的覆盖范围**，不代表本项目这些功能已经实现或通过验收。

| 本项目规划的能力 | Data-Juicer 当前边界 |
| --- | --- |
| 数据需求/场景/质量/来源授权与量级规划（013–021） | 有数据集配置、字段校验与处理配置，缺少统一业务填报、责任部门、审批和建设流程。 |
| 土壤等农业场景数据字典和标准清洗流程（004–006） | 提供通用规则和扩展机制；领域字段、单位、有效范围与专业判定仍需项目方定义。 |
| MySQL 实时采集及字段筛选（024） | 检查到的主加载策略未包含对应 MySQL 业务采集入口；文件与远程存储支持不能替代该需求。 |
| 完整 PDF、Excel、Word 文档解析（029–032） | PDF/DOCX 是基础文本提取；PDF 表格被排除、Word 表格/样式未完整提取；未发现原始 Excel 多工作表解析入口。 |
| 分角色的问答/图片标注和审核工作台（036–038） | DJ 提供模型加工及外部 Label Studio 连接，人工界面与协作依赖外部工具或本项目组织。 |
| 自然语言生成质检代码并运行（038） | 自然语言条件过滤和自定义 Python 函数是两类现有能力，未发现完整的“质量要点→生成代码→执行结果→审核”业务流程。 |
| 原始语料/QA 数据集版本切换与发布（039） | 处理配置版本、缓存和检查点服务于加工复用与恢复，不提供需求中的数据集版本发布体系。 |
| 热门成果、资源目录、申请下载、权限与数据服务（008–010、041–043） | 加载/导出与内部处理服务不能替代资产门户、分级授权、审批下载及受控数据集服务。 |
| 科研助手的论文信息提取与知识关联、知识溯源与研究工作流 | 可加工中间资料或抽取元信息，未发现对应的完整科研业务应用。 |

### 本项目相对短板

DJ 在具体清洗算子种类、近重复算法、多模态处理、数据画像、样本追踪、分布式执行和检查点恢复方面已有实现细节，本项目需求多只描述目标能力，尚未明确这些功能的参数、算法选择和过程呈现。

另有根据已有问答生成新问答、按指定字段提取信息、检查对话和智能体执行记录的质量、图片视频去重等能力可供参考。它们是否进入建设范围，应依据业务场景确定；当前最直接的价值仍是帮助落实清洗、知识片段和 QA 数据加工需求。

## 3.1.7 调研结论

| 评估项 | 结论 |
| --- | --- |
| 推荐集成/借鉴程度 | **高（作为数据加工组件）；整体业务平台直接采用：低。** 与文本规范化、专用去重、规则脱敏、质量过滤、批量处理需求匹配度较高，Python API/处理配置/服务接口便于进入适配验证；业务权限、数据集目录、审批、版本和复杂文档解析需由其它组件及本项目补足。 |
| 技术成熟度 | **高（核心框架工程成熟度）。** 已有持续版本发布、较完整的算子与执行/分析/追踪体系，以及去重、脱敏、分块、执行器和插件等测试文件。本次未运行测试，也未验证具体模型、依赖组合和业务样本；该评级不代表所有算子都已满足本项目验收标准。 |
| 社区活跃度 | **高（近期开发）。** 近三个月本地完整历史统计有 71 次提交、3 个正式 Release，最近提交距调研约 1 天。Issue 样本中有关闭动作，但公开评论不足，未将其推算为统一响应时效。 |
| 一句话总结 | **Data-Juicer 值得优先作为本项目清洗、去重、脱敏、质量分析与批量加工的引擎候选，再与专业文档解析组件和业务管理平台衔接。** |

### 调研依据与待验证事项

本次已核对加载/格式化、代表性算子、模型调用、分析工具、执行器、导出、标注连接及服务入口，源码引用固定到本次分析提交。官方时效性数据按 2026-10-13 记录；提交数来自非浅克隆完整历史的 HEAD 可达提交，包含合并提交，不代表新增功能数量。

**实际体验与截图尚未完成。** 后续重点验证：中文农业资料的精确/近重复误删情况，规则脱敏的漏检和误改，PDF 表格信息缺失对下游加工的影响，农业术语与实验数值在 QA 增强中的原始信息保留情况，字段来源在分块/生成后的保留，常用算子在所选执行模式下的兼容性，以及检查点恢复结果。官方测试样例和性能说明不能替代这些实际验证。

报告栏目沿用 `docs/平台调研/开源平台调研模板.docx`；需求对应以 `docs/科研助手平台+数据知识加工平台_需求规格说明书V2_2026.10.09.docx` 第 5 章为依据。本次仅形成源码与官方资料调研报告，未生成部署记录、运行结论或实测截图。

[S1]: https://api.github.com/repos/datajuicer/data-juicer
[S2]: https://github.com/datajuicer/data-juicer/releases/tag/v0.1.0
[S3]: https://github.com/datajuicer/data-juicer/commit/ae85f6916ab9bd132a187a15b8c1cb5269e20921
[S4]: https://github.com/datajuicer/data-juicer/releases/tag/v1.6.0
[S5]: https://api.github.com/repos/datajuicer/data-juicer/releases?per_page=100
[S6]: https://api.github.com/repos/datajuicer/data-juicer/issues?state=all&sort=created&direction=desc&per_page=40
[C1]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/pyproject.toml
[C2]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/LICENSE
[C3]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/Dockerfile
[C4]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/app.py
[C5]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/docs/Operators.md
[C6]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/core/data/load_strategy.py
[C7]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/format/text_formatter.py
[C8]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/core/executor/default_executor.py
[C9]: https://github.com/datajuicer/data-juicer/tree/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/mapper
[C10]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/deduplicator/document_deduplicator.py
[C11]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/deduplicator/document_minhash_deduplicator.py
[C12]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/deduplicator/document_line_deduplicator.py
[C13]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/mapper/pii_redaction_mapper.py
[C14]: https://github.com/datajuicer/data-juicer/tree/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/filter
[C15]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/filter/llm_condition_filter.py
[C16]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/core/data/data_validator.py
[C17]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/mapper/text_chunk_mapper.py
[C18]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/mapper/generate_qa_from_text_mapper.py
[C19]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/mapper/generate_qa_from_examples_mapper.py
[C20]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/mapper/llm_extract_mapper.py
[C21]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/mapper/image_captioning_mapper.py
[C22]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/core/analyzer.py
[C23]: https://github.com/datajuicer/data-juicer/tree/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/core/tracer
[C24]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/core/executor/ray_executor.py
[C25]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/docs/PartitionAndCheckpoint_ZH.md
[C26]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/docs/Export_ZH.md
[C27]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/docs/DJ_service_ZH.md
[C28]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/mapper/annotation/human_preference_annotation_mapper.py
[C29]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/tools/evaluator/README_ZH.md
[C30]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/utils/model_utils.py
[C31]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/docs/Juicer_ZH.md
[C32]: https://github.com/datajuicer/data-juicer/blob/ae85f6916ab9bd132a187a15b8c1cb5269e20921/data_juicer/ops/__init__.py
