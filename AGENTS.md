# Repository Guidelines

## Project Structure & Module Organization
- `app/src/main/java/` — Kotlin source (Compose UI, data, domain, reminders, location).
- `app/src/main/res/` — Android resources (layouts, drawables, strings, themes).
- `app/src/test/` — JVM unit tests.
- `app/src/androidTest/` — Instrumentation/UI tests.
- `app/schemas/` — Room schema snapshots.

## Build, Test, and Development Commands
- `.\gradlew.bat installDebug` (Windows) / `./gradlew installDebug` (macOS/Linux)  
  Builds and installs the debug APK on a connected device/emulator.
- `.\gradlew.bat test` / `./gradlew test`  
  Runs JVM unit tests.
- `.\gradlew.bat connectedAndroidTest` / `./gradlew connectedAndroidTest`  
  Runs instrumentation tests on a connected device/emulator.

## Coding Style & Naming Conventions
- Kotlin + Jetpack Compose; 4‑space indentation.
- Use `PascalCase` for classes, `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants.
- Prefer explicit names for ViewModels and Screens (e.g., `TodayViewModel`, `SearchScreen`).
- No formatter enforced; keep diffs minimal and consistent with surrounding code.

## Testing Guidelines
- Unit tests in `app/src/test` using JUnit.
- UI/instrumentation tests in `app/src/androidTest`.
- Name tests `*Test.kt` with descriptive method names.
- When touching reminders, parsing, or recurrence logic, add/update unit tests.
- After adding, modifying, or deleting any feature:
  - Run a compile check (`.\gradlew.bat :app:compileDebugKotlin` or `./gradlew :app:compileDebugKotlin`).
  - Run the relevant tests (`.\gradlew.bat test` and `.\gradlew.bat connectedAndroidTest` when UI changes are involved).

## Commit & Pull Request Guidelines
- No strict commit convention observed; use short, imperative messages (e.g., “Fix reminder parsing”).
- PRs should include:
  - Summary of changes.
  - Screenshots/GIFs for UI changes.
  - Test results or rationale if tests were skipped.

## Security & Configuration Tips
- `local.properties` is for local secrets like `MAPS_API_KEY`; do not commit it.
- If you add new sensitive keys, document them in `README.md` and use placeholders in Gradle.
