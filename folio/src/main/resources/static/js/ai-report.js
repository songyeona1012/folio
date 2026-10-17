// 메인 달력: 책 왼쪽 아래 "AI 일정 분석 보기" 탭과, 손이 내려주는 이번 주 일정 분석 기록지
(() => {
    "use strict";

    const notebook = document.querySelector(".notebook");
    if (!notebook) return;

    const pad = (n) => String(n).padStart(2, "0");
    const shortDate = (iso) => (iso ? iso.slice(5).replace("-", ".") : "");
    const todayIso = () => {
        const d = new Date();
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    };

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    /* ---------- 책 왼쪽 아래 탭 ---------- */
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
    overlay.setAttribute("aria-label", "이번 주 일정 분석");

    const scene = el("div", "aiReportScene");
    const paper = el("div", "aiReportPaper");
    const paperImg = el("img", "aiReportPaperImg");
    paperImg.src = "/img/report_background.png";
    paperImg.alt = "";
    paperImg.addEventListener("error", () => paper.classList.add("noImage"));

    const content = el("div", "aiReportContent");
    const close = el("button", "aiReportClose", "×");
    close.type = "button";
    close.setAttribute("aria-label", "분석 닫기");

    const hand = el("img", "aiReportHand");
    hand.src = "/img/hand.png";
    hand.alt = "";
    hand.addEventListener("error", () => (hand.hidden = true));

    paper.append(paperImg, content, close);
    scene.append(paper, hand);
    overlay.append(scene);
    document.body.append(overlay);

    function render(report) {
        content.replaceChildren();

        const head = el("div", "aiReportHead");
        head.append(
            el("p", "aiReportTitle", "📅 이번 주 일정 분석"),
            el("p", "aiReportRange", shortDate(report.start) + " ~ " + shortDate(report.end))
        );

        const stats = el("ul", "aiReportStats");
        stats.append(
            el("li", null, "총 일정: " + (report.total || 0) + "개"),
            el("li", null, "가장 바쁜 날: " + (report.busiestDay || "-"))
        );
        (report.types || []).forEach((type) => stats.append(el("li", null, type.name + ": " + type.count + "개")));

        // 왼쪽: 숫자 / 오른쪽: 경고와 여유 시간
        const notes = el("div", "aiReportNotes");
        if (report.warning) notes.append(el("p", "aiReportNote", "⚠️ " + report.warning));
        if (report.tip) notes.append(el("p", "aiReportNote", "💡 " + report.tip));

        const body = el("div", "aiReportBody");
        body.append(stats, notes);
        content.append(head, body);
    }

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
            const response = await fetch("/api/ai/week-report?date=" + todayIso());
            if (!response.ok) throw new Error("분석을 불러오지 못했어요");
            render(await response.json());
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
