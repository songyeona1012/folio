/* =========================================================
   로그인 화면
   - 저자명(아이디)과 암호를 입력하고 Enter 또는 화살표를 누르면 표지가 열리고 속지가 한 장씩 넘어간 뒤 /main 으로 넘어간다.
   - 지금은 서버에서 아이디/암호를 확인하지 않는다 (기존 로그인 화면과 같은 방식).
   - 회원가입 화면은 아직 없어서 "폴리오의 저자가 되기"는 준비 중이라고만 알려 준다.
========================================================= */
document.addEventListener("DOMContentLoaded", function () {

    const scene = document.getElementById("loginScene");
    const form = document.getElementById("loginForm");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const loginButton = document.getElementById("loginButton");
    const signupLink = document.getElementById("signupLink");
    const note = document.getElementById("loginNote");

    if (!scene || !form || !usernameInput || !passwordInput || !loginButton || !note) {
        console.error("로그인 화면 요소를 찾을 수 없습니다.");
        return;
    }

    let noteTimer = 0;
    let leaving = false;

    // 움직임 줄이기를 켠 사람에게는 속지를 넘기지 않고 표지만 부드럽게 사라진다
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- 책 펼치기: 표지가 열리고 속지가 한 장씩 휘어지며 넘어간다 ---------- */
    const LEAF_COUNT = 3;      // 넘어가는 장 수
    const STRIP_COUNT = 14;    // 한 장을 몇 조각으로 이어 붙여 휘게 할지 (많을수록 매끄럽다)
    const COVER_MS = 1000;     // 표지가 열리는 시간
    const LEAF_START = 620;    // 첫 장이 넘어가기 시작하는 때 (표지가 아직 열리는 중)
    const LEAF_GAP = 280;      // 장과 장 사이 간격 (겹쳐서 넘어간다)
    const LEAF_MS = 950;       // 한 장이 넘어가는 시간
    const CURL_DEG = 34;       // 가장 휘었을 때 바깥쪽 끝이 앞서는 각도 합계
    const TOTAL_MS = LEAF_START + (LEAF_COUNT - 1) * LEAF_GAP + LEAF_MS;

    const closedPage = scene.querySelector(".closedBookPage");
    const openBook = scene.querySelector(".openBook");
    const leaves = [];

    const clamp01 = function (x) { return Math.min(1, Math.max(0, x)); };
    const easeInOut = function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
    const rad = function (deg) { return deg * Math.PI / 180; };
    // 면이 정면일수록 밝고 비스듬할수록 어둡다 (앞면·뒷면 모두 같은 식)
    const shade = function (deg, strength) { return (strength * (1 - Math.abs(Math.cos(rad(deg))))).toFixed(3); };

    function buildLeaves() {
        const book = scene.querySelector(".closedBook");
        if (!book || reduceMotion) return;

        // 맨 아래에 깔려 있는 쪽: 넘어가지 않고, 위에서 넘어가는 장의 그림자를 받는다
        const base = document.createElement("div");
        base.className = "leaf base";
        base.setAttribute("aria-hidden", "true");
        base.style.setProperty("--z", "-2px");
        const baseFace = document.createElement("div");
        baseFace.className = "face front";
        base.appendChild(baseFace);

        for (let i = 0; i < LEAF_COUNT; i++) {
            const leaf = document.createElement("div");
            leaf.className = "leaf";
            leaf.setAttribute("aria-hidden", "true");
            leaf.style.setProperty("--n", String(STRIP_COUNT));
            // 겹쳐 놓은 순서: 표지 > 첫 장 > 둘째 장 ... (넘어가면 순서가 뒤집혀 나중에 넘긴 장이 위로 쌓인다)
            const z = 10 - 4 * i;
            leaf.style.setProperty("--z", z + "px");

            const strips = [];
            let parent = leaf;
            for (let k = 0; k < STRIP_COUNT; k++) {
                const strip = document.createElement("div");
                strip.className = k === STRIP_COUNT - 1 ? "strip tip" : "strip";
                const front = document.createElement("div");
                front.className = "face front";
                const back = document.createElement("div");
                back.className = "face back";
                strip.appendChild(front);
                strip.appendChild(back);
                parent.appendChild(strip);
                strips.push(strip);
                parent = strip;
            }
            leaves.push({ el: leaf, strips: strips, cast: null, z: z });
        }

        // 그림자는 바로 아래 장(없으면 맨 아래 쪽)의 면 위에 얹는다. 그 장과 함께 움직이므로 겹쳐도 가려지지 않는다.
        leaves.forEach(function (leaf, i) {
            const cast = document.createElement("div");
            cast.className = "pageCast";
            cast.setAttribute("aria-hidden", "true");
            (i + 1 < leaves.length ? leaves[i + 1].el : base).appendChild(cast);
            leaf.cast = cast;
        });

        // DOM 순서: 아래 장이 먼저 (깊이는 translateZ 가 정한다)
        book.insertBefore(base, book.firstChild);
        for (let i = leaves.length - 1; i >= 0; i--) {
            book.insertBefore(leaves[i].el, book.firstChild);
        }
    }

    // t(ms): 책 펼치기를 시작하고 흐른 시간. 이 시각의 모습을 그대로 그린다.
    function renderFlip(t) {
        // 표지
        const cover = -180 * easeInOut(clamp01(t / COVER_MS));
        if (closedPage) {
            closedPage.style.transform = "rotateY(" + cover.toFixed(2) + "deg) translateZ(14px)";
            closedPage.style.setProperty("--dim", shade(cover, 0.55));
        }
        // 펼쳐진 책은 표지가 열리기 시작한 뒤 아래에서 나타난다
        if (openBook) {
            openBook.style.opacity = clamp01((t - 300) / 350).toFixed(3);
        }

        leaves.forEach(function (leaf, i) {
            const p = clamp01((t - (LEAF_START + i * LEAF_GAP)) / LEAF_MS);
            const e = easeInOut(p);
            const angle = -180 * e;
            const curl = CURL_DEG * Math.sin(Math.PI * e);     // 바깥쪽이 앞서 휘는 정도
            const rel = -curl / (STRIP_COUNT - 1);             // 조각마다 더해지는 각도

            leaf.el.style.transform = "rotateY(" + angle.toFixed(2) + "deg) translateZ(" + leaf.z + "px)";

            let abs = angle;
            let tipX = 0;   // 속지 끝이 책등에서 떨어진 거리 (속지 너비를 1로)
            leaf.strips.forEach(function (strip, k) {
                const r = k === 0 ? 0 : rel;
                strip.style.transform = "rotateY(" + r.toFixed(3) + "deg)";
                // 조각 하나는 왼쪽 끝에서 오른쪽 끝으로 가며 각도가 조금 더 바뀐다
                const left = abs + r;
                const right = left + rel;
                strip.style.setProperty("--d0", shade(left, 0.28));
                strip.style.setProperty("--d1", shade(right, 0.28));
                abs += r;
                tipX += Math.cos(rad(abs)) / STRIP_COUNT;
            });

            // 오른쪽 쪽 위에 떠 있는 동안, 속지 끝에서 오른쪽으로 그림자가 번진다
            const over = angle > -90;
            leaf.cast.style.opacity = over ? (0.9 * Math.sin(Math.PI * Math.min(1, e * 2))).toFixed(3) : "0";
            leaf.cast.style.left = (Math.max(0, tipX) * 100).toFixed(2) + "%";
        });
    }

    let flipStart = 0;
    function flipFrame(now) {
        if (!flipStart) flipStart = now;
        const t = now - flipStart;
        renderFlip(t);
        if (t < TOTAL_MS) {
            requestAnimationFrame(flipFrame);
        } else {
            renderFlip(TOTAL_MS);
            setTimeout(goMain, 250); // 마지막 장이 내려앉은 모습을 잠깐 보여 준다
        }
    }

    function startFlip() {
        if (reduceMotion) return;
        renderFlip(0);
        requestAnimationFrame(flipFrame);
    }

    buildLeaves();

    /* ---------- 안내 말 ---------- */
    function say(message) {
        clearTimeout(noteTimer);
        note.textContent = message;
        note.classList.add("is-visible");
        noteTimer = setTimeout(function () {
            note.classList.remove("is-visible");
        }, 3200);
    }

    function hideNote() {
        clearTimeout(noteTimer);
        note.classList.remove("is-visible");
    }

    function shake(input) {
        const row = input.closest(".labelRow");
        if (!row) return;
        row.classList.remove("is-shaking");
        void row.offsetWidth; // 같은 애니메이션을 다시 시작
        row.classList.add("is-shaking");
    }

    /* ---------- 둘 다 쓰면 화살표가 또렷해진다 ---------- */
    function refreshReady() {
        const ready = usernameInput.value.trim() !== "" && passwordInput.value.trim() !== "";
        form.classList.toggle("is-ready", ready);
    }

    form.addEventListener("input", function () {
        refreshReady();
        hideNote();
    });

    /* ---------- 로그인 ---------- */
    form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (leaving) return;

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (username === "" || password === "") {
            const empty = username === "" ? usernameInput : passwordInput;
            say("저자명과 암호를 입력해 주세요.");
            shake(empty);
            empty.focus();
            return;
        }

        // 중복 클릭 방지 후 책 펼치기
        leaving = true;
        loginButton.disabled = true;
        usernameInput.readOnly = true;
        passwordInput.readOnly = true;
        hideNote();
        scene.classList.add("opening");
        startFlip();

        // 애니메이션이 돌지 않는 환경(백그라운드 탭 등)을 위한 안전장치
        setTimeout(goMain, reduceMotion ? 1200 : TOTAL_MS + 1200);
    });

    /* ---------- 다 넘어가면 main으로 ---------- */
    function goMain() {
        if (!leaving || goMain.done) return;
        goMain.done = true;
        window.location.href = "/main";
    }

    // 움직임 줄이기: 표지가 사라지는 애니메이션이 끝나면 이동한다
    scene.addEventListener("animationend", function (event) {
        if (reduceMotion && event.animationName === "bookFade") {
            goMain();
        }
    });

    /* ---------- 회원가입: 아직 준비 중 ---------- */
    if (signupLink) {
        signupLink.addEventListener("click", function () {
            say("회원가입은 아직 준비 중이에요.");
        });
    }

    // 뒤로 가기로 돌아오면 책이 이미 넘어간 채로 남아 있으니, 처음 모습으로 다시 불러온다
    window.addEventListener("pageshow", function (event) {
        if (event.persisted) {
            window.location.reload();
        }
    });

    refreshReady();
});
