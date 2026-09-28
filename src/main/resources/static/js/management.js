(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const today = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    const categories = {
        health: ['건강', 'memo-health.png', 'tape-blue.png', ''],
        subscription: ['구독', 'memo-subscription.png', 'tape-small-blue.png', 'tapeBlue'],
        relationship: ['교제', 'memo-relationship.png', 'tape-purple.png', 'tapePurple'],
        daily: ['일상', 'memo-daily.png', 'tape-green.png', 'tapeOlive']
    };
    const units = {
        DAY: '일',
        WEEK: '주',
        MONTH: '개월',
        YEAR: '년'
    };
    const detail = document.body.dataset.view === 'detail';
    let category = new URLSearchParams(location.search).get('category') || 'health';
    if (!categories[category]) category = 'health';
    let rules = [],
        period = 'week',
        requestVersion = 0,
        reportVersion = 0;

    function el(tag, text, cls) {
        const e = document.createElement(tag);
        if (text != null) e.textContent = text;
        if (cls) e.className = cls;
        return e;
    }

    function status(message) {
        $('appStatus').textContent = message;
    }
    async function api(path, options = {}) {
        const response = await fetch('/api/management' + path, {
            headers: {
                'Content-Type': 'application/json'
            },
            ...options
        });
        if (!response.ok) {
            let message = '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
            try {
                const e = await response.json();
                message = e.detail || e.message || message;
            } catch {}
            throw new Error(message);
        }
        return response.status === 204 ? null : response.json();
    }

    function guarded(fn) {
        return async (...args) => {
            try {
                await fn(...args);
            } catch (e) {
                status(e.message);
            }
        };
    }

    function cycle(r) {
        return `${r.intervalValue}${units[r.intervalUnit]}마다`;
    }
    async function loadRules() {
        rules = await api('/rules');
        detail ? renderDetail() : renderCards();
    }

    function renderCards() {
        const grid = $('categoryGrid');
        grid.replaceChildren();
        const keys = Object.keys(categories).sort((a, b) => (rules.find(r => r.category === a)
            ?.cycleDays ?? Infinity) - (rules.find(r => r.category === b)?.cycleDays ?? Infinity));
        keys.forEach(key => {
            const items = rules.filter(r => r.category === key);
            if (!$('showEmpty').checked && !items.length) return;
            const [name, memo, tape, tapeClass] = categories[key], card = el('article', null,
                'categoryCard');
            const paper = el('img', null, 'memoImage');
            paper.src = '/img/' + memo;
            paper.alt = '';
            const strip = el('img', null, 'categoryTape ' + tapeClass);
            strip.src = '/img/' + tape;
            strip.alt = '';
            const label = el('span', name, 'categoryName');
            const link = el('a', '☰', 'detailIcon');
            link.href = '/category?category=' + key;
            link.setAttribute('aria-label', name + ' 관리 일정 상세');
            const rows = el('div', null, 'memoRows');
            rows.tabIndex = 0;
            rows.setAttribute('aria-label', name + ' 일정 목록');
            if (!items.length) rows.append(el('p', '등록된 일정이 없어요.'));
            items.forEach(r => {
                const row = el('div', null, 'memoRow');
                row.append(el('strong', r.title), el('small', cycle(r) + ' · 다음 ' + r
                    .nextDate));
                rows.append(row);
            });
            card.append(paper, strip, label, link, rows);
            grid.append(card);
        });
        $('emptyCategories').hidden = !!grid.children.length;
        grid.style.gridTemplateRows = grid.children.length > 2 ? 'repeat(2,minmax(0,1fr))' :
            'minmax(0,1fr)';
    }

    function renderDetail() {
        const [name, memo, tape, tapeClass] = categories[category];
        $('detailCategory').textContent = name;
        $('detailMemo').src = '/img/' + memo;
        $('detailTape').src = '/img/' + tape;
        $('detailTape').className = 'categoryTape ' + tapeClass;
        document.querySelectorAll('.categoryLinks a').forEach(a => {
            if (a.href.endsWith('category=' + category)) a.setAttribute('aria-current', 'page');
        });
        const list = $('detailList');
        list.replaceChildren();
        const items = rules.filter(r => r.category === category);
        if (!items.length) list.append(el('p', '아직 등록된 일정이 없어요. 아래에서 관리 일정을 등록해주세요.', 'muted'));
        items.forEach(r => {
            const row = el('div', null, 'detailRow'),
                open = el('button', null, 'detailOpen');
            open.type = 'button';
            open.append(el('strong', r.title), el('small',
                `시작일: ${r.startDate}　주기: ${cycle(r)}\n다음 일정: ${r.nextDate}`));
            open.onclick = () => openEditor(r);
            const remove = el('button', '−', 'removeRule');
            remove.type = 'button';
            remove.setAttribute('aria-label', r.title + ' 삭제');
            remove.onclick = guarded(async () => {
                if (!confirm(
                        `“${r.title}”의 반복 등록과 앞으로의 미완료 일정을 삭제할까요? 과거·완료 기록은 남습니다.`))
                    return;
                remove.disabled = true;
                try {
                    await api('/rules/' + r.id, {
                        method: 'DELETE'
                    });
                    if ($('ruleId').value === String(r.id)) $('ruleForm').hidden =
                        true;
                    await loadRules();
                    await loadBrief();
                    status('관리 일정을 삭제했어요.');
                } finally {
                    remove.disabled = false;
                }
            });
            row.append(open, remove);
            list.append(row);
        });
    }

    function openEditor(r) {
        $('ruleForm').hidden = false;
        $('editorTitle').textContent = r ? '관리 일정 수정' : '관리 일정 등록';
        $('ruleId').value = r?.id || '';
        $('ruleTitle').value = r?.title || '';
        $('ruleCategory').value = r?.category || category;
        $('ruleStart').value = r?.startDate || today();
        $('ruleInterval').value = r?.intervalValue || 1;
        $('ruleUnit').value = r?.intervalUnit || 'MONTH';
        $('formStatus').textContent = '';
        $('ruleTitle').focus();
        $('calendarLink').href = '/main?date=' + (r?.nextDate || today());
    }
    async function loadBrief() {
        const summary = await api('/analytics?period=week&date=' + today());
        $('weeklyBrief').textContent = '기본 분석 · ' + summary.briefing.replace('이 기간의', '이번 주의');
        const report = await api('/reports?period=week&date=' + today(), {
            method: 'POST'
        });
        if (report.source === 'AI' && report.briefing) $('weeklyBrief').textContent = 'AI 브리핑 · ' +
            report.briefing;
    }
    async function loadChart() {
        const version = ++requestVersion,
            date = $('analysisDate').value;
        if (!date) return;
        const s = await api('/analytics?period=' + period + '&date=' + date);
        if (version !== requestVersion) return;
        $('rangeLabel').textContent = s.start + ' ~ ' + s.end;
        $('methodText').textContent = s.method;
        $('chartSummary').textContent = s.average == null ? '기록을 추가하면 압박감 흐름을 볼 수 있어요.' :
            `평균 ${s.average}점 · 일정 ${s.scheduleCount}건 · 일기 ${s.diaryCount}일 · 달성률 ${s.completionRate==null?'자료 없음':s.completionRate+'%'}`;
        const chart = $('pressureChart');
        chart.replaceChildren();
        s.points.forEach((p, i) => {
            const column = el('div', null, 'chartColumn');
            const label =
                `${p.date}: ${p.score==null?'기록 없음':p.score+'점'}, 일정 ${p.schedules}건${p.forecast?', 미래 계획':''}`;
            column.title = label;
            column.tabIndex = 0;
            column.setAttribute('aria-label', label);
            if (p.score != null) {
                const bar = el('div', null, 'chartFill' + (p.forecast ? ' forecast' : ''));
                bar.style.height = Math.max(1, p.score) + '%';
                column.append(bar);
            } else column.append(el('span', '·', 'muted'));
            if (period !== 'month' || i % 5 === 0) column.append(el('small', period ===
                'year' ? String(Number(p.date.slice(5, 7))) + '월' : String(Number(p
                    .date.slice(8)))));
            chart.append(column);
        });
    }
    async function showReport(kind) {
        const version = ++reportVersion,
            box = $('reportResult');
        box.textContent = '기록을 분석하고 있어요…';
        try {
            const r = await api('/reports?period=' + kind + '&date=' + $('analysisDate').value +
                '&retry=true', {
                    method: 'POST'
                });
            if (version !== reportVersion) return;
            box.replaceChildren(el('span',
                `${r.startDate} ~ ${r.endDate} · ${r.source==='AI'?'AI 기록지':'기본 분석 · AI 연결 없음 또는 기록 부족'}`,
                'reportSource'), el('div', r.content));
        } catch (e) {
            if (version === reportVersion) box.textContent = e.message;
        }
    }
    const saved = localStorage.getItem('folio.showEmpty');
    $('showEmpty').checked = saved !== 'false';

    function setToggle() {
        const on = $('showEmpty').checked;
        $('showEmpty').nextElementSibling.textContent = on ? '켜기' : '끄기';
        localStorage.setItem('folio.showEmpty', String(on));
        if (!detail) renderCards();
    }
    $('showEmpty').onchange = setToggle;
    setToggle();
    if (detail) {
        $('addRule').onclick = () => openEditor(null);
        $('closeEditor').onclick = () => $('ruleForm').hidden = true;
        $('ruleForm').onsubmit = guarded(async event => {
            event.preventDefault();
            const button = $('saveRule');
            button.disabled = true;
            try {
                const id = $('ruleId').value;
                await api('/rules' + (id ? '/' + id : ''), {
                    method: id ? 'PUT' : 'POST',
                    body: JSON.stringify({
                        title: $('ruleTitle').value,
                        category: $('ruleCategory').value,
                        startDate: $('ruleStart').value,
                        intervalValue: Number($('ruleInterval').value),
                        intervalUnit: $('ruleUnit').value
                    })
                });
                category = $('ruleCategory').value;
                history.replaceState(null, '', '/category?category=' + category);
                await loadRules();
                await loadBrief();
                $('ruleForm').hidden = true;
                status('저장했어요. 캘린더에도 반복 일정이 반영됐습니다.');
            } finally {
                button.disabled = false;
            }
        });
    } else {
        $('analysisDate').value = today();
        $('analysisDate').onchange = guarded(async () => {
            ++reportVersion;
            $('reportResult').replaceChildren();
            await loadChart();
        });
        document.querySelectorAll('[data-period]').forEach(b => b.onclick = guarded(async () => {
            period = b.dataset.period;
            document.querySelectorAll('[data-period]').forEach(x => {
                x.classList.toggle('active', x === b);
                x.setAttribute('aria-pressed', String(x === b));
            });
            await loadChart();
        }));
        document.querySelectorAll('[data-report]').forEach(b => b.onclick = () => showReport(b.dataset
            .report));
    }
    guarded(async () => {
        await Promise.all([loadRules(), loadBrief(), ...(detail ? [] : [loadChart()])]);
        if (!detail) await showReport('week');
    })();
    window.addEventListener('pageshow', event => {
        if (event.persisted) guarded(async () => {
            await loadRules();
            await loadBrief();
            if (!detail) await loadChart();
        })();
    });
})();
