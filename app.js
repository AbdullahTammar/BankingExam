(function () {
  'use strict';

  var PASS = 75;               // pass mark (real exam is 65 — we train harder)
  var FULL_MINUTES = 100;      // 100 questions in 100 minutes
  var STORE_KEY = 'jana.bank.v1';
  var LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

  var byId = {};
  QB.forEach(function (q) { byId[q.id] = q; });
  var chapterOf = {};
  CHAPTERS.forEach(function (c) { chapterOf[c.n] = c; });

  // ---------------- storage ----------------
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && typeof s === 'object') return fillDefaults(s);
    } catch (e) { /* storage unavailable or corrupt */ }
    return fillDefaults({});
  }
  function fillDefaults(s) {
    s.history = s.history || [];
    s.qstats = s.qstats || {};
    s.active = s.active || null;
    return s;
  }
  var S = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }

  // ---------------- helpers ----------------
  var app = document.getElementById('app');
  var modal = document.getElementById('modal');
  var timerHandle = null;
  var lastShown = -1; // question index last drawn, so the fade-in only plays on a new question

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function range(n) { var r = []; for (var i = 0; i < n; i++) r.push(i); return r; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtDate(t) {
    try {
      return new Date(t).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short', calendar: 'gregory', numberingSystem: 'latn' });
    } catch (e) { return new Date(t).toLocaleString(); }
  }
  function sameSet(a, b) {
    if (!a || a.length !== b.length) return false;
    var x = a.slice().sort().join(','), y = b.slice().sort().join(',');
    return x === y;
  }
  function isRight(q, sel) { return sameSet(sel || [], q.a); }
  function mastery(ch) {
    var seen = 0, right = 0;
    QB.forEach(function (q) {
      if (ch && q.c !== ch) return;
      var st = S.qstats[q.id];
      if (st && st.seen) { seen += st.seen; right += st.seen - st.wrong; }
    });
    return { seen: seen, pct: pct(right, seen) };
  }
  function mistakeIds() {
    return QB.filter(function (q) {
      var st = S.qstats[q.id];
      return st && st.wrong > 0 && (st.streak || 0) < 2;
    }).map(function (q) { return q.id; });
  }
  function barClass(p) { return p >= PASS ? '' : p >= 55 ? 'mid' : 'low'; }

  function setNav(view) {
    document.querySelectorAll('[data-go]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-go') === view);
    });
    document.body.classList.toggle('in-exam', view === 'exam');
  }
  function render(html, view) {
    stopTimer();
    lastShown = -1;
    app.innerHTML = '<div class="fade">' + html + '</div>';
    setNav(view);
    window.scrollTo(0, 0);
  }
  function footer() {
    return '<div class="footer">صُنعت بحب لـ <b>جنى تمّار</b> 🤍 — Abdullah Trusts you</div>';
  }

  // ---------------- exam building ----------------
  function pickFromChapter(ch, n, prefer) {
    var pool = QB.filter(function (q) { return q.c === ch; });
    // Prefer questions she has seen least, then random — so every attempt covers new ground.
    pool = shuffle(pool).sort(function (a, b) {
      var sa = S.qstats[a.id], sb = S.qstats[b.id];
      var wa = (sa ? sa.seen : 0) - (prefer && sa && sa.wrong ? 2 : 0);
      var wb = (sb ? sb.seen : 0) - (prefer && sb && sb.wrong ? 2 : 0);
      return wa - wb;
    });
    return pool.slice(0, n);
  }
  function makeExam(opts) {
    var qs;
    if (opts.type === 'full') {
      qs = [];
      CHAPTERS.forEach(function (c) { qs = qs.concat(pickFromChapter(c.n, c.w, true)); });
    } else if (opts.type === 'chapter') {
      var pool = [];
      opts.chapters.forEach(function (ch) { pool = pool.concat(QB.filter(function (q) { return q.c === ch; })); });
      qs = shuffle(pool).slice(0, opts.count || pool.length);
    } else if (opts.type === 'mistakes') {
      qs = shuffle(opts.ids.map(function (id) { return byId[id]; })).slice(0, opts.count || 999);
    } else { // quick mix
      qs = shuffle(QB).slice(0, opts.count || 20);
    }
    qs = shuffle(qs);
    return {
      type: opts.type, title: opts.title, practice: !!opts.practice, chapters: opts.chapters || null,
      qs: qs.map(function (q) { return { id: q.id, order: shuffle(range(q.o.length)) }; }),
      answers: {}, checked: {}, flags: {}, cur: 0,
      start: Date.now(), limit: opts.minutes ? opts.minutes * 60 : 0
    };
  }
  function startExam(opts) {
    S.active = makeExam(opts);
    save();
    showExam();
  }

  // ---------------- views ----------------
  function home() {
    var H = S.history;
    var fulls = H.filter(function (h) { return h.type === 'full'; });
    var best = H.reduce(function (m, h) { return Math.max(m, h.pct); }, 0);
    var last3 = fulls.slice(-3);
    var ready = last3.length ? Math.round(last3.reduce(function (s, h) { return s + h.pct; }, 0) / last3.length) : null;
    var mcount = mistakeIds().length;
    var tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    var hour = new Date().getHours();
    var greet = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء النور' : 'مساء الخير';

    var resume = '';
    if (S.active) {
      var a = S.active, done = Object.keys(a.answers).length;
      resume = '<div class="card" style="border-color:var(--accent)"><div class="row spread"><div><h3>⏸️ عندك اختبار لم يكتمل</h3><p class="muted small" style="margin:0">' +
        esc(a.title) + ' — أجبتِ ' + done + ' من ' + a.qs.length + '</p></div><div class="row">' +
        '<button class="btn sm" data-act="resume">أكملي</button><button class="btn sm ghost" data-act="discard">إلغاء</button></div></div></div>';
    }

    render(
      '<section class="hero">' +
        '<h1>' + greet + ' يا جنى 👋</h1>' +
        '<p>' + QB.length + ' سؤالاً من كل صفحة في الكتاب، بنفس مستوى الاختبار الحقيقي أو أصعب.</p>' +
        '<div class="trust">🤍 Abdullah Trusts you — عبدالله واثق فيك</div>' +
        '<div class="stats">' +
          '<div class="stat"><b>' + H.length + '</b><span>اختبار منجز</span></div>' +
          '<div class="stat"><b>' + (H.length ? best + '%' : '—') + '</b><span>أفضل نتيجة</span></div>' +
          '<div class="stat"><b>' + (ready === null ? '—' : ready + '%') + '</b><span>الجاهزية*</span></div>' +
        '</div>' +
      '</section>' + resume +
      '<div class="grid two">' +
        '<button class="mode" data-act="full"><span class="ic">📝</span><span><h3>اختبار شامل (100 سؤال)</h3><p>نفس توزيع الاختبار الحقيقي على الفصول العشرة، ' + FULL_MINUTES + ' دقيقة، النجاح ' + PASS + '%.</p></span></button>' +
        '<button class="mode" data-go="chapters"><span class="ic">📚</span><span><h3>اختبار حسب الفصل</h3><p>اختاري فصلاً أو أكثر، وعدد الأسئلة، ووضع الاختبار أو التدريب الفوري.</p></span></button>' +
        '<button class="mode" data-act="quick"><span class="ic">⚡</span><span><h3>تدريب سريع (20 سؤالاً)</h3><p>أسئلة عشوائية من كل الكتاب مع التصحيح الفوري بعد كل سؤال.</p></span></button>' +
        '<button class="mode" data-go="mistakes"><span class="ic">🔁</span><span><h3>بنك أخطائي <span class="pill ' + (mcount ? 'warn' : 'ok') + '">' + mcount + '</span></h3><p>كل سؤال أخطأتِ فيه يبقى هنا حتى تجيبي عليه صح مرتين متتاليتين.</p></span></button>' +
      '</div>' +
      '<div class="card tip" style="margin-top:14px"><span class="ic">' + tip.i + '</span><div><h3>' + esc(tip.t) + '</h3><p class="muted" style="margin:0">' + esc(tip.d) + '</p></div></div>' +
      '<p class="muted small">* الجاهزية = متوسط آخر 3 اختبارات شاملة. هدفنا: فوق 80% ثلاث مرات متتالية.</p>' +
      footer(), 'home');
  }

  function chapters() {
    var list = CHAPTERS.map(function (c) {
      var count = QB.filter(function (q) { return q.c === c.n; }).length;
      var m = mastery(c.n);
      return '<button class="chap" data-act="chapter" data-ch="' + c.n + '"><span class="num">' + c.n + '</span><span class="body"><b>' + esc(c.t) + '</b>' +
        '<span class="muted small">' + c.w + ' سؤالاً في الاختبار الحقيقي · ' + count + ' سؤالاً هنا · صفحات ' + c.p + '</span>' +
        '<span class="bar"><i class="' + barClass(m.pct) + '" style="width:' + (m.seen ? m.pct : 0) + '%"></i></span>' +
        '<span class="muted small">' + (m.seen ? 'إتقانك: ' + m.pct + '%' : 'لم تبدئي هذا الفصل بعد') + '</span></span></button>';
    }).join('');
    render(
      '<h1>📚 الاختبار حسب الفصل</h1><p class="muted">اضغطي على فصل للبدء، أو اختاري عدة فصول معاً.</p>' +
      '<div class="grid">' + list + '</div>' +
      '<button class="btn ghost block" style="margin-top:14px" data-act="multi">اختيار عدة فصول معاً</button>' + footer(), 'chapters');
  }

  function chapterSetup(chs) {
    var pool = QB.filter(function (q) { return chs.indexOf(q.c) >= 0; }).length;
    var counts = [10, 20, 30].filter(function (n) { return n < pool; }).concat([pool]);
    var title = chs.length === 1 ? 'الفصل ' + chs[0] + ': ' + chapterOf[chs[0]].t : 'الفصول ' + chs.join('، ');
    var st = { count: counts[Math.min(1, counts.length - 1)], practice: false, timer: true };
    function box() {
      return '<div class="box"><h2>' + esc(title) + '</h2><p class="muted small">' + pool + ' سؤالاً متاحاً. الترتيب والخيارات تتغير في كل محاولة.</p>' +
        '<div class="field"><label>عدد الأسئلة</label><div class="seg" data-k="count">' +
        counts.map(function (n) { return '<button data-v="' + n + '" class="' + (st.count === n ? 'on' : '') + '">' + (n === pool ? 'الكل (' + n + ')' : n) + '</button>'; }).join('') + '</div></div>' +
        '<div class="field"><label>الوضع</label><div class="seg" data-k="practice">' +
        '<button data-v="0" class="' + (!st.practice ? 'on' : '') + '">📝 اختبار</button><button data-v="1" class="' + (st.practice ? 'on' : '') + '">🎯 تدريب فوري</button></div>' +
        '<p class="muted small" style="margin:6px 0 0">' + (st.practice ? 'يظهر التصحيح والشرح بعد كل سؤال مباشرة.' : 'مثل الاختبار الحقيقي: النتيجة والتصحيح في النهاية.') + '</p></div>' +
        '<div class="field"><label>المؤقت</label><div class="seg" data-k="timer">' +
        '<button data-v="1" class="' + (st.timer ? 'on' : '') + '">⏱️ دقيقة لكل سؤال</button><button data-v="0" class="' + (!st.timer ? 'on' : '') + '">بدون مؤقت</button></div></div>' +
        '<div class="row"><button class="btn" data-m="go" style="flex:1">ابدئي</button><button class="btn ghost" data-m="close">إلغاء</button></div></div>';
    }
    openModal(box(), function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var seg = b.parentElement && b.parentElement.getAttribute('data-k');
      if (seg) {
        var v = +b.getAttribute('data-v');
        st[seg] = seg === 'count' ? v : !!v;
        modal.innerHTML = box();
      } else if (b.getAttribute('data-m') === 'close') closeModal();
      else if (b.getAttribute('data-m') === 'go') {
        closeModal();
        startExam({ type: 'chapter', chapters: chs, count: st.count, practice: st.practice, minutes: st.timer ? st.count : 0, title: title });
      }
    });
  }

  function multiPicker() {
    var sel = [];
    function box() {
      return '<div class="box"><h2>اختاري الفصول</h2><div class="grid">' +
        CHAPTERS.map(function (c) {
          return '<button class="opt sq ' + (sel.indexOf(c.n) >= 0 ? 'sel' : '') + '" data-ch="' + c.n + '"><span class="mk">' + (sel.indexOf(c.n) >= 0 ? '✓' : '') + '</span><span>' + c.n + ' — ' + esc(c.t) + '</span></button>';
        }).join('') + '</div><div class="row" style="margin-top:14px"><button class="btn" data-m="next" style="flex:1" ' + (sel.length ? '' : 'disabled') + '>متابعة (' + sel.length + ')</button><button class="btn ghost" data-m="close">إلغاء</button></div></div>';
    }
    openModal(box(), function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-ch')) {
        var n = +b.getAttribute('data-ch'), i = sel.indexOf(n);
        if (i >= 0) sel.splice(i, 1); else sel.push(n);
        sel.sort(function (x, y) { return x - y; });
        modal.innerHTML = box();
      } else if (b.getAttribute('data-m') === 'close') closeModal();
      else if (b.getAttribute('data-m') === 'next') { closeModal(); chapterSetup(sel.slice()); }
    });
  }

  function mistakes() {
    var ids = mistakeIds();
    var perCh = CHAPTERS.map(function (c) {
      var n = ids.filter(function (id) { return byId[id].c === c.n; }).length;
      return n ? '<tr><td>الفصل ' + c.n + '</td><td>' + esc(c.t) + '</td><td><span class="pill bad">' + n + '</span></td></tr>' : '';
    }).join('');
    render(
      '<h1>🔁 بنك أخطائي</h1>' +
      (ids.length
        ? '<div class="card"><p>عندك <b>' + ids.length + '</b> سؤالاً تحتاج مراجعة. يخرج السؤال من هنا بعد إجابتين صحيحتين متتاليتين.</p>' +
          '<table class="brk"><tr><th>الفصل</th><th>العنوان</th><th>العدد</th></tr>' + perCh + '</table>' +
          '<div class="row" style="margin-top:14px"><button class="btn" data-act="mist" data-p="1">🎯 راجعيها بتدريب فوري</button><button class="btn ghost" data-act="mist" data-p="0">📝 كاختبار</button></div></div>'
        : '<div class="card empty"><div class="big">🌟</div><h2>لا توجد أخطاء حالياً</h2><p>ابدئي اختباراً، وأي سؤال تخطئين فيه سيظهر هنا لتراجعيه.</p><button class="btn" data-act="full">ابدئي اختباراً شاملاً</button></div>') +
      footer(), 'mistakes');
  }

  function tips() {
    var t = TIPS.map(function (x) {
      return '<div class="card tip"><span class="ic">' + x.i + '</span><div><h3>' + esc(x.t) + '</h3><p class="muted" style="margin:0">' + esc(x.d) + '</p></div></div>';
    }).join('');
    var nums = NUMBERS.map(function (g, i) {
      return '<details class="acc"' + (i === 0 ? ' open' : '') + '><summary>' + esc(g[0]) + '</summary><div><table class="numtable">' +
        g[1].map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table></div></details>';
    }).join('');
    var plan = [
      ['الأسبوع الأول', 'الفصل 2 كاملاً (25% من الاختبار): اختبار فصل بوضع التدريب الفوري يومياً + جدول الأرقام.'],
      ['الأسبوع الثاني', 'الفصول 10 ثم 4 ثم 6 (35% من الاختبار). راجعي بنك الأخطاء نهاية كل يوم.'],
      ['الأسبوع الثالث', 'الفصول 1، 3، 5، 7، 8، 9. ثم اختبار شامل كل يومين.'],
      ['آخر 3 أيام', 'اختبار شامل يومياً، ثم بنك الأخطاء، ثم جدول الأرقام. ليلة الاختبار: مراجعة خفيفة ونوم مبكر.']
    ].map(function (p) { return '<tr><td>' + p[0] + '</td><td>' + p[1] + '</td></tr>'; }).join('');
    var traps = [
      ['النوافذ الإسلامية', '«غير مستقلة» قانونياً. أي خيار فيه «مستقلة» خطأ.'],
      ['الراتب والدخل', 'نسب التحمل تُحسب من إجمالي «الدخل الشهري» والاستقطاع من إجمالي «الراتب». لا تخلطي بينهما.'],
      ['الشيك', 'حروف مقابل أرقام: الحروف. تكرار واختلاف: الأقل.'],
      ['القاصر', 'السنوات «هجرية» وليست ميلادية.'],
      ['يوم عمل ويوم تقويمي', 'التمويل الاستهلاكي: الانسحاب خلال 10 أيام «عمل». بطاقة الائتمان: الإلغاء خلال 10 أيام. التعثر 90 يوماً «تقويمياً».'],
      ['مراحل غسل الأموال', 'إيداع ← تغطية ← دمج. أما تمويل الإرهاب فمراحله: جمع ← نقل ← استخدام.'],
      ['المضاربة والمشاركة', 'المضاربة: رب المال وحده يتحمل الخسارة. المشاركة: كل شريك بقدر حصته.'],
      ['التورق والتوريق', 'التورق = سيولة (شراء آجل وبيع نقدي). التوريق/التصكيك = إصدار صكوك.'],
      ['المركزي والحكومة', 'البنك المركزي «مصرف الحكومة»، لكن «إقراض الحكومة» محظور عليه.'],
      ['من يعتمد ماذا', 'سياسة الالتزام يعتمدها مجلس الإدارة. الإدارة الفعالة للمخاطر على الإدارة العليا. إدارة الالتزام تضع السياسة وتساعد.']
    ].map(function (p) { return '<tr><td>' + p[0] + '</td><td>' + p[1] + '</td></tr>'; }).join('');
    render(
      '<h1>💡 نصائح وحيل لجنى</h1>' +
      '<div class="hero" style="padding:18px"><h2 style="color:#fff">رسالة من عبدالله 🤍</h2><p>جنى، الاختبار ليس أصعب منك. كل سؤال هنا مكتوب من الكتاب نفسه، وكل خطأ ترتكبينه هنا هو خطأ لن ترتكبيه في الاختبار الحقيقي. ذاكري بهدوء وثقي بنفسك.</p><div class="trust">Abdullah Trusts you ✨</div></div>' +
      '<h2>🪤 أشهر الفخاخ في الاختبار</h2><div class="card"><table class="numtable">' + traps + '</table></div>' +
      '<h2>🧮 أرقام لا تُنسى</h2>' + nums +
      '<h2 style="margin-top:18px">🗓️ خطة مذاكرة مقترحة</h2><div class="card"><table class="numtable">' + plan + '</table></div>' +
      '<h2>✅ نصائح عامة</h2>' + t + footer(), 'tips');
  }

  function history() {
    var H = S.history.slice().reverse();
    var last = S.history.slice(-12);
    var chart = last.length ? '<div class="card"><h3>تطور درجاتك</h3><div style="display:flex;align-items:flex-end;gap:6px;height:140px;padding-top:10px;border-bottom:2px dashed var(--line);position:relative">' +
      '<span class="small muted" style="position:absolute;inset-inline-start:0;bottom:' + PASS + '%;border-top:2px dashed var(--accent);width:100%;line-height:0"></span>' +
      last.map(function (h) {
        return '<div title="' + h.pct + '%" style="flex:1;height:' + Math.max(4, h.pct) + '%;background:' + (h.pct >= PASS ? 'var(--primary)' : 'var(--bad)') + ';border-radius:6px 6px 0 0;position:relative"><span class="small" style="position:absolute;top:-22px;inset-inline:0;text-align:center">' + h.pct + '</span></div>';
      }).join('') + '</div><p class="muted small" style="margin-top:6px">الخط المتقطع = درجة النجاح ' + PASS + '%</p></div>' : '';
    var chRows = CHAPTERS.map(function (c) {
      var m = mastery(c.n);
      return '<tr><td>' + c.n + '</td><td>' + esc(c.t) + '</td><td style="min-width:90px">' + (m.seen ? '<span class="bar"><i class="' + barClass(m.pct) + '" style="width:' + m.pct + '%"></i></span><span class="small">' + m.pct + '%</span>' : '<span class="muted small">—</span>') + '</td></tr>';
    }).join('');
    render(
      '<h1>📈 سجلي</h1>' + chart +
      '<div class="card"><h3>مستوى الإتقان حسب الفصل</h3><table class="brk"><tr><th>#</th><th>الفصل</th><th>الإتقان</th></tr>' + chRows + '</table></div>' +
      (H.length ? '<div class="card"><h3>الاختبارات السابقة</h3><table class="brk"><tr><th>التاريخ</th><th>النوع</th><th>النتيجة</th><th></th></tr>' +
        H.map(function (h) {
          return '<tr><td class="small">' + fmtDate(h.date) + '</td><td class="small">' + esc(h.title) + '</td><td><span class="pill ' + (h.pct >= PASS ? 'ok' : 'bad') + '">' + h.pct + '%</span></td><td><button class="btn sm ghost" data-act="view" data-id="' + h.id + '">مراجعة</button></td></tr>';
        }).join('') + '</table></div>'
        : '<div class="card empty"><div class="big">📭</div><p>لا توجد اختبارات بعد.</p></div>') +
      '<div class="card"><h3>💾 نسخة احتياطية</h3><p class="muted small">تقدمك محفوظ في هذا المتصفح وعلى هذا الجهاز فقط. لنقله لجهاز آخر: نزّلي النسخة ثم استعيديها هناك.</p>' +
      '<div class="row"><button class="btn sm" data-act="export">⬇️ تنزيل نسخة</button><label class="btn sm ghost">⬆️ استعادة نسخة<input type="file" accept=".json,application/json" id="importFile" hidden></label><button class="btn sm ghost" data-act="reset" style="color:var(--bad)">🗑️ مسح كل البيانات</button></div></div>' +
      footer(), 'history');
    var f = document.getElementById('importFile');
    if (f) f.addEventListener('change', importData);
  }

  // ---------------- exam screen ----------------
  function showExam() {
    var E = S.active;
    if (!E) return home();
    stopTimer();
    var i = E.cur, item = E.qs[i], q = byId[item.id];
    if (!q) { S.active = null; save(); return home(); }
    var sel = E.answers[i] || [];
    var multi = q.a.length > 1;
    var checked = E.practice && E.checked[i];
    var answered = Object.keys(E.answers).length;

    var opts = item.order.map(function (oi, k) {
      var cls = 'opt' + (multi ? ' sq' : '');
      var on = sel.indexOf(oi) >= 0;
      if (checked) {
        if (q.a.indexOf(oi) >= 0) cls += ' right';
        else if (on) cls += ' wrong';
      } else if (on) cls += ' sel';
      return '<button class="' + cls + '" data-opt="' + oi + '"' + (checked ? ' disabled' : '') + '><span class="mk">' + LETTERS[k] + '</span><span>' + esc(q.o[oi]) + '</span></button>';
    }).join('');

    var explain = '';
    if (checked) {
      var ok = isRight(q, sel);
      explain = '<div class="explain' + (ok ? '' : ' bad') + '"><b>' + (ok ? '✅ إجابة صحيحة! أحسنتِ يا جنى' : '❌ الإجابة الصحيحة: ' + q.a.map(function (x) { return esc(q.o[x]); }).join(' + ')) + '</b>' +
        '<p style="margin:6px 0 0">' + esc(q.e) + '</p><span class="ref">📖 ' + esc(q.r) + '</span></div>';
    }

    var isLast = i === E.qs.length - 1;
    var mainBtn;
    if (E.practice && !checked) mainBtn = '<button class="btn" data-x="check" ' + (sel.length ? '' : 'disabled') + '>تحقّقي</button>';
    else if (isLast) mainBtn = '<button class="btn warn" data-x="finish">إنهاء ✓</button>';
    else mainBtn = '<button class="btn" data-x="next">التالي ←</button>';

    app.innerHTML =
      '<div class="examhead"><div class="top">' +
        '<button class="btn sm ghost" data-x="quit">✕ خروج</button>' +
        '<span class="small muted">' + esc(E.title) + '</span>' +
        (E.limit ? '<span class="timer" id="timer">--:--</span>' : '<span class="timer">' + (i + 1) + '/' + E.qs.length + '</span>') +
      '</div><div class="progress"><i style="width:' + pct(answered, E.qs.length) + '%"></i></div></div>' +
      '<div class="qcard' + (lastShown === i ? '' : ' fade') + '">' +
        '<div class="qmeta"><span class="qnum">سؤال ' + (i + 1) + ' من ' + E.qs.length + '</span><span class="pill">الفصل ' + q.c + '</span>' +
        (E.flags[i] ? '<span class="pill warn">🚩 للمراجعة</span>' : '') + '</div>' +
        '<div class="qtext">' + esc(q.q) + '</div>' +
        (multi ? '<span class="multi-hint">✌️ اختاري ' + q.a.length + ' إجابات — الدرجة كاملة فقط إذا اخترتِ الصحيحة كلها</span>' : '') +
        '<div class="opts">' + opts + '</div>' + explain +
        '<div class="examnav">' +
          '<button class="btn ghost" data-x="prev" ' + (i === 0 ? 'disabled' : '') + '>→ السابق</button>' +
          '<button class="btn ghost sm flag ' + (E.flags[i] ? 'on' : '') + '" data-x="flag" title="علّمي السؤال للمراجعة">🚩</button>' +
          mainBtn +
        '</div>' +
      '</div>' +
      '<div class="card" style="margin-top:14px"><div class="row spread" style="margin-bottom:8px"><h3 style="margin:0">خريطة الأسئلة</h3>' +
        '<span class="small muted">أُجيب ' + answered + ' · 🚩 ' + Object.keys(E.flags).filter(function (k) { return E.flags[k]; }).length + '</span></div>' +
        '<div class="navgrid">' + E.qs.map(function (it, k) {
          var c = '';
          if (E.practice && E.checked[k]) c = isRight(byId[it.id], E.answers[k]) ? 'r' : 'w';
          else if (E.flags[k]) c = 'flagged';
          else if (E.answers[k] && E.answers[k].length) c = 'done';
          return '<button data-jump="' + k + '" class="' + c + (k === i ? ' cur' : '') + '">' + (k + 1) + '</button>';
        }).join('') + '</div>' +
        '<button class="btn warn block" style="margin-top:12px" data-x="finish">إنهاء الاختبار وعرض النتيجة</button></div>';
    setNav('exam');
    lastShown = i;
    if (E.limit) startTimer();
  }

  function startTimer() {
    var el = document.getElementById('timer');
    function tick() {
      var E = S.active; if (!E) return stopTimer();
      var left = E.limit - (Date.now() - E.start) / 1000;
      if (el) { el.textContent = '⏱️ ' + fmtTime(left); el.classList.toggle('low', left < 300); }
      if (left <= 0) { stopTimer(); alert('انتهى الوقت! سيتم عرض النتيجة الآن.'); finish(); }
    }
    tick();
    timerHandle = setInterval(tick, 1000);
  }
  function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

  function examClick(e) {
    var E = S.active; if (!E) return;
    var b = e.target.closest('button'); if (!b) return;
    var i = E.cur, q = byId[E.qs[i].id];
    if (b.hasAttribute('data-opt')) {
      if (E.practice && E.checked[i]) return;
      var oi = +b.getAttribute('data-opt');
      var sel = (E.answers[i] || []).slice();
      if (q.a.length > 1) {
        var p = sel.indexOf(oi);
        if (p >= 0) sel.splice(p, 1); else sel.push(oi);
      } else sel = [oi];
      if (sel.length) E.answers[i] = sel; else delete E.answers[i];
      save(); showExam(); return;
    }
    if (b.hasAttribute('data-jump')) { E.cur = +b.getAttribute('data-jump'); save(); showExam(); return; }
    var x = b.getAttribute('data-x');
    if (x === 'next' && i < E.qs.length - 1) { E.cur++; save(); showExam(); }
    else if (x === 'prev' && i > 0) { E.cur--; save(); showExam(); }
    else if (x === 'flag') { E.flags[i] = !E.flags[i]; save(); showExam(); }
    else if (x === 'check') { E.checked[i] = true; save(); showExam(); }
    else if (x === 'finish') confirmFinish();
    else if (x === 'quit') {
      confirmBox('الخروج من الاختبار؟', 'تقدمك محفوظ، ويمكنك إكمال الاختبار لاحقاً من الصفحة الرئيسية.', 'خروج', function () { stopTimer(); home(); });
    }
  }

  function confirmFinish() {
    var E = S.active;
    var left = E.qs.length - Object.keys(E.answers).length;
    var flagged = Object.keys(E.flags).filter(function (k) { return E.flags[k]; }).length;
    var msg = left ? 'لم تجيبي على <b>' + left + '</b> سؤالاً، وستُحسب خاطئة.' : 'أجبتِ على جميع الأسئلة 👏';
    if (flagged) msg += '<br>عندك <b>' + flagged + '</b> سؤالاً معلَّماً للمراجعة 🚩';
    confirmBox('إنهاء الاختبار؟', msg, 'إنهاء وعرض النتيجة', finish);
  }

  function finish() {
    var E = S.active; if (!E) return;
    stopTimer();
    var correct = 0, perCh = {};
    var answers = E.qs.map(function (it, k) {
      var q = byId[it.id], sel = E.answers[k] || [], ok = isRight(q, sel);
      if (ok) correct++;
      perCh[q.c] = perCh[q.c] || { t: 0, r: 0 };
      perCh[q.c].t++; if (ok) perCh[q.c].r++;
      var st = S.qstats[q.id] || { seen: 0, wrong: 0, streak: 0 };
      st.seen++;
      if (ok) st.streak = (st.streak || 0) + 1; else { st.wrong++; st.streak = 0; st.last = Date.now(); }
      S.qstats[q.id] = st;
      return { id: q.id, order: it.order, sel: sel, ok: ok, flag: !!E.flags[k] };
    });
    var rec = {
      id: 'h' + Date.now(), type: E.type, title: E.title, date: Date.now(),
      dur: Math.round((Date.now() - E.start) / 1000), total: E.qs.length, correct: correct,
      pct: pct(correct, E.qs.length), perCh: perCh, answers: answers
    };
    S.history.push(rec);
    if (S.history.length > 60) S.history = S.history.slice(-60);
    S.active = null;
    save();
    results(rec, true);
  }

  // ---------------- results ----------------
  function message(p) {
    if (p >= 90) return 'مذهلة يا جنى! 🏆 هذا مستوى من يدخل الاختبار وهو مطمئن. عبدالله فخور فيك.';
    if (p >= 80) return 'ممتاز جداً! 🌟 أنتِ فوق درجة النجاح الحقيقية بمسافة آمنة. حافظي على هذا المستوى.';
    if (p >= PASS) return 'نجحتِ! 🎉 تجاوزتِ درجة النجاح الصعبة ' + PASS + '%. راجعي أخطاءك لتصلي إلى 85%.';
    if (p >= 65) return 'قريبة جداً! 💪 هذه الدرجة تنجح في الاختبار الحقيقي (65%)، لكننا نتدرب على الأصعب. راجعي الأخطاء وأعيدي المحاولة.';
    if (p >= 50) return 'بداية جيدة 🌱 ركّزي على الفصول ذات اللون الأحمر أدناه، واستخدمي وضع التدريب الفوري.';
    return 'لا بأس يا جنى 🤍 كل خبير كان مبتدئاً. ابدئي بالتدريب الفوري فصلاً فصلاً، والنتيجة ستتحسن بسرعة. Abdullah Trusts you.';
  }

  function results(rec, fresh) {
    var passed = rec.pct >= PASS;
    var weakest = Object.keys(rec.perCh).map(function (c) { return { c: +c, p: pct(rec.perCh[c].r, rec.perCh[c].t) }; })
      .sort(function (a, b) { return a.p - b.p; })[0];
    var rows = CHAPTERS.filter(function (c) { return rec.perCh[c.n]; }).map(function (c) {
      var d = rec.perCh[c.n], p = pct(d.r, d.t);
      return '<tr><td>' + c.n + '</td><td>' + esc(c.t) + '</td><td>' + d.r + '/' + d.t + '</td><td style="min-width:80px"><span class="bar"><i class="' + barClass(p) + '" style="width:' + p + '%"></i></span><span class="small">' + p + '%</span></td></tr>';
    }).join('');
    var wrongN = rec.answers.filter(function (a) { return !a.ok; }).length;

    render(
      '<div class="card score">' +
        '<div class="ring" style="--p:' + rec.pct + ';--c:' + (passed ? 'var(--ok)' : 'var(--bad)') + '"><div><b>' + rec.pct + '%</b></div></div>' +
        '<div class="verdict ' + (passed ? 'ok' : 'bad') + '">' + (passed ? '✅ ناجحة' : '❌ لم تصلي لدرجة النجاح بعد') + '</div>' +
        '<div class="muted">' + rec.correct + ' صحيحة من ' + rec.total + ' · الوقت ' + fmtTime(rec.dur) + ' · النجاح ' + PASS + '%</div>' +
        '<p class="msg">' + message(rec.pct) + '</p>' +
        (weakest && weakest.p < 100 ? '<p class="small muted">أضعف فصل في هذه المحاولة: <b>الفصل ' + weakest.c + '</b> (' + weakest.p + '%)</p>' : '') +
        '<div class="row" style="justify-content:center;margin-top:10px">' +
          (wrongN ? '<button class="btn" data-act="retrywrong" data-id="' + rec.id + '">🔁 أعيدي الأسئلة الخاطئة (' + wrongN + ')</button>' : '') +
          '<button class="btn ghost" data-go="home">الرئيسية</button>' +
        '</div>' +
      '</div>' +
      '<div class="card"><h3>النتيجة حسب الفصل</h3><table class="brk"><tr><th>#</th><th>الفصل</th><th>صح</th><th>النسبة</th></tr>' + rows + '</table></div>' +
      '<h2>📖 مراجعة الإجابات</h2><div class="filters" id="rf">' +
        '<button data-f="w" class="on">الخاطئة (' + wrongN + ')</button><button data-f="all">الكل</button><button data-f="r">الصحيحة</button><button data-f="flag">المعلَّمة 🚩</button></div>' +
      '<div class="review" id="rv"></div>' + footer(), 'history');

    var f = 'w';
    function paint() {
      var list = rec.answers.map(function (a, k) { a.k = k; return a; }).filter(function (a) {
        return f === 'all' || (f === 'w' && !a.ok) || (f === 'r' && a.ok) || (f === 'flag' && a.flag);
      });
      document.getElementById('rv').innerHTML = list.length ? list.map(reviewCard).join('') : '<div class="card empty">لا توجد أسئلة هنا 👌</div>';
    }
    document.getElementById('rf').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      f = b.getAttribute('data-f');
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      paint();
    });
    paint();
    if (fresh && passed) confetti();
  }

  function reviewCard(a) {
    var q = byId[a.id];
    if (!q) return '';
    var order = a.order || range(q.o.length);
    var opts = order.map(function (oi, k) {
      var cls = 'opt' + (q.a.length > 1 ? ' sq' : '');
      var chosen = a.sel.indexOf(oi) >= 0;
      if (q.a.indexOf(oi) >= 0) cls += ' right'; else if (chosen) cls += ' wrong';
      return '<div class="' + cls + '"><span class="mk">' + (q.a.indexOf(oi) >= 0 ? '✓' : chosen ? '✗' : LETTERS[k]) + '</span><span>' + esc(q.o[oi]) + (chosen ? ' <span class="pill ' + (q.a.indexOf(oi) >= 0 ? 'ok' : 'bad') + '">إجابتك</span>' : '') + '</span></div>';
    }).join('');
    return '<div class="qcard"><div class="qmeta"><span class="qnum">' + (a.k + 1) + '</span><span class="pill">الفصل ' + q.c + '</span>' +
      '<span class="pill ' + (a.ok ? 'ok' : 'bad') + '">' + (a.ok ? 'صحيحة' : a.sel.length ? 'خاطئة' : 'لم تُجب') + '</span></div>' +
      '<div class="qtext">' + esc(q.q) + '</div><div class="opts">' + opts + '</div>' +
      '<div class="explain' + (a.ok ? '' : ' bad') + '"><b>💡 الشرح والتصحيح</b><p style="margin:6px 0 0">' + esc(q.e) + '</p><span class="ref">📖 المصدر: ' + esc(q.r) + '</span></div></div>';
  }

  // ---------------- modal / misc ----------------
  var modalHandler = null;
  function openModal(html, handler) {
    modal.innerHTML = html; modal.hidden = false; modalHandler = handler;
  }
  function closeModal() { modal.hidden = true; modal.innerHTML = ''; modalHandler = null; }
  modal.addEventListener('click', function (e) {
    if (e.target === modal) return closeModal();
    if (modalHandler) modalHandler(e);
  });
  function confirmBox(title, msg, okText, onOk) {
    openModal('<div class="box"><h2>' + title + '</h2><p>' + msg + '</p><div class="row"><button class="btn" data-m="ok" style="flex:1">' + okText + '</button><button class="btn ghost" data-m="no">رجوع</button></div></div>', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var m = b.getAttribute('data-m');
      closeModal();
      if (m === 'ok') onOk();
    });
  }

  function confetti() {
    var box = document.createElement('div');
    box.className = 'confetti';
    var colors = ['#14b8a6', '#f59e0b', '#ec4899', '#6366f1', '#22c55e'];
    for (var i = 0; i < 80; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = 2 + Math.random() * 2.5 + 's';
      p.style.animationDelay = Math.random() * .6 + 's';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 5500);
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jana-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function importData(e) {
    var file = e.target.files[0]; if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.history)) throw new Error('bad');
        S = fillDefaults(d); save(); alert('تمت استعادة البيانات ✅'); history();
      } catch (err) { alert('الملف غير صالح'); }
    };
    r.readAsText(file);
  }

  // ---------------- global events ----------------
  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go && !modal.contains(go)) {
      var v = go.getAttribute('data-go');
      if (document.body.classList.contains('in-exam')) return;
      ({ home: home, chapters: chapters, mistakes: mistakes, tips: tips, history: history })[v]();
      return;
    }
    if (document.body.classList.contains('in-exam') && app.contains(e.target)) { examClick(e); return; }
    var b = e.target.closest('[data-act]');
    if (!b || modal.contains(b)) return;
    var act = b.getAttribute('data-act');
    if (act === 'full') {
      if (S.active) return confirmBox('بدء اختبار جديد؟', 'سيتم إلغاء الاختبار غير المكتمل.', 'ابدئي', function () { startExam({ type: 'full', title: 'اختبار شامل', minutes: FULL_MINUTES }); });
      confirmBox('📝 اختبار شامل', '100 سؤال موزعة على الفصول العشرة مثل الاختبار الحقيقي.<br>الوقت: <b>' + FULL_MINUTES + ' دقيقة</b> · درجة النجاح: <b>' + PASS + '%</b><br>الأسئلة والخيارات مرتبة عشوائياً في كل مرة. بالتوفيق يا جنى 🤍', 'ابدئي الآن', function () {
        startExam({ type: 'full', title: 'اختبار شامل', minutes: FULL_MINUTES });
      });
    } else if (act === 'quick') startExam({ type: 'quick', title: 'تدريب سريع', count: 20, practice: true });
    else if (act === 'chapter') chapterSetup([+b.getAttribute('data-ch')]);
    else if (act === 'multi') multiPicker();
    else if (act === 'resume') showExam();
    else if (act === 'discard') confirmBox('إلغاء الاختبار؟', 'لن تُحفظ نتيجة هذا الاختبار.', 'إلغاء الاختبار', function () { S.active = null; save(); home(); });
    else if (act === 'mist') {
      var ids = mistakeIds();
      startExam({ type: 'mistakes', ids: ids, count: 40, practice: b.getAttribute('data-p') === '1', title: 'مراجعة الأخطاء' });
    } else if (act === 'view') {
      var h = S.history.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
      if (h) results(h, false);
    } else if (act === 'retrywrong') {
      var r = S.history.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
      if (r) startExam({ type: 'mistakes', ids: r.answers.filter(function (a) { return !a.ok; }).map(function (a) { return a.id; }), practice: true, title: 'إعادة الأخطاء' });
    } else if (act === 'export') exportData();
    else if (act === 'reset') confirmBox('مسح كل البيانات؟', 'سيتم حذف السجل وبنك الأخطاء نهائياً من هذا الجهاز.', 'مسح', function () { S = fillDefaults({}); save(); history(); });
  });

  document.addEventListener('keydown', function (e) {
    if (!document.body.classList.contains('in-exam') || !modal.hidden) return;
    var E = S.active; if (!E) return;
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 6) {
      var btn = app.querySelectorAll('[data-opt]')[n - 1];
      if (btn) btn.click();
    } else if (e.key === 'ArrowLeft') { var nx = app.querySelector('[data-x="next"],[data-x="check"]'); if (nx && !nx.disabled) nx.click(); }
    else if (e.key === 'ArrowRight') { var pv = app.querySelector('[data-x="prev"]'); if (pv && !pv.disabled) pv.click(); }
  });

  home();
})();
