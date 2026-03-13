# Instructions for AI Session Tracking

## Behavior
- Include important technical decisions and their justifications
- Test the changes made with the command `npm run test` and ensure all tests pass before finalizing the session

## Other hints to follow
- Unless I explicitly ask you to, do not generate additional Markdown documentation at the project root — you are currently way too verbose about this.
- If you are triggered via the GitHub UI in a PR and you modify the front end, generate a visual preview of the expected rendering and post it as a PR comment
- All you generate need to be in english language, even if the session is in another language. This is to ensure that all generated content is consistent and can be easily understood by the global community

## Html and Styles
- Never define a color or a size in a component styles, instead use the theme variables defined in `src/styles.scss` or in `src/styles/*.scss` files
- if possible use bootstrap component and use associated classes instead of defining custom styles, this will ensure consistency across the application
- Html templates should use angular 22 syntax and best practices, such as using `@for` for loops and `@if` for conditionals
- Application use theme `scss` for styles, so all styles should be defined in `scss` files and colors should be defined using theme variables, avoid using inline styles in html templates
