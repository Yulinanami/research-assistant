# Label Studio 开源知识数据加工平台调研报告

## 3.1.1 基本信息

| 项目 | 内容 |
| --- | --- |
| 平台名称 | Label Studio |
| 主页/仓库地址 | [官网](https://labelstud.io/)；[官方仓库](https://github.com/HumanSignal/label-studio)；[社区版文档](https://labelstud.io/guide/)。 |
| 开发方/维护方 | HumanSignal |
| 开源协议 | **Apache-2.0** |
| GitHub Stars | 28.5k |
| 首次发布时间 | 仓库创建于 **2019-06-19**；最早正式 Release 为 **v.0.1.0，2019-09-23**。 |
| 最近更新时间 | 默认分支为最新提交日期 **2026-10-13**；最新稳定 Release **1.23.2，2026-09-29**。 |
| 开发语言 | 后端以 Python 为主，前端以 JavaScript/TypeScript 为主。 |
| 部署方式 | pip/源码、Docker |
| 维护活跃度 | **高；**最近稳定版为 1.23.0（03-13）、1.23.1（09-25）、1.23.2（09-29） |

## 3.1.2 功能清单与功能说明

需求编号统一采用 `REQ-SJZS-xxx`。“对应”表示功能目标接近，“部分对应”表示只覆盖其中一部分。下列说明以社区版可确认的入口为主；共享字段、商业版示例和外部模型不能单独作为社区版完整可用的证据。

| 序号 | 功能模块 | 功能说明 | 对应本项目功能 |
| --- | --- | --- | --- |
| 1 | 多项目与多人标注 | 可建立多个标注项目，保存说明、配置与数据，用户登录后提交的标注关联 `completed_by`、时间和任务。多人参与不等于有按项目分配的审核角色或按项目成员分别授权的完整功能；官方比较页将这些能力区分到付费版本。[C1]、[C5]、[C9]、[C10] | 对应—建立标注任务（036、037）；部分对应—协作组织，不能完整满足分级权限（042）。 |
| 2 | 模板与 XML 配置 | 提供模板和标签库，通过展示标签呈现资料、输入控件收集标注结果，`name/toName/$字段` 连接界面与输入。可配置标签、说明、布局、必填规则及区域级控件。社区版 XML 配置与企业版可编程 React UI/JS 插件是不同能力。[C11]、[C12] | 对应—可配置问答/图像标注（036、037）；可借鉴领域标注界面设计，标签体系不是完整数据字典（005）。 |
| 3 | 文件/结构化数据导入 | 支持文件上传、JSON/CSV/TSV、部分压缩包和媒体引用；任务可同时包含资料、元信息、已有标注和模型预测。导入字段需与项目配置匹配，上传 Word/Excel 文件不等于自动完成专业结构解析。[C13]、[C14] | 对应—待标注条目上传与预览（023、025）；部分对应—资料上传（022），解析需其它组件。 |
| 4 | 本地与云存储同步 | 有 S3、GCS、Azure Blob、Redis、Local Files 等存储连接与同步实现，可从源存储形成任务、将标注写入目标存储。高级连接、企业身份机制需按版本核对；存储同步不是 MySQL 字段选择和实时业务采集。[C15]、[C5] | 部分对应—数据接入、资料更新（022、021）；不直接对应 MySQL 实时采集（024）。 |
| 5 | Data Manager 任务视图 | 表格视图展示资料、任务、标注/预测数量、状态等，支持筛选、排序、视图和批量管理操作。批量管理、删除或获取预测不能统称为免费版有全部“批量人工打标”功能。[C16]、[C17] | 对应—语料预览与条目管理（025、026）的标注数据部分；部分对应—统计（027）。 |
| 6 | 文本分类、实体与关系 | 文本/HTML 可进行分类、区间标签、命名实体和关系标注，标签体系可按领域配置。例如标出作物、病虫害、试验处理或品种并关联关系；配置提供交互，不会自动形成农业实体标准或知识图谱。[C11]、[C18] | 对应—人工标注（036）的扩展；部分对应—科研知识抽取资料准备。 |
| 7 | 阅读理解式 QA 标注 | Question Answering 模板展示问题与资料，人工选择原文中回答问题的文本区间。该模板主要收集答案位置，不是从论文自动产生多组问答；抽取式与生成式 QA 需按成果类型区分。[C19] | 对应—问答对人工标注（036）；部分对应—问答提取（034）的人工确认，不覆盖自动生产。 |
| 8 | 生成式答案与 SFT 数据整理 | 社区 SFT 模板展示 prompt，用 TextArea 收集人工答案；也可针对导入答案配置打分、选择或修正界面。模板产生标注记录，转为目标 SFT 格式需字段转换，标注工具不负责模型微调或自动数据增强。[C20]、[C11] | 对应—问答标注（036）；部分对应—SFT 数据准备，不等于 SFT 增强（035）。 |
| 9 | 图像分类、区域与关键点标注 | 支持分类、矩形/旋转框、多边形、画刷掩码、关键点等常见任务，图像编辑器有缩放及相关操作。可用于作物、病虫害或试验区域标记；实际交互、超大图和复杂区域性能未实测。[C11]、[C21] | 对应—图像人工标注（037）；可扩展农业视觉训练资料。 |
| 10 | 图片描述与视觉问答 | 图片 caption/Visual QA 模板可展示图片和问题，由人工填写描述/答案，组合分类和文本控件。批量自动描述或图片 QA 需要外部模型/ML Backend 提供结果，不能把人工模板当内置自动生成器。[C22]、[C23] | 对应—图像标注（037）的人工部分；自动描述/QA 仅部分对应，需模型接入。 |
| 11 | 文档与 OCR 资料标注 | 社区 `Pdf` 源码主要使用浏览器 `<embed>` 显示 URL 文档，可对整本文档分类；多页区域标注可先转成图片列表，再进行框/文字等标注。原生 PDF OCR 的 OcrLabels 模板明确为 Enterprise，不能由仓库文档含此模板推断社区版已支持。[C24]、[C25]、[C26] | 部分对应—资料预览（025）及 OCR 结果人工核对；不替代 PDF 解析（029、030）、Word/Excel 解析（031、032）。 |
| 12 | 音频区间与转写标注 | 音频/波形控件可标记片段、分类、转写、说话人或声音事件。自动 ASR 需相应模型预标注；模板中的“ASR”表示数据任务类型，不代表应用默认携带可运行的转录模型。[C11]、[C27] | 可借鉴—科研访谈/音频资料标注；当前核心问答/图像需求之外的扩展。 |
| 13 | 视频时段与对象标注 | 视频控件支持时间轴、区段分类和对象框/轨迹等标注。模型自动跟踪/SAM 等由外部后端提供，并受具体示例和环境限制，不应把存在视频标签等同于自动实验行为理解。[C11]、[C28] | 可借鉴—多模态资料标注；未直接覆盖既定科研实验视频分析业务。 |
| 14 | 时间序列与多模态组合 | TimeSeries 等对象展示 CSV 信号/通道，可给时段和整条序列加标签；同一界面可组合文本、图像、音频和其它对象。适合人工核对农业监测信号的候选交互，不负责土壤数值清洗或专业统计推断。[C11]、[C29] | 可借鉴—科研多源资料标注；不等于土壤清洗标准（006）或统计分析功能。 |
| 15 | RLHF 数据采集（选择更好的回答） | 社区模板显示 prompt 和多个候选答案，使用 Pairwise 等控件，让人员选择更好的回答。它收集用于奖励模型或回答优劣比较训练的数据，不运行奖励模型、DPO/PPO 训练或完整 RLHF 处理流程。[C30] | 部分对应—问答审核与人工反馈（036、038）；超出原有 SFT 增强的部分可供设计参考。 |
| 16 | 模型回答排序与评分 | Ranker/Rating/Choices 等模板收集模型输出排名、等级和维度评价，可制作人工评测集。候选回答需外部生成，评分规则需配置；社区界面不等于内置自动基准、Prompt 比选或完整模型评价工作台。[C31]、[C5] | 部分对应—模型评测（040）的人工评价数据；可借鉴科研回答质量核对。 |
| 17 | 离线模型预标注导入 | 可导入 `predictions`，预测记录包含模型版本、可选分数和结构化 result 结果字段，并在界面显示供修正。`from_name/to_name/type` 与区域 ID 必须匹配配置和相关区域；模型预测不等于已经完成并确认的人工作业。[C32]、[C10] | 对应—模型辅助标注（036、037）的接入基础；结果复核仍需人工流程。 |
| 18 | 外部 ML Backend 配置 | 可连接单独运行的后端服务，配置 URL、认证、参数和状态，通过 SDK/协议包装自选模型；本地部署应用不等于模型也已在本地。默认不添加模型后端，模型权重、prompt 和推理逻辑由接入方准备。[C33]、[C34]、[C35]、[C8] | 部分对应—默认/自定义模型辅助（036、037）；社区版不提供商业 Prompts 的全部开箱即用流程。 |
| 19 | 批量获取模型预测 | 非交互 ML Backend 可对任务批次提供预测，记录 score/model_version 并跳过相应已预测任务；具体模型必须返回正确数量与 result。支持获取预测不表示所有模板都可一键生成可靠 QA，也不意味着自动通过审核。[C34]、[C17] | 部分对应—批量自动标注（036、037）；需要编写模型接入代码，并验证返回结果。 |
| 20 | 交互式模型辅助 | 可把选区/提示等上下文交给交互后端，返回标注建议，例如点击辅助分割或文本范围提示。当前源码对 `is_interactive` 后端跳过普通批量预测，因此“可交互”与“可批量预标注”要分别确认。[C33]、[C34] | 部分对应—图像/文本的智能辅助标注（036、037）；不会自动成为批量生产模型。 |
| 21 | 草稿、继续作业与快捷操作 | 草稿模型记录用户、任务/标注及结果，可继续未提交工作；编辑器有快捷键、跳过及区域操作。草稿保存与提交分开，有利于长任务标注，但持久化、并发和恢复体验需实际验证。[C10]、[C36] | 对应—逐条标注的工作体验（036、037）；可借鉴防止作业丢失的交互。 |
| 22 | 提交、修改与人工检查 | 可提交或更新 annotation，保留用户、时间、部分预测来源及相关记录。社区用户能查看和修改结果，可组织人工检查，但独立 Reviewer 角色、分派复核、驳回再分配和审批发布不能按普通编辑行为推断。[C10]、[C37]、[C5] | 部分对应—结果预览/修改（038）；正式审核和发布流程需补齐。 |
| 23 | 标注队列与基础进度 | 项目/任务记录标注、预测、跳过数量及完成状态，标注页面可按顺序或随机分配任务，并防止同一任务被同时占用。源码有不确定性选择等共享实现，但当前社区设置界面将该选项标为 Enterprise 并禁用，不能宣称免费版有完整的主动学习流程。[C9]、[C38]、[C39] | 部分对应—关键指标（007）、标注进度及统计（027）；不是商业版项目/人员绩效分析看板。 |
| 24 | 统一保存任务和标注结果 | `Task.data/meta` 表达资料和元信息，Annotation、Prediction、Draft 分别保存人工结果、模型结果和草稿。result 中区域/对象/控件引用利于多模态一致处理；来源字段需要调用方提供，不会自动恢复原论文的页/块溯源。[C10]、[C37] | 对应—条目化标注成果；部分对应—来源责任/查看原文来源（021、033），业务资料关联需额外组织。 |
| 25 | 多格式标注导出 | 平台自身的 JSON 格式及项目配置适用的 CSV、COCO、YOLO、VOC、文本标注格式等可供选择，实际可用格式由 Converter 根据标签配置决定。图片坐标在原始标注结果中常以百分比表达；不是所有任务都能导出全部格式，也不默认转成 SFT 或回答优劣比较训练所需的格式。[C40]、[C41] | 对应—标注成果交付；部分对应—数据集下载（010）的文件准备，不含申请审批。 |
| 26 | 导出快照与结果文件 | 有 Export/ConvertedFormat 记录、状态与快照 API，可生成并下载指定导出文件。社区 UI 通常同步导出，SDK/接口可用快照；界面筛选条件不必然约束默认导出。导出快照不是每次 QA/增强自动创建业务版本及标记发布版本。[C40]、[C41]、[C42] | 部分对应—成果留存与版本参考（039）；完整数据集版本控制仍需本项目实现。 |
| 27 | REST API、SDK 与令牌 | API 管理项目、任务、annotation/prediction、模型、存储和导出，独立 Python SDK 供程序调用；令牌分 Legacy Token 与 Personal Access Token，HTTP 使用方式不同。接口存在不等于已具备数据集自动发布、按等级授权和完整审计。[C43]、[C44]、[C45] | 对应—平台组件接入；部分对应—API 服务（043），缺少需求所述的数据集发布功能。 |
| 28 | Webhook 事件通知 | 可对任务/标注创建、更新、删除等配置事件、目标地址、请求头和 payload；源码记录连续投递失败，并可达到阈值后停用。通知可用于启动后续加工，但不能保证送达，也不保证后续加工已经完成或各系统结果一致。[C46]、[C47] | 部分对应—标注后加工/成果同步；可借鉴业务事件衔接，不等于自动发布审批。 |
| 29 | 私有部署与资料服务 | 社区版能自托管，保存数据库、上传文件和配置，可通过本地文件/存储提供素材；URL 素材还需要浏览器和后端能够读取。模型、云存储、遥测等网络行为需按实际配置确认，不能由“本地安装”认定全部资料和请求都不会传往外部服务。[C7]、[C8]、[C15] | 可用于私有标注工作台；部分对应—资料接入与平台部署，不等于全部国产环境已适配。 |

**典型流程：** 上游解析/清洗生成任务 → 创建项目并配置标注界面 → 导入原资料及可选 predictions → 人工标注/修正 → 提交并组织结果检查 → 按明确范围导出 → 转为业务数据集并发布。模型建议和人工确认分别保存，审核角色、批准状态和数据版本由本项目补齐。本次没有执行此流程。

**社区版的关键边界：**

- **多用户与精细权限：** 社区版有账号和基础鉴权，但不是本项目所需的按角色/项目/数据等级访问体系。权限注册和项目默认 mixin 不能被视作企业版完整 RBAC；同一组织内的项目隔离与正式审核职责应另设计。[C48]、[C49]、[C5]
- **ML 接口与商业 LLM 流程：** 社区可接自建 LLM/视觉模型后端，也可直接导入模型结果；商业 Prompts、自动基准和在线 Chat 是其它产品能力。仓库 `ml_models`、`ml_model_providers` README 明确标注用于 Enterprise，代码目录或 OpenAI 依赖存在不代表社区 UI 已完整启用。[C50]、[C51]
- **人工检查与正式审核：** 展示、修改、提交结果可以帮助人员检查质量；专门审核角色、任务分派、评论/通知、多人标注结果的一致程度及审核历史等应按社区/商业版本逐项核对，不能仅凭共用的数据字段就认定完整审核流程已实现。
- **图片 OCR 与 PDF 解析：** 可对图片区域与文本进行标注，多页资料先转成图片；社区 Pdf 的显示入口不是 MinerU/Docling 的文档结构解析流程，也不是 Enterprise 的原生 PDF OCR 标注器。
- **筛选、导出与版本：** 社区界面默认导出通常含已标注任务，文档明确提示可能包含跳过标注且不遵循当前视图筛选。交付成果应检查导出范围、取消状态和人工确认状态，不能认定当前列表中的数据就是最终导出的全部内容。[C40]

## 3.1.3 优势功能分析

### 优势功能1：通过配置组合多种标注界面

- **功能描述：** 以同一套展示标签和输入控件配置文本、图像、音视频、时间序列、问答和回答优劣比较任务，可组合资料与结果输入，减少为每个任务单独开发整套标注界面的工作。
- **技术实现：** 项目保存 XML label_config，前端 Registry/编辑器根据对象、控制标签和字段关系构建交互；人工结果按统一区域结构保存。社区模板包括 SFT、Visual QA 和 Pairwise 等，领域标签可由项目配置定义。[C9]、[C11]、[C12]、[C20]、[C23]、[C30]
- **差异化价值：** 与只支持文本 QA 表单的工具相比，能用同一套项目管理和标注功能处理农业文本、病虫害图片或多模态反馈数据；并可同时显示资料、问题与评价项。这些标注界面可以重复使用，不自动补齐农业知识标准或全部商业版控件。
- **可借鉴方向：** 本项目问答与图像标注模块可参考“任务数据 + 标注模板 + 结果格式”的设计。按任务提供合适控件和说明，将文档来源、图片和问题一起展示，避免标注人员脱离原资料作判断；保留配置版本并检查字段变化对旧标注的影响。

### 优势功能2：模型预测与人工修正使用相近的结果协议

- **功能描述：** 模型输出可作为预标注展示，人工在已有区域/答案上修正再提交；也能在操作时向交互后端请求提示，从完全手工标注逐步引入辅助能力。
- **技术实现：** Prediction 与 Annotation 分开存储，预标注 result 与控件/对象引用对齐；ML Backend API 接受任务、配置和上下文，返回模型版本、score 与结果。人工 annotation 可记录对应预测来源，交互模型与普通批量模型分别处理。[C10]、[C32]、[C34]、[C37]
- **差异化价值：** 比直接把模型生成结果当成训练真值更便于人工校正，适合农业实体、图片区域和候选答案检查。辅助效果取决于模型接入与标注人员，本次没有测得节省工时或质量提升；基础修正也不等于独立审核审批。
- **可借鉴方向：** 将模型建议、人工结果、使用的模型/配置及来源分别保存，界面明确区分“建议”和“确认”。本项目可把解析/QA 组件生成的候选结果转换为 predictions，再交给人员核对；正式审核状态应独立于“已有 annotation”。

### 优势功能3：结构化成果与事件接口方便接入加工流程

- **功能描述：** 项目、任务、结果、存储、模型和导出都有程序化入口，Webhook 能将标注变更通知给后续模块，适合把标注工作台作为现有平台中的一个环节。
- **技术实现：** Django/DRF API 暴露标注对象，独立 Python SDK 调用相应接口；任务 data/meta 传递资料与来源，Converter 根据配置导出适用格式，Webhook 携带动作与实体内容。Export 记录保存产物及状态。[C10]、[C41]、[C42]、[C43]、[C46]、[C47]
- **差异化价值：** 与只能手工上传下载的界面相比，便于接入上游解析、下游 QA 整理和训练数据生产。它提供连接能力，仍需业务方处理导出范围、接口版本、事件失败和成果发布条件，不是自动完成整个加工链。
- **可借鉴方向：** 本项目可用业务资料 ID 关联任务，保留解析来源与人工结果，通过事件提示下游检查/加工，批准后再形成数据集版本。交付应检查素材引用和坐标转换；Webhook 到达或导出完成不能自动表示业务审核已通过。

## 3.1.4 技术架构概述

- **整体架构：** 自托管 Web 应用，后端按 projects/tasks、data_import/data_export、data_manager、io_storages、ml、users/organizations、webhooks 等模块组织。浏览器编辑器读取任务与标签配置，结果经 API 保存到数据库；外部 ML Backend 负责推理，存储服务提供原始素材。FSM 与 mixin 提供共享状态/扩展基础，不能单独证明社区版具有全部企业审核流程。[C9]、[C10]、[C43]
- **核心依赖：** 当前源码使用 Django `>=5.2.16,<5.3.0`、DRF、Pydantic、label-studio-sdk、云存储 SDK 等；社区默认 SQLite，Compose 明确选择 PostgreSQL/Nginx。前端为 React 18.3.1、MobX/MobX-State-Tree、Konva 等，当前构建配置采用 Bun 1.3.11/Vite；README 中旧 Poetry/Windows Python 3.8 示例不能代替当前依赖声明。[C3]、[C6]、[C7]、[C8]
- **模型支持：** 可连接不同模型的外部服务；可包装 OCR、分类、分割、ASR 或 LLM，并支持预标注、交互及后端实现的训练接口。模型、权重、prompt、计算资源和服务状态由模型接入方提供。仓库连接/训练接口不意味着每个模型能自动训练，更不意味着完成本项目模型实验室与 RLHF。[C33]、[C34]、[C35]
- **扩展机制：** XML 标签配置、项目模板、REST API、独立 Python SDK、存储连接与 Webhook 是社区版主要扩展方式。可通过源码开发扩展，但企业级 JS 插件、可编程 React UI 和白标产品需单独判断。官方自 1.11.0 起弃用编辑器的独立库发行；源码保留 standalone 构建，不等于旧 npm/CDN 嵌入方案仍受支持。[C11]、[C12]、[C52]、[C53]

**部署与异步任务：** 默认社区部署保持相对简洁，有 SQLite 与文件持久化路径，Compose 提供 PostgreSQL 组合。源码包含 Redis/RQ 任务组织，但默认 `REDIS_ENABLED=False`，任务辅助函数在无 Redis 时同步执行，或按 `allow_sync` 配置跳过；不能由依赖中有 Redis/RQ 推断所有导入/导出和模型调用都已具备持久化异步任务能力。特别是社区 UI 导出仍需考虑同步请求与实际规模。[C8]、[C54]、[C55]、[C40]

**接口与结果格式：** 业务接入要对齐项目 label_config、任务字段、结果标签引用、区域坐标及模型版本。平台自身的 JSON 格式包含标注结构，不等于本项目最终使用的 SFT、回答优劣比较或知识库数据格式；要明确采用哪些人工结果、如何排除草稿/取消或未确认内容，再转换为发布成果。

**私有化与信创：** 可本地运行标注界面、数据库和自建模型，素材也可走私有存储；第三方 URL、云模型、存储和遥测需要逐项配置。此调研没有证明国产操作系统/数据库/算力的兼容性；模型运行环境还与 ML Backend 自身依赖有关。

## 3.1.6 与本项目的关系

### 可直接集成的能力

优先候选是 REQ-SJZS-036/037 的人工问答/图像标注界面、待标注任务接入与预览（023、025）、模型预标注协议、标注结果保存和导出。API、SDK 与 Webhook 可用于把工作台接入本项目，而不是要求人员在全部加工环节手工搬运文件。

需要重点补齐 REQ-SJZS-038/039/042 的正式审核、批准发布、业务版本和分级权限。社区版的修改操作与结果文件已经提供部分基础，但缺少本项目要求的完整审核职责与发布流程；商业功能不能直接作为免费基础组件写进交付要求。

**与前四个项目的候选分工：**

| 组件 | 较适合承担的环节 | 与 Label Studio 的接入边界 |
| --- | --- | --- |
| MinerU / Docling | 文档结构、文字、表格、公式、图片/页面及来源准备。 | 把解析元素转换成任务 data/meta 和素材引用；多页标注还需明确图片/页号关联，不能直接把解析 JSON 当标注协议。 |
| Data-Juicer | 去重、过滤、脱敏、规范化和其它语料加工。 | 清洗后的条目进入标注；人工结果可返回后续加工，但必须保留资料 ID 和确认状态。 |
| Easy Dataset | 生成、整理及导出待审核问答。 | 可将候选问答作为 Label Studio 任务/预测输入，需按配置转换；本次未搭建或证明现成连接器已接通。 |
| Label Studio | 多模态人工标注、候选结果修正、偏好与评价数据采集。 | 本项目负责角色、审核、版本、成果目录和发布规则，模型能力通过后端或结果导入接入。 |

以上是选型分工建议，未实际构建工具之间的处理流程。可按本项目常见任务验证界面和协议后决定集成范围；同一数据不应因为进入工具就失去原文、来源或加工版本关联。

### 可借鉴的设计理念

- **将任务、模板和结果分开：** 资料字段与标签配置独立，标注界面可围绕不同科研任务组织。
- **模型建议保留人工确认入口：** 预标注不自动升级为已审核成果，记录模型与人工分别做了什么。
- **多模态资料同时呈现：** QA 可以同时显示问题、答案、原文或图片，方便核查语境。
- **分离草稿与提交结果：** 用户继续工作时保留临时内容，成果生产只读取明确选定的提交记录。
- **对接口、坐标和导出范围作明确约定：** 不以“导出成功”判断已获得所需的完整、正确训练数据集。

### 本项目相对优势

以下对比仅表示**本项目需求设计的业务范围**，不代表本项目已经实现或验收完成。

| 本项目规划的能力 | Label Studio 社区版当前边界 |
| --- | --- |
| 数据需求、用途、来源授权及质量规划（013–021） | 项目有配置、说明与任务，缺少完整建设前置表单、责任审批和数据集生命周期。 |
| 数据字典、土壤规则、去重/脱敏/过滤（004–006、028） | 标签配置用于收集结果；不是农业清洗标准或可组合语料清洗平台。 |
| 专业 PDF/WORD/EXCEL 解析与知识片段（029–033） | 展示、引用或标注资料；需外部解析/切片，不提供同等文档结构化流程。 |
| MySQL 字段筛选与实时结构化采集（024） | 数据导入/存储接入为主。应用数据库配置项不是业务 MySQL 数据采集器。 |
| 自动 QA 提取、SFT 增强和图片 QA 生产（034、035、037） | 有人工模板与 ML 接入，自动生成业务需外部模型、prompt 和输出转换。 |
| 审核、自然语言质检代码运行、发布（038） | 社区版可查看/修改标注；缺少完整 Reviewer 审批流程，也没有该需求的质检代码生成执行工作台。 |
| 每次加工自动新版本、切换及标记发布（039） | 有导出快照、模型版本和状态基础，未形成需求所述原文/QA 数据集业务版本体系。 |
| 模型上架权限、多轮聊天和综合评测（001–003、040） | 接入模型和采集人工评分；商业 Chat/Prompts/自动 benchmark 不属于社区版完整能力。 |
| 成果门户、申请下载、统一目录、精细权限及资产 API（008–010、041–043） | 项目列表/API/基础鉴权不是完整数据资产服务，角色/项目/数据等级权限与发布审计需补齐。 |
| 农业科研助手及 LLM 原生论文知识库 | 标注可供训练/评价与资料核查；未提供论文信息提取与知识关联、统一的概念索引、跨文献推理和完整科研应用。 |

### 本项目相对短板

Label Studio 已有多类型标注控件、模板配置、草稿/结果组织、模型预标注和交互接入，以及数据导出和事件接口。本项目需求明确提出问答/图像人工与智能标注，但尚未细化这些交互、区域关联、坐标和结果协议。

可重点借鉴图片区域与文本联合标注、原资料和候选答案对照、草稿恢复、快捷操作、偏好/评分采集，以及模型建议到人工结果的追踪方式。音视频和时间序列标注超出部分既定要求，可作为资料类型扩展方向，不能据此直接增加建设范围。

## 3.1.7 调研结论

| 评估项 | 结论 |
| --- | --- |
| 推荐集成/借鉴程度 | **标注交互借鉴：高；社区版直接覆盖本项目完整流程：中。** 人工问答/图像标注、预标注、结果和 API 较适合接入，正式审核、分级权限、版本与发布仍有缺口；不宜按商业版功能清单承诺免费社区版交付。 |
| 技术成熟度 | **高（核心标注工具）；本项目适配未验证。** 项目长期维护，控件、数据管理、模型接口和导出已有实现与测试。当前分析对象为 dev 分支，未运行实例或农业样本，不能证明稳定版效果、并发、标注效率与信创验收。 |
| 社区活跃度 | **高（开发活动）。** 近三个月本地可达历史 833 次提交；稳定版发布存在较长间隔，Issue 小样本未见维护者公开回复，不以提交频率推断问题响应或支持承诺。 |
| 一句话总结 | **Label Studio 是本项目人工与模型辅助标注的重要候选，应优先验证社区版界面与数据协议，并由本项目补齐审核、权限、版本及成果发布。** |

### 调研依据与待验证事项

本次核对了项目/任务/annotation/prediction/draft、XML 配置与社区模板、核心编辑器标签、数据管理/导入/存储、ML 调用与交互限制、导出/快照、权限及 API/Webhook。以固定提交和明确 edition 标注为依据，不把 Enterprise 文档、共享字段或外部模型教程视为本次实测。

**实际体验与截图尚未完成。** 后续可用农业 QA、病虫害图片和解析后的多页论文资料，核查创建任务、人工修正、草稿恢复、中文文本区间、图像坐标/旋转、多页索引、预测到人工结果关联和目标导出格式。模型辅助需分别验证普通批量与交互后端，不能只看健康检查成功。

同时核验多人访问与职责隔离、标注配置变化对旧结果的影响、筛选后导出范围、跳过/取消/未确认内容处理、快照与数据版本的关联、Webhook 失败状态，以及目标规模下的导入/导出耗时。若采用正式稳定版，应重新核对本报告 dev 分支涉及的功能和依赖。

栏目沿用 `docs/平台调研/开源平台调研模板.docx`；需求对应以 V2 需求说明书第 5 章为依据。时效性数据采集于 2026-10-13；提交数包含合并提交，不等于独立功能数量。未修改已有报告或源码。

[S1]: https://api.github.com/repos/HumanSignal/label-studio
[S2]: https://github.com/HumanSignal/label-studio/releases/tag/v.0.1.0
[S3]: https://github.com/HumanSignal/label-studio/commit/94d36bd4eed1640fa39676d553943f6a349aa525
[S4]: https://github.com/HumanSignal/label-studio/releases/tag/1.23.2
[S5]: https://api.github.com/repos/HumanSignal/label-studio/releases?per_page=100
[S6]: https://api.github.com/repos/HumanSignal/label-studio/issues?state=all&sort=created&direction=desc&per_page=50
[C1]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/README.md
[C2]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/LICENSE
[C3]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/pyproject.toml
[C4]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/web/libs/editor/LICENSE
[C5]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/guide/label_studio_compare.md
[C6]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/web/package.json
[C7]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docker-compose.yml
[C8]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/core/settings/label_studio.py
[C9]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/projects/models.py
[C10]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/tasks/models.py
[C11]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/guide/setup.md
[C12]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/core/label_config.py
[C13]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/data_import/models.py
[C14]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/data_import/functions.py
[C15]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/io_storages/urls.py
[C16]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/guide/manage_data.md
[C17]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/data_manager/actions/basic.py
[C18]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/templates/relation_extraction.md
[C19]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/templates/question_answering.md
[C20]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/annotation_templates/generative-ai/supervised-llm/config.yml
[C21]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/web/libs/editor/src/tags/control/RectangleLabels.jsx
[C22]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/templates/image_captioning.md
[C23]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/templates/visual_question_answering.md
[C24]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/web/libs/editor/src/tags/object/Pdf.jsx
[C25]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/templates/multi-page-document-annotation.md
[C26]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/templates/pdf_ocr.md
[C27]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/templates/transcribe_audio.md
[C28]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/web/libs/editor/src/tags/object/Video/Video.js
[C29]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/web/libs/editor/src/tags/object/TimeSeries.jsx
[C30]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/annotation_templates/generative-ai/human-feedback-collection/config.yml
[C31]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/templates/generative-llm-ranker.md
[C32]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/guide/predictions.md
[C33]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/guide/ml.md
[C34]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/ml/models.py
[C35]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/ml/api.py
[C36]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/guide/labeling.md
[C37]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/tasks/serializers.py
[C38]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/projects/functions/next_task.py
[C39]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/web/apps/labelstudio/src/pages/Settings/GeneralSettings.jsx
[C40]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/guide/export.md
[C41]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/data_export/models.py
[C42]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/data_export/api.py
[C43]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/core/urls.py
[C44]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/guide/sdk.md
[C45]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/guide/access_tokens.md
[C46]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/webhooks/models.py
[C47]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/webhooks/utils.py
[C48]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/core/permissions.py
[C49]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/projects/mixins.py
[C50]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/ml_models/README.md
[C51]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/ml_model_providers/README.md
[C52]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/docs/source/guide/frontend.md
[C53]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/web/libs/editor/README.md
[C54]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/core/settings/base.py
[C55]: https://github.com/HumanSignal/label-studio/blob/94d36bd4eed1640fa39676d553943f6a349aa525/label_studio/core/redis.py
