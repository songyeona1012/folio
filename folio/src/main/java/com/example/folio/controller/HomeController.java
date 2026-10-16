// 달력·일기·관리·목표·나의 정보 화면과 공통 사용자 정보를 준비합니다.
package com.example.folio.controller;

import com.example.folio.repository.AuthorAccountRepository;
import com.example.folio.support.BookmarkLayout;
import java.time.format.DateTimeFormatter;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Controller
public class HomeController {

    // 로그인한 저자의 표시 정보를 세션에서 읽습니다.
    private final AuthorAccountRepository accounts;

    public HomeController(AuthorAccountRepository accounts) {
        this.accounts = accounts;
    }

    private void addUserInfo(Model model) {
        model.addAttribute("loggedIn", false);
        model.addAttribute("userName", "무 명");
        model.addAttribute("userEmail", "작성되지 않음");
        model.addAttribute("profileImage", "/img/default-mascot.png");
        model.addAttribute("lastModified", "XXXX.XX.XX");
        var attributes = RequestContextHolder.getRequestAttributes();
        if (attributes instanceof ServletRequestAttributes web) {
            var session = web.getRequest().getSession(false);
            if (session != null && session.getAttribute("authorId") instanceof Long id) accounts
                .findById(id)
                .ifPresent(a -> {
                    model.addAttribute("loggedIn", true);
                    model.addAttribute("userName", a.displayName);
                    model.addAttribute("userEmail", a.authorId);
                    model.addAttribute(
                        "profileImage",
                        a.avatar != null &&
                            (a.avatar.startsWith("/img/") || a.avatar.startsWith("data:image/"))
                            ? a.avatar
                            : "/img/default-mascot.png"
                    );
                    model.addAttribute(
                        "lastModified",
                        (a.lastModifiedAt == null ? a.createdAt : a.lastModifiedAt).format(
                            DateTimeFormatter.ofPattern("yyyy.MM.dd")
                        )
                    );
                });
        }
    }

    @GetMapping("/")
    public String intro(Model model) {
        addUserInfo(model);
        return "intro";
    }

    @GetMapping("/login")
    public String login(Model model) {
        addUserInfo(model);
        model.addAttribute("pageTitle", "Folio");

        return "login";
    }

    @GetMapping("/main")
    public String main(Model model) {
        addUserInfo(model);

        model.addAttribute("pageTitle", "달력");
        model.addAttribute("navMain", true);

        // 달력 페이지
        // 왼쪽 0개 / 오른쪽 4개
        model.addAttribute("bookmarks", BookmarkLayout.of(0));

        return "main";
    }

    @GetMapping("/setting")
    public String setting(Model model) {
        addUserInfo(model);

        model.addAttribute("pageTitle", "나의 정보");
        model.addAttribute("navSetting", true);

        // 설정 페이지
        // 왼쪽 4개 / 오른쪽 0개
        model.addAttribute("bookmarks", BookmarkLayout.of(4));

        return "setting";
    }

    @GetMapping("/index")
    public String index(Model model) {
        addUserInfo(model);

        model.addAttribute("pageTitle", "관리");
        model.addAttribute("navIndex", true);

        // 관리 페이지
        // 왼쪽 2개 / 오른쪽 2개
        model.addAttribute("bookmarks", BookmarkLayout.of(2));

        return "index";
    }

    @GetMapping("/goal")
    public String goal(Model model) {
        addUserInfo(model);

        model.addAttribute("pageTitle", "목표");
        model.addAttribute("navGoal", true);

        // 목표 페이지
        // 왼쪽 3개 / 오른쪽 1개
        model.addAttribute("bookmarks", BookmarkLayout.of(3));

        return "goal";
    }

    @GetMapping("/dairy")
    public String dairy(Model model) {
        addUserInfo(model);

        model.addAttribute("pageTitle", "일기");
        model.addAttribute("navDairy", true);

        // 일기 페이지
        // 왼쪽 1개 / 오른쪽 3개
        model.addAttribute("bookmarks", BookmarkLayout.of(1));

        return "dairy";
    }

    @GetMapping("/category")
    public String category(Model model) {
        addUserInfo(model);

        model.addAttribute("pageTitle", "관리 - 카테고리 상세 설정 클릭 시");
        model.addAttribute("navIndex", true);

        // 카테고리 페이지도 관리 페이지와 같은 책갈피 배치
        // 왼쪽 2개 / 오른쪽 2개
        model.addAttribute("bookmarks", BookmarkLayout.of(2));

        return "category";
    }
}
