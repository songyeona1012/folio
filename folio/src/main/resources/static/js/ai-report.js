// 메인 달력: 책 아래 "AI 일정 분석 보기" 탭과, 손이 내려주는 이번 주 일정 리포트
(() => {
    "use strict";

    const notebook = document.querySelector(".notebook");
    if (!notebook) return;

    const pad = (n) => String(n).padStart(2, "0");
    const toIso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    const shortDate = (iso) => (iso ? iso.slice(5).replace("-", ".") : "");
    const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
    const TYPE_COLORS = ["#e9692c", "#7fa886", "#8a9bcb", "#e9c46a", "#c9a7d8", "#b9a48e"];
    const LAND_DELAY = 950; // 손이 기록지를 내려놓는 시간(ms). 이 뒤에 내용이 차례로 나타난다.

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    // 차례로 떠오르는 조각 (order가 클수록 늦게)
    function piece(node, order) {
        node.classList.add("rp-item");
        node.style.setProperty("--d", LAND_DELAY + order * 90 + "ms");
        return node;
    }

    /* ---------- 책 아래 탭 ---------- */
    const tab = el("button", "aiReportTab");
    tab.type = "button";
    tab.setAttribute("aria-haspopup", "dialog");
    const tabLabel = el("span", "aiReportTabLabel", "AI 일정 분석 보기");
    tab.append(tabLabel);
    notebook.append(tab);

    /* ---------- 손 + 기록지 ---------- */
    const overlay = el("div", "aiReportOverlay");
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "이번 주 일정 리포트");

    const scene = el("div", "aiReportScene");
    const paper = el("div", "aiReportPaper");
    const paperImg = el("img", "aiReportPaperImg");
    paperImg.src = "/img/report_background.png";
    paperImg.alt = "";
    paperImg.addEventListener("error", () => paper.classList.add("noImage"));

    const content = el("div", "aiReportContent");
    const close = el("button", "aiReportClose", "×");
    close.type = "button";
    close.setAttribute("aria-label", "리포트 닫기");

    const hand = el("img", "aiReportHand");
    hand.src = "/img/hand.png";
    hand.alt = "";
    hand.addEventListener("error", () => (hand.hidden = true));

    paper.append(paperImg, content, close);
    scene.append(paper, hand);
    overlay.append(scene);
    document.body.append(overlay);

    /* ---------- 이번 주 날짜별 일정 수 (달력 API를 그대로 사용) ---------- */
    async function loadWeekDays(start, end) {
        const from = new Date(start + "T12:00:00");
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(from);
            d.setDate(from.getDate() + i);
            days.push({ iso: toIso(d), label: DAY_NAMES[d.getDay()], count: 0, done: 0, due: 0 });
        }

        const months = new Map();
        days.forEach((day) => months.set(day.iso.slice(0, 7), day.iso));
        const lists = await Promise.all(
            [...months.keys()].map((ym) =>
                fetch("/api/schedules?year=" + Number(ym.slice(0, 4)) + "&month=" + Number(ym.slice(5, 7)))
                    .then((res) => (res.ok ? res.json() : []))
                    .catch(() => [])
            )
        );

        const today = toIso(new Date());
        const byDate = new Map(days.map((day) => [day.iso, day]));
        lists.flat().forEach((item) => {
            const day = item && byDate.get(String(item.date));
            if (!day) return;
            day.count++;
            if (day.iso <= today) {
                day.due++;
                if (item.completed) day.done++;
            }
        });
        return days;
    }

    /* ---------- 숫자가 0부터 올라가는 효과 ---------- */
    function countUp(node, target, suffix = "") {
        const start = performance.now() + LAND_DELAY;
        const duration = 700;
        node.textContent = "0" + suffix;
        function tick(now) {
            const t = Math.min(1, Math.max(0, (now - start) / duration));
            const eased = 1 - Math.pow(1 - t, 3);
            node.textContent = Math.round(target * eased) + suffix;
            if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    /* ---------- 리포트 그리기 ---------- */
    function render(report, days) {
        content.replaceChildren();
        let order = 0;

        // 머리말: 제목 + 기간 + AI 배지
        const head = piece(el("div", "rp-head"), order++);
        const titleWrap = el("div", "rp-titleWrap");
        titleWrap.append(el("p", "rp-kicker", "Weekly Report"), el("h2", "rp-title", "이번 주 일정 리포트"));
        const meta = el("div", "rp-meta");
        meta.append(
            el("span", "rp-range", shortDate(report.start) + " ~ " + shortDate(report.end)),
            el("span", "rp-badge" + (report.typeSource === "AI" ? " isAi" : ""), report.typeSource === "AI" ? "✦ AI 분석" : "기본 분석")
        );
        head.append(titleWrap, meta);

        // 숫자 타일 3개
        const total = report.total || 0;
        const due = days ? days.reduce((sum, d) => sum + d.due, 0) : 0;
        const done = days ? days.reduce((sum, d) => sum + d.done, 0) : 0;
        const rate = due ? Math.round((done / due) * 100) : null;

        const tiles = el("div", "rp-tiles");
        const tileTotal = piece(el("div", "rp-tile"), order++);
        const totalNum = el("b", "rp-num", "0");
        tileTotal.append(el("span", "rp-label", "총 일정"), totalNum, el("small", null, "개의 일정이 있어요"));

        const tileRate = piece(el("div", "rp-tile"), order++);
        const rateNum = el("b", "rp-num", rate == null ? "-" : "0%");
        tileRate.append(
            el("span", "rp-label", "완료율"),
            rateNum,
            el("small", null, due ? done + " / " + due + "개 완료" : "아직 지난 일정이 없어요")
        );

        const tileBusy = piece(el("div", "rp-tile isAccent"), order++);
        tileBusy.append(
            el("span", "rp-label", "가장 바쁜 날"),
            el("b", "rp-num rp-word", report.busiestDay || "-"),
            el("small", null, report.busiestDay ? "이 날은 여유를 두세요" : "고르게 나뉘어 있어요")
        );
        tiles.append(tileTotal, tileRate, tileBusy);

        // 가운데: 요일별 막대 + 일정 종류
        const middle = el("div", "rp-middle");

        const weekBox = piece(el("div", "rp-box"), order++);
        weekBox.append(el("p", "rp-boxTitle", "요일별 일정"));
        const bars = el("div", "rp-bars");
        if (days) {
            const max = Math.max(1, ...days.map((d) => d.count));
            const busyLabel = (report.busiestDay || "").slice(0, 1);
            const today = toIso(new Date());
            days.forEach((day, i) => {
                const col = el("div", "rp-col");
                if (day.label === busyLabel && day.count) col.classList.add("isBusy");
                if (day.iso === today) col.classList.add("isToday");
                const bar = el("span", "rp-bar");
                bar.style.setProperty("--h", Math.max(day.count ? 10 : 3, (day.count / max) * 100) + "%");
                bar.style.setProperty("--bd", LAND_DELAY + 300 + i * 60 + "ms");
                const value = el("em", "rp-barValue", day.count ? String(day.count) : "");
                bar.append(value);
                col.append(bar, el("span", "rp-day", day.label));
                col.title = day.iso + " · 일정 " + day.count + "개";
                bars.append(col);
            });
        } else {
            bars.append(el("p", "rp-empty", "요일별 일정을 불러오지 못했어요."));
        }
        weekBox.append(bars);

        const typeBox = piece(el("div", "rp-box"), order++);
        typeBox.append(el("p", "rp-boxTitle", "일정 종류"));
        const types = (report.types || []).filter((t) => t && t.count > 0);
        if (types.length) {
            const sum = types.reduce((s, t) => s + t.count, 0);
            const stack = el("div", "rp-stack");
            const legend = el("ul", "rp-legend");
            types.forEach((type, i) => {
                const color = TYPE_COLORS[i % TYPE_COLORS.length];
                const part = el("span", "rp-part");
                part.style.setProperty("--w", (type.count / sum) * 100 + "%");
                part.style.setProperty("--c", color);
                part.style.setProperty("--bd", LAND_DELAY + 450 + i * 120 + "ms");
                stack.append(part);

                const li = el("li");
                const dot = el("i");
                dot.style.background = color;
                li.append(dot, el("span", null, type.name), el("b", null, type.count + "개"));
                legend.append(li);
            });
            typeBox.append(stack, legend);
        } else {
            typeBox.append(el("p", "rp-empty", "이번 주에는 등록된 일정이 없어요."));
        }
        middle.append(weekBox, typeBox);

        // 아래: AI 한마디 (포스트잇 두 장)
        const notes = el("div", "rp-notes");
        if (report.warning) {
            const n = piece(el("div", "rp-note isWarn"), order++);
            n.append(el("span", "rp-noteIcon", "⚠️"), el("p", null, report.warning));
            notes.append(n);
        }
        if (report.tip) {
            const n = piece(el("div", "rp-note isTip"), order++);
            n.append(el("span", "rp-noteIcon", "💡"), el("p", null, report.tip));
            notes.append(n);
        }

        content.append(head, tiles, middle);
        if (notes.childElementCount) content.append(notes);

        countUp(totalNum, total);
        if (rate != null) countUp(rateNum, rate, "%");
        content.scrollTop = 0;
    }

    /* ---------- 열기 / 닫기 ---------- */
    let busy = false;
    let closing = null;

    function open() {
        clearTimeout(closing);
        overlay.hidden = false;
        overlay.classList.remove("is-out");
        void overlay.offsetWidth; // 애니메이션을 처음부터 다시 재생
        overlay.classList.add("is-in");
        close.focus({ preventScroll: true });
    }

    function hide() {
        if (overlay.hidden) return;
        overlay.classList.remove("is-in");
        overlay.classList.add("is-out");
        closing = setTimeout(() => {
            overlay.hidden = true;
            overlay.classList.remove("is-out");
            tab.focus({ preventScroll: true });
        }, 550);
    }

    tab.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (busy) return;

        busy = true;
        tab.classList.add("is-loading");
        tabLabel.textContent = "AI 일정 요약 중입니다...";

        try {
            const response = await fetch("/api/ai/week-report?date=" + toIso(new Date()));
            if (!response.ok) throw new Error("분석을 불러오지 못했어요");
            const report = await response.json();
            let days = null;
            try {
                days = await loadWeekDays(report.start, report.end);
            } catch (e) {
                days = null; // 막대는 못 그려도 리포트는 보여준다
            }
            render(report, days);
            open();
        } catch (error) {
            tabLabel.textContent = "분석을 불러오지 못했어요";
            await new Promise((resolve) => setTimeout(resolve, 1600));
        } finally {
            busy = false;
            tab.classList.remove("is-loading");
            tabLabel.textContent = "AI 일정 분석 보기";
        }
    });

    close.addEventListener("click", hide);
    overlay.addEventListener("click", (event) => {
        if (!paper.contains(event.target)) hide();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hide();
    });
})();
