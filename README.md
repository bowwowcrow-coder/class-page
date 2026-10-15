# 수업 페이지

구글 시트 + Apps Script 수업 웹앱.

- `gas/` — Apps Script 프로젝트에 들어가는 파일 (Code.gs, Index.html, Setup.html, Demo.gs)
- `gas/release.json` — 버전과 파일 해시. 이 값이 바뀌면 자동 업데이트가 새 코드를 가져간다.
- `appsscript.json` — 처음 한 번 프로젝트에 붙여 넣는 설정 (자동 업데이트 권한 포함). 자동 업데이트는 이 파일을 덮어쓰지 않는다.
- `tools/release.js` — 코드 수정 후 `node tools/release.js "바뀐 내용"` 으로 release.json 갱신.

## 자동 업데이트 켜는 법 (처음 한 번)
1. https://script.google.com/home/usersettings → Google Apps Script API **사용**
2. Apps Script 편집기 › 프로젝트 설정 › "편집기에서 appsscript.json 매니페스트 파일 표시" 체크 → `appsscript.json` 내용을 이 저장소의 것으로 교체
3. Code.gs, Index.html 을 이 저장소 것으로 교체하고 저장
4. 시트 새로고침 › 수업 관리 › 자동 업데이트 › 켜기 → 권한 허용

이후에는 이 저장소의 main 브랜치에 올라온 코드가 5분 안에 웹앱(같은 주소)에 반영된다.
