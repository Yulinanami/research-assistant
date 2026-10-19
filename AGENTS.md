# Repository Guidelines

## Project Structure & Module Organization

This repository holds research documents, not application code. `docs/` contains the work plan, requirements specification, and `会议记录.md`. Under `docs/平台调研/`, numbered folders hold reports for Easy Dataset, Data-Juicer, MinerU, Docling, Label Studio, and Argilla. `调研分析总结/` contains comparisons, workflows, conversion analysis, and demonstration commands; `数据加工调研目标和方法/` contains research objectives and methods. Use `开源平台调研模板.docx` as the report template.

## Research and Development Workflow

There are no repository build, install, or test commands. Read the work plan, requirements, and report template before researching. Deliver reports as Markdown; Word documents provide templates and reference material. Keep demonstration commands and configurations in `docs/平台调研/调研分析总结/4.平台命令与配置.md`. Preserve commands exactly when collecting them; verify any requested changes against the relevant platform and environment.

## Writing Style & Naming Conventions

Write concise Chinese using familiar, specific function names. Preserve platform names and technical terms. Strictly follow the template's section order and numbering, and preserve user-written basic information unless explicitly asked to change it. Map capabilities to requirement function names rather than bare requirement IDs. Keep reports under `docs/平台调研/<number>. <platform>/`, such as `1. Easy dataset/EasyDataset.md`. Avoid duplicate explanations and committing Word temporary files named `~$*.docx`.

## Validation

No automated test framework, formatter, linter, or coverage target is configured. Distinguish hands-on observations, official documentation, source analysis, and inference; do not describe untested capabilities as verified. Cite sources and observation dates for changing facts. Check template completeness, links, and diagram rendering. Inspect tables and pagination when editing Word files. Use `git status --short` to review scope and `git diff --check` to catch whitespace errors.

## Commits & Pull Requests

Existing commits use short Chinese subjects such as `添加: 平台调研文档` and `完善：平台调研基础信息`. Follow this pattern and name the affected document or platform. Pull requests should summarize changes, sources, observation dates, and incomplete findings. Include screenshots when they support a specific observation.
