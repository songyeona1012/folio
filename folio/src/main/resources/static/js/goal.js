/* =========================================================
   goal.js — 목표 페이지
   - 저장 버튼 없이 인라인 편집: 값을 고치면 잠깐 뒤에 자동으로 저장됩니다.
   - 목록/저장/삭제는 /api/goals (GoalApiController)와 통신합니다.
   ========================================================= */
(() => {
    "use strict";

    const API_URL = "/api/goals";
    const AUTOSAVE_DELAY = 700;      // 마지막 입력 후 이 시간(ms)이 지나면 저장
    const RETRY_DELAY = 4000;        // 네트워크/서버 오류 시 다시 시도하는 간격(ms)
    const MENU_CLOSE_DELAY = 250;    // 진도표 메뉴: 마우스가 벗어난 뒤 사라지기까지 (대각선 이동 등을 봐주는 시간)
    const HOLD_MS = 350;             // 표 이름을 이만큼 누르고 있으면 순서 바꾸기가 시작된다 (그보다 짧으면 이름 수정)
    const HOLD_TOLERANCE = 6;        // 누르는 동안 이 거리(px) 안에서만 "그대로 누름"으로 본다
    const PROGRESS_MAX = 100;        // 진도표 수의 개수 최대
    const PROGRESS_MAX_COLS = 12;    // 진도표 열 최대
    const NAME_MAX = 30;             // 표 이름 최대 글자 수
    const SVG_NS = "http://www.w3.org/2000/svg";

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const cloneFirst = (template) => template.content.firstElementChild.cloneNode(true);
    const pad2 = (n) => String(n).padStart(2, "0");

    /* ---------- 요소 ---------- */
    const form = $("#goalForm");
    const saveStatus = $("#saveStatus");
    const goalList = $("#goalList");
    const newGoalBtn = $("#newGoalBtn");
    const deleteGoalsBtn = $("#deleteSelectedGoalsBtn");

    const goalCardTemplate = $("#goalCardTemplate");
    const noteTemplate = $("#noteTemplate");
    const formTemplate = $("#progressFormTemplate");
    const noteItems = $("#noteItems");
    const progressList = $("#progressList");
    const itemScroll = $(".item-scroll");
    const clearNotesBtn = $("#clearNotesBtn");

    const startInput = form.elements.startDate;
    const endInput = form.elements.endDate;
    const ddayCount = $("#ddayCount");
    const ddayHint = $("#ddayHint");

    const chatMessages = $("#chatMessages");
    const aiPrompt = $("#aiPrompt");

    /* ---------- 상태 ---------- */
    let goals = [];
    let activeGoalId = null;  // null이면 "아직 저장 전인 새 목표"

    let saveTimer = null;     // 자동 저장 대기 타이머
    let savePromise = null;   // 진행 중인 저장 요청
    let dirty = false;        // 아직 서버에 못 보낸 변경이 있는가

    /* ---------- 공통 도우미 ---------- */
    async function request(url, options = {}) {
        const response = await fetch(url, {
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            ...options,
        });

        if (!response.ok) {
            let message = "요청을 처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.";
            try {
                const body = await response.json();
                if (body && body.message) message = body.message;
            } catch (_) { /* 본문이 JSON이 아니면 기본 문구 사용 */ }

            const error = new Error(message);
            error.status = response.status;
            throw error;
        }
        return response.status === 204 ? null : response.json();
    }

    // 서버/브라우저 시간대 차이로 하루 밀리는 일이 없도록 toISOString()을 쓰지 않는다
    function todayString() {
        const d = new Date();
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    function formatDate(value) {
        if (!value) return "미정";
        const [y, m, d] = value.split("-");
        return y && m && d ? `${y.slice(-2)}.${m}.${d}` : value;
    }

    function formatUpdatedAt(value) {
        // LocalDateTime 문자열의 마이크로초(6자리)는 3자리로 잘라 파싱 오류를 막는다
        const updated = new Date(String(value || "").replace(/(\.\d{3})\d+/, "$1"));
        if (!value || Number.isNaN(updated.getTime())) return "방금 저장";

        const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const days = Math.round((dayStart(new Date()) - dayStart(updated)) / 86400000);
        return days <= 0 ? "오늘" : `${days}일 전`;
    }

    function createFace() {
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("class", "face");
        svg.setAttribute("aria-hidden", "true");
        const use = document.createElementNS(SVG_NS, "use");
        use.setAttribute("href", "#icon-face");
        svg.appendChild(use);
        return svg;
    }

    function setStatus(text, state = "") {
        saveStatus.textContent = text;
        saveStatus.dataset.state = state;
    }

    /* ---------- 종이: 책 밖(화면 오른쪽 끝)까지 빠져나오게 ---------- */
    // 종이의 원래 오른쪽 끝(오른쪽 페이지 안쪽)부터 화면 오른쪽 끝까지의 거리를 --goal-bleed 로 채운다.
    function updatePaperBleed() {
        const host = form.parentElement;
        if (!host) return;
        const style = getComputedStyle(host);
        const contentRight = host.getBoundingClientRect().right
            - parseFloat(style.paddingRight || "0") - parseFloat(style.borderRightWidth || "0");
        const bleed = Math.max(0, document.documentElement.clientWidth - contentRight);
        form.style.setProperty("--goal-bleed", `${Math.round(bleed)}px`);
    }

    window.addEventListener("resize", updatePaperBleed);
    if ("ResizeObserver" in window && form.parentElement) {
        new ResizeObserver(updatePaperBleed).observe(form.parentElement);
    }

    /* ---------- 날짜 (yy.mm.dd 숫자 입력) ---------- */
    // yy는 2000년대로 본다. 존재하지 않는 날짜(2월 30일 등)는 null.
    function toIso(yy, mm, dd) {
        const y = 2000 + Number(yy);
        const m = Number(mm);
        const d = Number(dd);
        if (!Number.isInteger(y) || m < 1 || m > 12 || d < 1) return null;
        if (d > new Date(y, m, 0).getDate()) return null;
        return `${y}-${pad2(m)}-${pad2(d)}`;
    }

    function parseShortDate(text) {
        const match = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(String(text).trim());
        return match ? toIso(match[1], match[2], match[3]) : null;
    }

    function formatShortDate(iso) {
        if (!iso) return "";
        const [y, m, d] = iso.split("-");
        return `${y.slice(-2)}.${m}.${d}`;
    }

    function setShortDate(input, iso) {
        input.value = formatShortDate(iso);
        input.dataset.valid = iso || "";
    }

    // 입력 중인 값이 아직 덜 쓴 날짜면, 마지막으로 완성했던 값을 쓴다 (저장하다가 날짜가 사라지지 않게)
    function readShortDate(input) {
        const text = input.value.trim();
        if (!text) return null;
        return parseShortDate(text) ?? (input.dataset.valid || null);
    }

    function bindDateMask(input) {
        input.addEventListener("input", () => {
            const digits = input.value.replace(/\D/g, "").slice(0, 6);
            let out = digits.slice(0, 2);
            if (digits.length > 2) out += `.${digits.slice(2, 4)}`;
            if (digits.length > 4) out += `.${digits.slice(4, 6)}`;
            if (input.value !== out) input.value = out;

            const iso = parseShortDate(out);
            if (iso) input.dataset.valid = iso;
            else if (!out) input.dataset.valid = "";
        });

        // 작성 구역을 벗어나면 마무리: 덜 쓴 값은 마지막 완성값으로 되돌린다
        input.addEventListener("blur", () => {
            if (!input.value) {
                input.dataset.valid = "";
            } else if (!parseShortDate(input.value)) {
                input.value = formatShortDate(input.dataset.valid);
            }
        });
    }

    /* ---------- D-day 상자: D-day, 총 횟수, 진행도 ---------- */
    function daysUntil(iso) {
        const [ty, tm, td] = todayString().split("-").map(Number);
        const [ey, em, ed] = iso.split("-").map(Number);
        return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(ty, tm - 1, td)) / 86400000);
    }

    // 시작일과 종료일을 모두 센 날 수 (예: 10.01 ~ 11.14 → 45일)
    function inclusiveDays(startIso, endIso) {
        const [sy, sm, sd] = startIso.split("-").map(Number);
        const [ey, em, ed] = endIso.split("-").map(Number);
        const days = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1;
        return days >= 1 ? days : null;
    }

    // 학습 빈도 글자를 읽는다: 매일 / 하루 N번 / 주 N회 / 월 N회 / 격일. 못 읽으면 null.
    function parseFrequency(text) {
        const t = String(text).replace(/\s+/g, "");
        let m = /(?:매일|하루(?:에)?)(\d+)(?:회|번)/.exec(t);
        if (m && Number(m[1]) >= 1) return { perDay: Number(m[1]) };
        if (/매일|날마다/.test(t)) return { perDay: 1 };
        if (/격일|이틀에(?:한번|1번|1회)/.test(t)) return { perDay: 0.5 };
        m = /(?:주|일주일에?)(\d+)(?:회|번)/.exec(t);
        if (m && Number(m[1]) >= 1) return { perWeek: Math.min(7, Number(m[1])) };
        m = /(?:월|한달에?)(\d+)(?:회|번)/.exec(t);
        if (m && Number(m[1]) >= 1) return { perMonth: Number(m[1]) };
        return null;
    }

    // 총 횟수: 매일 → 날 수, 주 N회 → 날 수 × N ÷ 7 (내림), 월 N회 → 날 수 × N ÷ 30 (내림). 최소 1.
    function totalSessions(plan, days) {
        const raw = plan.perDay !== undefined ? days * plan.perDay
            : plan.perWeek !== undefined ? (days * plan.perWeek) / 7
                : (days * plan.perMonth) / 30;
        return Math.max(1, Math.floor(raw));
    }

    // 완료 횟수: "오늘의 공부 한 줄 리뷰"를 쓴 날의 수 (같은 날 여러 개를 써도 1번)
    function completedSessions() {
        const days = new Set();
        let undated = 0;
        $$(".note-row", noteItems).forEach((row) => {
            if (!$(".review-text", row).value.trim()) return;
            const date = readReviewDate(row);
            if (date) days.add(date);
            else undated += 1;
        });
        return days.size + undated;
    }

    // 완료한 칸: 완료 횟수만큼 앞 번호부터 초록색
    function paintProgressDone(done) {
        $$(".progress-block", progressList).forEach((block) => {
            $$(".progress-cell:not(.is-empty)", block).forEach((cell) => {
                cell.classList.toggle("is-done", Number(cell.dataset.n) <= done);
            });
        });
    }

    function updateDday() {
        const end = readShortDate(endInput);
        let text = "D - 00";
        if (end) {
            const diff = daysUntil(end);
            text = diff > 0 ? `D - ${pad2(diff)}` : diff === 0 ? "D - DAY" : `D + ${pad2(-diff)}`;
        }
        ddayCount.textContent = text;

        const done = completedSessions();
        paintProgressDone(done);

        ddayHint.classList.remove("is-progress");
        const frequency = form.elements.goalFrequency.value.trim();
        if (!frequency) {
            ddayHint.textContent = "학습 빈도를 설정해 주세요.\n학습 횟수가 표시됩니다!";
            return;
        }
        const plan = parseFrequency(frequency);
        if (!plan) {
            ddayHint.textContent = "‘매일’, ‘주 3회’처럼\n적으면 총 횟수가 계산돼요.";
            return;
        }
        const start = readShortDate(startInput);
        const days = start && end ? inclusiveDays(start, end) : null;
        if (!days) {
            ddayHint.textContent = "기간을 입력하면\n총 횟수가 계산돼요.";
            return;
        }
        ddayHint.textContent = `진행도 ${done} / ${totalSessions(plan, days)}`;
        ddayHint.classList.add("is-progress");
    }

    /* ---------- 왼쪽: 목표 목록 ---------- */
    function renderGoals() {
        goalList.replaceChildren();

        if (goals.length === 0) {
            const empty = document.createElement("p");
            empty.className = "goal-empty";
            empty.textContent = "아직 작성한 목표가 없어요.\n오른쪽에 바로 적어 보세요. 자동으로 저장돼요.";
            goalList.appendChild(empty);
        } else {
            goals.forEach((goal) => goalList.appendChild(createGoalRow(goal)));
        }

        markActiveCard();
        syncDeleteGoalsButton();
    }

    // 카드 색은 목표를 만들 때 서버가 무작위로 정해서 저장한다. 그 기능 이전에 만든 목표는 번호로 정한다.
    function cardColor(goal) {
        const saved = String(goal.cardColor || "").toLowerCase();
        if (saved === "yellow" || saved === "pink") return saved;
        return ((Number(goal.id) * 2654435761) >>> 0) % 2 ? "pink" : "yellow";
    }

    function createGoalRow(goal) {
        const row = cloneFirst(goalCardTemplate);
        row.dataset.goalId = goal.id;
        row.dataset.color = cardColor(goal);
        $(".goal-select-checkbox", row).dataset.goalId = goal.id;
        fillGoalRow(row, goal);

        $(".goal-card", row).addEventListener("click", () => selectGoal(goal.id));
        return row;
    }

    // 카드의 글자를 goal 값으로 맞춘다 (생성할 때, 자동 저장 후 갱신할 때 같이 사용)
    function fillGoalRow(row, goal) {
        const title = goal.title || "제목 없는 목표";
        $(".goal-card", row).setAttribute("aria-label", `${title} 목표 열기`);
        $(".goal-card-title", row).textContent = title;
        $(".goal-card-start", row).textContent = `시작일 : ${formatDate(goal.startDate)}`;
        $(".goal-card-end", row).textContent = `종료 예정일 : ${formatDate(goal.endDate)}`;
        $(".goal-card-updated", row).textContent = `마지막 수정 : ${formatUpdatedAt(goal.updatedAt)}`;
        $(".goal-select-checkbox", row).setAttribute("aria-label", `${title} 삭제 대상으로 선택`);
    }

    // 저장이 끝난 목표를 목록에 반영: 있으면 그 자리에서 갱신, 없으면 맨 위에 추가
    function upsertGoalRow(goal) {
        $(".goal-empty", goalList)?.remove();

        const existing = $$(".goal-card-row", goalList)
            .find((row) => Number(row.dataset.goalId) === goal.id);

        if (existing) fillGoalRow(existing, goal);
        else goalList.prepend(createGoalRow(goal));

        markActiveCard();
        syncDeleteGoalsButton();
    }

    function markActiveCard() {
        $$(".goal-card-row", goalList).forEach((row) => {
            const isActive = Number(row.dataset.goalId) === activeGoalId;
            $(".goal-card", row).setAttribute("aria-pressed", String(isActive));
        });
    }

    function syncDeleteGoalsButton() {
        deleteGoalsBtn.disabled = !$(".goal-select-checkbox:checked", goalList);
    }

    // 종이가 오른쪽(책 밖)에서 왼쪽으로 밀려 들어오는 모션 (CSS: .goal-paper.is-entering)
    function playEnterMotion() {
        form.classList.remove("is-entering");
        void form.offsetWidth; // 같은 애니메이션을 다시 시작하기 위한 리플로우
        form.classList.add("is-entering");
    }

    form.addEventListener("animationend", (event) => {
        if (event.target === form) form.classList.remove("is-entering");
    });

    async function selectGoal(id) {
        if (id === activeGoalId) return;
        await flushSave(); // 보던 목표의 수정 내용을 먼저 저장

        const goal = goals.find((item) => item.id === id);
        if (!goal) return;

        closeMenu();
        closeEdit();
        activeGoalId = id;
        fillEditor(goal);
        markActiveCard();
        playEnterMotion();
    }

    goalList.addEventListener("change", (event) => {
        if (event.target.matches(".goal-select-checkbox")) syncDeleteGoalsButton();
    });

    deleteGoalsBtn.addEventListener("click", async () => {
        const ids = $$(".goal-select-checkbox:checked", goalList).map((box) => Number(box.dataset.goalId));
        if (ids.length === 0) return;
        if (!confirm(`선택한 목표 ${ids.length}개를 삭제할까요?`)) return;

        while (savePromise) await savePromise; // 저장 중인 요청이 끝난 뒤에 지운다

        try {
            await request(`${API_URL}?ids=${ids.join(",")}`, { method: "DELETE" });
        } catch (error) {
            alert(error.message);
            return;
        }

        goals = goals.filter((goal) => !ids.includes(goal.id));
        if (ids.includes(activeGoalId)) {
            clearTimeout(saveTimer);
            dirty = false; // 지워진 목표는 더 저장하지 않는다
            resetEditor();
        }
        renderGoals();
    });

    newGoalBtn.addEventListener("click", async () => {
        await flushSave();
        resetEditor();
        form.elements.title.focus();
    });

    async function loadGoals() {
        try {
            goals = await request(API_URL);
        } catch (error) {
            console.error("목표 목록을 불러오지 못했습니다.", error);
            goals = [];
        }
        renderGoals();
    }

    /* ---------- 작성 방식 전환 ---------- */
    function setMode(mode) {
        $$("[data-mode-panel]").forEach((panel) => {
            panel.hidden = panel.dataset.modePanel !== mode;
        });
    }

    $$('input[name="goalMode"]').forEach((radio) => {
        radio.addEventListener("change", () => setMode(radio.value));
    });

    /* ---------- 오늘의 공부 한 줄 리뷰 (인라인 에디트) ----------
       날짜(년/월/일 숫자)와 한 줄 글이 모두 "클릭하면 바로 쓰는 칸"이다.
       수정은 그 구역(날짜 세 칸 / 한 줄 칸) 밖을 클릭하면 끝난다. */
    const reviewParts = (row) => $$(".rd-part", row);

    function setReviewDate(row, iso) {
        const parts = reviewParts(row);
        if (iso) {
            const [y, m, d] = iso.split("-");
            parts[0].value = y.slice(-2);
            parts[1].value = m;
            parts[2].value = d;
        } else {
            parts.forEach((part) => { part.value = ""; });
        }
        $(".review-date", row).dataset.valid = iso || "";
    }

    function completeReviewDate(row) {
        const [yy, mm, dd] = reviewParts(row).map((part) => part.value.trim());
        return yy.length === 2 && mm && dd ? toIso(yy, mm, dd) : null;
    }

    function readReviewDate(row) {
        const values = reviewParts(row).map((part) => part.value.trim());
        if (values.every((value) => !value)) return null;
        return completeReviewDate(row) ?? ($(".review-date", row).dataset.valid || null);
    }

    // 날짜 구역을 벗어나면 마무리: 완성된 값은 0을 채워 정리하고, 덜 쓴 값은 마지막 완성값으로 되돌린다
    function finishReviewDate(row) {
        const group = $(".review-date", row);
        if (reviewParts(row).every((part) => !part.value.trim())) {
            group.dataset.valid = "";
            return;
        }
        setReviewDate(row, completeReviewDate(row) ?? (group.dataset.valid || null));
    }

    noteItems.addEventListener("input", (event) => {
        const part = event.target.closest(".rd-part");
        if (part) {
            part.value = part.value.replace(/\D/g, "").slice(0, 2);
            const row = part.closest(".note-row");

            // 두 자리를 채우면(월은 2~9를 쳐도) 다음 칸으로
            const parts = reviewParts(row);
            const index = parts.indexOf(part);
            const filled = part.value.length === 2 || (index === 1 && part.value.length === 1 && Number(part.value) >= 2);
            if (filled && index < parts.length - 1) parts[index + 1].focus();
            return;
        }

        // 글을 쓰기 시작했는데 날짜가 비어 있으면 오늘 날짜를 넣어 준다 (고치려면 클릭해서 숫자만 바꾸면 된다)
        if (event.target.matches(".review-text")) {
            const row = event.target.closest(".note-row");
            if (!readReviewDate(row)) setReviewDate(row, todayString());
        }
    });

    noteItems.addEventListener("keydown", (event) => {
        const part = event.target.closest(".rd-part");
        if (!part || event.key !== "Backspace" || part.value) return;
        const parts = reviewParts(part.closest(".note-row"));
        const index = parts.indexOf(part);
        if (index > 0) { // 빈 칸에서 지우면 앞 칸으로
            event.preventDefault();
            parts[index - 1].focus();
        }
    });

    // 칸에 들어가면 기존 숫자를 선택해서, 그대로 새 숫자를 치면 덮어써지게 한다
    noteItems.addEventListener("focusin", (event) => {
        event.target.closest(".rd-part")?.select();
    });

    // 마우스를 놓을 때 선택이 풀리지 않게 (일부 브라우저)
    noteItems.addEventListener("mouseup", (event) => {
        if (event.target.closest(".rd-part")) event.preventDefault();
    });

    noteItems.addEventListener("focusout", (event) => {
        const group = event.target.closest(".review-date");
        if (!group || group.contains(event.relatedTarget)) return; // 날짜 세 칸 사이를 옮겨 다니는 중
        finishReviewDate(group.closest(".note-row"));
    });

    function addNoteRow(item) {
        const row = cloneFirst(noteTemplate);
        setReviewDate(row, item?.date ?? null);
        $(".review-text", row).value = item?.text ?? "";
        noteItems.appendChild(row);
        return row;
    }

    function ensureBlankRows() {
        if (!noteItems.children.length) addNoteRow();
    }

    function collectNotes() {
        return $$(".note-row", noteItems)
            .map((row) => ({
                date: readReviewDate(row),
                text: $(".review-text", row).value.trim(),
            }))
            .filter((item) => item.text);
    }

    function syncClearButton() {
        clearNotesBtn.disabled = !$(".item-select:checked", noteItems);
    }

    $("#addNoteBtn").addEventListener("click", () => {
        $(".review-text", addNoteRow()).focus();
    });

    clearNotesBtn.addEventListener("click", () => {
        $$(".item-select:checked", noteItems).forEach((box) => box.closest(".note-row").remove());
        syncClearButton();
        updateDday();
        scheduleSave();
    });

    form.addEventListener("change", (event) => {
        if (event.target.matches(".item-select")) syncClearButton();
    });

    // 폼 기본 제출은 쓰지 않는다 (자동 저장). Enter로도 제출되지 않게 막는다.
    form.addEventListener("submit", (event) => event.preventDefault());

    form.addEventListener("keydown", (event) => {
        if (event.isComposing) return;
        if (event.key === "Enter" && event.target.matches("input")) {
            event.preventDefault(); // 한 줄 입력이라 Enter는 아무 일도 하지 않는다
        } else if (event.key === "Escape" && event.target.matches(".review-text, .rd-part, .progress-name-input")) {
            event.target.blur(); // 키보드로도 수정을 끝낼 수 있게
        }
    });

    /* ---------- 진도표 (표 이름 인라인 편집 / 길게 눌러 순서 바꾸기 / 표를 클릭하면 수정) ---------- */
    function buildProgressBlock({ kind = "NUMBER", name = "", total, rows, cols }) {
        const block = document.createElement("div");
        block.className = "progress-block";
        block.dataset.kind = kind;
        block.dataset.total = total;
        block.dataset.rows = rows;
        block.dataset.cols = cols;

        // 표 이름: 평소엔 글자, 짧게 클릭하면 바로 고치는 입력칸으로 바뀐다
        const view = document.createElement("span");
        view.className = "progress-name";
        view.tabIndex = 0;
        view.setAttribute("role", "button");
        view.setAttribute("aria-label", "표 이름 (클릭하여 수정, 길게 눌러 순서 변경)");
        view.dataset.placeholder = "클릭하여 표 이름 작성";
        view.textContent = name || "";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "progress-name-input";
        input.maxLength = NAME_MAX;
        input.hidden = true;
        input.autocomplete = "off";
        input.setAttribute("aria-label", "표 이름");

        const body = document.createElement("div");
        body.className = "progress-body";

        const grid = document.createElement("div");
        grid.className = "progress-grid";
        grid.tabIndex = 0;
        grid.setAttribute("role", "button");
        grid.setAttribute("aria-label", `진도표 수정 (1~${total}, ${rows}행 ${cols}열)`);
        grid.style.setProperty("--cols", cols);
        grid.style.setProperty("--cell-font", total >= 100 ? "8px" : "10px");
        for (let n = 1; n <= rows * cols; n++) {
            const cell = document.createElement("span");
            cell.className = n <= total ? "progress-cell" : "progress-cell is-empty";
            if (n <= total) {
                cell.dataset.n = n;
                cell.textContent = n;
            }
            grid.appendChild(cell);
        }
        body.appendChild(grid);

        block.append(view, input, body);
        return block;
    }

    function getBlockName(block) {
        const input = $(".progress-name-input", block);
        return (input.hidden ? $(".progress-name", block).textContent : input.value).trim();
    }

    function collectProgressTables() {
        return $$(".progress-block", progressList).map((block) => ({
            kind: block.dataset.kind,
            name: getBlockName(block),
            total: Number(block.dataset.total),
            rows: Number(block.dataset.rows),
            cols: Number(block.dataset.cols),
        }));
    }

    /* 이름 수정: 짧은 클릭 */
    function startRename(block) {
        const view = $(".progress-name", block);
        const input = $(".progress-name-input", block);
        input.value = view.textContent.trim();
        view.hidden = true;
        input.hidden = false;
        input.focus();
        input.select();
    }

    function finishRename(block) {
        const view = $(".progress-name", block);
        const input = $(".progress-name-input", block);
        if (input.hidden) return;
        view.textContent = input.value.trim();
        input.hidden = true;
        view.hidden = false;
        if (editBlock === block) editForm.setName(view.textContent);
    }

    // 수정 구역(이름 입력칸) 밖을 클릭하면 수정이 끝난다
    progressList.addEventListener("focusout", (event) => {
        if (event.target.matches(".progress-name-input")) finishRename(event.target.closest(".progress-block"));
    });

    progressList.addEventListener("keydown", (event) => {
        const target = event.target;
        if (event.key !== "Enter" && event.key !== " ") return;
        if (target.matches(".progress-name")) {
            event.preventDefault();
            startRename(target.closest(".progress-block"));
        } else if (target.matches(".progress-grid")) {
            event.preventDefault();
            openEdit(target.closest(".progress-block"));
        }
    });

    /* 순서 변경: 표 이름을 길게 누른 채 위아래로 움직인다. 누르고 있는 동안에만 파란 선이 보인다. */
    let press = null;

    function beginReorder() {
        if (!press) return;
        press.active = true;
        document.activeElement?.blur?.();
        press.block.classList.add("is-reordering");
        document.body.classList.add("is-reordering-progress");
    }

    function onPressMove(event) {
        if (!press || event.pointerId !== press.id) return;

        if (!press.active) {
            // 길게 누르기 전에 많이 움직이면 이름 수정도 순서 변경도 아닌 동작으로 본다
            if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > HOLD_TOLERANCE) {
                clearTimeout(press.timer);
                press.cancelled = true;
            }
            return;
        }

        const others = $$(".progress-block", progressList).filter((block) => block !== press.block);
        const next = others.find((block) => {
            const box = block.getBoundingClientRect();
            return event.clientY < box.top + box.height / 2;
        });
        if ((next ?? null) !== press.block.nextElementSibling) {
            progressList.insertBefore(press.block, next ?? null);
            press.changed = true;
        }

        // 위/아래 가장자리 근처에서는 스크롤도 따라간다
        const area = itemScroll.getBoundingClientRect();
        if (event.clientY < area.top + 24) itemScroll.scrollTop -= 10;
        else if (event.clientY > area.bottom - 24) itemScroll.scrollTop += 10;
    }

    function endPress(cancelled) {
        if (!press) return;
        const { block, active, changed, timer } = press;
        const isClick = !active && !press.cancelled && !cancelled;
        clearTimeout(timer);
        press = null;

        document.removeEventListener("pointermove", onPressMove);
        document.removeEventListener("pointerup", onPressUp);
        document.removeEventListener("pointercancel", onPressCancel);

        block.classList.remove("is-reordering"); // 손을 떼면 파란 선이 사라진다
        document.body.classList.remove("is-reordering-progress");

        if (active && changed) scheduleSave();
        if (isClick) startRename(block);
    }

    function onPressUp(event) {
        if (press && event.pointerId === press.id) endPress(false);
    }

    function onPressCancel(event) {
        if (press && event.pointerId === press.id) endPress(true);
    }

    progressList.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const name = event.target.closest(".progress-name");
        if (!name) return;

        const block = name.closest(".progress-block");
        press = {
            block,
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            active: false,
            cancelled: false,
            changed: false,
            timer: setTimeout(beginReorder, HOLD_MS),
        };
        // 표가 옮겨지면서 요소가 다시 붙어도 놓치지 않도록 document 에서 받는다
        document.addEventListener("pointermove", onPressMove);
        document.addEventListener("pointerup", onPressUp);
        document.addEventListener("pointercancel", onPressCancel);
    });

    // 표를 클릭하면 수정 패널이 열린다 (이름을 누른 경우는 위에서 따로 처리)
    progressList.addEventListener("click", (event) => {
        const grid = event.target.closest(".progress-grid");
        if (grid) openEdit(grid.closest(".progress-block"));
    });

    /* ---------- 숫자형 진도표 입력 양식 (만들기 / 수정 패널이 같이 쓴다) ----------
       - 수의 개수 최대 100, 열 최대 12
       - 행 또는 열 중 하나만 써도 나머지가 자동으로 채워진다
       - 오류가 없고 숫자가 다 써졌을 때만 버튼이 활성화된다
       - 불가능한 수를 쓰면 그 칸이 좌우로 살짝 진동한다
       - 미리보기 크기에 맞춰 팝업 바탕 크기가 자동으로 바뀐다 */
    function createProgressForm(mount, { submitText, edit = false }) {
        mount.appendChild(formTemplate.content.cloneNode(true));
        const root = $(".pf", mount);
        const fields = {
            count: $('[data-field="count"]', root),
            rows: $('[data-field="rows"]', root),
            cols: $('[data-field="cols"]', root),
        };
        const list = [fields.count, fields.rows, fields.cols];
        const submit = $(".pf-submit", root);
        const deleteBtn = $(".pf-delete", root);
        const nameRow = $(".pf-name", root);
        const errorEl = $(".pf-error", root);
        const preview = $(".pf-preview", root);
        const previewGrid = $(".pf-preview-grid", root);
        const listeners = [];

        let source = null;      // 마지막으로 직접 쓴 행/열 칸. 다른 쪽은 자동으로 채운다
        let baseline = null;    // 수정 패널에서 원래 값
        const prev = new Map(); // 칸별 직전 값 (진동 여부 판단)

        submit.textContent = submitText;
        deleteBtn.hidden = !edit;
        nameRow.hidden = !edit;

        const num = (field) => (field.value.trim() === "" ? null : Number(field.value));

        // 직접 쓴 쪽이 올바른 값이면 다른 쪽을 올림(개수 ÷ 값)으로 채운다. 올바르지 않으면 비운다.
        function derive() {
            if (!source) return;
            const other = source === fields.rows ? fields.cols : fields.rows;
            const n = num(fields.count);
            const s = num(source);
            const nOk = n !== null && n >= 1 && n <= PROGRESS_MAX;
            const limit = nOk ? (source === fields.cols ? Math.min(PROGRESS_MAX_COLS, n) : n) : 0;
            other.value = nOk && s !== null && s >= 1 && s <= limit ? String(Math.ceil(n / s)) : "";
        }

        function evaluate() {
            const n = num(fields.count);
            const r = num(fields.rows);
            const c = num(fields.cols);
            const invalid = new Set();
            let message = "";
            const fail = (field, text) => {
                invalid.add(field);
                if (!message) message = text;
            };
            const nOk = n !== null && n >= 1 && n <= PROGRESS_MAX;

            if (n !== null) {
                if (n < 1) fail(fields.count, "1 이상의 숫자를 입력해 주세요.");
                else if (n > PROGRESS_MAX) fail(fields.count, `최대 생성 가능한 셀의 개수는 ${PROGRESS_MAX}개 입니다.`);
            }
            if (c !== null) {
                if (c < 1) fail(fields.cols, "1 이상의 숫자를 입력해 주세요.");
                else if (c > PROGRESS_MAX_COLS) fail(fields.cols, `${PROGRESS_MAX_COLS} 이하의 열을 입력해 주세요.`);
                else if (nOk && c > n) fail(fields.cols, "생성할 수 없는 규칙 입니다.");
            }
            if (r !== null) {
                if (r < 1) fail(fields.rows, "1 이상의 숫자를 입력해 주세요.");
                else if (nOk && r > n) fail(fields.rows, "생성할 수 없는 규칙 입니다.");
            }
            // 행 × 열로 개수를 못 채우거나, 내용이 없는 빈 줄이 생기는 조합
            if (!invalid.size && nOk && r !== null && c !== null && (r * c < n || (r - 1) * c >= n)) {
                fail(fields.rows, "생성할 수 없는 규칙 입니다.");
                invalid.add(fields.cols);
            }

            const ready = !invalid.size && nOk && r !== null && c !== null;
            return { n, r, c, invalid, message, ready };
        }

        function shake(field) {
            field.classList.remove("is-shaking");
            void field.offsetWidth; // 같은 애니메이션을 다시 시작하기 위한 리플로우
            field.classList.add("is-shaking");
        }

        function renderPreview({ n, r, c }) {
            const cell = Math.max(3, Math.min(10, Math.floor(110 / c) - 1, Math.floor(130 / r) - 1));
            previewGrid.style.setProperty("--pc", c);
            previewGrid.style.setProperty("--cell", `${cell}px`);
            previewGrid.replaceChildren(...Array.from({ length: r * c }, (_, i) => {
                const dot = document.createElement("i");
                if (i >= n) dot.className = "off";
                return dot;
            }));
        }

        const isDirty = () => Boolean(baseline) && list.some((field) => field.value !== String(baseline[field.dataset.field]));
        const hasValue = () => list.some((field) => field.value.trim() !== "");

        function refresh() {
            const state = evaluate();
            list.forEach((field) => {
                const bad = state.invalid.has(field);
                field.classList.toggle("is-invalid", bad);
                field.classList.toggle("is-changed", !bad && Boolean(baseline)
                    && field.value !== String(baseline[field.dataset.field]));
                field.setAttribute("aria-invalid", String(bad));
                if (bad && prev.get(field) !== field.value) shake(field);
                prev.set(field, field.value);
            });

            errorEl.textContent = state.message;
            errorEl.hidden = !state.message;

            submit.disabled = !(state.ready && (!baseline || isDirty()));

            preview.hidden = !state.ready;
            if (state.ready) renderPreview(state);

            listeners.forEach((fn) => fn());
            return state;
        }

        list.forEach((field) => {
            field.addEventListener("input", () => {
                field.value = field.value.replace(/\D/g, "").slice(0, 3).replace(/^0+(?=\d)/, "");
                if (field !== fields.count) source = field;
                derive();
                refresh();
            });
            field.addEventListener("keydown", (event) => {
                if (event.key === "Enter" && !event.isComposing) {
                    event.preventDefault();
                    if (!submit.disabled) submit.click();
                }
            });
            field.addEventListener("animationend", () => field.classList.remove("is-shaking"));
        });

        return {
            root, fields, submit, deleteBtn, evaluate, isDirty, hasValue,
            onChange: (fn) => listeners.push(fn),
            setName: (text) => { $(".pf-name-text", root).textContent = text || "(이름 없음)"; },
            set(values) {
                fields.count.value = String(values.count);
                fields.rows.value = String(values.rows);
                fields.cols.value = String(values.cols);
                source = null;
                baseline = { count: values.count, rows: values.rows, cols: values.cols };
                list.forEach((field) => prev.set(field, field.value));
                refresh();
            },
            reset() {
                list.forEach((field) => { field.value = ""; });
                source = null;
                baseline = null;
                prev.clear();
                refresh();
            },
        };
    }

    /* ---------- 진도표 추가 메뉴 (인텔리제이 메뉴처럼) ----------
       - "진도표 추가"를 클릭하면 메뉴가 뜬다.
       - 숫자형에 마우스를 올리면 옆에 팝업이 뜬다.
       - 마우스가 그 구역(버튼+메뉴+팝업)을 벗어나면 사라진다.
       - 단, 숫자가 하나라도 입력되면 닫기 버튼이 생기고, 그 버튼으로만 닫힌다.
       - 숫자를 모두 지우면 닫기 버튼이 사라지고 처음 동작으로 돌아간다. */
    const addBtn = $("#progressAddBtn");
    const pm = $("#progressMenu");
    const pmSub = $(".pm-sub", pm);
    const pmItems = $$(".pm-item", pm);
    const createForm = createProgressForm($('[data-mount="create"]', pm), { submitText: "생성하기" });

    let pmOpen = false;
    let pmInside = false;   // 마우스가 구역 안에 있는가
    let pmTimer = null;

    const isPinned = () => createForm.hasValue();

    function positionMenu() {
        if (pm.hidden) return;
        const rect = addBtn.getBoundingClientRect();
        const margin = 8;
        const subVisible = pm.classList.contains("has-sub");
        const subW = subVisible ? pmSub.offsetWidth : (parseFloat(getComputedStyle(pm).getPropertyValue("--pm-sub-w")) || 142);
        const subH = subVisible ? pmSub.offsetHeight + 6 : 0;
        const width = pm.offsetWidth;
        const height = Math.max(pm.offsetHeight, subH, 150);

        let left = rect.right + 10;
        let flip = false;
        if (left + width + subW > window.innerWidth - margin) {
            // 오른쪽에 팝업 자리가 없으면 팝업을 메뉴 왼쪽에 붙인다. 그것도 안 되면 메뉴를 왼쪽으로 옮긴다.
            if (left - subW >= margin && left + width <= window.innerWidth - margin) flip = true;
            else left = Math.max(margin, window.innerWidth - margin - width - subW);
        }
        const top = Math.max(margin, Math.min(rect.top - 10, window.innerHeight - margin - height));

        pm.style.left = `${left}px`;
        pm.style.top = `${top}px`;
        pm.classList.toggle("is-flip", flip);
    }

    function showSub(item) {
        pm.classList.add("has-sub");
        pmItems.forEach((other) => other.classList.toggle("is-active", other === item));
        positionMenu();
    }

    function hideSub() {
        pm.classList.remove("has-sub");
        pmItems.forEach((item) => item.classList.remove("is-active"));
    }

    function openMenu() {
        closeEdit();
        pm.hidden = false;
        pmOpen = true;
        addBtn.setAttribute("aria-expanded", "true");
        positionMenu();
    }

    function closeMenu() {
        clearTimeout(pmTimer);
        pm.hidden = true;
        pmOpen = false;
        hideSub();
        addBtn.setAttribute("aria-expanded", "false");
        createForm.reset();
        pm.classList.remove("is-pinned");
    }

    function scheduleClose() {
        if (isPinned()) return;
        clearTimeout(pmTimer);
        pmTimer = setTimeout(() => {
            if (!isPinned()) closeMenu();
        }, MENU_CLOSE_DELAY);
    }

    // 숫자가 입력되면 닫기 버튼이 나타나고, 모두 지우면 사라진다
    createForm.onChange(() => {
        const pinned = isPinned();
        pm.classList.toggle("is-pinned", pinned);
        if (pmOpen) positionMenu();
        // 숫자를 모두 지웠는데 마우스가 이미 구역 밖이면, 원래 동작대로 곧 사라진다
        if (!pinned && pmOpen && !pmInside) scheduleClose();
    });

    [addBtn, pm].forEach((zone) => {
        zone.addEventListener("mouseenter", () => {
            pmInside = true;
            clearTimeout(pmTimer);
        });
        zone.addEventListener("mouseleave", () => {
            pmInside = false;
            if (pmOpen) scheduleClose();
        });
    });

    addBtn.addEventListener("click", () => {
        if (!pmOpen) openMenu();
        else if (!isPinned()) closeMenu();
    });

    pmItems.forEach((item) => {
        const enabled = item.dataset.kind === "NUMBER";
        const activate = () => {
            if (enabled) showSub(item);
            else if (!isPinned()) hideSub(); // 입력 중인 팝업은 다른 항목을 지나가도 유지
        };
        item.addEventListener("mouseenter", activate);
        item.addEventListener("focus", activate);
        item.addEventListener("click", () => {
            if (!enabled) return;
            showSub(item);
            createForm.fields.count.focus();
        });
    });

    $(".pm-close", pm).addEventListener("click", () => {
        closeMenu();
        addBtn.focus();
    });

    createForm.submit.addEventListener("click", () => {
        const state = createForm.evaluate();
        if (!state.ready) return;

        const block = buildProgressBlock({ kind: "NUMBER", name: "", total: state.n, rows: state.r, cols: state.c });
        progressList.appendChild(block);
        closeMenu();
        addBtn.focus();
        block.scrollIntoView({ block: "nearest" });
        updateDday();
        scheduleSave();
    });

    /* ---------- 진도표 수정 패널 (표를 클릭하면 표 왼쪽에 열린다) ---------- */
    const pe = $("#progressEdit");
    const editForm = createProgressForm($('[data-mount="edit"]', pe), { submitText: "수정하기", edit: true });
    let editBlock = null;

    function positionEdit() {
        if (pe.hidden || !editBlock) return;
        const grid = $(".progress-grid", editBlock).getBoundingClientRect();
        const margin = 8;
        const gap = 32; // 닫기(✕)가 들어갈 자리
        const width = pe.offsetWidth;
        const height = pe.offsetHeight;

        let left = grid.left - width - gap;
        let flip = false;
        if (left < margin) { // 왼쪽에 자리가 없으면 표 오른쪽에
            left = Math.min(grid.right + gap, window.innerWidth - margin - width);
            flip = true;
        }
        const top = Math.max(margin, Math.min(grid.top, window.innerHeight - margin - height));

        pe.style.left = `${left}px`;
        pe.style.top = `${top}px`;
        pe.classList.toggle("is-flip", flip);
    }

    function openEdit(block) {
        if (!block) return;
        if (editBlock === block && !pe.hidden) return;
        if (editBlock && editBlock !== block && editForm.isDirty()) return; // 고치던 내용이 있으면 ✕나 수정하기로 먼저 마무리

        closeMenu();
        editBlock = block;
        editForm.setName(getBlockName(block));
        editForm.set({
            count: Number(block.dataset.total),
            rows: Number(block.dataset.rows),
            cols: Number(block.dataset.cols),
        });
        pe.hidden = false;
        positionEdit();
    }

    function closeEdit() {
        if (pe.hidden && !editBlock) return;
        pe.hidden = true;
        editBlock = null;
        editForm.reset();
    }

    editForm.onChange(positionEdit);

    editForm.submit.addEventListener("click", () => {
        const state = editForm.evaluate();
        if (!state.ready || !editBlock) return;

        const fresh = buildProgressBlock({
            kind: editBlock.dataset.kind,
            name: getBlockName(editBlock),
            total: state.n,
            rows: state.r,
            cols: state.c,
        });
        editBlock.replaceWith(fresh);
        closeEdit();
        updateDday();
        scheduleSave();
    });

    editForm.deleteBtn.addEventListener("click", () => {
        if (!editBlock || !confirm("이 진도표를 삭제할까요?")) return;
        editBlock.remove();
        closeEdit();
        updateDday();
        scheduleSave();
    });

    $(".pe-close", pe).addEventListener("click", closeEdit);
    itemScroll.addEventListener("scroll", positionEdit);
    window.addEventListener("resize", () => { positionMenu(); positionEdit(); });

    // 고친 내용이 없을 때만 바깥 클릭/Esc로 닫는다 (실수로 날아가지 않게)
    document.addEventListener("pointerdown", (event) => {
        const target = event.target;

        if (pmOpen && !isPinned() && !pm.contains(target) && !addBtn.contains(target)) closeMenu();

        if (!pe.hidden && !editForm.isDirty() && !pe.contains(target)
            && !(editBlock && $(".progress-grid", editBlock).contains(target))) {
            closeEdit();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (pmOpen && !isPinned()) {
            closeMenu();
            addBtn.focus();
        } else if (!pe.hidden && !editForm.isDirty()) {
            closeEdit();
        }
    });

    /* ---------- 오른쪽: 편집기 채우기 / 비우기 ---------- */
    function clearEditor() {
        form.reset();
        [startInput, endInput].forEach((input) => { input.dataset.valid = ""; });
        progressList.replaceChildren();
        noteItems.replaceChildren();
        chatMessages.replaceChildren();
        autoGrowPrompt();
        setStatus("");
    }

    function resetEditor() {
        closeMenu();
        closeEdit();
        activeGoalId = null;
        clearEditor();
        ensureBlankRows();
        syncClearButton();
        updateDday();
        markActiveCard();
    }

    function fillEditor(goal) {
        clearEditor();

        const fields = form.elements;
        fields.title.value = goal.title ?? "";
        setShortDate(startInput, goal.startDate);
        setShortDate(endInput, goal.endDate);
        fields.goalUnit.value = goal.goalUnit ?? "";
        fields.goalFrequency.value = goal.goalFrequency ?? "";
        fields.specialNotes.value = goal.specialNotes ?? "";
        fields.goalPromise.value = goal.goalPromise ?? "";
        fields.freeMemo.value = goal.freeMemo ?? "";

        (goal.progressTables ?? []).forEach((table) => progressList.appendChild(buildProgressBlock(table)));
        (goal.notes ?? []).forEach((item) => addNoteRow(item));

        ensureBlankRows();
        syncClearButton();
        updateDday();
    }

    /* ---------- 자동 저장 (인라인 편집) ---------- */
    function buildPayload() {
        const data = new FormData(form);
        const text = (name) => String(data.get(name) ?? "").trim();

        return {
            title: text("title"),
            startDate: readShortDate(startInput),
            endDate: readShortDate(endInput),
            goalUnit: text("goalUnit"),
            goalFrequency: text("goalFrequency"),
            specialNotes: text("specialNotes"),
            goalPromise: text("goalPromise"),
            freeMemo: String(data.get("freeMemo") ?? ""),
            progressTables: collectProgressTables(),
            notes: collectNotes(),
        };
    }

    // 아무것도 안 적은 새 목표는 저장하지 않는다 (빈 카드가 생기지 않게)
    function isBlankPayload(p) {
        return !p.title && !p.startDate && !p.endDate && !p.goalUnit && !p.goalFrequency
            && !p.specialNotes && !p.goalPromise && !p.freeMemo.trim()
            && p.progressTables.length === 0 && p.notes.length === 0;
    }

    // 값이 바뀔 때마다 부른다. 마지막 입력 후 잠깐 기다렸다가 저장한다.
    function scheduleSave() {
        dirty = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, AUTOSAVE_DELAY);
    }

    // 대기 중인 수정이 있으면 지금 저장한다. 목표를 옮기기 전, 페이지를 떠나기 전에도 사용.
    async function flushSave({ keepalive = false } = {}) {
        clearTimeout(saveTimer);
        saveTimer = null;

        while (savePromise) await savePromise; // 진행 중인 저장이 있으면 끝날 때까지 기다린다
        if (!dirty) return;

        savePromise = doSave(keepalive).finally(() => { savePromise = null; });
        return savePromise;
    }

    async function doSave(keepalive) {
        const payload = buildPayload();
        const id = activeGoalId;

        if (id === null && isBlankPayload(payload)) {
            dirty = false;
            return;
        }
        if (payload.startDate && payload.endDate && payload.startDate > payload.endDate) {
            setStatus("종료일이 시작일보다 빠를 수 없어요.", "error");
            return; // 날짜를 고치면 다시 저장된다
        }

        dirty = false; // 요청을 보내는 동안 또 수정하면 scheduleSave()가 다시 true로 만든다
        setStatus("저장 중…", "saving");

        try {
            const saved = id === null
                ? await request(API_URL, { method: "POST", body: JSON.stringify(payload), keepalive })
                : await request(`${API_URL}/${id}`, { method: "PUT", body: JSON.stringify(payload), keepalive });

            const index = goals.findIndex((goal) => goal.id === saved.id);
            if (index === -1) goals.unshift(saved);
            else goals[index] = saved;

            if (id === null) activeGoalId = saved.id; // 처음 저장되면서 이 목표가 선택된 상태가 된다
            upsertGoalRow(saved);
            setStatus("저장됨", "saved");
        } catch (error) {
            dirty = true;
            setStatus(error.status ? error.message : "네트워크 연결을 확인해 주세요.", "error");

            const retriable = !error.status || error.status >= 500;
            if (retriable) saveTimer = setTimeout(flushSave, RETRY_DELAY);
        }
    }

    [startInput, endInput].forEach(bindDateMask);

    // 채팅 입력칸/삭제 체크박스를 뺀, 목표 내용 입력만 자동 저장 대상
    form.addEventListener("input", (event) => {
        const target = event.target;
        if (target === aiPrompt || target.matches(".item-select")) return;

        updateDday(); // 기간/학습 빈도/리뷰가 바뀌면 D-day와 진행도를 다시 계산
        scheduleSave();
    });

    // 창을 닫거나 다른 탭으로 가기 전에 남은 수정이 있으면 마지막으로 보낸다
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && dirty) flushSave({ keepalive: true });
    });
    window.addEventListener("pagehide", () => {
        if (dirty) flushSave({ keepalive: true });
    });

    /* ---------- AI 자율 작성 ---------- */
    function appendChat(role, text) {
        const row = document.createElement("div");
        row.className = role === "user" ? "chat-row is-user" : "chat-row";

        const bubble = document.createElement("div");
        bubble.className = "chat-bubble";
        bubble.textContent = text;

        const face = document.createElement("span");
        face.className = `chat-face ${role === "user" ? "user-face" : "bot-face"}`;
        face.appendChild(createFace());

        if (role === "user") row.append(bubble, face);
        else row.append(face, bubble);

        chatMessages.appendChild(row);
        row.scrollIntoView({ block: "nearest" });
    }

    // TODO: 인공지능 연결 지점. 서버(또는 LLM API)를 호출해서 답변 문자열을 돌려주세요.
    async function requestAiReply(prompt) {
        return "아직 인공 지능이 연결되지 않았어요. 연결되면 이곳에서 계획을 함께 세워 드릴게요.";
    }

    function autoGrowPrompt() {
        aiPrompt.style.height = "auto";
        aiPrompt.style.height = `${Math.min(aiPrompt.scrollHeight, 160)}px`;
    }

    async function sendChat() {
        const prompt = aiPrompt.value.trim();
        if (!prompt) return;

        appendChat("user", prompt);
        aiPrompt.value = "";
        autoGrowPrompt();

        appendChat("bot", await requestAiReply(prompt));
    }

    aiPrompt.addEventListener("input", autoGrowPrompt);
    aiPrompt.addEventListener("keydown", (event) => {
        // 한글 조합 중의 Enter(isComposing)는 전송으로 치지 않는다
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            sendChat();
        }
    });

    /* ---------- 시작 ---------- */
    setMode("form");
    resetEditor();
    updatePaperBleed();
    loadGoals();
})();
