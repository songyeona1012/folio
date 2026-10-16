// 공통 사이드바의 로그아웃 버튼을 처리합니다.
(() => {
    document.querySelectorAll("[data-account-logout]").forEach((button) => {
        button.addEventListener("click", async () => {
            button.disabled = true;
            try {
                const response = await fetch("/api/auth/logout", { method: "POST" });
                if (!response.ok && response.status !== 401) throw Error();
                location.href = "/login";
            } catch {
                button.textContent = "다시 로그아웃";
                button.disabled = false;
            }
        });
    });
})();
