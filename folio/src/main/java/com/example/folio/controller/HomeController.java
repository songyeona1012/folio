package com.example.folio.controller;

import com.example.folio.support.BookmarkLayout;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController {

    // 지금은 로그인 기능이 없어서 하드코딩.
    // 나중에 세션/로그인 기능을 붙이면 실제 사용자 정보로 변경하면 됩니다.
    private void addUserInfo(Model model) {
        model.addAttribute("userEmoji", "🐹");
        model.addAttribute("userName", "송연아");
        model.addAttribute("userEmail", "songyeona1012@gmail.com");
        model.addAttribute("lastLogin", "2026.09.21");
    }

    @GetMapping("/")
    public String intro(Model model) {
        addUserInfo(model);
        return "intro";
    }


    @GetMapping("/login")
    public String login(Model model){
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

        model.addAttribute("pageTitle", "설정");
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

        // 친구 페이지
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
