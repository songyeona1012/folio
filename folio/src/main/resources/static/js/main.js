(function() {
    const now = new Date();
    const TODAY = {
        y: now.getFullYear(),
        m: now.getMonth() + 1,
        d: now.getDate()
    };
    const queryDate = new URLSearchParams(location.search).get('date');
    const requested = /^\d{4}-\d{2}-\d{2}$/.test(queryDate || '') ? new Date(queryDate + 'T12:00:00') :
        now;
    const initial = Number.isNaN(requested.getTime()) ? now : requested;
    let YEAR = initial.getFullYear(),
        MONTH = initial.getMonth() + 1;
    let selectedDate = {
        y: YEAR,
        m: MONTH,
        d: initial.getDate()
    };
    let tempIdCounter = 1000;
    let events = {};

    let selectedPen = "red";

    const penOrder = ["red", "orange", "green", "blue", "purple"];

    const penColors = {
        red: "#D76950",
        orange: "#E9BD2C",
        green: "#86E740",
        blue: "#49B0FF",
        purple: "#A641EE"
    };

    const highlightStorageKey = "folioHighlights";

    function getHighlights() {
        try {
            return JSON.parse(localStorage.getItem(highlightStorageKey) || "{}");
        } catch (e) {
            return {};
        }
    }

    function saveHighlights(data) {
        localStorage.setItem(highlightStorageKey, JSON.stringify(data));
    }

    const monthNames = [
        "1월", "2월", "3월", "4월", "5월", "6월",
        "7월", "8월", "9월", "10월", "11월", "12월"
    ];

    function key(y, m, d) {
        return y + "-" + m + "-" + d;
    }

    function daysInMonth(y, m) {
        return new Date(y, m, 0).getDate();
    }

    function firstWeekday(y, m) {
        return new Date(y, m - 1, 1).getDay();
    }

    function pad(n) {
        return n < 10 ? "0" + n : String(n);
    }

    function formatDate(y, m, d) {
        return y + "." + pad(m) + "." + pad(d);
    }

    function escapeHtml(value) {
        return String(value || "").replace(
            /[&<>"']/g,
            c => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            } [c])
        );
    }

    function sortEvents(list) {
        const rank = {
            health: 0,
            important: 1,
            todo: 2
        };

        return list.slice().sort((a, b) => {
            const ra = rank[a.cat] !== undefined ? rank[a.cat] : 2;
            const rb = rank[b.cat] !== undefined ? rank[b.cat] : 2;

            if (ra !== rb) return ra - rb;

            return (a.time || "").localeCompare(b.time || "");
        });
    }

    function formatTime(t) {
        if (!t) return "";

        const parts = t.split(":");
        let h = parseInt(parts[0], 10);
        const m = parts[1] || "00";

        const period = h < 12 ? "오전" : "오후";

        let h12 = h % 12;
        if (h12 === 0) h12 = 12;

        return period + " " + h12 + "시" +
            (m !== "00" ? " " + parseInt(m, 10) + "분" : "");
    }

    function pad2(n) {
        return n < 10 ? "0" + n : "" + n;
    }

    function parseTimeValue(v) {
        if (!v) {
            return {
                h: 9,
                m: 0,
                ampm: "AM"
            };
        }

        const parts = v.split(":");

        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1] || "0", 10);

        const ampm = h >= 12 ? "PM" : "AM";

        let h12 = h % 12;
        if (h12 === 0) h12 = 12;

        m = Math.round(m / 5) * 5;

        if (m === 60) m = 55;

        return {
            h: h12,
            m: m,
            ampm: ampm
        };
    }

    function closeTimePicker() {
        const old = document.querySelector(".timePickerPopover");
        const oldBackdrop = document.querySelector(".timePickerBackdrop");

        if (old) old.remove();
        if (oldBackdrop) oldBackdrop.remove();
    }

    function openTimePicker(anchorEl, currentValue, onConfirm) {
        closeTimePicker();

        const state = parseTimeValue(currentValue);

        const backdrop = document.createElement("div");
        backdrop.className = "timePickerBackdrop";

        const pop = document.createElement("div");
        pop.className = "timePickerPopover";

        const header = document.createElement("div");
        header.className = "tpHeader";

        header.textContent = "◷ 시간 선택";

        const ampmRow = document.createElement("div");
        ampmRow.className = "tpAmPmRow";

        const amBtn = document.createElement("button");
        amBtn.type = "button";
        amBtn.className =
            "tpAmPmBtn" + (state.ampm === "AM" ? " sel" : "");
        amBtn.textContent = "오전";

        const pmBtn = document.createElement("button");
        pmBtn.type = "button";
        pmBtn.className =
            "tpAmPmBtn" + (state.ampm === "PM" ? " sel" : "");
        pmBtn.textContent = "오후";

        amBtn.addEventListener("click", () => {
            state.ampm = "AM";
            amBtn.classList.add("sel");
            pmBtn.classList.remove("sel");
        });

        pmBtn.addEventListener("click", () => {
            state.ampm = "PM";
            pmBtn.classList.add("sel");
            amBtn.classList.remove("sel");
        });

        ampmRow.appendChild(amBtn);
        ampmRow.appendChild(pmBtn);

        const wheelRow = document.createElement("div");
        wheelRow.className = "tpWheelRow";

        function buildColumn(values, selectedValue, onPick) {
            const col = document.createElement("div");
            col.className = "tpColumn";

            values.forEach(v => {
                const item = document.createElement("div");

                item.className =
                    "tpItem" + (v === selectedValue ? " sel" : "");

                item.textContent = pad2(v);

                item.addEventListener("click", () => {
                    col.querySelectorAll(".tpItem").forEach(el =>
                        el.classList.remove("sel")
                    );

                    item.classList.add("sel");

                    item.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

                    onPick(v);
                });

                col.appendChild(item);
            });

            return col;
        }

        const hourCol = buildColumn(
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            state.h,
            v => {
                state.h = v;
            }
        );

        const colon = document.createElement("div");
        colon.className = "tpColon";
        colon.textContent = ":";

        const minuteCol = buildColumn(
            [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
            state.m,
            v => {
                state.m = v;
            }
        );

        wheelRow.appendChild(hourCol);
        wheelRow.appendChild(colon);
        wheelRow.appendChild(minuteCol);

        const confirmBtn = document.createElement("button");

        confirmBtn.type = "button";
        confirmBtn.className = "tpConfirm";
        confirmBtn.textContent = "확인";

        confirmBtn.addEventListener("click", () => {
            let h24 = state.h % 12;

            if (state.ampm === "PM") {
                h24 += 12;
            }

            const value =
                pad2(h24) + ":" + pad2(state.m);

            closeTimePicker();

            onConfirm(value);
        });

        pop.appendChild(header);
        pop.appendChild(ampmRow);
        pop.appendChild(wheelRow);
        pop.appendChild(confirmBtn);

        document.body.appendChild(backdrop);
        document.body.appendChild(pop);

        const rect = anchorEl.getBoundingClientRect();

        const popWidth =  190;

        let left = rect.left;

        if (left + popWidth > window.innerWidth - 8) {
            left = window.innerWidth - popWidth - 8;
        }

        if (left < 8) {
            left = 8;
        }

        let top = rect.bottom + 6;

        if (top + 230 > window.innerHeight) {
            top = rect.top - 230;
        }

        pop.style.left = left + "px";
        pop.style.top = top + "px";

        requestAnimationFrame(() => {
            const selHour =
                hourCol.querySelector(".tpItem.sel");

            const selMinute =
                minuteCol.querySelector(".tpItem.sel");

            if (selHour) {
                selHour.scrollIntoView({
                    block: "center"
                });
            }

            if (selMinute) {
                selMinute.scrollIntoView({
                    block: "center"
                });
            }
        });

        backdrop.addEventListener("click", () => closeTimePicker());
    }

    function attachTimePicker(inputEl, onChange) {
        inputEl.type = "text";
        inputEl.readOnly = true;
        inputEl.classList.add("time-picker-input");

        inputEl.addEventListener("click", e => {
            e.stopPropagation();

            openTimePicker(
                inputEl,
                inputEl.value,
                newValue => {
                    inputEl.value = newValue;

                    if (onChange) {
                        onChange(newValue);
                    }
                }
            );
        });
    }

    function updateScheduleLocal(ev) {
        if (String(ev.id).startsWith("local_")) return;

        fetch("/api/schedules/" + ev.id, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                title: ev.title,
                time: ev.time,
                completed: ev.completed
            })
        }).then(() =>
            loadDashboardSummary()
        ).catch(e =>
            console.log("서버 오프라인, 로컬에서만 반영됨")
        );
    }

    /* 일정 삭제 */
    function deleteSchedule(ev) {
        const title = ev.title || "이 일정";

        if (!confirm("'" + title + "' 일정을 삭제할까요?")) {
            return;
        }

        const k = key(
            selectedDate.y,
            selectedDate.m,
            selectedDate.d
        );

        if (events[k]) {
            events[k] = events[k].filter(item => item.id !== ev.id);
        }

        if (!String(ev.id).startsWith("local_")) {
            fetch("/api/schedules/" + ev.id, {
                method: "DELETE"
            }).then(() =>
                loadDashboardSummary()
            ).catch(e =>
                console.log("서버 오프라인, 로컬에서만 삭제됨")
            );
        }

        refreshViews();
        showToast("일정이 삭제되었습니다");
    }

    // 지금 화면에 필요한 달 목록 (주간이 두 달에 걸치면 두 달 모두)
    function monthsToLoad() {
        if (VIEW === "week") {
            const months = new Map();
            weekDays().forEach(c => months.set(c.y + "-" + c.m, {y: c.y, m: c.m}));
            return [...months.values()];
        }
        return [{y: YEAR, m: MONTH}];
    }

    let loadRequest = 0;

    function loadMonthEvents() {
        const requestId = ++loadRequest;

        Promise.all(monthsToLoad().map(({y, m}) =>
            fetch("/api/schedules?year=" + y + "&month=" + m).then(res => {
                if (!res.ok) {
                    throw new Error("로드 실패");
                }
                return res.json();
            })
        ))
            .then(results => {
                // 늦게 도착한 이전 응답은 무시
                if (requestId !== loadRequest) return;

                events = {};

                results.flat().forEach(item => {
                    if (!item || !item.date) return;

                    const parts = String(item.date).split("-");

                    if (parts.length !== 3) return;

                    const k = key(
                        parseInt(parts[0], 10),
                        parseInt(parts[1], 10),
                        parseInt(parts[2], 10)
                    );

                    if (!events[k]) {
                        events[k] = [];
                    }

                    events[k].push({
                        id: item.id,
                        title: item.title || "",
                        time: item.time || "",
                        cat: item.category || "todo",
                        priv: !!item.private,
                        completed: !!item.completed
                    });
                });

                refreshViews();
                loadDashboardSummary();
            })
            .catch(() => {
                if (requestId === loadRequest) refreshViews();
            });
    }

    // ==============================
    // 대시보드 요약 (완료도 / 혼잡도 / 가장 가까운 일정 / 가장 가까운 건강 관리)
    // ==============================

    let summaryRequest = 0;

    function loadDashboardSummary() {
        const requestId = ++summaryRequest;

        fetch(
            "/api/schedules/summary?year=" +
            YEAR +
            "&month=" +
            MONTH
        )
            .then(res => {
                if (!res.ok) {
                    throw new Error("요약 로드 실패");
                }

                return res.json();
            })
            .then(summary => {
                // 늦게 도착한 이전 응답은 무시
                if (requestId !== summaryRequest) return;

                renderDashboardSummary(summary);
            })
            .catch(e =>
                console.log("대시보드 요약을 불러오지 못했어요", e)
            );
    }

    function renderDashboardSummary(s) {
        document.getElementById("rateLabel").textContent =
            "일정 완료도 : " +
            (s.completionRate == null ? "-" : s.completionRate + "%");

        document.getElementById("congestLabel").textContent =
            s.congestion || "-";

        document.getElementById("nextEventLabel").textContent =
            s.nextEvent || "예정된 일정이 없어요";

    }

    function refreshViews() {
        renderGrid();
        renderTodayList();

        if (
            document.getElementById("memoPanel").style.display ===
            "flex"
        ) {
            renderMemo();
        }
    }

    // 선택한 날짜가 들어 있는 주 (일요일 ~ 토요일)
    function weekDays() {
        const base = new Date(selectedDate.y, selectedDate.m - 1, selectedDate.d);
        const start = new Date(base);
        start.setDate(base.getDate() - base.getDay());

        return Array.from({length: 7}, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return {y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), other: false};
        });
    }

    // 월간: 앞뒤 달을 포함한 6주(42칸)
    function monthDays() {
        const total = daysInMonth(YEAR, MONTH);
        const startWd = firstWeekday(YEAR, MONTH);

        const prevMonth = MONTH === 1 ? 12 : MONTH - 1;
        const prevYear = MONTH === 1 ? YEAR - 1 : YEAR;
        const nextMonth = MONTH === 12 ? 1 : MONTH + 1;
        const nextYear = MONTH === 12 ? YEAR + 1 : YEAR;
        const prevTotal = daysInMonth(prevYear, prevMonth);

        const cells = [];

        for (let i = 0; i < startWd; i++) {
            cells.push({y: prevYear, m: prevMonth, d: prevTotal - startWd + 1 + i, other: true});
        }

        for (let d = 1; d <= total; d++) {
            cells.push({y: YEAR, m: MONTH, d: d, other: false});
        }

        let nextDay = 1;

        while (cells.length < 42) {
            cells.push({y: nextYear, m: nextMonth, d: nextDay, other: true});
            nextDay++;
        }

        return cells;
    }

    const MONTH_TAG_LIMIT = 2;   // 월간: 칸마다 일정 2개까지
    const WEEK_TAG_LIMIT = 6;    // 주간: 칸마다 일정 6개까지 (넘으면 +N)

    function renderGrid() {
        const grid = document.getElementById("grid");

        if (!grid) return;

        grid.innerHTML = "";

        const isWeek = VIEW === "week";
        const cells = isWeek ? weekDays() : monthDays();

        cells.forEach((cell, idx) => {
            const el = document.createElement("div");

            el.className =
                "day" +
                (cell.other ? " other" : "") +
                (idx % 7 === 0 ? " sun" : "") +
                (idx % 7 === 6 ? " sat" : "");

            if (
                !cell.other &&
                cell.y === TODAY.y &&
                cell.m === TODAY.m &&
                cell.d === TODAY.d
            ) {
                el.classList.add("today");
            }

            if (
                !cell.other &&
                cell.y === selectedDate.y &&
                cell.m === selectedDate.m &&
                cell.d === selectedDate.d
            ) {
                el.classList.add("selected");
            }

            const num = document.createElement("div");

            num.className = "num";

            // 주간에서 달이 바뀌는 날은 "9/1"처럼 월도 함께 표시
            num.textContent =
                isWeek && cell.d === 1 && idx !== 0 ?
                    cell.m + "/" + cell.d :
                    cell.d;

            el.appendChild(num);

            if (!cell.other) {
                const k = key(cell.y, cell.m, cell.d);

                const evs = sortEvents(events[k] || []);
                const limit = isWeek ? WEEK_TAG_LIMIT : MONTH_TAG_LIMIT;

                evs.slice(0, limit).forEach(ev => {
                    const tag = document.createElement("div");

                    tag.className = "tag " + ev.cat + (ev.completed ? " done" : "");

                    if (isWeek && ev.time) {
                        const time = document.createElement("span");
                        time.className = "tagTime";
                        time.textContent = ev.time;
                        tag.appendChild(time);
                    }

                    tag.appendChild(document.createTextNode(ev.title));
                    tag.title = (ev.time ? formatTime(ev.time) + " " : "") + ev.title;

                    el.appendChild(tag);
                });

                if (isWeek && evs.length > limit) {
                    const more = document.createElement("div");
                    more.className = "tagMore";
                    more.textContent = "+" + (evs.length - limit) + "개";
                    el.appendChild(more);
                }

                el.addEventListener("click", e => {
                    selectedDate = {
                        y: cell.y,
                        m: cell.m,
                        d: cell.d
                    };

                    // 주간에서 다른 달의 날짜를 누르면 그 달 기준으로 요약을 다시 계산
                    if (cell.y !== YEAR || cell.m !== MONTH) {
                        YEAR = cell.y;
                        MONTH = cell.m;
                        updateMonthLabel();
                        loadDashboardSummary();
                    }

                    updateTodayTitle();
                    refreshViews();
                    openMemo();
                });
            }

            grid.appendChild(el);
        });
    }

    function renderTodayList() {
        const k = key(
            selectedDate.y,
            selectedDate.m,
            selectedDate.d
        );

        events[k] = sortEvents(events[k] || []);

        const list = events[k];

        const wrap =
            document.getElementById("todayList");

        if (!wrap) return;

        wrap.innerHTML = "";

        if (!list.length) {
            wrap.innerHTML =
                '<div class="empty-note">등록된 일정이 없어요. 위의 + 버튼으로 추가해보세요.</div>';

            return;
        }

        list.forEach(ev => {
            const li = document.createElement("li");

            li.className = ev.cat;

            if (ev.completed) {
                li.classList.add("completed");
            }

            const timeSpan =
                document.createElement("span");

            timeSpan.className =
                "time hover-edit";

            timeSpan.textContent =
                ev.time ?
                    formatTime(ev.time) :
                    "시간없음";

            const titleSpan =
                document.createElement("span");

            titleSpan.className =
                "title hover-edit";

            titleSpan.innerHTML =
                escapeHtml(ev.title) +
                (ev.priv ? " 🔒" : "");

            const titleInput =
                document.createElement("input");

            titleInput.type = "text";
            titleInput.className = "title-edit";
            titleInput.value = ev.title;
            titleInput.style.display = "none";

            const chk =
                document.createElement("span");

            chk.className = "chk2";

            /* 삭제 버튼 */
            const deleteBtn =
                document.createElement("button");

            deleteBtn.type = "button";
            deleteBtn.className =
                "delete-schedule";

            deleteBtn.textContent = "×";
            deleteBtn.title = "일정 삭제";

            li.appendChild(timeSpan);
            li.appendChild(titleSpan);
            li.appendChild(titleInput);
            li.appendChild(chk);
            li.appendChild(deleteBtn);

            timeSpan.addEventListener("click", e => {
                e.stopPropagation();

                openTimePicker(
                    timeSpan,
                    ev.time || "",
                    newValue => {
                        if (newValue !== ev.time) {
                            ev.time = newValue;
                            updateScheduleLocal(ev);
                            refreshViews();
                            showToast(
                                "시간이 수정되었어요"
                            );
                        }
                    }
                );
            });

            titleSpan.addEventListener("click", e => {
                e.stopPropagation();

                titleSpan.style.display = "none";
                titleInput.style.display = "block";

                titleInput.focus();
            });

            titleInput.addEventListener("blur", () => {
                const val =
                    titleInput.value.trim();

                if (
                    val &&
                    val !== ev.title
                ) {
                    ev.title = val;

                    updateScheduleLocal(ev);
                    refreshViews();

                    showToast(
                        "제목이 수정되었어요"
                    );
                } else {
                    titleInput.value =
                        ev.title;

                    titleInput.style.display =
                        "none";

                    titleSpan.style.display =
                        "block";
                }
            });

            titleInput.addEventListener(
                "keydown",
                e => {
                    if (e.key === "Enter") {
                        titleInput.blur();
                    }
                }
            );

            chk.addEventListener("click", e => {
                e.stopPropagation();

                ev.completed = !ev.completed;

                updateScheduleLocal(ev);
                refreshViews();
            });

            deleteBtn.addEventListener(
                "click",
                e => {
                    e.stopPropagation();
                    deleteSchedule(ev);
                }
            );

            wrap.appendChild(li);
        });
    }

    // 메모장 열기
    function openMemo() {
        const memo =
            document.getElementById("memoPanel");

        memo.style.display = "flex";

        memo.classList.remove(
            "memo-closing"
        );

        memo.classList.remove(
            "memo-opening"
        );

        void memo.offsetWidth;

        renderMemo();

        requestAnimationFrame(() =>
            memo.classList.add(
                "memo-opening"
            )
        );
    }

    // 외부 클릭 시 부드럽게 닫기 기능
    function closeMemo() {
        const memo =
            document.getElementById("memoPanel");

        if (
            memo.style.display === "flex" &&
            !memo.classList.contains(
                "memo-closing"
            )
        ) {
            memo.classList.remove(
                "memo-opening"
            );

            memo.classList.add(
                "memo-closing"
            );

            setTimeout(() => {
                memo.style.display = "none";

                memo.classList.remove(
                    "memo-closing"
                );

                memo.classList.remove(
                    "highlight-mode"
                );
            }, 450);
        }
    }

    document.addEventListener(
        "click",
        e => {
            const memo =
                document.getElementById(
                    "memoPanel"
                );

            if (
                memo.style.display ===
                "flex"
            ) {
                if (
                    !memo.contains(e.target) &&
                    !e.target.closest(
                        ".day:not(.other)"
                    ) &&
                    !e.target.closest(
                        ".timePickerPopover"
                    ) &&
                    !e.target.closest(
                        ".timePickerBackdrop"
                    )
                ) {
                    closeMemo();
                }
            }
        }
    );

    function renderMemo() {
        const memoList =
            document.getElementById(
                "memoList"
            );

        if (!memoList) return;

        document.getElementById(
            "memoDateLabel"
        ).textContent =
            formatDate(
                selectedDate.y,
                selectedDate.m,
                selectedDate.d
            );

        memoList.innerHTML = "";

        const k = key(
            selectedDate.y,
            selectedDate.m,
            selectedDate.d
        );

        const list =
            sortEvents(events[k] || []);

        const highlights =
            getHighlights();

        for (
            let i = 0; i <= list.length; i++
        ) {
            const ev =
                list[i] || null;

            const row =
                document.createElement("div");

            row.className =
                "memoEvent";

            if (ev) {
                row.dataset.id = ev.id;

                const timeCell =
                    document.createElement("div");

                timeCell.className =
                    "memoTime";
                const timeText =
                    document.createElement(
                        "span"
                    );

                timeText.className =
                    "hover-edit time-text";

                const clockIcon =
                    document.createElement("img");

                clockIcon.src =
                    "/img/clock.png";

                clockIcon.alt =
                    "시간 선택";

                clockIcon.className =
                    "clock-icon";

                timeText.appendChild(
                    clockIcon
                );

                const timeLabel =
                    document.createElement("span");

                timeLabel.textContent =
                    ev.time || "시간 선택";

                timeText.appendChild(
                    timeLabel
                );

                timeCell.appendChild(
                    timeText
                );
                const titleCell =
                    document.createElement("div");

                titleCell.className =
                    "memoSchedule";

                const titleText =
                    document.createElement(
                        "span"
                    );

                titleText.className =
                    "hover-edit title-text";

                titleText.textContent =
                    ev.title;

                titleCell.appendChild(
                    titleText
                );

                if (highlights[ev.id]) {
                    applyHighlightStyle(
                        titleText,
                        highlights[ev.id]
                    );
                }

                row.addEventListener(
                    "click",
                    e => {
                        if (
                            document
                                .getElementById(
                                    "memoPanel"
                                )
                                .classList.contains(
                                "highlight-mode"
                            )
                        ) {
                            e.stopPropagation();

                            setHighlight(
                                ev,
                                titleText
                            );
                        }
                    }
                );

                timeText.addEventListener(
                    "click",
                    e => {
                        e.stopPropagation();

                        if (
                            document
                                .getElementById(
                                    "memoPanel"
                                )
                                .classList.contains(
                                "highlight-mode"
                            )
                        ) {
                            setHighlight(
                                ev,
                                titleText
                            );

                            return;
                        }

                        startInlineEdit(
                            timeText,
                            ev,
                            "time"
                        );
                    }
                );

                titleText.addEventListener(
                    "click",
                    e => {
                        e.stopPropagation();

                        if (
                            document
                                .getElementById(
                                    "memoPanel"
                                )
                                .classList.contains(
                                "highlight-mode"
                            )
                        ) {
                            setHighlight(
                                ev,
                                titleText
                            );

                            return;
                        }

                        startInlineEdit(
                            titleText,
                            ev,
                            "title"
                        );
                    }
                );

                row.appendChild(timeCell);
                row.appendChild(titleCell);
            } else {
                row.classList.add(
                    "memo-empty"
                );

                row.innerHTML =
                    `<div class="memoTime"><span class="memoPlaceholder">시간 선택</span></div><div class="memoSchedule"><span class="memoPlaceholder">일정을 작성해주세요.</span></div>`;

                row.addEventListener(
                    "click",
                    e => {
                        e.stopPropagation();

                        activateEmptyMemoRow(
                            row
                        );
                    }
                );
            }

            memoList.appendChild(row);
        }
    }

    function startInlineEdit(
        target,
        ev,
        field
    ) {
        if (field === "time") {
            openTimePicker(
                target,
                ev.time || "",
                newValue => {
                    ev.time = newValue;

                    updateScheduleLocal(ev);
                    refreshViews();

                    showToast(
                        "수정되었습니다"
                    );
                }
            );

            return;
        }

        if (
            target.dataset.editing ===
            "true"
        ) {
            return;
        }

        target.dataset.editing =
            "true";

        const input =
            document.createElement(
                "input"
            );

        input.type = "text";
        input.className =
            "memoNewTitle";

        input.value = ev.title;

        target.replaceWith(input);

        input.focus();
        input.select();

        let finished = false;

        function finish(save) {
            if (finished) return;

            finished = true;

            if (!save) {
                renderMemo();
                return;
            }

            const newValue =
                input.value.trim();

            if (!newValue) {
                renderMemo();
                return;
            }

            ev.title = newValue;

            updateScheduleLocal(ev);
            refreshViews();

            showToast(
                "수정되었습니다"
            );
        }

        input.addEventListener(
            "blur",
            () => finish(true)
        );

        input.addEventListener(
            "keydown",
            e => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    input.blur();
                }

                if (e.key === "Escape") {
                    e.preventDefault();
                    finish(false);
                }
            }
        );
    }

    function activateEmptyMemoRow(row) {
        if (
            row.classList.contains(
                "editing-new"
            )
        ) {
            return;
        }

        row.classList.add(
            "editing-new"
        );

        const timeCell =
            row.querySelector(
                ".memoTime"
            );

        const titleCell =
            row.querySelector(
                ".memoSchedule"
            );

        timeCell.innerHTML = "";
        titleCell.innerHTML = "";

        const timeInput =
            document.createElement(
                "input"
            );

        timeInput.className =
            "memoNewTime";

        timeInput.placeholder = "시간 선택";

        attachTimePicker(
            timeInput,
            () => titleInput.focus()
        );

        const titleInput =
            document.createElement(
                "input"
            );

        titleInput.type = "text";

        titleInput.className =
            "memoNewTitle";

        titleInput.placeholder =
            "일정을 작성해주세요.";

        timeCell.appendChild(
            timeInput
        );

        titleCell.appendChild(
            titleInput
        );

        titleInput.focus();

        function saveNewSchedule() {
            const title =
                titleInput.value.trim();

            const time =
                timeInput.value || "";

            if (!title) {
                renderMemo();
                return;
            }

            const k = key(
                selectedDate.y,
                selectedDate.m,
                selectedDate.d
            );

            if (!events[k]) {
                events[k] = [];
            }

            const tempEv = {
                id: "local_" + Date.now(),
                title: title,
                time: time,
                cat: "todo",
                priv: false,
                completed: false
            };

            events[k].push(tempEv);

            refreshViews();

            showToast(
                "일정이 저장되었습니다"
            );

            fetch("/api/schedules", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    title: title,
                    date: selectedDate.y +
                        "-" +
                        pad(
                            selectedDate.m
                        ) +
                        "-" +
                        pad(
                            selectedDate.d
                        ),
                    time: time,
                    category: "todo",
                    private: false
                })
            })
                .then(res =>
                    res.json()
                )
                .then(saved => {
                    tempEv.id = saved.id;
                    loadDashboardSummary();
                })
                .catch(() => {});
        }

        function handleBlur() {
            setTimeout(() => {
                if (
                    document.querySelector(
                        ".timePickerPopover"
                    )
                ) {
                    return;
                }

                if (
                    document.activeElement !==
                    timeInput &&
                    document.activeElement !==
                    titleInput
                ) {
                    saveNewSchedule();
                }
            }, 100);
        }

        timeInput.addEventListener(
            "blur",
            handleBlur
        );

        titleInput.addEventListener(
            "blur",
            handleBlur
        );

        titleInput.addEventListener(
            "keydown",
            e => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    titleInput.blur();
                }

                if (e.key === "Escape") {
                    e.preventDefault();
                    renderMemo();
                }
            }
        );
    }

    function applyHighlightStyle(
        element,
        pen
    ) {
        const color =
            penColors[pen] ||
            penColors.red;

        element.style.background =
            "linear-gradient(transparent 35%, " +
            color +
            "88 35%, " +
            color +
            "88 90%, transparent 90%)";

        element.style.borderRadius =
            "3px";

        element.style.padding =
            "1px 4px";
    }

    function setHighlight(
        ev,
        titleText
    ) {
        const highlights =
            getHighlights();

        highlights[ev.id] =
            selectedPen;

        saveHighlights(
            highlights
        );

        applyHighlightStyle(
            titleText,
            selectedPen
        );
    }

    document
        .getElementById("penButton")
        .addEventListener(
            "click",
            e => {
                e.stopPropagation();

                selectedPen =
                    penOrder[
                    (
                        penOrder.indexOf(
                            selectedPen
                        ) + 1
                    ) %
                    penOrder.length
                        ];

                document.getElementById(
                    "penImage"
                ).src =
                    "/img/pen_" +
                    selectedPen +
                    ".png";

                document
                    .getElementById(
                        "memoPanel"
                    )
                    .classList.add(
                    "highlight-mode"
                );
            }
        );

    // ==============================
    // 월간 / 주간 보기
    // ==============================

    const VIEW_KEY = "folio.calendarView";
    let VIEW = "month";

    try {
        if (localStorage.getItem(VIEW_KEY) === "week") VIEW = "week";
    } catch (e) { /* 저장소를 못 쓰면 월간으로 */ }

    function applyViewUI() {
        document.getElementById("grid").classList.toggle("isWeek", VIEW === "week");

        document.querySelectorAll("[data-cal-view]").forEach(button => {
            button.setAttribute("aria-pressed", String(button.dataset.calView === VIEW));
        });

        document.getElementById("prevBtn").setAttribute("aria-label", VIEW === "week" ? "이전 주" : "이전 달");
        document.getElementById("nextBtn").setAttribute("aria-label", VIEW === "week" ? "다음 주" : "다음 달");
    }

    // 보기를 바꿀 때 날짜 칸이 살짝 바뀌는 효과
    function playGridSwap() {
        const grid = document.getElementById("grid");
        grid.classList.remove("gridSwap");
        void grid.offsetWidth;
        grid.classList.add("gridSwap");
    }

    function setView(view) {
        if (view === VIEW) return;

        VIEW = view;

        try {
            localStorage.setItem(VIEW_KEY, VIEW);
        } catch (e) { /* 무시 */ }

        // 두 보기 모두 "선택한 날짜"를 기준으로 맞춘다
        YEAR = selectedDate.y;
        MONTH = selectedDate.m;

        applyViewUI();
        updateMonthLabel();
        playGridSwap();
        renderGrid();
        loadMonthEvents();
    }

    document.querySelectorAll("[data-cal-view]").forEach(button => {
        button.addEventListener("click", () => setView(button.dataset.calView));
    });

    // 월간: 한 달씩 / 주간: 일주일씩 이동
    function step(dir) {
        if (VIEW === "week") {
            const d = new Date(selectedDate.y, selectedDate.m - 1, selectedDate.d + 7 * dir);

            selectedDate = {
                y: d.getFullYear(),
                m: d.getMonth() + 1,
                d: d.getDate()
            };

            YEAR = selectedDate.y;
            MONTH = selectedDate.m;
        } else {
            MONTH += dir;

            if (MONTH < 1) {
                MONTH = 12;
                YEAR--;
            }

            if (MONTH > 12) {
                MONTH = 1;
                YEAR++;
            }

            selectedDate = {
                y: YEAR,
                m: MONTH,
                d: 1
            };
        }

        updateTodayTitle();
        updateMonthLabel();
        playGridSwap();
        loadMonthEvents();
    }

    document.getElementById("prevBtn").addEventListener("click", () => step(-1));
    document.getElementById("nextBtn").addEventListener("click", () => step(1));

    function updateTodayTitle() {
        document.getElementById("todayTitle").textContent =
            "금일 일정 목록 [ " +
            String(selectedDate.y).slice(2) +
            "." +
            pad(selectedDate.m) +
            "." +
            pad(selectedDate.d) +
            " ]";
    }

    function updateMonthLabel() {
        const range = document.getElementById("weekRange");

        if (VIEW === "week") {
            const days = weekDays();
            const first = days[0];
            const last = days[6];
            const weekNo =
                Math.floor((selectedDate.d + firstWeekday(selectedDate.y, selectedDate.m) - 1) / 7) + 1;

            document.getElementById("yearLabel").textContent = selectedDate.y;
            document.getElementById("monthLabel").textContent =
                monthNames[selectedDate.m - 1] + " " + weekNo + "주차";

            range.textContent =
                pad(first.m) + "." + pad(first.d) + " ~ " + pad(last.m) + "." + pad(last.d);
            range.hidden = false;
            return;
        }

        document.getElementById("yearLabel").textContent = YEAR;
        document.getElementById("monthLabel").textContent = monthNames[MONTH - 1];
        range.hidden = true;
    }

    document
        .querySelectorAll(
            ".check-list .chk"
        )
        .forEach(chk =>
            chk.parentElement.addEventListener(
                "click",
                function() {
                    this.classList.toggle(
                        "done"
                    );
                }
            )
        );

    let toastTimer;

    function showToast(msg) {
        const t =
            document.getElementById(
                "toast"
            );

        t.textContent = msg;

        t.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(
            () =>
                t.classList.remove(
                    "show"
                ),
            1800
        );
    }
    // ==============================
    // 자연어 일정 등록
    // ==============================

    const naturalScheduleInput =
        document.getElementById("naturalScheduleInput");

    const naturalScheduleBtn =
        document.getElementById("naturalScheduleBtn");

    naturalScheduleBtn.addEventListener("click", async () => {

        const text =
            naturalScheduleInput.value.trim();

        if (!text) {
            showToast("일정을 입력해주세요");
            naturalScheduleInput.focus();
            return;
        }

        naturalScheduleBtn.disabled = true;
        // textContent를 바꾸면 버튼 안 요소가 지워지고 글자가 +와 겹쳐 보여서,
        // 클래스로 로딩 모양만 바꾸고 안내 문구는 title(마우스 올리면 보임)로 둡니다.
        naturalScheduleBtn.classList.add("is-loading");
        naturalScheduleBtn.title = "AI가 읽는 중...";

        try {

            // 1. 자연어 → Gemini
            const aiResponse = await fetch(
                "/api/ai/parse-schedule", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        text: text
                    })
                }
            );

            if (!aiResponse.ok) {
                throw new Error(
                    aiResponse.status === 503
                        ? "AI 기능을 사용하려면 실행 환경에 OPENAI_API_KEY를 설정해주세요. 직접 일정 등록은 계속 사용할 수 있어요."
                        : "AI 일정 해석에 실패했어요"
                );
            }

            const schedule =
                await aiResponse.json();

            if (!schedule.date) {
                throw new Error(
                    "날짜를 해석하지 못했어요"
                );
            }

            // 2. AI가 분석한 일정 → DB 저장
            naturalScheduleBtn.title =
                "일정 저장 중...";

            const saveResponse =
                await fetch(
                    "/api/schedules", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            title: schedule.title || text,

                            date: schedule.date,

                            time: schedule.time || "",

                            category: schedule.category || "todo",

                            private: schedule.private !== undefined ?
                                !!schedule.private :
                                !!schedule.isPrivate,

                            completed: false
                        })
                    }
                );

            if (!saveResponse.ok) {
                throw new Error(
                    "일정 저장에 실패했어요"
                );
            }

            const savedSchedule =
                await saveResponse.json();

            // 3. 입력창 비우기
            naturalScheduleInput.value = "";

            // 4. 저장된 날짜로 이동
            if (savedSchedule.date) {

                const parts =
                    String(savedSchedule.date).split("-");

                if (parts.length === 3) {

                    const y =
                        parseInt(parts[0], 10);

                    const m =
                        parseInt(parts[1], 10);

                    const d =
                        parseInt(parts[2], 10);

                    YEAR = y;
                    MONTH = m;

                    selectedDate = {
                        y: y,
                        m: m,
                        d: d
                    };

                    document.getElementById(
                        "todayTitle"
                    ).textContent =
                        "금일 일정 목록 [ " +
                        String(y).slice(2) +
                        "." +
                        pad(m) +
                        "." +
                        pad(d) +
                        " ]";

                    updateMonthLabel();
                }
            }

            // 5. 달력 새로고침
            loadMonthEvents();

            showToast(
                "AI가 일정을 등록했어요"
            );

        } catch (error) {

            console.error(
                "자연어 일정 등록 오류:",
                error
            );

            showToast(
                error.message ||
                "일정 등록 중 오류가 발생했어요"
            );

        } finally {

            naturalScheduleBtn.disabled =
                false;

            naturalScheduleBtn.classList.remove("is-loading");

            naturalScheduleBtn.title =
                "일정 등록";
        }
    });

    // Enter로 등록
    naturalScheduleInput.addEventListener(
        "keydown",
        e => {

            if (e.key === "Enter") {
                e.preventDefault();
                naturalScheduleBtn.click();
            }

        }
    );
    const dashboardCategories = {daily: '일상', subscription: '구독', relationship: '교체'};
    let dashboardCategory = localStorage.getItem('folio.dashboardCategory') || 'daily';
    if (!dashboardCategories[dashboardCategory]) dashboardCategory = 'daily';
    let dashboardRules = [];
    const dashboardOccurrences = new Map();
    function renderDashboardManagement() {
        document.getElementById('dashboardCategoryTitle').textContent = dashboardCategories[dashboardCategory];
        const list = document.getElementById('dashboardManagementList');
        list.replaceChildren();
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const upcoming = dashboardRules.filter(rule => rule.category === 'health' && rule.nextDate && new Date(rule.nextDate + 'T00:00:00') >= todayDate);
        upcoming.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
        const nearest = upcoming[0];
        document.getElementById('nearestManagementTitle').textContent = nearest ? nearest.title : '예정된 건강 관리가 없어요';
        const days = nearest ? Math.round((new Date(nearest.nextDate + 'T00:00:00') - todayDate) / 86400000) : null;
        document.getElementById('nearestManagementDays').textContent = nearest ? '[ 다음 건강 일정 : ' + (days === 0 ? '오늘' : days + '일 뒤') + ' ]' : '';
        const matching = dashboardRules.filter(rule => rule.category === dashboardCategory);
        matching.sort((a, b) => String(a.nextDate || '').localeCompare(String(b.nextDate || '')));
        for (const rule of matching) {
            const li = document.createElement('li');
            const title = document.createElement('span');
            title.textContent = rule.title;
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.className = 'dashboardComplete chk2';
            check.setAttribute('aria-label', rule.title + ' 완료');
            const occurrence = dashboardOccurrences.get(String(rule.id));
            check.checked = !!(occurrence && occurrence.completed);
            check.disabled = !occurrence;
            li.classList.toggle('completed', check.checked);
            check.addEventListener('change', async () => {
                check.disabled = true;
                try {
                    const response = await fetch('/api/schedules/' + occurrence.id, {
                        method: 'PATCH', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({completed: check.checked})
                    });
                    if (!response.ok) throw new Error('완료 상태 저장 실패');
                    occurrence.completed = check.checked;
                    li.classList.toggle('completed', check.checked);
                    loadMonthEvents();
                    showToast(check.checked ? '관리 일정을 완료했어요' : '완료를 취소했어요');
                } catch (error) {
                    check.checked = occurrence.completed;
                    showToast('완료 상태를 저장하지 못했어요');
                } finally { check.disabled = false; }
            });
            li.append(title, check);
            list.append(li);
        }
        if (!matching.length) {
            const li = document.createElement('li');
            li.className = 'muted';
            li.textContent = '등록된 관리 일정이 없어요.';
            list.append(li);
        }
        document.querySelectorAll('[data-dashboard-category]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.dashboardCategory === dashboardCategory));
        });
    }
    document.querySelectorAll('[data-dashboard-category]').forEach(button => {
        button.addEventListener('click', () => {
            dashboardCategory = button.dataset.dashboardCategory;
            localStorage.setItem('folio.dashboardCategory', dashboardCategory);
            renderDashboardManagement();
            document.querySelector('.dashboardCategoryMenu').open = false;
        });
    });
    document.addEventListener('click', event => {
        const menu = document.querySelector('.dashboardCategoryMenu');
        if (!menu.contains(event.target)) menu.open = false;
    });
    renderDashboardManagement();
    fetch('/api/management/rules').then(response => {
        if (!response.ok) throw new Error('관리 일정 로드 실패');
        return response.json();
    }).then(async data => {
        dashboardRules = data;
        renderDashboardManagement();
        await Promise.all([...new Set(data.filter(rule => rule.category !== 'health' && rule.nextDate).map(rule => rule.nextDate))].map(async date => {
            const response = await fetch('/api/schedules/date?value=' + encodeURIComponent(date));
            if (!response.ok) throw new Error('관리 일정 로드 실패');
            const occurrences = await response.json();
            occurrences.forEach(occurrence => {
                const rule = data.find(rule => String(rule.id) === String(occurrence.recurringId) && rule.nextDate === date);
                if (rule) dashboardOccurrences.set(String(rule.id), occurrence);
            });
        }));
        renderDashboardManagement();
    }).catch(() => {
        document.getElementById('dashboardManagementList').textContent = '관리 일정을 불러오지 못했어요.';
    });
    applyViewUI();
    updateTodayTitle();
    updateMonthLabel();
    renderGrid();
    loadMonthEvents();

})();
