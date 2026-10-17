// 나의 정보 화면의 암호 확인·프로필 미리보기·저장·탈퇴를 처리합니다.
(() => {
    const $ = (id) => document.getElementById(id);
    // 마지막 한글 음절의 받침 여부에 따라 이름 뒤의 이/가를 고릅니다.
    const authorName = $("profileName").value.trim().normalize("NFC");
    const lastCharacter = Array.from(authorName).pop() || "";
    const lastCode = lastCharacter.codePointAt(0);
    const hasFinalConsonant = lastCode >= 0xac00 && lastCode <= 0xd7a3 && (lastCode - 0xac00) % 28 !== 0;
    $("nameParticle").textContent = hasFinalConsonant ? "이" : "가";
    const status = $("profileStatus");
    let token = "",
        expires = 0,
        file = null,
        resetImage = false,
        previewUrl = null,
        saving = false;
    let originalImage = $("profilePreview").src;
    function hidePasswords() {
        document.querySelectorAll(".myInfoEye").forEach((button) => {
            $(button.dataset.password).type = "password";
            button.querySelector("img").src = "/img/eye-closed.png";
        });
    }
    // 암호 확인이 만료되거나 끝났을 때 편집 영역을 다시 잠급니다.
    function lock() {
        token = "";
        $("profileFields").disabled = true;
        $("profileFields").setAttribute("inert", "");
        $("rememberButton").hidden = true;
        $("withdrawButton").disabled = true;
        $("editWelcome").hidden = true;
        hidePasswords();
    }
    // 프로필 API 호출에 편집 인증 정보를 함께 보냅니다.
    async function api(path, options = {}) {
        const headers = new Headers(options.headers || {});
        if (token) headers.set("X-Profile-Edit", token);
        const response = await fetch("/api/auth/" + path, { ...options, headers });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) {
            location.href = "/login";
            throw Error("로그인이 필요합니다.");
        }
        if (response.status === 403) {
            lock();
            throw Error("현재 암호를 다시 확인해주세요.");
        }
        if (!response.ok)
            throw Error(
                result.detail ||
                    result.message ||
                    {
                        400: "입력한 정보를 확인해주세요.",
                        409: "이미 사용 중인 저자명이에요.",
                        429: "잠시 후 다시 확인해주세요.",
                    }[response.status] ||
                    "저장하지 못했어요. 잠시 후 다시 시도해주세요."
            );
        return result;
    }
    function json(data) {
        return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
    }
    $("verifyForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        if (saving) return;
        lock();
        $("verifyButton").disabled = true;
        status.textContent = "암호를 확인하고 있어요…";
        try {
            const result = await api("verify-password", {
                method: "POST",
                ...json({ password: $("currentPassword").value }),
            });
            token = result.token;
            $("currentPassword").value = "";
            $("profileFields").disabled = false;
            $("profileFields").removeAttribute("inert");
            $("welcomeText").textContent =
                "“" + $("profileName").value + "”님이 맞으시군요!\n환영합니다.\n수정 권한이 열렸습니다!";
            $("editWelcome").hidden = false;
            $("rememberButton").hidden = false;
            $("withdrawButton").disabled = false;
            status.textContent = "";
            clearTimeout(expires);
            expires = setTimeout(() => {
                lock();
                status.textContent = "확인 시간이 지났어요. 현재 암호를 다시 입력해주세요.";
            }, 600000);
        } catch (error) {
            status.textContent = error.message.includes("입력한 정보")
                ? "암호를 확인해주세요."
                : error.message;
        } finally {
            $("verifyButton").disabled = false;
        }
    });
    // 저장 전 선택한 프로필 사진을 화면에 미리 보여줍니다.
    function preview(src) {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            previewUrl = null;
        }
        $("profilePreview").src = src;
    }
    $("profileFile").addEventListener("change", () => {
        const selected = $("profileFile").files[0];
        if (!selected) return;
        if (selected.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(selected.type)) {
            status.textContent = "PNG·JPG 사진을 2MB 이하로 선택해주세요.";
            $("profileFile").value = "";
            return;
        }
        file = selected;
        resetImage = false;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(file);
        $("profilePreview").src = previewUrl;
        status.textContent = "기억하기를 눌러 사진을 저장해주세요.";
    });
    $("profileReset").addEventListener("click", () => {
        file = null;
        resetImage = true;
        $("profileFile").value = "";
        preview("/img/default-mascot.png");
        status.textContent = "기억하기를 누르면 기본 마스코트로 저장됩니다.";
    });
    $("profileForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!token || saving) return;
        const password = $("newPassword").value;
        if (password !== $("confirmPassword").value) {
            status.textContent = "암호가 일치하지 않습니다.";
            return;
        }
        const data = new FormData();
        data.append("displayName", $("profileName").value);
        data.append("authorId", $("profileAuthorId").value);
        data.append("password", password);
        data.append("passwordConfirm", $("confirmPassword").value);
        data.append("resetImage", String(resetImage));
        if (file) data.append("image", file);
        saving = true;
        $("rememberButton").disabled = true;
        status.textContent = "기억하고 있어요…";
        hidePasswords();
        try {
            await api("profile/save", { method: "POST", body: data });
            location.reload();
        } catch (error) {
            status.textContent = error.message;
        } finally {
            saving = false;
            $("rememberButton").disabled = false;
        }
    });
    $("newPassword").addEventListener("input", () => {
        const n = $("newPassword").value.length;
        $("newPassword").setCustomValidity(
            n > 0 && n < 8 ? "암호는 8자 이상이어야 합니다. (현재 " + n + "자 입력 중)" : ""
        );
    });
    document.querySelectorAll(".myInfoEye").forEach((button) => {
        function reveal() {
            $(button.dataset.password).type = "text";
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
    $("withdrawButton").addEventListener("click", async () => {
        if (!token || saving) return;
        if (
            !confirm(
                "회원 탈퇴 시 이 계정의 일정, 일기, 목표와 관리 기록이 모두 삭제되며 복구할 수 없습니다. 정말 탈퇴하시겠습니까?"
            )
        )
            return;
        saving = true;
        $("withdrawButton").disabled = true;
        $("rememberButton").disabled = true;
        status.textContent = "탈퇴를 처리하고 있어요…";
        try {
            await api("account", { method: "DELETE" });
            location.href = "/login";
        } catch (error) {
            status.textContent = error.message;
            saving = false;
            $("withdrawButton").disabled = !token;
            $("rememberButton").disabled = false;
        }
    });
    lock();
    api("me")
        .then((author) => {
            $("profileName").value = author.displayName;
            $("profileAuthorId").value = author.authorId;
            originalImage = author.avatar || "/img/default-mascot.png";
            preview(originalImage);
        })
        .catch((error) => (status.textContent = error.message));
})();
