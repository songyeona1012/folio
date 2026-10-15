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
    const TEXT_ITEM_MAX = 100;       // 글자형 진도표: 줄 최대 개수
    const DRAG_START = 3;            // 글자형 핸들을 이만큼(px) 움직이면 순서 바꾸기가 시작된다
    const MODE_TO_TYPE = { form: "STUDY", money: "MONEY", ai: "AI" };   // 화면 양식 ↔ 서버에 저장하는 양식 종류
    const TYPE_TO_MODE = { STUDY: "form", MONEY: "money", AI: "ai" };
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
    const textFormTemplate = $("#textFormTemplate");
    const textRowTemplate = $("#textRowTemplate");
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
    let formMode = "form";    // 지금 열려 있는 목표의 작성 양식 (form: 공부, ai: AI 자율 작성)

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
        setMode(TYPE_TO_MODE[goal.formType] ?? "form"); // 그 목표를 만들 때 쓴 양식으로 보여 준다
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
        const wasOpen = activeGoalId !== null;
        resetEditor();
        if (wasOpen) playEnterMotion(); // 작성해 둔 목표에서 새 양식으로 넘어갈 때만
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

    /* ---------- 작성 양식 전환 (공부 / AI 자율 작성) ----------
       - 목표마다 양식이 정해져 있고(저장된다), 목록에서 목표를 열면 그 양식으로 보인다.
       - 이미 작성한 목표가 열려 있을 때 다른 양식을 누르면, 그 목표는 그대로 두고 새 목표 양식으로 넘어간다.
       - 아직 비어 있는 새 목표라면 양식만 바뀐다. */
    const modeRadios = $$('input[name="goalMode"]');

    function setMode(mode) {
        formMode = mode;
        $$("[data-mode-panel]").forEach((panel) => {
            panel.hidden = panel.dataset.modePanel !== mode;
        });
        modeRadios.forEach((radio) => { radio.checked = radio.value === mode; });
        if (mode === "ai") autoGrowMemo();     // 줄 노트 높이는 보이는 상태에서 다시 잰다
        if (mode === "money") refreshMoney();
    }

    modeRadios.forEach((radio) => {
        radio.addEventListener("change", async () => {
            if (!radio.checked || radio.value === formMode) return;

            await flushSave(); // 보던 목표의 수정 내용은 원래 양식(formMode) 그대로 먼저 저장한다
            const wanted = modeRadios.find((item) => item.checked)?.value ?? radio.value; // 기다리는 사이 또 눌렀을 수 있다
            if (wanted === formMode) return;

            if (activeGoalId !== null) {
                resetEditor();
                setMode(wanted);
                playEnterMotion();
                form.elements.title.focus();
            } else {
                setMode(wanted);
            }
        });
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
        } else if (event.key === "Escape" && event.target.matches(".review-text, .rd-part, .progress-name-input, .text-cell, .tx-date, .tx-time, .tx-amount, .money-input, .money-cycle, .ai-label, .ai-value, .ai-item-text, .ai-block-title, .ai-track-label, .ai-col-name, .ai-log-cell, .ai-num, .ai-unit")) {
            event.target.blur(); // 키보드로도 수정을 끝낼 수 있게
        }
    });

    /* ---------- 진도표 (표 이름 인라인 편집 / 길게 눌러 순서 바꾸기 / 표를 클릭하면 수정) ---------- */
    function buildProgressBlock({ kind = "NUMBER", name = "", total = 0, rows = 0, cols = 0, items = [] }) {
        const isText = kind === "TEXT";
        const block = document.createElement("div");
        block.className = "progress-block";
        block.dataset.kind = kind;
        if (!isText) {
            block.dataset.total = total;
            block.dataset.rows = rows;
            block.dataset.cols = cols;
        }

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

        if (isText) {
            block.append(view, input, buildTextBody(items));
            return block;
        }

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
        return $$(".progress-block", progressList).map((block) => {
            const base = { kind: block.dataset.kind, name: getBlockName(block) };
            if (base.kind === "TEXT") {
                return {
                    ...base,
                    total: 0,
                    rows: 0,
                    cols: 0,
                    items: $$(".text-row", block).map((row) => ({
                        text: $(".text-cell", row).value.trim(),
                        done: $(".text-check", row).checked,
                    })),
                };
            }
            return {
                ...base,
                total: Number(block.dataset.total),
                rows: Number(block.dataset.rows),
                cols: Number(block.dataset.cols),
            };
        });
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
        const next = input.value.trim();
        // 글자형은 이름이 꼭 있어야 하므로, 다 지우고 벗어나면 원래 이름으로 돌아간다
        if (next || block.dataset.kind !== "TEXT") view.textContent = next;
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

    /* ---------- 글자형 진도표 (예: 목차) ----------
       - 줄마다 [회색 핸들] [한 줄 글] [완료 체크]. 글과 표 이름은 모두 클릭해서 바로 쓰는 인라인 입력.
       - 줄(글)을 클릭하면 그 줄 왼쪽에 '삭제하기'가 뜬다. 다른 곳을 클릭하면 사라진다.
       - 핸들을 누른 채 위아래로 움직이면 순서가 바뀐다. 누르고 있는 동안에만 파란 선이 보인다.
       - '+'는 줄을 하나 더한다. */
    function createTextRow(item) {
        const row = cloneFirst(textRowTemplate);
        const check = $(".text-check", row);
        $(".text-cell", row).value = item?.text ?? "";
        check.checked = Boolean(item?.done);
        row.classList.toggle("is-done", check.checked);
        return row;
    }

    function buildTextBody(items) {
        const body = document.createElement("div");
        body.className = "text-body";

        const list = document.createElement("div");
        list.className = "text-list";
        (items.length ? items : [{ text: "", done: false }]).forEach((item) => list.appendChild(createTextRow(item)));

        const foot = document.createElement("div");
        foot.className = "text-foot";
        const add = document.createElement("button");
        add.type = "button";
        add.className = "add-item-btn text-add";
        add.textContent = "+";
        add.setAttribute("aria-label", "줄 추가");
        foot.appendChild(add);

        body.append(list, foot);
        return body;
    }

    /* 삭제 메뉴 */
    const rowMenu = $("#rowMenu");
    const rowMenuBtn = $(".rm-delete", rowMenu);
    let rowMenuRow = null;

    function positionRowMenu() {
        if (rowMenu.hidden || !rowMenuRow) return;
        const row = rowMenuRow.getBoundingClientRect();
        const area = itemScroll.getBoundingClientRect();
        if (row.bottom < area.top + 4 || row.top > area.bottom - 4) { // 스크롤로 줄이 보이는 영역을 벗어나면 닫는다
            closeRowMenu();
            return;
        }

        const handle = $(".text-handle", rowMenuRow).getBoundingClientRect();
        const margin = 6;
        const width = rowMenu.offsetWidth;
        const height = rowMenu.offsetHeight;

        let left = handle.left - width - 8;     // 시안: 핸들 왼쪽
        if (left < margin) left = Math.min(row.right + 34, window.innerWidth - margin - width); // 자리가 없으면 줄 오른쪽
        const top = Math.max(margin, Math.min(row.top + (row.height - height) / 2, window.innerHeight - margin - height));

        rowMenu.style.left = `${left}px`;
        rowMenu.style.top = `${top}px`;
    }

    function openRowMenu(row) {
        if (!row) return;
        rowMenuRow = row;
        // 마지막 한 줄이면 표를 통째로 지우는 메뉴가 된다
        rowMenuBtn.textContent = $$(".text-row", row.parentElement).length === 1 ? "표 삭제하기" : "삭제하기";
        rowMenu.hidden = false;
        positionRowMenu();
    }

    function closeRowMenu() {
        rowMenu.hidden = true;
        rowMenuRow = null;
    }

    rowMenuBtn.addEventListener("click", () => {
        const row = rowMenuRow;
        if (!row) return;
        const block = row.closest(".progress-block");

        if ($$(".text-row", block).length === 1) {
            if (!confirm("이 진도표를 삭제할까요?")) return;
            closeRowMenu();
            block.remove();
        } else {
            closeRowMenu();
            row.remove();
        }
        scheduleSave();
    });

    // 줄(글)을 좌클릭하면 그 자리에서 바로 쓸 수 있고, 동시에 삭제 메뉴가 뜬다
    progressList.addEventListener("click", (event) => {
        const add = event.target.closest(".text-add");
        if (add) {
            const list = $(".text-list", add.closest(".progress-block"));
            if ($$(".text-row", list).length >= TEXT_ITEM_MAX) return;
            const row = createTextRow();
            list.appendChild(row);
            $(".text-cell", row).focus();
            scheduleSave();
            return;
        }

        const cell = event.target.closest(".text-cell");
        if (cell && event.button === 0) openRowMenu(cell.closest(".text-row"));
    });

    // 오른쪽 체크박스: 끝낸 줄은 초록빛으로 칠하고 글에 줄을 긋는다
    progressList.addEventListener("change", (event) => {
        if (!event.target.matches(".text-check")) return;
        event.target.closest(".text-row").classList.toggle("is-done", event.target.checked);
        scheduleSave();
    });

    /* 핸들로 순서 바꾸기 */
    let rowDrag = null;

    function onRowDragMove(event) {
        if (!rowDrag || event.pointerId !== rowDrag.id) return;

        if (!rowDrag.active) {
            if (Math.hypot(event.clientX - rowDrag.x, event.clientY - rowDrag.y) < DRAG_START) return;
            rowDrag.active = true;
            document.activeElement?.blur?.();
            closeRowMenu();
            rowDrag.row.classList.add("is-dragging");
            document.body.classList.add("is-reordering-progress");
        }

        const list = rowDrag.row.parentElement;
        const next = $$(".text-row", list)
            .filter((row) => row !== rowDrag.row)
            .find((row) => {
                const box = row.getBoundingClientRect();
                return event.clientY < box.top + box.height / 2;
            });
        if ((next ?? null) !== rowDrag.row.nextElementSibling) {
            list.insertBefore(rowDrag.row, next ?? null);
            rowDrag.changed = true;
        }

        const area = itemScroll.getBoundingClientRect(); // 위/아래 가장자리 근처에서는 스크롤도 따라간다
        if (event.clientY < area.top + 24) itemScroll.scrollTop -= 10;
        else if (event.clientY > area.bottom - 24) itemScroll.scrollTop += 10;
    }

    function endRowDrag(event) {
        if (!rowDrag || event.pointerId !== rowDrag.id) return;
        const { row, changed, active } = rowDrag;
        rowDrag = null;

        document.removeEventListener("pointermove", onRowDragMove);
        document.removeEventListener("pointerup", endRowDrag);
        document.removeEventListener("pointercancel", endRowDrag);

        row.classList.remove("is-dragging"); // 손을 떼면 파란 선이 사라진다
        document.body.classList.remove("is-reordering-progress");
        if (active && changed) scheduleSave();
    }

    progressList.addEventListener("pointerdown", (event) => {
        const handle = event.target.closest(".text-handle");
        if (!handle || event.button !== 0) return;

        event.preventDefault(); // 글자 선택/포커스 이동 없이 바로 끌 수 있게
        rowDrag = {
            row: handle.closest(".text-row"),
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            active: false,
            changed: false,
        };
        document.addEventListener("pointermove", onRowDragMove);
        document.addEventListener("pointerup", endRowDrag);
        document.addEventListener("pointercancel", endRowDrag);
    });

    // 키보드: 핸들에 포커스를 두고 ↑ ↓ 로도 순서를 바꿀 수 있다
    progressList.addEventListener("keydown", (event) => {
        const handle = event.target.closest?.(".text-handle");
        if (!handle || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        event.preventDefault();

        const row = handle.closest(".text-row");
        if (event.key === "ArrowUp" && row.previousElementSibling) {
            row.parentElement.insertBefore(row, row.previousElementSibling);
        } else if (event.key === "ArrowDown" && row.nextElementSibling) {
            row.parentElement.insertBefore(row.nextElementSibling, row);
        } else {
            return;
        }
        handle.focus();
        positionRowMenu();
        scheduleSave();
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

    /* ---------- 글자형 진도표 입력 양식 (표 이름만 쓴다) ----------
       - 표 이름을 써야 '생성하기'가 활성화된다.
       - 이름이 입력되면 닫기 버튼이 생기는 것은 숫자형과 같다. */
    function createTextForm(mount) {
        mount.appendChild(textFormTemplate.content.cloneNode(true));
        const root = $(".pf", mount);
        const nameInput = $(".pf-name-input", root);
        const submit = $(".pf-submit", root);
        const listeners = [];

        const name = () => nameInput.value.trim();

        function refresh() {
            submit.disabled = !name();
            listeners.forEach((fn) => fn());
        }

        nameInput.addEventListener("input", refresh);
        nameInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.isComposing) {
                event.preventDefault();
                if (!submit.disabled) submit.click();
            }
        });

        return {
            root, nameInput, submit, name,
            hasValue: () => name() !== "",
            onChange: (fn) => listeners.push(fn),
            reset() {
                nameInput.value = "";
                refresh();
            },
        };
    }

    /* ---------- 진도표 추가 메뉴 (인텔리제이 메뉴처럼) ----------
       - "진도표 추가"를 클릭하면 메뉴가 뜬다.
       - 숫자형/글자형에 마우스를 올리면 옆에 그 항목의 팝업이 뜬다.
       - 마우스가 그 구역(버튼+메뉴+팝업)을 벗어나면 사라진다.
       - 단, 값(숫자 또는 표 이름)이 하나라도 입력되면 닫기 버튼이 생기고, 그 버튼으로만 닫힌다.
         이때는 다른 항목에 마우스를 올려도 입력 중인 팝업이 그대로 유지된다.
       - 값을 모두 지우면 닫기 버튼이 사라지고 처음 동작으로 돌아간다. */
    const addBtn = $("#progressAddBtn");
    const pm = $("#progressMenu");
    const pmSubs = $$(".pm-sub", pm);
    const pmItems = $$(".pm-item", pm);
    const createForm = createProgressForm($('[data-mount="create"]', pm), { submitText: "생성하기" });
    const textForm = createTextForm($('[data-mount="create-text"]', pm));

    let pmOpen = false;
    let pmInside = false;   // 마우스가 구역 안에 있는가
    let pmTimer = null;
    let activeKind = null;  // 지금 옆에 떠 있는 팝업 종류 (NUMBER / TEXT)

    const isPinned = () => createForm.hasValue() || textForm.hasValue();

    function positionMenu() {
        if (pm.hidden) return;
        const rect = addBtn.getBoundingClientRect();
        const margin = 8;
        const pmSub = pmSubs.find((sub) => sub.classList.contains("is-open"));
        const subVisible = pm.classList.contains("has-sub") && Boolean(pmSub);
        // 팝업 폭 + 팝업 바깥쪽에 붙는 닫기(✕) 자리(22px). 값이 입력돼 ✕가 나타나도 화면 밖으로 나가지 않게 미리 비워 둔다.
        const subW = (subVisible ? pmSub.offsetWidth : (parseFloat(getComputedStyle(pm).getPropertyValue("--pm-sub-w")) || 142)) + 22;
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
        const kind = item.dataset.kind;
        if (isPinned() && activeKind && kind !== activeKind) return; // 입력 중인 팝업은 다른 항목을 지나가도 유지

        activeKind = kind;
        pm.classList.add("has-sub");
        pmItems.forEach((other) => other.classList.toggle("is-active", other === item));
        pmSubs.forEach((sub) => sub.classList.toggle("is-open", sub.dataset.for === kind));
        positionMenu();
    }

    function hideSub() {
        activeKind = null;
        pm.classList.remove("has-sub");
        pmItems.forEach((item) => item.classList.remove("is-active"));
        pmSubs.forEach((sub) => sub.classList.remove("is-open"));
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
        textForm.reset();
        pm.classList.remove("is-pinned");
    }

    function scheduleClose() {
        if (isPinned()) return;
        clearTimeout(pmTimer);
        pmTimer = setTimeout(() => {
            if (!isPinned()) closeMenu();
        }, MENU_CLOSE_DELAY);
    }

    // 값(숫자/표 이름)이 입력되면 닫기 버튼이 나타나고, 모두 지우면 사라진다
    function syncPinned() {
        const pinned = isPinned();
        pm.classList.toggle("is-pinned", pinned);
        if (pmOpen) positionMenu();
        // 값을 모두 지웠는데 마우스가 이미 구역 밖이면, 원래 동작대로 곧 사라진다
        if (!pinned && pmOpen && !pmInside) scheduleClose();
    }

    createForm.onChange(syncPinned);
    textForm.onChange(syncPinned);

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
        const activate = () => showSub(item);
        item.addEventListener("mouseenter", activate);
        item.addEventListener("focus", activate);
        item.addEventListener("click", () => {
            showSub(item);
            if (activeKind !== item.dataset.kind) return; // 다른 팝업에 입력 중이면 그대로 둔다
            (item.dataset.kind === "TEXT" ? textForm.nameInput : createForm.fields.count).focus();
        });
    });

    $$(".pm-close", pm).forEach((button) => {
        button.addEventListener("click", () => {
            closeMenu();
            addBtn.focus();
        });
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

    // 글자형: 이름을 쓰고 '생성하기'를 누르면 빈 줄 하나로 시작하고, 바로 첫 줄을 쓸 수 있다
    textForm.submit.addEventListener("click", () => {
        const name = textForm.name();
        if (!name) return;

        const block = buildProgressBlock({ kind: "TEXT", name });
        progressList.appendChild(block);
        closeMenu();
        block.scrollIntoView({ block: "nearest" });
        $(".text-cell", block).focus({ preventScroll: true });
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
    itemScroll.addEventListener("scroll", () => { positionEdit(); positionRowMenu(); });
    window.addEventListener("resize", () => { positionMenu(); positionEdit(); positionRowMenu(); });

    // 고친 내용이 없을 때만 바깥 클릭/Esc로 닫는다 (실수로 날아가지 않게)
    document.addEventListener("pointerdown", (event) => {
        const target = event.target;

        // 삭제 메뉴: 메뉴나 글자형 줄(글) 밖을 클릭하면 사라진다
        if (!rowMenu.hidden && !rowMenu.contains(target) && !target.closest(".text-cell")) closeRowMenu();

        if (pmOpen && !isPinned() && !pm.contains(target) && !addBtn.contains(target)) closeMenu();

        if (!pe.hidden && !editForm.isDirty() && !pe.contains(target)
            && !(editBlock && $(".progress-grid", editBlock).contains(target))) {
            closeEdit();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!rowMenu.hidden) {
            closeRowMenu();
        } else if (pmOpen && !isPinned()) {
            closeMenu();
            addBtn.focus();
        } else if (!pe.hidden && !editForm.isDirty()) {
            closeEdit();
        }
    });

    /* =========================================================
       금전 양식
       - 목표 금액은 1만원 이상, 100억원 미만(최대 10자리). 금액 칸은 숫자만 받고 쉼표를 자동으로 넣는다.
       - 달성 현황은 입력값(기간·목표·시작 금액·입금 금액과 주기)과 입출금 내역으로 계산해서 글로 채운다.
         · '적용하기'를 누르면 추천한 값으로 입력칸이 바뀐다. 추천할 것이 없으면 버튼은 나오지 않는다.
         · 적용하기 대신 달성 현황 글을 직접 고쳐 쓰면, 고친 줄의 날짜/금액을 읽어서 입력칸에 반영한다.
       - 입출금 내역은 일자·시간 순서대로 자동으로 놓인다(정렬 기능 없음). 총 액은 시작 금액부터 차례로 더한다.
       ========================================================= */
    const MONEY_MIN = 10000;           // 목표 금액 최소: 1만원
    const MONEY_DIGITS = 10;           // 100억원 미만 = 최대 10자리 (9,999,999,999)
    const OVER_RATIO = 0.2;            // '초과'(과다): 목표 금액의 20% 이상이 더 모일 때
    const EXTEND_RATIO = 1.3;          // 추천 입금 금액이 평균 입금 금액보다 30% 이상 크면 목표일 연장을 넌지시 권한다
    const TX_MAX = 500;                // 입출금 내역 최대 건수
    const MAX_YEAR = 2099;             // 날짜 칸(yy.mm.dd)으로 나타낼 수 있는 마지막 해
    const DAY_MS = 86400000;
    const IMAGE_SEARCH_URL = "https://www.google.com/search?tbm=isch&hl=ko&q="; // 외부 검색: 새 탭에서 이미지 검색
    const IMAGE_SEARCH_HOME = "https://www.google.com/imghp?hl=ko";
    const PHOTO_EDGE = 640;            // 올린 사진은 긴 변을 이 크기로 줄여서 저장한다
    const PHOTO_MAX_CHARS = 1400000;   // 저장 가능한 사진 데이터 길이 (서버 제한과 같다)
    const SUGGEST_EXTEND = "너무 촉박하면 목표한 날을 여유롭게 늘려 보는 건 어떨까요?";

    const moneyStartInput = form.elements.moneyStartDate;
    const moneyEndInput = form.elements.moneyEndDate;
    const moneyTargetInput = form.elements.moneyTarget;
    const moneyInitialInput = form.elements.moneyInitial;
    const moneyDepositInput = form.elements.moneyDeposit;
    const moneyCycleInput = form.elements.moneyCycle;
    const moneyRemainEl = $("#moneyRemain");
    const moneyCurrentEl = $("#moneyCurrent");
    const moneyGoalViewEl = $("#moneyGoalView");
    const moneyHintEl = $("#moneyHint");
    const statusEl = $("#moneyStatus");
    const applyBox = $("#moneyApply");
    const applyBtn = $("#moneyApplyBtn");
    const txList = $("#txList");
    const txRowTemplate = $("#txRowTemplate");
    const clearTxBtn = $("#clearTxBtn");
    const photoBox = $("#moneyPhoto");
    const photoImg = $("#moneyPhotoImg");
    const photoEmpty = $("#moneyPhotoEmpty");
    const photoTools = $("#photoTools");
    const photoFile = $("#photoFile");

    // 달성 현황 글 칸: 서식 없는 글자만 고쳐 쓸 수 있다 (지원하지 않는 브라우저는 일반 편집 + 붙여넣기 때 글자만 받는다)
    statusEl.contentEditable = "plaintext-only";
    if (statusEl.contentEditable !== "plaintext-only") statusEl.contentEditable = "true";

    const fmt = (n) => Math.round(n).toLocaleString("en-US");
    const digitsOf = (text) => String(text).replace(/\D/g, "");

    function amountOf(input) {
        const digits = digitsOf(input.value);
        return digits ? Number(digits) : null;
    }

    function setAmount(input, value) {
        input.value = value === null || value === undefined || value === "" ? "" : fmt(value);
        input.dataset.valid = input.value;
    }

    function shake(el) {
        el.classList.remove("is-shaking");
        void el.offsetWidth; // 같은 애니메이션을 다시 시작하기 위한 리플로우
        el.classList.add("is-shaking");
    }

    form.addEventListener("animationend", (event) => event.target.classList?.remove("is-shaking"));

    let hintTimer = null;
    function showMoneyHint(text, kind = "error", ms = 3400) {
        moneyHintEl.textContent = text;
        moneyHintEl.classList.toggle("is-info", kind === "info");
        moneyHintEl.hidden = false;
        clearTimeout(hintTimer);
        hintTimer = ms ? setTimeout(hideMoneyHint, ms) : null;
    }

    function hideMoneyHint() {
        clearTimeout(hintTimer);
        moneyHintEl.hidden = true;
    }

    /* ---------- 글 → 금액 / 날짜 읽기, 금액 → 글 ---------- */
    // 4,210,000 → "421만원", 214,000 → "21만 4천원", 120,000,000 → "1억 2,000만원"
    function moneyKo(value) {
        const n = Math.round(Math.abs(value));
        if (n === 0) return "0원";
        const eok = Math.floor(n / 1e8);
        const man = Math.floor((n % 1e8) / 1e4);
        const rest = n % 1e4;
        const parts = [];
        if (eok) parts.push(`${eok.toLocaleString("en-US")}억`);
        if (man) parts.push(`${man.toLocaleString("en-US")}만`);
        if (rest) parts.push(rest % 1000 === 0 ? `${rest / 1000}천` : rest.toLocaleString("en-US"));
        return `${value < 0 ? "-" : ""}${parts.join(" ")}원`;
    }

    // 추천 금액은 보기 좋게 올림한다 (모자라지 않도록 항상 올림)
    function niceCeil(value) {
        const unit = value >= 10000 ? 1000 : value >= 1000 ? 100 : 10;
        return Math.max(unit, Math.ceil(value / unit) * unit);
    }

    // "21만 4천원", "1억 2,000만원", "3만 5,000원", "300,000원" 같은 글에서 마지막으로 나온 금액을 읽는다. 없으면 null.
    // 붙어 있는 덩어리(억·만·천이 이어진 것)는 하나의 금액으로 더하고, 따로 떨어진 금액이 여럿이면 마지막 것을 쓴다.
    function parseAmountText(text) {
        const unitValue = { 억: 1e8, 만: 1e4, 천: 1e3 };
        const re = /(\d[\d,]*(?:\.\d+)?)\s*(억|만|천)\s*원?|(\d[\d,]*)\s*원|(\d[\d,]{3,})(?![\d,]*\s*(?:년|월|일|개월|회|번|주|%))/g;
        const groups = [];
        let prevUnit = 0;   // 바로 앞 토큰의 단위(억/만/천). 0이면 단위 없음
        let prevEnd = -1;
        let match;
        while ((match = re.exec(text))) {
            const unit = match[2] ? unitValue[match[2]] : 0;
            const value = unit
                ? Number(match[1].replace(/,/g, "")) * unit
                : Number((match[3] ?? match[4]).replace(/,/g, ""));
            const adjacent = prevEnd >= 0 && /^\s*$/.test(text.slice(prevEnd, match.index));
            const joins = adjacent && prevUnit > 0 && (unit ? unit < prevUnit : true);
            if (joins) groups[groups.length - 1] += value;
            else groups.push(value);
            prevUnit = unit;
            prevEnd = match.index + match[0].length;
        }
        return groups.length ? Math.round(groups[groups.length - 1]) : null;
    }

    // "29년 06월 04일", "29.06.04", "2029-06-04" 에서 마지막 날짜를 읽는다. 없으면 null.
    function parseDateText(text) {
        const re = /(\d{4}|\d{2})\s*(?:년|\.|-|\/)\s*(\d{1,2})\s*(?:월|\.|-|\/)\s*(\d{1,2})\s*일?/g;
        let found = null;
        let match;
        while ((match = re.exec(text))) {
            const year = match[1].length === 4 ? Number(match[1]) : 2000 + Number(match[1]);
            const iso = year >= 2000 && year <= MAX_YEAR ? toIso(year - 2000, match[2], match[3]) : null;
            if (iso) found = iso;
        }
        return found;
    }

    /* ---------- 날짜 계산 (시간대와 상관없이 날짜만 다루도록 UTC 일 수로 계산) ---------- */
    const isoToDays = (iso) => {
        const [y, m, d] = iso.split("-").map(Number);
        return Date.UTC(y, m - 1, d) / DAY_MS;
    };
    const daysToIso = (n) => {
        const d = new Date(n * DAY_MS);
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    };
    const weekdayOf = (iso) => new Date(isoToDays(iso) * DAY_MS).getUTCDay(); // 0=일 … 6=토
    const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

    // iso 의 n개월 뒤 (day 를 정하면 그 날짜, 아니면 iso 의 날짜. 그 달에 없는 날은 말일로)
    function addMonthsIso(iso, n, day = null) {
        const [y, m, d] = iso.split("-").map(Number);
        const index = y * 12 + (m - 1) + n;
        const ny = Math.floor(index / 12);
        const nm = (index % 12) + 1;
        return `${ny}-${pad2(nm)}-${pad2(Math.min(day ?? d, daysInMonth(ny, nm)))}`;
    }

    // a ≤ b 일 때 a부터 b까지가 몇 개월 며칠인지
    function diffMonthsDays(aIso, bIso) {
        const [ay, am] = aIso.split("-").map(Number);
        const [by, bm] = bIso.split("-").map(Number);
        let months = (by - ay) * 12 + (bm - am);
        let anchor = addMonthsIso(aIso, months);
        if (anchor > bIso) {
            months -= 1;
            anchor = addMonthsIso(aIso, months);
        }
        return { months, days: isoToDays(bIso) - isoToDays(anchor) };
    }

    const spanText = ({ months, days }) => (months > 0 ? `${months}개월${days ? ` ${days}일` : ""}` : `${days}일`);
    const koDate = (iso) => `${iso.slice(2, 4)}년 ${iso.slice(5, 7)}월 ${iso.slice(8, 10)}일`;
    const dotDate = (iso) => formatShortDate(iso);

    /* ---------- 입금 주기 읽기 ----------
       "매 달 4일" · "매 주 월요일" · "2주마다" · "격주 금요일" · "매일" · "3일" · "2개월마다" … 못 읽으면 null. */
    const WEEKDAYS = "일월화수목금토";

    function parseCycle(text) {
        const t = String(text).replace(/\s+/g, "").replace(/마다$/, "").replace(/에한번$/, "");
        if (!t) return null;
        let m;

        if (/^(?:매일|날마다|하루|1일|하루에한번)$/.test(t)) return { kind: "day", n: 1, label: "매일" };
        if (t === "격일") return { kind: "day", n: 2, label: "2일마다" };
        if ((m = /^(\d{1,3})일(?:간격)?$/.exec(t)) && Number(m[1]) >= 1) {
            return { kind: "day", n: Number(m[1]), label: `${Number(m[1])}일마다` };
        }

        // 요일: 없으면 null(시작일과 같은 요일), "월"/"월요일" 이면 그 요일, 읽을 수 없으면 undefined
        const weekdayOf2 = (rest) => {
            if (rest === "") return null;
            const w = /^([일월화수목금토])(?:요일)?$/.exec(rest);
            return w ? WEEKDAYS.indexOf(w[1]) : undefined;
        };
        if ((m = /^격주(.*)$/.exec(t))) {
            const weekday = weekdayOf2(m[1]);
            if (weekday !== undefined) return { kind: "week", n: 2, weekday, label: "2주마다" };
        }
        if ((m = /^(\d{1,2})주(?:일)?(?:간격)?(.*)$/.exec(t)) && Number(m[1]) >= 1) {
            const weekday = weekdayOf2(m[2]);
            if (weekday !== undefined) return { kind: "week", n: Number(m[1]), weekday, label: `${Number(m[1])}주마다` };
        }
        if ((m = /^(?:매|한)?주(?:일)?(?:에)?(.*)$/.exec(t))) {
            const weekday = weekdayOf2(m[1]);
            if (weekday !== undefined) return { kind: "week", n: 1, weekday, label: "매 주" };
        }
        if ((m = /^([일월화수목금토])요일$/.exec(t))) return { kind: "week", n: 1, weekday: WEEKDAYS.indexOf(m[1]), label: "매 주" };

        if ((m = /^(?:매|한)?(?:달|월)(?:에)?(?:(\d{1,2})일?|말일)?$/.exec(t))) {
            const day = m[1] ? Number(m[1]) : t.endsWith("말일") ? 31 : null;
            if (day === null || (day >= 1 && day <= 31)) return { kind: "month", n: 1, day, label: "매 달" };
        }
        if ((m = /^(\d{1,2})개월(?:간격)?(?:(\d{1,2})일)?$/.exec(t)) && Number(m[1]) >= 1) {
            const day = m[2] ? Number(m[2]) : null;
            if (day === null || (day >= 1 && day <= 31)) return { kind: "month", n: Number(m[1]), day, label: `${Number(m[1])}개월마다` };
        }
        return null;
    }

    // anchor(시작일) 다음 날부터 주기에 맞는 날짜를 차례로 내놓는다
    function* occurrenceGen(cycle, anchor) {
        if (cycle.kind === "day") {
            let t = isoToDays(anchor);
            for (;;) {
                t += cycle.n;
                yield daysToIso(t);
            }
        } else if (cycle.kind === "week") {
            let t = isoToDays(anchor);
            if (cycle.weekday !== null) {
                t += ((cycle.weekday - weekdayOf(anchor) + 6) % 7) + 1; // 시작일 다음에 처음 오는 그 요일
                yield daysToIso(t);
            }
            for (;;) {
                t += 7 * cycle.n;
                yield daysToIso(t);
            }
        } else {
            const [y, m, d] = anchor.split("-").map(Number);
            const base = y * 12 + (m - 1);
            for (let i = 0; ; i++) {
                const index = base + i * cycle.n;
                const ny = Math.floor(index / 12);
                const nm = (index % 12) + 1;
                const iso = `${ny}-${pad2(nm)}-${pad2(Math.min(cycle.day ?? d, daysInMonth(ny, nm)))}`;
                if (iso > anchor) yield iso;
            }
        }
    }

    // 시작일(anchor)부터 센 입금일 중 after 다음 날부터 limit 까지 (limit 포함)
    function occurrencesBetween(cycle, anchor, after, limit, cap = 6000) {
        const list = [];
        let guard = 0;
        for (const iso of occurrenceGen(cycle, anchor)) {
            if (iso > limit || list.length >= cap || ++guard > 60000) break;
            if (iso > after) list.push(iso);
        }
        return list;
    }

    // after 다음 날부터 센 k번째 입금일. 2099년을 넘으면 null (날짜 칸에 쓸 수 없다)
    function nthOccurrence(cycle, anchor, k, after) {
        let count = 0;
        let guard = 0;
        for (const iso of occurrenceGen(cycle, anchor)) {
            if (Number(iso.slice(0, 4)) > MAX_YEAR || ++guard > 60000) return null;
            if (iso > after && ++count === k) return iso;
        }
        return null;
    }

    /* ---------- 입력값 읽기 ---------- */
    function readMoneyState() {
        const targetRaw = amountOf(moneyTargetInput);
        const depositRaw = amountOf(moneyDepositInput);
        const cycleText = moneyCycleInput.value.trim();
        const entries = sortedTx()
            .filter((tx) => tx.amount)
            .map((tx) => ({ iso: tx.iso, amount: tx.amount, signed: tx.type === "OUT" ? -tx.amount : tx.amount }));

        return {
            S: readShortDate(moneyStartInput),
            E: readShortDate(moneyEndInput),
            T: targetRaw !== null && targetRaw >= MONEY_MIN ? targetRaw : null,
            A0: amountOf(moneyInitialInput) ?? 0,
            D: depositRaw !== null && depositRaw >= 1 ? depositRaw : null,
            cycleText,
            cycle: cycleText ? parseCycle(cycleText) : null,
            entries,
            today: todayString(),
        };
    }

    /* ---------- 계산 ----------
       계획: 시작일 다음 입금일부터 종료일까지(종료일 포함)의 입금일마다 입금 금액을 넣는다.
       모이는 돈 = 시작 금액 + 입금 횟수 × 입금 금액.
       부족 / 딱 맞음 / 더 많음 / 초과(목표 금액의 20% 이상이 더 모임) 로 나눈다. */
    function computeMoney(st) {
        const cur = st.A0 + st.entries.reduce((sum, e) => sum + e.signed, 0);
        const result = { cur, ready: false, problems: [] };

        if (st.cycleText && !st.cycle) result.problems.push("주기를 이해하지 못했어요.\n예) 매 달 4일, 매 주 월요일, 3일");
        if (st.S && st.E && st.E <= st.S) result.problems.push("종료일은 시작일보다 늦어야 해요.");
        if (result.problems.length) return result;
        if (!st.S || !st.E || st.T === null || st.D === null || !st.cycle) return result;

        result.ready = true;
        const { S, E, T, A0, D, cycle } = st;
        const dates = occurrencesBetween(cycle, S, S, E);
        const count = dates.length;
        const projected = A0 + count * D;
        const diff = projected - T;
        Object.assign(result, {
            count,
            projected,
            diff,
            span: spanText(diffMonthsDays(S, E)),
            level: diff < 0 ? "short" : diff === 0 ? "exact" : diff >= T * OVER_RATIO ? "over" : "enough",
        });

        // 계획대로 입금했을 때 목표 금액에 닿는 날
        const need = T - A0;
        result.reachIso = need <= 0 ? S : nthOccurrence(cycle, S, Math.ceil(need / D), S);
        result.planAmount = need > 0 && count > 0 ? niceCeil(need / count) : null;

        // 입출금 내역이 있으면: 평균(입금-출금 합계 ÷ 건수), 지금 속도로 닿는 날, 목표일에 맞추려면 앞으로 낼 금액
        if (st.entries.length) {
            const avg = Math.round(st.entries.reduce((sum, e) => sum + e.signed, 0) / st.entries.length);
            const remaining = T - cur;
            const hist = { avg, remaining, done: remaining <= 0 };
            if (!hist.done) {
                hist.expectIso = avg > 0 ? nthOccurrence(cycle, S, Math.ceil(remaining / avg), st.today) : null;
                const left = occurrencesBetween(cycle, S, st.today, E);
                hist.left = left.length;
                hist.needed = left.length ? niceCeil(remaining / left.length) : null;
                hist.behind = hist.expectIso === null || hist.expectIso > E;
                // 평균이 없거나 음수면 입금 금액(계획)으로 센 날을 연장 추천에 쓴다
                hist.extendIso = hist.expectIso ?? nthOccurrence(cycle, S, Math.ceil(remaining / D), st.today);
                hist.suggestExtend = hist.behind && (hist.needed === null || avg <= 0 || hist.needed >= avg * EXTEND_RATIO);
            }
            result.hist = hist;
        }

        // 추천: 바꿀 점이 있을 때만 (없으면 '적용하기'도 나오지 않는다)
        const options = [];
        if (result.hist) {
            const h = result.hist;
            if (!h.done) {
                if (h.behind && h.extendIso && h.extendIso > E) options.push({ key: "date", iso: h.extendIso });
                if (h.needed !== null && D < h.needed && h.needed < 1e10) options.push({ key: "amount", amount: h.needed });
            }
        } else if (result.level === "short") {
            if (result.reachIso && result.reachIso > E) options.push({ key: "date", iso: result.reachIso });
            if (result.planAmount !== null && D < result.planAmount && result.planAmount < 1e10) {
                options.push({ key: "amount", amount: result.planAmount });
            }
        }
        result.options = options;
        return result;
    }

    /* ---------- 달성 현황 글 만들기 ----------
       한 줄 = { parts: [글 | { t, c }], opt?: 'date'|'amount' }. 빈 줄은 { gap: true }. */
    function buildStatusLines(st, m) {
        if (!m.ready) return m.problems.map((text) => ({ parts: [text], note: true }));

        const lines = [];
        const add = (...parts) => lines.push({ parts });

        add("해당 주기로 기간을 채우면");
        add(m.count ? `${m.span} 간 ${m.count}회 입금합니다.` : "이 기간 안에는 입금일이 없어요.");
        add("→ ", { t: moneyKo(m.projected), c: m.projected >= st.T ? "red" : "blue" }, "이 모입니다.");
        add(m.level === "short" ? `달성 금액보다 ${moneyKo(-m.diff)} 부족합니다.`
            : m.level === "exact" ? "달성 금액과 딱 맞습니다."
                : m.level === "enough" ? `달성 금액보다 ${moneyKo(m.diff)} 더 많습니다.`
                    : `달성 금액보다 ${moneyKo(m.diff)} 초과합니다.`);

        const rel = (iso) => {
            if (!iso) return null;
            if (iso === st.E) return { text: "목표일과 같은", same: true };
            return iso < st.E
                ? { text: `목표보다 ${spanText(diffMonthsDays(iso, st.E))} 빠른` }
                : { text: `목표보다 ${spanText(diffMonthsDays(st.E, iso))} 늦은` };
        };

        if (m.hist) {
            const h = m.hist;
            add(`나의 평균 입금 금액 : ${h.avg < 0 ? "-" : ""}${fmt(Math.abs(h.avg))}`);
            if (h.done) {
                add("이미 목표 금액을 모았어요.");
            } else {
                add("예상 목표 달성일");
                if (h.avg <= 0) {
                    add("= 입금보다 출금이 많아 계산할 수 없어요.");
                } else if (!h.expectIso) {
                    add("= 너무 멀어서 계산할 수 없어요.");
                } else {
                    const gap = h.expectIso === st.E ? "목표일 달성"
                        : h.expectIso > st.E ? `${spanText(diffMonthsDays(st.E, h.expectIso))} 지연`
                            : `${spanText(diffMonthsDays(h.expectIso, st.E))} 빠름`;
                    add(`= ${dotDate(h.expectIso)} [ ${gap} ]`);
                }
                if (h.needed !== null) {
                    add(h.behind || st.D < h.needed
                        ? `지정 목표일에 맞추기 위해서는 앞으로 ${st.cycle.label} ${moneyKo(h.needed)}씩 입금해야합니다.`
                        : "지금 속도라면 목표일 안에 달성할 수 있어요.");
                } else {
                    add("목표일까지 남은 입금일이 없어요.");
                }
            }
        } else if (m.reachIso) {
            const r = rel(m.reachIso);
            add("예상 달성일");
            add("= ", r.text, " ", { t: `[ ${koDate(m.reachIso)} ]`, c: "red" }, " 입니다.");
        } else {
            add("예상 달성일");
            add("= 너무 멀어서 계산할 수 없어요.");
        }

        if (m.options.length) {
            add("[추천]");
            m.options.forEach((option, index) => {
                const text = option.key === "date"
                    ? `${index + 1}. 목표 기간을 ${koDate(option.iso)}로 변경합니다.`
                    : `${index + 1}. 입금 금액을 ${moneyKo(option.amount)}으로 변경합니다.`;
                lines.push({ parts: [text], opt: option.key });
            });
        }

        // 맨 아래에 한 줄 비우고, 넌지시 목표일을 늘려 보도록 권한다
        if (m.hist?.suggestExtend) {
            lines.push({ gap: true, parts: [""] });
            add(SUGGEST_EXTEND);
        }
        return lines;
    }

    /* ---------- 화면 그리기 ---------- */
    let lastPlain = [];          // 마지막으로 그려 준 글(줄마다). 사용자가 고친 줄을 찾는 데 쓴다.
    let statusOptions = [];      // 지금 보이는 추천 선택지
    let chosenKey = "date";      // 라디오로 고른 추천
    let statusStale = false;     // 고쳐 쓰는 중이라 미룬 다시 그리기가 있는가

    function renderStatus(lines) {
        statusEl.replaceChildren();
        lastPlain = [];
        statusOptions = lines.filter((line) => line.opt).map((line) => line.opt);
        if (!statusOptions.includes(chosenKey)) chosenKey = statusOptions[0] ?? "date";

        lines.forEach((line) => {
            const row = document.createElement("div");
            row.className = "ms-line";
            if (line.gap) {
                row.append(document.createElement("br"));
                statusEl.appendChild(row);
                return;
            }
            const textHost = line.opt ? document.createElement("span") : row;
            if (line.opt) textHost.className = "ms-opt-text";
            if (line.note) row.classList.add("ms-note");

            let plain = "";
            line.parts.forEach((part) => {
                const text = typeof part === "string" ? part : part.t;
                plain += text;
                if (typeof part === "string") {
                    String(text).split("\n").forEach((piece, i) => {
                        if (i) textHost.append(document.createElement("br"));
                        textHost.append(piece);
                    });
                } else {
                    const span = document.createElement("span");
                    span.className = part.c === "red" ? "hl-red" : "hl-blue";
                    span.textContent = text;
                    textHost.append(span);
                }
            });
            plain.split("\n").forEach((piece) => lastPlain.push(piece.trim()));

            if (line.opt) {
                row.classList.add("ms-opt");
                row.dataset.opt = line.opt;
                const radio = document.createElement("span");
                radio.className = "ms-radio";
                radio.contentEditable = "false";
                radio.setAttribute("role", "radio");
                radio.setAttribute("aria-label", "이 추천 고르기");
                radio.setAttribute("aria-checked", String(line.opt === chosenKey));
                row.append(textHost, radio);
            }
            statusEl.appendChild(row);
        });

        applyBox.hidden = statusOptions.length === 0;
    }

    function renderMoneyHeader(st, m) {
        const hasCur = st.T !== null || st.entries.length > 0 || amountOf(moneyInitialInput) !== null;
        const set = (el, text) => {
            el.textContent = text ?? "–";
            el.classList.toggle("is-empty", text === null);
        };
        set(moneyCurrentEl, hasCur ? `${m.cur < 0 ? "-" : ""}${fmt(Math.abs(m.cur))}` : null);
        set(moneyGoalViewEl, st.T !== null ? fmt(st.T) : null);
        set(moneyRemainEl, st.T !== null ? fmt(Math.max(0, st.T - m.cur)) : null);
    }

    // 입력값이나 입출금 내역이 바뀔 때마다 부른다
    function refreshMoney() {
        recalcLedger();
        const st = readMoneyState();
        const m = computeMoney(st);
        renderMoneyHeader(st, m);

        if (document.activeElement === statusEl) { // 고쳐 쓰는 중에는 글을 바꾸지 않는다. 끝나면 그린다.
            statusStale = true;
            return;
        }
        statusStale = false;
        renderStatus(buildStatusLines(st, m));
    }

    /* ---------- 달성 현황: 적용하기 / 고쳐 쓰기 ---------- */
    function setDateInput(input, iso) {
        input.value = formatShortDate(iso);
        input.dataset.valid = iso || "";
    }

    function applyChosen() {
        const st = readMoneyState();
        const m = computeMoney(st);
        const option = m.options?.find((item) => item.key === chosenKey) ?? m.options?.[0];
        if (!option) return;

        if (option.key === "date") {
            setDateInput(moneyEndInput, option.iso);
            showMoneyHint(`목표 기간을 ${koDate(option.iso)}로 바꿨어요.`, "info");
        } else {
            setAmount(moneyDepositInput, option.amount);
            showMoneyHint(`입금 금액을 ${moneyKo(option.amount)}으로 바꿨어요.`, "info");
        }
        refreshMoney();
        scheduleSave();
    }

    applyBtn.addEventListener("click", () => {
        if (document.activeElement === statusEl) statusEl.blur(); // 고쳐 쓰던 내용이 있으면 먼저 읽어서 반영한다
        applyChosen();
    });

    statusEl.addEventListener("click", (event) => {
        const radio = event.target.closest(".ms-radio");
        if (!radio) return;
        chosenKey = radio.closest(".ms-opt").dataset.opt;
        $$(".ms-opt", statusEl).forEach((row) => {
            $(".ms-radio", row).setAttribute("aria-checked", String(row.dataset.opt === chosenKey));
        });
    });

    // 붙여넣기는 글자만 (서식이 들어가면 줄 간격이 깨진다)
    statusEl.addEventListener("paste", (event) => {
        event.preventDefault();
        const text = event.clipboardData?.getData("text/plain") ?? "";
        document.execCommand("insertText", false, text);
    });

    statusEl.addEventListener("keydown", (event) => {
        if (event.key === "Escape") statusEl.blur();
    });

    statusEl.addEventListener("focusout", () => {
        const changed = interpretStatusEdit();
        statusStale = false;
        const st = readMoneyState();
        const m = computeMoney(st);
        renderMoneyHeader(st, m);
        renderStatus(buildStatusLines(st, m));
        if (changed) scheduleSave();
        else if (unreadLines.length) askMoneyAi(unreadLines.join("\n"));
    });

    // 고쳐 쓴 줄에서 날짜/금액을 읽어 입력칸에 반영한다. 반영한 게 있으면 true.
    function interpretStatusEdit() {
        const known = new Set(lastPlain);
        const lines = statusEl.innerText.replace(/ /g, " ").split("\n").map((line) => line.trim()).filter(Boolean);
        const changed = lines.filter((line) => !known.has(line));
        unreadLines = [];
        if (!changed.length) return false;

        let applied = false;
        const problems = [];
        const st = readMoneyState();

        for (const line of changed) {
            if (/평균|예상/.test(line)) continue; // 계산해서 보여 주는 줄은 읽지 않는다

            const date = parseDateText(line);
            if (date && /기간|목표일|종료|마감|까지/.test(line)) {
                if (st.S && date <= st.S) {
                    problems.push("종료일은 시작일보다 늦어야 해요.");
                } else {
                    setDateInput(moneyEndInput, date);
                    st.E = date;
                    applied = true;
                }
                continue;
            }

            const amount = parseAmountText(line.replace(/(\d{2,4})\s*(?:년|\.|-|\/)\s*\d{1,2}\s*(?:월|\.|-|\/)\s*\d{1,2}\s*일?/g, " "));
            if (amount === null) {
                unreadLines.push(line);
                continue;
            }

            if (/시작/.test(line)) {
                if (amount < 1e10) {
                    setAmount(moneyInitialInput, amount);
                    applied = true;
                }
            } else if (/입금|씩|넣|저금|저축|납입/.test(line)) {
                if (amount >= 1 && amount < 1e10) {
                    setAmount(moneyDepositInput, amount);
                    applied = true;
                } else {
                    problems.push("입금 금액은 1원 이상 100억원 미만이에요.");
                }
            } else if (/목표/.test(line)) {
                if (amount >= MONEY_MIN && amount < 1e10) {
                    setAmount(moneyTargetInput, amount);
                    applied = true;
                } else {
                    problems.push("목표 금액은 1만원 이상 100억원 미만이에요.");
                }
            } else {
                unreadLines.push(line);
            }
        }

        // 규칙으로 아무것도 못 읽었을 때만 AI에게 맡긴다 (규칙으로 읽히면 AI를 부르지 않는다)
        if (applied || problems.length) unreadLines = [];
        if (problems.length) showMoneyHint(problems[0]);
        else if (!applied && unreadLines.length) showMoneyHint("AI가 읽고 있어요…", "info", 0);
        else if (!applied) showMoneyHint("달성 현황은 입력한 값으로 계산돼요. 날짜나 금액을 고쳐 쓰면 입력값에 반영해요.", "info", 4200);
        else showMoneyHint("고쳐 쓴 내용을 입력값에 반영했어요.", "info");
        return applied;
    }

    /* ---------- 규칙으로 못 읽은 문장은 AI가 읽는다 ----------
       "다음 달 말까지로 늘려 줘", "매 주 월요일에 10만원씩" 같은 문장. 서버(POST /api/goals/ai-money)가
       OpenAI로 해석해서 바꿀 값만 돌려준다. 같은 문장은 한 번만 묻고, 키가 없으면 안내만 한다. */
    const AI_MONEY_URL = "/api/goals/ai-money";
    const aiMoneyAsked = new Map();   // 이미 물어본 문장 → 결과 (같은 문장을 다시 묻지 않는다)
    let unreadLines = [];             // 방금 고쳐 쓴 줄 중 규칙으로 못 읽은 것
    let moneyEpoch = 0;               // 목표를 바꾸면 올라간다 (늦게 온 답이 다른 목표에 들어가지 않게)
    let aiMoneyBusy = false;

    function applyAiMoney(result) {
        const st = readMoneyState();
        let applied = false;

        if (isoOk(result.endDate) && (!st.S || result.endDate > st.S)) {
            setDateInput(moneyEndInput, result.endDate);
            applied = true;
        }
        const amountFields = [
            [moneyTargetInput, result.targetAmount, MONEY_MIN],
            [moneyInitialInput, result.startAmount, 0],
            [moneyDepositInput, result.depositAmount, 1],
        ];
        amountFields.forEach(([input, value, min]) => {
            if (Number.isInteger(value) && value >= min && value < 1e10) {
                setAmount(input, value);
                applied = true;
            }
        });
        const cycle = typeof result.depositCycle === "string" ? result.depositCycle.trim().slice(0, 30) : "";
        if (cycle && parseCycle(cycle)) {
            moneyCycleInput.value = cycle;
            applied = true;
        }
        return applied;
    }

    async function askMoneyAi(text) {
        const key = text.slice(0, 300);
        if (!key || aiMoneyBusy) return;

        const epoch = moneyEpoch;
        let result = aiMoneyAsked.get(key);
        if (result === undefined) {
            aiMoneyBusy = true;
            try {
                const st = readMoneyState();
                result = await request(AI_MONEY_URL, {
                    method: "POST",
                    body: JSON.stringify({
                        text: key,
                        current: {
                            startDate: st.S ?? null,
                            endDate: st.E ?? null,
                            targetAmount: amountOf(moneyTargetInput),
                            startAmount: amountOf(moneyInitialInput),
                            depositAmount: amountOf(moneyDepositInput),
                            depositCycle: moneyCycleInput.value.trim(),
                        },
                    }),
                });
                aiMoneyAsked.set(key, result);
            } catch (error) {
                if (epoch !== moneyEpoch) return;
                showMoneyHint(error.status === 503
                    ? "AI를 쓰려면 서버에 AI 키(GEMINI_API_KEY·ANTHROPIC_API_KEY·OPENAI_API_KEY 중 하나)가 필요해요. 날짜나 금액을 숫자로 고쳐 써 주세요."
                    : "AI가 읽지 못했어요. 날짜나 금액을 숫자로 고쳐 써 주세요.");
                return;
            } finally {
                aiMoneyBusy = false;
            }
        }
        if (epoch !== moneyEpoch) return;

        if (applyAiMoney(result)) {
            refreshMoney();
            scheduleSave();
            showMoneyHint(result.message ? `AI가 이렇게 읽었어요 — ${result.message}` : "AI가 읽은 내용을 입력값에 반영했어요.", "info", 6000);
        } else {
            showMoneyHint("바꿀 값을 찾지 못했어요. 날짜나 금액을 숫자로 고쳐 써 주세요.", "info", 4200);
        }
    }

    /* ---------- 금액/주기 입력 칸 ---------- */
    // 숫자만 받고 쉼표를 넣는다. 열 자리(100억 미만)를 넘으면 더 받지 않는다.
    function formatAmountInput(input) {
        const raw = input.value;
        const caret = input.selectionStart ?? raw.length;
        const before = digitsOf(raw.slice(0, caret)).length;
        let digits = digitsOf(raw).replace(/^0+(?=\d)/, "");
        let tooLong = false;
        if (digits.length > MONEY_DIGITS) {
            digits = digits.slice(0, MONEY_DIGITS);
            tooLong = true;
        }
        const out = digits ? Number(digits).toLocaleString("en-US") : "";
        if (input.value !== out) input.value = out;

        if (document.activeElement === input) { // 쉼표가 들어가도 커서가 제자리에 있게
            let pos = 0;
            let seen = 0;
            const want = Math.min(before, digits.length);
            while (pos < out.length && seen < want) {
                if (/\d/.test(out[pos])) seen += 1;
                pos += 1;
            }
            input.setSelectionRange(pos, pos);
        }
        if (tooLong) {
            shake(input);
            showMoneyHint("금액은 100억원 미만(10자리)까지 쓸 수 있어요.");
        }
        return digits ? Number(digits) : null;
    }

    // 칸을 벗어날 때: 최소값보다 작으면 흔들고 마지막으로 올바랐던 값으로 되돌린다
    function settleAmount(input, min, message) {
        const n = amountOf(input);
        if (n === null) {
            input.dataset.valid = "";
            return;
        }
        if (n < min) {
            shake(input);
            showMoneyHint(message);
            input.value = input.dataset.valid ?? "";
            return;
        }
        input.value = fmt(n);
        input.dataset.valid = input.value;
    }

    const AMOUNT_RULES = [
        [moneyTargetInput, MONEY_MIN, "목표 금액은 1만원 이상, 100억원 미만으로 써 주세요."],
        [moneyInitialInput, 0, ""],
        [moneyDepositInput, 1, "입금 금액은 1원 이상으로 써 주세요."],
    ];

    AMOUNT_RULES.forEach(([input, min, message]) => {
        input.addEventListener("input", () => {
            const n = formatAmountInput(input);
            if (n !== null && n >= min) input.dataset.valid = input.value;
            input.classList.toggle("is-invalid", n !== null && n < min);
        });
        input.addEventListener("blur", () => {
            settleAmount(input, min, message);
            input.classList.remove("is-invalid");
            refreshMoney();
        });
    });

    moneyCycleInput.addEventListener("input", () => {
        moneyCycleInput.classList.toggle("is-invalid", moneyCycleInput.value.trim() !== "" && !parseCycle(moneyCycleInput.value));
    });

    [moneyStartInput, moneyEndInput].forEach(bindDateMask);

    // 입력하는 동안 바로바로 다시 계산한다 (달성 현황 글 칸에서 일어난 입력은 제외)
    $('[data-mode-panel="money"]').addEventListener("input", (event) => {
        if (event.target.closest("#moneyStatus")) return;
        refreshMoney();
    });

    /* ---------- 입출금 내역 ---------- */
    const txRows = () => $$(".tx-row", txList);

    function validTime(text) {
        const m = /^(\d{2}):(\d{2})$/.exec(text);
        return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? text : null;
    }

    // 시간 칸: "9" → 09:00, "930" → 09:30, "2130" → 21:30
    function normalizeTime(text) {
        const d = digitsOf(text).slice(0, 4);
        if (!d) return "";
        const hh = d.length <= 2 ? d.padStart(2, "0") : d.length === 3 ? `0${d[0]}` : d.slice(0, 2);
        const mm = d.length <= 2 ? "00" : d.slice(-2);
        return validTime(`${hh}:${mm}`) ?? null;
    }

    function readTx(row) {
        const dateInput = $(".tx-date", row);
        const timeInput = $(".tx-time", row);
        const iso = readShortDate(dateInput);
        const time = validTime(timeInput.value) ?? "";
        return {
            row,
            iso,
            time,
            type: row.dataset.type || "",
            amount: amountOf($(".tx-amount", row)),
            key: `${iso ?? "9999-12-31"} ${time || "00:00"}`,
        };
    }

    // 일자·시간 순서. 같으면 쓴 순서 그대로.
    function sortedTx() {
        return txRows()
            .map((row, index) => ({ ...readTx(row), index }))
            .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index));
    }

    // 총 액은 시작 금액부터 차례로 더해 칸마다 채운다. 마지막 값(지금 잔액)을 돌려준다.
    function recalcLedger() {
        let total = amountOf(moneyInitialInput) ?? 0;
        sortedTx().forEach((tx) => {
            const cell = $(".tx-total", tx.row);
            if (!tx.amount) {
                cell.textContent = "";
                cell.classList.remove("is-negative");
                return;
            }
            total += tx.type === "OUT" ? -tx.amount : tx.amount;
            cell.textContent = `${total < 0 ? "-" : ""}${fmt(Math.abs(total))}`;
            cell.classList.toggle("is-negative", total < 0);
        });
        return total;
    }

    // 화면에 놓인 순서를 일자·시간 순서로 맞춘다 (칸에서 벗어난 뒤에만 부른다)
    function reorderTx() {
        const sorted = sortedTx();
        const current = txRows();
        if (sorted.every((tx, i) => tx.row === current[i])) return;
        sorted.forEach((tx) => txList.appendChild(tx.row));
    }

    function setTxType(row, type) {
        row.dataset.type = type || "";
        row.classList.toggle("is-in", type === "IN");
        row.classList.toggle("is-out", type === "OUT");
        $$(".tx-type-btn", row).forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.type === type));
        });
    }

    function addTxRow(item) {
        const row = cloneFirst(txRowTemplate);
        const dateInput = $(".tx-date", row);
        const timeInput = $(".tx-time", row);
        bindDateMask(dateInput);
        setShortDate(dateInput, item?.date ?? null);
        timeInput.value = item?.time ?? "";
        timeInput.dataset.valid = item?.time ?? "";
        setAmount($(".tx-amount", row), item?.amount ?? null);
        setTxType(row, item?.type ?? "");
        txList.appendChild(row);
        return row;
    }

    function ensureBlankTx() {
        if (!txRows().length) addTxRow();
    }

    function syncClearTx() {
        clearTxBtn.disabled = !$(".tx-select:checked", txList);
    }

    function collectTransactions() {
        return sortedTx()
            .filter((tx) => tx.amount)
            .map((tx) => ({ date: tx.iso, time: tx.time || null, type: tx.type === "OUT" ? "OUT" : "IN", amount: tx.amount }));
    }

    $("#addTxBtn").addEventListener("click", () => {
        if (txRows().length >= TX_MAX) return;
        const blank = txRows().find((row) => !readTx(row).amount && !$(".tx-date", row).value);
        const row = blank ?? addTxRow();
        $(".tx-date", row).focus();
        row.scrollIntoView({ block: "nearest" });
    });

    txList.addEventListener("input", (event) => {
        const target = event.target;
        const row = target.closest(".tx-row");
        if (!row) return;

        if (target.matches(".tx-amount")) {
            const n = formatAmountInput(target);
            if (n !== null && n >= 1) {
                target.dataset.valid = target.value;
                if (!row.dataset.type) setTxType(row, "IN");                 // 금액을 쓰면 일단 입금
                const dateInput = $(".tx-date", row);
                if (!readShortDate(dateInput)) setShortDate(dateInput, todayString()); // 날짜가 비어 있으면 오늘
            }
        } else if (target.matches(".tx-time")) {
            const d = digitsOf(target.value).slice(0, 4);
            const out = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
            if (target.value !== out) target.value = out;
            if (validTime(out)) target.dataset.valid = out;
        }
    });

    txList.addEventListener("click", (event) => {
        const button = event.target.closest(".tx-type-btn");
        if (!button) return;
        const row = button.closest(".tx-row");
        setTxType(row, button.dataset.type);
        const dateInput = $(".tx-date", row);
        if (!readShortDate(dateInput)) setShortDate(dateInput, todayString());
        refreshMoney();
        scheduleSave();
    });

    txList.addEventListener("change", (event) => {
        if (event.target.matches(".tx-select")) syncClearTx();
    });

    // 한 줄에서 벗어나면 마무리: 시간을 다듬고, 일자·시간 순서로 다시 놓고, 총 액을 다시 계산한다
    txList.addEventListener("focusout", (event) => {
        const row = event.target.closest(".tx-row");
        if (!row || row.contains(event.relatedTarget)) return;

        const timeInput = $(".tx-time", row);
        if (timeInput.value) {
            const fixed = normalizeTime(timeInput.value);
            if (fixed === null) {
                shake(timeInput);
                timeInput.value = timeInput.dataset.valid ?? "";
            } else {
                timeInput.value = fixed;
                timeInput.dataset.valid = fixed;
            }
        }
        const amountInput = $(".tx-amount", row);
        settleAmount(amountInput, 1, "금액은 1원 이상으로 써 주세요.");

        reorderTx();
        refreshMoney();
        scheduleSave();
    });

    clearTxBtn.addEventListener("click", () => {
        const checked = $$(".tx-select:checked", txList);
        if (!checked.length) return;
        if (!confirm(`선택한 입출금 내역 ${checked.length}건을 삭제할까요?`)) return;
        checked.forEach((box) => box.closest(".tx-row").remove());
        ensureBlankTx();
        syncClearTx();
        refreshMoney();
        scheduleSave();
    });

    /* ---------- 사진 ----------
       - 내 컴퓨터에서 업로드: 파일을 골라 줄여서 저장한다.
       - 외부 검색: 새 탭에서 이미지를 검색한다. 마음에 드는 사진을 우클릭 → '이미지 복사' 하고 이 화면으로 돌아오면
         자동으로 들어가고, 안 들어가면 Ctrl+V 로 붙여넣으면 된다. 사진을 이 칸으로 끌어다 놓아도 된다.
         (다른 사이트의 사진을 브라우저가 직접 가져올 수는 없어서 이 방법을 쓴다.) */
    let photoValue = "";
    let searching = false;

    function setPhoto(value) {
        photoValue = value || "";
        photoImg.hidden = !photoValue;
        photoEmpty.hidden = Boolean(photoValue);
        photoTools.hidden = !photoValue;
        if (photoValue) photoImg.src = photoValue;
        else photoImg.removeAttribute("src");
    }

    photoImg.addEventListener("error", () => {
        if (!photoValue) return;
        setPhoto("");
        showMoneyHint("사진을 불러오지 못했어요. 다른 사진으로 해 보세요.");
        scheduleSave();
    });

    function loadImageElement(blob) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽지 못했어요.")); };
            img.src = url;
        });
    }

    // 긴 변이 PHOTO_EDGE 이하가 되게 줄여서 JPEG 데이터 주소로 만든다
    async function shrinkImage(blob) {
        const img = await loadImageElement(blob);
        const scale = Math.min(1, PHOTO_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; // 투명한 PNG 가 검게 보이지 않게
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let quality = 0.86;
        let data = canvas.toDataURL("image/jpeg", quality);
        while (data.length > PHOTO_MAX_CHARS && quality > 0.4) {
            quality -= 0.12;
            data = canvas.toDataURL("image/jpeg", quality);
        }
        if (data.length > PHOTO_MAX_CHARS) throw new Error("사진이 너무 커요. 더 작은 사진을 골라 주세요.");
        return data;
    }

    async function takeImageBlob(blob) {
        try {
            setPhoto(await shrinkImage(blob));
            searching = false;
            hideMoneyHint();
            scheduleSave();
        } catch (error) {
            showMoneyHint(error.message || "사진을 넣지 못했어요.");
        }
    }

    // 주소(이미지 URL)를 붙여넣거나 끌어다 놓은 경우: 그 주소를 그대로 보여 준다
    function takeImageUrl(url) {
        const clean = String(url).trim();
        if (!/^https?:\/\/\S+$/i.test(clean) || clean.length > 1500) return false;
        setPhoto(clean);
        searching = false;
        hideMoneyHint();
        scheduleSave();
        return true;
    }

    $("#photoUploadBtn").addEventListener("click", () => photoFile.click());
    $("#photoChangeBtn").addEventListener("click", () => photoFile.click());
    photoFile.addEventListener("change", () => {
        const file = photoFile.files?.[0];
        photoFile.value = "";
        if (file && file.type.startsWith("image/")) takeImageBlob(file);
        else if (file) showMoneyHint("이미지 파일만 넣을 수 있어요.");
    });

    function openImageSearch() {
        const title = form.elements.title.value.trim();
        const url = title ? IMAGE_SEARCH_URL + encodeURIComponent(title) : IMAGE_SEARCH_HOME;
        window.open(url, "_blank", "noopener,noreferrer");
        searching = true;
        showMoneyHint("검색한 사진을 우클릭 → ‘이미지 복사’ 후 이 화면으로 돌아오면 들어가요. (안 들어가면 Ctrl+V)", "info", 30000);
    }
    $("#photoSearchBtn").addEventListener("click", openImageSearch);
    $("#photoSearchBtn2").addEventListener("click", openImageSearch);
    $("#photoRemoveBtn").addEventListener("click", () => {
        setPhoto("");
        scheduleSave();
    });

    // 검색하러 갔다 돌아왔을 때, 복사해 온 이미지가 있으면 자동으로 넣는다 (브라우저가 허락을 물을 수 있다)
    window.addEventListener("focus", async () => {
        if (!searching || formMode !== "money" || !navigator.clipboard?.read) return;
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const type = item.types.find((t) => t.startsWith("image/"));
                if (type) {
                    await takeImageBlob(await item.getType(type));
                    return;
                }
            }
        } catch (_) { /* 허락하지 않았거나 지원하지 않으면 Ctrl+V 로 붙여넣으면 된다 */ }
    });

    document.addEventListener("paste", (event) => {
        if (formMode !== "money" || event.target.closest?.("input, textarea, [contenteditable]")) return;
        const data = event.clipboardData;
        if (!data) return;
        const file = Array.from(data.files ?? []).find((f) => f.type.startsWith("image/"));
        if (file) {
            event.preventDefault();
            takeImageBlob(file);
        } else if (takeImageUrl(data.getData("text/plain"))) {
            event.preventDefault();
        }
    });

    ["dragenter", "dragover"].forEach((name) => photoBox.addEventListener(name, (event) => {
        event.preventDefault();
        photoBox.classList.add("is-over");
    }));
    ["dragleave", "drop"].forEach((name) => photoBox.addEventListener(name, () => photoBox.classList.remove("is-over")));
    photoBox.addEventListener("drop", (event) => {
        event.preventDefault();
        const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
        if (file) {
            takeImageBlob(file);
            return;
        }
        const html = event.dataTransfer?.getData("text/html") ?? "";
        const src = /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1];
        const uri = event.dataTransfer?.getData("text/uri-list")?.split("\n").find((line) => line && !line.startsWith("#"));
        if (!(src && takeImageUrl(src)) && !(uri && takeImageUrl(uri))) showMoneyHint("이미지를 가져오지 못했어요. 사진을 복사해서 붙여넣어 보세요.");
    });

    /* ---------- 저장/불러오기 ---------- */
    function collectMoney() {
        const target = amountOf(moneyTargetInput);
        return {
            targetAmount: target !== null && target >= MONEY_MIN ? target : null,
            startAmount: amountOf(moneyInitialInput),
            depositAmount: amountOf(moneyDepositInput),
            depositCycle: moneyCycleInput.value.trim(),
            photo: photoValue,
            transactions: collectTransactions(),
        };
    }

    function fillMoney(goal) {
        setShortDate(moneyStartInput, goal.startDate);
        setShortDate(moneyEndInput, goal.endDate);
        setAmount(moneyTargetInput, goal.targetAmount);
        setAmount(moneyInitialInput, goal.startAmount);
        setAmount(moneyDepositInput, goal.depositAmount);
        moneyCycleInput.value = goal.depositCycle ?? "";
        setPhoto(goal.photo ?? "");
        (goal.transactions ?? []).forEach((item) => addTxRow(item));
        ensureBlankTx();
        reorderTx();
        syncClearTx();
        refreshMoney();
    }

    function clearMoney() {
        moneyEpoch += 1;
        unreadLines = [];
        [moneyStartInput, moneyEndInput].forEach((input) => { input.dataset.valid = ""; });
        [moneyTargetInput, moneyInitialInput, moneyDepositInput].forEach((input) => {
            input.dataset.valid = "";
            input.classList.remove("is-invalid");
        });
        moneyCycleInput.classList.remove("is-invalid");
        txList.replaceChildren();
        setPhoto("");
        searching = false;
        hideMoneyHint();
        chosenKey = "date";
        statusStale = false;
        syncClearTx();
    }


    /* =========================================================
       AI 자율 작성
       - 깃펜을 누르면 도우미 말풍선(알약)과 입력칸이 나타난다. 누르기 전에는 깃펜과 줄 노트만 보인다.
       - 하고 싶은 목표를 자연어로 보내면 서버(POST /api/goals/ai-form)가 양식을 만들어 준다.
         AI 키가 설정돼 있으면 AI가, 없으면 기본 틀로 만든다. (키는 서버에만 있고 이 파일에는 없다.)
       - 만들어진 양식은 기간 + 블록(항목 표·체크리스트·습관표·진행도·기록표·메모)으로 이뤄진다.
         어떤 블록을 어떤 순서로 쓸지는 AI가 목표에 맞게 고른다. 모든 칸은 클릭해서 바로 고치고, 블록마다 삭제할 수 있다.
       - 줄 노트(자유 메모)는 도움 없이도 바로 쓸 수 있다.
       ========================================================= */
    const AI_URL = "/api/goals/ai-form";
    const AI_FIELD_MAX = 12;       // 항목 표 한 개의 최대 줄 수
    const AI_ITEM_MAX = 30;        // 체크리스트 한 개의 최대 줄 수
    const AI_HISTORY = 8;          // 서버에 같이 보내는 최근 대화 수
    const AI_MESSAGE_KEEP = 60;    // 저장해 두는 대화 수

    const aiQuill = $("#aiQuill");
    const aiChat = $("#aiChat");
    const aiCompose = $("#aiCompose");
    const aiSendBtn = $("#aiSendBtn");
    const aiForm = $("#aiForm");
    const aiStartInput = form.elements.aiStartDate;
    const aiEndInput = form.elements.aiEndDate;
    const freeMemo = form.elements.freeMemo;

    let aiMessages = [];     // 저장되는 대화: [{ role: "user" | "bot", text }]
    let aiBusy = false;
    let aiEpoch = 0;         // 목표를 바꾸거나 새로 만들면 올라간다 (늦게 도착한 답이 엉뚱한 목표에 들어가지 않게)
    [aiStartInput, aiEndInput].forEach(bindDateMask);

    function setAiOpen(open) {
        aiChat.hidden = !open;
        aiCompose.hidden = !open;
        aiQuill.setAttribute("aria-expanded", String(open));
    }

    function showAiForm(show) {
        aiForm.hidden = !show;
    }

    aiQuill.addEventListener("click", () => {
        if (aiChat.hidden) {
            setAiOpen(true);
            aiPrompt.focus({ preventScroll: true });
        } else if (!aiMessages.length && aiForm.hidden && !aiPrompt.value.trim()) {
            setAiOpen(false); // 아직 아무것도 하지 않았으면 다시 접는다
        } else {
            aiPrompt.focus({ preventScroll: true });
        }
    });

    /* ---------- 대화 ---------- */
    function addAiMessage(role, text, state = "") {
        const row = document.createElement("div");
        row.className = `ai-msg${role === "user" ? " is-user" : ""}${state ? ` is-${state}` : ""}`;
        const pill = document.createElement("div");
        pill.className = "ai-pill";
        pill.textContent = text;
        row.appendChild(pill);
        chatMessages.appendChild(row);
        row.scrollIntoView({ block: "nearest" });
        return row;
    }

    function rememberAiMessage(role, text) {
        aiMessages.push({ role, text });
        if (aiMessages.length > AI_MESSAGE_KEEP) aiMessages = aiMessages.slice(-AI_MESSAGE_KEEP);
    }

    function autoGrowPrompt() {
        aiPrompt.style.height = "auto";
        aiPrompt.style.height = `${Math.min(aiPrompt.scrollHeight, 150)}px`;
    }

    function autoGrowMemo() {
        freeMemo.style.height = "auto";
        freeMemo.style.height = `${freeMemo.scrollHeight}px`;
    }

    function syncSend() {
        aiSendBtn.disabled = aiBusy || !aiPrompt.value.trim();
    }

    /* ---------- 만들어진 양식: 블록을 쌓아서 만든다 ----------
       AI(또는 기본 규칙)가 목표에 맞는 블록을 골라 준다. 사용자도 아래 "+ …" 버튼으로 블록을 더하고, 블록마다 "삭제"로 뺄 수 있다.
         table     항목 표    (이름 | 내용)
         checklist 체크리스트 (순서 있는 할 일)
         tracker   습관표     (습관 × 요일/주차 체크)
         progress  진행도     (시작 → 현재 → 목표, 막대)
         log       기록표     (날짜별로 한 줄씩)
         note      메모       (짧은 글) */
    const BLOCK_NAMES = { table: "항목 표", checklist: "체크리스트", tracker: "습관표", progress: "진행도", log: "기록표", note: "메모" };
    const WEEK = ["월", "화", "수", "목", "금", "토", "일"];
    const AI_BLOCK_MAX = 10;
    const AI_TRACK_MAX = 10;       // 습관표 줄
    const AI_TRACK_COL_MAX = 14;   // 습관표 칸
    const AI_LOG_ROW_MAX = 60;     // 기록표 줄
    const AI_LOG_COL_MAX = 5;      // 기록표 열

    const aiBlocks = $("#aiBlocks");
    const aiUndo = $("#aiUndo");

    const str = (value, max) => String(value ?? "").slice(0, max);
    const arr = (value) => (Array.isArray(value) ? value : []);

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function deleteButton(label) {
        const button = el("button", "ai-del", "✕");
        button.type = "button";
        button.setAttribute("aria-label", label);
        return button;
    }

    function textInput(className, { value = "", max, placeholder = "", label }) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = className;
        input.maxLength = max;
        input.autocomplete = "off";
        input.value = value;
        if (placeholder) input.placeholder = placeholder;
        if (label) input.setAttribute("aria-label", label);
        return input;
    }

    function rowAddButton(label) {
        const button = el("button", "ai-row-add", "+ 줄");
        button.type = "button";
        button.setAttribute("aria-label", label);
        return button;
    }

    // 블록 껍데기: [종류] 이름 ........ 삭제
    function blockShell(type, title) {
        const block = el("section", "ai-block");
        block.dataset.type = type;
        const head = el("div", "ai-block-head");
        const del = el("button", "ai-block-del", "삭제");
        del.type = "button";
        del.setAttribute("aria-label", `${BLOCK_NAMES[type]} 지우기`);
        head.append(
            el("span", "ai-block-kind", BLOCK_NAMES[type]),
            textInput("ai-block-title", { value: title, max: 40, placeholder: `${BLOCK_NAMES[type]} 이름`, label: `${BLOCK_NAMES[type]} 이름` }),
            del,
        );
        const body = el("div", "ai-block-body");
        block.append(head, body);
        return { block, body };
    }

    /* ----- 항목 표 ----- */
    function addTableRow(table, label = "", value = "") {
        const row = el("div", "ai-row");
        const labelCell = el("div", "goal-table-label ai-label-cell");
        labelCell.appendChild(textInput("ai-label", { value: label, max: 30, placeholder: "항목", label: "항목 이름" }));
        const valueCell = el("div", "goal-table-cell ai-value-cell");
        valueCell.append(textInput("ai-value", { value, max: 255, placeholder: "클릭하여 작성", label: "항목 내용" }), deleteButton("이 줄 지우기"));
        row.append(labelCell, valueCell);
        table.appendChild(row);
        return row;
    }

    /* ----- 체크리스트 ----- */
    function addChecklistItem(list, item) {
        const row = el("div", "ai-item");
        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "ai-check";
        check.checked = Boolean(item?.done);
        check.setAttribute("aria-label", "완료");
        row.classList.toggle("is-done", check.checked);
        row.append(check, textInput("ai-item-text", { value: item?.text ?? "", max: 100, placeholder: "클릭하여 작성", label: "체크리스트 항목" }), deleteButton("이 줄 지우기"));
        list.appendChild(row);
        return row;
    }

    /* ----- 습관표 ----- */
    function addTrackRow(tbody, columnCount, track) {
        const row = el("tr", "ai-track");
        const head = el("th");
        head.scope = "row";
        head.append(textInput("ai-track-label", { value: track?.label ?? "", max: 30, placeholder: "습관 이름", label: "습관 이름" }), deleteButton("이 줄 지우기"));
        row.appendChild(head);
        for (let i = 0; i < columnCount; i += 1) {
            const cell = el("td");
            const box = document.createElement("input");
            box.type = "checkbox";
            box.className = "ai-track-check";
            box.checked = Boolean(arr(track?.checks)[i]);
            cell.appendChild(box);
            row.appendChild(cell);
        }
        tbody.appendChild(row);
        labelTrackChecks(row);
        return row;
    }

    // 체크 칸마다 "운동하기 · 월" 같은 이름을 붙여 화면 읽기 도구에서도 알 수 있게
    function labelTrackChecks(row) {
        const table = row.closest("table");
        if (!table) return;
        const names = $$("thead .ai-col-name", table).map((input) => input.value.trim());
        const label = $(".ai-track-label", row).value.trim() || "습관";
        $$(".ai-track-check", row).forEach((box, i) => box.setAttribute("aria-label", `${label} · ${names[i] || i + 1}`));
    }

    /* ----- 기록표 ----- */
    function addLogRow(tbody, columns, cells = []) {
        const row = el("tr", "ai-log-row");
        columns.forEach((name, i) => {
            const cell = el("td");
            cell.appendChild(textInput("ai-log-cell", { value: cells[i] ?? "", max: 100, label: name || `${i + 1}번째 칸` }));
            if (i === columns.length - 1) {
                cell.classList.add("ai-last-cell");
                cell.appendChild(deleteButton("이 줄 지우기"));
            }
            row.appendChild(cell);
        });
        tbody.appendChild(row);
        return row;
    }

    function headRow(columns, { lead = false } = {}) {
        const thead = el("thead");
        const row = el("tr");
        if (lead) row.appendChild(el("th", "ai-lead"));
        columns.forEach((name) => {
            const th = el("th");
            th.scope = "col";
            th.appendChild(textInput("ai-col-name", { value: name, max: 12, placeholder: "칸", label: "칸 이름" }));
            row.appendChild(th);
        });
        thead.appendChild(row);
        return thead;
    }

    /* ----- 진행도 ----- */
    const numberText = (n) => (typeof n === "number" && Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "");
    const readNumber = (input) => {
        const text = input.value.replace(/,/g, "").trim();
        if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null;
        const n = Number(text);
        return Number.isFinite(n) && Math.abs(n) < 1e9 ? n : null;
    };

    function numberField(cls, label, value) {
        const wrap = el("label", "ai-num-field");
        const input = textInput(`ai-num ${cls}`, { value: numberText(value), max: 12, placeholder: "-", label });
        input.inputMode = "decimal";
        wrap.append(el("span", "ai-num-label", label), input);
        return wrap;
    }

    function refreshProgress(block) {
        const start = readNumber($(".ai-start", block)) ?? 0;
        const current = readNumber($(".ai-current", block));
        const target = readNumber($(".ai-target", block));
        const unit = $(".ai-unit", block).value.trim();
        const fill = $(".ai-bar-fill", block);
        const text = $(".ai-bar-text", block);
        if (target === null || target === start) {
            fill.style.width = "0%";
            text.textContent = "목표 값을 적으면 진행 막대가 채워져요.";
            return;
        }
        const now = current ?? start;
        const ratio = Math.max(0, Math.min(1, (now - start) / (target - start)));
        const left = Math.abs(target - now);
        fill.style.width = `${Math.round(ratio * 100)}%`;
        text.textContent = ratio >= 1
            ? `목표 달성! (${Math.round(ratio * 100)}%)`
            : `${Math.round(ratio * 100)}% · 목표까지 ${numberText(left)}${unit}`;
    }

    /* ----- 블록 하나 그리기 ----- */
    function renderBlock(data) {
        const type = BLOCK_NAMES[data?.type] ? data.type : null;
        if (!type) return null;
        const { block, body } = blockShell(type, str(data.title, 40));

        if (type === "table") {
            const table = el("div", "goal-table ai-table ai-fields");
            const rows = arr(data.rows).slice(0, AI_FIELD_MAX);
            (rows.length ? rows : [{}, {}]).forEach((row) => addTableRow(table, str(row?.label, 30), str(row?.value, 255)));
            body.append(table, rowAddButton("표에 줄 추가"));
        } else if (type === "checklist") {
            const list = el("div", "ai-items");
            const items = arr(data.items).slice(0, AI_ITEM_MAX);
            (items.length ? items : [{}]).forEach((item) => addChecklistItem(list, { text: str(item?.text, 100), done: Boolean(item?.done) }));
            const add = el("button", "add-item-btn ai-item-add", "+");
            add.type = "button";
            add.setAttribute("aria-label", "체크리스트에 줄 추가");
            body.append(list, add);
        } else if (type === "tracker") {
            let columns = arr(data.columns).slice(0, AI_TRACK_COL_MAX).map((c) => str(c, 12));
            if (!columns.length) columns = WEEK.slice();
            const table = el("table", "ai-grid ai-tracker");
            table.style.setProperty("--cols", columns.length);
            const tbody = el("tbody");
            table.append(headRow(columns, { lead: true }), tbody);
            const tracks = arr(data.tracks).slice(0, AI_TRACK_MAX);
            (tracks.length ? tracks : [{}]).forEach((track) => addTrackRow(tbody, columns.length, { label: str(track?.label, 30), checks: arr(track?.checks) }));
            const scroll = el("div", "ai-grid-scroll");
            scroll.appendChild(table);
            body.append(scroll, rowAddButton("습관표에 줄 추가"));
        } else if (type === "progress") {
            const wrap = el("div", "ai-progress");
            const unit = textInput("ai-unit", { value: str(data.unit, 10), max: 10, placeholder: "단위", label: "단위" });
            const unitField = el("label", "ai-num-field ai-unit-field");
            unitField.append(el("span", "ai-num-label", "단위"), unit);
            const fields = el("div", "ai-num-row");
            fields.append(numberField("ai-start", "시작", data.start), numberField("ai-current", "현재", data.current),
                numberField("ai-target", "목표", data.target), unitField);
            const bar = el("div", "ai-bar");
            bar.appendChild(el("div", "ai-bar-fill"));
            wrap.append(fields, bar, el("p", "ai-bar-text"));
            body.appendChild(wrap);
        } else if (type === "log") {
            let columns = arr(data.columns).slice(0, AI_LOG_COL_MAX).map((c) => str(c, 12));
            if (columns.length < 2) columns = ["날짜", "기록"];
            const table = el("table", "ai-grid ai-log");
            const tbody = el("tbody");
            table.append(headRow(columns), tbody);
            arr(data.entries).slice(0, AI_LOG_ROW_MAX).forEach((entry) => addLogRow(tbody, columns, arr(entry).map((c) => str(c, 100))));
            const scroll = el("div", "ai-grid-scroll");
            scroll.appendChild(table);
            body.append(scroll, rowAddButton("기록표에 줄 추가"));
        } else if (type === "note") {
            const note = document.createElement("textarea");
            note.className = "ai-note";
            note.rows = 2;
            note.maxLength = 1000;
            note.placeholder = "클릭하여 작성";
            note.setAttribute("aria-label", "메모");
            note.value = str(data.text, 1000);
            body.appendChild(note);
        }

        if (type === "progress") refreshProgress(block);
        return block;
    }

    function appendBlock(data) {
        const block = renderBlock(data);
        if (block) aiBlocks.appendChild(block);
        if (block && data.type === "note") growNote($(".ai-note", block));
        return block;
    }

    function growNote(note) {
        if (!note || !note.offsetParent) return; // 화면에 안 보이면 높이를 잴 수 없다 (CSS 최소 높이로 둔다)
        note.style.height = "auto";
        note.style.height = `${note.scrollHeight + 2}px`;
    }

    function clearBlocks() {
        aiBlocks.replaceChildren();
    }

    function liveBlocks() {
        return $$(".ai-block", aiBlocks);
    }

    /* ----- 모으기 (저장 / 서버에 보내는 모양) ----- */
    function collectBlock(block) {
        const type = block.dataset.type;
        const title = $(".ai-block-title", block).value.trim();
        const names = () => $$("thead .ai-col-name", block).map((input) => input.value.trim());
        switch (type) {
            case "table":
                return {
                    type, title,
                    rows: $$(".ai-row", block)
                        .map((row) => ({ label: $(".ai-label", row).value.trim(), value: $(".ai-value", row).value.trim() }))
                        .filter((row) => row.label || row.value),
                };
            case "checklist":
                return {
                    type, title,
                    items: $$(".ai-item", block)
                        .map((item) => ({ text: $(".ai-item-text", item).value.trim(), done: $(".ai-check", item).checked }))
                        .filter((item) => item.text),
                };
            case "tracker":
                return {
                    type, title, columns: names(),
                    tracks: $$(".ai-track", block)
                        .map((row) => ({ label: $(".ai-track-label", row).value.trim(), checks: $$(".ai-track-check", row).map((box) => box.checked) }))
                        .filter((track) => track.label || track.checks.some(Boolean)),
                };
            case "progress":
                return {
                    type, title, unit: $(".ai-unit", block).value.trim(),
                    start: readNumber($(".ai-start", block)), current: readNumber($(".ai-current", block)), target: readNumber($(".ai-target", block)),
                };
            case "log":
                return {
                    type, title, columns: names(),
                    entries: $$(".ai-log-row", block)
                        .map((row) => $$(".ai-log-cell", row).map((input) => input.value.trim()))
                        .filter((cells) => cells.some(Boolean)),
                };
            default:
                return { type: "note", title, text: $(".ai-note", block).value.trim() };
        }
    }

    function collectBlocks() {
        return liveBlocks().map(collectBlock);
    }

    // 예전 저장 모양(v1: 항목 표 + 체크리스트)을 블록으로 바꾼다
    function blocksFromSaved(data) {
        if (Array.isArray(data.blocks)) return data.blocks;
        const blocks = [];
        if (arr(data.fields).length) blocks.push({ type: "table", title: "", rows: data.fields });
        arr(data.sections).forEach((section) => blocks.push({ type: "checklist", title: section?.title ?? "", items: section?.items }));
        return blocks;
    }

    // 새 블록의 기본 모양 (+ 버튼)
    function defaultBlock(type) {
        const title = BLOCK_NAMES[type];
        switch (type) {
            case "table": return { type, title, rows: [] };
            case "checklist": return { type, title, items: [] };
            case "tracker": return { type, title, columns: WEEK, tracks: [] };
            case "progress": return { type, title, unit: "", start: 0, current: 0, target: null };
            case "log": return { type, title, columns: ["날짜", "기록", "메모"], entries: [] };
            default: return { type: "note", title, text: "" };
        }
    }

    /* ----- 되돌리기 ----- */
    let undoTimer = 0;
    let undoAction = null;

    function showUndo(message, action) {
        clearTimeout(undoTimer);
        undoAction = action;
        $(".ai-undo-text", aiUndo).textContent = message;
        $(".ai-undo-btn", aiUndo).hidden = !action;
        aiUndo.hidden = false;
        undoTimer = setTimeout(hideUndo, 8000);
    }

    function hideUndo() {
        clearTimeout(undoTimer);
        undoAction = null;
        aiUndo.hidden = true;
    }

    $(".ai-undo-btn", aiUndo).addEventListener("click", () => {
        const action = undoAction;
        hideUndo();
        if (action) {
            action();
            scheduleSave();
        }
    });

    // 지금 양식 전체(기간 + 블록 + 보이는지)를 사진 찍어 둔다
    function snapshotAi() {
        return {
            start: readShortDate(aiStartInput),
            end: readShortDate(aiEndInput),
            blocks: collectBlocks(),
            shown: !aiForm.hidden,
        };
    }

    function restoreAi(snapshot) {
        setShortDate(aiStartInput, snapshot.start);
        setShortDate(aiEndInput, snapshot.end);
        clearBlocks();
        snapshot.blocks.forEach(appendBlock);
        showAiForm(snapshot.shown);
        updateDday();
    }

    function deleteBlock(block) {
        const next = block.nextElementSibling;
        const name = $(".ai-block-title", block).value.trim() || BLOCK_NAMES[block.dataset.type];
        block.remove();
        showUndo(`'${name}'을(를) 지웠어요.`, () => aiBlocks.insertBefore(block, next && next.isConnected ? next : null));
        scheduleSave();
    }

    // 만든 양식 모두 지우기 (기간 포함). 대화는 남는다.
    $("#aiResetBtn").addEventListener("click", () => {
        const snapshot = snapshotAi();
        clearBlocks();
        setShortDate(aiStartInput, null);
        setShortDate(aiEndInput, null);
        showAiForm(false);
        updateDday();
        showUndo("만든 양식을 모두 지웠어요.", () => restoreAi(snapshot));
        scheduleSave();
    });

    function clearAiForm() {
        clearBlocks();
        hideUndo();
    }

    // 저장할 문자열: 대화 + 만들어진 양식. 비어 있으면 빈 문자열.
    function collectAiForm() {
        const blocks = collectBlocks();
        const shown = !aiForm.hidden;
        if (!aiMessages.length && !blocks.length && !shown) return "";
        return JSON.stringify({ v: 2, shown, messages: aiMessages, blocks });
    }

    aiForm.addEventListener("click", (event) => {
        const blockDel = event.target.closest(".ai-block-del");
        if (blockDel) {
            deleteBlock(blockDel.closest(".ai-block"));
            return;
        }

        const del = event.target.closest(".ai-del");
        if (del) {
            const line = del.closest(".ai-row, .ai-item, .ai-track, .ai-log-row");
            if (!line) return;
            const parent = line.parentElement;
            const block = line.closest(".ai-block");
            line.remove();
            // 줄이 모두 사라지면 빈 줄 하나를 남긴다 (기록표는 비어 있어도 된다)
            if (!parent.children.length) {
                if (block.dataset.type === "checklist") addChecklistItem(parent);
                else if (block.dataset.type === "table") addTableRow(parent);
                else if (block.dataset.type === "tracker") addTrackRow(parent, $$("thead .ai-col-name", block).length);
            }
            scheduleSave();
            return;
        }

        const itemAdd = event.target.closest(".ai-item-add");
        if (itemAdd) {
            const list = $(".ai-items", itemAdd.closest(".ai-block"));
            if ($$(".ai-item", list).length >= AI_ITEM_MAX) return;
            $(".ai-item-text", addChecklistItem(list)).focus();
            scheduleSave();
            return;
        }

        const rowAdd = event.target.closest(".ai-row-add");
        if (rowAdd) {
            const block = rowAdd.closest(".ai-block");
            const type = block.dataset.type;
            let row = null;
            if (type === "table") {
                const table = $(".ai-fields", block);
                if ($$(".ai-row", table).length < AI_FIELD_MAX) row = addTableRow(table);
            } else if (type === "tracker") {
                const tbody = $("tbody", block);
                if ($$(".ai-track", tbody).length < AI_TRACK_MAX) row = addTrackRow(tbody, $$("thead .ai-col-name", block).length);
            } else if (type === "log") {
                const tbody = $("tbody", block);
                if ($$(".ai-log-row", tbody).length < AI_LOG_ROW_MAX) {
                    const columns = $$("thead .ai-col-name", block).map((input) => input.value.trim());
                    // 첫 칸이 날짜면 오늘 날짜를 미리 넣어 둔다
                    const first = /날짜|일자|date/i.test(columns[0] || "") ? formatShortDate(todayString()) : "";
                    row = addLogRow(tbody, columns, [first]);
                }
            }
            if (row) {
                const inputs = $$("input[type=text]", row);
                (inputs.find((input) => !input.value) || inputs[0])?.focus();
                scheduleSave();
            }
        }
    });

    aiForm.addEventListener("change", (event) => {
        if (event.target.matches(".ai-check")) {
            event.target.closest(".ai-item").classList.toggle("is-done", event.target.checked);
            scheduleSave();
        } else if (event.target.matches(".ai-track-check")) {
            scheduleSave();
        }
    });

    aiForm.addEventListener("input", (event) => {
        const block = event.target.closest(".ai-block");
        if (!block) return;
        if (block.dataset.type === "progress") refreshProgress(block);
        if (event.target.matches(".ai-note")) growNote(event.target);
        if (event.target.matches(".ai-track-label, .ai-col-name") && block.dataset.type === "tracker") {
            $$(".ai-track", block).forEach(labelTrackChecks);
        }
    });

    $$(".ai-add[data-add]", aiForm).forEach((button) => button.addEventListener("click", () => {
        if (liveBlocks().length >= AI_BLOCK_MAX) {
            showUndo(`블록은 ${AI_BLOCK_MAX}개까지 둘 수 있어요. 쓰지 않는 블록을 먼저 지워 주세요.`, null);
            return;
        }
        const block = appendBlock(defaultBlock(button.dataset.add));
        block.scrollIntoView({ block: "nearest" });
        $(".ai-block-title", block).focus({ preventScroll: true });
        scheduleSave();
    }));


    /* ---------- 말 보내기 → 양식 받기 ---------- */
    const isoOk = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2099
        && toIso(value.slice(2, 4), value.slice(5, 7), value.slice(8, 10)) === value;

    function currentFormForAi() {
        if (aiForm.hidden) return null;
        return {
            title: form.elements.title.value.trim(),
            startDate: readShortDate(aiStartInput),
            endDate: readShortDate(aiEndInput),
            blocks: collectBlocks(),
        };
    }

    function applyAiResult(result) {
        const before = snapshotAi();
        const titleInput = form.elements.title;
        if (!titleInput.value.trim() && result.title) titleInput.value = String(result.title).slice(0, 60);

        if (isoOk(result.startDate)) setShortDate(aiStartInput, result.startDate);
        if (isoOk(result.endDate)) setShortDate(aiEndInput, result.endDate);
        const start = readShortDate(aiStartInput);
        const end = readShortDate(aiEndInput);
        if (start && end && start > end) setShortDate(aiEndInput, null);

        clearBlocks();
        arr(result.blocks).slice(0, AI_BLOCK_MAX).forEach(appendBlock);
        showAiForm(true);

        // 이미 있던 양식이 바뀌었으면 되돌릴 수 있게
        if (before.shown && before.blocks.length && JSON.stringify(before.blocks) !== JSON.stringify(collectBlocks())) {
            showUndo("양식을 바꿨어요.", () => restoreAi(before));
        }
    }

    async function sendChat() {
        const prompt = aiPrompt.value.trim();
        if (!prompt || aiBusy) return;

        aiBusy = true;
        const epoch = aiEpoch;
        const history = aiMessages.slice(-AI_HISTORY);
        const current = currentFormForAi();
        addAiMessage("user", prompt);
        rememberAiMessage("user", prompt);
        aiPrompt.value = "";
        autoGrowPrompt();
        syncSend();

        const pending = addAiMessage("bot", "양식을 만들고 있어요…", "pending");
        try {
            const result = await request(AI_URL, { method: "POST", body: JSON.stringify({ prompt, history, current }) });
            if (epoch !== aiEpoch) return; // 그 사이 다른 목표로 넘어갔다
            pending.remove();
            applyAiResult(result);
            const reply = String(result.reply || "양식을 만들었어요. 칸을 눌러 마음대로 고쳐 보세요.");
            addAiMessage("bot", reply);
            rememberAiMessage("bot", reply);
            scheduleSave();
        } catch (error) {
            if (epoch !== aiEpoch) return;
            pending.remove();
            addAiMessage("bot", error.status ? error.message : "네트워크 연결을 확인하고 다시 보내 주세요.", "error");
        } finally {
            if (epoch === aiEpoch) {
                aiBusy = false;
                syncSend();
                aiPrompt.focus({ preventScroll: true });
            }
        }
    }

    aiPrompt.addEventListener("input", () => {
        autoGrowPrompt();
        syncSend();
    });
    aiPrompt.addEventListener("keydown", (event) => {
        // 한글 조합 중의 Enter(isComposing)는 전송으로 치지 않는다
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            sendChat();
        }
    });
    aiSendBtn.addEventListener("click", sendChat);
    freeMemo.addEventListener("input", autoGrowMemo);

    /* ---------- 저장/불러오기 ---------- */
    function fillAi(goal) {
        setShortDate(aiStartInput, goal.startDate);
        setShortDate(aiEndInput, goal.endDate);

        let data = null;
        try {
            data = goal.aiForm ? JSON.parse(goal.aiForm) : null;
        } catch (_) { /* 깨진 값은 없는 것으로 */ }

        if (data && typeof data === "object") {
            aiMessages = (Array.isArray(data.messages) ? data.messages : [])
                .filter((m) => m && (m.role === "user" || m.role === "bot") && typeof m.text === "string")
                .slice(-AI_MESSAGE_KEEP);
            aiMessages.forEach((m) => addAiMessage(m.role, m.text));
            blocksFromSaved(data).slice(0, AI_BLOCK_MAX).forEach(appendBlock);
            showAiForm(Boolean(data.shown) || liveBlocks().length > 0);
            setAiOpen(aiMessages.length > 0 || !aiForm.hidden);
        }
        autoGrowMemo();
    }

    function clearAi() {
        aiEpoch += 1;
        aiMessages = [];
        aiBusy = false;
        chatMessages.replaceChildren();
        clearAiForm();
        [aiStartInput, aiEndInput].forEach((input) => { input.dataset.valid = ""; });
        showAiForm(false);
        setAiOpen(false);
        autoGrowPrompt();
        syncSend();
        autoGrowMemo();
    }


    /* ---------- 오른쪽: 편집기 채우기 / 비우기 ---------- */
    function clearEditor() {
        closeRowMenu();
        form.reset();
        [startInput, endInput].forEach((input) => { input.dataset.valid = ""; });
        progressList.replaceChildren();
        noteItems.replaceChildren();
        clearMoney();
        clearAi();
        setStatus("");
    }

    function resetEditor() {
        closeMenu();
        closeEdit();
        activeGoalId = null;
        clearEditor();
        ensureBlankRows();
        ensureBlankTx();
        syncClearButton();
        updateDday();
        refreshMoney();
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
        fillMoney(goal);
        fillAi(goal);

        ensureBlankRows();
        syncClearButton();
        updateDday();
    }

    /* ---------- 자동 저장 (인라인 편집) ---------- */
    function buildPayload() {
        const data = new FormData(form);
        const text = (name) => String(data.get(name) ?? "").trim();

        // 기간 칸은 양식마다 따로 있다. 지금 열려 있는 양식의 칸에서 읽는다.
        const [from, to] = formMode === "money" ? [moneyStartInput, moneyEndInput]
            : formMode === "ai" ? [aiStartInput, aiEndInput] : [startInput, endInput];

        return {
            title: text("title"),
            formType: MODE_TO_TYPE[formMode],
            startDate: readShortDate(from),
            endDate: readShortDate(to),
            goalUnit: text("goalUnit"),
            goalFrequency: text("goalFrequency"),
            specialNotes: text("specialNotes"),
            goalPromise: text("goalPromise"),
            freeMemo: String(data.get("freeMemo") ?? ""),
            progressTables: collectProgressTables(),
            notes: collectNotes(),
            ...collectMoney(),
            aiForm: collectAiForm(),
        };
    }

    // 아무것도 안 적은 새 목표는 저장하지 않는다 (빈 카드가 생기지 않게)
    function isBlankPayload(p) {
        return !p.title && !p.startDate && !p.endDate && !p.goalUnit && !p.goalFrequency
            && !p.specialNotes && !p.goalPromise && !p.freeMemo.trim()
            && p.progressTables.length === 0 && p.notes.length === 0
            && p.targetAmount === null && p.startAmount === null && p.depositAmount === null && !p.depositCycle
            && !p.photo && p.transactions.length === 0 && !p.aiForm;
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
        if (target === aiPrompt || target.matches(".item-select, .tx-select") || target.closest("#moneyStatus")) return;

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

    /* ---------- 시작 ---------- */
    setMode("form");
    resetEditor();
    updatePaperBleed();
    loadGoals();
})();
