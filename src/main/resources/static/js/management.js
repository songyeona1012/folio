(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const today = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    const categories = {
        health: ['건강', 'memo-health.png', 'tape-mint.png', ''],
        subscription: ['구독', 'memo-subscription.png', 'tape-blue.png', 'tapeBlue'],
        relationship: ['교체', 'memo-relationship.png', 'tape-purple.png', 'tapePurple'],
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
    let fluid = localStorage.getItem('folio.fluid') === 'true';
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
        const keys = Object.keys(categories);
        const columns = [el('div', null, 'categoryColumn'), el('div', null, 'categoryColumn')];
        grid.append(...columns);
        keys.forEach(key => {
            const items = rules.filter(r => r.category === key);
            const [name, memo, tape, tapeClass] = categories[key], card = el('article', null,
                'categoryCard');
            const paper = el('img', null, 'memoImage');
            paper.src = '/img/' + memo;
            paper.alt = '';
            const strip = el('img', null, 'categoryTape ' + tapeClass);
            strip.src = '/img/' + tape;
            strip.alt = '';
            const label = el('span', name, 'categoryName');
            const quick = el('button', null, 'quickTapeButton');
            quick.type = 'button';
            quick.dataset.category = key;
            quick.setAttribute('aria-label', name + ' 주기 빠른 추가');
            quick.setAttribute('aria-haspopup', 'dialog');
            quick.onclick = () => openQuick(key);
            const link = el('a', null, 'detailIcon');
            link.href = '/category?category=' + key;
            link.setAttribute('aria-label', name + ' 관리 일정 상세');
            const rows = el('div', null, 'memoRows');
            rows.tabIndex = 0;
            rows.setAttribute('aria-label', name + ' 일정 목록');
            const table = el('table', null, 'memoTable');
            table.setAttribute('aria-label', name + ' 관리 일정');
            const head = el('thead'), heading = el('tr');
            ['이름', '주기', '다음 일정'].forEach(text => {
                const cell = el('th', text); cell.scope = 'col'; heading.append(cell);
            });
            head.append(heading);
            const body = el('tbody');
            items.forEach(r => {
                const row = el('tr');
                [r.title, r.intervalValue + units[r.intervalUnit], displayDate(r.nextDate)].forEach(text => row.append(el('td', text)));
                body.append(row);
            });
            table.append(head, body); rows.append(table);
            if (!items.length) rows.append(el('p', '등록된 일정이 없어요.', 'memoEmpty'));
            card.append(paper, strip, label, quick, link, rows);
            columns[key === 'health' || key === 'relationship' ? 0 : 1].append(card);
        });
        $('emptyCategories').hidden = true;
    }

    let activeEdit = null;
    const displayDate = value => value.replaceAll('-', '.');
    const completion = rule => rule.completionRate == null ? '—' : rule.completionRate + '%';
    async function refreshManagement() {
        await loadRules();
        await Promise.all([loadBrief(), loadChart()]);
    }
    function rulePayload(form, rule) {
        return {title: form.elements.title.value.trim(), category: rule?.category || category,
            startDate: form.elements.startDate.value,
            intervalValue: Number(form.elements.intervalValue.value),
            intervalUnit: form.elements.intervalUnit.value};
    }
    function renderDetail() {
        const [name, memo, tape, tapeClass] = categories[category];
        $('detailCategory').textContent = name;
        $('detailMemo').src = '/img/' + memo;
        $('detailTape').src = '/img/' + tape;
        $('detailTape').className = 'categoryTape ' + tapeClass;
        const list = $('detailList');
        list.replaceChildren();
        const items = rules.filter(r => r.category === category);
        if (!items.length) list.append(el('p', '아직 등록된 일정이 없어요. 위의 + 버튼으로 추가해주세요.', 'muted'));
        items.forEach(r => {
            const row = el('div', null, 'detailRow');
            row.dataset.ruleId = r.id;
            const open = el('button', null, 'detailOpen');
            open.type = 'button';
            open.setAttribute('aria-label', r.title + ' 수정');
            open.append(el('strong', r.title));
            const metadata = el('span', null, 'detailMetadata');
            [['시작일 :', displayDate(r.startDate)], ['주기 :', r.intervalValue + units[r.intervalUnit]],
                ['다음 일정 :', displayDate(r.nextDate)], ['역대 완료도:', completion(r)]].forEach(([label, value]) => {
                const field = el('span', null, 'detailDatum');
                field.append(el('span', label), el('span', value));
                metadata.append(field);
            });
            open.append(metadata);
            open.onclick = () => openInline(r);
            const remove = el('button', null, 'removeRule');
            remove.type = 'button';
            remove.setAttribute('aria-label', r.title + ' 삭제');
            remove.onclick = guarded(async () => {
                if (activeEdit && !await activeEdit.commit()) return;
                if (!confirm('“' + r.title + '”의 반복 등록과 앞으로의 미완료 일정을 삭제할까요? 과거·완료 기록은 남습니다.')) return;
                remove.disabled = true;
                try {
                    await api('/rules/' + r.id, {method: 'DELETE'});
                    status('관리 일정을 삭제했어요.');
                    await refreshManagement();
                } finally { remove.disabled = false; }
            });
            row.append(open, remove);
            list.append(row);
        });
    }
    async function openInline(rule) {
        if (activeEdit && !await activeEdit.commit()) return;
        const row = $('detailList').querySelector('[data-rule-id="' + rule.id + '"]');
        if (!row) return;
        const form = el('form', null, 'inlineRule');
        function input(name, type, value, label) {
            const control = el('input');
            control.name = name; control.type = type; control.value = value;
            control.required = true; control.setAttribute('aria-label', label);
            return control;
        }
        const title = input('title', 'text', rule.title, '관리 이름 수정');
        title.maxLength = 100; title.className = 'inlineTitle';
        const fields = el('div', null, 'detailMetadata');
        const date = input('startDate', 'date', rule.startDate, '시작일 수정');
        date.min = '2000-01-01'; date.max = '2100-12-31';
        const interval = input('intervalValue', 'number', rule.intervalValue, '주기 수정');
        interval.min = 1; interval.max = 365;
        const unit = el('select'); unit.name = 'intervalUnit'; unit.setAttribute('aria-label', '주기 단위 수정');
        Object.entries(units).forEach(([value, label]) => { const option = el('option', label); option.value = value; unit.append(option); });
        unit.value = rule.intervalUnit;
        const cycleField = el('span', null, 'inlineCycle'); cycleField.append(interval, unit);
        [['시작일 :', date], ['주기 :', cycleField], ['다음 일정 :', el('span', displayDate(rule.nextDate))],
            ['역대 완료도:', el('span', completion(rule))]].forEach(([label, control]) => {
            const field = el('label', null, 'detailDatum'); field.append(el('span', label), control); fields.append(field);
        });
        const error = el('p', null, 'inlineError'); error.setAttribute('role', 'alert');
        form.append(title, fields, error);
        row.querySelector('.detailOpen').replaceWith(form);
        row.classList.add('isEditing');
        let pending = null;
        const editor = {form, commit() {
            if (pending) return pending;
            title.setCustomValidity(title.value.trim() ? '' : '관리 이름을 입력해주세요.');
            if (!form.reportValidity()) return Promise.resolve(false);
            const payload = rulePayload(form, rule);
            if (payload.title === rule.title && payload.startDate === rule.startDate &&
                payload.intervalValue === rule.intervalValue && payload.intervalUnit === rule.intervalUnit) {
                activeEdit = null; renderDetail(); return Promise.resolve(true);
            }
            pending = (async () => {
                form.setAttribute('aria-busy', 'true');
                Array.from(form.elements).forEach(control => control.disabled = true);
                try { await api('/rules/' + rule.id, {method: 'PUT', body: JSON.stringify(payload)}); }
                catch (e) {
                    error.textContent = e.message;
                    Array.from(form.elements).forEach(control => control.disabled = false);
                    form.removeAttribute('aria-busy'); pending = null; return false;
                }
                activeEdit = null;
                status('수정 내용을 저장했어요.');
                try { await refreshManagement(); }
                catch { renderDetail(); status('저장은 완료됐지만 화면을 갱신하지 못했어요. 새로고침해주세요.'); }
                return true;
            })();
            return pending;
        }};
        activeEdit = editor;
        title.oninput = () => title.setCustomValidity('');
        form.onsubmit = event => { event.preventDefault(); editor.commit(); };
        form.onkeydown = event => {
            if (event.key === 'Escape' && !pending) { event.preventDefault(); activeEdit = null; renderDetail(); }
            if (event.key === 'Enter') { event.preventDefault(); editor.commit(); }
        };
        title.focus();
    }
    document.addEventListener('click', event => {
        if (activeEdit && !activeEdit.form.contains(event.target) &&
            !event.target.closest('.detailOpen, .removeRule')) activeEdit.commit();
    });
    async function loadBrief() {
        const report = await api('/reports?period=week&date=' + today(), {method: 'POST'});
        renderBrief((report.source === 'AI' ? 'AI 브리핑 · ' : '관리 브리핑 · ') + report.briefing);
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
        const s = await api('/completion-chart?period=' + period + '&date=' + date);
        if (version !== requestVersion) return;
        $('rangeLabel').textContent = s.start + ' ~ ' + s.end;
        $('methodText').textContent = s.method;
        $('chartSummary').textContent =
            `누적 관리 일정 ${s.scheduleCount}건 · 완료율 ${s.completionRate == null ? '자료 없음' : s.completionRate + '%'}`;
        $('reportNotice').textContent = `${Number(date.slice(5, 7))}월 월간 기록지가 도착했습니다. 확인하시겠습니까?`;
        const chart = $('pressureChart');
        const svg = svgElement('svg', {
            viewBox: '0 0 560 320',
            role: 'img',
            'aria-label': s.start + '부터 ' + s.end + '까지 카테고리별 누적 완료율'
        });
        svg.append(svgElement('title', {}, '건강, 구독, 교체, 일상 카테고리별 누적 완료율. 기록이 없는 카테고리와 미래는 선을 표시하지 않습니다.'));
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
        const colors = {health: '#91bd8c', subscription: '#7986da', relationship: '#ef929c', daily: '#dbc766'};
        const series = Object.keys(categories).map(key => ({
            name: categories[key][0], color: colors[key], value: point => point.rates[key]
        }));
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
                    'aria-label': `${point.date} ${line.name} ${value.toFixed(1)}%`
                });
                dot.append(svgElement('title', {},
                    `${point.date} · ${line.name} ${value.toFixed(1)}%`
                ));
                svg.append(dot);
                previous = {
                    x: x(i),
                    y: y(value)
                };
            });
        });
        chart.replaceChildren(svg);
        if (!hasData) chart.append(el('p', '아직 완료율을 계산할 관리 기록이 없어요.', 'chartEmpty'));
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
                `${r.startDate} ~ ${r.endDate} · ${r.source==='AI'?'AI 기록지':'완료 기록 기반 기본 브리핑'}`,
                'reportSource'), el('div', r.content));
        } catch (e) {
            if (version === reportVersion) box.textContent = e.message;
        }
    }
    const scrollAreas = '.memoRows, .detailList, .analysisPage, .editorPage';

    function updateScrollThumb(area) {
        const distance = area.scrollHeight - area.clientHeight;
        const ratio = distance > 0 ? Math.max(0, Math.min(1, area.scrollTop / distance)) : 0;
        area.style.setProperty('--scroll-thumb-position', `${ratio * 100}%`);
    }

    // Position the small image within the native thumb so both ends match the rail.
    document.addEventListener('scroll', event => {
        if (event.target instanceof Element && event.target.matches(scrollAreas)) {
            updateScrollThumb(event.target);
        }
    }, true);
    window.addEventListener('resize', () => {
        document.querySelectorAll(scrollAreas).forEach(updateScrollThumb);
    });

    let quickCategory = 'health';
    let quickSaving = false;
    function openQuick(key) {
        quickCategory = key;
        $('quickForm').reset();
        $('quickHeading').textContent = '새로운 ' + categories[key][0] + ' 주기 추가';
        $('quickForm').style.backgroundImage = 'url("/img/quick-' + key + '.png")';
        $('quickSaveImage').src = '/img/quick-' + key + '-submit.png';
        $('quickSaveImage').alt = categories[key][0] + ' 주기 추가 완료';
        $('quickStart').value = today();
        $('quickInterval').value = 1;
        $('quickError').textContent = '';
        $('quickDialog').showModal();
        $('quickTitle').focus();
    }
    function closeQuick() {
        if (!quickSaving) $('quickDialog').close();
    }
    $('quickClose').onclick = closeQuick;
    $('quickDialog').addEventListener('cancel', event => {
        if (quickSaving) event.preventDefault();
    });
    $('quickDialog').addEventListener('click', event => {
        if (event.target !== $('quickDialog')) return;
        const rect = $('quickDialog').getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) closeQuick();
    });
    $('quickTitle').addEventListener('input', () => $('quickTitle').setCustomValidity(''));
    $('quickForm').onsubmit = async event => {
        event.preventDefault();
        if (quickSaving) return;
        const title = $('quickTitle').value.trim();
        $('quickTitle').setCustomValidity(title ? '' : '관리 이름을 입력해주세요.');
        if (!$('quickForm').reportValidity()) return;
        quickSaving = true;
        $('quickSave').disabled = true;
        $('quickClose').disabled = true;
        $('quickError').textContent = '';
        try {
            await api('/rules', { method: 'POST', body: JSON.stringify({
                title, category: quickCategory, startDate: $('quickStart').value,
                intervalValue: Number($('quickInterval').value),
                intervalUnit: new FormData($('quickForm')).get('quickUnit')
            }) });
        } catch (error) {
            $('quickError').textContent = error.message;
            return;
        } finally {
            quickSaving = false;
            $('quickSave').disabled = false;
            $('quickClose').disabled = false;
        }
        $('quickDialog').close();
        status(categories[quickCategory][0] + ' 주기를 추가했어요. 캘린더에도 반영됐습니다.');
        try {
            await loadRules();
            document.querySelector('.quickTapeButton[data-category="' + quickCategory + '"]')?.focus();
            await Promise.all([loadBrief(), loadChart()]);
        } catch (error) {
            status('등록은 완료됐지만 화면을 새로 불러오지 못했어요. 새로고침해주세요.');
        }
    };

    function setToggle(on) {
        fluid = on;
        document.body.dataset.fluid = String(on);
        localStorage.setItem('folio.fluid', String(on));
        document.querySelectorAll('.fluidChoices button[data-fluid]').forEach(button => {
            button.setAttribute('aria-pressed', String((button.dataset.fluid === 'on') === on));
        });
    }
    document.querySelectorAll('.fluidChoices button[data-fluid]').forEach(button => {
        button.onclick = () => setToggle(button.dataset.fluid === 'on');
    });
    setToggle(fluid);
    if (detail) {
        $('detailAddStart').value = today();
        $('detailAddInterval').value = 1;
        $('detailAddTitle').oninput = () => $('detailAddTitle').setCustomValidity('');
        let adding = false;
        $('detailAddForm').onsubmit = async event => {
            event.preventDefault();
            if (adding || (activeEdit && !await activeEdit.commit())) return;
            const title = $('detailAddTitle');
            title.setCustomValidity(title.value.trim() ? '' : '관리 이름을 입력해주세요.');
            if (!$('detailAddForm').reportValidity()) return;
            adding = true; $('detailAddSave').disabled = true; $('detailAddError').textContent = '';
            try {
                await api('/rules', {method: 'POST', body: JSON.stringify({title: title.value.trim(), category,
                    startDate: $('detailAddStart').value, intervalValue: Number($('detailAddInterval').value),
                    intervalUnit: $('detailAddUnit').value})});
            } catch (e) { $('detailAddError').textContent = e.message; return; }
            finally { adding = false; $('detailAddSave').disabled = false; }
            title.value = ''; title.focus(); status('관리 일정을 추가했어요.');
            try { await refreshManagement(); }
            catch { status('등록은 완료됐지만 화면을 갱신하지 못했어요. 새로고침해주세요.'); }
        };
    }
    {
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
        await Promise.all([loadRules(), loadBrief(), loadChart()]);

    })();
    window.addEventListener('pageshow', event => {
        if (event.persisted) guarded(async () => {
            await loadRules();
            await loadBrief();
            await loadChart();
        })();
    });
})();
