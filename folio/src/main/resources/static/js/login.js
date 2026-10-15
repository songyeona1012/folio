/* =========================================================
   로그인 화면
   - 저자명(아이디)과 암호를 입력하고 Enter 또는 화살표를 누르면 표지가 펼쳐지고 /main 으로 넘어간다.
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

        // 애니메이션 이벤트가 오지 않는 환경을 위한 안전장치
        setTimeout(goMain, 2200);
    });

    /* ---------- 책이 다 펼쳐지면 main으로 ---------- */
    function goMain() {
        if (!leaving || goMain.done) return;
        goMain.done = true;
        window.location.href = "/main";
    }

    scene.addEventListener("animationend", function (event) {
        if (event.animationName === "bookOpen") {
            goMain();
        }
    });

    /* ---------- 회원가입: 아직 준비 중 ---------- */
    if (signupLink) {
        signupLink.addEventListener("click", function () {
            say("회원가입은 아직 준비 중이에요.");
        });
    }

    refreshReady();
});
