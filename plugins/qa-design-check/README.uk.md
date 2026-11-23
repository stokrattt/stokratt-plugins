# qa-design-check

Плагін для Claude Code, який звіряє Figma-фрейм із живою сторінкою і показує кожну конкретну
розбіжність: значення з макета і значення зі сторінки поруч.

Він перевіряє кольори, шрифти, відступи, радіуси і розміри. Ще він показує елементи на сторінці,
яких немає в макеті, текст, що відрізняється від макета, і повторювані елементи (картки, пункти
списку), які не збігаються між собою. Результат: звіт у терміналі, HTML-звіт із макетом і сайтом
поруч, скріншоти з розміткою і готовий коментар для Jira.

## Що потрібно

- Node.js 18 або новіший
- [`playwright-cli`](https://www.npmjs.com/package/@playwright/cli) у `PATH`
- Доступ до Figma, один із двох:
  - Figma MCP сервер (потрібен Dev seat у Figma), або
  - персональний токен Figma зі скоупом `File content: Read`

## Встановлення

```bash
claude plugin marketplace add stokrattt/stokratt-plugins
claude plugin install qa-design-check@stokratt-plugins
```

## Використання

```
/qa-design-check https://www.figma.com/design/FILEKEY/Shop?node-id=1-2 https://staging.example.com/
```

Скіл питає, як читати макет (MCP чи токен), які стани і теми перевірити, тоді запускає звірку
і друкує звіт. Для шляху з токеном перший запуск просить один раз зберегти токен. Він лежить у
`~/.config/qa-design-check/config.json`, поза будь-яким репозиторієм.

Технічні деталі англійською: [skills/qa-design-check/README.md](skills/qa-design-check/README.md).

English version: [README.md](README.md).
