/**
 * 체험용 데이터 채우기
 *
 * ★ 실제 수업에 쓰는 시트에는 이 파일을 넣지 마세요. "사본"에만 넣습니다. ★
 *
 * 쓰는 법
 *  1) 실제 스프레드시트에서 파일 > 사본 만들기
 *  2) 사본의 확장 프로그램 > Apps Script 에서 스크립트 파일을 하나 추가(이름: Demo)하고 이 내용을 붙여넣기
 *  3) 사본 시트를 새로고침 → 메뉴 [수업 관리] > 체험용 데이터 채우기
 *  4) 배포 > 새 배포 > 웹 앱 (실행: 나 / 액세스: 모든 사용자) → 이 주소를 공유
 */

const DEMO_PASSWORD = 'demo1234'; // 체험용 교사 화면 비밀번호
const DEMO_PIN = '2580';          // 바로 들어가 볼 수 있는 체험 학생(10101 김하늘)의 PIN
const DEMO_CODE = '1111';         // 나머지 가상 학생의 확인코드 (처음 접속 → PIN 만들기 체험용)
const DEMO_IMAGES = ["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"];   // 가상 제출물에 쓰는 작은 예시 그림 (JPEG)

function fillDemoData() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const count = function (name) { const sh = ss.getSheetByName(name); return sh ? Math.max(sh.getLastRow() - 1, 0) : 0; };
  const students = count(SHEET.STUDENTS), subs = count(SHEET.SUBS);
  const ask = ui.prompt('체험용 데이터 채우기',
    '이 시트의 수업, 학생, 공지, 레퍼런스, 과제, 제출, 채점, 로그를 모두 지우고 가상 데이터로 바꿉니다.\n' +
    '지금 들어 있는 학생 ' + students + '명, 제출 ' + subs + '건이 지워지며 되돌릴 수 없습니다.\n\n' +
    '실제 수업용 시트가 아니라 "사본"이 맞다면 아래 칸에 체험용 이라고 입력하세요.', ui.ButtonSet.OK_CANCEL);
  if (ask.getSelectedButton() !== ui.Button.OK || ask.getResponseText().trim() !== '체험용') {
    ui.alert('취소했습니다. 아무것도 바뀌지 않았습니다.');
    return;
  }

  // 제출 파일 폴더를 실제 것과 분리한 뒤 시트 구조를 맞춘다 (사본에 폴더 정보가 따라왔을 경우를 대비)
  const props = PropertiesService.getScriptProperties();
  props.getKeys().forEach(function (k) { if (k === 'ROOT_FOLDER' || k.indexOf('TASK_FOLDER_') === 0) props.deleteProperty(k); });
  setup();
  saveCfg_({ idShape: '1,2,2', codeLabel: DEFAULTS.codeLabel, codeHint: DEFAULTS.codeHint }); // 체험용 학번(10101 등)에 맞춘다
  props.setProperty('ROOT_FOLDER', DriveApp.createFolder(cfg_().title + ' 체험용 제출함').getId());

  const now = Date.now(), DAY = 86400000;
  const at = function (days) { return new Date(now + days * DAY); };

  // 1) 기록 비우기
  [SHEET.COURSES, SHEET.STUDENTS, SHEET.NOTICES, SHEET.REFS, SHEET.TASKS, SHEET.SUBS, SHEET.GRADES, SHEET.ALLOW, SHEET.LOG, SHEET.SURVEYS, SHEET.ANSWERS, SHEET.MEMES, SHEET.ATTEND].forEach(function (name) {
    const sh = sheet_(name);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getMaxColumns()).clearContent();
  });
  const put = function (name, rows) { sheet_(name).getRange(2, 1, rows.length, rows[0].length).setValues(rows); };

  // 2) 수업, 학생
  put(SHEET.COURSES, [
    ['디일', '디자인 일반', '교과', '체험용 1학년', '101,102', true],
    ['학급', '우리 반', '학급', '체험용 1학년 1반', '101', true]
  ]);
  const names = [['10101', '김하늘'], ['10102', '이바다'], ['10103', '박노을'], ['10104', '최가람'], ['10105', '정이슬'], ['10106', '한마루'],
    ['10201', '윤새벽'], ['10202', '강다온'], ['10203', '조한별'], ['10204', '임나래']];
  const salt = Utilities.getUuid();
  put(SHEET.STUDENTS, names.map(function (s, i) {
    // 첫 학생만 PIN을 미리 만들어 둔다. 나머지는 확인코드로 PIN 만들기를 체험한다.
    return i === 0 ? [s[0], s[1], '', DEMO_CODE, hashPin_(DEMO_PIN, salt), salt, 0, '', at(-1), '']
                   : [s[0], s[1], '', DEMO_CODE, '', '', '', '', '', ''];
  }));

  // 3) 공지, 레퍼런스, 과제
  put(SHEET.NOTICES, [
    [at(0), '', '체험용 페이지입니다', '학생 화면과 교사 화면을 자유롭게 눌러 보세요.\n여기 나오는 학생과 점수는 모두 가상입니다.', '', true, true],
    [at(-1), '디일', '포스터 스케치 제출 안내', '이미지 1~3장과 설명 PDF 1개를 올립니다.', '', false, true],
    [at(-2), '학급', '현장체험학습 동의서', '서명한 동의서를 금요일까지 제출합니다.', '', false, true]
  ]);
  put(SHEET.REFS, [
    ['디일', '레퍼런스 찾기', 'Pinterest', '키워드로 이미지 모으기', 'https://www.pinterest.com', true, ''],
    ['디일', '레퍼런스 찾기', 'Behance', '현업 디자이너의 작업 과정 보기', 'https://www.behance.net', true, ''],
    ['디일', '수업 자료', '색 조합 점검표', '명도 대비, 포인트 색 1개', '', true, '']
  ]);
  const scale = 'A:20, B:17, C:14, D:11, E:7, 미제출:4';
  put(SHEET.TASKS, [
    ['DEMO1', '디일', '포스터 스케치', '포스터 스케치 이미지와\n의도를 설명한 PDF 제출', at(-14), at(7), true, '이미지|이미지|1|3; 설명|PDF|1|1', true, true, scale, true],
    ['DEMO2', '디일', '캐릭터 디자인', '캐릭터 전신 이미지와\n이름, 성격 등을 정리한 설정집 제출', at(5), at(12), true, '이미지|이미지|1|5; 설정집|PDF|1|1', false, false, scale, false],
    ['DEMO3', '학급', '동의서 제출', '서명한 동의서를 PDF로 올립니다.', at(3), at(3), true, '동의서|PDF|1|1', false, false, '', false]
  ]);

  // 4) 가상 제출물 (포스터 스케치): 정시, 지각 2·5·9일, 마감 후 허용, 미제출이 고루 보이게
  const task = getTask_('DEMO1');
  const due = task.due.getTime();
  const pdf = Utilities.newBlob('<h2>포스터 스케치 설명</h2><p>체험용으로 만든 가상 문서입니다.</p>', 'text/html', 'demo.html').getAs('application/pdf').getBytes();
  //            학번,   상태,  지연일, 제출 시각(마감 기준 일수)
  const plan = [['10101', '정시', 0, -1], ['10102', '정시', 0, -2], ['10103', '지각', 2, 2], ['10105', '지각', 5, 5],
    ['10106', '정시', 0, -1], ['10201', '지각', 9, 9], ['10202', '정시', 0, -3], ['10204', '예외', 12, 12]];
  const nameOf = {};
  names.forEach(function (s) { nameOf[s[0]] = s[1]; });
  const taskFolder = taskFolder_(task);
  const subRows = plan.map(function (p, i) {
    const id = p[0], name = nameOf[id], when = new Date(due + p[3] * DAY - 3600000);
    const base = baseName_(task, id, name);
    const folder = childFolder_(taskFolder, id + '_' + name).createFolder('제출_' + Utilities.formatDate(when, TZ, 'yyyyMMdd-HHmmss'));
    const imgBytes = Utilities.base64Decode(DEMO_IMAGES[i % DEMO_IMAGES.length]);
    const img = folder.createFile(Utilities.newBlob(imgBytes, 'image/jpeg', base + '_이미지1.jpg'));
    const doc = folder.createFile(Utilities.newBlob(pdf, 'application/pdf', base + '_설명.pdf'));
    const thumb = folder.createFile(Utilities.newBlob(imgBytes, 'image/jpeg', base + '_썸네일.jpg'));
    const zip = folder.createFile(Utilities.zip([img.getBlob(), doc.getBlob()], base + '.zip'));
    const files = [{ n: img.getName(), id: img.getId(), s: 0, o: 1, r: 1 }, { n: doc.getName(), id: doc.getId(), s: 1, o: 1 }, { n: thumb.getName(), id: thumb.getId(), s: -1 }];
    return [task.id, id, name, when, when, p[1], p[2], 1, folder.getId(), zip.getId(), thumb.getId(), JSON.stringify(files)];
  });
  put(SHEET.SUBS, subRows);

  // 5) 가상 채점: 확인 완료, 확인 전, 미채점, 채점 후 재제출이 고루 보이게
  //                학번,   등급, 점수, 채점 시각(오늘 기준), 공개 메모, 확인 여부, 비공개 메모
  const grades = [['10101', 'A', 20, -1, '', true, ''], ['10102', 'B', 17, -1, '색 대비를 조금 더 살려 보세요.', false, '구도는 좋음'],
    ['10103', 'B', 17, -13, '', false, ''],   // 채점 뒤에 다시 제출한 예 → 현황판에 "재제출"
    ['10104', '미제출', 4, -1, '', false, ''], ['10106', 'A', 20, -1, '', true, ''],
    ['10201', 'C', 14, -1, '설명 PDF를 보충해서 다시 내 주세요.', false, ''], ['10204', 'D', 11, -1, '', false, '']];
  put(SHEET.GRADES, grades.map(function (g) {
    return [task.id, g[0], nameOf[g[0]], g[1], g[2], at(g[3]), g[4], g[5] ? at(-0.5) : '', g[5] ? g[2] : '', g[6]];
  }));
  put(SHEET.ALLOW, [[task.id, '10103', at(-13)]]);

  // 6) 교사 비밀번호, 로그인 화면 안내, 로그
  const tsalt = Utilities.getUuid();
  props.setProperties({ T_SALT: tsalt, T_HASH: hashPin_(DEMO_PASSWORD, tsalt),
    LOGIN_NOTE: '체험용 계정\n학생: 학번 10101, 이름 김하늘, PIN ' + DEMO_PIN + '\n처음 접속 체험: 학번 10102, 이름 이바다, 휴대폰 뒤 4자리 ' + DEMO_CODE + '\n교사용 비밀번호: ' + DEMO_PASSWORD });
  log_('', '교사', '체험용 데이터 생성', '');

  ui.alert('체험용 데이터를 채웠습니다.\n\n' +
    '학생: 학번 10101, 이름 김하늘, PIN ' + DEMO_PIN + '\n' +
    '처음 접속 체험: 학번 10102(이바다) 등, 휴대폰 뒤 4자리 ' + DEMO_CODE + '\n' +
    '교사 화면 비밀번호: ' + DEMO_PASSWORD + '\n\n' +
    '이 안내는 로그인 화면 아래에도 표시됩니다.\n이제 배포 > 새 배포 > 웹 앱으로 주소를 만들어 공유하세요.');
}

/**
 * 배포용 원본으로 비우기 — 다른 선생님께 나눠 줄 깨끗한 사본을 만든다.
 * ★ 실제 수업용 시트가 아니라 "사본"에서만 실행하세요. ★
 * 수업, 학생, 공지, 레퍼런스, 과제, 제출, 채점, 로그와 교사 비밀번호, 앱 이름 등의 설정을 모두 지운다.
 */
function makeBlankTemplate() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const count = function (name) { const sh = ss.getSheetByName(name); return sh ? Math.max(sh.getLastRow() - 1, 0) : 0; };
  const ask = ui.prompt('배포용 원본으로 비우기',
    '이 시트의 수업, 학생 ' + count(SHEET.STUDENTS) + '명, 공지, 과제, 제출 ' + count(SHEET.SUBS) + '건, 채점, 로그와\n' +
    '교사 비밀번호, 앱 이름·학교 이름 설정을 모두 지웁니다. 되돌릴 수 없습니다.\n\n' +
    '실제 수업용 시트가 아니라 "사본"이 맞다면 아래 칸에 배포용 이라고 입력하세요.', ui.ButtonSet.OK_CANCEL);
  if (ask.getSelectedButton() !== ui.Button.OK || ask.getResponseText().trim() !== '배포용') {
    ui.alert('취소했습니다. 아무것도 바뀌지 않았습니다.');
    return;
  }
  setup();
  [SHEET.COURSES, SHEET.STUDENTS, SHEET.NOTICES, SHEET.REFS, SHEET.TASKS, SHEET.SUBS, SHEET.GRADES, SHEET.ALLOW, SHEET.LOG, SHEET.SURVEYS, SHEET.ANSWERS, SHEET.MEMES, SHEET.ATTEND].forEach(function (name) {
    const sh = sheet_(name);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getMaxColumns()).clearContent();
  });
  sheet_(SHEET.COURSES).getRange(2, 1, 1, 6).setValues([['수업1', '수업 이름', '교과', '1학년', '', false]]);
  const blank = {};
  Object.keys(DEFAULTS).forEach(function (k) { blank[k] = DEFAULTS[k]; });
  saveCfg_(blank);
  const props = PropertiesService.getScriptProperties();
  props.getKeys().forEach(function (k) {
    if (k === 'T_HASH' || k === 'T_SALT' || k === 'ROOT_FOLDER' || k === 'LOGIN_NOTE' || k === 'WEB_URL' || k.indexOf('MEME_') === 0 || k.indexOf('TASK_FOLDER_') === 0 || k.indexOf('SYNC_') === 0 || k === 'DEPLOY_ID') props.deleteProperty(k);
  });
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'autoSyncTick') ScriptApp.deleteTrigger(t); });
  startSheet_(ss); // 받는 선생님이 열자마자 보게 될 안내 탭
  try { ss.setActiveSheet(ss.getSheetByName(SHEET.START)); ss.moveActiveSheet(1); } catch (e) {}
  ui.alert('배포용 원본이 됐습니다.\n\n' +
    '나눠 주는 방법\n' +
    '1. 이 스프레드시트의 공유를 "링크가 있는 모든 사용자: 뷰어"로 바꿉니다.\n' +
    '2. 주소 끝의 /edit 부터를 /copy 로 바꾼 링크를 전달합니다. 받은 선생님이 누르면 자기 계정에 사본이 생깁니다.\n' +
    '3. 받은 선생님은 사본을 열면 맨 앞의 [시작하기] 탭을 보고 따라 하면 됩니다.\n\n' +
    '이 원본에는 Demo 파일이 들어 있습니다. 나눠 주기 전에 편집기에서 Demo 파일을 지워 두면 받는 쪽에 위험한 메뉴가 보이지 않습니다.');
}
