# jira-qa

Скіли Claude Code, які тестують Jira-задачі в справжньому браузері й публікують результат коментарем у Jira. Без твого схвалення чернетки нічого не публікується, статус задачі не змінюється.

## Скіли

| Скіл | Виклик | Що робить |
| --- | --- | --- |
| `jira-qa` | `/jira-qa:jira-qa` | Тестує Jira-задачі через Playwright MCP. |
| `jira-qa-cli` | `/jira-qa:jira-qa-cli` | Той самий флоу через `playwright-cli`: доказ на кожну перевірку, аудит доказів, перевірка чернетки й чернетки багів. |
| `jira-qa-parallel-cli` | `/jira-qa:jira-qa-parallel-cli` | Кілька задач паралельно, по одному субагенту й одній сесії браузера на задачу. |
| `jira-qa-retest-cli` | `/jira-qa:jira-qa-retest-cli` | Ретест задачі на іншому середовищі за планом із `tested_tasks/<KEY>.md`. |

Кожен прогін тестує desktop, mobile і tablet, пише локальний лог у `tested_tasks/<KEY>.md` і пише коментар мовою тікета.

## Що потрібно

- Claude Code.
- Atlassian (Jira) MCP-сервер, підключений до Claude Code.
- `playwright-cli` для скілів `-cli` (`npm install -g @playwright/cli@latest`) або Playwright MCP для `jira-qa`.
- Node.js для перевірки чернетки в `scripts/check-qa-draft.mjs`.

## Налаштування

Скіли знаходять поля Jira за назвою, тому в проєкті має бути поле `Environment` з URL для тесту. Поля `Platform`, `Component` і `Expected result` необов'язкові. Черга за замовчуванням: `project = PROJ AND status = "Need QA"`, назви свій проєкт і статус, коли скіл спитає. Лейбл за замовчуванням: `ai-qa-tested`.

## Встановлення

```
claude plugin marketplace add stokrattt/stokratt-plugins
claude plugin install jira-qa@stokratt-plugins
```
