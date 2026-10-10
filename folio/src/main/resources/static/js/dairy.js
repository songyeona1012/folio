(() => {
    'use strict';

    /* ============================================================
       공통
       ============================================================ */
    const $ = id => document.getElementById(id);
    const pad2 = n => String(n).padStart(2, '0');
    const toIso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const shortDate = iso => iso.slice(2).replaceAll('-', '.');      // 2026-10-10 → 26.10.10
    const TYPE_LABEL = {FREEFORM: '자유형', TIMETABLE: '시간 기록형'};

    const now = new Date();
    const TODAY = toIso(now);
    const THIS_YEAR = now.getFullYear();

    const state = {
        year: THIS_YEAR,
        date: TODAY,        // 오른쪽에 열려 있는 일기 날짜
        current: null,      // 서버에 저장된 그 날짜의 일기 (없으면 null)
        openMonth: null,    // 왼쪽에 열려 있는 월 폴더
        dirty: false,       // 저장 안 한 변경이 있는지
        busy: false
    };

    let summaryVersion = 0;
    let loadVersion = 0;

    async function api(path, options = {}) {
        const response = await fetch('/api/dairy' + path, {
            headers: {'Content-Type': 'application/json'},
            ...options
        });
        if (!response.ok) {
            let message = '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
            try {
                const body = await response.json();
                message = body.detail || body.message || message;
            } catch { /* 본문이 없으면 기본 문구 */ }
            throw new Error(message);
        }
        return response.status === 204 ? null : response.json();
    }

    function el(tag, text, cls) {
        const node = document.createElement(tag);
        if (text != null) node.textContent = text;
        if (cls) node.className = cls;
        return node;
    }

    let statusTimer;
    function status(message, isError = false) {
        const box = $('diaryStatus');
        box.textContent = message;
        box.classList.toggle('isError', isError);
        clearTimeout(statusTimer);
        if (message && !isError) statusTimer = setTimeout(() => { box.textContent = ''; }, 2500);
    }

    function confirmDiscard() {
        return !state.dirty || confirm('저장하지 않은 내용이 있어요. 이동하면 지워져요. 계속할까요?');
    }

    function markDirty() {
        state.dirty = true;
    }

    /* ============================================================
       별점 (클릭/키보드로 선택, 같은 별을 다시 누르면 0점으로 취소)
       ============================================================ */
    const starWrap = $('starRating');
    const stars = Array.from(starWrap.querySelectorAll('.star'));

    function paintStars(upTo) {
        stars.forEach(star => star.classList.toggle('filled', Number(star.dataset.value) <= upTo));
    }

    function getRating() {
        return Number(starWrap.dataset.value) || 0;
    }

    function setRating(value) {
        starWrap.dataset.value = String(value);
        $('diaryRatingValue').value = String(value);
        stars.forEach(star => {
            const selected = Number(star.dataset.value) === value;
            star.setAttribute('aria-checked', String(selected));
            star.tabIndex = selected || (value === 0 && star.dataset.value === '1') ? 0 : -1;
        });
        paintStars(value);
    }

    stars.forEach(star => {
        const value = Number(star.dataset.value);
        star.addEventListener('mouseenter', () => paintStars(value));
        star.addEventListener('click', () => {
            setRating(getRating() === value ? 0 : value);
            markDirty();
        });
        star.addEventListener('keydown', event => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                event.preventDefault();
                const next = Math.min(5, getRating() + 1);
                setRating(next); markDirty(); stars[next - 1].focus();
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                event.preventDefault();
                const prev = Math.max(0, getRating() - 1);
                setRating(prev); markDirty(); stars[Math.max(0, prev - 1)].focus();
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setRating(value); markDirty();
            }
        });
    });
    starWrap.addEventListener('mouseleave', () => paintStars(getRating()));

    /* ============================================================
       양식 전환 (자유형 / 시간 기록형)
       ============================================================ */
    const freeformTabBtn = $('freeformTabBtn');
    const timetableTabBtn = $('timetableTabBtn');
    const freeformArea = $('freeformArea');
    const timetableArea = $('timetableArea');

    function getType() {
        return freeformArea.classList.contains('show') ? 'FREEFORM' : 'TIMETABLE';
    }

    function setType(type) {
        const free = type === 'FREEFORM';
        freeformTabBtn.classList.toggle('active', free);
        timetableTabBtn.classList.toggle('active', !free);
        freeformTabBtn.setAttribute('aria-pressed', String(free));
        timetableTabBtn.setAttribute('aria-pressed', String(!free));
        freeformArea.classList.toggle('show', free);
        timetableArea.classList.toggle('show', !free);
    }

    freeformTabBtn.addEventListener('click', () => { setType('FREEFORM'); markDirty(); });
    timetableTabBtn.addEventListener('click', () => { setType('TIMETABLE'); markDirty(); });

    /* ============================================================
       시간 기록형 양식 - 00~23시 (왼쪽 00~11 / 오른쪽 12~23)
       ============================================================ */
    const hourInputs = [];
    (function buildTimetable() {
        const left = $('timetableColLeft');
        const right = $('timetableColRight');
        for (let h = 0; h < 24; h++) {
            const row = el('div', null, 'timetableRow');
            const label = el('label', pad2(h), 'hourLabel');
            const input = el('input');
            input.type = 'text';
            input.name = 'hour_' + pad2(h);
            input.id = 'hour_' + pad2(h);
            input.maxLength = 500;
            label.htmlFor = input.id;
            input.addEventListener('input', markDirty);
            input.addEventListener('keydown', event => {
                // Enter로 다음 시간 칸으로 이동
                if (event.key === 'Enter' && !event.isComposing) {
                    event.preventDefault();
                    hourInputs[Math.min(23, h + 1)].focus();
                }
            });
            hourInputs.push(input);
            row.append(label, input);
            (h < 12 ? left : right).append(row);
        }
    })();

    function readHours() {
        const hours = {};
        hourInputs.forEach((input, h) => {
            const text = input.value.trim();
            if (text) hours[h] = text;
        });
        return hours;
    }

    function fillHours(hours) {
        hourInputs.forEach((input, h) => {
            input.value = (hours && hours[h]) || '';
        });
    }

    $('freeformText').addEventListener('input', markDirty);
    $('diaryPrivate').addEventListener('change', markDirty);

    /* ============================================================
       날짜 선택 → 그 날짜 일기 불러오기
       ============================================================ */
    const dateInput = $('diaryDateInput');
    dateInput.max = TODAY;

    $('diaryDateHint').addEventListener('click', () => {
        dateInput.value = state.date;
        if (typeof dateInput.showPicker === 'function') {
            try { dateInput.showPicker(); return; } catch { /* 지원 안 하면 아래로 */ }
        }
        dateInput.focus();
        dateInput.click();
    });

    dateInput.addEventListener('change', () => {
        const value = dateInput.value;
        if (!value || value === state.date) return;
        if (value > TODAY) {
            status('아직 오지 않은 날의 일기는 쓸 수 없어요.', true);
            dateInput.value = state.date;
            return;
        }
        if (!confirmDiscard()) {
            dateInput.value = state.date;
            return;
        }
        loadDiary(value);
    });

    function renderHeader() {
        const isToday = state.date === TODAY;
        $('diaryDateHint').textContent = '날짜 : ' + shortDate(state.date) + (isToday ? ' (오늘)' : '');
        $('diaryHeadline').textContent = state.current ? '일기 수정' : (isToday ? '일기 바로 작성' : '지난 일기 작성');
        $('diaryDeleteBtn').hidden = !state.current;
    }

    function fillForm(diary) {
        state.current = diary;
        setRating(diary ? diary.rating : 0);
        setType(diary ? diary.type : 'TIMETABLE');
        $('freeformText').value = (diary && diary.content) || '';
        fillHours(diary ? diary.hours : null);
        $('diaryPrivate').checked = !!(diary && diary.isPrivate);
        state.dirty = false;
        renderHeader();
    }

    async function loadDiary(date) {
        const version = ++loadVersion;
        state.date = date;
        renderHeader();
        try {
            const diary = await api('?date=' + date);
            if (version !== loadVersion) return;
            fillForm(diary);
            highlightActiveEntry();
            syncMoodChart();
        } catch (error) {
            if (version === loadVersion) status(error.message, true);
        }
    }

    /* ============================================================
       저장 / 삭제
       ============================================================ */
    $('diarySaveBtn').addEventListener('click', async () => {
        if (state.busy) return;
        const payload = {
            date: state.date,
            rating: getRating(),
            type: getType(),
            content: $('freeformText').value,
            hours: readHours(),
            isPrivate: $('diaryPrivate').checked
        };
        if (!payload.content.trim() && Object.keys(payload.hours).length === 0) {
            status('일기 내용을 한 줄 이상 적어주세요.', true);
            (getType() === 'FREEFORM' ? $('freeformText') : hourInputs[0]).focus();
            return;
        }

        state.busy = true;
        $('diarySaveBtn').disabled = true;
        try {
            const saved = await api('', {method: 'POST', body: JSON.stringify(payload)});
            fillForm(saved);
            status(shortDate(saved.date) + ' 일기를 저장했어요.');
            await refreshLeftPage(Number(saved.date.slice(0, 4)));
        } catch (error) {
            status(error.message, true);
        } finally {
            state.busy = false;
            $('diarySaveBtn').disabled = false;
        }
    });

    $('diaryDeleteBtn').addEventListener('click', async () => {
        if (state.busy || !state.current) return;
        if (!confirm(shortDate(state.current.date) + ' 일기를 삭제할까요? 되돌릴 수 없어요.')) return;
        state.busy = true;
        $('diaryDeleteBtn').disabled = true;
        try {
            const year = Number(state.current.date.slice(0, 4));
            await api('/' + state.current.id, {method: 'DELETE'});
            fillForm(null);
            status('일기를 삭제했어요.');
            await refreshLeftPage(year);
        } catch (error) {
            status(error.message, true);
        } finally {
            state.busy = false;
            $('diaryDeleteBtn').disabled = false;
        }
    });

    // Ctrl+S / Cmd+S 저장
    document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            $('diarySaveBtn').click();
        }
    });

    // 저장 안 하고 페이지를 떠나려 하면 경고
    window.addEventListener('beforeunload', event => {
        if (state.dirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    /* ============================================================
       왼쪽 페이지: 연도 이동 + 기분 그래프 + 월별 폴더
       ============================================================ */
    $('prevYearBtn').addEventListener('click', () => changeYear(state.year - 1));
    $('nextYearBtn').addEventListener('click', () => changeYear(state.year + 1));

    function changeYear(year) {
        if (year > THIS_YEAR) return;
        state.year = year;
        closeMonth();
        loadSummary();
    }

    async function loadSummary() {
        const version = ++summaryVersion;
        $('diaryYearLabel').textContent = state.year;
        $('nextYearBtn').disabled = state.year >= THIS_YEAR;
        try {
            const summary = await api('/summary?year=' + state.year);
            if (version !== summaryVersion) return;
            state.summary = summary;
            renderFolders(summary);
            moodKey = null;
            syncMoodChart();
        } catch (error) {
            if (version === summaryVersion) status(error.message, true);
        }
    }

    /* ============================================================
       기분 그래프: 일기를 쓴 날마다 스틱 하나 (높이 = 별점)
       - 오른쪽에 열린 날짜가 속한 달을 보여줌 (그 해가 아니면 마지막으로 쓴 달)
       - 10일치를 넘으면 옆으로 슬라이드
       - 스틱을 누르면 그 날 일기가 열림
       ============================================================ */
    const MOOD_COLORS = ['#E2E5F1', '#E1ECD5', '#F1ECC9', '#EDDDC7', '#D8E2E8', '#DBD4EE'];
    const MOOD_VISIBLE = 10;
    let moodVersion = 0;
    let moodKey = null;

    function chartMonthFor(summary) {
        const [y, m] = state.date.split('-').map(Number);
        if (y === summary.year) return m;
        if (summary.folders.length) return summary.folders[summary.folders.length - 1].month;
        return Math.max(1, summary.shownMonths);
    }

    function syncMoodChart() {
        if (!state.summary) return;
        const month = chartMonthFor(state.summary);
        const key = state.summary.year + '-' + month;
        if (key !== moodKey) {
            moodKey = key;
            loadMoodChart(state.summary.year, month);
        } else {
            markActiveStick();
        }
    }

    async function loadMoodChart(year, month) {
        const version = ++moodVersion;
        try {
            const diaries = await api(`/month?year=${year}&month=${month}`);
            if (version !== moodVersion) return;
            renderMoodChart(diaries, month);
        } catch (error) {
            if (version === moodVersion) status(error.message, true);
        }
    }

    function renderMoodChart(diaries, month) {
        const chart = $('moodChart');
        const labels = $('moodLabels');
        const track = $('moodTrack');
        chart.replaceChildren();
        labels.replaceChildren();

        $('moodBox').classList.toggle('isEmpty', diaries.length === 0);
        if (!diaries.length) {
            track.style.width = '100%';
            chart.setAttribute('aria-label', `${month}월 기분 그래프: 아직 기록 없음`);
            return;
        }

        const count = diaries.length;
        track.style.width = count > MOOD_VISIBLE ? (count / MOOD_VISIBLE * 100) + '%' : '100%';
        const cols = Math.max(count, MOOD_VISIBLE);       // 스틱 폭은 항상 상자의 1/10
        [chart, labels].forEach(node => {
            node.style.setProperty('--bars', count);
            node.style.setProperty('--cols', cols);
        });

        diaries.forEach((d, i) => {
            const stick = el('button', null, 'moodSlot');
            stick.type = 'button';
            stick.dataset.date = d.date;
            const label = shortDate(d.date) + (d.rating ? ` · 별점 ${d.rating}점` : ' · 별점 없음');
            stick.title = label;
            stick.setAttribute('aria-label', label + ', 일기 열기');

            const bar = el('span', null, 'moodBar' + (d.rating ? '' : ' noRating'));
            if (d.rating) bar.style.height = (d.rating / 5 * 100) + '%';
            bar.style.backgroundColor = MOOD_COLORS[i % MOOD_COLORS.length];
            stick.append(bar);

            stick.addEventListener('click', () => {
                if (d.date === state.date || !confirmDiscard()) return;
                loadDiary(d.date);
            });
            chart.append(stick);
            labels.append(el('span', d.date.slice(8, 10)));
        });

        chart.setAttribute('aria-label', `${month}월 기분 그래프: ` + diaries
            .map(d => `${Number(d.date.slice(8, 10))}일 ${d.rating ? d.rating + '점' : '별점 없음'}`).join(', '));
        markActiveStick(true);
    }

    /* 오른쪽에 열린 날짜의 스틱 강조 + 보이도록 슬라이드 */
    function markActiveStick(scroll = false) {
        let active = null;
        document.querySelectorAll('.moodSlot').forEach(stick => {
            const on = stick.dataset.date === state.date;
            stick.classList.toggle('active', on);
            if (on) active = stick;
        });
        const scroller = $('moodScroll');
        if (!scroll && !active) return;
        requestAnimationFrame(() => {
            if (active) {
                scroller.scrollLeft = active.offsetLeft - (scroller.clientWidth - active.offsetWidth) / 2;
            } else {
                scroller.scrollLeft = scroller.scrollWidth;      // 가장 최근 날짜 쪽
            }
        });
    }

    /* ============================================================
       월 폴더: 일기를 쓴 달만 폴더로 표시
       ============================================================ */
    function renderFolders(summary) {
        const grid = $('folderGrid');
        grid.replaceChildren();
        const empty = $('emptyYear');

        if (summary.shownMonths === 0) {
            empty.textContent = '아직 오지 않은 해예요.';
            empty.hidden = false;
            return;
        }
        if (!summary.folders.length) {
            empty.textContent = '아직 쓴 일기가 없어요. 오른쪽에서 일기를 저장하면 그 달 폴더가 생겨요.';
            empty.hidden = false;
            return;
        }
        empty.hidden = true;

        summary.folders.forEach(m => {
            const folder = el('button', null, 'folderItem hasEntries');
            folder.type = 'button';
            folder.dataset.month = m.month;
            folder.setAttribute('aria-label', `${m.month}월의 기록, 일기 ${m.count}편`);
            const caption = el('span', `${m.month}월의 기록`, 'folderCaption');
            const tab = el('div', null, 'folderTab');
            const body = el('div', null, 'folderBody');
            body.append(el('span', pad2(m.month), 'folderNum'), el('span', m.count + '편', 'folderCount'));
            folder.append(caption, tab, body);
            folder.addEventListener('click', () => openMonth(m.month));
            grid.append(folder);
        });
    }

    /* ============================================================
       폴더 클릭 시: 그 달의 기록지 (일 / 한 줄 요약 / 별점 / 선택)
       ============================================================ */
    let monthDiaries = [];
    const selectedIds = new Set();

    async function openMonth(month) {
        state.openMonth = month;
        selectedIds.clear();
        hideDeleteBubble();
        $('yearView').hidden = true;
        $('monthView').hidden = false;
        $('monthFolderNum').textContent = pad2(month);
        $('monthSheetTitle').textContent = `${state.year}년 ${month}월, 불러오는 중…`;
        $('monthRows').replaceChildren();
        $('monthEmpty').hidden = true;
        updateDeleteButton();
        try {
            const diaries = await api(`/month?year=${state.year}&month=${month}`);
            if (state.openMonth !== month) return;
            monthDiaries = diaries;
            renderMonthRows();
        } catch (error) {
            $('monthSheetTitle').textContent = `${state.year}년 ${month}월`;
            $('monthEmpty').textContent = error.message;
            $('monthEmpty').hidden = false;
        }
    }

    function renderMonthRows() {
        const month = state.openMonth;
        $('monthSheetTitle').textContent = `${state.year}년 ${month}월, ${monthDiaries.length} 개의 기록.`;
        const rows = $('monthRows');
        rows.replaceChildren();
        $('monthEmpty').hidden = monthDiaries.length > 0;
        $('monthEmpty').textContent = '이 달에는 남은 기록이 없어요.';

        // 지금 목록에 없는 선택은 정리
        const ids = new Set(monthDiaries.map(d => d.id));
        [...selectedIds].forEach(id => { if (!ids.has(id)) selectedIds.delete(id); });

        monthDiaries.forEach(d => {
            const tr = el('tr', null, 'monthRow');
            tr.dataset.date = d.date;

            const day = el('td', d.date.slice(8, 10), 'cellDay');

            const summaryCell = el('td', null, 'cellSummary');
            const open = el('button', null, 'summaryBtn');
            open.type = 'button';
            open.textContent = d.preview || '(내용 없음)';
            if (d.isPrivate) open.prepend(el('span', '🔒 ', 'rowLock'));
            open.title = shortDate(d.date) + ' 일기 열기';
            open.addEventListener('click', () => {
                if (d.date === state.date || !confirmDiscard()) return;
                loadDiary(d.date);
            });
            summaryCell.append(open);

            const ratingCell = el('td', null, 'cellRating');
            const starsText = d.rating ? '★'.repeat(d.rating) + '☆'.repeat(5 - d.rating) : '—';
            const starsSpan = el('span', starsText, d.rating ? 'rowStars' : 'rowStars none');
            starsSpan.setAttribute('aria-label', d.rating ? `별점 ${d.rating}점` : '별점 없음');
            ratingCell.append(starsSpan);

            const selectCell = el('td', null, 'cellSelect');
            const check = el('input', null, 'rowCheck');
            check.type = 'checkbox';
            check.checked = selectedIds.has(d.id);
            check.setAttribute('aria-label', shortDate(d.date) + ' 일기 선택');
            check.addEventListener('change', () => {
                if (check.checked) selectedIds.add(d.id); else selectedIds.delete(d.id);
                tr.classList.toggle('isSelected', check.checked);
                hideDeleteBubble();
                updateDeleteButton();
            });
            selectCell.append(check);

            tr.classList.toggle('isSelected', check.checked);
            tr.append(day, summaryCell, ratingCell, selectCell);
            rows.append(tr);
        });
        highlightActiveEntry();
        updateDeleteButton();
    }

    function highlightActiveEntry() {
        document.querySelectorAll('.monthRow').forEach(row => {
            const active = row.dataset.date === state.date;
            row.classList.toggle('active', active);
            row.querySelector('.summaryBtn')?.setAttribute('aria-current', active ? 'true' : 'false');
        });
    }

    function updateDeleteButton() {
        const n = selectedIds.size;
        const button = $('selectDeleteBtn');
        button.disabled = n === 0;
        button.textContent = n ? `선택 삭제 (${n})` : '선택 삭제';
    }

    /* 선택 삭제 → 말풍선 확인 */
    function showDeleteBubble() {
        $('deleteBubble').hidden = false;
        $('deleteNo').focus();
    }

    function hideDeleteBubble() {
        $('deleteBubble').hidden = true;
    }

    $('selectDeleteBtn').addEventListener('click', () => {
        if (!selectedIds.size) return;
        if ($('deleteBubble').hidden) showDeleteBubble(); else hideDeleteBubble();
    });

    $('deleteNo').addEventListener('click', () => {
        hideDeleteBubble();
        $('selectDeleteBtn').focus();
    });

    $('deleteYes').addEventListener('click', async () => {
        if (state.busy || !selectedIds.size) return;
        const ids = [...selectedIds];
        state.busy = true;
        $('deleteYes').disabled = true;
        try {
            const query = ids.map(id => 'ids=' + encodeURIComponent(id)).join('&');
            const result = await api('?' + query, {method: 'DELETE'});
            hideDeleteBubble();
            if (state.current && ids.includes(state.current.id)) fillForm(null);
            selectedIds.clear();
            status(`일기 ${result ? result.deleted : ids.length}편을 삭제했어요.`);
            await refreshLeftPage(state.year);
        } catch (error) {
            status(error.message, true);
        } finally {
            state.busy = false;
            $('deleteYes').disabled = false;
        }
    });

    $('monthView').addEventListener('keydown', event => {
        if (event.key === 'Escape' && !$('deleteBubble').hidden) {
            hideDeleteBubble();
            $('selectDeleteBtn').focus();
        }
    });

    function closeMonth() {
        state.openMonth = null;
        selectedIds.clear();
        hideDeleteBubble();
        $('monthView').hidden = true;
        $('yearView').hidden = false;
    }

    $('monthBackBtn').addEventListener('click', closeMonth);

    /* 저장/삭제 후 왼쪽 갱신 (다른 해 일기를 저장했으면 그 해로 이동) */
    async function refreshLeftPage(year) {
        if (year !== state.year) {
            state.year = year;
            closeMonth();
        }
        await loadSummary();
        if (state.openMonth != null) await openMonth(state.openMonth);
    }

    /* ============================================================
       도움말
       ============================================================ */
    $('diaryHelpRow').addEventListener('click', () => {
        const help = $('diaryHelpText');
        help.hidden = !help.hidden;
        $('diaryHelpRow').setAttribute('aria-expanded', String(!help.hidden));
    });

    /* ============================================================
       시작: ?date=2026-10-01 로 들어오면 그 날짜, 아니면 오늘
       ============================================================ */
    const queryDate = new URLSearchParams(location.search).get('date');
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(queryDate || '') && queryDate <= TODAY ? queryDate : TODAY;
    state.year = Number(startDate.slice(0, 4));

    setRating(0);
    setType('TIMETABLE');
    loadSummary();
    loadDiary(startDate);
})();
