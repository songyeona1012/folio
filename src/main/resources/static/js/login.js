document.addEventListener("DOMContentLoaded", function () {

    const loginButton =
        document.getElementById("loginButton");

    const usernameInput =
        document.getElementById("username");

    const passwordInput =
        document.getElementById("password");

    const loginScene =
        document.querySelector(".loginScene");


    if (
        !loginButton ||
        !usernameInput ||
        !passwordInput ||
        !loginScene
    ) {
        console.error("로그인 화면 요소를 찾을 수 없습니다.");
        return;
    }


    loginButton.addEventListener("click", function () {

        const username =
            usernameInput.value.trim();

        const password =
            passwordInput.value.trim();


        /* ------------------------------
           입력 검사
        ------------------------------ */

        if (
            username === "" ||
            password === ""
        ) {

            alert(
                "아이디와 패스워드를 입력해 주세요."
            );

            return;
        }


        /* ------------------------------
           중복 클릭 방지
        ------------------------------ */

        loginButton.disabled = true;


        /* ------------------------------
           책 펼치기
        ------------------------------ */

        loginScene.classList.add("opening");

    });


    /* -----------------------------------
       실제 페이지 애니메이션 종료
    ----------------------------------- */

    document.addEventListener(
        "animationend",
        function (event) {

            if (
                event.animationName !== "bookOpen"
            ) {
                return;
            }


            /*
             * 애니메이션이 완전히 끝난 뒤
             * main으로 이동
             */

            window.location.href = "/main";

        }
    );

});