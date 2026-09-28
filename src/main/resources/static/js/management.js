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
            const remove = el('button', null, 'removeRule');
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
        renderBrief('기본 분석 · ' + summary.briefing.replace('이 기간의', '이번 주의'));
        const report = await api('/reports?period=week&date=' + today(), {
            method: 'POST'
        });
        if (report.source === 'AI' && report.briefing) renderBrief('AI 브리핑 · ' + report.briefing);
    }

    function renderBrief(text) {
        const parts = text.split(/(여유)/g);
        $('weeklyBrief').replaceChildren(...parts.map(part => part === '여유' ?
            el('span', part, 'relaxedWord') : document.createTextNode(part)));
    }

    function svgElement(tag, attributes = {}, text) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
        if (text != null) node.textContent = text;
        return node;
    }

    async function loadChart() {
        const version = ++requestVersion,
            date = $('analysisDate').value;
        if (!date) return;
        const s = await api('/analytics?period=' + period + '&date=' + date);
        if (version !== requestVersion) return;
        $('rangeLabel').textContent = s.start + ' ~ ' + s.end;
        $('methodText').textContent = s.method;
        $('chartSummary').textContent =
            `일정 ${s.scheduleCount}건 · 달성률 ${s.completionRate == null ? '자료 없음' : s.completionRate + '%'}`;
        $('reportNotice').textContent = `${Number(date.slice(5, 7))}월 월간 기록지가 도착했습니다. 확인하시겠습니까?`;
        const chart = $('pressureChart');
        const svg = svgElement('svg', {
            viewBox: '0 0 560 320',
            role: 'img',
            'aria-label': s.start + '부터 ' + s.end + '까지 관리 달성 현황'
        });
        svg.append(svgElement('title', {}, '달성률, 일정 혼잡도, 압박감 추정. 값이 없는 날짜는 선을 연결하지 않습니다.'));
        const x = i => 38 + i * 506 / Math.max(1, s.points.length - 1);
        const y = value => 282 - Math.max(0, Math.min(100, value)) * 2.6;
        for (let value = 0; value <= 100; value += 20) {
            svg.append(svgElement('line', {
                x1: 38,
                x2: 544,
                y1: y(value),
                y2: y(value),
                stroke: '#e3dfdb',
                'stroke-width': 0.7
            }));
            svg.append(svgElement('text', {
                x: 28,
                y: y(value) + 4,
                'text-anchor': 'end'
            }, value));
        }
        s.points.forEach((point, i) => {
            if (period === 'month' && i % 5 !== 0 && i !== s.points.length - 1) return;
            svg.append(svgElement('line', {
                x1: x(i),
                x2: x(i),
                y1: 22,
                y2: 282,
                stroke: '#eeebe7',
                'stroke-width': 0.6
            }));
            svg.append(svgElement('text', {
                x: x(i),
                y: 305,
                'text-anchor': 'middle'
            }, period === 'year' ? point.date.slice(5, 7) : point.date.slice(8,
                10)));
        });
        const series = [{
                name: '달성률',
                color: '#7986da',
                value: p => !p.forecast && p.schedules > 0 ? p.completed / p.schedules * 100 :
                    null
            },
            {
                name: '일정 혼잡도',
                color: '#91bd8c',
                value: p => p.schedules > 0 ? Math.min(100, p.schedules / (period === 'year' ?
                    new Date(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)), 0)
                    .getDate() : 1) / 6 * 100) : null
            },
            {
                name: '압박감 추정',
                color: '#ef929c',
                value: p => p.score
            }
        ];
        let hasData = false;
        series.forEach(line => {
            let previous = null;
            s.points.forEach((point, i) => {
                const value = line.value(point);
                if (value == null) {
                    previous = null;
                    return;
                }
                hasData = true;
                if (previous) svg.append(svgElement('line', {
                    x1: previous.x,
                    y1: previous.y,
                    x2: x(i),
                    y2: y(value),
                    stroke: line.color,
                    'stroke-width': 1.8,
                    'stroke-dasharray': point.forecast ? '5 4' : 'none'
                }));
                const dot = svgElement('circle', {
                    cx: x(i),
                    cy: y(value),
                    r: 2.5,
                    fill: line.color,
                    tabindex: 0,
                    'aria-label': `${point.date} ${line.name} ${value.toFixed(1)}${point.forecast ? ', 미래 계획' : ''}`
                });
                dot.append(svgElement('title', {},
                    `${point.date} · ${line.name} ${value.toFixed(1)}${point.forecast ? ' (미래 계획)' : ''}`
                    ));
                svg.append(dot);
                previous = {
                    x: x(i),
                    y: y(value)
                };
            });
        });
        chart.replaceChildren(svg);
        if (!hasData) chart.append(el('p', '일정을 등록하면 그래프가 표시됩니다.', 'chartEmpty'));
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
        function closeChoice() {
            $('reportChoice').hidden = true;
            $('reportNotice').setAttribute('aria-expanded', 'false');
        }
        $('reportNotice').onclick = () => {
            const open = $('reportChoice').hidden;
            $('reportChoice').hidden = !open;
            $('reportNotice').setAttribute('aria-expanded', String(open));
            if (open) $('reportYes').focus();
        };
        $('reportNo').onclick = () => {
            closeChoice();
            $('reportNotice').focus();
        };
        $('reportYes').onclick = () => {
            closeChoice();
            $('reportSection').hidden = false;
            $('reportSection').focus();
            $('reportSection').scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            showReport('month');
        };
        $('closeReport').onclick = () => {
            $('reportSection').hidden = true;
            $('reportNotice').focus();
        };
        $('analysisDate').value = today();
        $('analysisDate').onchange = guarded(async () => {
            ++reportVersion;
            $('reportResult').replaceChildren();
            $('reportSection').hidden = true;
            closeChoice();
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

    })();
    window.addEventListener('pageshow', event => {
        if (event.persisted) guarded(async () => {
            await loadRules();
            await loadBrief();
            if (!detail) await loadChart();
        })();
    });
})();
