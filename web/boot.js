(function () {
  // 실제 데이터는 구글 시트(Apps Script)에 그대로 있다. 이 페이지는 화면을 받아 와서 띄우고, 버튼 동작을 그쪽으로 넘겨준다.
  // 빨라지게: 지난번에 받은 화면을 이 기기에 저장해 두고 바로 띄운 뒤, 새 화면은 뒤에서 받아 다음번에 쓴다.
  var API = 'https://script.google.com/macros/s/AKfycbyw6oiaICnnbyw2l0xVsVCJ0VBI1lz4mQM3N9BpNOs7p0edgAV9dcWNKQxMNTMhIdVykw/exec';
  var KEY = 'shell_v1';
  var B = window.BOOT || {};
  var title = B.title || '쉅', manifest = B.manifest || '/manifest.webmanifest', icon = B.icon || '/apple-touch-icon.png';
  var refresh = 'setTimeout(function(){fetch(API+"?raw=1").then(function(r){return r.ok?r.text():""}).then(function(h){if(h.indexOf("<head>")>=0){try{localStorage.setItem(' + JSON.stringify(KEY) + ',h)}catch(e){}}}).catch(function(){})},2500);';
  // 화면 코드가 쓰던 google.script.run 을 그대로 흉내 낸다
  var shim = '<script>(function(){var API=' + JSON.stringify(API) + ';' +
    'function mk(ok,fail){var o={withSuccessHandler:function(f){return mk(f,fail)},withFailureHandler:function(f){return mk(ok,f)}};' +
    'return new Proxy(o,{get:function(t,k){if(k in t)return t[k];return function(){var args=[].slice.call(arguments);' +
    'fetch(API,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({fn:k,args:args})})' +
    '.then(function(r){return r.json()}).then(function(r){if(r.err!==undefined){fail&&fail(new Error(r.err))}else{ok&&ok(r.v)}})' +
    '.catch(function(e){fail&&fail(new Error("연결이 끊겼습니다. 인터넷을 확인하고 다시 시도해 주세요."))})}}})}' +
    'window.google={script:{run:mk(null,null)}};' + refresh + '})();<\/script>';
  var head = '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' + title + '</title>' +
    '<meta name="theme-color" content="#f5f5f7"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="' + title + '">' +
    '<link rel="icon" type="image/png" href="/favicon-64.png"><link rel="apple-touch-icon" href="' + icon + '"><link rel="manifest" href="' + manifest + '">';
  function render(html) {
    html = html.replace('<head>', '<head>' + head + shim).replace('<base target="_top">', '');
    document.open(); document.write(html); document.close();
  }
  function fail() {
    var s = document.getElementById('splash');
    s.innerHTML = '<div class="err">화면을 불러오지 못했어요.<br>인터넷 연결을 확인해 주세요.<br><button type="button">다시 시도</button></div>';
    s.querySelector('button').onclick = function () { location.reload(); };
  }
  var cached = null;
  try { cached = localStorage.getItem(KEY); } catch (e) {}
  if (cached && cached.indexOf('<head>') >= 0) {
    // 문서를 다 읽은 뒤에 갈아 끼워야 한다 (읽는 도중의 document.open은 무시되고 아래에 덧붙는다)
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { render(cached); });
    else render(cached);
    return; // 새 화면은 띄운 뒤 shim이 받아 둔다
  }
  fetch(API + '?raw=1').then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (html) {
    if (html.indexOf('<head>') < 0) throw new Error('bad');
    try { localStorage.setItem(KEY, html); } catch (e) {}
    render(html);
  }).catch(fail);
})();
