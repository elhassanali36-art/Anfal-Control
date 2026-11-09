
(function () {
  "use strict";
  var LS = 'anfal.control.v1';
  var DEFAULTS = {
    owner: 'elhassanali36-art',
    token: '',
    pinHash: '',
    current: 'cars',
    apps: [
      { key: 'cars', name: 'الدلالة — السيارات', repo: 'Al-Dalala', branch: 'main', dataPath: 'data.js',
        webUrl: 'https://elhassanali36-art.github.io/Al-Dalala/', itemLabel: 'سيارة', color: '#e6c384' },
      { key: 'phones', name: 'الجوالات', repo: 'Anfal-Phones', branch: 'main', dataPath: 'data.js',
        webUrl: '', itemLabel: 'جوال', color: '#8b6cf0' },
      { key: 'market', name: 'السوبرماركت', repo: 'Anfal-Market', branch: 'main', dataPath: 'data.js',
        webUrl: '', itemLabel: 'منتج', color: '#39b978' },
      { key: 'estate', name: 'العقارات', repo: 'Anfal-Estate', branch: 'main', dataPath: 'data.js',
        webUrl: '', itemLabel: 'عقار', color: '#e08a4c' }
    ]
  };

  var store = load();
  var data = null;          // { settings:{}, cars:[] }
  var dirty = false;
  var sha = null;
  var editingId = null;
  var pendingImage = null;  // {name, dataUrl}

  function load() {
    try {
      var raw = localStorage.getItem(LS);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULTS));
      var v = JSON.parse(raw);
      var out = JSON.parse(JSON.stringify(DEFAULTS));
      out.owner = v.owner || out.owner;
      out.token = v.token || '';
      out.pinHash = v.pinHash || '';
      out.current = v.current || 'cars';
      if (Array.isArray(v.apps) && v.apps.length) out.apps = v.apps;
      return out;
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULTS)); }
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) {} }

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = '.3s'; }, 2600);
    setTimeout(function () { t.remove(); }, 3100);
  }
  function log(msg) {
    var el = $('#log');
    el.textContent = (msg + '\n' + el.textContent).slice(0, 4000);
  }
  function currentApp() {
    for (var i = 0; i < store.apps.length; i++) if (store.apps[i].key === store.current) return store.apps[i];
    return store.apps[0];
  }

  /* ---------- الأمان ---------- */
  function sha256(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('00' + b.toString(16)).slice(-2);
      }).join('');
    });
  }
  function showLock() {
    $('#lock').classList.remove('hide');
    $('#app').classList.add('hide');
    $('#pin2wrap').classList.toggle('hide', !!store.pinHash);
    $('#lockHint').textContent = store.pinHash ? 'أدخل رمز الدخول للوصول إلى تطبيقاتك' : 'اختر رمز دخول (4 أرقام أو أكثر) لحماية اللوحة';
    $('#lockBtn').textContent = store.pinHash ? 'دخول' : 'إنشاء الرمز والدخول';
    setTimeout(function () { $('#pin').focus(); }, 200);
  }
  $('#lockBtn').addEventListener('click', function () {
    var pin = $('#pin').value.trim();
    var err = $('#lockErr');
    err.textContent = '';
    if (pin.length < 4) { err.textContent = 'الرمز قصير — 4 خانات على الأقل'; return; }
    if (!store.pinHash) {
      var pin2 = $('#pin2').value.trim();
      if (pin !== pin2) { err.textContent = 'الرمز والتأكيد غير متطابقين'; return; }
      sha256(pin).then(function (h) {
        store.pinHash = h; save();
        enterApp();
      });
      return;
    }
    sha256(pin).then(function (h) {
      if (h !== store.pinHash) { err.textContent = 'رمز غير صحيح'; return; }
      enterApp();
    });
  });
  $('#pin').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('#lockBtn').click();
  });
  $('#pin2').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('#lockBtn').click();
  });
  function enterApp() {
    $('#lock').classList.add('hide');
    $('#app').classList.remove('hide');
    $('#pin').value = ''; $('#pin2').value = '';
    renderTabs();
    loadApp();
  }
  $('#btnLock').addEventListener('click', showLock);

  /* ---------- GitHub ---------- */
  function ghUrl(path) { return 'https://api.github.com' + path; }
  function gh(method, path, body) {
    if (!store.token) return Promise.reject(new Error('لا يوجد توكن GitHub — افتح الإعدادات وأدخله'));
    var opt = {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + store.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    };
    if (body) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    return fetch(ghUrl(path), opt).then(function (r) {
      if (r.status === 404) return null;
      return r.json().then(function (j) {
        if (!r.ok) {
          var m = (j && j.message) ? j.message : ('HTTP ' + r.status);
          throw new Error(m);
        }
        return j;
      });
    });
  }
  function b64enc(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64dec(b64) {
    var clean = String(b64 || '').replace(/\s/g, '');
    var bin = atob(clean);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------- تحميل بيانات التطبيق ---------- */
  function loadApp() {
    var app = currentApp();
    data = null; sha = null; dirty = false;
    $('#appName').textContent = app.name;
    $('#appState').textContent = 'جارِ التحميل';
    $('#appState').className = 'pill';
    $('#items').innerHTML = '';
    $('#appErr').textContent = '';
    $('#appMeta').textContent = app.repo + ' / ' + app.dataPath;
    var url = '/repos/' + store.owner + '/' + app.repo + '/contents/' + encodeURI(app.dataPath) + '?ref=' + (app.branch || 'main');
    sha256(store.current + ':' + Date.now()).then(function () {});
    // fetch مباشر بدون توكن للقراءة العامة أيضاً
    gh('GET', url).then(function (res) {
      if (!res) {
        data = { settings: { name: app.name, whatsapp: '', phone: '' }, cars: [] };
        $('#appState').textContent = 'ملف البيانات غير موجود — سيُنشأ عند النشر';
        $('#appState').className = 'pill bad';
        renderSettings(); renderItems();
        return;
      }
      sha = res.sha;
      var text = b64dec(res.content);
      data = parseDataFile(text);
      $('#appState').textContent = 'جاهز';
      $('#appState').className = 'pill ok';
      renderSettings(); renderItems(); updateDirty();
      log('تم تحميل ' + (data.cars ? data.cars.length : 0) + ' عنصر من ' + app.repo);
    }).catch(function (e) {
      $('#appState').textContent = 'خطأ';
      $('#appState').className = 'pill bad';
      $('#appErr').textContent = e.message;
      log('خطأ في التحميل: ' + e.message);
    });
  }
  function parseDataFile(text) {
    var a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b < 0) throw new Error('ملف البيانات غير مفهوم');
    var body = text.slice(a, b + 1), obj;
    try { obj = JSON.parse(body); }
    catch (e) { obj = new Function('return (' + body + ')')(); }
    if (!obj.cars) obj.cars = [];
    if (!obj.settings) obj.settings = {};
    return obj;
  }
  function serialize() {
    var app = currentApp();
    return '/* ' + app.name + ' — بيانات التطبيق (تُدار من لوحة التحكم) */\n' +
      'window.__SHOWROOM__ = ' + JSON.stringify(data, null, 2) + ';\n';
  }
  function updateDirty() {
    $('#dirtyMeta').textContent = dirty
      ? 'توجد تغييرات غير منشورة — اضغط نشر الآن'
      : 'لا توجد تغييرات غير منشورة';
    $('#dirtyMeta').style.color = dirty ? '#ffd48a' : '';
  }

  /* ---------- التبويبات ---------- */
  function renderTabs() {
    $('#tabs').innerHTML = store.apps.map(function (a) {
      return '<button class="tab ' + (a.key === store.current ? 'on' : '') + '" data-key="' + esc(a.key) + '">' +
        esc(a.name) + '</button>';
    }).join('') + '<button class="tab" id="tabAdd">+</button>';
    Array.prototype.forEach.call(document.querySelectorAll('.tab[data-key]'), function (b) {
      b.addEventListener('click', function () {
        if (dirty && !confirm('عندك تغييرات غير منشورة. تنتقل بدون نشر؟')) return;
        store.current = b.getAttribute('data-key'); save();
        renderTabs(); loadApp();
      });
    });
    var ta = $('#tabAdd');
    if (ta) ta.addEventListener('click', function () { openSettings(); });
  }

  /* ---------- عرض العناصر ---------- */
  function renderItems() {
    var app = currentApp();
    var list = (data.cars || []);
    if (!list.length) {
      $('#items').innerHTML = '<div class="meta" style="text-align:center;padding:26px 10px">لا يوجد شيء بعد. اضغط «+ إضافة» لتبدأ.</div>';
      return;
    }
    $('#items').innerHTML = list.map(function (it) {
      var img = it.image
        ? '<img class="thumb" src="' + esc(imgSrc(it.image)) + '" alt="" onerror="this.style.opacity=.25">'
        : '<div class="thumb" style="display:grid;place-items:center;color:#4d4560;font-size:11px">بلا صورة</div>';
      var sub = [it.year, it.category, it.place].filter(Boolean).join(' • ');
      var price = it.price ? (it.price + ' ' + (it.priceUnit || '')) : '—';
      return '<div class="item" data-id="' + esc(it.id) + '">' + img +
        '<div class="grow">' +
          '<p class="t">' + esc(it.title) + '</p>' +
          '<p class="s">' + esc(sub) + '</p>' +
        '</div>' +
        '<div class="price">' + esc(price) + '</div>' +
        '<div class="acts">' +
          '<button class="mini" data-act="up" title="أعلى">↑</button>' +
          '<button class="mini" data-act="down" title="أسفل">↓</button>' +
          '<button class="mini" data-act="edit" title="تعديل">✎</button>' +
          '<button class="mini del" data-act="del" title="حذف">🗑</button>' +
        '</div>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.item'), function (row) {
      var id = row.getAttribute('data-id');
      Array.prototype.forEach.call(row.querySelectorAll('[data-act]'), function (b) {
        b.addEventListener('click', function () {
          var act = b.getAttribute('data-act');
          if (act === 'edit') openItem(id);
          else if (act === 'del') delItem(id);
          else if (act === 'up') moveItem(id, -1);
          else if (act === 'down') moveItem(id, 1);
        });
      });
    });
  }
  function imgSrc(v) {
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    var base = currentApp().webUrl || '';
    if (!base) return v;
    return base.replace(/\/$/, '') + '/' + String(v).replace(/^\//, '');
  }
  function findItem(id) {
    for (var i = 0; i < data.cars.length; i++) if (String(data.cars[i].id) === String(id)) return data.cars[i];
    return null;
  }
  function nextId() {
    var m = 0;
    (data.cars || []).forEach(function (c) { var v = parseInt(c.id, 10); if (!isNaN(v) && v > m) m = v; });
    return m + 1;
  }
  function moveItem(id, dir) {
    var i = data.cars.findIndex(function (c) { return String(c.id) === String(id); });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= data.cars.length) return;
    var tmp = data.cars[i]; data.cars[i] = data.cars[j]; data.cars[j] = tmp;
    dirty = true; updateDirty(); renderItems();
  }
  function delItem(id) {
    var it = findItem(id);
    if (!it) return;
    if (!confirm('حذف «' + it.title + '»؟')) return;
    data.cars = data.cars.filter(function (c) { return String(c.id) !== String(id); });
    dirty = true; updateDirty(); renderItems(); toast('تم الحذف — لا تنسَ النشر', 'ok');
  }

  /* ---------- نافذة العنصر ---------- */
  function openItem(id) {
    editingId = id || null;
    var it = id ? findItem(id) : null;
    $('#sheetTitle').textContent = it ? ('تعديل: ' + it.title) : ('إضافة ' + currentApp().itemLabel);
    var f = {
      fTitle: it ? it.title : '',
      fYear: it ? it.year : '',
      fCategory: it ? it.category : '',
      fBadge: it ? it.badge : '',
      fPlace: it ? it.place : '',
      fPrice: it ? it.price : '',
      fPriceNote: it ? it.priceNote : '',
      fDealer: it ? it.dealer : '',
      fCommission: it ? it.commission : '',
      fCommissionNote: it ? it.commissionNote : '',
      fImage: it ? it.image : '',
      fSpecs: it && it.specs ? it.specs.join('\n') : ''
    };
    Object.keys(f).forEach(function (k) { $('#' + k).value = f[k] || ''; });
    $('#fPriceUnit').value = (it && it.priceUnit) ? it.priceUnit : 'مليون';
    pendingImage = null;
    setPreview(it ? it.image : '');
    $('#itemErr').textContent = '';
    $('#sheet').classList.remove('hide');
  }
  function setPreview(v) {
    $('#imgPrev').src = v ? imgSrc(v) : 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 300 150%27%3E%3Crect width=%27300%27 height=%27150%27 fill=%27%230e0c16%27/%3E%3Ctext x=%27150%27 y=%2780%27 text-anchor=%27middle%27 fill=%27%235d5470%27 font-size=%2714%27 font-family=%27sans-serif%27%3Eلا صورة%3C/text%3E%3C/svg%3E';
  }
  $('#sheetClose').addEventListener('click', function () { $('#sheet').classList.add('hide'); });
  $('#btnCancelItem').addEventListener('click', function () { $('#sheet').classList.add('hide'); });
  $('#fImage').addEventListener('input', function () { setPreview($('#fImage').value); });
  $('#btnClearImg').addEventListener('click', function () { $('#fImage').value = ''; pendingImage = null; setPreview(''); });
  $('#btnPickImg').addEventListener('click', function () { $('#imgFile').click(); });
  $('#imgFile').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    compress(file).then(function (out) {
      pendingImage = out;
      $('#imgPrev').src = out.dataUrl;
      toast('تم تجهيز الصورة (' + Math.round(out.blob.length / 1024) + ' كيلوبايت)', 'ok');
    }).catch(function (err) { toast(err.message, 'bad'); });
    e.target.value = '';
  });
  function compress(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 1200;
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          var dataUrl = cv.toDataURL('image/jpeg', 0.82);
          var b64 = dataUrl.split(',')[1];
          var bin = atob(b64);
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          resolve({ dataUrl: dataUrl, base64: b64, bytes: bytes, blob: bytes });
        };
        img.onerror = function () { reject(new Error('الصورة غير صالحة')); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error('تعذر قراءة الملف')); };
      reader.readAsDataURL(file);
    });
  }
  function slugify(s) {
    return String(s || 'img').toLowerCase().replace(/[^a-z0-9\u0621-\u064A]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'img';
  }
  $('#btnSaveItem').addEventListener('click', function () {
    var err = $('#itemErr');
    err.textContent = '';
    var title = $('#fTitle').value.trim();
    var price = $('#fPrice').value.trim();
    if (!title) { err.textContent = 'العنوان مطلوب'; return; }
    var item = {
      id: editingId ? (findItem(editingId) || {}).id : nextId(),
      title: title,
      year: $('#fYear').value.trim(),
      category: $('#fCategory').value.trim(),
      badge: $('#fBadge').value.trim(),
      image: $('#fImage').value.trim(),
      imageNote: '',
      price: price,
      priceUnit: $('#fPriceUnit').value,
      priceNote: $('#fPriceNote').value.trim(),
      commission: $('#fCommission').value.trim(),
      commissionNote: $('#fCommissionNote').value.trim(),
      place: $('#fPlace').value.trim(),
      dealer: $('#fDealer').value.trim(),
      specs: $('#fSpecs').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
    };
    // صور مرفوعة من الجهاز: نحفظها محلياً للرفع عند النشر
    if (pendingImage) {
      var name = 'img/' + slugify(title) + '-' + Date.now().toString().slice(-5) + '.jpg';
      item.image = name;
      pendingImages[name] = pendingImage.base64;
    }
    if (editingId) {
      for (var i = 0; i < data.cars.length; i++) {
        if (String(data.cars[i].id) === String(editingId)) { data.cars[i] = item; break; }
      }
    } else {
      data.cars.push(item);
    }
    dirty = true;
    $('#sheet').classList.add('hide');
    renderItems(); updateDirty();
    toast('تم الحفظ — اضغط «نشر الآن» ليظهر في التطبيق', 'ok');
  });
  var pendingImages = {};

  /* ---------- إعدادات المتجر ---------- */
  function renderSettings() {
    var s = (data && data.settings) || {};
    var rows = [
      ['الاسم', s.name], ['الوصف', s.tagline], ['واتساب', s.whatsapp], ['هاتف', s.phone],
      ['نص الواجهة', s.heroText], ['ملاحظة', s.heroNote], ['العنوان', s.address]
    ].filter(function (r) { return r[1]; });
    $('#settingsView').innerHTML = rows.length
      ? rows.map(function (r) { return '<div>' + esc(r[0]) + '</div><div>' + esc(r[1]) + '</div>'; }).join('')
      : '<div>—</div><div>لا توجد بيانات</div>';
  }
  $('#btnEditSettings').addEventListener('click', function () {
    var s = (data && data.settings) || {};
    var name = prompt('اسم التطبيق/المتجر', s.name || '');
    if (name === null) return;
    var wa = prompt('رقم الواتساب (مثال 249903263031)', s.whatsapp || '');
    if (wa === null) return;
    var tag = prompt('الوصف المختصر', s.tagline || '');
    if (tag === null) return;
    data.settings = data.settings || {};
    data.settings.name = name;
    data.settings.whatsapp = wa;
    data.settings.tagline = tag;
    dirty = true; renderSettings(); updateDirty(); toast('تم التعديل — لا تنسَ النشر', 'ok');
  });

  /* ---------- النشر ---------- */
  $('#btnReload').addEventListener('click', function () {
    if (dirty && !confirm('توجد تغييرات غير منشورة، ستضيع. أكمل؟')) return;
    pendingImages = {};
    loadApp();
  });
  $('#btnOpenApp').addEventListener('click', function () {
    var u = currentApp().webUrl;
    if (!u) { toast('هذا التطبيق لم يُنشأ بعد', 'bad'); return; }
    window.open(u, '_blank');
  });
  $('#btnAdd').addEventListener('click', function () { openItem(null); });

  function putFile(path, base64, message) {
    var app = currentApp();
    var url = '/repos/' + store.owner + '/' + app.repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
    return gh('GET', url + '?ref=' + (app.branch || 'main')).then(function (cur) {
      var body = { message: message, content: base64, branch: app.branch || 'main' };
      if (cur && cur.sha) body.sha = cur.sha;
      return gh('PUT', url, body);
    });
  }
  $('#btnPublish').addEventListener('click', function () {
    var app = currentApp();
    var btn = this;
    if (!store.token) { toast('أضف توكن GitHub من الإعدادات أولاً', 'bad'); return; }
    btn.disabled = true;
    var names = Object.keys(pendingImages);
    var chain = Promise.resolve();
    names.forEach(function (p) {
      chain = chain.then(function () {
        log('رفع صورة: ' + p);
        return putFile(p, pendingImages[p], 'صورة من لوحة التحكم');
      });
    });
    chain.then(function () {
      log('نشر البيانات: ' + app.dataPath);
      return putFile(app.dataPath, b64enc(serialize()), 'تحديث من لوحة التحكم: ' + new Date().toISOString().slice(0, 16));
    }).then(function (res) {
      pendingImages = {};
      dirty = false; updateDirty();
      if (res && res.content) sha = res.content.sha;
      log('✔ تم النشر بنجاح على ' + app.repo);
      toast('تم النشر — التطبيق يتحدّث خلال ثوانٍ', 'ok');
      btn.disabled = false;
    }).catch(function (e) {
      log('✖ فشل النشر: ' + e.message);
      toast('فشل النشر: ' + e.message, 'bad');
      btn.disabled = false;
    });
  });

  /* ---------- نافذة الإعدادات ---------- */
  function openSettings() {
    $('#sOwner').value = store.owner;
    $('#sToken').value = store.token;
    renderAppsEditor();
    $('#sheet2').classList.remove('hide');
  }
  $('#btnSettings').addEventListener('click', openSettings);
  $('#sheet2Close').addEventListener('click', function () { $('#sheet2').classList.add('hide'); });
  function renderAppsEditor() {
    $('#appsEditor').innerHTML = store.apps.map(function (a, i) {
      return '<div style="border:1px solid var(--line);border-radius:12px;padding:10px;margin-bottom:8px">' +
        '<div class="row" style="gap:8px"><input data-i="' + i + '" data-f="name" value="' + esc(a.name) + '" style="flex:1">' +
        '<button class="mini del" data-rm="' + i + '">🗑</button></div>' +
        '<div class="row" style="gap:8px;margin-top:8px">' +
          '<input data-i="' + i + '" data-f="repo" value="' + esc(a.repo) + '" placeholder="اسم المستودع">' +
          '<input data-i="' + i + '" data-f="webUrl" value="' + esc(a.webUrl || '') + '" placeholder="رابط التطبيق">' +
        '</div>' +
        '<div class="row" style="gap:8px;margin-top:8px">' +
          '<input data-i="' + i + '" data-f="dataPath" value="' + esc(a.dataPath) + '" placeholder="data.js">' +
          '<input data-i="' + i + '" data-f="itemLabel" value="' + esc(a.itemLabel || '') + '" placeholder="اسم العنصر">' +
        '</div>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call($('#appsEditor').querySelectorAll('input'), function (inp) {
      inp.addEventListener('input', function () {
        var i = +inp.getAttribute('data-i'), f = inp.getAttribute('data-f');
        store.apps[i][f] = inp.value;
      });
    });
    Array.prototype.forEach.call($('#appsEditor').querySelectorAll('[data-rm]'), function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-rm');
        if (store.apps.length <= 1) return;
        if (!confirm('حذف التطبيق «' + store.apps[i].name + '» من اللوحة؟ (لن يُحذف المستودع)')) return;
        store.apps.splice(i, 1);
        if (!store.apps.some(function (a) { return a.key === store.current; })) store.current = store.apps[0].key;
        save(); renderAppsEditor(); renderTabs();
      });
    });
  }
  $('#btnAddApp').addEventListener('click', function () {
    var name = prompt('اسم التطبيق الجديد (مثال: الجوالات)');
    if (!name) return;
    var repo = prompt('اسم مستودع GitHub للتطبيق (مثال: Anfal-Phones)');
    if (!repo) return;
    var key = 'app' + Date.now().toString().slice(-6);
    store.apps.push({ key: key, name: name, repo: repo, branch: 'main', dataPath: 'data.js', webUrl: '', itemLabel: 'منتج', color: '#8b6cf0' });
    save(); renderAppsEditor(); renderTabs();
    toast('أُضيف — احفظ الإعدادات', 'ok');
  });
  $('#btnSaveSettings').addEventListener('click', function () {
    store.owner = $('#sOwner').value.trim() || store.owner;
    store.token = $('#sToken').value.trim();
    save();
    $('#setMsg').textContent = 'تم حفظ الإعدادات في هذا المتصفح.';
    toast('تم الحفظ', 'ok');
    setTimeout(function () { $('#setMsg').textContent = ''; }, 3000);
  });
  $('#btnExport').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify({ data: data, app: currentApp() }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'backup-' + currentApp().key + '.json';
    a.click();
  });
  $('#btnImport').addEventListener('click', function () { $('#importFile').click(); });
  $('#importFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result);
        if (!j.data || !Array.isArray(j.data.cars)) throw new Error('ملف غير صالح');
        data = j.data; dirty = true;
        renderItems(); renderSettings(); updateDirty();
        toast('تم الاستيراد — راجع ثم انشر', 'ok');
      } catch (err) { toast('الملف غير صالح', 'bad'); }
    };
    r.readAsText(f);
    e.target.value = '';
  });

  /* ---------- بدء ---------- */
  if (store.pinHash) showLock(); else showLock();
  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
})();
