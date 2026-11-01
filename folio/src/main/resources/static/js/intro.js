// 소개 화면: 스크롤 등장 효과, 첫 화면 다이어리 데모, 기능 데모, 버튼 이동을 처리합니다.
(() => {
    "use strict";

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- 버튼 이동 (주소가 다르면 여기만 고치면 된다) ---------- */
    const ROUTES = {
        login: "/login",
        signup: "/signup",
    };

    $$("[data-go]").forEach((button) => {
        button.addEventListener("click", () => {
            location.href = ROUTES[button.dataset.go] || "/login";
        });
    });

    /* ---------- 이미지가 없으면 조용히 대신 그리기 ---------- */
    $$("img[data-fallback]").forEach((img) => {
        const fail = () => {
            img.hidden = true;
            if (img.classList.contains("handoff-bg")) img.parentElement.classList.add("noimg");
        };
        if (img.complete && img.naturalWidth === 0) fail();
        img.addEventListener("error", fail);
    });

    /* ---------- 상단 메뉴: 조금 내리면 배경이 생긴다 ---------- */
    const nav = $("#nav");
    const onScrollNav = () => nav.classList.toggle("is-scrolled", window.scrollY > 10);
    window.addEventListener("scroll", onScrollNav, { passive: true });
    onScrollNav();

    /* ---------- 스크롤하면 떠오르며 나타나기 ---------- */
    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-in");
                revealObserver.unobserve(entry.target);
            });
        },
        { threshold: 0.18, rootMargin: "0px 0px -6% 0px" }
    );
    $$(".reveal").forEach((el) => revealObserver.observe(el));

    /* ---------- 글자 타이핑 도우미 ---------- */
    async function typeInto(el, text, speed = 70) {
        el.textContent = "";
        for (const ch of text) {
            el.textContent += ch;
            await sleep(reduceMotion ? 0 : speed + Math.random() * 40);
        }
    }

    async function erase(el, speed = 25) {
        while (el.textContent.length) {
            el.textContent = el.textContent.slice(0, -1);
            await sleep(reduceMotion ? 0 : speed);
        }
    }

    /* =========================================================
       첫 화면: 펼친 다이어리
       ========================================================= */
    const now = new Date();

    (function buildHeroCalendar() {
        const head = $(".mini-cal-head");
        const cal = $("#heroCal");
        if (!cal) return;
        const y = now.getFullYear();
        const m = now.getMonth();
        head.innerHTML = `<b>${m + 1}월</b><span>${y}</span>`;

        const first = new Date(y, m, 1).getDay();
        const total = new Date(y, m + 1, 0).getDate();
        const tagColors = ["#f2a679", "#9cc5a1", "#a8b4dc", "#e9c46a"];
        const tagged = new Set([3, 6, 9, 12, 14, 17, 20, 23, 26]);

        for (let i = 0; i < first; i++) {
            const blank = document.createElement("span");
            blank.className = "blank";
            cal.append(blank);
        }
        for (let d = 1; d <= total; d++) {
            const cell = document.createElement("span");
            cell.textContent = d;
            if (d === now.getDate()) cell.classList.add("today");
            if (tagged.has(d) && d !== now.getDate()) {
                const tag = document.createElement("i");
                tag.style.background = tagColors[d % tagColors.length];
                cell.append(tag);
            }
            cal.append(cell);
        }
    })();

    // "금요일 운동 8시로 미뤄줘" → 운동 시간이 20:00으로 바뀌고 안내가 뜬다 (반복)
    (async function heroDemo() {
        const typing = $("#heroTyping");
        const move = $("#heroMove");
        const moveTime = $("#heroMoveTime");
        const toast = $("#heroToast");
        if (!typing) return;

        await sleep(1200);
        for (;;) {
            await typeInto(typing, "금요일 운동 8시로 미뤄줘");
            await sleep(500);
            move.classList.add("is-moving");
            await sleep(300);
            moveTime.textContent = "20:00";
            toast.classList.add("show");
            await sleep(2400);
            toast.classList.remove("show");
            move.classList.remove("is-moving");
            await erase(typing);
            await sleep(900);
            moveTime.textContent = "18:00";
            await sleep(700);
        }
    })();

    // 마우스를 따라 스티커가 살짝 움직인다
    const hero = $(".hero");
    const stickers = $$(".sticker");
    if (hero && !reduceMotion && window.matchMedia("(pointer: fine)").matches) {
        hero.addEventListener("mousemove", (event) => {
            const rect = hero.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width - 0.5;
            const y = (event.clientY - rect.top) / rect.height - 0.5;
            stickers.forEach((s) => {
                const depth = Number(s.dataset.depth) || 16;
                s.style.transform = `translate(${x * depth}px, ${y * depth}px)`;
            });
        });
        hero.addEventListener("mouseleave", () => {
            stickers.forEach((s) => (s.style.transform = ""));
        });
    }

    /* =========================================================
       문제 제기: 스크롤하면 한 단어씩 진해진다
       ========================================================= */
    (function scrollWords() {
        const box = $("#problemText");
        if (!box) return;
        const accentFrom = box.textContent.indexOf("그래서");
        let count = 0;
        const words = box.textContent.split(" ").map((word) => {
            const span = document.createElement("span");
            span.className = "w";
            if (count >= accentFrom) span.classList.add("accent");
            count += word.length + 1;
            span.textContent = word;
            return span;
        });
        box.replaceChildren();
        words.forEach((span, i) => {
            box.append(span);
            if (i < words.length - 1) box.append(" ");
        });

        const update = () => {
            const rect = box.getBoundingClientRect();
            const vh = window.innerHeight;
            // 글 위쪽이 화면 85% 지점에 오면 시작, 글 아래쪽이 화면 45% 지점에 오면 끝
            const start = vh * 0.85;
            const end = vh * 0.45;
            const progress = (start - rect.top) / (start - end + rect.height);
            const on = Math.round(Math.max(0, Math.min(1, progress)) * words.length);
            words.forEach((span, i) => span.classList.toggle("on", i < on));
        };
        if (reduceMotion) {
            words.forEach((span) => span.classList.add("on"));
            return;
        }
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        update();
    })();

    /* =========================================================
       기능 01 달력: 말하듯 적으면 일정이 날짜 칸에 쏙 들어간다
       ========================================================= */
    (function calendarDemo() {
        const grid = $("#calDemo");
        const typing = $("#calTyping");
        const clash = $("#calClash");
        if (!grid) return;

        const COLORS = { study: "#8a9bcb", workout: "#7fa886", meet: "#e9c46a", new: "#e9692c" };
        const cells = [];
        // 일요일부터 2주 (날짜 숫자는 보기용)
        for (let i = 0; i < 14; i++) {
            const cell = document.createElement("span");
            cell.textContent = 8 + i;
            grid.append(cell);
            cells.push(cell);
        }

        function addTag(index, text, color, extraClass = "") {
            const tag = document.createElement("em");
            tag.className = "tag " + extraClass;
            tag.style.background = color;
            tag.textContent = text;
            if (cells[index].querySelector(".tag")) tag.style.bottom = "20px";
            cells[index].append(tag);
            return tag;
        }

        function reset() {
            cells.forEach((c) => c.querySelectorAll(".tag").forEach((t) => t.remove()));
            addTag(3, "스터디 19:00", COLORS.study);
            addTag(5, "운동", COLORS.workout);
            addTag(9, "회의", COLORS.meet);
        }

        let started = false;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting) && !started) {
                    started = true;
                    run();
                }
            },
            { threshold: 0.4 }
        );
        observer.observe(grid);

        async function run() {
            for (;;) {
                reset();
                await sleep(700);

                // 1) 새 일정 + 같은 시간 알림
                await typeInto(typing, "수요일 저녁 7시 가족 저녁식사");
                await sleep(450);
                addTag(3, "가족 저녁 19:00", COLORS.new, "pop");
                await sleep(500);
                clash.classList.add("show");
                await sleep(2200);
                clash.classList.remove("show");
                await erase(typing);
                await sleep(500);

                // 2) 기존 일정 미루기
                await typeInto(typing, "금요일 운동 다음 주로 미뤄줘");
                await sleep(450);
                const old = cells[5].querySelector(".tag");
                if (old) {
                    old.classList.add("leave");
                    await sleep(380);
                    old.remove();
                }
                addTag(12, "운동", COLORS.workout, "pop");
                await sleep(2200);
                await erase(typing);
                await sleep(800);
            }
        }
    })();

    /* =========================================================
       AI: 손이 기록지를 건네는 장면은 화면에 들어오면 한 번 재생
       ========================================================= */
    const handoff = $("#handoff");
    if (handoff) {
        const handObserver = new IntersectionObserver(
            (entries) => {
                if (!entries.some((e) => e.isIntersecting)) return;
                handoff.classList.add("is-in");
                handObserver.disconnect();
            },
            { threshold: 0.35 }
        );
        // 손은 화면 밖에서 시작하므로, 제자리를 차지하는 바깥 상자를 지켜본다
        handObserver.observe($("#handoffStage") || handoff);
    }
})();
