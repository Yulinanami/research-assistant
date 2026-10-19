# Docling 开源知识数据加工平台调研报告

## 3.1.1 基本信息

| 项目 | 内容 |
| --- | --- |
| 平台名称 | Docling |
| 主页/仓库地址 | [官网](https://docling.ai/)；[官方仓库](https://github.com/docling-project/docling)；[官方文档](https://docling-project.github.io/docling/)。 |
| 开发方/维护方 | IBM Research / LF AI & Data |
| 开源协议 | **MIT** |
| GitHub Stars | 69.1k |
| 首次发布时间 | 仓库创建于 **2024-07-09**；最早正式 GitHub Release 为 **v0.1.1，2024-07-15**。 |
| 最近更新时间 | 最新提交日期为 **2026-10-13**。最新 Release 为 **v2.138.0，2026-10-12**。 |
| 开发语言 | 主要为 Python。 |
| 部署方式 | Python 包/源码。 |
| 维护活跃度 | **高。** 近期 Release 为 2.136.0、2.137.0（10-09）和 2.138.0（10-12） |

## 3.1.2 功能清单与功能说明

需求编号统一采用 `REQ-SJZS-xxx`。“对应”指功能目标接近；“部分对应”表示只覆盖部分能力，不能据此判定需求已完整满足。科研助手功能按需求名称说明。

| 序号 | 功能模块 | 功能说明 | 对应本项目功能 |
| --- | --- | --- | --- |
| 1 | 多格式导入与解析方式选择 | 支持 PDF、图片、DOCX/XLSX/PPTX、旧 DOC/XLS/PPT、RTF、HTML/MHTML、Markdown/纯文本、CSV、ODF、EPUB、邮件、iWork、音视频及指定 XML 等。不同格式采用不同的解析模块，部分需要额外依赖；旧 Office/RTF 通过 LibreOffice 转换，不能视为主包安装后全部直接可用。[C5]、[C6] | 对应—文档资料接入（022）的解析环节；部分对应—多类型语料预览（025）。 |
| 2 | 文件、URL、流与批量处理 | `DocumentConverter` 接受路径、URL、文档流，提供 `convert/convert_all`；可限制页数、文件大小、页范围并选择遇错继续或停止。CLI 支持目录批量转换，输出逐文档结果；这是加工入口，不是来源授权或业务上传审批。[C5]、[C20] | 对应—SDK/本地资料处理（022）；部分对应—批量采集、加工与错误展示。 |
| 3 | 可选择的解析处理流程 | 默认 PDF/图片走标准模型处理流程，Office/HTML 等直接读取文件结构，使用 SimplePipeline；另有 VLM 和不运行模型的 NativePdfPipeline。Native 只保留原生文本、图片及位置，不运行版面分析和 OCR 模型，也不保证恢复标题、表格及阅读顺序；不同处理流程不能按同等效果记录。[C5]、[C7]、[C9] | 可借鉴—按资料质量和加工目标选择执行路径；可用于实现 PDF 解析（029、030）。 |
| 4 | PDF 版面与阅读顺序 | 标准处理流程组织页面预处理、OCR、版面检测、表格、页面组装和阅读顺序处理；区分正文、标题、图片、表格、公式、页眉页脚等，并向统一结构写入来源。适合双栏论文和复杂资料，但特殊排版效果需要真实样本验证。[C7] | 对应—版面分析、阅读顺序还原（029、030）；可辅助科研助手的论文信息提取与整理。 |
| 5 | 多 OCR 引擎与语言配置 | 支持 Auto、RapidOCR、EasyOCR、Tesseract、macOS OCR 等引擎，另有受平台/环境约束的引擎及远程接口。标准 PDF 默认启用 OCR、由 Auto 结合平台、依赖和语言选择；可配置全页/区域等策略。引擎支持语言与中文识别效果要分别核实。[C8]、[C10] | 对应—扫描 PDF/图片文字提取（029、030）；不能只由“支持 OCR”推断所有中文、手写和低清资料效果一致。 |
| 6 | PDF 表格结构恢复 | 标准流程默认启用表格结构识别，TableFormer 提供 fast/accurate 模式，默认 accurate；关联单元格文字与结构，输出行列、跨度和表头等信息，表格可单独导出为 DataFrame/CSV/HTML 等。源码还提供其它表格引擎选项。[C8]、[C11]、[C36] | 对应—PDF 表格结构化（029、030）；单位、脚注、跨页续表及数值正确性仍需核验。 |
| 7 | 数学公式与代码识别 | 可对公式区域运行模型并生成 LaTeX，进一步识别代码内容和编程语言。标准 PDF 的公式/代码增强默认关闭，启用后增加模型与算力需求；不能将默认转换描述为已完成所有公式识别。[C8]、[C12] | 对应—公式转 LaTeX（029、030）；化学结构图专用理解仍列在 README 的计划项，不应写成已交付能力。[C1] |
| 8 | PDF 标题层级推断 | 可根据书签、编号与字体样式推断标题层级，默认关闭；根据字体样式判断时，需保留 parsed pages 页面解析数据。该阶段不额外调用 LLM，可改善层级导出与切片；检测到标题不等于已经恢复正确层级。[C8]、[C13] | 部分对应—带标题结构的知识资料（033）及科研论文信息整理；中文编号和不规范标题需核对。 |
| 9 | 页面/图片素材与来源 | 可生成页面图和图片区域，保存裁剪素材及页码/坐标；图片导出可选 placeholder、embedded 或 referenced。若只保留占位符，Markdown 有图片位置也不代表图片文件已保存。[C7]、[C20]、[C21] | 对应—图片单独提取（029）；部分对应—语料预览（025）、图像标注（037）的资料准备。 |
| 10 | 图片分类与描述 | 可识别照片、图表、流程图等类别，并用本地/远程 VLM 生成描述；增强默认关闭，启用图表提取时会同时启用图片分类。描述和 API 用量等信息可附于图片元信息，模型输出仍需核对，不提供人工任务分配或审核业务。[C8]、[C14] | 部分对应—图像描述自动标注（037）；不能替代手工标注、图片 QA 生成及复核流程。 |
| 11 | 图表数据、摘要和重绘代码 | 图表增强针对柱状图、饼图、折线图，先按图片类别筛选，再调用 VLM；可生成 CSV 并转入表格元信息，或另生成自然语言描述、Python 重绘代码。图表增强整体默认关闭；启用后的默认输出是 CSV，摘要/代码需另选。代码存为元信息，未见该步骤自动执行代码。[C14]、[C15] | 部分对应—科研助手图表解析、分析资料准备；不是统计检验或质检代码执行（038），模型提取的数值仍需与原图核对。 |
| 12 | Word 段落、表格和图片等内容 | DOCX 后端读取段落、标题/outline level、列表、文字格式、链接、表格、图片、页眉页脚、脚注/尾注等；OMML 公式有转 LaTeX 实现。旧 DOC/RTF 需 LibreOffice。能表达部分样式，不应承诺保持全部版式、嵌入对象和原文件视觉效果。[C16] | 对应—WORD 解析（032）的主要元素；完整样式与复杂公式要求须样本验收。 |
| 13 | Excel 工作表与合并单元格 | XLSX 后端用 openpyxl，遍历工作表并映射为独立页面/分组，可按表名选择；解析连续数据区、合并跨度、图片、批注和图表。旧 XLS 先转 XLSX。当前表格单元值转为文本，表头主要按区域首行标记；不能当作完备的智能表头/业务类型推断。[C17] | 部分对应—EXCEL 解析（031）：工作表与合并结构有实现，业务类型、复杂表头仍有差距。 |
| 14 | CSV 文本表格解析 | 可处理编码、分隔符、引号与多行字段，转换为表格文档结构。它不是自动给列建立农业字段字典、数值单位或缺失值规范；原始字符串到业务类型的转换仍需下游清洗。[C18] | 对应—CSV 文件解析（031）的基础能力；部分对应—文本清洗接入（028），不覆盖完整清洗算子要求。 |
| 15 | 演示文稿及其它原生文档 | PPTX、ODT/ODS/ODP、EPUB、邮件和 Apple iWork 等有格式后端，按原生元素形成文档；PPTX 还处理 Office Math 公式和图表。各格式支持范围与依赖不同，多格式入口不意味着同样的页面位置与尺寸信息。[C5]、[C6] | 部分对应—多源科研资料接入（022）和知识提取（012）；其中部分格式超出既定招标要求。 |
| 16 | 科研 XML 与文本资料 | 有 JATS 论文 XML、USPTO、DocLang 等专用后端，并可读 Markdown/纯文本、HTML、LaTeX。JSON 输入主要指 Docling 文档协议，不是任意 JSON 数据集清洗入口；不能把任意 XML/JSON 均算为已支持的业务格式。[C5]、[C6] | 部分对应—论文结构化资料接入及文本格式规范化（028）；为科研知识准备提供解析来源。 |
| 17 | 音频转录与时间信息 | ASR 处理流程支持 Whisper 等配置，生成转录文本/时间信息并纳入文档结构，可用于会议、讲座或访谈。需额外依赖和权重，不是主包默认直接覆盖全部模型；音频转录不等于会议结论生成或全程准确说话人归属。[C35] | 可借鉴—科研过程资料扩展；与当前数据加工的核心 PDF/WORD/EXCEL 要求无直接完整对应。 |
| 18 | 视频转录与代表帧 | 专用 VideoPipeline 提取音轨、转录并抽取固定间隔/场景变化的代表帧；可选说话人聚类。需要 FFmpeg 及相应额外依赖；`all` 依赖组合也明确未包含完整视频依赖。抽帧和转录不是逐帧实验动作理解。[C3]、[C35] | 可借鉴—科研会议/讲座资料归档；不应扩写成已经满足实验视频分析业务。 |
| 19 | 统一文档结构与溯源 | `DoclingDocument` 表达文本、表格、图片、层级、正文和页眉页脚等附属内容（furniture），利用引用关系组织内容；可保留文档来源、页号和框坐标，具体位置与尺寸信息取决于后端。类型定义主要来自 `docling-core`，主库负责转换与组织。[C19]、[C5] | 对应—结构化输出（029–032）；部分对应—知识片段来源（033）及科研知识溯源基础。 |
| 20 | 多格式导出与图片保存 | 当前 CLI 有 Markdown、JSON、YAML、HTML/分页 HTML、纯文本、DocTags、WebVTT、DocLang/DCLX、chunks、LaTeX 等导出。JSON 保留当前文档结构，Markdown 是简化表示；不保证恢复原文件全部信息，也不能由 DOCX/PDF 输入推断有同名输出格式。[C6]、[C20]、[C21] | 对应—Markdown/JSON 输出（029–032）；部分对应—加工结果展示（025）。 |
| 21 | 按文档结构和 Token 数量分块 | HierarchicalChunker 按文档元素形成片段并关联标题/图注；HybridChunker 在此基础上按 tokenizer 拆分过长片段、合并符合条件的小片段，可保留/重复表格表头。实现主要来自 `docling-core`，不同于先导出纯文本再按固定字符数切分。[C22]、[C23] | 对应—知识片段生成（033）的核心切片能力；按任意隔断符及类型配置的业务界面、数据集保存仍需补齐。 |
| 22 | 可交付的知识片段记录 | CLI `--to chunks` 输出 JSONL，记录原始文本和附带上下文的文本、片段编号、标题、图注、文档项引用、页码和来源信息；使用 Hybrid 时计算附带上下文后文本的 Token 数。可供后续向量生成或问答生成，格式与字段不是完整业务数据集协议。[C20] | 对应—带文档信息的知识片段（033）；部分对应—Token 统计（027）、查看科研资料原文。 |
| 23 | 置信度、进度与错误分级 | ConversionResult 包含状态、错误、timings、confidence；标准流程可汇总页面信息并报告部分成功。confidence 可用于挑选复核对象，但不是农业样本测出的准确率；官方仍注明 table_score 未实现，不能把空值当可靠的表格质量分。[C7]、[C24] | 部分对应—关键指标（007）、审核和质量控制（015、038）；不是完整模型评价工作台（040）。 |
| 24 | 按模板抽取字段 | 独立 DocumentExtractor 默认针对 PDF/图片，模板可用字符串、字典或 Pydantic 模型，通过 VLM 按页抽取 JSON。解析生成 JSON 不保证字段值、类型和跨页合并正确；调用者仍需验证，不等于自动生成可靠实验数据集。[C25]、[C26] | 部分对应—科研知识/实验字段抽取与智能辅助（012）；与 QA 提取（034）相关但不提供完整 QA 工作流。 |
| 25 | 引擎插件与自定义扩展 | 通过 pluggy/入口点扩展 OCR、版面、表格等引擎，也可扩展处理流程/后端；第三方插件需显式启用。它提供解析层扩展，不是数据字典、去重、脱敏和标注审批的业务插件框架。[C27] | 可借鉴—解析引擎替换和领域适配；部分对应—扩展加工逻辑，不能等同完整文本清洗算子（028）。 |
| 26 | 本地 SDK 与远程客户端 | DocumentConverter 提供进程内 SDK；同仓库服务客户端支持同步/异步调用、任务状态观察、结果获取和分类异常。精简 `docling-client` 包面向远程使用；调用远程端会传输资料，客户端与服务端功能须分别核验。[C5]、[C28] | 对应—SDK 资料处理（022）；部分对应—解析服务接入（043），不等于自动发布数据集 API。 |
| 27 | API、UI、MCP 与任务处理配套工具 | 独立 docling-serve 提供同步/异步转换、轮询/WebSocket 和可选 Gradio UI；MCP 把转换能力交给 Agent；Jobkit 提供本地/Ray/Kubeflow 任务及云存储连接；LangChain/LlamaIndex 等通过独立适配包接入。以上不是本仓库已内置并运行的完整平台。[C29]、[C30]、[C31]、[C32]、[C33]、[C34] | 部分对应—预览（025）、加工任务与 API（043）；适合衔接科研知识库，但向量检索、问答和业务权限还需上层实现。 |
| 28 | 本地处理、模型预取与硬件选择 | 可预下载模型，通过 artifacts path 使用本地权重；远程推理默认需显式开关，权重下载不受同一开关控制。设备选择有 CPU/CUDA/MPS/XPU，具体模型/引擎支持不同；不能由多操作系统支持推断国产 GPU/信创环境已验收。[C8]、[C37]、[C38] | 可借鉴—私有资料处理与模型可配置；部分对应—平台私有化和模型配置（001），不覆盖业务模型权限管理。 |

**典型加工流程：** 接收文件并记录来源 → 按格式选择后端、处理流程及 OCR/增强配置 → 形成 DoclingDocument → 对照原文核查文字、表格、公式和素材 → 导出结构或直接切片 → 下游清洗、索引、QA 生产与审核。图表增强和字段抽取可作为另外启用的分支。本次未执行该流程。

**关键能力边界：**

- **默认配置与完整效果：** 标准 PDF 默认开启 OCR/表格；公式、代码、图片分类/描述、图表提取和标题层级推断需要单独核对或开启。VLM 处理流程采用自己的输出格式，不能套用全部标准处理流程的默认行为。
- **表格结构与业务字段：** Excel 默认 `data_only=True` 读取已有公式缓存，不负责计算公式；缺失缓存的结果需核验。单元值写入文本、区域首行表头与跨度恢复，不等于土壤字段规范、数值单位、缺失值或自动数据类型推断。[C17]
- **统一结构与知识系统：** JSON、文档片段、原文位置记录和 AI 框架接口用于准备知识库资料，主库没有提供完整的向量库、语义检索、跨论文推理或数据集发布工作台。
- **模型生成结果的核对：** 图表的 CSV、描述和重绘代码来自模型；代码保存不等于已安全运行并验证图表一致性。图片描述也不等于已经形成经过人工审校的训练 QA。
- **示例与成品功能：** 官方有 NER/GLiNER 敏感信息替换示例，展示修改文本/表格的做法；它需要额外模型，不能据此认定安装后即可对全部文本和图片完成脱敏。[C39]

## 3.1.3 优势功能分析

### 优势功能1：统一文档结构把内容与来源保留在一起

- **功能描述：** 多种输入转为同一文档模型，组织正文、标题、列表、表格、图片与其它内容，尽可能保留层级及页/位置来源，而不是只交付一个纯文本字符串。
- **技术实现：** DocumentConverter 根据格式配置选择后端与处理流程，产生 ConversionResult/DoclingDocument；正文和附属内容按层级及引用关系组织，表格保存结构，每项内容可附 provenance 来源位置记录。结构定义、格式导出和部分转换由 docling-core 提供。[C5]、[C19]
- **差异化价值：** 有利于让同一资料同时服务文本清洗、表格提取、图片处理和科研溯源。相较只取文字层的流程，可保留更多核对依据；但后端无法获取的信息不会因统一模型自动补齐，JSON 保留文档结构，也不表示完整保留了原文件的所有信息。
- **可借鉴方向：** 本项目可以保留解析 JSON、素材与原文件，将文档 ID、页号、区域、解析版本和配置传给下游。成果审核应能回到原资料；不要仅保存最终 Markdown 或一段失去来源的 QA 文本。

### 优势功能2：按文档层级与 Token 限制生成知识片段

- **功能描述：** 直接按标题、段落和表格等文档结构分块，并保留标题、图注等上下文信息。
- **技术实现：** HierarchicalChunker 形成结构片段；HybridChunker 使用所选 tokenizer 处理长度，按条件拆分/合并，并可重复表格表头。`contextualize()` 生成附上下文的文本，CLI 片段 JSONL 包含标题、图注、来源项和页号。[C22]、[C23]、[C20]
- **差异化价值：** 与固定字符长度切片相比，更有机会避免农业论文中的试验表格脱离表头、结论脱离小节语境，并方便核对引用。它没有保证所有片段都完整表达事实，向量生成、资料检索和问答仍需其他模块完成。
- **可借鉴方向：** 优先用于 REQ-SJZS-033：界面同时展示原文、片段和来源，选择与下游模型一致的 tokenizer，并保存标题/图注及切片配置。对表格、超长行、中文和公式单独检查；数据集命名、版本和发布由本项目负责。

### 优势功能3：提取图表数据，生成描述和绘图代码

- **功能描述：** 识别图表图片之后，可将部分图表转成表格数据，并根据需要生成摘要或重绘代码，比只裁剪保存图表更接近可继续加工的科研资料。
- **技术实现：** 图片分类确定柱状、饼状或折线图，ChartExtractionVlmEngineModel 按启用的 prompt 调用 VLM。CSV 转入 TabularChartMetaField，描述和 Python 代码分别保存为元信息；Granite Vision 相关预设与本地/远程引擎负责推理。[C14]、[C15]
- **差异化价值：** 对农业论文中的产量对比、处理组趋势等，提供从图表图片中提取待核对数据的方式。该功能值得进一步验证，本次未证明数值精度、多坐标轴、误差线或图例映射可靠；也不等于已经完成科研统计分析。
- **可借鉴方向：** 科研助手图表分析可参考“原图 + 待核对数据 + 描述”并排审核。原图和提取数值都应保留，确认单位、轴刻度和组别后再进入分析；生成代码作为待检查素材，不能直接当作验证结果。

## 3.1.4 技术架构概述

- **整体架构：** 模块化 Python 文档处理库：CLI/SDK → DocumentConverter → 格式后端与处理流程 → DoclingDocument → 格式导出/文档分块/模型补充识别。PDF 标准处理流程有分阶段队列、批次和页面组装；原生格式用其文件结构直接转换；VLM、ASR、Video 与 Extractor 各有入口。HTTP 服务、MCP、分布式任务需要配套工具部署，并非全部内置于主库。[C5]、[C7]、[C25]
- **核心依赖：** 根目录对应的软件包为 `docling-slim`，`docling` 固定安装对应版本的核心代码和标准依赖；当前要求 `docling-core>=2.98.0,<3.0.0`、所选 PDF 组合的 `docling-parse>=7.22.1,<8.0.0`、本地模型组合的 `docling-ibm-models>=4.0.2,<5`。Pydantic/pluggy 支持结构与扩展，PDF 用 docling-parse/pypdfium2，原生格式采用 python-docx/openpyxl 等；重型模型和格式依赖通过 extras 组织，不能把 slim 基础安装当完整解析环境。[C3]、[C4]
- **模型支持：** 标准流程有版面、TableFormer 和可选 OCR/增强模型；VLM 可使用 GraniteDocling 等预设，本地推理引擎包括 Transformers/MLX/vLLM 等配置，也可使用兼容的远程 API。音频使用相应 ASR 模型。模型预设、安装依赖、设备和输出解析器需共同匹配，不是任意模型名称替换后均能正确解析。[C8]、[C10]、[C15]、[C35]
- **扩展机制：** 可配置 FormatOption、后端、处理流程、模型和格式导出/文档分块；pluggy 插件扩展 OCR/版面/表格等引擎。SDK 与服务客户端可供业务接入，LangChain/LlamaIndex 另有适配包；支持接入这些框架不等于 Docling 自身完成了 RAG 系统。[C27]、[C28]、[C33]、[C34]

**服务层的范围：** 当前仓库文档的 docling-serve 页面标明同步自 **v1.21.0**，列出 `/v1/convert/file`、`/v1/convert/source` 及 async、status、result 接口，支持可选 API Key 和 Gradio `/ui`。Local 引擎在进程内运行，RQ 使用 Redis/独立 worker；Jobkit 为分布式转换和连接器提供另一种组织方式。本次以这些文档及客户端接口约定为依据，没有查验正在运行的服务实例，服务实际版本、OpenAPI、结果保留和任务恢复应另行确认。[C29]、[C30]、[C32]

**私有化和硬件：** 可使用本地文件、本地模型和预取的权重目录，远程推理有显式开关；该开关不阻止 URL 获取、模型初次下载等所有网络行为。源码有 CPU/CUDA/MPS/XPU 设备路径，外部 serve 文档还有 AMD/ROCm 部署说明，但要求额外构建与相应环境。当前调查不能证明国产操作系统、昇腾等国产算力或所有 CPU 架构均已适配。[C37]、[C38]、[C30]

**质量与资源选择：** 标准 OCR/表格、全页 VLM、原生 PDF 和额外图表/公式增强有不同成本与信息保留能力。应记录实际配置、依赖/权重版本、错误和处理时间，并按同一批农业资料比较效果。本地源码中已有大量后端、模型和客户端测试，不代表本次已运行这些测试或完成验收。

## 3.1.6 与本项目的关系

### 可直接集成的能力

优先候选为 PDF 版面/OCR/表格/公式/图片解析（029、030），WORD/EXCEL/CSV 入口（031、032），以及保留标题、图注、来源的知识片段生成（033）。Python SDK 可嵌入加工服务，独立 HTTP 服务适合统一调用；图表信息提取和按模板抽取可为科研助手整理论文、解析图表和查看原文提供资料。

“可集成”是组件选型判断，仍需样本和接口验证。Excel 当前的文本值、缓存公式与首行表头策略不能直接判为满足完整类型推断；Word 的结构/样式保留需核验，旧 DOC/XLS 还需要 LibreOffice。SDK 与服务端应保存 JSON/素材，不宜只取最终 Markdown。

**与已调研项目的候选分工：**

| 组件 | 对本项目较直接的价值 | 接入时需注意 |
| --- | --- | --- |
| Docling | 多格式统一文档结构、结构/Token 切片、图表和字段抽取候选。 | docling-core、格式 extras 与增强模型；来源信息、切片结果和业务字段需要适配。 |
| MinerU | 专业文档解析、分档处理、文档库缓存与页/块定位。 | MinerU 4.0 API/协议与许可，目标硬件兼容；与 Docling 的效果优劣需相同样本验证。 |
| Data-Juicer | 承接解析后的规范化、脱敏、去重、过滤和其它语料加工。 | 将文档结构/片段转换为算子输入，并保留素材和来源字段，不能只按扩展名拼接。 |
| Easy Dataset | 可根据文本或知识片段生成问答，并提供审核、导出功能。 | 本次查阅其 `lib` 和依赖声明未见 Docling 直接接入；不能假定已有可用连接器，需使用实际输入协议。 |

以上描述组件组合方向，未实际搭建处理链。Docling 的来源和切片结构与 MinerU 的结果协议不同，二者不能互换 JSON 后就视为接通；可在业务层形成共同的文档/片段接口，而不是提前绑定单个工具的内部字段。

### 可借鉴的设计理念

- **先保留结构，再按用途生成内容：** 统一文档作为中间层，预览、文本清洗、表格加工和切片读取各自需要的内容。
- **把知识片段与来源一起输出：** 标题、图注、页号、区域与内容项引用传入下游，使审核能回到原文。
- **按任务开启增强：** 快速预览、正式解析、公式识别和图表抽取采用明确配置，向用户展示实际启用的功能。
- **允许替换解析引擎：** OCR/版面/表格扩展留在解析层，有利于后续中文和领域适配。
- **将低质量和部分失败送到复核：** 利用状态、错误和 confidence 选择待查文档，同时以样本正确率补足模型内部评分。

### 本项目相对优势

以下对比表示**本项目需求设计的业务范围**，不表示本项目已经实现或验收完成。

| 本项目规划的能力 | Docling 当前边界 |
| --- | --- |
| 数据集用途、来源授权、质量与量级规划（013–021） | 处理文档与模型配置，缺少完整业务表单、授权责任和从数据集创建到发布的管理功能。 |
| 数据字典、土壤清洗标准与通用清洗算子（004–006、028） | 解析、序列化和切片为主；隐私示例不等于农业字段标准、质量过滤和去重脱敏工作台。 |
| MySQL 实时数据接入、条目管理和语料统计（023、024、026、027） | 文件/URL/流和外部存储连接为主，没有需求所述 MySQL 字段筛选、通用数据 CRUD 与统计业务。 |
| QA 生产、SFT 增强及人工/LLM 标注（034–037） | 有切片、图片描述和字段抽取；没有完整问答生产、人工任务分工和训练成果审核流程。 |
| 审核、质检代码执行与数据版本发布（038、039） | 状态、置信度和生成的图表代码不是业务审核与质检运行；处理流程实例缓存不是数据集版本。 |
| 热门成果、申请下载、资源目录和分级权限（008–010、041、042） | 文档处理工具与演示 UI 不提供完整成果门户、审批和角色/项目/数据等级权限体系。 |
| 模型实验室、评测及自动发布数据服务（001–003、040、043） | 配置解析模型和提供转换服务，不覆盖多轮聊天、模型上架权限、综合评测或数据服务 API 自动发布。 |
| 农业科研助手和 LLM 原生论文知识库 | 为解析、切片、图表资料与来源准备提供基础，统一的概念索引、跨文献推理和完整科研应用仍需建设。 |

### 本项目相对短板

Docling 已有统一文档模型、结合文档层级和 Token 数量分块、表格片段上下文、从图表提取待核对数据、摘要和代码、解析插件和多格式入口。本项目需求已提出文档解析和知识片段目标，但尚未明确这些结构、配置和审核界面的交付方式。

可优先参考片段与原文联动、保留表头/图注、逐文档部分失败处理及按任务启用增强。音视频、iWork、专用 XML 等超出部分既定范围的功能，可作为后续资料扩展方向，不应为了功能丰富而直接增加本项目建设范围。

## 3.1.7 调研结论

| 评估项 | 结论 |
| --- | --- |
| 推荐集成/借鉴程度 | **高（文档解析与知识片段组件）；完整业务平台替代：低。** 统一结构、来源与自带的分块功能对本项目较契合，图表增强值得重点验证；业务清洗、QA、标注、审批和版本需结合其它组件。 |
| 技术成熟度 | **高（核心组件与配套工具完整度）；新增增强和本项目适配待验证。** 多格式后端、标准/VLM 处理流程、配置、客户端与测试已有实现并持续发布；本次未运行模型，不能把分类器的 Production/Stable 标签当作实际质量或信创验收。 |
| 社区活跃度 | **高。** 本地近三个月可达历史 448 次提交、近期持续发布，调研时线上已有同日新提交。Issue 样本包含贡献者回复和待处理新问题，不承诺统一响应时效。 |
| 一句话总结 | **Docling 适合作为本项目多格式文档结构化与知识片段生成的候选组件，图表增强可补充科研资料加工，但仍需样本验收和业务流程配套。** |

### 调研依据与待验证事项

本次核对了格式路由、标准/Native/VLM 入口、配置默认值、OCR/表格/公式/图表流程、Word/Excel/CSV 后端、统一文档与切片接口、Extractor、插件、导出、服务客户端和官方配套工具说明。报告以固定提交源码为基线；线上最新提交与声明版本、外部服务文档的版本单独记录。

**实际体验与截图尚未完成。** 后续使用与 MinerU 相同的农业资料，检查双栏/扫描/复杂文字层 PDF、跨页及合并表格、小数点/单位/上下标、公式与化学结构图、Word 标题/列表/公式/图片、Excel 工作表/表头/公式缓存；再检查片段的标题/表头/Token 长度、来源框、图表抽取数值及素材引用。解析耗时、内存/显存、并发和目标硬件同样需实际测量。

优先核验：①标准与增强配置分别产生什么结果；②结构化表格能否转换为正确农业字段；③切片能否回到原资料；④图表模型是否准确保留刻度、单位和组别；⑤服务实际 OpenAPI、错误、结果保留及任务状态。运行成功、模型返回 JSON 或 confidence 较高均不能单独作为准确性证明。

栏目沿用 `docs/平台调研/开源平台调研模板.docx`，需求对应以 V2 需求规格说明书第 5 章为依据。时效性数据采集于 2026-10-13；提交数含合并提交，代表开发活动而非独立功能数量。

[S1]: https://api.github.com/repos/docling-project/docling
[S2]: https://github.com/docling-project/docling/releases/tag/v0.1.1
[S3]: https://github.com/docling-project/docling/commit/cb1df981e0b49906d638c652a27bfeeeb13ec5d1
[S4]: https://github.com/docling-project/docling/releases/tag/v2.138.0
[S5]: https://api.github.com/repos/docling-project/docling/releases?per_page=100
[S6]: https://api.github.com/repos/docling-project/docling/issues?state=all&sort=created&direction=desc&per_page=40
[C1]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/README.md
[C2]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/LICENSE
[C3]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/pyproject.toml
[C4]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/packages/docling/pyproject.toml
[C5]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/document_converter.py
[C6]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/datamodel/base_models.py
[C7]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/pipeline/standard_pdf_pipeline.py
[C8]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/datamodel/pipeline_options.py
[C9]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/pipeline/native_pdf_pipeline.py
[C10]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/models/stages/ocr/auto_ocr_model.py
[C11]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/models/stages/table_structure/table_structure_model.py
[C12]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/models/stages/code_formula/code_formula_vlm_model.py
[C13]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/usage/heading_levels.md
[C14]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/models/stages/chart_extraction/granite_vision.py
[C15]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/datamodel/chart_extraction_options.py
[C16]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/backend/msword_backend.py
[C17]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/backend/msexcel_backend.py
[C18]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/backend/csv_backend.py
[C19]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/concepts/docling_document.md
[C20]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/cli/main.py
[C21]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/cli/export_utils.py
[C22]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/concepts/chunking.md
[C23]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/chunking/__init__.py
[C24]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/concepts/confidence_scores.md
[C25]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/document_extractor.py
[C26]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/pipeline/extraction_vlm_pipeline.py
[C27]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/concepts/plugins.md
[C28]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/service_client/__init__.py
[C29]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/usage/api_server/rest_api.md
[C30]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/usage/api_server/deployment.md
[C31]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/usage/mcp.md
[C32]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/usage/jobkit.md
[C33]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/integrations/langchain.md
[C34]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/integrations/llamaindex.md
[C35]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/usage/processing_audio_media.md
[C36]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/examples/export_tables.py
[C37]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/usage/advanced_options.md
[C38]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docling/utils/accelerator_utils.py
[C39]: https://github.com/docling-project/docling/blob/6de07022afd898c11d7dc660ee0756eead30e315/docs/examples/pii_obfuscate.py
