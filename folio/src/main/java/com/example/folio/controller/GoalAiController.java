package com.example.folio.controller;

import com.example.folio.dto.GoalAiFormRequest;
import com.example.folio.dto.GoalAiFormResponse;
import com.example.folio.dto.GoalAiMoneyRequest;
import com.example.folio.dto.GoalAiMoneyResponse;
import com.example.folio.service.GoalAiException;
import com.example.folio.service.GoalAiService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 목표 화면(goal.js)이 호출하는 AI API.
 *   POST /api/goals/ai-form   { prompt, history, current } → 만들어진 양식      (AI 자율 작성)
 *   POST /api/goals/ai-money  { text, current }            → 바꿀 입력값        (금전 양식 달성 현황)
 *
 * 키는 GEMINI_API_KEY, ANTHROPIC_API_KEY(Claude) 또는 팀 AiService와 같은 OPENAI_API_KEY를 쓴다 (GoalAiClient 참고).
 * 팀의 /api/ai/* 와는 주소가 달라 서로 영향을 주지 않는다.
 */
@RestController
@RequestMapping("/api/goals")
public class GoalAiController {

    private final GoalAiService goalAiService;

    public GoalAiController(GoalAiService goalAiService) {
        this.goalAiService = goalAiService;
    }

    @PostMapping("/ai-form")
    public GoalAiFormResponse form(@RequestBody GoalAiFormRequest request) {
        return goalAiService.buildForm(request);
    }

    @PostMapping("/ai-money")
    public GoalAiMoneyResponse money(@RequestBody GoalAiMoneyRequest request) {
        return goalAiService.readMoneyEdit(request);
    }

    /* 화면이 {"message": "..."}를 읽어 말풍선/안내 말로 보여 준다 */

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }

    @ExceptionHandler(GoalAiException.class)
    public ResponseEntity<Map<String, String>> failed(GoalAiException e) {
        return ResponseEntity.status(e.getStatus()).body(Map.of("message", e.getMessage()));
    }
}
