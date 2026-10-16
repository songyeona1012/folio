// 로그인·회원가입 입력과 암호 확인, 오류 메시지, 로그인 뒤 책 펼치기 애니메이션을 처리합니다.
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

    // Windows 의 "애니메이션 효과"가 꺼져 있거나(원격 접속·절전 모드 포함) 브라우저가 '움직임 줄이기'를 알리면
    // 책이 넘어가는 연출 없이 표지가 0.4초 동안 사라지기만 한다. 이 화면의 핵심 연출이라 기본은 설정과 상관없이 항상 보여 준다.
    // 설정을 따르게 하려면 아래를 true 로 바꾼다.
    const RESPECT_REDUCED_MOTION = false;
    const reduceMotion = RESPECT_REDUCED_MOTION && !!window.matchMedia
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) { document.documentElement.classList.add("calmMotion"); }

    /* ---------- 책 펼치기 ----------
       표지가 천천히 들리며 넘어가고, 속지가 한 장씩 휘어지며 넘어간다.
       빛은 왼쪽 앞에서 비춘다고 보고, 종이 각 부분이 기울어진 만큼 밝고 어둡게 칠한다. */
    const LEAF_COUNT = 2;        // 넘어가는 장 수
    const STRIP_COUNT = 16;      // 한 장을 몇 조각으로 이어 휘게 할지 (많을수록 매끄럽다)
    const COVER_MS = 1500;       // 표지가 열리는 시간
    const LEAF_START = 950;      // 첫 장이 넘어가기 시작하는 때 (표지가 아직 열리는 중)
    const LEAF_GAP = 600;        // 장과 장 사이 간격 (겹쳐서 넘어간다)
    const LEAF_MS = 1500;        // 한 장이 넘어가는 시간
    const BEND_UP = 70;          // 들어 올릴 때 바깥쪽 끝이 앞서 휘는 각도(도)
    const BEND_DOWN = 38;        // 내려앉을 때 바깥쪽 끝이 뒤처져 휘는 각도(도)
    const SETTLE_MS = 550;       // 마지막 장이 내려앉은 뒤, 클립 꽂힌 장이 살짝 넘어간 모습을 그대로 보여 주는 시간
    const XFADE_MS = 450;        // 그다음 main 과 똑같은 펼친 책 그림으로 바뀌는 시간
    const REST_LIFT = 3;         // 클립이 꽂힌 마지막 장이 다 넘어가지 않고 책등 쪽에서 들려 있는 각도(도)
    const REST_CURL = 10;        // 그리고 바깥쪽 끝이 위로 말려 있는 정도(도)
    const PERSPECTIVE_RATIO = 4.6; // 원근: 책 너비의 몇 배 거리에서 보는지 (작을수록 입체감이 세다)
    const LEAF_STEP = 3;         // 쌓인 종이 사이의 높이(px)
    const COVER_THICK = 8;       // 표지 두께(px)
    const COVER_Z = LEAF_COUNT * LEAF_STEP + COVER_THICK / 2 + 8;  // 표지 중심이 놓이는 높이 (속지보다 충분히 위: 낮으면 표지가 살짝 들릴 때 책등 쪽에 속지가 비친다)
    const LIGHT_X = -0.52;       // 빛이 오는 방향 (왼쪽으로 기울어 있다)
    const LIGHT_Z = 0.85;
    const PAGE_SHADE = 0.13;     // 속지가 빛을 등질 때 가장 어두워지는 정도
    const COVER_SHADE = 0.26;    // 표지가 빛을 등질 때 가장 어두워지는 정도
    const GUTTER_ALPHA = 0.26;   // 책등 쪽 그늘의 진하기
    const GUTTER_WIDTH = 0.07;   // 책등 쪽 그늘이 퍼지는 폭 (속지 너비 비율)
    const TOTAL_MS = LEAF_START + (LEAF_COUNT - 1) * LEAF_GAP + LEAF_MS;
    const END_MS = TOTAL_MS + SETTLE_MS + XFADE_MS;
    // 암호 확인(서버 응답)을 기다리는 동안: 누르자마자 표지가 이만큼(ms 환산, 약 19°) 들리고 거기서 숨을 고른다.
    // 확인이 끝나면 그 자리에서 이어서 펼쳐지고, 실패하면 도로 닫힌다.
    const HOLD_MS = 450;
    const SLOW_MS = 260;         // 들리는 자리에 가까워질수록 느려지는 구간
    const REWIND_SPEED = 1.7;    // 실패했을 때 닫히는 속도 (펼칠 때의 배)

    const closedPage = scene.querySelector(".closedBookPage");
    const closedBook = scene.querySelector(".closedBook");
    const openBook = scene.querySelector(".openBook");
    const spreadShadow = scene.querySelector(".spreadShadow");
    const bookBlock = scene.querySelector(".bookBlock");
    let backBoard = null;
    const leaves = [];
    let coverCast = null;
    let perspective = 3000;       // beginFlip 에서 책 크기에 맞춰 다시 계산한다
    let leafWidth = 600;
    let spineX = 0;               // 책등의 가로 위치 (장면 기준)
    let boardW = 600;             // 표지(가죽) 너비

    const clamp01 = function (x) { return Math.min(1, Math.max(0, x)); };
    const easeCover = function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
    const easeLeaf = function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; };
    const rad = function (deg) { return deg * Math.PI / 180; };

    // 면이 빛을 받는 정도 (위를 보고 평평하게 놓였을 때 1, 빛에서 멀어질수록 0에 가깝다)
    function lit(deg, back) {
        const r = rad(deg);
        let nx = Math.sin(r), nz = Math.cos(r);
        if (back) { nx = -nx; nz = -nz; }
        return (nx * LIGHT_X + nz * LIGHT_Z) / LIGHT_Z;
    }
    // 어두워지는 정도 (0~1)
    function dark(deg, back, strength) {
        // 빛이 등지는 면도 방 안의 빛이 있어서 완전히 까맣지는 않다
        return clamp01((1 - Math.max(0, Math.min(1, lit(deg, back)))) * strength);
    }

    // 속지가 휘는 정도: 처음엔 바깥쪽이 먼저 들리고, 내려앉을 때는 바깥쪽이 살짝 늦게 따라온다
    function bendOf(p) {
        const up = p < 0.6 ? Math.sin(Math.PI * p / 0.6) : 0;
        const down = p > 0.5 ? Math.sin(Math.PI * (p - 0.5) / 0.5) : 0;
        return BEND_UP * up - BEND_DOWN * down;
    }

    // 조각마다 얼마나 휘는지 나누는 비율: 책등 쪽은 덜, 바깥쪽은 더 휜다 (합이 1)
    const bendShare = [];
    (function () {
        let sum = 0;
        for (let k = 1; k < STRIP_COUNT; k++) { sum += 0.35 + 0.65 * (k / (STRIP_COUNT - 1)); }
        let acc = 0;
        bendShare.push(0);
        for (let k = 1; k < STRIP_COUNT; k++) {
            acc += (0.35 + 0.65 * (k / (STRIP_COUNT - 1))) / sum;
            bendShare.push(acc);    // 책등에서 k번째 조각까지 누적
        }
    })();

    function makeCast(host, z) {
        const cast = document.createElement("div");
        cast.className = "pageCast";
        cast.setAttribute("aria-hidden", "true");
        cast.style.setProperty("--z", z.toFixed(1) + "px");
        host.appendChild(cast);
        return cast;
    }

    function buildLeaves() {
        if (!closedBook || reduceMotion) return;

        // 맨 아래에 깔려 있는 쪽: 넘어가지 않고, 위에서 넘어가는 장의 그림자를 받는다
        const base = document.createElement("div");
        base.className = "leaf base";
        base.setAttribute("aria-hidden", "true");
        const baseFace = document.createElement("div");
        baseFace.className = "face front";
        base.appendChild(baseFace);

        const fragment = document.createDocumentFragment();

        // 뒤표지: 오른쪽 쪽 아래에 깔린 가죽 (표지가 열리면 맨 아래 쪽 둘레로 보인다)
        backBoard = document.createElement("div");
        backBoard.className = "backBoard";
        backBoard.setAttribute("aria-hidden", "true");
        fragment.appendChild(backBoard);
        fragment.appendChild(base);

        for (let i = 0; i < LEAF_COUNT; i++) {
            const leaf = document.createElement("div");
            leaf.className = "leaf";
            leaf.setAttribute("aria-hidden", "true");
            leaf.style.setProperty("--n", String(STRIP_COUNT));
            // 겹쳐 놓은 순서: 표지 > 첫 장 > 둘째 장 ... (넘어가면 순서가 뒤집혀 나중에 넘긴 장이 위로 쌓인다)
            const z = (LEAF_COUNT - i) * LEAF_STEP;

            const strips = [];
            for (let k = 0; k < STRIP_COUNT; k++) {
                const strip = document.createElement("div");
                strip.className = k === STRIP_COUNT - 1 ? "strip tip" : "strip";
                const front = document.createElement("div");
                front.className = "face front";
                const back = document.createElement("div");
                back.className = "face back";
                strip.appendChild(front);
                strip.appendChild(back);
                leaf.appendChild(strip);
                strips.push(strip);
            }
            leaves.push({ el: leaf, strips: strips, cast: null, z: z, lastP: -1 });
            fragment.appendChild(leaf);
        }

        // 떠 있는 종이의 그림자는 바로 아래에 있는 종이 바로 위에 깔린다
        leaves.forEach(function (leaf, i) {
            const hostZ = i + 1 < leaves.length ? leaves[i + 1].z : 0;
            leaf.cast = makeCast(fragment, hostZ + 1.5);
        });
        coverCast = makeCast(fragment, leaves[0].z + 1.5);

        // 표지의 두께: 오른쪽(바깥쪽) 끝과 위·아래 가장자리에 얇은 가죽색 벽을 세운다
        ["right", "top", "bottom"].forEach(function (side) {
            const wall = document.createElement("div");
            wall.className = "coverWall " + side;
            wall.setAttribute("aria-hidden", "true");
            closedPage.insertBefore(wall, closedPage.firstChild);
        });
        closedPage.style.setProperty("--thick", COVER_THICK + "px");
        closedPage.style.setProperty("--thick-half", (COVER_THICK / 2) + "px");
        closedBook.insertBefore(fragment, closedBook.firstChild);
    }

    // 떠 있는 물체가 왼쪽 앞의 빛 때문에 오른쪽 쪽 위에 드리우는 그림자의 끝 (책등에서부터의 거리)
    function shadowReach(x, z) {
        return x + z * (-LIGHT_X / LIGHT_Z);
    }

    function setCast(cast, reach) {
        const w = Math.min(leafWidth, Math.max(0, reach));
        cast.style.width = w.toFixed(1) + "px";
        cast.style.opacity = w > 2 ? "1" : "0";
    }

    // 마지막 장이 쉬는 자세(살짝 들리고 말린)에서 바깥쪽 끝이 종이 면보다 얼마나 떠 있는지(px)
    function restHeight() {
        const w = leafWidth / STRIP_COUNT;
        const theta = -180 + REST_LIFT;
        const bend = bendOf(1) - REST_CURL;
        let z = 0;
        for (let k = 0; k < STRIP_COUNT; k++) {
            z -= w * Math.sin(rad(theta - bend * bendShare[k]));
        }
        return Math.max(0, z);
    }

    // t(ms): 책 펼치기를 시작하고 흐른 시간. 이 시각의 모습을 그대로 그린다.
    function renderFlip(t) {
        // 표지: 책등을 축으로 넘어간다. 가까워지는 만큼 커 보이는 것은 scale 로 상쇄해서 시작할 때 튀지 않게 한다.
        // 다 넘어가면 표지는 속지 뒤(-COVER_Z)로 가라앉아 작아 보이므로, 상쇄도 cos 로 반대 방향이 되어 펼쳤을 때 가죽 테두리가 속지보다 작아지지 않는다.
        const a = -180 * easeCover(clamp01(t / COVER_MS));
        closedPage.style.transform = "scale(" + (1 - COVER_Z * Math.cos(rad(a)) / perspective).toFixed(5) + ") rotateY(" + a.toFixed(2) + "deg) translateZ(" + COVER_Z + "px)";
        closedPage.style.setProperty("--dimF", dark(a, false, COVER_SHADE).toFixed(3));
        closedPage.style.setProperty("--dimB", dark(a, true, COVER_SHADE).toFixed(3));
        // 표지가 넘어가며 첫 장 위에 드리우는 그림자
        const coverW = leafWidth;
        setCast(coverCast, shadowReach(coverW * Math.cos(rad(a)), -coverW * Math.sin(rad(a))));

        // 펼친 두 쪽 둘레의 그림자: 오른쪽 쪽은 표지가 열리기 시작한 뒤 나타나고, 왼쪽은 표지가 넘어가 덮이는 만큼 따라 넓어진다.
        // 장이 다 내려앉으면 main 의 책과 똑같은 그림(.openBook)이 3D 책 위로 서서히 덮이고, 그림자는 그 그림이 대신한다.
        // (책등 그늘 같은 세부가 달라서, 이렇게 겹쳐 바꿔야 main 으로 넘어갈 때 화면이 튀지 않는다)
        const imgIn = clamp01((t - TOTAL_MS - SETTLE_MS) / XFADE_MS);
        if (backBoard) {
            backBoard.style.opacity = clamp01((t - 60) / 290).toFixed(3);   // 표지가 조금 들린 뒤부터 보인다
        }
        if (spreadShadow) {
            // 표지(가죽) 둘레까지 포함한 두 쪽의 자리
            const reachL = Math.min(0, boardW * Math.cos(rad(a)));
            spreadShadow.style.left = (spineX + reachL).toFixed(1) + "px";
            spreadShadow.style.width = (boardW - reachL).toFixed(1) + "px";
            spreadShadow.style.opacity = (clamp01((t - 300) / 350) * (1 - imgIn)).toFixed(3);
        }
        if (openBook) {
            openBook.style.opacity = imgIn.toFixed(3);
            openBook.style.zIndex = imgIn > 0 ? "20" : "";
        }

        const w = leafWidth / STRIP_COUNT;
        const gutterW = leafWidth * GUTTER_WIDTH;
        const gutter = function (s) {
            const q = Math.max(0, 1 - s / gutterW);
            return GUTTER_ALPHA * q * q;
        };
        const mix = function (shade, s) {
            return (1 - (1 - shade) * (1 - gutter(s))).toFixed(3);
        };

        leaves.forEach(function (leaf, i) {
            const p = clamp01((t - (LEAF_START + i * LEAF_GAP)) / LEAF_MS);
            // 아직 안 움직였거나 이미 다 넘어간 장은 모습이 그대로라 다시 그리지 않는다
            if (p === leaf.lastP && (p === 0 || p === 1)) return;
            leaf.lastP = p;
            let theta = -180 * easeLeaf(p);
            let bend = bendOf(p);
            if (i === leaves.length - 1) {
                // 클립이 꽂힌 마지막 장: 다 눕지 않고 살짝 넘어간 채로 멈춘다 (책등 쪽이 들려 있고 바깥쪽 끝이 조금 말린다)
                const rest = clamp01((p - 0.55) / 0.45);
                const smooth = rest * rest * (3 - 2 * rest);
                theta += REST_LIFT * smooth;
                bend -= REST_CURL * smooth;
                // 들린 만큼 원근 때문에 커 보여서 왼쪽 가죽 테두리를 덮으므로, 그만큼 줄여 그린다 (바깥 끝이 원래 크기가 되도록)
                leaf.el.style.transform = "scale(" + (1 - (leaf.z + restHeight() * smooth) / perspective).toFixed(5) + ")";
            }

            // 1) 각 조각의 각도와 위치 (책등에서 바깥쪽으로 이어 붙인다)
            const angle = [];
            const xs = [];
            const zs = [];
            let x = 0, z = 0;
            for (let k = 0; k < STRIP_COUNT; k++) {
                const phi = theta - bend * bendShare[k];
                angle.push(phi);
                xs.push(x);
                zs.push(z);
                x += w * Math.cos(rad(phi));
                z -= w * Math.sin(rad(phi));
            }
            xs.push(x);
            zs.push(z);

            // 2) 조각마다 위치·각도·밝기를 넣는다 (밝기는 이웃 조각과 이어지도록 꼭짓점 각도로 계산)
            let reach = 0;
            for (let k = 0; k < STRIP_COUNT; k++) {
                const strip = leaf.strips[k];
                strip.style.transform = "translate3d(" + xs[k].toFixed(2) + "px,0," + zs[k].toFixed(2) + "px) rotateY(" +
                    angle[k].toFixed(3) + "deg) translateZ(" + leaf.z + "px)";

                const left = k === 0 ? angle[0] : (angle[k - 1] + angle[k]) / 2;
                const right = k === STRIP_COUNT - 1 ? angle[k] : (angle[k] + angle[k + 1]) / 2;
                strip.style.setProperty("--f0", mix(dark(left, false, PAGE_SHADE), k * w));
                strip.style.setProperty("--f1", mix(dark(right, false, PAGE_SHADE), (k + 1) * w));
                strip.style.setProperty("--b0", mix(dark(left, true, PAGE_SHADE), k * w));
                strip.style.setProperty("--b1", mix(dark(right, true, PAGE_SHADE), (k + 1) * w));

                reach = Math.max(reach, shadowReach(xs[k + 1], zs[k + 1]));
            }

            // 3) 이 장이 바로 아래 종이 위에 드리우는 그림자
            setCast(leaf.cast, reach);
        });
    }

    // 펼친 두 쪽(표지 가죽 포함)이 놓이는 자리의 위아래를 그림자 상자에 맞춘다
    function placeSpread() {
        if (!spreadShadow || !bookBlock) return;
        spineX = closedBook.offsetLeft + bookBlock.offsetLeft;     // 경첩 = 책등. 넓이(left, width)는 renderFlip 이 표지 위치에 맞춰 넣는다
        boardW = bookBlock.offsetWidth;
        spreadShadow.style.top = (closedBook.offsetTop + bookBlock.offsetTop) + "px";
        spreadShadow.style.height = bookBlock.offsetHeight + "px";
    }

    // 닫혀 있을 때 책 윗면에 꽂혀 있는 클립과 똑같은 모양·자리의 클립을 마지막 속지(앞면·뒷면 모두)에 꽂는다.
    // 속지가 넘어가면 클립도 함께 왼쪽으로 넘어가 왼쪽 쪽에 꽂힌 채 남는다.
    function placeClips() {
        scene.querySelectorAll(".leafClip").forEach(function (el) { el.remove(); });
        const host = leaves[leaves.length - 1];
        const source = closedBook.querySelector(".paperclip");
        if (!host || !source) return;
        const cb = closedBook.getBoundingClientRect();
        const cr = source.getBoundingClientRect();
        const w = leafWidth / STRIP_COUNT;                  // 조각 하나의 너비
        const faceW = w + 2;                                // 조각끼리 2px 겹친다
        const x = cr.left - cb.left - host.el.offsetLeft;   // 속지 기준 클립 위치
        const y = cr.top - cb.top - host.el.offsetTop;
        const k = Math.min(STRIP_COUNT - 1, Math.max(0, Math.floor((x + cr.width / 2) / w)));
        const frontLeft = x - k * w;
        const backLeft = faceW - frontLeft - cr.width;      // 뒷면은 좌우가 뒤집혀 있어서
        [[0, frontLeft], [1, backLeft]].forEach(function (pair) {
            const clip = source.cloneNode(true);
            clip.setAttribute("class", "leafClip");
            clip.style.left = pair[1].toFixed(1) + "px";
            clip.style.top = y.toFixed(1) + "px";
            clip.style.width = cr.width.toFixed(1) + "px";
            clip.style.height = cr.height.toFixed(1) + "px";
            host.strips[k].children[pair[0]].appendChild(clip);
        });
    }

    // 책 펼치기의 시계. t 는 renderFlip 에 넣는 시각(ms), v 는 흐르는 속도(0~1).
    const flip = { t: 0, v: 0, last: 0, active: false, released: false, rewinding: false, onRewound: null };

    function flipFrame(now) {
        if (!flip.active) return;
        const dt = flip.last ? Math.min(250, now - flip.last) : 0;
        flip.last = now;
        if (flip.rewinding) {
            flip.t = Math.max(0, flip.t - dt * REWIND_SPEED);
            renderFlip(flip.t);
            if (flip.t <= 0) {
                resetFlip();
                if (flip.onRewound) flip.onRewound();
                return;
            }
        } else {
            // 확인을 기다리는 동안에는 HOLD_MS 에 가까워질수록 느려져 부드럽게 멈추고, 확인이 끝나면 다시 속도가 붙는다
            const target = flip.released ? 1 : clamp01((HOLD_MS - flip.t) / SLOW_MS);
            flip.v = target < flip.v ? target : flip.v + (target - flip.v) * (1 - Math.exp(-dt / 110));
            flip.t = Math.min(END_MS, flip.t + dt * flip.v);
            renderFlip(flip.t);
            if (flip.t >= END_MS) {
                flip.active = false;
                goMain();
                return;
            }
        }
        requestAnimationFrame(flipFrame);
    }

    // 로그인을 누르는 순간 시작한다: 서버 응답을 기다리는 1~2초 동안 화면이 멈춰 보이지 않게 표지부터 들어 올린다
    function beginFlip() {
        if (reduceMotion || !closedBook || flip.active) return;
        scene.classList.add("opening");
        document.documentElement.classList.add("loginOpening");
        // 책 크기에 맞춰 원근을 정한다: 책이 작은 화면에서도 같은 느낌이 나도록 책 너비에 비례
        perspective = Math.round(closedBook.offsetWidth * PERSPECTIVE_RATIO);
        closedBook.style.perspective = perspective + "px";
        leafWidth = leaves.length ? leaves[0].el.offsetWidth : leafWidth;
        // 속지의 '높이'(쌓인 순서)에 따라 조금 커 보이는 것을 상쇄해서 표지 아래에 고르게 깔리게 한다
        leaves.forEach(function (leaf) {
            leaf.el.style.transform = "scale(" + (1 - leaf.z / perspective).toFixed(5) + ")";
            leaf.lastP = -1;
        });
        placeClips();      // renderFlip 이 표지를 움직이기 전, 닫혀 있는 그대로의 클립 자리를 잰다
        placeSpread();
        renderFlip(0);
        flip.t = 0; flip.v = 0; flip.last = 0;
        flip.released = false; flip.rewinding = false; flip.onRewound = null;
        flip.active = true;
        requestAnimationFrame(flipFrame);
    }

    // 암호가 맞았다: 멈춰 있던 자리에서 이어서 끝까지 펼친다
    function releaseFlip() {
        flip.released = true;
    }

    // 암호가 틀렸다: 들렸던 표지를 도로 덮고, 다 덮이면 done 을 부른다
    function rewindFlip(done) {
        if (!flip.active) { done(); return; }
        flip.rewinding = true;
        flip.onRewound = done;
    }

    // 닫힌 책의 처음 모습으로 되돌린다
    function resetFlip() {
        flip.active = false;
        scene.classList.remove("opening");
        document.documentElement.classList.remove("loginOpening");
        closedPage.style.transform = "";
        closedPage.style.removeProperty("--dimF");
        closedPage.style.removeProperty("--dimB");
        closedBook.style.perspective = "";
        if (backBoard) backBoard.style.opacity = "";
        if (openBook) {
            openBook.style.opacity = "";
            openBook.style.zIndex = "";
        }
        if (spreadShadow) {
            spreadShadow.style.opacity = "";
            spreadShadow.style.left = "";
            spreadShadow.style.width = "";
        }
        if (coverCast) coverCast.style.opacity = "0";
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
        usernameInput.readOnly = true;
        passwordInput.readOnly = true;
        hideNote();
        // 서버가 암호를 확인하는 동안(1~2초) 멈춰 보이지 않도록 표지부터 살짝 들어 올린다
        beginFlip();
        try {
            await authRequest("/api/auth/login", { authorId: username, password });
        } catch (error) {
            // 틀렸으면 들렸던 표지를 도로 덮은 뒤 안내 말을 보여 준다
            rewindFlip(function () {
                say(error.message);
                authenticating = false;
                loginButton.disabled = false;
                usernameInput.readOnly = false;
                passwordInput.readOnly = false;
            });
            return;
        }
        // 확인이 끝나면 멈춰 있던 자리에서 이어서 펼친다.
        leaving = true;
        scene.classList.add("opening");
        document.documentElement.classList.add("loginOpening");
        releaseFlip();

        // 애니메이션이 돌지 않는 환경(백그라운드 탭 등)을 위한 안전장치
        setTimeout(goMain, reduceMotion ? 1200 : END_MS + 1500);
    });

    /* ---------- 책이 다 펼쳐지면 main으로 ---------- */
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

    // 뒤로 가기로 돌아오면 책이 이미 넘어간 채로 남아 있으니, 처음 모습으로 다시 불러온다
    window.addEventListener("pageshow", function (event) {
        if (event.persisted) {
            window.location.reload();
        }
    });

    refreshReady();
});
