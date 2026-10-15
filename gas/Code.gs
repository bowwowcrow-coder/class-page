/**
 * 수업 페이지 · 여러 수업과 학급을 한 곳에서 (구글 시트 + Apps Script)
 * 4단계: 로그인(휴대폰 번호 확인 → PIN) + 홈 + 공지 / 레퍼런스 / 과제 제출·수정 + 교사 화면(현황, 모아보기, 평가표, 공지·레퍼런스·과제 만들기, 채점, 점수 공개·확인)
 *
 * 처음 설치하거나 코드를 바꾼 뒤
 *  1) 처음 설치할 때만: 편집기 위쪽 드롭다운에서 setup 선택 후 ▷ 실행 (드라이브 권한 승인 포함)
 *     이후 업데이트 때는 새 버전을 배포하고 웹앱에 한 번 접속하면 시트가 자동으로 맞춰진다
 *  2) 시트 메뉴 [수업 관리] > 교사 비밀번호 설정
 *  3) [학생] 시트에 학번, 이름, (필요하면 수업), 확인코드(학생 휴대폰 번호 뒤 4자리) 입력
 *  4) 배포 > 배포 관리 > 새 버전으로 배포
 */

// 앱 이름, 학교 이름, 학번 구조 같은 값은 코드가 아니라 [설정] 시트에 둔다.
// 시트 메뉴 [수업 관리] > 설정 도우미에서 바꾸며, 아래는 값이 비어 있을 때 쓰는 기본값이다.
const DEFAULTS = { title: '수업 페이지', school: '', tab: '', codeLabel: '휴대폰 번호 뒤 4자리', codeHint: '숫자 4자리', idShape: '1,2,2', accent: '', tint: '', themeCss: '', refsLabel: '자료' };
const CFG_KEYS = { title: '앱 이름', school: '학교 이름', tab: '탭 이름', codeLabel: '본인 확인 이름', codeHint: '본인 확인 안내', idShape: '학번 구조', accent: '포인트 색', tint: '배경 색감', themeCss: '화면 색 CSS', refsLabel: '자료 탭 이름' };
const CFG_HELP = {
  title: '로그인 화면과 상단에 보이는 이름', school: '로그인 화면 제목 위에 작게 보이는 글 (비워도 됨)',
  tab: '브라우저 탭 이름. 폰 홈 화면 아이콘에는 첫 글자가 들어간다 (비우면 앱 이름)',
  codeLabel: '처음 PIN을 만들 때 본인 확인에 쓰는 값의 이름 ([학생] 시트의 확인코드 열)', codeHint: '본인 확인 칸에 흐리게 보이는 안내',
  idShape: '학번의 자릿수: 학년,반,번호. 예) 10712 형식이면 1,2,2 / 1712 형식이면 1,1,2',
  accent: '버튼·링크 색 (설정 도우미의 색 원판에서 고른 값. 비우면 기본 파랑)', tint: '배경에 도는 색감 (비우면 기본 회색)',
  themeCss: '위 두 색으로 설정 도우미가 계산해 둔 값. 직접 고치지 마세요',
  refsLabel: '수업의 세 번째 탭 이름 (예: 자료, 레퍼런스, 링크). 넣은 자료가 없는 수업에서는 학생에게 이 탭이 보이지 않는다'
};
// 설정 도우미가 생기기 전부터 쓰던 시트는 예전에 보이던 그대로 이어 간다
const LEGACY = { school: '인천디자인고등학교', tab: '쉅', refsLabel: '레퍼런스' };
const SCHEMA_VERSION = '15';            // 시트 구조가 바뀌는 업데이트마다 올린다 → 첫 접속 때 setup이 자동으로 돈다
const TZ = 'Asia/Seoul';
const SHEET = { COURSES: '수업', STUDENTS: '학생', NOTICES: '공지', REFS: '레퍼런스', TASKS: '과제', SUBS: '제출', GRADES: '채점', ALLOW: '허용', LOG: '로그', CONFIG: '설정', START: '시작하기', SURVEYS: '설문', ANSWERS: '응답', MEMES: '메인짤', ATTEND: '출결' };

const PIN_LENGTH = 4;          // PIN 자릿수
const MAX_FAILS = 5;           // 연속 오류 허용 횟수
const LOCK_MINUTES = 10;       // 잠금 시간(분)
const SESSION_SECONDS = 21600; // 로그인 유지 6시간
const MB = 1024 * 1024;
const LIMIT = { image: 8 * MB, pdf: 10 * MB, file: 25 * MB, thumb: 1 * MB, text: 20000 };
const TEXT_MAX = 3000;         // 글 칸 최대 글자 수 // 파일 하나의 최대 크기

const COURSE_HEADERS = ['수업ID', '수업명', '종류', '대상', '자동 배정 반', '사용'];
const STUDENT_HEADERS = ['학번', '이름', '수업', '확인코드', 'PIN해시', '솔트', '실패횟수', '잠금해제시각', 'PIN설정일시', '최근로그인', '특이사항'];
const NOTICE_HEADERS = ['작성일', '수업', '제목', '내용', '대상 반', '고정', '게시'];
const REF_HEADERS = ['수업', '분류', '제목', '설명', '링크', '게시', '이미지'];
const TASK_HEADERS = ['과제ID', '수업', '제목', '설명', '정시마감', '최종마감', '게시', '제출 칸', '모아보기 공개', '모아보기 이름', '배점', '점수 공개'];
const SUB_HEADERS = ['과제ID', '학번', '이름', '제출일시', '최초제출일시', '상태', '지연일', '횟수', '폴더ID', 'ZIP', '썸네일', '파일', '대체'];
const GRADE_HEADERS = ['과제ID', '학번', '이름', '등급', '점수', '채점일시', '메모', '확인일시', '확인점수', '비공개 메모'];
const ALLOW_HEADERS = ['과제ID', '학번', '허용일시'];
const LOG_HEADERS = ['일시', '학번', '이름', '동작', '상세'];
const SURVEY_HEADERS = ['설문ID', '수업', '제목', '설명', '익명', '문항', '응답 받기', '마감', '게시', '참여'];
const ANSWER_HEADERS = ['설문ID', '학번', '이름', '응답일시', '응답'];
const ATTEND_HEADERS = ['날짜', '수업', '학번', '이름', '유형', '구분', '교시', '사유', '나이스 입력', '수정일시'];
const MEME_HEADERS = ['짤ID', '학번', '이름', '올린일시', '문구', '상태', '호수', '파일ID', '썸네일', '투표', '이름 공개'];
const C = { ID: 0, NAME: 1, COURSES: 2, CODE: 3, HASH: 4, SALT: 5, FAILS: 6, LOCK: 7, SETAT: 8, LAST: 9, NOTE: 10 };
const S = { TASK: 0, ID: 1, NAME: 2, AT: 3, FIRST: 4, STATE: 5, LATE: 6, COUNT: 7, FOLDER: 8, ZIP: 9, THUMB: 10, FILES: 11, ALT: 12 };

// 학생 특이사항. 현장실습·취업은 평가 과제를 '대체과제'로 낸다(형식·개수 제한 없음, 파일명 끝에 대체과제).
const STATUS_LIST = ['현장실습', '취업', '위탁', '특수'];
const ALT_STATUS = ['현장실습', '취업'];
const AWAY_STATUS = ['현장실습', '취업', '위탁']; // 수업에 나오지 않는 학생: 현황판에서 흐리게
const QUIET_STATUS = ['특수'];                    // 현황판·평가표에는 드러내지 않고 학생 창 안에서만 보인다
const ALT_SLOTS = [{ name: '대체과제', kind: 'file', min: 1, max: 20 }];
function statusOf_(v) { const s = String(v[C.NOTE] || '').trim(); return STATUS_LIST.indexOf(s) >= 0 ? s : ''; }
function boardNote_(status) { return QUIET_STATUS.indexOf(status) >= 0 ? '' : status; }
/** 이 학생이 이 과제를 대체과제로 내는가: 현장실습·취업 학생의 평가 과제 */
function isAlt_(task, status) { return ALT_STATUS.indexOf(status) >= 0 && task.scale.length > 0 && task.slots.length > 0; }
const G = { TASK: 0, ID: 1, NAME: 2, GRADE: 3, POINTS: 4, AT: 5, MEMO: 6, CONF: 7, CONFP: 8, PRIV: 9 };
const CHAR_SLOTS = '이미지|이미지|1|5; 설정집|PDF|1|1';
const CHAR_SCALE = 'A:20, B:17, C:14, D:11, E:7, 미제출:4';
const CHAR_DESC = '캐릭터 전신 이미지와\n이름, 성격 등을 정리한 설정집 제출';
const CHAR_DESC_OLD = '캐릭터 전체 모습이 보이는 이미지(여러 장 가능)와 세계관·이름·성격을 담은 설정집 PDF 1개를 제출합니다.';

/* ───────────── 웹앱 진입 ───────────── */

function doGet() {
  autoSetup_();
  rememberUrl_();
  const c = cfg_();
  let main = null;
  try { memeTick_(); main = memeMain_(); } catch (e) { console.error('메인 짤: ' + e); } // 짤이 말썽이어도 로그인 화면은 떠야 한다
  const pad = function (n, w) { let s = String(n); while (s.length < w) s = '0' + s; return s; };
  const t = HtmlService.createTemplateFromFile('Index');
  t.appTitle = c.title;
  t.appSub = c.school;
  t.codeLabel = c.codeLabel;
  t.codeHint = c.codeHint;
  t.idLen = c.id.len;
  t.idHint = '예: ' + pad(1, c.id.g) + pad(7, c.id.c) + pad(12, c.id.n);
  t.refsLabel = c.refsLabel;
  t.memeSrc = main ? main.src : '';
  t.memeCaption = main ? main.caption : '';
  t.memeIssue = main ? main.issue + '호' : '';
  t.memeCredit = main ? main.credit : '';
  t.themeCss = c.themeCss;               // 설정 도우미에서 고른 화면 색 (검증된 색 변수만)
  t.loginNote = PropertiesService.getScriptProperties().getProperty('LOGIN_NOTE') || ''; // 체험용 사본에서만 채워진다
  return t.evaluate()
    .setTitle(c.tab)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 웹앱 주소(/exec)는 배포된 웹앱이 열릴 때에만 정확히 알 수 있다. 처음 열릴 때 적어 두고 설정 도우미가 QR로 보여 준다. */
const WEB_URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^\/\s]+\/|macros\/)s\/[A-Za-z0-9_\-]+\/exec$/;
function rememberUrl_() {
  try {
    const url = String(ScriptApp.getService().getUrl() || '');
    const props = PropertiesService.getScriptProperties();
    if (WEB_URL_RE.test(url) && props.getProperty('WEB_URL') !== url) props.setProperty('WEB_URL', url);
  } catch (e) { /* 주소를 못 얻어도 화면은 열려야 한다 */ }
}

/* ───────────── 설정 ───────────── */

let CFG_MEMO = null; // 한 번의 실행 안에서는 시트를 다시 읽지 않는다

/** [설정] 시트의 값을 읽는다. 비어 있으면 기본값. 5분 동안 캐시한다. */
function cfg_() {
  if (CFG_MEMO) return CFG_MEMO;
  const cache = CacheService.getScriptCache();
  let raw = null;
  try { raw = JSON.parse(cache.get('cfg') || 'null'); } catch (e) {}
  if (!raw) {
    raw = {};
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CONFIG);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) { raw[String(r[0]).trim()] = r[1]; });
    }
    try { cache.put('cfg', JSON.stringify(raw), 300); } catch (e) {}
  }
  const get = function (k) { const v = raw[CFG_KEYS[k]]; return v === undefined || v === null || String(v).trim() === '' ? DEFAULTS[k] : v; };
  const nums = String(get('idShape')).split(/[^0-9]+/).filter(String).map(Number);
  const s = nums.length === 3 && nums.every(function (n) { return n >= 1 && n <= 4; }) ? nums : [1, 2, 2];
  const hex = function (v) { v = String(v).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : ''; };
  const css = String(get('themeCss'));
  CFG_MEMO = {
    accent: hex(get('accent')), tint: hex(get('tint')),
    refsLabel: String(get('refsLabel')).trim().slice(0, 8) || DEFAULTS.refsLabel,
    themeCss: safeThemeCss_(css),
    title: String(get('title')).trim(), school: String(get('school')).trim(),
    tab: String(get('tab')).trim() || String(get('title')).trim(),
    codeLabel: String(get('codeLabel')).trim(), codeHint: String(get('codeHint')).trim(),
    id: { g: s[0], c: s[1], n: s[2], len: s[0] + s[1] + s[2], prefix: s[0] + s[1] } // 학번 구조: 학년·반·번호 자릿수
  };
  return CFG_MEMO;
}

/** 화면 색 CSS는 색 변수 선언만 들어 있어야 한다. 그 밖의 글자가 섞여 있으면 통째로 버린다. */
function safeThemeCss_(css) {
  css = String(css || '').trim();
  if (!css || css.length > 4000) return '';
  if (!/^[a-z0-9#(),.%:;{}@\-\s]+$/i.test(css)) return '';
  if (!/^(:root\{|@media \(prefers-color-scheme: dark\)\{)/.test(css) || /url|import|expression/i.test(css)) return '';
  return css;
}

/** 설정 값을 [설정] 시트에 적는다. changes: { title: '...', school: '...' } */
function saveCfg_(changes) {
  const sh = sheet_(SHEET.CONFIG);
  const last = sh.getLastRow();
  const keys = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); });
  Object.keys(changes).forEach(function (k) {
    if (!CFG_KEYS[k]) return;
    let at = keys.indexOf(CFG_KEYS[k]);
    if (at < 0) { keys.push(CFG_KEYS[k]); at = keys.length - 1; sh.getRange(at + 2, 1, 1, 3).setValues([[CFG_KEYS[k], '', CFG_HELP[k]]]); }
    sh.getRange(at + 2, 2).setValue(changes[k]);
  });
  CacheService.getScriptCache().remove('cfg');
  CFG_MEMO = null;
}

/** 학번을 학년·반·번호로 나눈다. 자릿수는 [설정]의 학번 구조를 따른다. */
function idParts_(id) {
  const s = cfg_().id;
  return { grade: Number(id.substr(0, s.g)), cls: Number(id.substr(s.g, s.c)), num: Number(id.substr(s.g + s.c)), prefix: id.substr(0, s.prefix) };
}
function validId_(id) { return new RegExp('^\\d{' + cfg_().id.len + '}$').test(String(id)); }
/** '107,108' 같은 자동 배정 칸에서 반 코드(학년+반)를 뽑는다. */
function autoPrefixes_(cell) { return String(cell || '').match(new RegExp('\\d{' + cfg_().id.prefix + '}', 'g')) || []; }

/** 코드를 새로 배포한 뒤 첫 접속 때 시트 구조를 스스로 맞춘다. 실패해도 화면은 열리게 둔다. */
function autoSetup_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA_VERSION') === SCHEMA_VERSION) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // 다른 접속이 이미 맞추는 중
  try {
    if (props.getProperty('SCHEMA_VERSION') !== SCHEMA_VERSION) setup();
  } catch (e) {
    console.error('자동 setup 실패: ' + e);
  } finally {
    lock.releaseLock();
  }
}

/* ───────────── 시트 메뉴 ───────────── */

function onOpen() {
  const menu = SpreadsheetApp.getUi().createMenu('수업 관리')
    .addItem('설정 도우미 (이름, 수업, 명단)', 'openSetupWizard')
    .addItem('초기 설정 (시트 만들기·업데이트)', 'setup')
    .addItem('교사 비밀번호 설정', 'setTeacherPassword')
    .addSeparator()
    .addItem('선택한 학생 PIN 초기화', 'resetSelectedPin')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('자동 업데이트')
      .addItem('켜기', 'autoSyncOn')
      .addItem('지금 확인하기', 'autoSyncNow')
      .addItem('상태 보기', 'autoSyncStatus')
      .addItem('끄기', 'autoSyncOff'));
  // Demo 파일을 넣어 둔 사본에서만 나타난다 (실제 수업용 시트에는 이 메뉴가 없다)
  if (typeof fillDemoData === 'function') menu.addSeparator().addItem('체험용 데이터 채우기', 'fillDemoData').addItem('배포용 원본으로 비우기', 'makeBlankTemplate');
  menu.addToUi();
}

/** 필요한 시트를 만들고, 이전 버전 시트에는 새 열만 덧붙인다. 입력해 둔 내용은 건드리지 않는다. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);

  // 설정 : 앱 이름, 학교 이름, 학번 구조 등
  const wasUsed = !!PropertiesService.getScriptProperties().getProperty('SCHEMA_VERSION'); // 설정 시트가 없던 예전 버전에서 올라온 경우
  if (!wasUsed) startSheet_(ss); // 처음 여는 선생님을 위한 안내 탭
  let r = ensureSheet_(ss, SHEET.CONFIG, ['항목', '값', '설명']);
  if (r.created) {
    r.sh.getRange('B:B').setNumberFormat('@');
    const rows = Object.keys(CFG_KEYS).map(function (k) {
      const v = wasUsed && LEGACY[k] !== undefined ? LEGACY[k] : DEFAULTS[k];
      return [CFG_KEYS[k], v, CFG_HELP[k]];
    });
    r.sh.getRange(2, 1, rows.length, 3).setValues(rows);
    r.sh.setColumnWidth(1, 130); r.sh.setColumnWidth(2, 220); r.sh.setColumnWidth(3, 520);
    r.sh.getRange('B:B').setWrap(false);
    CacheService.getScriptCache().remove('cfg');
    CFG_MEMO = null;
  }

  // 수업 : 학생이 들어갈 공간 목록 (교과 수업, 학급)
  r = ensureSheet_(ss, SHEET.COURSES, COURSE_HEADERS);
  if (r.created) {
    r.sh.getRange('A:A').setNumberFormat('@');
    r.sh.getRange('E:E').setNumberFormat('@'); // 107,108 이 숫자로 바뀌지 않게
    r.sh.getRange(2, 3, 30, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['교과', '학급'], true).build());
    r.sh.getRange(2, 6, 30, 1).insertCheckboxes();
    // 예시 한 줄. 설정 도우미에서 내 수업으로 바꾼다.
    r.sh.getRange(2, 1, 1, 6).setValues([['수업1', '수업 이름', '교과', '1학년', '', false]]);
    r.sh.setColumnWidth(2, 160);
    r.sh.setColumnWidth(4, 200);
    r.sh.getRange('E1').setNote('학번 앞 3자리를 쉼표로 적으면 그 반 학생 전원이 자동으로 이 수업에 들어갑니다. 예: 107,108\n선택 과목처럼 일부만 듣는 수업은 비워 두고 [학생] 시트의 수업 칸에 수업ID를 적습니다.');
  }
  const courseIds = ss.getSheetByName(SHEET.COURSES).getRange('A2:A31');
  const pickCourse = SpreadsheetApp.newDataValidation().requireValueInRange(courseIds, true).setAllowInvalid(true).build();

  // 학생
  r = ensureSheet_(ss, SHEET.STUDENTS, STUDENT_HEADERS);
  r.sh.getRange('A:D').setNumberFormat('@'); // 확인코드 앞자리 0이 사라지지 않게
  if (r.created || r.added.indexOf(C.NOTE) >= 0) {
    r.sh.getRange(2, C.NOTE + 1, 600, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(STATUS_LIST, true).setAllowInvalid(false).build());
  }
  r.sh.getRange(1, C.NOTE + 1).setNote('명단에는 있지만 수업을 따로 챙겨야 하는 학생 표시. 현장실습·취업은 평가 과제를 대체과제로 냅니다. 교사 화면의 학생 창에서도 고를 수 있습니다.');
  r.sh.getRange('D1').setNote('처음 PIN을 정할 때 본인 확인에 쓰는 값. 설정 도우미에서 고른 방식대로 넣습니다(휴대폰 번호 뒤 4자리, 생년월일 6자리 등). 비어 있으면 그 학생은 PIN을 만들 수 없습니다.');
  if (r.created) {
    r.sh.getRange('H:J').setNumberFormat('yyyy-mm-dd hh:mm');
    r.sh.hideColumns(5, 2); // 해시, 솔트는 볼 일이 없어 숨김
    r.sh.setColumnWidths(1, 4, 110);
    r.sh.getRange('C1').setNote('자동 배정되지 않는 수업의 수업ID를 쉼표로 적습니다. 예: 가구제작 또는 제품디자인');
  }

  // 공지
  r = ensureSheet_(ss, SHEET.NOTICES, NOTICE_HEADERS);
  if (r.created) {
    r.sh.getRange('A:A').setNumberFormat('yyyy-mm-dd');
    r.sh.getRange(2, 2, 300, 1).setDataValidation(pickCourse);
    r.sh.getRange(2, 6, 300, 2).insertCheckboxes();
    r.sh.setColumnWidth(3, 220);
    r.sh.setColumnWidth(4, 420);
    r.sh.getRange('D:D').setWrap(true);
    r.sh.getRange('B1').setNote('비워 두면 모든 학생의 홈에 보이는 전체 공지가 됩니다.');
    r.sh.getRange('E1').setNote('비워 두면 수업 전체. 특정 반만 보이게 하려면 7반 처럼 적습니다.');
  }

  // 레퍼런스
  r = ensureSheet_(ss, SHEET.REFS, REF_HEADERS);
  r.sh.getRange('G1').setNote('썸네일 이미지. 교사 화면에서 첨부하면 작은 이미지가 글자 형태로 여기에 저장됩니다(길어 보여도 정상). 비워 두면 링크 사이트의 아이콘이 들어갑니다.');
  if (r.created) {
    r.sh.getRange(2, 1, 300, 1).setDataValidation(pickCourse);
    r.sh.getRange(2, 6, 300, 1).insertCheckboxes();
    r.sh.setColumnWidth(3, 180);
    r.sh.setColumnWidth(4, 320);
    r.sh.setColumnWidth(5, 320);
  }

  // 과제
  r = ensureSheet_(ss, SHEET.TASKS, TASK_HEADERS);
  r.sh.getRange('H1').setNote('제출 칸을 한 줄에 하나씩(또는 ; 로 구분) 적습니다.\n형식: 칸 이름|종류|최소 개수|최대 개수\n종류: 글, 이미지, PDF, 파일\n예: 이미지|이미지|1|5; 설정집|PDF|1|1\n비워 두면 제출 없이 안내만 보입니다.');
  if (r.created) {
    r.sh.getRange('A:A').setNumberFormat('@');
    r.sh.getRange('E:F').setNumberFormat('yyyy-mm-dd hh:mm');
    r.sh.getRange(2, 2, 100, 1).setDataValidation(pickCourse);
    r.sh.getRange(2, 7, 100, 1).insertCheckboxes();
    r.sh.getRange(2, 9, 100, 2).insertCheckboxes();
    r.sh.getRange(2, 12, 100, 1).insertCheckboxes();
    r.sh.setColumnWidth(4, 420);
    r.sh.getRange('D:D').setWrap(true);
  } else {
    // 모아보기 열이 방금 새로 붙었을 때만 체크박스를 넣는다 (다시 넣으면 값이 지워진다)
    if (r.added.indexOf(8) >= 0) r.sh.getRange(2, 9, 100, 2).insertCheckboxes();
    if (r.added.indexOf(11) >= 0) r.sh.getRange(2, 12, 100, 1).insertCheckboxes();
    // 이전 버전에서 만든 캐릭터 디자인 과제에 제출 칸, 배점, 새 설명 채우기
    const last = r.sh.getLastRow();
    if (last > 1) {
      r.sh.getRange(2, 1, last - 1, 12).getValues().forEach(function (v, i) {
        if (String(v[0]).trim() !== 'CHAR01') return;
        if (!String(v[7]).trim()) r.sh.getRange(i + 2, 8).setValue(CHAR_SLOTS);
        if (!String(v[10]).trim()) r.sh.getRange(i + 2, 11).setValue(CHAR_SCALE);
        if (String(v[3]).trim() === CHAR_DESC_OLD) r.sh.getRange(i + 2, 4).setValue(CHAR_DESC);
      });
    }
  }
  r.sh.setColumnWidth(8, 260);
  r.sh.getRange('I1').setNote('체크하면 이 수업 학생들이 서로의 대표 이미지를 모아보기로 볼 수 있습니다. 교사 화면에서도 켜고 끌 수 있습니다.');
  r.sh.getRange('J1').setNote('체크하면 학생용 모아보기에 이름이 함께 보입니다.');
  r.sh.getRange('K:K').setNumberFormat('@');
  r.sh.getRange('K1').setNote('등급:점수 를 쉼표로 이어 적습니다. 예: A:20, B:17, C:14, D:11, E:7, 미제출:4\n비워 두면 채점 없이 제출 여부만 봅니다.');
  r.sh.getRange('L1').setNote('체크하면 학생이 자기 점수를 보고 확인 버튼을 누를 수 있습니다. 교사 화면에서도 켜고 끌 수 있습니다.');
  r.sh.getRange('D1').setNote('과제 설명. 셀 안에서 Alt+Enter로 줄을 바꾸면 화면에서도 그 자리에서 줄이 바뀝니다.');

  // 제출 기록, 마감 후 제출 허용, 로그
  r = ensureSheet_(ss, SHEET.SUBS, SUB_HEADERS);
  if (r.created) { r.sh.getRange('A:B').setNumberFormat('@'); r.sh.getRange('D:E').setNumberFormat('yyyy-mm-dd hh:mm:ss'); }
  r = ensureSheet_(ss, SHEET.GRADES, GRADE_HEADERS);
  if (r.created) { r.sh.getRange('A:B').setNumberFormat('@'); r.sh.getRange('F:F').setNumberFormat('yyyy-mm-dd hh:mm:ss'); r.sh.getRange('H:H').setNumberFormat('yyyy-mm-dd hh:mm:ss'); r.sh.setColumnWidth(7, 320); }
  r.sh.setColumnWidth(10, 320);
  r.sh.getRange('G1').setNote('학생 화면에 보이는 메모');
  r.sh.getRange('J1').setNote('선생님만 보는 메모. 학생 화면에는 절대 나가지 않습니다.');
  r = ensureSheet_(ss, SHEET.ALLOW, ALLOW_HEADERS);
  if (r.created) { r.sh.getRange('A:B').setNumberFormat('@'); r.sh.getRange('C:C').setNumberFormat('yyyy-mm-dd hh:mm'); }
  r = ensureSheet_(ss, SHEET.LOG, LOG_HEADERS);
  if (r.created) r.sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');

  // 설문과 응답 (교사 화면의 설문 탭에서 만든다)
  r = ensureSheet_(ss, SHEET.SURVEYS, SURVEY_HEADERS);
  if (r.created) { r.sh.getRange('A:B').setNumberFormat('@'); r.sh.getRange('H:H').setNumberFormat('yyyy-mm-dd hh:mm'); r.sh.setColumnWidth(6, 320); r.sh.setColumnWidth(10, 240); }
  r.sh.getRange('F1').setNote('교사 화면의 설문 탭에서 만든 문항입니다. 직접 고치지 마세요.');
  r.sh.getRange('J1').setNote('익명 설문에 응답한 학생의 학번 목록입니다(번호순). 누가 무엇을 골랐는지는 어디에도 남지 않습니다.');
  r = ensureSheet_(ss, SHEET.ANSWERS, ANSWER_HEADERS);
  if (r.created) { r.sh.getRange('A:C').setNumberFormat('@'); r.sh.setColumnWidth(5, 420); }
  r.sh.getRange('B1').setNote('익명 설문은 학번과 이름이 비어 있고, 응답일시도 날짜까지만 남습니다.');

  // 출결 (담임 학급, 교사만 본다). 출석은 기록하지 않고, 출석이 아닌 학생만 한 줄씩 남긴다.
  r = ensureSheet_(ss, SHEET.ATTEND, ATTEND_HEADERS);
  if (r.created) { r.sh.getRange('A:C').setNumberFormat('@'); r.sh.getRange('G:G').setNumberFormat('@'); r.sh.getRange('J:J').setNumberFormat('yyyy-mm-dd hh:mm'); r.sh.setColumnWidth(8, 260); }
  r.sh.getRange('A1').setNote('교사 화면 › 우리 반 › 출결 탭에서 기록합니다. 학생 화면에는 나오지 않습니다.');

  // 메인 짤 공모 (학생이 올리고, 교사가 골라 로그인 화면에 건다)
  r = ensureSheet_(ss, SHEET.MEMES, MEME_HEADERS);
  if (r.created) { r.sh.getRange('A:B').setNumberFormat('@'); r.sh.setColumnWidth(9, 120); }
  r.sh.getRange('F1').setNote('대기 → 후보(학생 투표) → 메인 → 지난호. 숨김은 학생에게 보이지 않습니다. 교사 화면의 "메인 짤"에서 바꿉니다.');
  r.sh.getRange('I1').setNote('작게 줄인 미리보기 그림입니다. 직접 고치지 마세요.');
  r.sh.getRange('K1').setNote('올린 사람이 "이름 밝히기"를 골랐는지. 체크된 것만 로그인 화면에 반과 이름(선생님은 "선생님")이 보입니다.');

  rootFolder_(); // 제출 파일을 모을 드라이브 폴더 (여기서 드라이브 권한을 승인받는다)

  const blank = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  PropertiesService.getScriptProperties().setProperty('SCHEMA_VERSION', SCHEMA_VERSION);
}

/** 스프레드시트를 열면 맨 앞에 보이는 [시작하기] 탭. 무엇부터 누르면 되는지만 적는다. */
function startSheet_(ss) {
  if (ss.getSheetByName(SHEET.START)) return;
  const sh = ss.insertSheet(SHEET.START, 0);
  const rows = [
    ['수업 페이지 시작하기'],
    [''],
    ['①  위쪽 메뉴에서  수업 관리 > 설정 도우미  를 누릅니다.'],
    ['     메뉴가 안 보이면 이 페이지를 새로고침하세요.'],
    ['     처음 누르면 "승인 필요" 창이 뜹니다. 계속 > 내 계정 선택 > 고급 > "(안전하지 않음)으로 이동" > 허용 을 차례로 누른 뒤, 메뉴를 한 번 더 누르세요.'],
    ['     (내가 만든 사본을 내 계정이 쓰도록 허락하는 절차라서 안전합니다.)'],
    [''],
    ['②  설정 도우미 창의 "진행 상황"을 위에서부터 따라갑니다.'],
    ['     앱 이름, 교사 비밀번호, 수업, 학생 명단을 넣고, 마지막에 웹앱 주소와 QR을 받습니다.'],
    [''],
    ['③  평소에는 웹앱의 "교사용"으로 들어가 과제를 만들고 채점합니다. 이 스프레드시트는 다시 열 일이 거의 없습니다.'],
    [''],
    ['알아 두기'],
    ['·  아래의 다른 탭(학생, 과제, 제출 등)은 앱이 쓰는 기록입니다. 열의 순서나 첫 줄 제목은 바꾸지 마세요.'],
    ['·  학생 정보가 들어 있으니 이 스프레드시트는 다른 사람과 공유하지 마세요.'],
    ['·  설정이 끝나면 이 탭은 지워도 됩니다.']
  ];
  sh.getRange(1, 1, rows.length, 1).setValues(rows).setFontSize(12).setWrap(true).setVerticalAlignment('middle');
  sh.getRange(1, 1).setFontSize(22).setFontWeight('bold');
  [3, 8, 11].forEach(function (r) { sh.getRange(r, 1).setFontSize(14).setFontWeight('bold'); });
  sh.getRange(13, 1).setFontWeight('bold');
  [4, 5, 6, 9, 14, 15, 16].forEach(function (r) { sh.getRange(r, 1).setFontColor('#6e6e73'); });
  sh.setColumnWidth(1, 860);
  sh.setHiddenGridlines(true);
  try { ss.setActiveSheet(sh); } catch (e) {}
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  const created = !sh;
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#f5f5f7');
    sh.setFrozenRows(1);
    return { sh: sh, created: true, added: [] };
  }
  if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  const now = sh.getRange(1, 1, 1, headers.length).getValues()[0].map(function (x) { return String(x).trim(); });
  // 이전 버전: 초기코드 방식 → 확인코드 방식 (예전 초기코드 값은 지운다)
  if (name === SHEET.STUDENTS && now[C.CODE] === '초기코드') {
    sh.getRange(1, C.CODE + 1).setValue('확인코드');
    if (sh.getLastRow() > 1) sh.getRange(2, C.CODE + 1, sh.getLastRow() - 1, 1).clearContent();
    now[C.CODE] = '확인코드';
  }
  const added = [];
  // 이전 버전의 열 제목은 새 이름으로 바꿔 준다
  const renamed = { '갤러리 공개': '모아보기 공개', '갤러리 이름': '모아보기 이름', '생년월일': '확인코드' };
  now.forEach(function (text, i) {
    if (renamed[text] && renamed[text] === headers[i]) { sh.getRange(1, i + 1).setValue(headers[i]); now[i] = headers[i]; }
  });
  headers.forEach(function (h, i) {
    if (!now[i]) { sh.getRange(1, i + 1).setValue(h).setFontWeight('bold').setBackground('#f5f5f7'); added.push(i); }
    else if (now[i] !== h) throw new Error('[' + name + '] 시트의 ' + (i + 1) + '번째 열 제목이 "' + h + '"가 아닙니다. 열 순서를 바꾸지 않았는지 확인해 주세요.');
  });
  return { sh: sh, created: created, added: added };
}

/* ───────────── 설정 도우미 (시트 메뉴에서 여는 창) ───────────── */

function openSetupWizard() {
  const ui = SpreadsheetApp.getUi(); // 시트 메뉴에서만 열린다 (웹앱 방문자가 부르면 여기서 멈춘다)
  setup();
  // 이 창에만 통하는 일회용 열쇠. 도우미 기능은 이 열쇠가 있어야 돌아간다.
  const key = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('wiz:' + key, '1', 21600);
  const t = HtmlService.createTemplateFromFile('Setup');
  t.key = key;
  ui.showModalDialog(t.evaluate().setWidth(600).setHeight(720), '설정 도우미');
}

/** 도우미 전용 기능은 시트에서 연 창의 열쇠가 있어야 돌아간다. 웹앱 방문자는 열쇠를 얻을 방법이 없다. */
function ownerOnly_(key) {
  if (!key || CacheService.getScriptCache().get('wiz:' + String(key)) !== '1') {
    throw new Error('이 기능은 스프레드시트 메뉴의 설정 도우미에서만 쓸 수 있습니다. 창을 연 지 오래됐다면 닫고 다시 열어 주세요.');
  }
}

/** 반 코드(학년+반) ↔ 사람이 읽는 표기 '1-7' */
function prefixToText_(p) { const part = idParts_(p + '0'); return part.grade + '-' + part.cls; }
function textToPrefixes_(text) {
  const s = cfg_().id, out = [];
  const pad = function (n, w) { let t = String(Number(n)); while (t.length < w) t = '0' + t; return t; };
  String(text || '').split(/[,\n;]+/).forEach(function (piece) {
    piece = piece.trim();
    if (!piece) return;
    const m = piece.match(/^(\d+)\s*(?:학년|-)\s*(\d+)\s*반?$/);
    let code = '';
    if (m) code = pad(m[1], s.g) + pad(m[2], s.c);
    else if (new RegExp('^\\d{' + s.prefix + '}$').test(piece)) code = piece;
    if (code && code.length === s.prefix && out.indexOf(code) < 0) out.push(code);
    else if (!code) throw new Error('반 표기를 이해하지 못했습니다: "' + piece + '" (예: 1-7, 1-8)');
  });
  return out;
}

function wizLoad(key) {
  ownerOnly_(key);
  CFG_MEMO = null;
  const c = cfg_();
  const count = {};
  const students = rows_(SHEET.STUDENTS, STUDENT_HEADERS.length).filter(function (v) { return normId_(v[C.ID]); });
  const savedUrl = PropertiesService.getScriptProperties().getProperty('WEB_URL') || '';
  const url = WEB_URL_RE.test(savedUrl) ? savedUrl : '';
  return {
    ok: true,
    title: c.title, school: c.school, tab: c.tab === c.title ? '' : c.tab,
    codeLabel: c.codeLabel, codeHint: c.codeHint, idShape: [c.id.g, c.id.c, c.id.n],
    accent: c.accent, tint: c.tint, refsLabel: c.refsLabel,
    hasPassword: !!PropertiesService.getScriptProperties().getProperty('T_HASH'),
    courses: rows_(SHEET.COURSES, COURSE_HEADERS.length).filter(function (r) { return String(r[0]).trim(); }).map(function (r) {
      return { id: String(r[0]).trim(), name: String(r[1] || '').trim(), kind: String(r[2] || '').trim() === '학급' ? '학급' : '교과',
        desc: String(r[3] || '').trim(), classes: autoPrefixes_(r[4]).map(prefixToText_).join(', '), active: r[5] === true };
    }),
    students: students.length,
    withPin: students.filter(function (v) { return v[C.HASH]; }).length,
    noCode: students.filter(function (v) { return !codeDigits_(v[C.CODE]); }).length,
    url: url
  };
}

/** 기본 정보, 교사 비밀번호, 학번 구조, 수업 목록을 저장한다. */
function wizSave(key, d) {
  ownerOnly_(key);
  d = d || {};
  const title = String(d.title || '').trim().slice(0, 30);
  if (!title) throw new Error('앱 이름을 적어 주세요.');
  const shape = (d.idShape || []).map(Number);
  if (shape.length !== 3 || shape.some(function (n) { return !(n >= 1 && n <= 4); })) throw new Error('학번 구조를 다시 골라 주세요.');
  const old = cfg_().id;
  const count = rows_(SHEET.STUDENTS, STUDENT_HEADERS.length).filter(function (v) { return normId_(v[C.ID]); }).length;
  if (count && (old.g !== shape[0] || old.c !== shape[1] || old.n !== shape[2])) {
    throw new Error('이미 학생이 등록되어 있어 학번 구조는 바꿀 수 없습니다. 학생 시트를 비운 뒤에 바꿔 주세요.');
  }
  const pw = String(d.password || '');
  if (pw && pw.length < 6) throw new Error('교사 비밀번호는 6자 이상으로 정해 주세요.');
  const hex = function (v) { v = String(v || '').trim(); if (v && !/^#[0-9a-f]{6}$/i.test(v)) throw new Error('색을 다시 골라 주세요.'); return v.toLowerCase(); };
  const accent = hex(d.accent), tint = hex(d.tint);
  const themeCss = accent || tint ? safeThemeCss_(d.themeCss) : '';
  if ((accent || tint) && !themeCss) throw new Error('화면 색을 저장하지 못했습니다. 색을 다시 골라 주세요.');

  saveCfg_({ title: title, school: String(d.school || '').trim().slice(0, 40), tab: String(d.tab || '').trim().slice(0, 20),
    codeLabel: String(d.codeLabel || '').trim().slice(0, 30) || DEFAULTS.codeLabel, codeHint: String(d.codeHint || '').trim().slice(0, 30),
    idShape: shape.join(','), accent: accent, tint: tint, themeCss: themeCss,
    refsLabel: String(d.refsLabel || '').replace(/[<>"'&]/g, '').trim().slice(0, 8) || DEFAULTS.refsLabel });

  if (pw) {
    const salt = Utilities.getUuid();
    PropertiesService.getScriptProperties().setProperties({ T_SALT: salt, T_HASH: hashPin_(pw, salt) });
  }

  // 수업: 있는 줄은 고치고, 새 수업은 덧붙인다. 목록에서 뺀 수업은 지우지 않고 '사용'만 끈다(과제·제출이 딸려 있을 수 있다).
  const sh = sheet_(SHEET.COURSES);
  const rows = read_(sh, COURSE_HEADERS.length);
  const ids = rows.map(function (r) { return String(r[0]).trim(); });
  const seen = {};
  (d.courses || []).forEach(function (c) {
    const name = String(c.name || '').trim().slice(0, 30);
    if (!name) return;
    let id = String(c.id || '').trim();
    if (!id || ids.indexOf(id) < 0) {
      const base = clean_(name).slice(0, 10) || '수업';
      id = base;
      for (let n = 2; ids.indexOf(id) >= 0; n++) id = base + n;
      ids.push(id);
      rows.push([id, '', '', '', '', false]);
    }
    seen[id] = true;
    const row = rows[ids.indexOf(id)];
    row[1] = name;
    row[2] = c.kind === '학급' ? '학급' : '교과';
    row[3] = String(c.desc || '').trim().slice(0, 40);
    row[4] = textToPrefixes_(c.classes).join(',');
    row[5] = c.active !== false;
  });
  rows.forEach(function (r, i) { if (ids[i] && !seen[ids[i]]) r[5] = false; });
  if (rows.length) sh.getRange(2, 1, rows.length, COURSE_HEADERS.length).setValues(rows);
  log_('', '교사', '설정 저장', title);
  return wizLoad(key);
}

/** 웹앱 주소를 직접 붙여넣어 알려 준다 (배포 창에서 복사한 주소). */
function wizSetUrl(key, url) {
  ownerOnly_(key);
  url = String(url || '').trim();
  if (!WEB_URL_RE.test(url)) throw new Error('웹 앱 주소가 아닙니다. 배포 창의 "웹 앱 URL"을 복사해 붙여넣어 주세요. 끝이 /exec 로 끝나야 합니다.');
  PropertiesService.getScriptProperties().setProperty('WEB_URL', url);
  return wizLoad(key);
}

/**
 * 명단 넣기의 공통 부분. 이미 있는 학번은 이름·확인코드만 고치고(PIN은 그대로), 없는 학번은 맨 아래에 새로 넣는다.
 * found: [{ id, name, code, courses: [수업ID] }]
 */
function upsertStudents_(found, skipped) {
  if (!found.length) return { ok: true, added: 0, updated: 0, skipped: skipped.slice(0, 20) };
  const sh = sheet_(SHEET.STUDENTS);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let added = 0, updated = 0;
  try {
    const rows = read_(sh, STUDENT_HEADERS.length);
    const index = {};
    rows.forEach(function (r, i) { index[normId_(r[C.ID])] = i; });
    const fresh = [], done = {};
    found.forEach(function (f) {
      const addCourses = function (cell) {
        const list = String(cell || '').split(',').map(function (x) { return x.trim(); }).filter(String);
        (f.courses || []).forEach(function (c) { if (c && list.indexOf(c) < 0) list.push(c); });
        return list.join(', ');
      };
      if (done[f.id]) { skipped.push('같은 학번이 두 번: ' + f.id + ' ' + f.name); return; }
      done[f.id] = true;
      if (index[f.id] !== undefined) {
        const r = rows[index[f.id]];
        r[C.NAME] = f.name;
        if (f.code) r[C.CODE] = f.code;
        r[C.COURSES] = addCourses(r[C.COURSES]);
        sh.getRange(index[f.id] + 2, 1, 1, 4).setValues([[normId_(r[C.ID]), r[C.NAME], r[C.COURSES], r[C.CODE]]]);
        updated++;
      } else {
        fresh.push([f.id, f.name, addCourses(''), f.code]);
        added++;
      }
    });
    if (fresh.length) sh.getRange(sh.getLastRow() + 1, 1, fresh.length, 4).setValues(fresh); // 맨 아래 새 줄에 넣어 예전 PIN이 섞이지 않게
  } finally {
    lock.releaseLock();
  }
  log_('', '교사', '명단 넣기', '추가 ' + added + ' · 수정 ' + updated + (skipped.length ? ' · 제외 ' + skipped.length : ''));
  return { ok: true, added: added, updated: updated, skipped: skipped.slice(0, 20) };
}

/** 확인코드 다듬기: 숫자만 남기고, 전화번호 전체(7자리 이상)가 들어오면 뒤 4자리만 쓴다. */
function tidyCode_(v) {
  const digits = String(v == null ? '' : v).replace(/\D/g, '');
  return digits.length > 6 ? digits.slice(-4) : digits;
}

/**
 * 채운 양식 파일(엑셀·CSV)에서 읽은 줄을 넣는다. 파일 해석은 도우미 창에서 하고 여기에는 줄 단위로 온다.
 * list: [{ line, grade, cls, num, id, name, code, course }]  (학번이 있으면 학번을, 없으면 학년·반·번호로 만든다)
 */
function wizImportRows(key, list) {
  ownerOnly_(key);
  const s = cfg_().id;
  const pad = function (n, w) { let t = String(Number(n)); while (t.length < w) t = '0' + t; return t; };
  const isNum = function (v) { return /^\d+$/.test(String(v == null ? '' : v).trim()) && Number(v) > 0; };
  // 수업 칸에는 수업 이름이나 수업ID 어느 쪽을 적어도 된다
  const byName = {};
  rows_(SHEET.COURSES, COURSE_HEADERS.length).forEach(function (r) {
    const cid = String(r[0]).trim();
    if (!cid) return;
    byName[cid] = cid;
    byName[String(r[1] || '').trim()] = cid;
  });
  const found = [], skipped = [], unknown = {};
  (list || []).forEach(function (it) {
    const where = (it.line ? it.line + '번째 줄' : '줄') + ': ';
    const name = String(it.name == null ? '' : it.name).replace(/\s+/g, ' ').trim();
    let id = String(it.id == null ? '' : it.id).replace(/\D/g, '');
    if (!validId_(id)) {
      id = isNum(it.grade) && isNum(it.cls) && isNum(it.num) ? pad(it.grade, s.g) + pad(it.cls, s.c) + pad(it.num, s.n) : '';
    }
    if (!name && !id) return; // 빈 줄
    if (!name) { skipped.push(where + '이름이 없습니다'); return; }
    if (!validId_(id)) { skipped.push(where + name + ' - 학년, 반, 번호를 확인해 주세요'); return; }
    const courses = [];
    String(it.course == null ? '' : it.course).split(/[,\/;]/).map(function (x) { return x.trim(); }).filter(String).forEach(function (c) {
      if (byName[c]) courses.push(byName[c]); else unknown[c] = true;
    });
    found.push({ id: id, name: name, code: tidyCode_(it.code), courses: courses });
  });
  const res = upsertStudents_(found, skipped);
  res.unknownCourses = Object.keys(unknown).slice(0, 10); // 설정에 없는 수업 이름: 학생은 넣되 수업 지정은 건너뛴다
  return res;
}

/**
 * 명단 직접 붙여넣기.
 * d: { mode: 'id' | 'class', grade, cls, text, course }
 *  - id   : 줄마다 학번, 이름, (확인코드)
 *  - class: 학년·반을 고르고 줄마다 번호, 이름, (확인코드)
 */
function wizImport(key, d) {
  ownerOnly_(key);
  d = d || {};
  const s = cfg_().id;
  const pad = function (n, w) { let t = String(Number(n)); while (t.length < w) t = '0' + t; return t; };
  const course = String(d.course || '').trim();
  const found = [], skipped = [];
  String(d.text || '').split(/\r?\n/).forEach(function (line) {
    if (!line.trim()) return;
    const cells = line.split(/\t|,|\s{2,}/).map(function (x) { return x.trim(); }).filter(String);
    const parts = cells.length >= 2 ? cells : line.trim().split(/\s+/);
    let id = '', rest = parts.slice();
    if (d.mode === 'class') {
      const no = rest.shift();
      if (/^\d{1,3}$/.test(no) && Number(no) > 0) id = pad(d.grade, s.g) + pad(d.cls, s.c) + pad(no, s.n);
    } else {
      const at = rest.findIndex(function (x) { return new RegExp('^\\d{' + s.len + '}$').test(x); });
      if (at >= 0) id = rest.splice(at, 1)[0];
    }
    const name = rest.filter(function (x) { return !/^[\d\-\s]+$/.test(x); })[0] || '';
    const codeRaw = rest.filter(function (x) { return /^[\d\-\s]{4,}$/.test(x); }).pop() || '';
    if (!id || id.length !== s.len || !name || /^(이름|성명|번호|학번)$/.test(name)) { skipped.push(line.trim().slice(0, 40)); return; }
    found.push({ id: id, name: name.replace(/\s+/g, ' '), code: tidyCode_(codeRaw), courses: course ? [course] : [] });
  });
  return upsertStudents_(found, skipped);
}

/** 학생 시트에서 선택한 행의 PIN을 지운다. 학생은 확인코드로 다시 PIN을 정한다. */
function resetSelectedPin() {
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEET.STUDENTS) { ui.alert('학생 시트에서 초기화할 학생의 행을 선택해 주세요.'); return; }
  const rg = sh.getActiveRange();
  const start = Math.max(rg.getRow(), 2);
  const end = Math.min(rg.getLastRow(), sh.getLastRow());
  if (end < start) { ui.alert('초기화할 학생의 행을 선택해 주세요.'); return; }
  const answer = ui.alert('PIN 초기화', (end - start + 1) + '명의 PIN을 지울까요? 학생은 ' + cfg_().codeLabel + ' 확인 후 다시 PIN을 정하게 됩니다.', ui.ButtonSet.OK_CANCEL);
  if (answer !== ui.Button.OK) return;
  for (let row = start; row <= end; row++) {
    const pair = sh.getRange(row, 1, 1, 2).getValues()[0];
    const id = normId_(pair[0]);
    if (!id) continue;
    sh.getRange(row, C.HASH + 1, 1, 5).setValues([['', '', 0, '', '']]); // 해시, 솔트, 실패횟수, 잠금, 설정일시
    log_(id, pair[1], 'PIN 초기화', '교사');
  }
}

function setTeacherPassword() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('교사 비밀번호 설정', '교사 화면에 들어갈 비밀번호를 6자 이상으로 입력해 주세요.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const pw = res.getResponseText().trim();
  if (pw.length < 6) { ui.alert('6자 이상으로 정해 주세요.'); return; }
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({ T_SALT: salt, T_HASH: hashPin_(pw, salt) });
  ui.alert('교사 비밀번호를 저장했습니다.');
}

/* ───────────── 학생 로그인 ───────────── */

/** 1단계: 학번과 이름이 명단과 맞는지 확인한다. */
function apiCheckStudent(id, name) {
  id = normId_(id); name = normName_(name);
  if (!validId_(id) || !name) return fail_('학번 ' + cfg_().id.len + '자리와 이름을 입력해 주세요.');
  const s = findStudent_(id);
  if (!s || normName_(s.v[C.NAME]) !== name) return fail_('학번 또는 이름이 명단과 일치하지 않습니다.');
  const locked = lockMessage_(s.v);
  if (locked) return fail_(locked);
  return { ok: true, mode: s.v[C.HASH] ? 'login' : 'setup', name: String(s.v[C.NAME]).trim() };
}

/** 2-A단계: 확인코드(휴대폰 번호)를 확인하고 PIN을 설정한다. */
function apiSetupPin(id, name, code, pin) {
  id = normId_(id); name = normName_(name);
  code = String(code || '').replace(/\D/g, '');
  pin = String(pin || '').trim();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_('접속이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.');
  try {
    const s = findStudent_(id);
    if (!s || normName_(s.v[C.NAME]) !== name) return fail_('학번 또는 이름이 명단과 일치하지 않습니다.');
    const locked = lockMessage_(s.v);
    if (locked) return fail_(locked);
    if (s.v[C.HASH]) return fail_('이미 PIN이 설정되어 있습니다. 처음 화면에서 다시 로그인해 주세요.');
    const stored = codeDigits_(s.v[C.CODE]);
    if (!stored) return fail_('본인 확인 정보가 아직 등록되지 않았습니다. 선생님께 문의해 주세요.');
    const problem = pinProblem_(pin, id, stored);
    if (problem) return fail_(problem);
    if (!codeMatches_(code, stored)) return fail_(registerFail_(s, cfg_().codeLabel + ' 확인에 실패했습니다.'));

    const salt = Utilities.getUuid();
    const now = new Date();
    // 해시, 솔트, 실패횟수, 잠금, 설정일시, 최근로그인
    s.sh.getRange(s.row, C.HASH + 1, 1, 6).setValues([[hashPin_(pin, salt), salt, 0, '', now, now]]);
    log_(id, s.v[C.NAME], 'PIN 설정', '');
    return { ok: true, token: createSession_(id, salt), home: buildHome_(s.v) };
  } finally {
    lock.releaseLock();
  }
}

/** 2-B단계: PIN으로 로그인한다. */
function apiLogin(id, name, pin) {
  id = normId_(id); name = normName_(name);
  pin = String(pin || '').trim();
  const s = findStudent_(id);
  if (!s || normName_(s.v[C.NAME]) !== name) return fail_('학번 또는 이름이 명단과 일치하지 않습니다.');
  const locked = lockMessage_(s.v);
  if (locked) return fail_(locked);
  if (!s.v[C.HASH]) return fail_('PIN이 아직 없습니다. 처음 화면에서 다시 시작해 주세요.');
  if (hashPin_(pin, s.v[C.SALT]) !== s.v[C.HASH]) return fail_(registerFail_(s, 'PIN이 올바르지 않습니다.'));

  // 실패횟수, 잠금, 설정일시(그대로), 최근로그인
  s.sh.getRange(s.row, C.FAILS + 1, 1, 4).setValues([[0, '', s.v[C.SETAT], new Date()]]);
  log_(id, s.v[C.NAME], '로그인', '');
  return { ok: true, token: createSession_(id, s.v[C.SALT]), home: buildHome_(s.v) };
}

/** 로그인 상태에서 화면 데이터를 다시 불러온다. */
function apiGetHome(token) {
  const s = sessionStudent_(token);
  if (!s) return expired_();
  return { ok: true, home: buildHome_(s.v) };
}

function apiLogout(token) {
  if (token) CacheService.getScriptCache().removeAll(['sess:' + token, 'tsess:' + token]);
  return { ok: true };
}

/* ───────────── 학생 화면 데이터 ───────────── */

function buildHome_(v) {
  const id = normId_(v[C.ID]);
  const part = idParts_(id);
  const cls = part.cls;
  const courses = coursesOf_(id, v[C.COURSES]);
  const ids = courses.map(function (c) { return c.id; });
  return {
    student: { id: id, name: String(v[C.NAME]).trim(), grade: part.grade, cls: cls, num: part.num },
    courses: courses,
    notices: readNotices_(ids, cls),
    refs: readRefs_(ids),
    tasks: readTasks_(ids, id, statusOf_(v)),
    surveys: readSurveys_(ids, id),
    meme: studentMeme_(id)
  };
}

/** 이 학생이 이 수업을 듣는가: 학번 앞 3자리 자동 배정 또는 학생 시트의 수업 칸 */
function enrolled_(courseId, autoCell, studentId, extraCell) {
  if (autoPrefixes_(autoCell).indexOf(studentId.substr(0, cfg_().id.prefix)) >= 0) return true;
  const extra = String(extraCell || '').split(/[,，\/\n]/).map(function (x) { return x.trim(); });
  return extra.indexOf(courseId) >= 0;
}

function activeCourses_() {
  return rows_(SHEET.COURSES, COURSE_HEADERS.length).filter(function (r) {
    return String(r[0]).trim() && r[5] === true;
  }).map(function (r) {
    return {
      id: String(r[0]).trim(),
      name: String(r[1] || r[0]).trim(),
      kind: String(r[2] || '').trim() === '학급' ? 'class' : 'course',
      desc: String(r[3] || '').trim(),
      auto: r[4]
    };
  });
}

function coursesOf_(id, extraCell) {
  return activeCourses_().filter(function (c) { return enrolled_(c.id, c.auto, id, extraCell); })
    .map(function (c) { return { id: c.id, name: c.name, kind: c.kind, desc: c.desc }; });
}

function readNotices_(ids, cls) {
  const tag = cls + '반';
  return rows_(SHEET.NOTICES, NOTICE_HEADERS.length).map(function (r) {
    const course = String(r[1] || '').trim();
    const target = String(r[4] || '').trim();
    if (!String(r[2]).trim() || r[6] !== true) return null;
    const everyone = !course || course === '전체';
    if (!everyone && ids.indexOf(course) < 0) return null;
    if (target && target !== '전체' && target !== tag) return null;
    const d = r[0] instanceof Date ? r[0] : null;
    return {
      course: everyone ? '' : course,
      time: d ? d.getTime() : 0,
      date: d ? Utilities.formatDate(d, TZ, 'yyyy.MM.dd') : '',
      title: String(r[2]).trim(),
      body: String(r[3] || '').trim(),
      pinned: r[5] === true
    };
  }).filter(Boolean).sort(function (a, b) {
    return (Number(b.pinned) - Number(a.pinned)) || (b.time - a.time);
  });
}

function readRefs_(ids) {
  return rows_(SHEET.REFS, REF_HEADERS.length).filter(function (r) {
    return String(r[2]).trim() && r[5] === true && ids.indexOf(String(r[0]).trim()) >= 0;
  }).map(function (r) {
    return {
      course: String(r[0]).trim(),
      group: String(r[1] || '').trim() || '기타',
      title: String(r[2]).trim(),
      desc: String(r[3] || '').trim(),
      url: String(r[4] || '').trim(),
      image: String(r[6] || '').trim()
    };
  });
}

function taskFromRow_(r) {
  const due = r[4] instanceof Date ? r[4] : null;
  return {
    id: String(r[0]).trim(),
    course: String(r[1] || '').trim(),
    title: String(r[2] || '').trim(),
    desc: String(r[3] || '').trim(),
    due: due,
    fin: r[5] instanceof Date ? r[5] : due,
    published: r[6] === true,
    slots: parseSlots_(r[7]),
    gallery: r[8] === true,
    galleryNames: r[9] === true,
    scale: parseScale_(r[10]),
    scoresOpen: r[11] === true
  };
}

function allTasks_() {
  return rows_(SHEET.TASKS, TASK_HEADERS.length).filter(function (r) { return String(r[0]).trim(); }).map(taskFromRow_);
}

function getTask_(taskId) {
  const list = allTasks_();
  for (let i = 0; i < list.length; i++) if (list[i].id === taskId) return list[i];
  return null;
}

/** '이미지|이미지|1|5; 설정집|PDF|1|1' → 제출 칸 목록 */
function parseSlots_(cell) {
  return String(cell || '').split(/[;\n]/).map(function (line) {
    const p = line.split('|').map(function (x) { return x.trim(); });
    if (!p[0]) return null;
    const kind = /pdf/i.test(p[1] || '') ? 'pdf' : (/이미지|image/i.test(p[1] || '') ? 'image' : (/^(글|text)$/i.test(p[1] || '') ? 'text' : 'file'));
    let min = parseInt(p[2], 10); if (isNaN(min) || min < 0) min = 1;
    let max = parseInt(p[3], 10); if (isNaN(max)) max = min;
    if (kind === 'text') return { name: p[0], kind: kind, min: Math.min(min, 1), max: 1 }; // 글 칸은 하나만
    return { name: p[0], kind: kind, min: min, max: Math.max(max, min, 1) };
  }).filter(Boolean);
}

/** 'A:20, B:17, 미제출:4' → [{g:'A', p:20}, ...] */
function parseScale_(cell) {
  return String(cell || '').split(/[,;\n]/).map(function (part) {
    const m = part.trim().match(/^(.+?)\s*[:=]\s*(-?\d+(?:\.\d+)?)$/);
    return m ? { g: m[1].trim(), p: Number(m[2]) } : null;
  }).filter(Boolean);
}

/** 지금 이 학생이 낼 수 있는 상태: open(정시) / late(지각) / exception(교사 허용) / closed */
function windowOf_(task, studentId, allowSet) {
  const now = Date.now();
  if (!task.due || now < task.due.getTime()) return 'open';
  if (task.fin && now <= task.fin.getTime()) return 'late';
  return allowSet[task.id + '|' + studentId] ? 'exception' : 'closed';
}

function allowSet_() {
  const set = {};
  rows_(SHEET.ALLOW, ALLOW_HEADERS.length).forEach(function (r) {
    if (String(r[0]).trim()) set[String(r[0]).trim() + '|' + normId_(r[1])] = true;
  });
  return set;
}

function readTasks_(ids, studentId, special) { // special: 학생 특이사항(현장실습 등)
  const now = Date.now();
  const allow = allowSet_();
  const mine = {};
  rows_(SHEET.SUBS, SUB_HEADERS.length).forEach(function (r) {
    if (normId_(r[S.ID]) === studentId) mine[String(r[S.TASK]).trim()] = r;
  });
  const graded = {};
  rows_(SHEET.GRADES, GRADE_HEADERS.length).forEach(function (r) {
    if (normId_(r[G.ID]) === studentId) graded[String(r[G.TASK]).trim()] = r;
  });
  return allTasks_().filter(function (t) { return t.published && ids.indexOf(t.course) >= 0; }).map(function (t) {
    const win = windowOf_(t, studentId, allow);
    let status = 'open', label = '제출 기간';
    if (t.due && now < t.due.getTime()) {
      const days = Math.floor((t.due.getTime() - now) / 86400000);
      label = days >= 1 ? '마감까지 ' + days + '일' : '오늘 마감';
    } else if (win === 'late') { status = 'late'; label = '지각 접수 중'; }
    else if (win === 'exception') { status = 'late'; label = '제출 허용됨'; }
    else if (t.due) { status = 'closed'; label = '접수 마감'; }
    const sub = mine[t.id];
    return {
      id: t.id, course: t.course, title: t.title, desc: t.desc,
      due: t.due ? koDate_(t.due) : '',
      finalDue: t.fin ? koDate_(t.fin) : '',
      sort: status === 'open' && t.due ? t.due.getTime() : (t.fin ? t.fin.getTime() : 0),
      status: status, label: label, window: win,
      slots: isAlt_(t, special) ? ALT_SLOTS : t.slots,
      alt: isAlt_(t, special), // 대체과제로 내는 학생
      gallery: t.gallery,
      graded: t.scale.length > 0, // 배점이 있는 과제만 '평가'
      memo: graded[t.id] ? String(graded[t.id][G.MEMO] || '').trim() : '',   // 메모는 점수 공개와 상관없이 바로 보인다
      result: t.scoresOpen ? resultView_(t, graded[t.id]) : null,
      locked: !!(sub && graded[t.id] && String(graded[t.id][G.GRADE] || '').trim() && !allow[t.id + '|' + studentId]),
      mine: sub ? subView_(sub, t) : null
    };
  });
}

function filesOf_(r) {
  let files = [];
  try { files = JSON.parse(r[S.FILES] || '[]'); } catch (e) {}
  const seen = {};
  return files.filter(function (f) { return f.s >= 0; }).map(function (f) {
    seen[f.s] = (seen[f.s] || 0) + 1;
    return { n: f.n, id: f.id, s: f.s, o: f.o || seen[f.s], r: f.r ? 1 : 0, x: f.x || '' }; // x: 글 칸에 적은 내용
  }).sort(function (a, b) { return (a.s - b.s) || (a.o - b.o); });
}

function shortName_(name) { return String(name).replace(/^.*_(?=[^_]+$)/, ''); } // …_이미지1.png → 이미지1.png

function subView_(r, task) {
  return {
    at: r[S.AT] instanceof Date ? koDate_(r[S.AT]) : '',
    state: stateKey_(r[S.STATE]),
    lateDays: Number(r[S.LATE] || 0),
    count: Number(r[S.COUNT] || 1),
    alt: r[S.ALT] === true,
    files: filesOf_(r).map(function (f) { return { id: f.id, s: f.s, r: f.r, n: shortName_(f.n), x: f.x }; })
  };
}

function resultView_(task, row) {
  if (!row || !String(row[G.GRADE] || '').trim()) return null;
  return {
    grade: String(row[G.GRADE]).trim(),
    points: Number(row[G.POINTS]),
    max: task.scale.reduce(function (m, x) { return Math.max(m, x.p); }, 0),
    confirmedAt: row[G.CONF] instanceof Date ? koDate_(row[G.CONF]) : ''
  };
}

function stateKey_(text) { return text === '지각' ? 'late' : (text === '예외' ? 'exception' : 'ontime'); }

/* ───────────── 제출 ───────────── */

/**
 * 제출 시작: 올릴 폴더를 만들고 업로드 번호를 돌려준다.
 * keeps: 다시 제출할 때 그대로 둘 기존 파일 [{id, order}]
 */
function apiBeginSubmit(token, taskId, keeps) {
  const s = sessionStudent_(token);
  if (!s) return expired_();
  const id = normId_(s.v[C.ID]);
  const task = getTask_(String(taskId));
  if (!task || !task.published || !task.slots.length) return fail_('제출할 수 없는 과제입니다.');
  if (!coursesOf_(id, s.v[C.COURSES]).some(function (c) { return c.id === task.course; })) return fail_('수강하지 않는 수업의 과제입니다.');
  const allow = allowSet_();
  if (windowOf_(task, id, allow) === 'closed') return fail_('접수가 마감되었습니다.');
  if (lockedByGrade_(task.id, id, allow)) return fail_(LOCKED_MSG);
  const alt = isAlt_(task, statusOf_(s.v));
  if (alt) task.slots = ALT_SLOTS;

  const keepList = [];
  if (keeps && keeps.length) {
    const old = findSub_(task.id, id);
    // 일반 제출 ↔ 대체과제로 방식이 바뀌었으면 예전 파일은 칸이 맞지 않아 유지할 수 없다
    const oldFiles = old && (old.v[S.ALT] === true) === alt ? filesOf_(old.v) : [];
    keeps.forEach(function (k) {
      const f = oldFiles.filter(function (x) { return x.id === String(k.id); })[0];
      if (f && task.slots[f.s] && task.slots[f.s].kind !== 'text') keepList.push({ id: f.id, slot: f.s, order: Number(k.order) || 1 });
    });
  }

  const name = String(s.v[C.NAME]).trim();
  const home = childFolder_(taskFolder_(task), id + '_' + clean_(name));
  const folder = home.createFolder('올리는중_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss'));
  const uploadId = folder.getId();
  putUpload_(uploadId, { sid: id, task: task.id, files: [], keeps: keepList, alt: alt });
  return { ok: true, uploadId: uploadId };
}

/** 파일 하나를 올린다. slot: 제출 칸 번호(0부터), -1은 대표 썸네일 */
function apiUploadFile(token, uploadId, slot, order, origName, mime, b64) {
  const s = sessionStudent_(token);
  if (!s) return expired_();
  const id = normId_(s.v[C.ID]);
  const up = getUpload_(uploadId);
  if (!up || up.sid !== id) return fail_('업로드 시간이 지났습니다. 처음부터 다시 제출해 주세요.');
  const task = getTask_(up.task);
  if (!task) return fail_('과제를 찾을 수 없습니다.');
  if (up.alt) task.slots = ALT_SLOTS;
  slot = Number(slot); order = Number(order) || 1;
  const def = slot === -1 ? { name: '썸네일', kind: 'thumb', max: 1 } : task.slots[slot];
  if (!def) return fail_('제출 칸 정보가 맞지 않습니다.');
  const kept = (up.keeps || []).filter(function (k) { return k.slot === slot; }).length;
  if (up.files.filter(function (f) { return f.s === slot; }).length + kept >= def.max) return fail_(def.name + ' 칸에 올릴 수 있는 개수를 넘었습니다.');

  let bytes;
  try { bytes = Utilities.base64Decode(String(b64 || '')); } catch (e) { return fail_('파일을 읽지 못했습니다. 다시 시도해 주세요.'); }
  if (!bytes.length) return fail_('빈 파일은 올릴 수 없습니다.');
  if (bytes.length > LIMIT[def.kind]) return fail_(def.name + ' 파일이 너무 큽니다. (최대 ' + Math.round(LIMIT[def.kind] / MB) + 'MB)');

  let ext = '', type = String(mime || ''), text = '';
  if (def.kind === 'text') {
    text = Utilities.newBlob(bytes).getDataAsString('UTF-8').trim();
    if (!text) return fail_(def.name + ' 칸에 내용을 적어 주세요.');
    if (text.length > TEXT_MAX) return fail_(def.name + ' 칸은 ' + TEXT_MAX + '자까지 쓸 수 있습니다.');
    ext = '.txt'; type = 'text/plain';
  } else if (def.kind === 'image' || def.kind === 'thumb') {
    if (type === 'image/png') ext = '.png';
    else if (type === 'image/jpeg') ext = '.jpg';
    else return fail_('이미지는 jpg 또는 png만 올릴 수 있습니다.');
  } else if (def.kind === 'pdf') {
    const head = bytes.slice(0, 4).map(function (b) { return String.fromCharCode(b & 255); }).join('');
    if (head !== '%PDF') return fail_(def.name + ' 칸에는 PDF 파일만 올릴 수 있습니다.');
    ext = '.pdf'; type = 'application/pdf';
  } else {
    const m = String(origName || '').match(/\.([A-Za-z0-9]{1,8})$/);
    ext = m ? '.' + m[1].toLowerCase() : '';
    type = type || 'application/octet-stream';
  }
  const base = baseName_(task, id, s.v[C.NAME]);
  const fileName = base + '_' + clean_(def.name) + (def.max > 1 ? order : '') + ext;
  const file = DriveApp.getFolderById(uploadId).createFile(Utilities.newBlob(bytes, type, fileName));
  const rec = { n: fileName, id: file.getId(), s: slot, o: order };
  if (text) rec.x = text; // 글은 시트에도 내용을 남겨 화면에서 바로 보이게 한다
  up.files.push(rec);
  putUpload_(uploadId, up);
  return { ok: true };
}

/** 제출 확정: 개수 확인 → 유지할 파일 복사 → ZIP 만들기 → 제출 기록. repOrder: 대표 이미지가 몇 번째인지 */
function apiCommitSubmit(token, uploadId, repOrder) {
  const s = sessionStudent_(token);
  if (!s) return expired_();
  const id = normId_(s.v[C.ID]);
  const name = String(s.v[C.NAME]).trim();
  const up = getUpload_(uploadId);
  if (!up || up.sid !== id) return fail_('업로드 시간이 지났습니다. 처음부터 다시 제출해 주세요.');
  const task = getTask_(up.task);
  if (!task) return fail_('과제를 찾을 수 없습니다.');
  if (up.alt) task.slots = ALT_SLOTS;
  const allow = allowSet_();
  const win = windowOf_(task, id, allow);
  if (win === 'closed') return fail_('접수가 마감되었습니다.');
  if (lockedByGrade_(task.id, id, allow)) return fail_(LOCKED_MSG);
  const keeps = up.keeps || [];

  for (let i = 0; i < task.slots.length; i++) {
    const n = up.files.filter(function (f) { return f.s === i; }).length + keeps.filter(function (k) { return k.slot === i; }).length;
    if (n < task.slots[i].min) return fail_(task.slots[i].kind === 'text' ? task.slots[i].name + ' 칸에 내용을 적어 주세요.' : task.slots[i].name + ' 칸에 파일을 ' + task.slots[i].min + '개 이상 올려 주세요.');
    if (n > task.slots[i].max) return fail_(task.slots[i].name + ' 칸에 올릴 수 있는 개수를 넘었습니다.');
  }

  const now = new Date();
  const folder = DriveApp.getFolderById(uploadId);
  const base = baseName_(task, id, name);
  const main = up.files.filter(function (f) { return f.s >= 0; }).map(function (f) { const o = { n: f.n, id: f.id, s: f.s, o: f.o || 1 }; if (f.x) o.x = f.x; return o; });
  // 그대로 두기로 한 기존 파일은 새 폴더로 복사하면서 번호를 다시 붙인다
  keeps.forEach(function (k) {
    const def = task.slots[k.slot];
    const src = DriveApp.getFileById(k.id);
    const ext = (src.getName().match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0];
    const newName = base + '_' + clean_(def.name) + (def.max > 1 ? k.order : '') + ext;
    main.push({ n: newName, id: src.makeCopy(newName, folder).getId(), s: k.slot, o: k.order });
  });
  main.sort(function (a, b) { return (a.s - b.s) || (a.o - b.o); });

  // 대표 이미지 표시
  let repSlot = -1;
  task.slots.forEach(function (d, i) { if (repSlot < 0 && d.kind === 'image') repSlot = i; });
  if (repSlot >= 0) {
    const inSlot = main.filter(function (f) { return f.s === repSlot; });
    const rep = inSlot.filter(function (f) { return f.o === Number(repOrder); })[0] || inSlot[0];
    if (rep) rep.r = 1;
  }

  let zipId = '';
  const zippable = task.slots.every(function (d) { return d.kind !== 'file'; }); // 3D 같은 큰 파일은 압축하지 않는다
  if (zippable) {
    const blobs = main.map(function (f) { return DriveApp.getFileById(f.id).getBlob().setName(f.n); });
    zipId = folder.createFile(Utilities.zip(blobs, base + '.zip')).getId();
  }
  folder.setName('제출_' + Utilities.formatDate(now, TZ, 'yyyyMMdd-HHmmss'));
  const thumb = up.files.filter(function (f) { return f.s === -1; })[0];

  const lateDays = win === 'open' ? 0 : Math.max(1, Math.ceil((now.getTime() - task.due.getTime()) / 86400000));
  const state = win === 'open' ? '정시' : (win === 'late' ? '지각' : '예외');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return fail_('접속이 몰리고 있습니다. 잠시 후 다시 제출해 주세요.');
  try {
    const old = findSub_(task.id, id);
    const row = [task.id, id, name, now, old ? old.v[S.FIRST] : now, state, lateDays,
      old ? Number(old.v[S.COUNT] || 1) + 1 : 1, uploadId, zipId, thumb ? thumb.id : '',
      JSON.stringify(main.concat(thumb ? [{ n: thumb.n, id: thumb.id, s: -1 }] : [])), up.alt === true];
    if (old) {
      old.sh.getRange(old.row, 1, 1, row.length).setValues([row]);
      retireFolder_(old.v[S.FOLDER], '이전_');
    } else {
      sheet_(SHEET.SUBS).appendRow(row);
    }
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove('up:' + uploadId);
  log_(id, name, '제출', task.id + ' · ' + state + (lateDays ? ' ' + lateDays + '일' : '') + ' · 파일 ' + main.length + '개' + (up.alt ? ' · 대체과제' : '') + (keeps.length ? ' (유지 ' + keeps.length + ')' : ''));
  return { ok: true, home: buildHome_(s.v) };
}

/** 수정 화면용: 내가 낸 이미지들의 작은 미리보기 */
function apiMyPreviews(token, taskId) {
  const s = sessionStudent_(token);
  if (!s) return expired_();
  const task = getTask_(String(taskId));
  const sub = task ? findSub_(task.id, normId_(s.v[C.ID])) : null;
  const out = {};
  if (!sub) return { ok: true, previews: out };
  const slots = sub.v[S.ALT] === true ? ALT_SLOTS : task.slots;
  filesOf_(sub.v).forEach(function (f) {
    if (!slots[f.s] || slots[f.s].kind !== 'image') return;
    try {
      const file = DriveApp.getFileById(f.id);
      let blob = file.getThumbnail();              // 드라이브가 만든 작은 미리보기
      if (!blob && file.getSize() < 1.5 * MB) blob = file.getBlob(); // 아직 없으면 작은 원본으로
      if (blob) out[f.id] = 'data:' + (blob.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (e) {}
  });
  return { ok: true, previews: out };
}

/** 수정 화면용: 유지하는 이미지를 대표로 바꿀 때 원본을 한 장 받아 간다 */
function apiMyFile(token, taskId, fileId) {
  const s = sessionStudent_(token);
  if (!s) return expired_();
  const sub = findSub_(String(taskId), normId_(s.v[C.ID]));
  const mine = sub ? filesOf_(sub.v).filter(function (f) { return f.id === String(fileId); })[0] : null;
  if (!mine) return fail_('파일을 찾을 수 없습니다.');
  const blob = DriveApp.getFileById(mine.id).getBlob();
  const bytes = blob.getBytes();
  if (bytes.length > LIMIT.image) return fail_('파일이 너무 큽니다.');
  return { ok: true, mime: blob.getContentType() || 'image/jpeg', b64: Utilities.base64Encode(bytes) };
}

/** 공개된 내 점수를 확인했다는 기록을 남긴다. */
function apiConfirmScore(token, taskId) {
  const s = sessionStudent_(token);
  if (!s) return expired_();
  const id = normId_(s.v[C.ID]);
  const task = getTask_(String(taskId));
  if (!task || !task.scoresOpen) return fail_('아직 점수가 공개되지 않았습니다.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_('접속이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.');
  try {
    const g = findGrade_(task.id, id);
    if (!g || !String(g.v[G.GRADE] || '').trim()) return fail_('아직 채점되지 않았습니다.');
    if (!(g.v[G.CONF] instanceof Date)) {
      g.sh.getRange(g.row, G.CONF + 1, 1, 2).setValues([[new Date(), g.v[G.POINTS]]]);
      log_(id, s.v[C.NAME], '점수 확인', task.id + ' · ' + g.v[G.GRADE] + ' ' + g.v[G.POINTS] + '점 · 이상 없음');
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true, home: buildHome_(s.v) };
}

/** 내 제출 삭제: 기록을 지우고 파일은 '삭제_' 폴더로 남겨 둔다. */
function apiDeleteSubmission(token, taskId) {
  const s = sessionStudent_(token);
  if (!s) return expired_();
  const id = normId_(s.v[C.ID]);
  const task = getTask_(String(taskId));
  if (!task) return fail_('과제를 찾을 수 없습니다.');
  const allow = allowSet_();
  if (windowOf_(task, id, allow) === 'closed') return fail_('마감 후에는 삭제할 수 없습니다.');
  if (lockedByGrade_(task.id, id, allow)) return fail_(LOCKED_MSG);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return fail_('접속이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.');
  try {
    const old = findSub_(task.id, id);
    if (!old) return fail_('삭제할 제출이 없습니다.');
    old.sh.deleteRow(old.row);
    retireFolder_(old.v[S.FOLDER], '삭제_');
  } finally {
    lock.releaseLock();
  }
  log_(id, s.v[C.NAME], '제출 삭제', task.id);
  return { ok: true, home: buildHome_(s.v) };
}

function findSub_(taskId, studentId) {
  const sh = sheet_(SHEET.SUBS);
  const vals = read_(sh, SUB_HEADERS.length);
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][S.TASK]).trim() === taskId && normId_(vals[i][S.ID]) === studentId) return { sh: sh, row: i + 2, v: vals[i] };
  }
  return null;
}

/** 채점이 끝난 제출물은 교사가 허용해 주기 전까지 학생이 고치거나 지울 수 없다. */
const LOCKED_MSG = '채점이 끝난 제출물은 수정할 수 없습니다. 수정이 필요하면 선생님께 말씀해 주세요.';
function lockedByGrade_(taskId, studentId, allow) {
  if (allow[taskId + '|' + studentId]) return false;
  const g = findGrade_(taskId, studentId);
  return !!(g && String(g.v[G.GRADE] || '').trim() && findSub_(taskId, studentId));
}

function findGrade_(taskId, studentId) {
  const sh = sheet_(SHEET.GRADES);
  const vals = read_(sh, GRADE_HEADERS.length);
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][G.TASK]).trim() === taskId && normId_(vals[i][G.ID]) === studentId) return { sh: sh, row: i + 2, v: vals[i] };
  }
  return null;
}

function retireFolder_(folderId, prefix) {
  try {
    const f = DriveApp.getFolderById(String(folderId));
    f.setName(prefix + f.getName().replace(/^제출_/, ''));
  } catch (e) { /* 폴더를 손으로 지웠어도 제출은 계속되게 */ }
}

function putUpload_(uploadId, data) { CacheService.getScriptCache().put('up:' + uploadId, JSON.stringify(data), 3600); }
function getUpload_(uploadId) {
  const raw = CacheService.getScriptCache().get('up:' + String(uploadId || ''));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/* ───────────── 드라이브 폴더 ───────────── */

function rootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('ROOT_FOLDER');
  if (saved) { try { return DriveApp.getFolderById(saved); } catch (e) {} }
  const folder = DriveApp.createFolder(cfg_().title + ' 제출함');
  props.setProperty('ROOT_FOLDER', folder.getId());
  return folder;
}

/** 제출함 / 수업ID / 과제ID_제목 — 여러 학생이 동시에 처음 들어와도 폴더가 두 개 생기지 않게 잠근다. */
function taskFolder_(task) {
  const props = PropertiesService.getScriptProperties();
  const key = 'TASK_FOLDER_' + task.id;
  const saved = props.getProperty(key);
  if (saved) { try { return DriveApp.getFolderById(saved); } catch (e) {} }
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const again = props.getProperty(key);
    if (again) { try { return DriveApp.getFolderById(again); } catch (e) {} }
    const folder = childFolder_(childFolder_(rootFolder_(), clean_(task.course)), task.id + '_' + clean_(task.title));
    props.setProperty(key, folder.getId());
    return folder;
  } finally {
    lock.releaseLock();
  }
}

function childFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function clean_(s) { return String(s == null ? '' : s).replace(/[\\\/:*?"<>|\s]+/g, ''); }
function baseName_(task, id, name) { return id + '_' + clean_(name) + '_' + clean_(task.course) + '_' + clean_(task.title); }

/* ───────────── 교사 화면 ───────────── */

function apiTeacherLogin(password) {
  const cache = CacheService.getScriptCache();
  if (Number(cache.get('tfail') || 0) >= MAX_FAILS) return fail_('여러 번 틀려 잠겨 있습니다. ' + LOCK_MINUTES + '분 뒤에 다시 시도해 주세요.');
  const props = PropertiesService.getScriptProperties();
  const hash = props.getProperty('T_HASH');
  if (!hash) return fail_('시트 메뉴 [수업 관리] > 교사 비밀번호 설정을 먼저 해 주세요.');
  if (hashPin_(String(password || ''), props.getProperty('T_SALT')) !== hash) {
    cache.put('tfail', String(Number(cache.get('tfail') || 0) + 1), LOCK_MINUTES * 60);
    return fail_('비밀번호가 올바르지 않습니다.');
  }
  cache.remove('tfail');
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  cache.put('tsess:' + token, '1', SESSION_SECONDS);
  log_('', '교사', '교사 로그인', '');
  return { ok: true, token: token, board: teacherBoard_() };
}

function isTeacher_(token) { return !!token && CacheService.getScriptCache().get('tsess:' + token) === '1'; }

function apiTeacherBoard(token) {
  if (!isTeacher_(token)) return expired_();
  return { ok: true, board: teacherBoard_() };
}

function teacherBoard_() {
  return {
    courses: activeCourses_().map(function (c) { return { id: c.id, name: c.name, kind: c.kind, desc: c.desc }; }),
    tasks: (function () {
      const counts = {}; // 과제별 제출 수: 제출이 있으면 제출 칸 구성을 못 바꾸게 하려고
      rows_(SHEET.SUBS, SUB_HEADERS.length).forEach(function (r) { const k = String(r[S.TASK]).trim(); if (k) counts[k] = (counts[k] || 0) + 1; });
      return allTasks_().map(function (t) {
        return { id: t.id, course: t.course, title: t.title, desc: t.desc, due: t.due ? koDate_(t.due) : '', finalDue: t.fin ? koDate_(t.fin) : '',
          dueAt: t.due ? t.due.getTime() : 0, finAt: t.fin ? t.fin.getTime() : 0,
          published: t.published, hasSlots: t.slots.length > 0, slots: t.slots, subCount: counts[t.id] || 0,
          gallery: t.gallery, galleryNames: t.galleryNames,
          scale: t.scale, graded: t.scale.length > 0, scoresOpen: t.scoresOpen };
      });
    })()
  };
}

/** 과제 하나의 전체 제출 현황 */
function apiTeacherTask(token, taskId) {
  if (!isTeacher_(token)) return expired_();
  const task = getTask_(String(taskId));
  if (!task) return fail_('과제를 찾을 수 없습니다.');
  const course = activeCourses_().filter(function (c) { return c.id === task.course; })[0];
  if (!course) return fail_('과제의 수업을 찾을 수 없습니다.');
  const subs = {};
  rows_(SHEET.SUBS, SUB_HEADERS.length).forEach(function (r) {
    if (String(r[S.TASK]).trim() === task.id) subs[normId_(r[S.ID])] = r;
  });
  const allow = allowSet_();
  const grades = {};
  rows_(SHEET.GRADES, GRADE_HEADERS.length).forEach(function (r) {
    if (String(r[G.TASK]).trim() === task.id) grades[normId_(r[G.ID])] = r;
  });
  const students = rows_(SHEET.STUDENTS, STUDENT_HEADERS.length).filter(function (v) {
    const id = normId_(v[C.ID]);
    return validId_(id) && enrolled_(course.id, course.auto, id, v[C.COURSES]);
  }).map(function (v) {
    const id = normId_(v[C.ID]);
    const sub = subs[id];
    const g = grades[id];
    return {
      mark: g ? String(g[G.GRADE] || '').trim() : '',
      points: g && String(g[G.GRADE] || '').trim() ? Number(g[G.POINTS]) : null,
      confirmed: !!(g && g[G.CONF] instanceof Date),
      hasMemo: !!(g && String(g[G.MEMO] || '').trim()),
      stale: staleGrade_(g, sub),
      id: id, name: String(v[C.NAME]).trim(),
      grade: idParts_(id).grade, cls: idParts_(id).cls, num: idParts_(id).num,
      state: sub ? stateKey_(sub[S.STATE]) : 'none',
      lateDays: sub ? Number(sub[S.LATE] || 0) : 0,
      allowed: !!allow[task.id + '|' + id],
      note: boardNote_(statusOf_(v)), away: AWAY_STATUS.indexOf(statusOf_(v)) >= 0, alt: !!(sub && sub[S.ALT] === true)
    };
  }).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  return { ok: true, taskId: task.id, students: students };
}

/** 채점한 뒤에 학생이 다시 제출했는가 */
function staleGrade_(gradeRow, subRow) {
  return !!(gradeRow && subRow && String(gradeRow[G.GRADE] || '').trim() &&
    gradeRow[G.AT] instanceof Date && subRow[S.AT] instanceof Date && subRow[S.AT].getTime() > gradeRow[G.AT].getTime());
}

function gradeView_(row) {
  const has = row && String(row[G.GRADE] || '').trim();
  return {
    mark: has ? String(row[G.GRADE]).trim() : '',
    points: has ? Number(row[G.POINTS]) : null,
    gradedAt: has && row[G.AT] instanceof Date ? koDate_(row[G.AT]) : '',
    memo: row ? String(row[G.MEMO] || '') : '',
    priv: row ? String(row[G.PRIV] || '') : '',
    confirmedAt: row && row[G.CONF] instanceof Date ? koDate_(row[G.CONF]) : '',
    confirmedPoints: row && row[G.CONF] instanceof Date ? Number(row[G.CONFP]) : null
  };
}

/** 학생 한 명의 제출·채점 세부 */
function apiTeacherDetail(token, taskId, studentId) {
  if (!isTeacher_(token)) return expired_();
  taskId = String(taskId); studentId = normId_(studentId);
  const task = getTask_(taskId);
  const sub = findSub_(taskId, studentId);
  const g = findGrade_(taskId, studentId);
  const st = findStudent_(studentId);
  const out = { ok: true, allowed: !!allowSet_()[taskId + '|' + studentId], submission: null, grade: gradeView_(g ? g.v : null), stale: staleGrade_(g ? g.v : null, sub ? sub.v : null),
    pin: !st ? 'none' : (lockMessage_(st.v) ? 'locked' : (st.v[C.HASH] ? 'set' : 'none')), // PIN 숫자는 저장하지 않아 상태만 알 수 있다
    status: st ? statusOf_(st.v) : '', statusList: STATUS_LIST, altStatus: ALT_STATUS };
  if (!sub) return out;
  const v = sub.v;
  let thumb = '';
  if (v[S.THUMB]) {
    try { thumb = 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(String(v[S.THUMB])).getBlob().getBytes()); } catch (e) {}
  }
  out.submission = {
    at: v[S.AT] instanceof Date ? koDate_(v[S.AT]) : '',
    firstAt: v[S.FIRST] instanceof Date ? koDate_(v[S.FIRST]) : '',
    state: stateKey_(v[S.STATE]),
    lateDays: Number(v[S.LATE] || 0),
    count: Number(v[S.COUNT] || 1),
    alt: v[S.ALT] === true,
    thumb: thumb,
    files: filesOf_(v).map(function (f) {
      const slotDef = (v[S.ALT] === true ? ALT_SLOTS : (task ? task.slots : []))[f.s];
      const item = { name: shortName_(f.n), url: 'https://drive.google.com/file/d/' + f.id + '/view', small: '', text: f.x, slot: slotDef ? slotDef.name : '' };
      // 대표가 아닌 이미지는 드라이브의 작은 미리보기를 붙인다 (없으면 링크만)
      if (task && v[S.ALT] !== true && task.slots[f.s] && task.slots[f.s].kind === 'image' && !f.r) {
        try {
          const b = DriveApp.getFileById(f.id).getThumbnail();
          if (b) item.small = 'data:' + (b.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(b.getBytes());
        } catch (e) {}
      }
      return item;
    }),
    zipUrl: v[S.ZIP] ? 'https://drive.google.com/file/d/' + v[S.ZIP] + '/view' : '',
    folderUrl: v[S.FOLDER] ? 'https://drive.google.com/drive/folders/' + v[S.FOLDER] : ''
  };
  return out;
}

/* ───────────── 교사: 과제 만들기·고치기 ───────────── */

const KIND_WORD = { text: '글', image: '이미지', pdf: 'PDF', file: '파일' };

/**
 * 과제 만들기·고치기.
 * d: { id, title, desc, dueAt, finAt, graded, scale, slots: [{ name, kind, min, max }], published }
 * 채점 여부는 배점 칸이 채워져 있는지로 구분한다(평가 = 배점 있음).
 */
function apiTeacherSaveTask(token, courseId, d) {
  if (!isTeacher_(token)) return expired_();
  courseId = String(courseId); d = d || {};
  if (!activeCourses_().some(function (c) { return c.id === courseId; })) return fail_('수업을 찾을 수 없습니다.');
  const title = String(d.title || '').trim().slice(0, 60);
  if (!title) return fail_('과제 제목을 입력해 주세요.');
  const desc = String(d.desc || '').trim().slice(0, 500);
  const dueAt = Number(d.dueAt) || 0;
  if (!dueAt) return fail_('정시 마감을 정해 주세요.');
  const finAt = Number(d.finAt) || dueAt;
  if (finAt < dueAt) return fail_('최종 마감은 정시 마감보다 빠를 수 없습니다.');

  let scale = '';
  if (d.graded) {
    const parsed = parseScale_(d.scale);
    if (!parsed.length) return fail_('배점을 A:20, B:17 처럼 "등급:점수"를 쉼표로 이어 적어 주세요.');
    scale = parsed.map(function (x) { return x.g + ':' + x.p; }).join(', ');
  }

  const names = {};
  const slots = [];
  const list = d.slots || [];
  for (let i = 0; i < list.length; i++) {
    const name = String(list[i].name || '').replace(/[|;\n]/g, ' ').trim().slice(0, 20);
    const kind = KIND_WORD[list[i].kind] ? list[i].kind : 'file';
    if (!name) return fail_('제출 칸 이름을 모두 적어 주세요.');
    if (names[name]) return fail_('제출 칸 이름이 겹칩니다: ' + name);
    names[name] = true;
    let min = parseInt(list[i].min, 10); if (isNaN(min) || min < 0) min = 1;
    let max = parseInt(list[i].max, 10); if (isNaN(max) || max < 1) max = Math.max(min, 1);
    if (max < min) return fail_(name + ' 칸의 최대 개수가 최소보다 작습니다.');
    if (max > 10) return fail_(name + ' 칸은 최대 10개까지 받을 수 있습니다.');
    if (kind === 'text') { min = Math.min(min, 1); max = 1; }
    slots.push({ name: name, kind: kind, min: min, max: max });
  }
  const slotText = slots.map(function (s) { return s.name + '|' + KIND_WORD[s.kind] + '|' + s.min + '|' + s.max; }).join('; ');

  const sh = sheet_(SHEET.TASKS);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let taskId = String(d.id || '').trim();
  try {
    let row, keep = [false, false], scoresOpen = false;
    if (taskId) {
      const all = read_(sh, TASK_HEADERS.length);
      const at = all.map(function (r) { return String(r[0]).trim(); }).indexOf(taskId);
      if (at < 0 || String(all[at][1]).trim() !== courseId) return fail_(CHANGED_MSG);
      row = at + 2;
      keep = [all[at][8] === true, all[at][9] === true];
      scoresOpen = all[at][11] === true && !!scale;
      // 이미 낸 학생이 있으면 칸의 이름·종류·순서는 그대로여야 기존 제출물이 어긋나지 않는다
      if (findSubCount_(taskId) > 0) {
        const old = parseSlots_(all[at][7]);
        const same = old.length === slots.length && old.every(function (o, i) { return o.name === slots[i].name && o.kind === slots[i].kind; });
        if (!same) return fail_('이미 제출한 학생이 있어 제출 칸의 이름, 종류, 순서는 바꿀 수 없습니다. 개수만 바꿀 수 있습니다.');
      }
    } else {
      // 같은 초에 두 번 눌러도 과제ID가 겹치지 않게 한다
      const used = read_(sh, 1).map(function (r) { return String(r[0]).trim(); });
      const stamp = 'T' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss');
      taskId = stamp;
      for (let n = 2; used.indexOf(taskId) >= 0; n++) taskId = stamp + '-' + n;
      row = freeRow_(sh, 1);
    }
    sh.getRange(row, 1, 1, TASK_HEADERS.length).setValues([[taskId, courseId, title, desc, new Date(dueAt), new Date(finAt),
      d.published !== false, slotText, keep[0], keep[1], scale, scoresOpen]]);
  } finally {
    lock.releaseLock();
  }
  log_('', '교사', d.id ? '과제 수정' : '과제 만들기', courseId + ' · ' + title + (scale ? ' · 평가' : ''));
  return { ok: true, taskId: taskId, board: teacherBoard_() };
}

function findSubCount_(taskId) {
  return rows_(SHEET.SUBS, SUB_HEADERS.length).filter(function (r) { return String(r[S.TASK]).trim() === taskId; }).length;
}

/* ───────────── 설문 ───────────── */
/*
 * 문항(JSON): [{ t: 'one'|'many'|'text', q: '질문', o: ['선지', ...], etc: 기타 칸, req: 필수 }]
 * 응답(JSON): 문항 순서대로 — one: '선지' 또는 '기타: 내용', many: ['선지', '기타: 내용'], text: '내용', 안 한 문항: ''
 * 익명 설문은 응답 줄에 학번·이름을 남기지 않고, 참여한 학번만 설문 줄에 번호순으로 모아 둔다.
 * 그래서 응답 기록만으로는 누가 무엇을 골랐는지 알 수 없다.
 */
const SV = { ID: 0, COURSE: 1, TITLE: 2, DESC: 3, ANON: 4, QS: 5, OPEN: 6, DUE: 7, PUB: 8, TOOK: 9 };
const ETC = '기타: ';
const SURVEY_TEXT_MAX = 2000;

function parseQs_(cell) {
  let list = [];
  try { list = JSON.parse(String(cell || '[]')); } catch (e) { list = []; }
  return Array.isArray(list) ? list.map(function (x) {
    const t = x && (x.t === 'many' || x.t === 'text') ? x.t : 'one';
    return { t: t, q: String(x && x.q || '').trim(), o: t === 'text' ? [] : (Array.isArray(x && x.o) ? x.o.map(String) : []), etc: t !== 'text' && !!(x && x.etc), req: !!(x && x.req) };
  }).filter(function (x) { return x.q; }) : [];
}
function surveyFromRow_(r) {
  const due = r[SV.DUE] instanceof Date ? r[SV.DUE] : null;
  return {
    id: String(r[SV.ID]).trim(), course: String(r[SV.COURSE]).trim(), title: String(r[SV.TITLE] || '').trim(),
    desc: String(r[SV.DESC] || ''), anon: r[SV.ANON] === true, qs: parseQs_(r[SV.QS]),
    open: r[SV.OPEN] === true && (!due || due.getTime() > Date.now()), switchOn: r[SV.OPEN] === true,
    due: due, published: r[SV.PUB] === true,
    took: String(r[SV.TOOK] || '').split(',').map(function (x) { return x.trim(); }).filter(String)
  };
}
function findSurvey_(id) {
  const sh = sheet_(SHEET.SURVEYS);
  const rows = read_(sh, SURVEY_HEADERS.length);
  for (let i = 0; i < rows.length; i++) if (String(rows[i][SV.ID]).trim() === id) return { sh: sh, row: i + 2, v: rows[i], s: surveyFromRow_(rows[i]) };
  return null;
}
function answersOf_(surveyId) {
  return rows_(SHEET.ANSWERS, ANSWER_HEADERS.length).map(function (r, i) {
    if (String(r[0]).trim() !== surveyId) return null;
    let a = [];
    try { a = JSON.parse(String(r[4] || '[]')); } catch (e) { a = []; }
    return { row: i + 2, id: normId_(r[1]), name: String(r[2] || '').trim(), at: r[3], a: Array.isArray(a) ? a : [] };
  }).filter(Boolean);
}

/** 학생 화면: 내 수업의 게시된 설문 */
function readSurveys_(ids, studentId) {
  const surveys = rows_(SHEET.SURVEYS, SURVEY_HEADERS.length).map(surveyFromRow_).filter(function (s) {
    return s.id && s.published && ids.indexOf(s.course) >= 0 && s.qs.length;
  });
  if (!surveys.length) return [];
  const mine = {};
  rows_(SHEET.ANSWERS, ANSWER_HEADERS.length).forEach(function (r) {
    if (normId_(r[1]) !== studentId) return;
    try { mine[String(r[0]).trim()] = JSON.parse(String(r[4] || '[]')); } catch (e) {}
  });
  return surveys.map(function (s) {
    const done = s.anon ? s.took.indexOf(studentId) >= 0 : !!mine[s.id];
    return { id: s.id, course: s.course, title: s.title, desc: s.desc, anon: s.anon, qs: s.qs, open: s.open,
      due: s.due ? koDate_(s.due) : '', done: done, mine: !s.anon && mine[s.id] ? mine[s.id] : null };
  });
}

/** 응답 다듬기: 문항에 맞지 않는 값은 거른다. 문제가 있으면 안내 문구(문자열)를 돌려준다. */
function cleanAnswers_(qs, answers) {
  if (!Array.isArray(answers)) return '응답을 다시 보내 주세요.';
  const out = [];
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i], raw = answers[i], label = (i + 1) + '번 문항';
    const etc = function (v) {
      const t = String(v || '');
      if (t.indexOf(ETC) !== 0) return null;
      const body = t.slice(ETC.length).trim().slice(0, 200);
      return q.etc && body ? ETC + body : '';
    };
    if (q.t === 'text') {
      const t = String(raw == null ? '' : raw).trim();
      if (t.length > SURVEY_TEXT_MAX) return label + '은 ' + SURVEY_TEXT_MAX + '자까지 쓸 수 있습니다.';
      out.push(t);
    } else if (q.t === 'one') {
      let v = String(raw == null ? '' : raw);
      if (v.indexOf(ETC) === 0) { v = etc(v); if (v === '') return label + '의 기타 칸에 내용을 적어 주세요.'; }
      else if (v && q.o.indexOf(v) < 0) return label + '을 다시 골라 주세요.';
      out.push(v || '');
    } else {
      const list = [];
      (Array.isArray(raw) ? raw : []).forEach(function (x) {
        const v = String(x);
        if (v.indexOf(ETC) === 0) { const e = etc(v); if (e) list.push(e); else if (e === '') list.push(null); }
        else if (q.o.indexOf(v) >= 0 && list.indexOf(v) < 0) list.push(v);
      });
      if (list.indexOf(null) >= 0) return label + '의 기타 칸에 내용을 적어 주세요.';
      out.push(list);
    }
    const empty = Array.isArray(out[i]) ? !out[i].length : !out[i];
    if (q.req && empty) return label + '에 답해 주세요.';
  }
  return out;
}

function apiSubmitSurvey(token, surveyId, answers) {
  const st = sessionStudent_(token);
  if (!st) return expired_();
  const id = normId_(st.v[C.ID]);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const f = findSurvey_(String(surveyId));
    if (!f || !f.s.published) return fail_('설문을 찾을 수 없습니다.');
    const s = f.s;
    if (coursesOf_(id, st.v[C.COURSES]).map(function (c) { return c.id; }).indexOf(s.course) < 0) return fail_('이 설문의 대상이 아닙니다.');
    if (!s.open) return fail_('응답을 받지 않는 설문입니다.');
    const clean = cleanAnswers_(s.qs, answers);
    if (typeof clean === 'string') return fail_(clean);
    const ans = sheet_(SHEET.ANSWERS);
    if (s.anon) {
      if (s.took.indexOf(id) >= 0) return fail_('이미 응답했습니다. 익명 설문은 응답을 고칠 수 없습니다.');
      // 응답에는 누구인지와 시각을 남기지 않는다. 참여 명단은 번호순이라 응답 순서와 이어지지 않는다.
      ans.appendRow([s.id, '', '', Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), JSON.stringify(clean)]);
      const took = s.took.concat([id]).sort();
      f.sh.getRange(f.row, SV.TOOK + 1).setValue(took.join(','));
    } else {
      const name = String(st.v[C.NAME]).trim();
      const old = answersOf_(s.id).filter(function (a) { return a.id === id; })[0];
      const row = [s.id, id, name, new Date(), JSON.stringify(clean)];
      if (old) ans.getRange(old.row, 1, 1, row.length).setValues([row]);
      else ans.appendRow(row);
      log_(id, name, old ? '설문 응답 수정' : '설문 응답', s.title);
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true, home: buildHome_(findStudent_(id).v) };
}

/* 교사: 설문 목록·만들기·결과 */
function rosterOf_(courseId) {
  const course = activeCourses_().filter(function (c) { return c.id === courseId; })[0];
  if (!course) return [];
  return rows_(SHEET.STUDENTS, STUDENT_HEADERS.length).filter(function (v) {
    const id = normId_(v[C.ID]);
    return validId_(id) && enrolled_(course.id, course.auto, id, v[C.COURSES]);
  }).map(function (v) {
    const id = normId_(v[C.ID]), p = idParts_(id);
    return { id: id, name: String(v[C.NAME]).trim(), cls: p.cls, num: p.num };
  });
}
function teacherSurveys_(courseId) {
  const counts = {};
  rows_(SHEET.ANSWERS, ANSWER_HEADERS.length).forEach(function (r) { const k = String(r[0]).trim(); if (k) counts[k] = (counts[k] || 0) + 1; });
  const target = rosterOf_(courseId).length;
  const list = rows_(SHEET.SURVEYS, SURVEY_HEADERS.length).map(surveyFromRow_).filter(function (s) { return s.id && s.course === courseId; })
    .map(function (s) {
      return { id: s.id, title: s.title, desc: s.desc, anon: s.anon, qs: s.qs, open: s.open, switchOn: s.switchOn, published: s.published,
        due: s.due ? koDate_(s.due) : '', dueAt: s.due ? s.due.getTime() : 0, count: counts[s.id] || 0, target: target };
    });
  list.reverse(); // 최근에 만든 설문이 위로
  return { ok: true, courseId: courseId, surveys: list };
}
function apiTeacherSurveys(token, courseId) {
  if (!isTeacher_(token)) return expired_();
  return teacherSurveys_(String(courseId));
}

/** 설문 만들기·고치기. d: { id, title, desc, anon, qs, open, dueAt, published } */
function apiTeacherSaveSurvey(token, courseId, d) {
  if (!isTeacher_(token)) return expired_();
  courseId = String(courseId); d = d || {};
  if (!activeCourses_().some(function (c) { return c.id === courseId; })) return fail_('수업을 찾을 수 없습니다.');
  const title = String(d.title || '').trim().slice(0, 60);
  if (!title) return fail_('설문 제목을 입력해 주세요.');
  const qs = [];
  const raw = Array.isArray(d.qs) ? d.qs : [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i].t === 'many' || raw[i].t === 'text' ? raw[i].t : 'one';
    const q = String(raw[i].q || '').trim().slice(0, 200);
    if (!q) return fail_((i + 1) + '번 문항의 질문을 적어 주세요.');
    let o = [];
    if (t !== 'text') {
      (Array.isArray(raw[i].o) ? raw[i].o : String(raw[i].o || '').split('\n')).forEach(function (x) {
        x = String(x).trim().slice(0, 100);
        if (x && x.indexOf(ETC) !== 0 && o.indexOf(x) < 0) o.push(x);
      });
      if (o.length + (raw[i].etc ? 1 : 0) < 2) return fail_((i + 1) + '번 문항의 선지를 두 개 이상 적어 주세요.');
      if (o.length > 30) return fail_((i + 1) + '번 문항의 선지는 30개까지입니다.');
    }
    qs.push({ t: t, q: q, o: o, etc: t !== 'text' && !!raw[i].etc, req: !!raw[i].req });
  }
  if (!qs.length) return fail_('문항을 하나 이상 넣어 주세요.');
  if (qs.length > 40) return fail_('문항은 40개까지입니다.');
  const dueAt = Number(d.dueAt) || 0;

  const sh = sheet_(SHEET.SURVEYS);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let sid = String(d.id || '').trim();
  try {
    let row, took = '', anon = !!d.anon, qsCell = JSON.stringify(qs);
    if (sid) {
      const f = findSurvey_(sid);
      if (!f || f.s.course !== courseId) return fail_(CHANGED_MSG);
      row = f.row;
      took = String(f.v[SV.TOOK] || '');
      // 응답이 들어온 뒤에는 문항과 익명 여부를 바꾸지 않는다 (이미 낸 응답과 어긋나지 않게)
      if (answersOf_(sid).length) {
        if (anon !== f.s.anon) return fail_('응답이 들어온 설문은 익명 여부를 바꿀 수 없습니다.');
        if (qsCell !== JSON.stringify(f.s.qs)) return fail_('응답이 들어온 설문은 문항을 바꿀 수 없습니다. 제목, 설명, 마감, 응답 받기만 고칠 수 있습니다.');
      }
    } else {
      const used = read_(sh, 1).map(function (r) { return String(r[0]).trim(); });
      const stamp = 'S' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss');
      sid = stamp;
      for (let n = 2; used.indexOf(sid) >= 0; n++) sid = stamp + '-' + n;
      row = freeRow_(sh, 1);
    }
    sh.getRange(row, 1, 1, SURVEY_HEADERS.length).setValues([[sid, courseId, title, String(d.desc || '').trim().slice(0, 1000), anon, qsCell,
      d.open !== false, dueAt ? new Date(dueAt) : '', d.published !== false, took]]);
  } finally {
    lock.releaseLock();
  }
  log_('', '교사', d.id ? '설문 수정' : '설문 만들기', courseId + ' · ' + title);
  const res = teacherSurveys_(courseId);
  res.surveyId = sid;
  return res;
}

/** 설문과 그 응답을 함께 지운다. */
function apiTeacherDeleteSurvey(token, surveyId) {
  if (!isTeacher_(token)) return expired_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let f;
  try {
    f = findSurvey_(String(surveyId));
    if (!f) return fail_(CHANGED_MSG);
    const ans = sheet_(SHEET.ANSWERS);
    answersOf_(f.s.id).map(function (a) { return a.row; }).sort(function (a, b) { return b - a; })
      .forEach(function (r) { ans.deleteRow(r); });
    f.sh.deleteRow(f.row);
  } finally {
    lock.releaseLock();
  }
  log_('', '교사', '설문 삭제', f.s.title);
  return teacherSurveys_(f.s.course);
}

/** 결과: 문항별 집계, 주관식·기타 모음, 미응답자, 표 복사용 줄 */
function apiTeacherSurveyResult(token, surveyId) {
  if (!isTeacher_(token)) return expired_();
  const f = findSurvey_(String(surveyId));
  if (!f) return fail_('설문을 찾을 수 없습니다.');
  const s = f.s, answers = answersOf_(s.id), roster = rosterOf_(s.course);
  const did = {};
  if (s.anon) s.took.forEach(function (id) { did[id] = true; });
  else answers.forEach(function (a) { did[a.id] = true; });
  const who = function (a) { if (s.anon) return ''; const p = idParts_(a.id); return p.cls + '반 ' + p.num + '번 ' + a.name; };
  const questions = s.qs.map(function (q, i) {
    const out = { t: q.t, q: q.q, req: q.req, answered: 0 };
    if (q.t === 'text') {
      out.texts = [];
      answers.forEach(function (a) { const v = String(a.a[i] || '').trim(); if (v) { out.answered++; out.texts.push({ who: who(a), text: v }); } });
      return out;
    }
    const counts = q.o.map(function () { return 0; });
    let etcCount = 0;
    out.etcTexts = [];
    answers.forEach(function (a) {
      const picked = q.t === 'many' ? (Array.isArray(a.a[i]) ? a.a[i] : []) : (a.a[i] ? [a.a[i]] : []);
      if (picked.length) out.answered++;
      picked.forEach(function (v) {
        v = String(v);
        if (v.indexOf(ETC) === 0) { etcCount++; out.etcTexts.push({ who: who(a), text: v.slice(ETC.length) }); }
        else { const k = q.o.indexOf(v); if (k >= 0) counts[k]++; }
      });
    });
    out.options = q.o.map(function (o, k) { return { label: o, count: counts[k] }; });
    if (q.etc) out.options.push({ label: '기타', count: etcCount, etc: true });
    return out;
  });
  // 표 복사용: 한 줄에 응답 하나 (익명이면 이름 칸 없음)
  const head = (s.anon ? ['번호'] : ['반', '번호', '이름']).concat(s.qs.map(function (q, i) { return (i + 1) + '. ' + q.q; }));
  const sorted = s.anon ? answers : answers.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  const table = [head].concat(sorted.map(function (a, n) {
    const p = idParts_(a.id || '0');
    const cells = s.qs.map(function (q, i) { const v = a.a[i]; return Array.isArray(v) ? v.join(', ') : String(v || ''); });
    return (s.anon ? [String(n + 1)] : [String(p.cls), String(p.num), a.name]).concat(cells);
  }));
  return {
    ok: true,
    survey: { id: s.id, title: s.title, desc: s.desc, anon: s.anon, open: s.open, due: s.due ? koDate_(s.due) : '' },
    count: answers.length, target: roster.length,
    missing: roster.filter(function (st) { return !did[st.id]; }).map(function (st) { return { cls: st.cls, num: st.num, name: st.name }; }),
    questions: questions, table: table
  };
}

/* ───────────── 메인 짤 공모 ───────────── */
/*
 * 학생이 밈 패러디 짤을 올리면 '대기'. 교사가 '후보'로 올린 것만 학생에게 보이고 투표를 받는다(한 사람 한 표, 표 수는 교사만 본다).
 * 교사가 하나를 고르면 '바로' 방식은 즉시, '정기' 방식은 정해 둔 요일·시각에 로그인 화면의 메인이 된다.
 * 교사가 고르지 않으면 메인은 바뀌지 않는다.
 */
const MM = { ID: 0, SID: 1, NAME: 2, AT: 3, CAP: 4, STATE: 5, ISSUE: 6, FILE: 7, THUMB: 8, VOTES: 9, SHOW: 10 };
const MEME_PENDING_MAX = 3;           // 한 학생이 동시에 올려 둘 수 있는 개수(대기+후보)
const MEME_IMG_MAX = 160000;          // 메인 그림 base64 글자 수 상한 (로그인 화면에 그대로 실린다)
const MEME_THUMB_MAX = 45000;         // 미리보기 base64 상한 (시트 칸 하나에 들어간다)
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function memeProps_() {
  const p = PropertiesService.getScriptProperties();
  const day = Number(p.getProperty('MEME_DAY')), hour = Number(p.getProperty('MEME_HOUR'));
  return { p: p, mode: p.getProperty('MEME_MODE') === '정기' ? '정기' : '바로',
    day: isNaN(day) || p.getProperty('MEME_DAY') === null ? 1 : day, hour: isNaN(hour) || p.getProperty('MEME_HOUR') === null ? 8 : hour,
    cur: p.getProperty('MEME_CUR') || '', next: p.getProperty('MEME_NEXT') || '', nextAt: Number(p.getProperty('MEME_NEXT_AT')) || 0,
    issue: Number(p.getProperty('MEME_ISSUE')) || 0 };
}
function memeRows_() {
  const sh = sheet_(SHEET.MEMES);
  return { sh: sh, rows: read_(sh, MEME_HEADERS.length) };
}
function memeIndex_(rows, id) { for (let i = 0; i < rows.length; i++) if (String(rows[i][MM.ID]).trim() === id) return i; return -1; }
function votesOf_(r) { return String(r[MM.VOTES] || '').split(',').map(function (x) { return x.trim(); }).filter(String); }
const TEACHER_SID = '교사'; // 선생님이 직접 올린 짤의 학번 칸
function classLabel_(sid) { if (sid === TEACHER_SID) return '선생님'; const p = idParts_(sid); return p.grade + '학년 ' + p.cls + '반'; }
/** 올린 사람이 '이름 밝히기'를 골랐을 때만 표시한다. 안 골랐으면 아무것도 보이지 않는다. */
function creditOf_(r) {
  if (r[MM.SHOW] !== true) return '';
  const sid = normId_(r[MM.SID]);
  return sid === TEACHER_SID ? '선생님' : classLabel_(sid) + ' ' + String(r[MM.NAME] || '').trim();
}
/** 다음 정기 교체 시각: 정해 둔 요일·시각 중 지금 이후로 가장 가까운 때 */
function nextSlot_(day, hour) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600000);
  let t = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), hour) - 9 * 3600000;
  t += ((day - kst.getUTCDay() + 7) % 7) * 86400000;
  if (t <= now.getTime()) t += 7 * 86400000;
  return t;
}
/** 고른 짤을 메인으로 올린다: 예전 메인은 지난호로, 투표는 새로 시작 */
function promoteMeme_(id) {
  const m = memeProps_(), t = memeRows_(), i = memeIndex_(t.rows, id);
  if (i < 0) return false;
  const issue = m.issue + 1;
  t.rows.forEach(function (r, k) {
    if (k === i) return;
    if (r[MM.STATE] === '메인') t.sh.getRange(k + 2, MM.STATE + 1).setValue('지난호');
    if (r[MM.STATE] === '후보' && r[MM.VOTES]) t.sh.getRange(k + 2, MM.VOTES + 1).setValue('');
  });
  t.sh.getRange(i + 2, MM.STATE + 1, 1, 2).setValues([['메인', issue]]);
  t.sh.getRange(i + 2, MM.VOTES + 1).setValue('');
  m.p.setProperties({ MEME_CUR: id, MEME_ISSUE: String(issue), MEME_NEXT: '', MEME_NEXT_AT: '' });
  CacheService.getScriptCache().remove('meme:main');
  log_('', '교사', '메인 짤 교체', issue + '호 · ' + String(t.rows[i][MM.CAP] || ''));
  return true;
}
/** 정기 방식: 예약해 둔 짤의 교체 시각이 지났으면 지금 바꾼다 (접속할 때마다 확인) */
function memeTick_() {
  const m = memeProps_();
  if (!m.next || !m.nextAt || Date.now() < m.nextAt) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return;
  try {
    const again = memeProps_();
    if (again.next && again.nextAt && Date.now() >= again.nextAt) promoteMeme_(again.next);
  } finally { lock.releaseLock(); }
}
/** 로그인 화면에 걸 메인 짤 (그림은 캐시에 둬서 매번 드라이브를 읽지 않는다) */
function memeMain_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('meme:main');
  if (hit) return hit === 'none' ? null : JSON.parse(hit);
  const m = memeProps_();
  let out = null;
  if (m.cur) {
    const t = memeRows_(), i = memeIndex_(t.rows, m.cur);
    if (i >= 0 && t.rows[i][MM.STATE] === '메인') {
      const r = t.rows[i];
      const b64 = Utilities.base64Encode(DriveApp.getFileById(String(r[MM.FILE])).getBlob().getBytes());
      out = { src: 'data:image/jpeg;base64,' + b64, caption: String(r[MM.CAP] || ''), issue: Number(r[MM.ISSUE]) || m.issue,
        credit: creditOf_(r) };
    }
  }
  const text = out ? JSON.stringify(out) : 'none';
  if (text.length < 98000) { try { cache.put('meme:main', text, 21600); } catch (e) {} }
  return out;
}
/** 학생 화면: 이번 호, 투표할 후보, 내가 올린 것 */
function studentMeme_(sid) {
  const m = memeProps_(), rows = memeRows_().rows;
  const view = function (r) { return { id: String(r[MM.ID]).trim(), caption: String(r[MM.CAP] || ''), thumb: String(r[MM.THUMB] || '') }; };
  let main = null;
  const candidates = [], mine = [];
  let myVote = '';
  rows.forEach(function (r) {
    const id = String(r[MM.ID]).trim();
    if (!id) return;
    const st = r[MM.STATE];
    if (st === '메인' && id === m.cur) { main = view(r); main.issue = Number(r[MM.ISSUE]) || m.issue; main.credit = creditOf_(r); }
    if (st === '후보') {
      const v = view(r);
      candidates.push(v);
      if (votesOf_(r).indexOf(sid) >= 0) myVote = id;
    }
    if (normId_(r[MM.SID]) === sid && st !== '지난호') { const v = view(r); v.state = st === '숨김' ? '대기' : st; mine.push(v); } // 숨김은 본인에게 '검토 중'으로만 보인다
  });
  const open = mine.filter(function (x) { return x.state === '대기' || x.state === '후보'; }).length;
  return { main: main, candidates: candidates, myVote: myVote, mine: mine.reverse().slice(0, 6), canSubmit: open < MEME_PENDING_MAX, max: MEME_PENDING_MAX };
}
function cleanB64_(s, max) {
  s = String(s || '');
  return s.length > 20 && s.length <= max && /^[A-Za-z0-9+\/=]+$/.test(s) ? s : '';
}
function memeFolder_() {
  const root = rootFolder_();
  const it = root.getFoldersByName('메인 짤 공모');
  return it.hasNext() ? it.next() : root.createFolder('메인 짤 공모');
}

function apiMemeSubmit(token, img, thumb, caption, show) {
  const st = sessionStudent_(token);
  if (!st) return expired_();
  const sid = normId_(st.v[C.ID]), name = String(st.v[C.NAME]).trim();
  img = cleanB64_(img, MEME_IMG_MAX); thumb = cleanB64_(thumb, MEME_THUMB_MAX);
  if (!img || !thumb) return fail_('그림을 다시 골라 주세요. jpg나 png 사진·캡처만 올릴 수 있습니다.');
  caption = String(caption || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!studentMeme_(sid).canSubmit) return fail_('검토 중인 짤이 ' + MEME_PENDING_MAX + '개 있어요. 선생님이 정리하면 다시 올릴 수 있습니다.');
    // 같은 초에 두 번 눌러도 겹치지 않는 ID
    const used = memeRows_().rows.map(function (r) { return String(r[MM.ID]).trim(); });
    const stamp = 'M' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + sid.slice(-3);
    let id = stamp;
    for (let n = 2; used.indexOf(id) >= 0; n++) id = stamp + '-' + n;
    const file = memeFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(img), 'image/jpeg', id + '_' + sid + '.jpg'));
    const sh = sheet_(SHEET.MEMES);
    sh.getRange(sh.getLastRow() + 1, 1, 1, MEME_HEADERS.length).setValues([[id, sid, name, new Date(), caption, '대기', '', file.getId(), thumb, '', show === true]]);
  } finally {
    lock.releaseLock();
  }
  log_(sid, name, '메인 짤 올림', caption);
  return { ok: true, meme: studentMeme_(sid) };
}

/** 한 사람 한 표. 다른 후보를 누르면 표가 옮겨 가고, 같은 후보를 다시 누르면 취소된다. */
function apiMemeVote(token, id) {
  const st = sessionStudent_(token);
  if (!st) return expired_();
  const sid = normId_(st.v[C.ID]);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const t = memeRows_(), i = memeIndex_(t.rows, String(id));
    if (i < 0 || t.rows[i][MM.STATE] !== '후보') return fail_('지금 투표할 수 없는 짤입니다.');
    const already = votesOf_(t.rows[i]).indexOf(sid) >= 0;
    t.rows.forEach(function (r, k) {
      if (r[MM.STATE] !== '후보') return;
      const v = votesOf_(r).filter(function (x) { return x !== sid; });
      if (k === i && !already) v.push(sid);
      if (v.join(',') !== votesOf_(r).join(',')) t.sh.getRange(k + 2, MM.VOTES + 1).setValue(v.join(','));
    });
  } finally {
    lock.releaseLock();
  }
  return { ok: true, meme: studentMeme_(sid) };
}

/** 학생이 자기 짤을 거둬들인다 (메인이 되기 전까지만) */
function apiMemeWithdraw(token, id) {
  const st = sessionStudent_(token);
  if (!st) return expired_();
  const sid = normId_(st.v[C.ID]);
  const t = memeRows_(), i = memeIndex_(t.rows, String(id));
  if (i < 0 || normId_(t.rows[i][MM.SID]) !== sid || ['대기', '후보', '숨김'].indexOf(t.rows[i][MM.STATE]) < 0) return fail_('거둘 수 없는 짤입니다.');
  if (memeProps_().next === String(id)) return fail_('선생님이 다음 메인으로 골라 둔 짤이라 거둘 수 없습니다.');
  t.sh.deleteRow(i + 2);
  try { DriveApp.getFileById(String(t.rows[i][MM.FILE])).setTrashed(true); } catch (e) {}
  return { ok: true, meme: studentMeme_(sid) };
}

/* 교사: 메인 짤 관리 */
function teacherMemes_() {
  const m = memeProps_(), rows = memeRows_().rows;
  const list = rows.map(function (r) {
    const id = String(r[MM.ID]).trim();
    if (!id) return null;
    const sid = normId_(r[MM.SID]), p = sid === TEACHER_SID ? null : idParts_(sid);
    return { id: id, who: p ? p.cls + '반 ' + p.num + '번 ' + String(r[MM.NAME] || '') : '선생님', caption: String(r[MM.CAP] || ''), state: String(r[MM.STATE] || '대기'),
      issue: Number(r[MM.ISSUE]) || 0, votes: votesOf_(r).length, thumb: String(r[MM.THUMB] || ''), show: r[MM.SHOW] === true,
      at: r[MM.AT] instanceof Date ? Utilities.formatDate(r[MM.AT], TZ, 'M/d HH:mm') : '' };
  }).filter(Boolean).reverse();
  return { ok: true, mode: m.mode, day: m.day, hour: m.hour, cur: m.cur, next: m.next,
    nextAt: m.next && m.nextAt ? koDate_(new Date(m.nextAt)) : '', slot: DAY_NAMES[m.day] + '요일 ' + m.hour + '시', issue: m.issue, items: list };
}
function apiTeacherMemes(token) {
  if (!isTeacher_(token)) return expired_();
  memeTick_();
  return teacherMemes_();
}
/** 선생님이 직접 올리기. how: '후보'(학생 투표에 넣기) 또는 '메인'(바로 걸기 / 정기 방식이면 다음 호 예약) */
function apiTeacherMemeUpload(token, img, thumb, caption, how, show) {
  if (!isTeacher_(token)) return expired_();
  img = cleanB64_(img, MEME_IMG_MAX); thumb = cleanB64_(thumb, MEME_THUMB_MAX);
  if (!img || !thumb) return fail_('그림을 다시 골라 주세요. jpg나 png 사진·캡처만 올릴 수 있습니다.');
  caption = String(caption || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let id;
  try {
    const used = memeRows_().rows.map(function (r) { return String(r[MM.ID]).trim(); });
    const stamp = 'M' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + 'T';
    id = stamp;
    for (let n = 2; used.indexOf(id) >= 0; n++) id = stamp + '-' + n;
    const file = memeFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(img), 'image/jpeg', id + '_teacher.jpg'));
    const sh = sheet_(SHEET.MEMES);
    sh.getRange(sh.getLastRow() + 1, 1, 1, MEME_HEADERS.length).setValues([[id, TEACHER_SID, '선생님', new Date(), caption, how === '후보' ? '후보' : '대기', '', file.getId(), thumb, '', show === true]]);
  } finally {
    lock.releaseLock();
  }
  log_('', '교사', '메인 짤 올림', caption);
  return how === '메인' ? apiTeacherMemePick(token, id) : teacherMemes_();
}

/** 상태 바꾸기: 후보로 올리기, 숨기기, 대기로 돌리기 */
function apiTeacherMemeState(token, id, state) {
  if (!isTeacher_(token)) return expired_();
  if (['대기', '후보', '숨김'].indexOf(state) < 0) return fail_('바꿀 수 없는 상태입니다.');
  const t = memeRows_(), i = memeIndex_(t.rows, String(id));
  if (i < 0) return fail_(CHANGED_MSG);
  if (t.rows[i][MM.STATE] === '메인') return fail_('지금 메인인 짤입니다. 메인을 내린 뒤에 바꿔 주세요.');
  t.sh.getRange(i + 2, MM.STATE + 1).setValue(state);
  const m = memeProps_();
  if (m.next === String(id)) m.p.setProperties({ MEME_NEXT: '', MEME_NEXT_AT: '' }); // 예약해 둔 짤을 숨기면 예약도 취소
  return teacherMemes_();
}
/** 메인으로 고르기: '바로'면 지금, '정기'면 다음 교체 시각에 */
function apiTeacherMemePick(token, id) {
  if (!isTeacher_(token)) return expired_();
  const t = memeRows_(), i = memeIndex_(t.rows, String(id));
  if (i < 0 || ['대기', '후보', '숨김', '지난호'].indexOf(t.rows[i][MM.STATE]) < 0) return fail_(CHANGED_MSG);
  const m = memeProps_();
  if (m.mode === '바로') promoteMeme_(String(id));
  else m.p.setProperties({ MEME_NEXT: String(id), MEME_NEXT_AT: String(nextSlot_(m.day, m.hour)) });
  return teacherMemes_();
}
function apiTeacherMemeCancelNext(token) {
  if (!isTeacher_(token)) return expired_();
  memeProps_().p.setProperties({ MEME_NEXT: '', MEME_NEXT_AT: '' });
  return teacherMemes_();
}
/** 메인 내리기: 로그인 화면에 아무것도 걸지 않는다 */
function apiTeacherMemeTakeDown(token) {
  if (!isTeacher_(token)) return expired_();
  const m = memeProps_(), t = memeRows_(), i = memeIndex_(t.rows, m.cur);
  if (i >= 0) t.sh.getRange(i + 2, MM.STATE + 1).setValue('지난호');
  m.p.setProperty('MEME_CUR', '');
  CacheService.getScriptCache().remove('meme:main');
  return teacherMemes_();
}
function apiTeacherMemeSettings(token, mode, day, hour) {
  if (!isTeacher_(token)) return expired_();
  day = Math.max(0, Math.min(6, parseInt(day, 10) || 0)); hour = Math.max(0, Math.min(23, parseInt(hour, 10) || 0));
  const m = memeProps_();
  m.p.setProperties({ MEME_MODE: mode === '정기' ? '정기' : '바로', MEME_DAY: String(day), MEME_HOUR: String(hour) });
  if (m.next) {
    if (mode === '정기') m.p.setProperty('MEME_NEXT_AT', String(nextSlot_(day, hour)));
    else promoteMeme_(m.next); // '바로'로 바꾸면 예약해 둔 짤을 지금 건다
  }
  return teacherMemes_();
}
function apiTeacherMemeDelete(token, id) {
  if (!isTeacher_(token)) return expired_();
  const m = memeProps_(), t = memeRows_(), i = memeIndex_(t.rows, String(id));
  if (i < 0) return fail_(CHANGED_MSG);
  if (String(id) === m.cur) return fail_('지금 메인인 짤은 지울 수 없습니다. 먼저 내려 주세요.');
  if (String(id) === m.next) m.p.setProperties({ MEME_NEXT: '', MEME_NEXT_AT: '' });
  t.sh.deleteRow(i + 2);
  try { DriveApp.getFileById(String(t.rows[i][MM.FILE])).setTrashed(true); } catch (e) {}
  return teacherMemes_();
}

/* ───────────── 출결 (담임 학급, 교사 전용) ───────────── */
/*
 * 날짜별로 '출석이 아닌 학생'만 한 줄씩 남긴다. 기록이 없으면 출석.
 * 유형: 결석·지각·조퇴·결과, 구분: 질병·미인정·인정·기타
 * 교시: 결과는 빠진 교시들(예: 3,4), 조퇴는 떠난 교시 하나(예: 5 → 5교시부터)
 */
const AT = { DATE: 0, COURSE: 1, SID: 2, NAME: 3, TYPE: 4, CAT: 5, PER: 6, REASON: 7, NEIS: 8, AT: 9 };
const ATT_TYPES = ['결석', '지각', '조퇴', '결과'];
const ATT_CATS = ['질병', '미인정', '인정', '기타'];
const PERIODS_BY_DAY = [6, 6, 7, 7, 6, 6, 6]; // 일~토 하루 교시 수 (이 학교: 화·수 7교시)

function attDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function dayOf_(date) { const p = date.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }
function periodsOf_(date) { return PERIODS_BY_DAY[dayOf_(date)]; }
/** 출결은 '학급' 수업에서만. 반 학생 명단(번호순)과 함께 돌려준다. */
function attCourse_(courseId) {
  const c = activeCourses_().filter(function (x) { return x.id === courseId; })[0];
  if (!c || c.kind !== 'class') return null;
  const notes = {};
  rows_(SHEET.STUDENTS, STUDENT_HEADERS.length).forEach(function (v) { notes[normId_(v[C.ID])] = boardNote_(statusOf_(v)); });
  const roster = rosterOf_(courseId).sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  roster.forEach(function (s) { s.note = notes[s.id] || ''; });
  return { course: c, roster: roster };
}
function attRows_(courseId) {
  const sh = sheet_(SHEET.ATTEND);
  const rows = read_(sh, ATTEND_HEADERS.length);
  return { sh: sh, rows: rows, mine: rows.map(function (r, i) {
    if (String(r[AT.COURSE]).trim() !== courseId) return null;
    const d = attDate_(r[AT.DATE]);
    return d ? { i: i, date: d, sid: normId_(r[AT.SID]), r: r } : null;
  }).filter(Boolean) };
}
function attView_(r) {
  return { type: String(r[AT.TYPE] || ''), cat: String(r[AT.CAT] || ''),
    periods: String(r[AT.PER] || '').split(',').map(Number).filter(function (n) { return n > 0; }),
    reason: String(r[AT.REASON] || ''), neis: r[AT.NEIS] === true };
}

function apiTeacherAttendDay(token, courseId, date) {
  if (!isTeacher_(token)) return expired_();
  courseId = String(courseId); date = attDate_(date);
  if (!date) return fail_('날짜를 다시 골라 주세요.');
  const ac = attCourse_(courseId);
  if (!ac) return fail_('출결은 학급(담임 반)에서만 쓸 수 있습니다.');
  const recs = {}, month = date.slice(0, 7), pending = {};
  attRows_(courseId).mine.forEach(function (m) {
    if (m.date === date) recs[m.sid] = attView_(m.r);
    if (m.date.slice(0, 7) === month && m.r[AT.NEIS] !== true) pending[m.date] = (pending[m.date] || 0) + 1;
  });
  return { ok: true, date: date, day: dayOf_(date), periods: periodsOf_(date),
    students: ac.roster.map(function (s) { return { id: s.id, num: s.num, name: s.name, note: s.note, rec: recs[s.id] || null }; }),
    pending: Object.keys(pending).sort().map(function (d) { return { date: d, count: pending[d] }; }) }; // 이번 달 나이스 미입력
}

/** 한 학생의 하루 기록 저장. rec.type이 '출석'이면 기록을 지운다. */
function apiTeacherAttendSave(token, courseId, date, sid, rec) {
  if (!isTeacher_(token)) return expired_();
  courseId = String(courseId); date = attDate_(date); sid = normId_(sid); rec = rec || {};
  if (!date) return fail_('날짜를 다시 골라 주세요.');
  const ac = attCourse_(courseId);
  if (!ac) return fail_('출결은 학급(담임 반)에서만 쓸 수 있습니다.');
  const st = ac.roster.filter(function (s) { return s.id === sid; })[0];
  if (!st) return fail_('이 반 학생이 아닙니다.');
  const type = String(rec.type || '');
  if (type !== '출석' && ATT_TYPES.indexOf(type) < 0) return fail_('출결 유형을 다시 골라 주세요.');
  const cat = ATT_CATS.indexOf(String(rec.cat || '')) >= 0 ? String(rec.cat) : '';
  const max = periodsOf_(date);
  let periods = (Array.isArray(rec.periods) ? rec.periods : []).map(Number).filter(function (n, k, a) { return n >= 1 && n <= max && a.indexOf(n) === k; }).sort(function (a, b) { return a - b; });
  if (type === '조퇴') periods = periods.slice(-1);           // 조퇴는 떠난 교시 하나
  if (type !== '조퇴' && type !== '결과') periods = [];
  const reason = String(rec.reason || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const t = attRows_(courseId);
    const old = t.mine.filter(function (m) { return m.date === date && m.sid === sid; });
    if (type === '출석') {
      old.map(function (m) { return m.i; }).sort(function (a, b) { return b - a; }).forEach(function (i) { t.sh.deleteRow(i + 2); });
    } else {
      // 내용이 바뀌면 나이스 입력 체크는 풀린다 (다시 입력해야 하니까). 사유만 고친 경우는 그대로 둔다.
      const prev = old[0] ? attView_(old[0].r) : null;
      const same = prev && prev.type === type && prev.cat === cat && prev.periods.join(',') === periods.join(',');
      const row = [date, courseId, sid, st.name, type, cat, periods.join(','), reason, !!(same && prev.neis), new Date()];
      if (old[0]) t.sh.getRange(old[0].i + 2, 1, 1, row.length).setValues([row]);
      else t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
      old.slice(1).map(function (m) { return m.i; }).sort(function (a, b) { return b - a; }).forEach(function (i) { t.sh.deleteRow(i + 2); });
    }
  } finally {
    lock.releaseLock();
  }
  const day = apiTeacherAttendDay(token, courseId, date);
  day.saved = sid;
  return day;
}

function apiTeacherAttendNeis(token, courseId, date, sid, done) {
  if (!isTeacher_(token)) return expired_();
  courseId = String(courseId); date = attDate_(date); sid = normId_(sid);
  const t = attRows_(courseId);
  const m = t.mine.filter(function (x) { return x.date === date && x.sid === sid; })[0];
  if (!m) return fail_('출석으로 바뀐 학생입니다. 새로고침해 주세요.');
  t.sh.getRange(m.i + 2, AT.NEIS + 1).setValue(done === true);
  return apiTeacherAttendDay(token, courseId, date);
}

/** 월 통계: 학생별 유형×구분 건수 (결과·조퇴·지각도 '건'으로 센다) */
function apiTeacherAttendMonth(token, courseId, month) {
  if (!isTeacher_(token)) return expired_();
  courseId = String(courseId); month = String(month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return fail_('달을 다시 골라 주세요.');
  const ac = attCourse_(courseId);
  if (!ac) return fail_('출결은 학급(담임 반)에서만 쓸 수 있습니다.');
  const by = {}, pending = {};
  ac.roster.forEach(function (s) { by[s.id] = {}; });
  attRows_(courseId).mine.forEach(function (m) {
    if (m.date.slice(0, 7) !== month || !by[m.sid]) return;
    const v = attView_(m.r), key = v.type + '|' + (v.cat || '미정');
    by[m.sid][key] = (by[m.sid][key] || 0) + 1;
    if (!v.neis) pending[m.date] = (pending[m.date] || 0) + 1;
  });
  return { ok: true, month: month, types: ATT_TYPES, cats: ATT_CATS.concat(['미정']),
    students: ac.roster.map(function (s) { return { id: s.id, num: s.num, name: s.name, note: s.note, counts: by[s.id] }; }),
    pending: Object.keys(pending).sort().map(function (d) { return { date: d, count: pending[d] }; }) };
}

/* ───────────── 교사: 공지·레퍼런스 쓰기 ───────────── */

// 화면에서 고르던 줄이 그 사이 시트에서 바뀌지 않았는지 확인하는 지문
function noticeKey_(r) { return (r[0] instanceof Date ? r[0].getTime() : '') + '|' + String(r[2]).trim(); }
function refKey_(r) { return String(r[1]).trim() + '|' + String(r[2]).trim() + '|' + String(r[4]).trim(); }
const CHANGED_MSG = '그 사이 시트 내용이 바뀌었습니다. 다시 열어서 시도해 주세요.';

/** 제목 칸이 비어 있는 첫 줄. 체크박스만 미리 깔린 빈 줄을 건너뛰지 않고 위에서부터 채운다. */
function freeRow_(sh, keyCol) {
  const last = sh.getLastRow();
  if (last < 2) return 2;
  const vals = sh.getRange(2, keyCol, last - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) if (!String(vals[i][0]).trim()) return i + 2;
  return last + 1;
}

function teacherPosts_(courseId) {
  const course = activeCourses_().filter(function (c) { return c.id === courseId; })[0];
  if (!course) return fail_('수업을 찾을 수 없습니다.');
  const notices = [];
  rows_(SHEET.NOTICES, NOTICE_HEADERS.length).forEach(function (r, i) {
    const title = String(r[2]).trim();
    const c = String(r[1] || '').trim();
    const global = !c || c === '전체';
    if (!title || (!global && c !== courseId)) return;
    const d = r[0] instanceof Date ? r[0] : null;
    notices.push({ row: i + 2, key: noticeKey_(r), global: global, time: d ? d.getTime() : 0, date: d ? Utilities.formatDate(d, TZ, 'yyyy.MM.dd') : '',
      title: title, body: String(r[3] || ''), target: String(r[4] || '').trim(), pinned: r[5] === true, published: r[6] === true });
  });
  notices.sort(function (a, b) { return (Number(b.pinned) - Number(a.pinned)) || (b.time - a.time); });
  const refs = [];
  rows_(SHEET.REFS, REF_HEADERS.length).forEach(function (r, i) {
    if (!String(r[2]).trim() || String(r[0]).trim() !== courseId) return;
    refs.push({ row: i + 2, key: refKey_(r), group: String(r[1] || '').trim() || '기타', title: String(r[2]).trim(), desc: String(r[3] || '').trim(),
      url: String(r[4] || '').trim(), image: String(r[6] || '').trim(), published: r[5] === true });
  });
  const classes = autoPrefixes_(course.auto).map(function (p) { return idParts_(p + '0').cls + '반'; });
  return { ok: true, courseId: courseId, notices: notices, refs: refs, classes: classes };
}

function apiTeacherPosts(token, courseId) {
  if (!isTeacher_(token)) return expired_();
  return teacherPosts_(String(courseId));
}

/** 공지 쓰기·고치기. d: { row, key, global, title, body, target, pinned, published } */
function apiTeacherSaveNotice(token, courseId, d) {
  if (!isTeacher_(token)) return expired_();
  courseId = String(courseId); d = d || {};
  const title = String(d.title || '').trim().slice(0, 100);
  if (!title) return fail_('제목을 입력해 주세요.');
  const body = String(d.body || '').trim().slice(0, 2000);
  const target = /^\d+반$/.test(String(d.target || '')) ? String(d.target) : '';
  const sh = sheet_(SHEET.NOTICES);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let row = Number(d.row) || 0, date = new Date();
    if (row) {
      const cur = sh.getRange(row, 1, 1, NOTICE_HEADERS.length).getValues()[0];
      if (noticeKey_(cur) !== d.key) return fail_(CHANGED_MSG);
      if (cur[0] instanceof Date) date = cur[0]; // 고쳐도 처음 쓴 날짜는 유지
    } else {
      row = freeRow_(sh, 3);
    }
    sh.getRange(row, 1, 1, NOTICE_HEADERS.length).setValues([[date, d.global ? '' : courseId, title, body, d.global ? '' : target, !!d.pinned, d.published !== false]]);
  } finally {
    lock.releaseLock();
  }
  log_('', '교사', d.row ? '공지 수정' : '공지 작성', (d.global ? '전체' : courseId) + ' · ' + title);
  return teacherPosts_(courseId);
}

function apiTeacherDeleteNotice(token, courseId, row, key) {
  if (!isTeacher_(token)) return expired_();
  const sh = sheet_(SHEET.NOTICES);
  row = Number(row);
  const cur = sh.getRange(row, 1, 1, NOTICE_HEADERS.length).getValues()[0];
  if (row < 2 || noticeKey_(cur) !== key) return fail_(CHANGED_MSG);
  sh.getRange(row, 1, 1, NOTICE_HEADERS.length).clearContent();
  log_('', '교사', '공지 삭제', String(cur[2]));
  return teacherPosts_(String(courseId));
}

/** 레퍼런스 쓰기·고치기. d: { row, key, group, title, desc, url, image, published } */
function apiTeacherSaveRef(token, courseId, d) {
  if (!isTeacher_(token)) return expired_();
  courseId = String(courseId); d = d || {};
  const title = String(d.title || '').trim().slice(0, 100);
  if (!title) return fail_('제목을 입력해 주세요.');
  const url = String(d.url || '').trim(), image = String(d.image || '').trim();
  if (url && !/^https?:\/\//i.test(url)) return fail_('링크는 http:// 또는 https:// 로 시작해야 합니다.');
  const attached = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/=]+$/.test(image);
  if (image && !attached && !/^https?:\/\//i.test(image)) return fail_('썸네일은 이미지를 첨부하거나 http(s) 주소로 넣어 주세요.');
  if (image.length > 45000) return fail_('썸네일 이미지가 너무 큽니다. 다른 이미지로 시도해 주세요.');
  const sh = sheet_(SHEET.REFS);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let row = Number(d.row) || 0;
    if (row) {
      if (refKey_(sh.getRange(row, 1, 1, REF_HEADERS.length).getValues()[0]) !== d.key) return fail_(CHANGED_MSG);
    } else {
      row = freeRow_(sh, 3);
    }
    sh.getRange(row, 1, 1, REF_HEADERS.length).setValues([[courseId, String(d.group || '').trim().slice(0, 40) || '기타', title,
      String(d.desc || '').trim().slice(0, 200), url, d.published !== false, image]]);
  } finally {
    lock.releaseLock();
  }
  log_('', '교사', d.row ? '레퍼런스 수정' : '레퍼런스 추가', courseId + ' · ' + title);
  return teacherPosts_(courseId);
}

function apiTeacherDeleteRef(token, courseId, row, key) {
  if (!isTeacher_(token)) return expired_();
  const sh = sheet_(SHEET.REFS);
  row = Number(row);
  const cur = sh.getRange(row, 1, 1, REF_HEADERS.length).getValues()[0];
  if (row < 2 || refKey_(cur) !== key) return fail_(CHANGED_MSG);
  sh.getRange(row, 1, 1, REF_HEADERS.length).clearContent();
  log_('', '교사', '레퍼런스 삭제', String(cur[2]));
  return teacherPosts_(String(courseId));
}

/** 평가표: 한 수업의 배점 있는 과제 전체를 학생별로 모은 표 */
function apiTeacherGrades(token, courseId) {
  if (!isTeacher_(token)) return expired_();
  courseId = String(courseId);
  const course = activeCourses_().filter(function (c) { return c.id === courseId; })[0];
  if (!course) return fail_('수업을 찾을 수 없습니다.');
  const tasks = allTasks_().filter(function (t) { return t.course === courseId && t.scale.length; });
  const wanted = {};
  tasks.forEach(function (t) { wanted[t.id] = true; });
  const grades = {}, subs = {};
  rows_(SHEET.GRADES, GRADE_HEADERS.length).forEach(function (r) {
    const t = String(r[G.TASK]).trim();
    if (wanted[t]) grades[t + '|' + normId_(r[G.ID])] = r;
  });
  rows_(SHEET.SUBS, SUB_HEADERS.length).forEach(function (r) {
    const t = String(r[S.TASK]).trim();
    if (wanted[t]) subs[t + '|' + normId_(r[S.ID])] = r;
  });
  const students = rows_(SHEET.STUDENTS, STUDENT_HEADERS.length).filter(function (v) {
    const id = normId_(v[C.ID]);
    return validId_(id) && enrolled_(course.id, course.auto, id, v[C.COURSES]);
  }).map(function (v) {
    const id = normId_(v[C.ID]);
    const cells = {};
    tasks.forEach(function (t) {
      const g = grades[t.id + '|' + id], s = subs[t.id + '|' + id];
      const mark = g ? String(g[G.GRADE] || '').trim() : '';
      cells[t.id] = {
        state: s ? stateKey_(s[S.STATE]) : 'none',
        lateDays: s ? Number(s[S.LATE] || 0) : 0,
        mark: mark,
        points: mark ? Number(g[G.POINTS]) : null,
        confirmed: !!(g && g[G.CONF] instanceof Date),
        stale: staleGrade_(g, s)
      };
    });
    return { id: id, name: String(v[C.NAME]).trim(), cls: idParts_(id).cls, cells: cells, note: boardNote_(statusOf_(v)) };
  }).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  return {
    ok: true, courseId: courseId, students: students,
    tasks: tasks.map(function (t) {
      return { id: t.id, title: t.title, max: t.scale.reduce(function (m, x) { return Math.max(m, x.p); }, 0) };
    })
  };
}

/** 채점 시트의 한 줄을 찾아 고치거나, 없으면 새로 만든다. */
function upsertGrade_(taskId, studentId, change) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const found = findGrade_(taskId, studentId);
    const st = findStudent_(studentId);
    const row = found ? found.v.slice() : [taskId, studentId, st ? String(st.v[C.NAME]).trim() : '', '', '', '', '', '', '', ''];
    const note = change(row) || '';
    if (found) found.sh.getRange(found.row, 1, 1, row.length).setValues([row]);
    else sheet_(SHEET.GRADES).appendRow(row);
    return { row: row, note: note };
  } finally {
    lock.releaseLock();
  }
}

/** 등급을 저장한다. mark가 빈 값이면 채점을 지운다. 확인 뒤에 점수가 바뀌면 확인 기록을 해제한다. */
function apiTeacherGrade(token, taskId, studentId, mark) {
  if (!isTeacher_(token)) return expired_();
  taskId = String(taskId); studentId = normId_(studentId); mark = String(mark || '').trim();
  const task = getTask_(taskId);
  if (!task) return fail_('과제를 찾을 수 없습니다.');
  const pick = task.scale.filter(function (x) { return x.g === mark; })[0];
  if (mark && !pick) return fail_('배점에 없는 등급입니다.');
  const res = upsertGrade_(taskId, studentId, function (row) {
    const before = String(row[G.GRADE] || '') + ' ' + row[G.POINTS];
    row[G.GRADE] = mark;
    row[G.POINTS] = pick ? pick.p : '';
    row[G.AT] = mark ? new Date() : '';
    if (row[G.CONF] instanceof Date && (!pick || Number(row[G.CONFP]) !== pick.p)) {
      row[G.CONF] = ''; row[G.CONFP] = '';
      return '이전 ' + before.trim() + ' · 학생 확인 해제';
    }
    return '';
  });
  log_(studentId, res.row[G.NAME], mark ? '채점' : '채점 지움', taskId + (mark ? ' · ' + mark + ' ' + pick.p + '점' : '') + (res.note ? ' · ' + res.note : ''));
  return { ok: true, grade: gradeView_(res.row) };
}

/** 메모 저장. memo는 학생에게 보이고, priv는 선생님만 본다. */
function apiTeacherMemo(token, taskId, studentId, memo, priv) {
  if (!isTeacher_(token)) return expired_();
  taskId = String(taskId); studentId = normId_(studentId);
  memo = String(memo || '').trim().slice(0, 500);
  priv = String(priv || '').trim().slice(0, 1000);
  const res = upsertGrade_(taskId, studentId, function (row) { row[G.MEMO] = memo; row[G.PRIV] = priv; });
  log_(studentId, res.row[G.NAME], '메모', taskId + ' · 공개 메모 ' + (memo ? '있음' : '없음') + ' · 비공개 메모 ' + (priv ? '있음' : '없음'));
  return { ok: true, grade: gradeView_(res.row) };
}

/** 점수 공개를 켜고 끈다. */
function apiTeacherScoresOpen(token, taskId, on) {
  if (!isTeacher_(token)) return expired_();
  taskId = String(taskId);
  const sh = sheet_(SHEET.TASKS);
  const last = sh.getLastRow();
  const ids = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === taskId) {
      sh.getRange(i + 2, 12).setValue(!!on);
      log_('', '교사', '점수 공개', taskId + ' · ' + (on ? '켬' : '끔'));
      return { ok: true, board: teacherBoard_() };
    }
  }
  return fail_('과제를 찾을 수 없습니다.');
}

/** 학생 특이사항(현장실습, 취업, 위탁, 특수 또는 없음)을 바꾼다. */
function apiTeacherSetStatus(token, studentId, status) {
  if (!isTeacher_(token)) return expired_();
  studentId = normId_(studentId);
  status = String(status || '').trim();
  if (status && STATUS_LIST.indexOf(status) < 0) return fail_('고를 수 없는 값입니다.');
  const s = findStudent_(studentId);
  if (!s) return fail_('학생을 찾을 수 없습니다.');
  s.sh.getRange(s.row, C.NOTE + 1).setValue(status);
  log_(studentId, s.v[C.NAME], '특이사항 변경', status || '없음');
  return { ok: true, status: status, note: boardNote_(status), away: AWAY_STATUS.indexOf(status) >= 0 };
}

/** 학생 PIN을 지우고 잠금도 푼다. 학생은 확인코드로 다시 PIN을 만든다. 제출·점수 기록은 그대로다. */
function apiTeacherResetPin(token, studentId) {
  if (!isTeacher_(token)) return expired_();
  studentId = normId_(studentId);
  const s = findStudent_(studentId);
  if (!s) return fail_('학생을 찾을 수 없습니다.');
  s.sh.getRange(s.row, C.HASH + 1, 1, 5).setValues([['', '', 0, '', '']]); // 해시, 솔트, 실패횟수, 잠금, 설정일시
  log_(studentId, s.v[C.NAME], 'PIN 초기화', '교사 화면');
  return { ok: true };
}

/** 최종 마감 뒤에도 이 학생의 제출을 받을지 켜고 끈다. */
function apiTeacherAllow(token, taskId, studentId, on) {
  if (!isTeacher_(token)) return expired_();
  taskId = String(taskId); studentId = normId_(studentId);
  const sh = sheet_(SHEET.ALLOW);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const last = sh.getLastRow();
    const vals = last < 2 ? [] : sh.getRange(2, 1, last - 1, 2).getValues();
    for (let i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]).trim() === taskId && normId_(vals[i][1]) === studentId) sh.deleteRow(i + 2);
    }
    if (on) sh.appendRow([taskId, studentId, new Date()]);
  } finally {
    lock.releaseLock();
  }
  log_(studentId, '', on ? '마감 후 제출 허용' : '제출 허용 해제', taskId + ' · 교사');
  return { ok: true, allowed: !!on };
}

/* ───────────── 모아보기 ───────────── */

/** 교사는 항상, 학생은 모아보기가 공개된 자기 수업 과제만 볼 수 있다. */
function galleryRole_(token, task) {
  if (isTeacher_(token)) return 'teacher';
  const s = sessionStudent_(token);
  if (!s) return null;
  if (!task || !task.published || !task.gallery) return 'denied';
  const id = normId_(s.v[C.ID]);
  return coursesOf_(id, s.v[C.COURSES]).some(function (c) { return c.id === task.course; }) ? 'student' : 'denied';
}

/** 대표 이미지가 있는 제출 목록. 이미지는 apiGalleryThumbs로 나눠서 받는다. */
function apiGalleryList(token, taskId) {
  const task = getTask_(String(taskId));
  const role = galleryRole_(token, task);
  if (!role) return expired_();
  if (role === 'denied' || !task) return fail_('모아보기가 공개되지 않았습니다.');
  const teacher = role === 'teacher';
  const items = rows_(SHEET.SUBS, SUB_HEADERS.length).filter(function (r) {
    return String(r[S.TASK]).trim() === task.id && String(r[S.THUMB] || '').trim();
  }).map(function (r) {
    const id = normId_(r[S.ID]);
    const name = String(r[S.NAME] || '').trim();
    return {
      key: String(r[S.THUMB]).trim(),
      sid: teacher ? id : '', // 이름을 가린 모아보기에서 학번으로 누구인지 드러나지 않게
      name: teacher ? idParts_(id).cls + '반 ' + idParts_(id).num + '번 ' + name : (task.galleryNames ? name : '')
    };
  }).sort(function (a, b) {
    return teacher ? (a.sid < b.sid ? -1 : 1) : (a.key < b.key ? -1 : 1); // 학생용은 번호 순서가 아닌 섞인 순서
  });
  return { ok: true, items: items, isPublic: task.gallery, showNames: task.galleryNames };
}

/** 대표 이미지 여러 장을 한 번에(최대 8장) 돌려준다. */
function apiGalleryThumbs(token, taskId, keys) {
  const task = getTask_(String(taskId));
  const role = galleryRole_(token, task);
  if (!role) return expired_();
  if (role === 'denied' || !task) return fail_('모아보기가 공개되지 않았습니다.');
  const valid = {};
  rows_(SHEET.SUBS, SUB_HEADERS.length).forEach(function (r) {
    if (String(r[S.TASK]).trim() === task.id && r[S.THUMB]) valid[String(r[S.THUMB]).trim()] = true;
  });
  const cache = CacheService.getScriptCache();
  const out = {};
  (keys || []).slice(0, 8).forEach(function (key) {
    key = String(key);
    if (!valid[key]) return;
    let b64 = cache.get('th:' + key);
    if (!b64) {
      try { b64 = Utilities.base64Encode(DriveApp.getFileById(key).getBlob().getBytes()); } catch (e) { return; }
      if (b64.length < 95000) { try { cache.put('th:' + key, b64, 21600); } catch (e) {} }
    }
    out[key] = 'data:image/jpeg;base64,' + b64;
  });
  return { ok: true, thumbs: out };
}

/** 모아보기 학생 공개 여부와 이름 표시 여부를 과제 시트에 적는다. */
function apiTeacherGallerySet(token, taskId, isPublic, showNames) {
  if (!isTeacher_(token)) return expired_();
  taskId = String(taskId);
  const sh = sheet_(SHEET.TASKS);
  const last = sh.getLastRow();
  const ids = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === taskId) {
      sh.getRange(i + 2, 9, 1, 2).setValues([[!!isPublic, !!showNames]]);
      log_('', '교사', '모아보기 설정', taskId + ' · 공개 ' + (isPublic ? '켬' : '끔') + ' · 이름 ' + (showNames ? '켬' : '끔'));
      return { ok: true, board: teacherBoard_() };
    }
  }
  return fail_('과제를 찾을 수 없습니다.');
}

/* ───────────── 내부 도구 ───────────── */

/** 기록용 시트(제출, 채점, 허용, 로그)는 setup을 다시 돌리지 않았어도 없으면 그 자리에서 만든다. */
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (sh) return sh;
  const auto = {};
  auto[SHEET.SUBS] = SUB_HEADERS; auto[SHEET.GRADES] = GRADE_HEADERS; auto[SHEET.ALLOW] = ALLOW_HEADERS; auto[SHEET.LOG] = LOG_HEADERS;
  auto[SHEET.SURVEYS] = SURVEY_HEADERS; auto[SHEET.ANSWERS] = ANSWER_HEADERS; auto[SHEET.MEMES] = MEME_HEADERS; auto[SHEET.ATTEND] = ATTEND_HEADERS;
  if (!auto[name]) throw new Error('[' + name + '] 시트가 없습니다. 편집기에서 setup을 먼저 실행해 주세요.');
  try { sh = ss.insertSheet(name); } catch (e) { sh = ss.getSheetByName(name); } // 동시에 두 요청이 만들려 한 경우
  if (!sh) throw new Error('[' + name + '] 시트를 만들지 못했습니다. 편집기에서 setup을 실행해 주세요.');
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, auto[name].length).setValues([auto[name]]).setFontWeight('bold').setBackground('#f5f5f7');
    sh.setFrozenRows(1);
    sh.getRange('A:B').setNumberFormat('@');
  }
  return sh;
}

/** 2행부터 끝까지 읽는다. 시트의 열이 모자라면 빈 칸으로 채워서 돌려준다. */
function read_(sh, width) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const have = Math.min(width, sh.getMaxColumns());
  const vals = sh.getRange(2, 1, last - 1, have).getValues();
  if (have < width) vals.forEach(function (r) { while (r.length < width) r.push(''); });
  return vals;
}

function rows_(name, width) { return read_(sheet_(name), width); }

function findStudent_(id) {
  if (!id) return null;
  const sh = sheet_(SHEET.STUDENTS);
  const vals = read_(sh, STUDENT_HEADERS.length);
  for (let i = 0; i < vals.length; i++) {
    if (normId_(vals[i][C.ID]) === id) return { sh: sh, row: i + 2, v: vals[i] };
  }
  return null;
}

function normId_(v) { return String(v == null ? '' : v).trim(); }
function normName_(v) { return String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase(); } // 띄어쓰기, 영문 대소문자는 구분하지 않는다
function fail_(message) { return { ok: false, error: message }; }
function expired_() { return { ok: false, expired: true, error: '로그인 시간이 지났습니다. 다시 로그인해 주세요.' }; }

/** 시트의 확인코드를 숫자만 남긴다. 시트가 0786 을 786 으로 바꿔 놓았어도 4자리로 되돌린다. */
function codeDigits_(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (!d) return '';
  while (d.length < 4) d = '0' + d;
  return d;
}

/** 학생이 입력한 값이 확인코드와 맞는가. 뒤 4자리 코드에 전체 번호를 입력해도 끝자리가 맞으면 통과시킨다. */
function codeMatches_(typed, stored) {
  if (!typed || typed.length < 4) return false;
  if (typed === stored) return true;
  if (stored.length === 4) return typed.slice(-4) === stored;
  return typed.replace(/^0+/, '') === stored.replace(/^0+/, ''); // 전체 번호를 쓰는 경우: 앞의 0이 빠져도 같은 번호
}

function hashPin_(pin, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function pinProblem_(pin, id, code) {
  if (!new RegExp('^\\d{' + PIN_LENGTH + '}$').test(pin)) return 'PIN은 숫자 ' + PIN_LENGTH + '자리로 정해 주세요.';
  if (/^(\d)\1+$/.test(pin)) return '같은 숫자만 반복한 PIN은 쓸 수 없습니다.';
  if (pin === '1234' || pin === id.slice(-PIN_LENGTH)) return '추측하기 쉬운 PIN입니다. 다른 숫자로 정해 주세요.';
  // 확인코드(휴대폰 번호)에 들어 있는 숫자 묶음은 PIN으로 못 쓴다: 번호를 아는 친구가 바로 맞힐 수 있다
  if (code && code.indexOf(pin) >= 0) return '본인 확인에 쓴 숫자는 PIN으로 쓸 수 없습니다. 다른 숫자로 정해 주세요.';
  return '';
}

function lockMessage_(v) {
  const until = v[C.LOCK];
  if (until instanceof Date && until.getTime() > Date.now()) {
    const min = Math.ceil((until.getTime() - Date.now()) / 60000);
    return '여러 번 틀려 잠겨 있습니다. 약 ' + min + '분 뒤에 다시 시도해 주세요.';
  }
  return '';
}

function registerFail_(s, message) {
  const fails = Number(s.v[C.FAILS] || 0) + 1;
  if (fails >= MAX_FAILS) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60000);
    s.sh.getRange(s.row, C.FAILS + 1, 1, 2).setValues([[0, until]]);
    log_(normId_(s.v[C.ID]), s.v[C.NAME], '잠금', MAX_FAILS + '회 오류');
    return message + ' ' + MAX_FAILS + '회 틀려 ' + LOCK_MINUTES + '분 동안 잠깁니다.';
  }
  s.sh.getRange(s.row, C.FAILS + 1).setValue(fails);
  return message + ' 남은 횟수 ' + (MAX_FAILS - fails) + '회.';
}

function createSession_(id, salt) {
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('sess:' + token, id + '|' + salt, SESSION_SECONDS);
  return token;
}

/** 토큰이 유효하고, 로그인 이후 PIN이 초기화되지 않았을 때만 학생을 돌려준다. */
function sessionStudent_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('sess:' + token);
  if (!raw) return null;
  const cut = raw.indexOf('|');
  const s = findStudent_(raw.slice(0, cut));
  if (!s || !s.v[C.SALT] || String(s.v[C.SALT]) !== raw.slice(cut + 1)) return null;
  return s;
}

function koDate_(d) {
  const day = ['월', '화', '수', '목', '금', '토', '일'][Number(Utilities.formatDate(d, TZ, 'u')) - 1];
  return Utilities.formatDate(d, TZ, 'M월 d일') + '(' + day + ') ' + Utilities.formatDate(d, TZ, 'HH:mm');
}

function log_(id, name, action, detail) {
  try {
    sheet_(SHEET.LOG).appendRow([new Date(), id, String(name || '').trim(), action, detail || '']);
  } catch (e) { /* 로그 실패가 본 동작까지 막지 않도록 */ }
}


/* ───────────── 자동 업데이트 (GitHub → 이 프로젝트 → 웹앱 새 버전) ─────────────
 * 저장소의 gas/ 폴더에 새 코드가 올라오면 5분 안에 이 프로젝트 코드를 바꾸고,
 * 지금 쓰는 웹앱 배포에 새 버전을 걸어 준다(주소는 그대로).
 * 필요한 것: ① script.google.com/home/usersettings 에서 'Google Apps Script API' 켜기
 *           ② appsscript.json 에 아래 SYNC_SCOPES 포함 ③ 시트 메뉴 › 수업 관리 › 자동 업데이트 › 켜기
 * appsscript.json(권한·웹앱 설정)은 저장소 것으로 덮지 않고 지금 것을 그대로 둔다. */
const SYNC_REPO_DEFAULT = 'bowwowcrow-coder/class-page';
const SYNC_BRANCH = 'main';
const SYNC_DIR = 'gas';
const SYNC_EVERY_MIN = 5;

function syncRepo_() { return PropertiesService.getScriptProperties().getProperty('SYNC_REPO') || SYNC_REPO_DEFAULT; }

function syncRaw_(path) {
  const url = 'https://raw.githubusercontent.com/' + syncRepo_() + '/' + SYNC_BRANCH + '/' + SYNC_DIR + '/' + path + '?t=' + Date.now();
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'Cache-Control': 'no-cache' } });
  if (r.getResponseCode() !== 200) throw new Error('저장소에서 ' + path + ' 을(를) 못 받았어요 (' + r.getResponseCode() + ')');
  return r.getContentText('UTF-8');
}

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function scriptApi_(method, path, body) {
  const opt = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + path, opt);
  const code = r.getResponseCode(), text = r.getContentText();
  if (code >= 300) {
    if (/has not enabled|not been used|SERVICE_DISABLED|User has not/i.test(text))
      throw new Error('Apps Script API가 꺼져 있어요. script.google.com/home/usersettings 에서 "Google Apps Script API"를 켠 뒤 다시 해 주세요.');
    if (code === 403) throw new Error('권한이 부족해요. appsscript.json 에 자동 업데이트용 권한(oauthScopes)이 들어 있는지 확인해 주세요.');
    throw new Error('Apps Script API 오류 (' + code + '): ' + text.slice(0, 200));
  }
  return text ? JSON.parse(text) : {};
}

/** 지금 학생들이 쓰는 웹앱 배포를 찾는다. 웹앱 주소 안의 배포 ID가 1순위. */
function syncDeployId_() {
  const props = PropertiesService.getScriptProperties();
  const list = (scriptApi_('get', '/deployments').deployments || []).filter(function (d) {
    return d.deploymentConfig && d.deploymentConfig.versionNumber &&
      (d.entryPoints || []).some(function (e) { return e.entryPointType === 'WEB_APP'; });
  });
  const want = props.getProperty('DEPLOY_ID') || ((String(props.getProperty('WEB_URL') || '').match(/\/s\/([A-Za-z0-9_\-]+)\/exec$/) || [])[1]);
  if (want && list.some(function (d) { return d.deploymentId === want; })) return want;
  if (list.length === 1) return list[0].deploymentId;
  if (!list.length) throw new Error('웹앱 배포가 없어요. 먼저 배포 › 새 배포로 웹앱을 한 번 만들어 주세요.');
  throw new Error('웹앱 배포가 여러 개라 어느 쪽인지 모르겠어요. 학생들이 쓰는 웹앱 주소로 한 번 접속한 뒤 다시 해 주세요.');
}

/** 저장소에 새 버전이 있으면 코드를 바꾸고 웹앱에 새 버전을 건다. */
function syncNow_(force) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { changed: false, note: '다른 업데이트가 진행 중' };
  try {
    const props = PropertiesService.getScriptProperties();
    const rel = JSON.parse(syncRaw_('release.json'));
    if (!rel || !rel.version || !Array.isArray(rel.files) || !rel.files.length) throw new Error('release.json 형식이 이상해요');
    if (!force && rel.version === props.getProperty('SYNC_VER')) return { changed: false, version: rel.version };
    const files = rel.files.map(function (f) {
      const src = syncRaw_(f.name);
      if (sha256Hex_(src) !== f.sha256) throw new Error(f.name + ' 이(가) 아직 다 올라오지 않았어요. 다음 확인 때 다시 받아요.');
      const m = String(f.name).match(/^([^\/]+)\.(gs|html)$/);
      if (!m) throw new Error('알 수 없는 파일: ' + f.name);
      return { name: m[1], type: m[2] === 'gs' ? 'SERVER_JS' : 'HTML', source: src };
    });
    ['Code', 'Index'].forEach(function (n) { if (!files.some(function (f) { return f.name === n; })) throw new Error(n + ' 파일이 빠져 있어 멈췄어요'); });
    const cur = scriptApi_('get', '/content').files || [];
    const manifest = cur.filter(function (f) { return f.name === 'appsscript'; })[0];
    if (!manifest) throw new Error('지금 프로젝트의 appsscript.json 을 못 읽었어요');
    const depId = syncDeployId_(); // 코드를 바꾸기 전에 배포부터 확인 (못 찾으면 아무것도 안 바꾼다)
    scriptApi_('put', '/content', { files: [manifest].concat(files) });
    const ver = scriptApi_('post', '/versions', { description: '자동 업데이트 ' + rel.version });
    scriptApi_('put', '/deployments/' + depId, { deploymentConfig: {
      scriptId: ScriptApp.getScriptId(), versionNumber: ver.versionNumber, manifestFileName: 'appsscript',
      description: '자동 업데이트 ' + rel.version + (rel.note ? ' · ' + String(rel.note).slice(0, 80) : '') } });
    props.setProperties({ SYNC_VER: rel.version, DEPLOY_ID: depId });
    return { changed: true, version: rel.version, note: rel.note || '', deployVersion: ver.versionNumber };
  } finally { lock.releaseLock(); }
}

function syncLog_(text) {
  const now = Utilities.formatDate(new Date(), TZ, 'M/d HH:mm');
  PropertiesService.getScriptProperties().setProperty('SYNC_LOG', now + ' ' + String(text).slice(0, 300));
}

/** 5분마다 도는 트리거. 실패해도 웹앱은 그대로 (바꾸기 전에 멈춘다). */
function autoSyncTick() {
  try {
    const r = syncNow_(false);
    if (r.changed) syncLog_('적용 완료: ' + r.version + (r.note ? ' — ' + r.note : '') + ' (웹앱 버전 ' + r.deployVersion + ')');
  } catch (e) { syncLog_('실패: ' + e.message); }
}

function autoSyncOn() {
  const ui = SpreadsheetApp.getUi();
  try {
    syncDeployId_(); // API·권한·배포 확인
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'autoSyncTick') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('autoSyncTick').timeBased().everyMinutes(SYNC_EVERY_MIN).create();
    const r = syncNow_(false);
    if (r.changed) syncLog_('적용 완료: ' + r.version + ' (웹앱 버전 ' + r.deployVersion + ')');
    ui.alert('자동 업데이트를 켰어요.\n\n이제 새 코드가 저장소에 올라오면 ' + SYNC_EVERY_MIN + '분 안에 웹앱에 반영돼요. 웹앱 주소는 그대로예요.\n\n' +
      (r.changed ? '방금 최신 버전(' + r.version + ')으로 바꿨어요. 시트를 새로고침해 주세요.' : '지금은 최신 버전이에요.'));
  } catch (e) { ui.alert('자동 업데이트를 켜지 못했어요.\n\n' + e.message); }
}

function autoSyncNow() {
  const ui = SpreadsheetApp.getUi();
  try {
    const r = syncNow_(false);
    if (r.changed) { syncLog_('적용 완료: ' + r.version + ' (웹앱 버전 ' + r.deployVersion + ')'); ui.alert('새 버전(' + r.version + ')을 적용했어요.' + (r.note ? '\n\n' + r.note : '') + '\n\n시트를 새로고침해 주세요.'); }
    else ui.alert('이미 최신 버전이에요' + (r.version ? ' (' + r.version + ')' : '') + '.');
  } catch (e) { syncLog_('실패: ' + e.message); ui.alert('업데이트하지 못했어요.\n\n' + e.message); }
}

function autoSyncStatus() {
  const props = PropertiesService.getScriptProperties();
  const on = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'autoSyncTick'; });
  SpreadsheetApp.getUi().alert('자동 업데이트: ' + (on ? '켜짐 (' + SYNC_EVERY_MIN + '분마다 확인)' : '꺼짐') +
    '\n저장소: ' + syncRepo_() + '\n지금 버전: ' + (props.getProperty('SYNC_VER') || '-') + '\n마지막 기록: ' + (props.getProperty('SYNC_LOG') || '-'));
}

function autoSyncOff() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'autoSyncTick') ScriptApp.deleteTrigger(t); });
  SpreadsheetApp.getUi().alert('자동 업데이트를 껐어요. 이제 코드는 직접 바꿔야 반영돼요.');
}
