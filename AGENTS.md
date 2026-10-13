# Repository Guidelines

## Project Structure & Module Organization

This repository holds research documents, not application code. `docs/开源平台调研工作计划.docx` defines the platform list, assignments, and deliverables. `docs/平台调研/开源平台调研模板.docx` is the report template; keep individual platform work under `docs/平台调研/<number>. <platform>/` (for example, `1. Easy dataset/EasyDataset.docx`). `docs/会议记录.md` records working agreements, and the requirements specification in `docs/` provides project context. There are currently no source, test, or asset directories.

## Research and Development Workflow

There is no build, install, or local run command for this documentation-only repository. Read the work plan and report template before starting a platform. The plan calls for a final Markdown report for each platform; the existing EasyDataset Word file is a working draft. Use the template's sections for basic information, feature mapping, advantages, architecture, relationship to this project, and conclusions. Personally try the platform where practical, then use its official site and repository to verify claims. Record the source and observation date for changing facts such as stars, releases, and maintenance activity.

## Writing Style & Naming Conventions

Use descriptive headings and concise Chinese prose consistent with the existing documents. Keep platform names, repository URLs, and technical terms exact. Preserve the template's section order and terminology, including the column that maps features to this project's requirements. Name new platform folders with the numbered pattern already in use; keep related drafts in the same folder. Avoid committing Word temporary files named `~$*.docx`.

## Validation

No automated test framework or coverage target exists. Before submitting, check that each template section is complete, links and factual claims have sources, and comparisons distinguish observed behavior from inference. Open edited Word files to inspect tables and pagination. Run `git status --short` to review changed files and `git diff --check` to catch whitespace errors in tracked text files.

## Commits & Pull Requests

The visible Git history contains one commit, `添加: 计划文档`, so it does not establish a broad convention. Use a short, descriptive commit subject naming the document or platform. In a pull request, summarize the platform researched, source links, observation date, and any incomplete template fields. Include screenshots only when they support a specific interface or workflow finding.
