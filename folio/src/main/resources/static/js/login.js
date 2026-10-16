// 로그인·회원가입 입력과 암호 확인, 오류 메시지를 처리합니다.
/* Folio account signup and login. Passwords are checked by the server. */
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
    let authenticating = false;
    let registering = false;

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
    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (leaving || authenticating) return;

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (username === "" || password === "") {
            const empty = username === "" ? usernameInput : passwordInput;
            say("저자명과 암호를 입력해 주세요.");
            shake(empty);
            empty.focus();
            return;
        }

        authenticating = true;
        loginButton.disabled = true;
        try {
            await authRequest("/api/auth/login", { authorId: username, password });
        } catch (error) {
            say(error.message);
            authenticating = false;
            loginButton.disabled = false;
            return;
        }
        // Open the cover only after authentication succeeds.
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

    /* ---------- 회원가입 ---------- */
    if (signupLink) {
        signupLink.addEventListener("click", function () {
            document.getElementById("signupPanel").hidden = false;
            document.querySelector(".signupName").focus();
        });
    }

    const panel = document.getElementById("signupPanel");
    const signupForm = document.getElementById("signupForm");
    const status = document.getElementById("signupStatus");
    ["signupPassword", "signupConfirm"].forEach((id) => {
        const input = document.getElementById(id);
        function validatePasswordLength() {
            const length = input.value.length;
            input.setCustomValidity(
                length > 0 && length < 8
                    ? "암호는 8자 이상이어야 합니다. (현재 " + length + "자 입력 중)"
                    : ""
            );
        }
        input.addEventListener("input", validatePasswordLength);
        input.addEventListener("invalid", validatePasswordLength);
    });
    signupForm.addEventListener("reset", () => {
        document.getElementById("signupPassword").setCustomValidity("");
        document.getElementById("signupConfirm").setCustomValidity("");
    });
    function hidePasswords() {
        document.querySelectorAll(".passwordEye").forEach((button) => {
            document.getElementById(button.dataset.password).type = "password";
            button.querySelector("img").src = "/img/eye-closed.png";
        });
    }
    function closeSignup() {
        hidePasswords();
        panel.hidden = true;
        signupLink.focus();
    }
    document.getElementById("signupClose").addEventListener("click", closeSignup);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !panel.hidden) closeSignup();
    });
    document.querySelectorAll(".passwordEye").forEach((button) => {
        function reveal() {
            document.getElementById(button.dataset.password).type = "text";
            button.querySelector("img").src = "/img/eye-open.png";
        }
        button.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            button.setPointerCapture(event.pointerId);
            reveal();
        });
        ["pointerup", "pointercancel", "lostpointercapture", "blur"].forEach((type) =>
            button.addEventListener(type, hidePasswords)
        );
        button.addEventListener("keydown", (event) => {
            if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                reveal();
            }
        });
        button.addEventListener("keyup", hidePasswords);
    });
    window.addEventListener("blur", hidePasswords);
    document.addEventListener("visibilitychange", hidePasswords);
    document.addEventListener("pointerup", hidePasswords);
    async function authRequest(url, payload) {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const messages = {
                400: "입력한 이름과 암호를 확인해주세요. 암호는 8자 이상이어야 해요.",
                401: "저자명 또는 암호를 확인해주세요.",
                409: "이미 사용 중인 저자명이에요.",
            };
            throw new Error(messages[response.status] || "연결하지 못했어요. 잠시 후 다시 시도해주세요.");
        }
        return result;
    }
    signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        hidePasswords();
        if (registering) return;
        const data = Object.fromEntries(new FormData(signupForm));
        if (data.password !== data.passwordConfirm) {
            status.textContent = "암호가 일치하지 않습니다.";
            return;
        }
        const submit = document.getElementById("signupSubmit");
        registering = true;
        submit.disabled = true;
        status.textContent = "저자로 등록하고 있어요…";
        try {
            const author = await authRequest("/api/auth/signup", data);
            signupForm.reset();
            status.textContent = "";
            closeSignup();
            usernameInput.value = author.authorId;
            passwordInput.value = "";
            refreshReady();
            passwordInput.focus();
            say("등록됐어요. 암호를 입력해 폴리오를 펼쳐보세요.");
        } catch (error) {
            status.textContent = error.message;
        } finally {
            registering = false;
            submit.disabled = false;
        }
    });
    refreshReady();
});
